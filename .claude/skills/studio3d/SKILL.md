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
| animate | each picture → 73 frames (3 s, 24 fps) of real motion at the picture's own 576×1024, LTX-Video 2B 0.9.8 distilled, tiled VAE decode; then every frame enlarged to 1080×1920 with Real-ESRGAN's animation model (`upscale.py`, also used on the lip-synced shots) | `animate.py` | ~35–45 min a shot, side by side |
| pick | per shot, the take that is most the same adult presenter: YuNet finds her face, CLIP scores adult vs child, the same face and hair as the `tag` portrait, the shot asked for, no jewellery (`pick.py`, `pick.jsonl`) | `pick.py` | ~5 min |
| reel | the story with `scripts/luna_reels` (look `story`): Hebrew voice (edge Hila), lip-sync on the shots marked `"talk": true` (SadTalker `full-talk`, ~5–7 min a line), hard cuts with a punch-in, the lo-fi bed + a whoosh on every cut, yellow captions, name tag, the seller's real photo (900 px) labelled "תמונת המוכר", AI + ad labels on every frame | `episode.py`, `depth.py` | ~15–25 min |
| commit | pictures + clips → `scripts/media/studio3d/shots/<name>/` (branch tip); reel → `studio3d-preview` | workflow | — |

Workflow: `.github/workflows/studio3d.yml` ("3D studio"). Until it is on
`main`, a push decides what runs: `scripts/media/studio3d/run.json`
`{"jobs": "<name>.json", "only": "shot,shot", "stage": "all" | "pick" | "animate" | "reel" | "none", "from_run": "<run id>"}` (`pick`: choose again from `from_run`'s takes, then animate and edit, without drawing again; `none`: at rest).
A push waits for the run in progress (never cancels it).

## From the site (the creator's own button)

Studio → "פרסום לרשתות" → under a product: "סרטון אנימציה עם דמות" → she
picks the presenter and presses once. Her product carries `reelRequest`
(`src/lib/growth/animatedReels.js` `makeRequest`; an owner-writable field, no
API change). Every 10 minutes the scheduled "3D studio" run takes the oldest open
request (`queue.mjs next`: approved, promotable, a kind with a story; a new
press is a new reel; a failure retries after 3 h, twice at most), runs
everything below, and records the outcome in the `studio3d` release
(`queue.mjs record`); `deploy-frontend.yml` serves it to her Studio
(`media/studio3d/index.json`, also proxied at `/media/studio3d/*`). About two
hours from the press to the reel on the free runners. A Studio run never
commits pictures to `main`. Tests: `tests/animatedReels.test.mjs`.

## The cloud studio (GPU, minutes)

The owner, 2026-10-28: a Ravit-level reel in minutes, for any product and
character. CPU runners cannot do that (about two hours, SadTalker lips), so
when the repository has the owner's Modal token (secrets `MODAL_TOKEN_ID` and
`MODAL_TOKEN_SECRET`; she creates them herself in modal.com → Settings → API
Tokens and adds them in GitHub, never in a chat), a whole new reel goes to the
`gpu` job instead (`scripts/media/gpu/`):

1. the runner speaks every line once (`python -m luna_reels voices`, Edge
   Hila) into `LUNA_VOICE_CACHE`, so the edit later plays the very same audio;
2. `modal run scripts/media/gpu/studio_gpu.py`: a missing picture (the talking
   object; a presenter without a keyframe) is drawn by the studio's own
   `flux.py --device cuda`; **every scene says its own line** — the talking
   object its hook, the presenter every line of hers — with InfiniteTalk
   (MeiGen-AI, Apache-2.0, on Wan2.1-I2V-14B-480P, Apache-2.0; a step LoRA from
   `cloudplan.LORAS` when one downloads), each scene on its own GPU side by
   side, then Real-ESRGAN to 1080×1920 on the GPU;
3. the reel job edits it as before; `compose.made_talk` plays
   `<scene>.talk.mp4` when it lasts the line (SadTalker is not installed).

Weights live in the Modal volume `likelink-studio-weights` (downloaded once).
A month's GPU time is held to `cloudplan.MONTH_HOURS` (6 h ≈ $24 of H100,
under the Starter plan's $30 free credit; repository variable
`STUDIO_GPU_MONTH_HOURS` lowers it), counted in the Modal dict
`likelink-studio-budget`; past it, or when the cloud job fails, the free
studio below makes the reel. In `run.json`, `"engine": "cpu"` forces the
free path. autoplan `--engine gpu` marks every scene `talk` with its
`talkPrompt` (`TALK_ACTIONS`). Tests: `CloudStudio` in
`scripts/luna_reels/tests/test_engine.py`. The first real run needs the
owner's token; until then nothing of it has run, and nothing says it has.

## The same woman in every reel: her keyframe

Drawing every shot of her anew gives another face, hair and age per shot,
even with three takes to choose from (2026-10-28, v5: one shot with auburn
hair and a narrower face; SFace scored every cartoon face 0.67–0.77 against
her portrait, the child included, so no measure can choose for us). A series
presenter is one picture, checked once:

1. `python scripts/media/studio3d/autoplan.py --masters` → `jobs/cast-masters.json`
   (4 waist-up candidates per presenter, facing the camera, her top only);
   `run.json` → `{"jobs": "cast-masters.json", "stage": "all"}`, push. The
   candidates are committed to `shots/cast-masters/`.
2. Look at them side by side with her portrait: an adult, the cast's hair and
   eyes, plain clothes, hands natural, nothing that could pass for jewellery,
   her face large and sharp. Copy the chosen one to
   `scripts/media/studio3d/cast/<id>/master.png` and write `master.json`:
   `{"face": [x0, y0, x1, y1]}` — her head with its hair, as fractions (the
   name tag's round picture and the talking close-ups are cut from it).
3. From then on autoplan marks every shot of her `"cast": "master.png"`: it is
   never drawn again, `castframes.py` copies the keyframe in, and each shot
   moves from it (her own motion line; the talking lines are lip-synced on
   close-ups cut around her head, each a little closer or wider). Only the
   talking object is drawn per reel. Delete the unchosen candidates before
   a merge.

## One product in, one reel out (the fast path)

`run.json` → `{"product": "<id>", "presenter": "<cast id>", "stage": "all"}`
(or the workflow's `product` + `presenter` inputs once it is on `main`),
commit, push. The plan job runs `autoplan.py`, which writes
`jobs/<product>-<presenter>.json` itself and refuses before anything is drawn:

- the story comes from the product's own kind (`STORIES`: earrings → a bored
  white t-shirt, ring → a bored nail-polish bottle, bracelet / hand chain →
  a bored sweater, necklace → a bored black dress); any other kind is refused,
  never guessed (add a story first);
- seven shots: the talking object (hook), her problem at the mirror, the trick
  (`talk`), a styling tip (`talk`), the seller's real photo on its luxe set,
  her "wow", the call to action (`talk`), plus `tag`, a head-and-shoulders
  portrait that is never animated (`"still": true`) and is cut for the name tag;
- the presenter's look from `scripts/media/ai-image/cast.json` (one product
  per character, as in the stories), said as an adult in her late twenties,
  with one unambiguous hair colour (`HAIR_EXACT`: pilot v4 drew "auburn"
  brown in one shot and orange in another, and a "both hands on her cheeks"
  shot as a little girl);
- the talking shots are close-ups from the chest up (a large face moves its
  lips clearly and sharply); every shot is drawn in three takes (`takes`)
  and `pick.py` keeps the same woman;
- `check_plan`: hook ≤ 8 words, the master's story length (20–45 s by
  `tests/viralMaster.test.mjs`' estimate), every scene a shot, no prompt that
  names jewellery; then the reel engine's truth check.

Locally: `python scripts/media/studio3d/autoplan.py --product p-live-01 --presenter noa`.
Then review by eye (step 4 below) and fix only what is wrong (step 5).

## Make a reel by hand

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
