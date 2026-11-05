---
name: motion-ad
description: Make a LikeLink2 motion ad, an animated reel rendered from code (the owner's reference, 2026-11-05: an ad built with Claude, with a sky, a window card riding a drawn line, a phone and kinetic words). It uses one real product from the seller's own photo, the real page on the site and the original store, Hebrew words springing in on the beat, a synthesized score and SFX mastered to -14 LUFS, and a 9:16 MP4 that needs no paid tool. Use for "סרטון אנימציה", "כמו הסרטון שקלוד ערך", "motion", "פרסומת מקוד", or a new ad for a product, a season (11.11, Black Friday) or the site itself.
---

# A motion ad

Engine: the `motion-reel` plugin, whose skill is the pipeline. The first film is `motion-likelink/`:
- `film.js` holds the scenes.
- `docs/shotlist.md` holds the plan.
- `docs/critique.md` holds the review rounds.

Start a new ad with the plugin's `scaffold.mjs <slug>`. Then copy what you need from `motion-likelink/film.js`:
- `wordsRTL`: Hebrew words right to left, each springing in on its beat.
- `sky`
- `phone`: a drawn frame around a real screen.
- `windowCard`
- `drawPath`
- `logoMark` and `wordmark`: the site's own logo, from the same SVG path as `src/components/discover/PublicShell.jsx`.
- the whip into the end card.

## Truth on screen
- **One real product all the way through.** Use the seller's photo (`public/sets/`, `public/looks/`, or the `ops/photos` branch made by `scripts/catalog/photos.mjs`) and a real screenshot of its page on the site. Never paint a screen that doesn't exist.
- **Labels:**
  - "#פרסומת · קישור שותפים" whenever a product is on screen;
  - "מתוך סרטון המוכר" or "תמונת המוכר" on the seller's picture;
  - "קישור שותפים" on the store card.
- **No price, no discount badge.** Paint it out of a screenshot, since a store price changes. No counts, ratings, urgency or income.
- **Brand:** no other company's brand or look. Only the reference's motion ideas are borrowed.
- **Type:** Heebo has no arrows (← →). Check any symbol with fontTools before you use it.

## Make it
```
SK=<the motion-reel skill folder>
node $SK/scripts/scaffold.mjs <slug> --title "..." --duration 15 --formats 9x16
cp scripts/luna_reels/assets/Heebo-ExtraBold.ttf <slug>/fonts/display.ttf
cp scripts/luna_reels/assets/Heebo-Medium.ttf <slug>/fonts/ui.ttf
uv run $SK/scripts/beats.py <slug> --synth --flavor house --bpm 120 --mode major --tonic A --duration 15
node $SK/scripts/render.mjs --film <slug> --contact --format 9x16        # look at it; 3 rounds minimum
node $SK/scripts/sfx.mjs <slug> && node $SK/scripts/mix.mjs <slug> --no-mux
node $SK/scripts/render.mjs --film <slug> --hits && uv run $SK/scripts/sync.py <slug>
node $SK/scripts/render.mjs --film <slug> --format 9x16 --video-only
node $SK/scripts/sfx.mjs <slug> && node $SK/scripts/mix.mjs <slug>       # -> out/<slug>/final.mp4
```
It renders in about 2.5 minutes on a CPU. Pull frames from `final.mp4` with ffmpeg and look at them before you send it.

## Hand it over
Send her the MP4 with a caption that opens with "#פרסומת · קישור שותפים" when a product shows. The video plays as a Reel; on Instagram, a site ad goes on the Wednesday slot.

It goes up only on the date she approved, and "פורסם" is said only with the permalink read back.

The audio (`<slug>/audio/*.wav`) is not committed. The same `beats.py` command makes it again.
