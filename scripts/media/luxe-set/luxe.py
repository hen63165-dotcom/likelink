#!/usr/bin/env python3
"""LikeLink2 "luxe set": the seller's real product photo on a studio backdrop.

White catalog photos and busy seller backgrounds read as cheap in a feed
(the owner, 2026-10-23: "התמונות הלבנות זוועה"). This cuts the product out of
the seller's own photo (rembg, open weights, CPU, no account, no key, no
credits) and sets it on a styled backdrop with a soft contact shadow:

  noir       black velvet under a warm spotlight
  champagne  warm blush gradient with soft out-of-focus light
  sky        the site's light sky blue (src/public.css --lx-sky)

The product's own pixels are never repainted: no added sparkle, no colour
change, nothing drawn on the stones. Only the background is ours, and every
surface that shows a set says so ("תמונת המוכר · רקע: LikeLink2").

  python luxe.py IN.jpg OUT_PREFIX [--styles noir,champagne,sky] [--size 1080x1350]
Writes OUT_PREFIX-<style>.jpg and OUT_PREFIX-cutout.png.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter

STYLES = ("noir", "champagne", "sky")


def cutout(img: Image.Image) -> Image.Image:
    """The product alone (RGBA), trimmed to its edges."""
    from rembg import new_session, remove  # noqa: PLC0415

    out = remove(img.convert("RGB"), session=new_session("isnet-general-use"), post_process_mask=True)
    alpha = out.split()[-1]
    # Drop the faint haze matting leaves around the edges, keep soft anti-aliased borders.
    alpha = alpha.point(lambda a: 0 if a < 18 else min(255, int(a * 1.08)))
    out.putalpha(alpha)
    box = alpha.getbbox()
    return out.crop(box) if box else out


def despill(product: Image.Image) -> Image.Image:
    """Take the green screen's colour cast off a product shot on green (the
    seller's flat lay): green above the red/blue average is the backdrop's
    light, not the metal's, so it is brought back to that average."""
    arr = np.array(product.convert("RGBA")).astype(np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    limit = (r + b) / 2
    arr[..., 1] = np.minimum(g, limit)
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGBA")


def _gradient(size, top, bottom) -> Image.Image:
    w, h = size
    t = np.linspace(0, 1, h)[:, None, None]
    arr = np.array(top, np.float32) * (1 - t) + np.array(bottom, np.float32) * t
    return Image.fromarray(np.repeat(arr, w, axis=1).astype(np.uint8))


def _radial(size, cx, cy, rx, ry, color, strength) -> Image.Image:
    """A soft light pool (RGBA) centred at (cx, cy)."""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    a = np.clip(np.exp(-d * 1.6) * strength, 0, 1)
    layer = np.zeros((h, w, 4), np.float32)
    layer[..., :3] = color
    layer[..., 3] = a * 255
    return Image.fromarray(layer.astype(np.uint8), "RGBA")


def _noise(size, amount, seed=7) -> Image.Image:
    rng = np.random.default_rng(seed)
    n = rng.normal(0, amount, (size[1], size[0])).astype(np.float32)
    img = Image.fromarray(np.clip(128 + n, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6))
    return img


def backdrop(style: str, size) -> Image.Image:
    w, h = size
    if style == "noir":
        bg = _gradient(size, (22, 20, 28), (8, 7, 11)).convert("RGBA")
        bg.alpha_composite(_radial(size, w * 0.5, h * 0.36, w * 0.62, h * 0.42, (255, 236, 214), 0.30))
        grain = _noise(size, 9)
        bg = Image.merge("RGBA", [ImageChops.add(c, grain, scale=1.0, offset=-128) for c in bg.split()[:3]] + [bg.split()[3]])
    elif style == "champagne":
        bg = _gradient(size, (247, 233, 222), (233, 205, 196)).convert("RGBA")
        bg.alpha_composite(_radial(size, w * 0.5, h * 0.34, w * 0.7, h * 0.45, (255, 250, 244), 0.65))
        # Two soft window lights, far out of focus.
        bg.alpha_composite(_radial(size, w * 0.18, h * 0.12, w * 0.32, h * 0.2, (255, 255, 255), 0.45))
        bg.alpha_composite(_radial(size, w * 0.86, h * 0.22, w * 0.26, h * 0.18, (255, 244, 236), 0.35))
    elif style == "sky":
        bg = _gradient(size, (234, 242, 251), (250, 252, 255)).convert("RGBA")
        bg.alpha_composite(_radial(size, w * 0.5, h * 0.4, w * 0.6, h * 0.4, (255, 255, 255), 0.7))
    else:
        raise ValueError(f"style must be one of {STYLES}")
    # Vignette: the eye stays on the product.
    vig = _radial(size, w * 0.5, h * 0.45, w * 0.85, h * 0.75, (0, 0, 0), 1.0)
    edge = Image.new("RGBA", size, (0, 0, 0, 90 if style == "noir" else 34))
    edge.putalpha(ImageChops.invert(vig.split()[3]).point(lambda a: int(a * (0.55 if style == "noir" else 0.25))))
    bg.alpha_composite(edge)
    return bg


def compose(product: Image.Image, style: str, size=(1080, 1350), fill=0.74) -> Image.Image:
    """The cut-out product, centred a little high, on the backdrop, with a contact shadow."""
    w, h = size
    bg = backdrop(style, size)
    p = product.copy()
    scale = min(w * fill / p.width, h * fill / p.height)
    p = p.resize((max(1, int(p.width * scale)), max(1, int(p.height * scale))), Image.LANCZOS)
    x, y = (w - p.width) // 2, int(h * 0.46 - p.height / 2)
    alpha = p.split()[-1]
    shadow = Image.new("RGBA", p.size, (0, 0, 0, 0))
    shadow.putalpha(alpha.point(lambda a: int(a * (0.55 if style == "noir" else 0.32))))
    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    sh.alpha_composite(shadow, (x + int(w * 0.012), y + int(h * 0.018)))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(int(w * 0.018))))
    bg.alpha_composite(p, (x, y))
    return bg.convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("prefix")
    ap.add_argument("--styles", default=",".join(STYLES))
    ap.add_argument("--size", default="1080x1350")
    ap.add_argument("--fill", type=float, default=0.74)
    ap.add_argument("--despill", action="store_true", help="the source was shot on a green backdrop")
    a = ap.parse_args()
    size = tuple(int(v) for v in a.size.split("x"))
    product = cutout(Image.open(a.src))
    if a.despill:
        product = despill(product)
    Path(a.prefix).parent.mkdir(parents=True, exist_ok=True)
    product.save(f"{a.prefix}-cutout.png")
    for style in a.styles.split(","):
        compose(product, style.strip(), size, a.fill).save(f"{a.prefix}-{style.strip()}.jpg", quality=90, optimize=True)
        print(f"{a.prefix}-{style.strip()}.jpg")


if __name__ == "__main__":
    main()
