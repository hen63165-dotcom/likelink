---
name: cast
description: Add or change a story character in LikeLink2's cast — her suit, hair, eyes, outfit and product — draw her face, full-body hero and every scene for free on GitHub's runners, check them by eye, and connect her to her product's story. Use for "דמות חדשה", "תחליף צבע חליפה/שיער", "עוד דמות למוצר", "cast".
---

# The cast

Definition: `scripts/media/ai-image/cast.json` (one character per product). Drawing: Actions → "Story cast" (`.github/workflows/story-cast.yml`, one free runner per character; `scripts/media/ai-image/cast.py` builds the jobs; `generate.py --ref` keeps her face with the open IP-Adapter weights). Pictures land in `scripts/luna_reels/assets/cast/<id>/`.

## Add or change a character
- Fields: `id`, `name` (Hebrew, for the tag "<name> ממליצה"), `product`, `suit`, `hair`, `eyes`, `outfit`, `seed`.
- Outfits follow the owner's references: athleisure sets (hoodie + joggers, sports bra + full-length leggings, collared half-zip + sweatpants, zip-up jacket + leggings). **Always long pants. Plain fabric: no logo, no letters, no brand name.**
- Original animated characters only: never a real person's face, never a reference photo of a real person as an image input, never a studio's or a brand's name in a prompt.
- Push `cast.json` → the workflow redraws (it cancels a run in progress).

## Check every picture by eye before use
Reject: shorts or underwear-like bottoms, any mark or letters on clothes, drawn jewellery, distorted hands or faces, a face that does not match her headshot. Redraw a character by changing her `seed`.

## Connect
Set `"presenter": "<id>"` in her product's `story-*.json`; `python -m unittest discover -s tests` (in `scripts/luna_reels`) checks one product per character and her tag. On screen and in every caption she is labelled as AI.
