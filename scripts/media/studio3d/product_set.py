#!/usr/bin/env python3
"""LikeLink's 3D studio: the product scene's picture.

The seller's own product photo, cut out and set on a studio backdrop that
matches the series (scripts/media/luxe-set/luxe.py: rembg on the CPU, open
weights; the product's pixels are never repainted). Written as
<pictures>/product.set.jpg; the reel engine shows it full width on the
product line, labelled "תמונת המוכר · רקע: LikeLink2".

  python product_set.py --jobs jobs/pilot-hoops.json --pictures shots/pilot-hoops
The shot list may name the backdrop: "productSet": "champagne" | "noir" | "sky".
Exits 0 without a picture when the product or its photo cannot be read
(the reel then shows the photo as before).
"""
import argparse, io, json, os, sys, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "scripts" / "luna_reels"))
sys.path.insert(0, str(REPO / "scripts" / "media" / "luxe-set"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--pictures", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.jobs, encoding="utf-8"))
    pid = str(((spec.get("episode") or {}).get("product") or {}).get("id") or "")
    style = spec.get("productSet", "champagne")
    if not pid:
        return 0
    from luna_reels.script import load_catalog, load_cloud_catalog
    catalog = load_catalog(REPO / "public" / "snapshot" / "kv.json")
    if pid not in catalog:
        try:
            catalog = {**load_cloud_catalog(), **catalog}
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"set": None, "error": f"catalog: {str(exc)[:120]}"}))
            return 0
    url = str((catalog.get(pid) or {}).get("image") or "")
    if not url.startswith("https://"):
        print(json.dumps({"set": None, "error": "no product photo"}))
        return 0
    from PIL import Image
    import luxe
    with urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=60) as res:
        photo = Image.open(io.BytesIO(res.read())).convert("RGB")
    out = luxe.compose(luxe.cutout(photo), style, size=(1080, 1350))
    dst = Path(a.pictures) / "product.set.jpg"
    out.convert("RGB").save(dst, quality=93)
    print(json.dumps({"set": str(dst), "style": style, "product": pid}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
