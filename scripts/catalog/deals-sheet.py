"""One numbered contact sheet per category from scripts/catalog/deals-probe.mjs.

    python3 scripts/catalog/deals-sheet.py <dir>   → <dir>/<category>.jpg
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

TILE, LABEL, COLS, GAP = 360, 28, 4, 8

def main(folder):
    d = Path(folder)
    rows = json.loads((d / "candidates.json").read_text(encoding="utf-8"))
    for cat in dict.fromkeys(r["category"] for r in rows):
        items = [r for r in rows if r["category"] == cat and (d / r["file"]).exists()]
        if not items:
            continue
        lines = (len(items) + COLS - 1) // COLS
        sheet = Image.new("RGB", (COLS * (TILE + GAP) + GAP, lines * (TILE + LABEL + GAP) + GAP), "white")
        draw = ImageDraw.Draw(sheet)
        for i, r in enumerate(items):
            try:
                img = ImageOps.fit(Image.open(d / r["file"]).convert("RGB"), (TILE, TILE))
            except Exception:
                continue
            x, y = GAP + (i % COLS) * (TILE + GAP), GAP + (i // COLS) * (TILE + LABEL + GAP)
            sheet.paste(img, (x, y))
            draw.text((x + 4, y + TILE + 6), f"{r['n']}  ILS {r['price']}  {r['id']}", fill="black")
        sheet.save(d / f"{cat}.jpg", quality=82)
        print(cat, len(items))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "deals-preview")
