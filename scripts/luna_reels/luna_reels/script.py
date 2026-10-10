"""Episode scripts: load, validate, and turn raw ideas into a script.

An episode is a JSON file (episodes/*.json):

    {
      "id": "silver-925",
      "goal": "sales" | "trust" | "studio",
      "hook": "התכשיט שלך באמת כסף?",          # first 2-3 seconds, in the hook box
      "hooks": ["...", "..."],                  # optional alternatives (variants b, c)
      "topics": ["כסף", "תכשיטים"],             # words a trend must match to be used
      "lines": [                                # what Luna says, in order
        {"say": "טקסט להקראה", "caption": "כיתוב על המסך", "t": 2.6},
        ...                                     # caption and t are optional
      ],
      "product": {"id": "p-live-02", "at": 3,   # shown during line #3
                  "claim": "המוכר מציין: כסף סטרלינג 925",
                  "mustMatch": "925"},          # the claim must be in the listing
      "cta": {"title": "כתבי \"רוצה\" בתגובות", "sub": "ואשלח לך את הקישור בפרטי"},
      "hashtags": ["#כסף925", ...]
    }

The same script can be written as plain text, one line per beat, the format
the brief asked for ([timestamp, text to say, caption to show]):

    00:00 | התכשיט שלך באמת כסף? | התכשיט שלך באמת *כסף*?
    00:03 | שלוש בדיקות של עשר שניות | 3 בדיקות · 10 שניות

The first row is the hook. `*word*` in a caption marks a word to colour.

Truth rules (the same ones the site enforces): no invented reviews, ratings,
sales, scarcity or first-person purchase stories ("קניתי", "ניסיתי"), and a
product claim is accepted only when it appears in the product's own listing.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

# Mirrors FORBIDDEN_CLAIMS (src/lib/discovery/distribution.js) and
# HOOK_FORBIDDEN (src/lib/growth/likeloop.js).
FORBIDDEN = re.compile(
    r"(הכי נמכר|רב[ -]?מכר|לקוחות (?:אומרים|ממליצים|מתלהבים)|ביקורות|\d(?:[.,]\d)?\s*כוכבים|חמישה כוכבים|"
    r"אלפי (?:לקוחות|קונים)|מובטח|ויראלי|נגמר|נשארו|רק היום|במלאי|מיליון|ניסיתי|קניתי|הזמנתי|אצלי בבית|"
    r"best ?seller|guaranteed|\d(?:\.\d)?\s*stars?)",
    re.IGNORECASE,
)
# The renderer's font has no emoji; they are dropped from on-screen text.
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")

HOOK_MAX = 48
CAPTION_MAX = 90
GOALS = {"sales", "trust", "studio"}


class ScriptError(ValueError):
    """A script that must not be rendered (missing parts or an untrue claim)."""


@dataclass
class Line:
    say: str
    caption: str
    t: float | None = None


@dataclass
class Episode:
    id: str
    goal: str
    hook: Line
    lines: list[Line]
    product: dict | None = None
    cta: dict = field(default_factory=dict)
    hashtags: list[str] = field(default_factory=list)
    title: str = ""
    hooks: list[Line] = field(default_factory=list)   # the main hook first, then alternatives
    topics: list[str] = field(default_factory=list)
    voice: str = ""      # an Edge voice for this episode (e.g. he-IL-AvriNeural); "" = Luna's
    visual: str = ""     # a default visual for this episode (e.g. "aurora"); "" = Luna
    pexels: str = ""     # a stock-footage search for the backdrop (used with a free PEXELS_API_KEY)

    @property
    def beats(self) -> list[Line]:
        """Hook first, then every line: the order Luna speaks them."""
        return [self.hook, *self.lines]


def screen_text(s: str) -> str:
    """Text as it can be drawn: no emoji, single spaces."""
    return re.sub(r"\s+", " ", EMOJI.sub("", str(s or ""))).strip()


def spoken_text(s: str) -> str:
    """Text as it is read aloud: no emphasis marks, no emoji."""
    return screen_text(str(s or "").replace("*", ""))


def _line(raw, where: str) -> Line:
    if isinstance(raw, str):
        raw = {"say": raw}
    if not isinstance(raw, dict):
        raise ScriptError(f"{where}: expected text or {{say, caption}}")
    say = spoken_text(raw.get("say") or raw.get("caption") or "")
    caption = screen_text(raw.get("caption") or raw.get("say") or "")
    if not say:
        raise ScriptError(f"{where}: empty line")
    if len(spoken_text(caption)) > CAPTION_MAX:
        raise ScriptError(f"{where}: caption longer than {CAPTION_MAX} characters")
    t = raw.get("t")
    return Line(say=say, caption=caption, t=float(t) if t is not None else None)


def check_truth(episode: Episode, catalog: dict[str, dict] | None = None) -> None:
    """Refuse claims the site would refuse. Raises ScriptError."""
    for i, beat in enumerate([*episode.beats, *episode.hooks[1:]]):
        for text in (beat.say, beat.caption):
            m = FORBIDDEN.search(text)
            if m:
                raise ScriptError(f"line {i}: '{m.group(0)}' is a claim LikeLink does not make")
    if episode.product:
        pid = str(episode.product.get("id") or "")
        claim = screen_text(episode.product.get("claim") or "")
        if claim and FORBIDDEN.search(claim):
            raise ScriptError("product claim: forbidden wording")
        if catalog is not None:
            product = catalog.get(pid)
            if not product:
                raise ScriptError(f"product {pid} is not in the public catalog copy")
            must = str(episode.product.get("mustMatch") or "").strip()
            listing = f"{product.get('title', '')} {product.get('description', '')}"
            if claim and not must:
                raise ScriptError("product claim needs mustMatch: the words that prove it from the listing")
            if must and must not in listing:
                raise ScriptError(f"product claim '{claim}' is not backed by the listing (no '{must}')")


def parse_episode(data: dict) -> Episode:
    if not isinstance(data, dict):
        raise ScriptError("episode must be a JSON object")
    eid = str(data.get("id") or "").strip()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,48}", eid):
        raise ScriptError("id: lowercase letters, digits and '-' only")
    goal = str(data.get("goal") or "trust")
    if goal not in GOALS:
        raise ScriptError(f"goal must be one of {sorted(GOALS)}")
    hook = _line(data.get("hook"), "hook")
    if len(spoken_text(hook.caption)) > HOOK_MAX:
        raise ScriptError(f"hook longer than {HOOK_MAX} characters")
    raw_lines = data.get("lines") or []
    if not isinstance(raw_lines, list) or not raw_lines:
        raise ScriptError("lines: at least one line")
    lines = [_line(x, f"line {i + 1}") for i, x in enumerate(raw_lines)]
    product = data.get("product") or None
    if product is not None:
        if not isinstance(product, dict) or not product.get("id"):
            raise ScriptError("product needs an id")
        at = int(product.get("at", len(lines)))
        product = {**product, "at": max(1, min(at, len(lines)))}
    cta = data.get("cta") or {}
    hashtags = [h if h.startswith("#") else f"#{h}" for h in (data.get("hashtags") or []) if isinstance(h, str) and h.strip()]
    hooks = [hook]
    for i, alt in enumerate(data.get("hooks") or []):
        h = _line(alt, f"hooks[{i}]")
        if len(spoken_text(h.caption)) > HOOK_MAX:
            raise ScriptError(f"hooks[{i}] longer than {HOOK_MAX} characters")
        hooks.append(h)
    topics = [screen_text(t) for t in (data.get("topics") or []) if isinstance(t, str) and t.strip()]
    return Episode(id=eid, goal=goal, hook=hook, lines=lines, product=product, cta=cta, hashtags=hashtags[:8],
                   title=screen_text(data.get("title") or hook.say), hooks=hooks, topics=topics,
                   voice=str(data.get("voice") or ""), visual=str(data.get("visual") or ""),
                   pexels=screen_text(data.get("pexels") or ""))


def with_hook(episode: Episode, hook: Line, suffix: str) -> Episode:
    """The same episode with another hook (a variant): id gets the suffix."""
    from dataclasses import replace  # noqa: PLC0415

    if len(spoken_text(hook.caption)) > HOOK_MAX + 16:
        raise ScriptError("variant hook too long")
    return replace(episode, id=f"{episode.id}-{suffix}", hook=hook)


def parse_text_script(text: str, eid: str, goal: str = "trust") -> Episode:
    """`00:00 | text to say | caption to show` rows → an Episode (first row = hook)."""
    rows = []
    for raw in str(text or "").splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        parts = [p.strip() for p in raw.split("|")]
        stamp, say, caption = (parts + ["", "", ""])[:3] if len(parts) >= 2 else ("", parts[0], "")
        m = re.fullmatch(r"(?:(\d+):)?(\d+(?:\.\d+)?)", stamp or "")
        t = (int(m.group(1) or 0) * 60 + float(m.group(2))) if m else None
        rows.append({"say": say, "caption": caption or say, "t": t})
    if len(rows) < 2:
        raise ScriptError("a text script needs a hook row and at least one line")
    return parse_episode({"id": eid, "goal": goal, "hook": rows[0], "lines": rows[1:]})


def load_episode(path: str | Path) -> Episode:
    path = Path(path)
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        return parse_episode(json.loads(text))
    return parse_text_script(text, eid=re.sub(r"[^a-z0-9-]+", "-", path.stem.lower()).strip("-") or "episode")


def load_catalog(snapshot_path: str | Path) -> dict[str, dict]:
    """The products the public site lists, from the catalog copy it ships."""
    doc = json.loads(Path(snapshot_path).read_text(encoding="utf-8"))
    products = (doc.get("keys") or {}).get("marketplace:products") or []
    links = [str(p.get("affiliateUrl") or "") for p in products if isinstance(p, dict)]
    out = {}
    for p in products:
        if not isinstance(p, dict) or p.get("status") != "approved":
            continue
        link = str(p.get("affiliateUrl") or "")
        if not link.startswith("https://") or links.count(link) != 1:
            continue  # a shared link does not lead to this product (catalogIntegrity.js)
        out[str(p.get("id"))] = p
    return out


def ideas_to_episode(idea: str, eid: str, product_id: str | None = None, catalog: dict | None = None) -> Episode:
    """One idea line → a tip episode, without any paid AI.

    Format:  topic question | tip one; tip two; tip three
    e.g.     התכשיט שלך באמת כסף? | חפשי חותמת 925 בפנים; כסף אמיתי לא נמשך למגנט
    The question becomes the hook, each tip a line, and Luna closes the loop.
    For a richer rewrite, paste the idea into Claude with the prompt in
    README.md and save its answer as episodes/<id>.json.
    """
    head, _, tips = str(idea or "").partition("|")
    head = spoken_text(head)
    tip_list = [spoken_text(t) for t in re.split(r"[;\n]", tips) if spoken_text(t)]
    if not head or not tip_list:
        raise ScriptError("idea format: question | tip; tip; tip")
    n = len(tip_list)
    count = {1: "טיפ אחד", 2: "שני טיפים", 3: "שלושה טיפים"}.get(n, f"{n} טיפים")
    lines = [{"say": f"{count} של עשר שניות.", "caption": f"*{count}* · 10 שניות"}]
    for i, tip in enumerate(tip_list, 1):
        lines.append({"say": tip, "caption": f"{i}. {tip}"})
    data = {"id": eid, "goal": "sales" if product_id else "trust", "hook": head, "lines": lines,
            "cta": {"title": "שמרי את הסרטון", "sub": "לפני הקנייה הבאה"}}
    if product_id:
        data["product"] = {"id": product_id, "at": len(lines)}
        data["cta"] = {"title": f"כתבי \"{'רוצה'}\" בתגובות", "sub": "ואשלח לך את הקישור בפרטי"}
    episode = parse_episode(data)
    check_truth(episode, catalog)
    return episode
