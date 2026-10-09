"""Backgrounds and cards: Luna, a talking-character video, product photos.

Visual sources, all free:
  still            Luna's character image (assets/luna.png) with a slow camera move.
  video:PATH|URL   A character clip: a SadTalker render of Luna talking
                   (scripts/media/talking/talk.sh, free on the CPU runner) or a
                   clip you made in Gemini/Veo. A Google Drive "anyone with the
                   link" share link works as a URL.
  Product photos come from the site's own catalog copy (the store's photo of
  the real product), never from stock footage pretending to be the product.
Optional: PEXELS_API_KEY (free, no card) adds a stock clip behind a tip that
names no product; it is labelled as stock in the metadata.
"""
from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFilter, ImageOps

from . import brand, text

UA = {"User-Agent": "LikeLink-LunaReels/1.0 (+https://likelink2.vercel.app)"}
SLOGAN_SUB = "בקליק אחד, אמין ומאובטח"


def cover(img: Image.Image, size=(brand.WIDTH, brand.HEIGHT)) -> Image.Image:
    """Scale and centre-crop to fill the frame."""
    return ImageOps.fit(img.convert("RGB"), size, method=Image.LANCZOS, centering=(0.5, 0.35))


def download(url: str, dst_dir: Path, *, kind: str = "file", max_mb: int = 200) -> Path:
    """Fetch a URL once (cached by hash). Google Drive share links are converted."""
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})", url)
    if m:
        url = f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    dst_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(url.split("?")[0]).suffix[:5] or (".mp4" if kind == "video" else ".jpg")
    dst = dst_dir / f"{hashlib.sha1(url.encode()).hexdigest()[:16]}{suffix}"
    if dst.exists() and dst.stat().st_size > 0:
        return dst
    with requests.get(url, headers=UA, timeout=60, stream=True) as r:
        r.raise_for_status()
        ctype = r.headers.get("content-type", "")
        if kind == "image" and not ctype.startswith("image/"):
            raise ValueError(f"not an image ({ctype})")
        if kind == "video" and "text/html" in ctype:
            raise ValueError("the link opens a web page, not a video (share it as 'anyone with the link')")
        size = 0
        with open(dst.with_suffix(".part"), "wb") as fh:
            for chunk in r.iter_content(1 << 16):
                size += len(chunk)
                if size > max_mb * 1024 * 1024:
                    raise ValueError("file too large")
                fh.write(chunk)
    dst.with_suffix(".part").rename(dst)
    return dst


def luna_frame() -> Image.Image:
    return cover(Image.open(brand.LUNA))


def blurred(img: Image.Image, radius: int = 28, darken: float = 0.55) -> Image.Image:
    bg = cover(img).filter(ImageFilter.GaussianBlur(radius))
    return Image.blend(bg, Image.new("RGB", bg.size, brand.INK), 1 - darken)


def rounded_photo(img: Image.Image, size: int, radius: int = 44, border: int = 10) -> Image.Image:
    """A square product photo with white border and round corners."""
    photo = ImageOps.fit(img.convert("RGB"), (size, size), method=Image.LANCZOS)
    card = Image.new("RGBA", (size + 2 * border, size + 2 * border), (0, 0, 0, 0))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *card.size), radius=radius + border, fill=255)
    card.paste(Image.new("RGBA", card.size, brand.WHITE + (255,)), (0, 0), mask)
    inner = Image.new("L", (size, size), 0)
    ImageDraw.Draw(inner).rounded_rectangle((0, 0, size, size), radius=radius, fill=255)
    card.paste(photo, (border, border), inner)
    return card


def product_card(photo: Image.Image | None, claim: str) -> Image.Image:
    """Product photo + the seller's own claim, as one floating card."""
    parts = []
    if photo is not None:
        parts.append(rounded_photo(photo, 560))
    if claim:
        parts.append(text.pill(claim, 46, brand.WHITE + (255,), fg=brand.INK))
    if not parts:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    w = max(p.width for p in parts)
    h = sum(p.height for p in parts) + 18 * (len(parts) - 1)
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    y = 0
    for p in parts:
        card.alpha_composite(p, ((w - p.width) // 2, y))
        y += p.height + 18
    return text.soft_shadow(card)


def end_card(title: str, sub: str, *, ad: bool, slogan: str | None = None, branded: bool = True,
             logo: str | None = None, backdrop: Image.Image | None = None, truth: str | None = brand.AI_LABEL) -> Image.Image:
    """The closing screen: Luna blurred behind a white card with the call to action.
    Branded (free tier): LikeLink2 logo, the slogan and the site address.
    Unbranded (pro): the call to action only, with the creator's own logo if given."""
    bg = (cover(backdrop) if backdrop is not None else blurred(Image.open(brand.LUNA), radius=22, darken=0.6)).convert("RGBA")
    card_w = brand.WIDTH - 140
    blocks = []
    if slogan:
        blocks.append(text.text_block(slogan, 50, card_w, color=brand.VIOLET, pad=(20, 4)))
    blocks += [text.text_block(title, 96, card_w, color=brand.INK, emphasis=brand.ROSE, pad=(20, 8)),
               text.text_block(sub, 56, card_w, color=brand.INK, bold=False, pad=(20, 4))]
    url = text.pill(brand.SITE_URL, 44, brand.VIOLET + (255,)) if branded else None
    mark = None
    if branded:
        mark = Image.open(brand.LOGO).convert("RGBA").resize((150, 150), Image.LANCZOS)
    elif logo:
        mark = Image.open(logo).convert("RGBA")
        mark.thumbnail((320, 160), Image.LANCZOS)
    inner_h = (mark.height + 30 if mark else 0) + sum(b.height for b in blocks) + (24 + url.height if url else 0)
    card = Image.new("RGBA", (card_w, inner_h + 120), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle((0, 0, card_w, card.height), radius=56, fill=brand.WHITE + (246,))
    y = 60
    if mark:
        card.alpha_composite(mark, ((card_w - mark.width) // 2, y))
        y += mark.height + 30
    for b in blocks:
        card.alpha_composite(b, ((card_w - b.width) // 2, y))
        y += b.height
    if url:
        y += 24
        card.alpha_composite(url, ((card_w - url.width) // 2, y))
    bg.alpha_composite(text.soft_shadow(card), ((brand.WIDTH - card.width - 72) // 2, (brand.HEIGHT - card.height) // 2 - 80))
    lines = ([brand.AD_TAG] if ad else []) + ([truth] if truth else [])
    y = brand.HEIGHT - 230
    for line in lines:
        lab = text.label(line, 34)
        bg.alpha_composite(lab, ((brand.WIDTH - lab.width) // 2, y))
        y += lab.height
    return bg


def outro(frame: Image.Image, *, slogan: str | None, title: str, sub: str, branded: bool,
          logo: str | None, labels: list[str]) -> tuple[Image.Image, int]:
    """The closing screen: the reel's own last frame, blurred and darkened, with
    the wordmark, the slogan and the call to action. Returns (image, y of the
    button centre); the button itself is animated by compose.py."""
    bg = cover(frame).filter(ImageFilter.GaussianBlur(26))
    bg = Image.blend(bg, Image.new("RGB", bg.size, brand.INK), 0.55).convert("RGBA")
    shade = Image.new("L", (1, brand.HEIGHT))
    shade.putdata([int(150 * (i / brand.HEIGHT) ** 1.4) for i in range(brand.HEIGHT)])
    bg.alpha_composite(Image.merge("RGBA", (*[Image.new("L", (1, brand.HEIGHT), 0)] * 3, shade)).resize(bg.size))
    y = 380
    mark = None
    if branded:
        mark = text.wordmark(110)
    elif logo:
        mark = Image.open(logo).convert("RGBA")
        mark.thumbnail((360, 180), Image.LANCZOS)
    if mark:
        bg.alpha_composite(mark, ((brand.WIDTH - mark.width) // 2, y))
        y += mark.height + 70
    blocks = []
    if slogan:
        blocks.append((text.text_block(slogan, 62, brand.WIDTH - 100, color=brand.WHITE, shadow=True, pad=(10, 6)), 6))
        blocks.append((text.text_block(SLOGAN_SUB, 42, brand.WIDTH - 140, color=(200, 196, 224), bold=False, shadow=True, pad=(10, 4)), 56))
    blocks.append((text.text_block(title, 104, brand.WIDTH - 120, color=brand.WHITE, emphasis=brand.AMBER, shadow=True, pad=(10, 6)), 10))
    if sub:
        blocks.append((text.text_block(sub, 52, brand.WIDTH - 160, color=(226, 224, 240), bold=False, shadow=True, pad=(10, 4)), 0))
    for img, gap in blocks:
        bg.alpha_composite(img, ((brand.WIDTH - img.width) // 2, y))
        y += img.height + gap
    button_y = y + 120
    corner(bg, labels)
    return bg, button_y


def corner(img: Image.Image, labels: list[str], top: int = 1420) -> None:
    """Disclosures, small, at the left edge of the safe zone (above Instagram's caption area)."""
    y = top
    for line in labels:
        lab = text.label(line, 28)
        img.alpha_composite(lab, (36, y))
        y += lab.height - 8


def pexels_clip(query: str, dst_dir: Path) -> Path | None:
    """A vertical stock clip from Pexels (free key in PEXELS_API_KEY), or None."""
    key = os.environ.get("PEXELS_API_KEY")
    if not key:
        return None
    r = requests.get("https://api.pexels.com/videos/search", params={"query": query, "orientation": "portrait", "per_page": 5},
                     headers={"Authorization": key, **UA}, timeout=30)
    r.raise_for_status()
    for video in r.json().get("videos", []):
        files = sorted((f for f in video.get("video_files", []) if f.get("height", 0) >= 1280 and f.get("file_type") == "video/mp4"),
                       key=lambda f: f.get("height", 0))
        if files:
            return download(files[0]["link"], dst_dir, kind="video")
    return None


def to_array(img: Image.Image) -> np.ndarray:
    return np.array(img.convert("RGBA") if img.mode != "RGBA" else img)
