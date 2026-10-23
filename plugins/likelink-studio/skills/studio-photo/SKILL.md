---
name: studio-photo
description: Turn a product's white or busy seller photo into a premium studio shot — the product cut out (rembg, free, CPU) on a noir velvet, champagne or sky backdrop with a soft shadow, the product itself untouched, labelled "תמונת המוכר · רקע: LikeLink2" — then wire it into the Instagram posts and the story's product scene. Use for "התמונה לבנה", "לא מקצועי", "תמונה יפה למוצר", "studio photo".
---

# A studio photo for a product

Tool: `scripts/media/luxe-set/luxe.py`. Chosen sets: `public/sets/index.json`.

1. **Source.** The seller's own photo of that product: a frame in `public/looks/<id>.jpg`, a gallery photo from the product's own `images`, or a frame of its seller video. Never a stock photo, never a photo of another product.
2. **Run** (rembg needs Pillow ≥ 12, so give it its own venv):
   ```
   python3 -m venv /tmp/rv && /tmp/rv/bin/pip install "rembg[cpu]"
   /tmp/rv/bin/python scripts/media/luxe-set/luxe.py <photo> /tmp/sets/<id> [--despill]   # --despill: shot on green
   ```
   Output: `<id>-noir.jpg`, `<id>-champagne.jpg`, `<id>-sky.jpg` (1080×1350) and the cut-out.
3. **Look at every one.** Reject a cut that lost part of the product, kept the old background, or changed its colour. Light products → champagne or sky; dark-background sources → noir only (dark remnants show on light backdrops).
4. **Choose.** Copy the chosen file to `public/sets/` and add `{file, style, from}` under its id in `public/sets/index.json`.
5. **Test.** `node --test tests/instagramGrid.test.mjs` (every set is a listed product, its file exists, the label says "רקע: LikeLink2").

The product's pixels are never repainted: no added sparkle, no colour change (despill only removes a green screen's cast).
