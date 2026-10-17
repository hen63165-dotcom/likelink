---
name: creative-engine
description: LikeLink2's Creative Engine — every listed product → a 9:16 product video made from its own media (the seller's model photos, the seller's checked clip), with no paid credits (ZERO_PAID_CREDITS), idempotent jobs with retries and a dead letter, QC on the real file, and the live proof on the site. Use when the owner asks for product videos, "סרטונים למוצרים", model/UGC-style videos, a virtual presenter or character (Luna and others), the autonomous marketing engine, "בלי קרדיטים", or why a product has no video.
---

# Creative Engine

Product → video, automatically, with no paid service. Pure core
`src/lib/creative/engine.js`; runner `scripts/creative/run.mjs` +
template `scripts/creative/lookbook.mjs`; schedule
`.github/workflows/creative-engine.yml` (daily 04:20 UTC + Actions →
"Creative engine" → Run workflow). Tests: `tests/creativeEngine.test.mjs`.

## The pipeline

1. **Product import** — the listed catalog (`public/snapshot/kv.json` via
   `listedFromSnapshot`, the same list the site shows; prices/gallery come
   from the daily AliExpress affiliate sync).
2. **Validation** (`validateProduct`) — approved, own https store link, not a
   link shared with another product (`isPromotable`), no stock photo.
3. **Media discovery + rights** (`discoverMedia`):
   - photos: `STORE_GALLERY_PICKS` in `src/lib/looks.js` (checked by eye on the
     contact sheet from `scripts/audit/gallery-sheet.mjs`), only while still in
     the product's own `images`, only when the gallery came from the
     affiliate API (`priceSource: aliexpress_api`), AliExpress CDN only;
   - video: the seller's clip from the `product-video-sources` release, only
     with `SELLER_REVIEWED` and never in `SELLER_SKIP`.
4. **Classification + audience** (`classifyProduct`, `CLASS_DIRECTION`) —
   jewelry/fashion → lookbook; beauty/electronics/home/other → Luna's tip
   engine (`scripts/luna_reels`), because a demo or before/after needs real
   footage of the product doing it.
5. **Character** — the registry (`registerCharacter`): Luna is registered
   (asset `scripts/luna_reels/assets/luna.png`, voice edge-tts Hila, label
   "לונה היא דמות AI מונפשת, לא אדם אמיתי"). A new presenter is refused
   without its own assets, voice, suitability, templates and — when virtual —
   its label. The lookbook has no character: the model in the seller's photos
   is the seller's, never named, never shown as a creator or a buyer.
6. **Script** (`buildScript`) — an opening line from the category's scene
   words, the product's own name, the end card. `SCRIPT_FORBIDDEN` +
   `HOOK_FORBIDDEN`: no number, price, discount, superlative, "diamond",
   "real", bought/tried. Labels on every frame: `#פרסומת · קישור שותפים` and
   whose media ("תמונות וסרטון: המוכר" / "תמונות: המוכר").
7. **Render** (`renderLookbook`) — ivory page, the worn photo framed 1080×1080
   with a slow zoompan (4× oversampled, smooth), the seller clip full screen in
   the premium cut's grade (`premium.mjs`), 0.45 s dissolves, serif opening,
   name at the end, silent AAC 48 kHz (Instagram needs a track; the trending
   sound is added in the app). ~13 s with a clip, ~11 s photos only.
8. **QC** (`qcVerdict`) — H.264 1080×1920 yuv420p, AAC 48 kHz, 8–20 s,
   0.3–40 MB, frames neither black nor blown out, real motion (a still is not
   a video).
9. **Storage** — main → the `reels` release (`<id>-lookbook.mp4/.json/.txt/
   -preview.jpg`); a branch run → `creative-preview` (the site never reads it).
   `run.mjs commit` marks STORED only when the release holds the same bytes.
10. **Product page** — `deploy-frontend.yml` runs after the engine;
    `scripts/reels-feed.mjs` `lookbookReels` puts it in GitHub Pages
    `media/reels/index.json`; the site shows it in "בסרטונים" on `/p/<id>`,
    on `/reels` and (ranked first after a person's footage) on the home page,
    labelled "תמונות וסרטון המוכר · בעריכת LikeLink2" — never AI, UGC or "real".
11. **Measurement** — the reel's shop button carries `camp=<reel id>`
    (`src=likelink_posts`); the next engine run marks a job LIVE only when the
    feed lists it, labelled, and GitHub Pages serves the stored bytes.

## Jobs (ledger: branch `ops/creative`, `jobs.json`; previews in `previews/`)

QUEUED → RENDERED → STORED → LIVE, or FAILED (backoff 1 h, 2 h) → DEAD after 3
attempts; an input problem (no media, 404) is DEAD at once. The idempotency key
is a fingerprint of every input (engine version, photos, clip, title, script):
the same key already STORED/LIVE is reused, a changed product makes a new job
and SUPERSEDES the old one. At most 3 renders per run; `force=1` renders again.

## Zero paid credits

`PROVIDERS` lists every provider with `paid`. ZERO_PAID_CREDITS is the default
and the workflow pins it; a paid or unknown provider is refused before work.
Free here: ffmpeg, the runner's Chromium, GitHub Actions (public repo),
releases, Pages, the store's own media. Not free, never used: OpenAI images,
ElevenLabs, Replicate, Kling, ManyMotions. Never buy credits for the owner.

## When a product has no video

Read the run summary or `jobs.json`: `no_worn_photo_checked` → check the
store gallery by eye (Actions → "Visual audit" writes the contact sheet to
`ops/screenshots/gallery.jpg`) and add the clean photos to
`STORE_GALLERY_PICKS`; `clip_not_checked_by_a_person` → watch the clip and add
it to `SELLER_REVIEWED` only if the listed item is its subject;
`template_runs_in_luna_reels` → Luna's reels cover it.

## Never

Post to a social network from here; present a seller's model, a seller's clip
or Luna as a creator, a buyer or a testimonial; call a lookbook UGC or "real";
use media not from the product's own listing; burn a price into a video; work
around a CAPTCHA; store renders in Supabase Storage (egress quota).
