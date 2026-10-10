"""Ready-to-paste post text for each reel: caption, hashtags, title, alt text.

The caption opens with the ad tag when a product is shown (Israeli
consumer-protection practice and Instagram's branded-content rules: the
disclosure is visible before "more"), always names the AI character, and asks
for the comment keyword the Instagram bot answers.
"""
from __future__ import annotations

import json
from pathlib import Path

from . import brand
from .script import Episode, spoken_text

BASE_TAGS = {
    "sales": ["#מציאותמאלי", "#אליאקספרס", "#תכשיטים", "#קניותחכמות"],
    "trust": ["#טיפים", "#קניותחכמות", "#אליאקספרס", "#לונהממליצה"],
    "studio": ["#יוצרות", "#משפיעניות", "#המלצות", "#סטודיו"],
}


def build(episode: Episode, *, product: dict | None, voice_engine: str, visual: str, seconds: float,
          character: bool = True, real: bool = False) -> dict:
    hook = spoken_text(episode.hook.say)
    body = [spoken_text(line.say) for line in episode.lines[:4]]
    lines = []
    if product:
        lines.append(brand.AD_TAG)
    lines.append(hook)
    lines.append("")
    lines.extend(f"• {b}" for b in body)
    lines.append("")
    if product:
        lines.append(f"👇 כתבי \"{brand.COMMENT_KEYWORD}\" בתגובות ואשלח לך את הקישור בפרטי")
    elif episode.keyword:
        lines.append(f"👇 כתבי \"{episode.keyword}\" בתגובות ואשלח לך את המדריך החינמי בפרטי")
    elif episode.cta.get("title"):
        title, sub = spoken_text(episode.cta["title"]), spoken_text(episode.cta.get("sub", ""))
        icon = "👇" if "ביו" in title else "📌"
        lines.append(f"{icon} {title}" + (f" · {sub}" if sub else ""))
    else:
        lines.append("📌 שמרי לפני הקנייה הבאה ושלחי לחברה שקונה באלי")
    truth = brand.truth_label(character, voice_engine not in ("none", "file"))
    if truth:
        lines.append(f"🎬 {truth}")
    tags = list(dict.fromkeys([*episode.hashtags, *BASE_TAGS.get(episode.goal, [])]))[:8]
    lines.append(" ".join(tags))
    caption = "\n".join(lines)
    return {
        "id": episode.id,
        "goal": episode.goal,
        "title": episode.title or hook,
        "caption": caption,
        "hashtags": tags,
        "altText": f"צילום אמיתי עם כתוביות: {hook}" if real else f"דמות מונפשת בשם לונה מסבירה: {hook}" if character else f"טיפ קניות מונפש: {hook}",
        "commentKeyword": brand.COMMENT_KEYWORD if product else (episode.keyword or None),
        "product": {"id": product["id"], "claim": product.get("claim", "")} if product else None,
        "voice": voice_engine,
        "visual": visual.split(":", 1)[0],
        "seconds": round(seconds, 2),
        # A clip a person filmed is real footage (humanFilmed); everything else is made by the engine.
        "synthetic": not real,
        "humanFilmed": real,
        "labels": ([truth] if truth else []) + ([brand.AD_TAG] if product else []),
        "postingTips": [
            "העלי מהטלפון והוסיפי סאונד טרנדי מספריית אינסטגרם (בעוצמה נמוכה מתחת לקול)",
            "בשעה הראשונה: עני לכל תגובה, ושתפי לסטורי עם סקר",
        ],
    }


def write(meta: dict, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    j = out_dir / f"{meta['id']}.json"
    t = out_dir / f"{meta['id']}.txt"
    j.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    t.write_text(meta["caption"] + "\n", encoding="utf-8")
    return j, t
