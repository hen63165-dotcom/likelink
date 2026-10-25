---
name: cast
description: Add or change a story character in LikeLink2's cast — her suit, hair, eyes, outfit and product — draw her face, full-body hero and every scene for free on GitHub's runners, check them by eye, and connect her to her product's story. Use for "דמות חדשה", "תחליף צבע חליפה/שיער", "עוד דמות למוצר", "cast".
---

# The cast

Definition: `scripts/media/ai-image/cast.json` (one character per product). Drawing: Actions → "Story cast" (`.github/workflows/story-cast.yml`, one free runner per character; `scripts/media/ai-image/cast.py` builds the jobs; `generate.py --ref` keeps her face with the open IP-Adapter weights). Pictures land in `scripts/luna_reels/assets/cast/<id>/`.

## Add or change a character
- Fields: `id`, `name` (Hebrew, for the tag "<name> ממליצה"), `product`, `suit`, `hair`, `eyes`, `outfit`, `seed`.
- Outfits follow the owner's references: athleisure sets (hoodie + joggers, a fitted top + striped full-length leggings, half-zip + sweatpants, track jacket + track pants). **Always long pants, the midriff covered. Plain fabric: no logo, no letters, no brand name.**
- **Keep every prompt short.** SD 1.5 reads 77 tokens and silently drops the rest; the first cast lost the end of every prompt (a sports bra without its leggings came out as underwear, no scene action was drawn). `cast.py` puts the shot first, `generate.py` refuses a cast prompt it would cut, and a test caps the words.
- Original animated characters only: never a real person's face, never a reference photo of a real person as an image input, never a studio's or a brand's name in a prompt.
- Push `cast.json` → a character with no face picture yet (`scripts/luna_reels/assets/cast/<id>/face.jpg`) is drawn; one with a face but a missing scene is not. To redraw existing ones: Actions → "Story cast" → Run workflow with `characters` = `all` or ids (`noa,maya`).

## Check every picture by eye before use
A story shows her from the hips up (`compose.upper_body`), so check each scene in that framing too. Reject: shorts or underwear-like bottoms, a bare midriff (also a hoodie riding up at the waist), a suit in another colour than hers, any mark or letters on clothes, drawn jewellery, distorted hands or faces, a face that does not match her headshot. Redraw a character by changing her `seed` or her `outfit` (a loose, closed top keeps the model from opening it). A small print or embroidery mark on an otherwise good picture is removed with `scripts/media/ai-image/clean_marks.py` (inpaints only the mark's pixels; never a flat box patch, which shows) and checked again by eye.

## Connect
Set `"presenter": "<id>"` in her product's `story-*.json`; `python -m unittest discover -s tests` (in `scripts/luna_reels`) checks one product per character and her tag. On screen and in every caption she is labelled as AI.
