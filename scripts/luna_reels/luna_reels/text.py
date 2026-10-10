"""Hebrew on screen, drawn right: every overlay is a transparent PNG frame.

MoviePy's TextClip draws Hebrew left-to-right (the letters come out reversed),
so overlays are drawn here with Pillow instead: words are laid out from the
right edge, each word reordered with python-bidi, and runs of Latin words or
numbers ("LikeLink2", "925") keep their own left-to-right order.

Captions are karaoke style: the whole line is visible, the word being said
sits on a yellow pill, and words marked *like this* in the script are yellow.
"""
from __future__ import annotations

import re
from functools import lru_cache

from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from . import brand

HEBREW = re.compile(r"[֐-׿]")


@lru_cache(maxsize=64)
def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    path = brand.FONT_BOLD if bold else brand.FONT_TEXT
    # BASIC layout + python-bidi gives the same result on every machine
    # (raqm may be missing on a runner); Hebrew needs no glyph shaping.
    return ImageFont.truetype(str(path), size, layout_engine=ImageFont.Layout.BASIC)


def tokens(text: str) -> list[tuple[str, bool]]:
    """Words with their emphasis flag: '*כסף* אמיתי' → [('כסף', True), ('אמיתי', False)]."""
    out, emph = [], False
    for word in str(text or "").split():
        start = word.startswith("*")
        # "*זיוף*?" closes the mark even with punctuation after the star.
        end = bool(re.search(r"\*[^\w*]*$", word)) and (word.count("*") >= 2 or not start)
        clean = word.replace("*", "")
        if start:
            emph = True
        if clean:
            out.append((clean, emph))
        if end:
            emph = False
    return out


def display(word: str) -> str:
    """One word in visual order. Words with Latin letters keep left-to-right;
    everything else (Hebrew, numbers with punctuation like "2.") reads in the
    right-to-left line, so "2." shows its dot on the reading side."""
    return get_display(word) if _is_latin_word(word) else get_display(word, base_dir="R")


def word_width(word: str, f: ImageFont.FreeTypeFont) -> int:
    return int(f.getlength(display(word)))


def wrap(words: list[tuple[str, bool]], f: ImageFont.FreeTypeFont, max_width: int) -> list[list[int]]:
    """Indexes of the words on each line (logical order)."""
    space = f.getlength(" ")
    lines, current, width = [], [], 0.0
    for i, (w, _) in enumerate(words):
        ww = word_width(w, f)
        if current and width + space + ww > max_width:
            lines.append(current)
            current, width = [], 0.0
        width += (space if current else 0) + ww
        current.append(i)
    if current:
        lines.append(current)
    return lines


LATIN = re.compile(r"[A-Za-z]")


def _is_latin(idx: list[int], k: int, words: list[tuple[str, bool]]) -> bool:
    """A word with Latin letters or digits and no Hebrew. A neutral word ("·", "-")
    belongs to a Latin run only between two Latin words; otherwise it reads right-to-left."""
    w = words[idx[k]][0]
    if HEBREW.search(w):
        return False
    if LATIN.search(w):
        return True
    before = k > 0 and _is_latin_word(words[idx[k - 1]][0])
    after = k + 1 < len(idx) and _is_latin_word(words[idx[k + 1]][0])
    return before and after


def _is_latin_word(w: str) -> bool:
    return bool(LATIN.search(w)) and not HEBREW.search(w)


def _visual_order(idx: list[int], words: list[tuple[str, bool]]) -> list[int]:
    """Right-to-left word order, keeping each run of Latin/number words left-to-right."""
    runs, run = [], []
    for k, i in enumerate(idx):
        latin = _is_latin(idx, k, words)
        if latin:
            run.append(i)
            continue
        if run:
            runs.append(run)
            run = []
        runs.append([i])
    if run:
        runs.append(run)
    # Runs go right → left; inside a Latin run, words go left → right.
    ordered = []
    for r in reversed(runs):
        ordered.extend(r)
    return ordered


def _rounded(draw: ImageDraw.ImageDraw, box, radius: int, fill) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def text_block(text: str, size: int, max_width: int, *, color=brand.WHITE, emphasis=brand.HIGHLIGHT,
               active: int | None = None, bold: bool = True, line_gap: float = 0.22,
               box=None, pad=(36, 26), radius: int = 30, shadow: bool = False) -> Image.Image:
    """A centred, wrapped Hebrew block as an RGBA image."""
    f = font(size, bold)
    words = tokens(text)
    lines = wrap(words, f, max_width - 2 * pad[0])
    space = f.getlength(" ")
    ascent, descent = f.getmetrics()
    lh = ascent + descent
    widths = [sum(word_width(words[i][0], f) for i in ln) + space * (len(ln) - 1) for ln in lines]
    inner_w = int(max(widths or [0]))
    inner_h = int(lh * len(lines) + lh * line_gap * (len(lines) - 1))
    w, h = inner_w + 2 * pad[0], inner_h + 2 * pad[1]
    img = Image.new("RGBA", (w + 24, h + 24), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    ox, oy = 12, 12
    if box:
        _rounded(draw, (ox, oy, ox + w, oy + h), min(radius, h // 2, w // 2), box)
    y = oy + pad[1]
    for ln, lw in zip(lines, widths):
        x = ox + pad[0] + (inner_w - lw) / 2
        for i in _visual_order(ln, words):
            word, emph = words[i]
            shown = display(word)
            ww = f.getlength(shown)
            fill = emphasis if emph else color
            if active is not None and i == active:
                _rounded(draw, (x - 10, y - 4, x + ww + 10, y + lh + 2), 16, brand.HIGHLIGHT + (255,))
                fill = brand.INK
            if shadow:
                draw.text((x + 3, y + 3), shown, font=f, fill=(0, 0, 0, 150))
            draw.text((x, y), shown, font=f, fill=fill)
            x += ww + space
        y += lh * (1 + line_gap)
    return img


def caption(text: str, active: int | None = None) -> Image.Image:
    """The running caption: dark translucent box, white words, the said word on yellow."""
    return text_block(text, 70, brand.WIDTH - 120, active=active, box=brand.CAPTION_BOX, pad=(40, 24), radius=34)


def hook(text: str) -> Image.Image:
    """The first-seconds question, big, in the brand's rose box."""
    return text_block(text, 92, brand.WIDTH - 110, box=brand.ROSE + (255,), pad=(46, 32), radius=40)


def pill(text: str, size: int, bg, fg=brand.WHITE) -> Image.Image:
    return text_block(text, size, brand.WIDTH, color=fg, box=bg, pad=(28, 12), radius=999)


def label(text: str, size: int = 30) -> Image.Image:
    """Small always-on text (AI label, ad tag): white with a soft shadow."""
    return text_block(text, size, brand.WIDTH - 80, bold=False, shadow=True, pad=(10, 6))


def word_count(text: str) -> int:
    return len(tokens(text))


def soft_shadow(img: Image.Image, radius: int = 18, alpha: int = 120) -> Image.Image:
    """An image on a blurred drop shadow (for floating cards)."""
    pad = radius * 2
    base = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    mask = img.split()[-1].point(lambda a: alpha if a > 0 else 0)
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 255))
    shadow.putalpha(mask)
    base.alpha_composite(shadow, (pad, pad + 10))
    base = base.filter(ImageFilter.GaussianBlur(radius))
    base.alpha_composite(img, (pad, pad))
    return base


POP_COLORS = [brand.AMBER]  # one accent: amber on white, heavy black outline (the high-contrast Reels look)


def pop(chunk: str, active: int, color_index: int = 0, size: int = 112) -> Image.Image:
    """Word-by-word "pop" captions: a few big words, the spoken one in colour,
    a thick dark outline and a drop shadow so it reads on any background."""
    f = font(size, True)
    words = tokens(chunk)
    lines = wrap(words, f, brand.WIDTH - 220)
    space = f.getlength(" ")
    ascent, descent = f.getmetrics()
    lh = ascent + descent
    stroke = max(7, size // 10)
    widths = [sum(word_width(words[i][0], f) for i in ln) + space * (len(ln) - 1) for ln in lines]
    w = int(max(widths or [0])) + 2 * stroke + 40
    h = int(lh * len(lines) * 1.08) + 2 * stroke + 40
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d, sd = ImageDraw.Draw(img), ImageDraw.Draw(shadow)
    y = 20 + stroke
    for ln, lw in zip(lines, widths):
        x = (w - lw) / 2
        for i in _visual_order(ln, words):
            word, emph = words[i]
            shown = display(word)
            ww = f.getlength(shown)
            fill = POP_COLORS[color_index % len(POP_COLORS)] if (i == active or emph) else brand.WHITE
            sd.text((x + 6, y + 8), shown, font=f, fill=(0, 0, 0, 170), stroke_width=stroke, stroke_fill=(0, 0, 0, 170))
            d.text((x, y), shown, font=f, fill=fill, stroke_width=stroke, stroke_fill=(0, 0, 0))
            x += ww + space
        y += lh * 1.08
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    shadow.alpha_composite(img)
    return shadow


def chunks(caption: str, size: int = 3) -> list[tuple[int, int]]:
    """Caption words grouped for pop captions: (first index, last index) per chunk.
    A chunk never ends on a one-letter word, and short chunks stay short."""
    words = tokens(caption)
    out, i = [], 0
    while i < len(words):
        j = min(len(words), i + size)
        if j < len(words) and len(words[j - 1][0]) <= 1:
            j += 1
        out.append((i, j - 1))
        i = j
    return out


def wordmark(size: int = 44, alpha: int = 235) -> Image.Image:
    """The site's wordmark: "LikeLink" in white and the "2" in the brand rose."""
    f = font(size, True)
    a, b = "LikeLink", "2"
    wa, wb = f.getlength(a), f.getlength(b)
    stroke = max(2, size // 16)
    img = Image.new("RGBA", (int(wa + wb) + 2 * stroke + 16, int(size * 1.5)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text((8, 4), a, font=f, fill=brand.WHITE + (alpha,), stroke_width=stroke, stroke_fill=(0, 0, 0, 120))
    d.text((8 + wa, 4), b, font=f, fill=brand.ROSE + (alpha,), stroke_width=stroke, stroke_fill=(0, 0, 0, 120))
    return img


def button(label: str, size: int = 50) -> Image.Image:
    """A pill button (white, ink text) for the outro call to action."""
    return soft_shadow(text_block(label, size, brand.WIDTH, color=brand.INK, box=brand.WHITE + (255,), pad=(46, 20), radius=999), radius=14, alpha=110)
