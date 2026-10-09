"""LikeLink2 brand for Luna reels: sizes, colours, fixed texts, asset paths.

Everything a viewer reads on screen that is not part of an episode script
lives here, so every reel looks like the same series (the way a recognisable
account repeats one tag, one caption style and one end card).
"""
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"

# Output: vertical Reels / TikTok / Shorts.
WIDTH, HEIGHT, FPS = 1080, 1920, 30

# Brand colours (the site's tokens in src/public.css).
ROSE = (210, 47, 93)        # --lx-rose: hook box
VIOLET = (109, 74, 255)     # --lx-violet: series tag
INK = (13, 12, 20)          # --lx-ink
WHITE = (255, 255, 255)
HIGHLIGHT = (255, 216, 77)  # karaoke: the word being said
AMBER = (251, 191, 36)      # #FBBF24: the spoken word in pop captions and hooks
CAPTION_BOX = (13, 12, 20, 178)

FONT_BOLD = ASSETS / "Heebo-ExtraBold.ttf"
FONT_TEXT = ASSETS / "Heebo-Medium.ttf"
LOGO = ASSETS / "logo.png"
LUNA = ASSETS / "luna.png"

SITE_URL = "likelink2.vercel.app"
SERIES_TAG = "לונה · LikeLink2"

# Truth labels (CLAUDE.md: an AI character is always labelled; an affiliate
# post always carries the ad tag). Burned into the frames, not only the caption.
AI_LABEL = "דמות שנוצרה בבינה מלאכותית"
AI_VOICE_LABEL = "דמות וקול שנוצרו בבינה מלאכותית"
VOICE_LABEL = "קול ממוחשב"          # a computer voice over a backdrop with no character
BRAND_TAG = "LikeLink2"             # the tag when Luna is not on screen


def corner_label(character: bool, voiced: bool) -> str | None:
    """The same disclosure, short enough for a corner of the frame."""
    if character:
        return "דמות וקול AI" if voiced else "דמות AI"
    return "קול AI" if voiced else None


def truth_label(character: bool, voiced: bool) -> str | None:
    """What the viewer must be told about how the reel was made."""
    if character:
        return AI_VOICE_LABEL if voiced else AI_LABEL
    return VOICE_LABEL if voiced else None


AD_TAG = "#פרסומת · קישור שותפים"

# The end card asks for the comment keyword the Instagram bot answers
# (scripts/instagram/comment-bot.mjs sends the product link in a private reply).
COMMENT_KEYWORD = "רוצה"
