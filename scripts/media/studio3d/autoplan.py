#!/usr/bin/env python3
"""LikeLink's 3D studio: a whole shot list from a product and a presenter.

The owner, 2026-10-28: fast, and dependent on nothing — one product in, one
reel out. This writes jobs/<product>-<presenter>.json in the pilot's shape
(a talking-object hook, the presenter's problem, the trick, a styling tip,
the seller's real photo, the look, the call to action), from:

  - the product's own record (the site's catalog copy, else the live
    catalog): its kind decides the story (earrings, ring, bracelet,
    necklace); a kind with no story yet is refused, never guessed;
  - the presenter's fixed look from the cast (scripts/media/ai-image/cast.json).

Every line is generic and claim-free (no material, price, quality or
popularity — the truth check runs on it before any picture is drawn), the
product appears only in its real photo, and no jewellery is ever drawn. The
story is held to the master's length for a story (20–45 s, estimated the way
tests/viralMaster.test.mjs does) before an hour of drawing is spent on it.

  python autoplan.py --product ae-1005006861665924 --presenter shira [--out jobs/]
Prints the shot list's file name.
"""
import argparse, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "scripts" / "luna_reels"))

STYLE = ("3D animated feature film still, stylized cartoon character design with large expressive eyes, "
         "soft cinematic lighting, subsurface scattering, rich warm colors, highly detailed, shallow depth of field, "
         "vertical composition")
LATIN = {"noa": "Noa", "maya": "Maya", "shira": "Shira", "tal": "Tal", "yael": "Yael"}
# The name tag's picture: a head-and-shoulders portrait drawn for it ("tag",
# never animated), so the crop does not depend on where her face fell in a
# full-body shot. The head sits in the upper middle of a 9:16 portrait.
TAG_BOX = [0.14, 0.14, 0.86, 0.545]
# The master's story length, estimated as tests/viralMaster.test.mjs planOf
# does: the voice reads ~2.8 words a second, a breath per line, the end card.
WPS, PAD, END = 2.8, 0.35, 3
STORY_SECONDS = (20, 45)
HOOK_WORDS = 8

# The talking object of each story, drawn alone (no person), and what it says.
MASCOT = ("a cute anthropomorphic {obj} mascot {where}, the {name} itself has two big glossy cartoon eyes "
          "and a small pouting mouth, it looks bored and sad up at the camera, soft morning window light")
STORIES = {
    "earrings": {
        "words": r"עגיל|earring|ear stud|hoop",
        "object": ("plain white cotton t-shirt", "lying flat on a neatly made bed, top-down view", "t-shirt"),
        "hook": ("החולצה הלבנה שלי ממש משועממת.", "החולצה הלבנה שלי... משועממת"),
        "problem": ("כל בוקר אותה חולצה לבנה, ותמיד מרגיש לי שמשהו חסר.", "כל בוקר... ומשהו חסר"),
        "trick": ("טריק קטן: עגילים.", "טריק קטן: עגילים"),
        "hoops": ("טריק קטן: עגילי חישוק.", "טריק קטן: עגילי חישוק"),
        "tip": ("כשהבגד פשוט, דווקא העגילים עושים את כל ההבדל.", "בגד פשוט? העגילים עושים את ההבדל"),
        "product": ("כמו העגילים האלה.", "כמו העגילים האלה"),
        "hoops_product": ("כמו החישוקים האלה.", "כמו החישוקים האלה"),
        "look": ("ופתאום, אותה חולצה פשוטה נראית כמו לוק שלם.", "ופתאום זה לוק"),
        "send": "שלחי לחברה שתמיד בחולצה לבנה",
        "tags": ["#עגילים", "#טיפסטיילינג", "#אופנה"],
    },
    "ring": {
        "words": r"טבעת|\bring\b",
        "object": ("small bottle of pale pink nail polish", "standing on a white vanity table", "bottle"),
        "hook": ("הלק החדש שלי ממש משועמם.", "הלק החדש שלי... משועמם"),
        "problem": ("הציפורניים כבר מוכנות, ועדיין מרגיש לי שמשהו חסר ביד.", "ציפורניים מוכנות... ומשהו חסר"),
        "trick": ("טריק קטן: טבעת אחת.", "טריק קטן: טבעת אחת"),
        "tip": ("כשהציפורניים מוכנות, טבעת אחת משלימה את כל היד.", "טבעת אחת משלימה את היד"),
        "product": ("כמו הטבעת הזאת.", "כמו הטבעת הזאת"),
        "look": ("ופתאום, כל תנועה של היד נראית מוקפדת.", "ופתאום זה מוקפד"),
        "send": "שלחי לחברה שעושה לק כל שבוע",
        "tags": ["#טבעות", "#טיפסטיילינג", "#אופנה"],
    },
    "bracelet": {
        "words": r"צמיד|שרשרת יד|bracelet|bangle",
        "object": ("cozy knitted cream sweater", "folded on a wooden chair", "sweater"),
        "hook": ("הסוודר שלי ממש משועמם.", "הסוודר שלי... משועמם"),
        "problem": ("אני מקפלת את השרוול, ותמיד מרגיש לי שמשהו חסר.", "שרוול מקופל... ומשהו חסר"),
        "trick": ("טריק קטן: צמיד.", "טריק קטן: צמיד"),
        "tip": ("כשהשרוול מקופל, צמיד אחד משלים את כל הלוק.", "שרוול מקופל? צמיד משלים את הלוק"),
        "product": ("כמו הצמיד הזה.", "כמו הצמיד הזה"),
        "look": ("ופתאום, אותו סוודר פשוט נראה כמו לוק שלם.", "ופתאום זה לוק"),
        "send": "שלחי לחברה שתמיד בסוודר",
        "tags": ["#צמידים", "#טיפסטיילינג", "#אופנה"],
    },
    "necklace": {
        "words": r"שרשרת|תליון|necklace|pendant|choker",
        "object": ("plain black dress", "hanging on a wooden hanger on the wardrobe door", "dress"),
        "hook": ("השמלה השחורה שלי ממש משועממת.", "השמלה השחורה שלי... משועממת"),
        "problem": ("שוב אותה שמלה שחורה, ותמיד מרגיש לי שמשהו חסר.", "אותה שמלה... ומשהו חסר"),
        "trick": ("טריק קטן: שרשרת אחת.", "טריק קטן: שרשרת אחת"),
        "tip": ("כשהשמלה פשוטה, שרשרת אחת משלימה את כל הלוק.", "שמלה פשוטה? שרשרת משלימה את הלוק"),
        "product": ("כמו השרשרת הזאת.", "כמו השרשרת הזאת"),
        "look": ("ופתאום, אותה שמלה פשוטה נראית כמו לוק שלם.", "ופתאום זה לוק"),
        "send": "שלחי לחברה שתמיד בשחור",
        "tags": ["#שרשראות", "#טיפסטיילינג", "#אופנה"],
    },
}
CTA = ("רוצה את הקישור? כתבי רוצה בתגובות ואשלח לך אותו.", 'כתבי "רוצה" בתגובות')
# Words that would make the picture model draw jewellery (the product is shown only in its real photo).
DRAWN_JEWELLERY = re.compile(r"jewel|earring|\bring|necklace|bracelet|pendant|bangle|chain|hoop|diamond|gold|silver", re.I)


def kind_of(product: dict) -> str | None:
    """The story's kind from the product's own kind/title (a bracelet before a necklace: "שרשרת יד")."""
    text = " ".join(str(product.get(k) or "") for k in ("kind", "title", "storeTitle", "category")).lower()
    for kind in ("earrings", "bracelet", "ring", "necklace"):
        if re.search(STORIES[kind]["words"], text, re.I):
            return kind
    return None


def presenter_of(cast: dict, pid: str) -> dict:
    member = next((c for c in cast.get("characters", []) if c.get("id") == pid), None)
    if member is None:
        raise SystemExit(f"no presenter '{pid}' in the cast")
    return member


def character(member: dict) -> str:
    name = LATIN.get(member["id"], member["id"].title())
    return (f"{name}, a young woman with {member['hair']} and {member['eyes']}, friendly round face, "
            f"wearing a {member['outfit']}")


def estimate_seconds(episode: dict) -> float:
    """The reel's length as the master estimates it (tests/viralMaster.test.mjs planOf)."""
    lines = [episode["hook"], *episode["lines"]]
    return sum(len(l["say"].split()) / WPS + PAD for l in lines) + END


def plan(product: dict, member: dict) -> dict:
    kind = kind_of(product)
    if kind is None:
        raise SystemExit("no story for this kind of product yet (earrings, ring, bracelet, necklace)")
    st = STORIES[kind]
    hoops = kind == "earrings" and re.search(r"hoop|חישוק", " ".join(str(product.get(k) or "") for k in ("title", "storeTitle")), re.I)
    trick = st["hoops"] if hoops else st["trick"]
    prod_line = st["hoops_product"] if hoops else st["product"]
    obj, where, name = st["object"]
    seed = int(member.get("seed", 93000)) + 100
    shots = [
        {"id": "hook", "seed": seed + 1, "prompt": MASCOT.format(obj=obj, where=where, name=name),
         "motion": f"the {name} mascot slowly blinks its big eyes and sighs, the camera slowly pushes in"},
        {"id": "problem", "character": True, "seed": seed + 2,
         "prompt": "medium shot, she stands at a tall bedroom mirror, head tilted, a puzzled 'something is missing' expression",
         "motion": "she glances from the mirror to the camera with a puzzled look and shrugs her shoulders, her face toward the camera, the camera slowly pushes in"},
        {"id": "hero", "character": True, "talk": True, "seed": seed + 3,
         "prompt": "full body, standing in a bright cozy bedroom, warm smile at the camera, one hand on her hip",
         "motion": "she smiles, tilts her head and gives a small friendly wave, her hair moves softly, the camera slowly pushes in"},
        {"id": "tip", "character": True, "talk": True, "seed": seed + 4,
         "prompt": "medium close-up, she holds up her index finger as if sharing a little secret, a knowing playful smile at the camera, bright cozy bedroom background",
         "motion": "she raises her index finger, nods knowingly and smiles at the camera, her hair moves softly"},
        {"id": "wow", "character": True, "seed": seed + 5,
         "prompt": "medium close-up, she gasps with delight, eyes wide and sparkling, both hands on her cheeks, bright bedroom background",
         "motion": "she gasps with delight, her eyes widen and sparkle, she bounces a little with excitement, her hair moves"},
        {"id": "cta", "character": True, "talk": True, "seed": seed + 6,
         "prompt": "medium shot, she smiles warmly and points her index finger straight at the camera, inviting, bright bedroom background",
         "motion": "she smiles and points at the camera, nodding, her hair moves softly, the camera slowly pushes in"},
        {"id": "tag", "character": True, "still": True, "seed": seed + 7,
         "prompt": "close-up portrait, head and shoulders centered in the frame, she smiles warmly straight at the camera, soft plain blush pink background"},
    ]
    pid = str(product["id"])
    episode = {
        "id": f"studio-{pid}-{member['id']}"[:49].rstrip("-"),
        "goal": "sales",
        "title": trick[1],
        "hook": {"say": st["hook"][0], "caption": st["hook"][1], "scene": "hook"},
        "topics": [kind, "סטיילינג"],
        "lines": [
            {"say": st["problem"][0], "caption": st["problem"][1], "scene": "problem"},
            {"say": trick[0], "caption": trick[1], "scene": "hero"},
            {"say": st["tip"][0], "caption": st["tip"][1], "scene": "tip"},
            {"say": prod_line[0], "caption": prod_line[1]},
            {"say": st["look"][0], "caption": st["look"][1], "scene": "wow"},
            {"say": CTA[0], "caption": CTA[1], "scene": "cta"},
        ],
        "product": {"id": pid, "at": 4},
        "cta": {"title": 'כתבי *"רוצה"* בתגובות', "sub": "ואשלח לך את הקישור"},
        "hashtags": st["tags"],
        "send": st["send"],
        "keyword": "רוצה",
        "presenter": member["id"],
    }
    return {"series": f"{member['id']}-recommends", "product": pid, "style": STYLE, "character": character(member),
            "productSet": "champagne", "shots": shots, "episode": episode,
            "face": {"from": "tag", "box": TAG_BOX}, "auto": {"kind": kind}}


def check_plan(spec: dict) -> None:
    """The rules a shot list must meet before anything is drawn. Raises SystemExit."""
    ep = spec["episode"]
    ids = {s["id"] for s in spec["shots"]}
    if len(ep["hook"]["say"].split()) > HOOK_WORDS:
        raise SystemExit("hook: at most 8 words")
    seconds = estimate_seconds(ep)
    if not STORY_SECONDS[0] <= seconds <= STORY_SECONDS[1]:
        raise SystemExit(f"story: {seconds:.1f} s by the master's estimate (20–45 s)")
    for line in [ep["hook"], *ep["lines"]]:
        if line.get("scene") and line["scene"] not in ids:
            raise SystemExit(f"scene '{line['scene']}' is not a shot")
    for s in spec["shots"]:
        if DRAWN_JEWELLERY.search(f"{s.get('prompt', '')} {s.get('motion', '')}"):
            raise SystemExit(f"shot '{s['id']}' names jewellery: the product is shown only in its real photo")
    if not spec.get("face", {}).get("from") in ids:
        raise SystemExit("face: the name tag's picture must be a shot")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--product", required=True)
    ap.add_argument("--presenter", required=True)
    ap.add_argument("--out", default=str(HERE / "jobs"))
    a = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9-]{2,30}", a.product) or not re.fullmatch(r"[a-z]{2,10}", a.presenter):
        raise SystemExit("product: an id like ae-1005006861665924; presenter: a cast id like shira")
    from luna_reels.script import check_truth, load_catalog, load_cloud_catalog, parse_episode
    catalog = load_catalog(REPO / "public" / "snapshot" / "kv.json")
    if a.product not in catalog:
        catalog = {**load_cloud_catalog(), **catalog}
    if a.product not in catalog:
        raise SystemExit(f"product {a.product} is not listed (approved, with its own store link)")
    cast = json.loads((REPO / "scripts" / "media" / "ai-image" / "cast.json").read_text(encoding="utf-8"))
    spec = plan(catalog[a.product], presenter_of(cast, a.presenter))
    name = f"{a.product}-{a.presenter}"[:40]
    check_plan(spec)
    check_truth(parse_episode({**spec["episode"], "look": "story", "studio": name}), catalog)
    out = Path(a.out) / f"{name}.json"
    out.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
