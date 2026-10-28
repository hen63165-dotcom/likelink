---
name: studio3d
description: LikeLink2's free 3D studio — a Ravit-style animated reel (@ravitrecommends: an original 3D character, a talking object for the hook, real motion, Hebrew voice and captions, the seller's real product photo) made end to end on free GitHub runners with open models, no account, no key, no credits (FLUX.1 schnell pictures → LTX-Video motion → the reel engine). Use when the owner asks for a reel "like Ravit", an animated/3D/Pixar-like character video, "הנפשה", "אנימציה", a talking object, "בלי קילינג", "בחינם", or a new video for a product in that style.
---

# 3D studio (free)

The owner, 2026-10-27: "build the free version, at Ravit's level, and run it
yourself." One shot list → pictures → motion → reel, on the free runners of
this public repository. No Hugging Face account (every model is an open
copy), no key, no paid credit. Nothing is posted: the reel waits on the
`studio3d-preview` pre-release (the site never reads it) for the owner's yes.

| Stage | What | Where | Time (CPU runner) |
|---|---|---|---|
| draw | one picture per shot, FLUX.1 [schnell] GGUF Q4 (Apache-2.0), 576×1024, 4 steps | `scripts/media/studio3d/flux.py` | ~18 min a shot, all shots side by side |
| animate | each picture → 73 frames (3 s, 24 fps) of real motion at the picture's own 576×1024, LTX-Video 2B 0.9.8 distilled, tiled VAE decode | `animate.py` | ~30–40 min a shot, side by side |
| reel | the story with `scripts/luna_reels` (look `story`): Hebrew voice (edge Hila), lip-sync on the shots marked `"talk": true` (SadTalker `full-talk`, ~5–7 min a line), hard cuts with a punch-in, the lo-fi bed + a whoosh on every cut, yellow captions, name tag, the seller's real photo (900 px) labelled "תמונת המוכר", AI + ad labels on every frame | `episode.py`, `depth.py` | ~15–25 min |
| commit | pictures + clips → `scripts/media/studio3d/shots/<name>/` (branch tip); reel → `studio3d-preview` | workflow | — |

Workflow: `.github/workflows/studio3d.yml` ("3D studio"). Until it is on
`main`, a push decides what runs: `scripts/media/studio3d/run.json`
`{"jobs": "<name>.json", "only": "shot,shot", "stage": "all" | "animate" | "reel", "from_run": "<run id>"}`.
A push waits for the run in progress (never cancels it).

## Make a reel

1. **Pick the product** the way the owner asked (trending, checked, a real
   seller photo). The reel engine reads it from the site's catalog copy, else
   the live catalog (public anon read); the truth check refuses a product it
   cannot find.
2. **Write `scripts/media/studio3d/jobs/<name>.json`** (copy `pilot-hoops.json`):
   - `style` — the series look, no studio or artist names.
   - `character` — the presenter's fixed look: hair, eyes, an outfit with
     long pants, nothing that could pass for the product. **No jewellery is
     ever drawn**: the product appears only in its real photo.
   - `shots[]` — `id`, `seed`, `character: true` when she is in it, `prompt`
     (what the picture shows), `motion` (what moves; keep her face toward
     the camera — "look at the reflection" turned her back), and `talk: true`
     on the shots where she says her line to the camera (her lips move to
     that line's voice). FLUX has no negative prompt: never write "no X"
     (it draws X). Name the gesture positively.
   - `episode` — the reel engine's story (`hook`, `lines` with `scene` = a
     shot id, `product.at` = the line that shows the real photo, `cta`,
     `send`, `hashtags`, `presenter`). Hook ≤ 8 words, a picture change every
     ≤ 4 s, no superlatives/urgency/claims (`FORBIDDEN` in `luna_reels/script.py`).
   - `face` — `{"from": "hero", "box": [x0, y0, x1, y1]}` (fractions), the
     name tag's round picture cut from this series' own drawing.
3. **`run.json`** → `{"jobs": "<name>.json", "only": "", "stage": "all"}`, commit, push.
4. **Review by eye** (pull the branch; pictures and clips are committed):
   - pictures: the same face, hair and outfit in every shot; the gesture
     asked for; no person where an object was asked for;
   - clips: only the first 2.9 s are used (`STUDIO_CLIP_KEEP`) — the model
     drifts after ~3 s; check that part;
   - the reel (download from the release): one frame per ½ s — captions,
     tag, product photo, labels, ending; the voice is there (`volumedetect`).
5. **Fix only what is wrong**: redraw some shots (`"only": "cta,cta-2"`,
   `"stage": "all"`; two takes with different seeds and wordings, then pick),
   or re-edit only (`"stage": "reel"`). A redrawn picture's old clip is
   dropped automatically.
6. **Send the reel to the owner** and post nothing until she says yes.
   Posting goes through the approved channels (Instagram @myalyostyle,
   PUBLISHED only with the provider's id); the comment keyword is "רוצה".

## Truth (never relax)

- The character is an original drawing, labelled AI on every frame ("דמות
  וקול AI") and in the caption; never a real person's face, never UGC.
- The product is shown only in the seller's real photo, labelled "תמונת
  המוכר". No drawn product, no claim the listing does not make.
- `#פרסומת · קישור שותפים` on every frame and first in the caption.
- No promise that a reel will go viral; no invented numbers.

## Licences (checked 2026-10-27)

FLUX.1 [schnell] Apache-2.0 · CLIP-L MIT · T5-XXL Apache-2.0 · FLUX VAE
Apache-2.0 (via an open repackage) · Depth Anything V2 Small Apache-2.0 ·
LTX-Video 2B 0.9.8 distilled: LTXV Open Weights License — free, commercial
use included, for a business under $10M annual revenue (the repository's
licence text is printed in every animate log).

## Known limits

- Free CPU runners: about an hour per reel (shots run in parallel). A GPU
  would take minutes; none is free without an account.
- Clips are 576×1024, upscaled to 1080×1920; motion drifts after ~3 s
  (hence 3 s clips).
- Lip-sync (SadTalker on a drawn face) moves the mouth clearly but less
  than paid talking-head tools; the face is rendered at 256 px.
- Check the mouths by eye: crop the face at 5 fps through the line.
