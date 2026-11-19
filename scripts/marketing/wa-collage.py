"""One square collage (1080×1080) from a product's store photos, for the WhatsApp group kit.

    python3 scripts/marketing/wa-collage.py <out.jpg> <photo1> [photo2] [photo3] [photo4]

1 photo: fitted; 2: side by side; 3: one tall on the right (RTL) and two stacked; 4: a 2×2 grid.
White gaps, no text drawn: the post's text carries the disclosure. Photos are the seller's own.
"""
import sys

from PIL import Image, ImageOps

S, G = 1080, 8


def fit(path, w, h):
    return ImageOps.fit(Image.open(path).convert("RGB"), (w, h), centering=(0.5, 0.45))


def main(out, photos):
    photos = [p for p in photos if p][:4]
    if not photos:
        raise SystemExit("no photos")
    sheet = Image.new("RGB", (S, S), "white")
    half = (S - G) // 2
    n = len(photos)
    if n == 1:
        sheet.paste(fit(photos[0], S, S), (0, 0))
    elif n == 2:
        sheet.paste(fit(photos[0], half, S), (S - half, 0))
        sheet.paste(fit(photos[1], half, S), (0, 0))
    elif n == 3:
        sheet.paste(fit(photos[0], half, S), (S - half, 0))
        sheet.paste(fit(photos[1], half, half), (0, 0))
        sheet.paste(fit(photos[2], half, half), (0, S - half))
    else:
        for i, p in enumerate(photos):
            x = S - half if i % 2 == 0 else 0
            y = 0 if i < 2 else S - half
            sheet.paste(fit(p, half, half), (x, y))
    sheet.save(out, "JPEG", quality=86, optimize=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
