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
# Story look: the series' one caption style (yellow words on a dark box, like
# the strong creator stories the owner showed) and its name tag.
STORY_YELLOW = (255, 224, 64)
STORY_BOX = (22, 20, 28, 200)
TAG_PLATE = (109, 74, 255)       # the name tag's plate: brand violet
TAG_EDGE = (255, 128, 178)       # its border: soft pink
NAME_TAG = "לונה ממליצה"

FONT_BOLD = ASSETS / "Heebo-ExtraBold.ttf"
FONT_TEXT = ASSETS / "Heebo-Medium.ttf"
LUNA = ASSETS / "luna.png"
LUNA_FACE = ASSETS / "luna-face.jpg"
SCENES = ASSETS / "scenes"


# The story cast (scripts/media/ai-image/cast.json): one character per product,
# each with her own name tag and her own scenes in assets/cast/<id>/.
CAST_FILE = Path(__file__).resolve().parents[2] / "media" / "ai-image" / "cast.json"
CAST_DIR = ASSETS / "cast"


def cast() -> dict:
    import json  # noqa: PLC0415
    return json.loads(CAST_FILE.read_text(encoding="utf-8")) if CAST_FILE.exists() else {"characters": []}


def cast_member(presenter: str) -> dict | None:
    return next((c for c in cast().get("characters", []) if c.get("id") == presenter), None)


def tag_text(presenter: str = "") -> str:
    """"נועה ממליצה" for a cast member; Luna's own tag otherwise."""
    member = cast_member(presenter) if presenter else None
    return f"{member['name']} ממליצה" if member else NAME_TAG


def face_path(presenter: str = "", studio: str = "") -> Path | None:
    """The name tag's round picture: the studio's own face (the same drawing as
    the reel), else the cast member's, else Luna's."""
    own = STUDIO_DIR / studio / "face.jpg" if studio else None
    if own is not None and own.exists():
        return own
    face = CAST_DIR / presenter / "face.jpg" if presenter else None
    if face is not None and face.exists():
        return face
    return LUNA_FACE if LUNA_FACE.exists() else None


# The 3D studio's pictures (scripts/media/studio3d): one folder per shot list,
# drawn whole for a 9:16 frame (never cropped to the hips like the cast drawings).
STUDIO_DIR = Path(__file__).resolve().parents[2] / "media" / "studio3d" / "shots"


def studio_scene(name: str, studio: str = "", ext: str = ".png") -> Path | None:
    """A studio shot's picture (.png), its animated clip (.mp4) or its depth map (.depth.png)."""
    path = STUDIO_DIR / studio / f"{name}{ext}" if studio and name else None
    return path if path is not None and path.exists() else None


def scene_path(name: str, presenter: str = "") -> Path | None:
    """A scene picture: the presenter's own (assets/cast/<id>/), else a shared one (assets/scenes/), or None."""
    folders = ([CAST_DIR / presenter] if presenter else []) + [SCENES]
    for folder in folders:
        for ext in (".jpg", ".png"):
            path = folder / f"{name}{ext}"
            if path.exists():
                return path
    return None

SITE_URL = "likelink2.vercel.app"

# Truth labels (CLAUDE.md: an AI character is always labelled; an affiliate
# post always carries the ad tag). Burned into the frames, not only the caption.
AI_LABEL = "דמות שנוצרה בבינה מלאכותית"
AI_VOICE_LABEL = "דמות וקול שנוצרו בבינה מלאכותית"
VOICE_LABEL = "קול ממוחשב"          # a computer voice over a backdrop with no character


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
