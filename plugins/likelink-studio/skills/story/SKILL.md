---
name: story
description: Write, check and render a LikeLink2 story reel in the creator-story look (the owner's example, @ravitrecommends) — one character from the cast per product, a scene per line, yellow captions on a dark box, the "<name> ממליצה" name tag, the product's real photo full screen, a send line and one comment keyword — then hand the owner the video, caption and link-sticker steps. Use for "סטורי", "רילס כמו של רווית", "story for this product", or a new episode.
---

# A story reel

Engine: `scripts/luna_reels` (Python, free). Read its `README.md` section "סטורי של לונה" and `CLAUDE.md` ("Luna's stories", "The master").

## Write the episode — `scripts/luna_reels/episodes/story-<slug>.json`
- `"look": "story"`, `"presenter": "<cast id>"` (her product only: `scripts/media/ai-image/cast.json`), `"goal": "sales"`.
- `hook`: a question or a familiar moment, ≤ 8 words, with a `scene`.
- 5–7 `lines`, each ≤ 9 spoken words, each with a `scene` from the cast's scenes (`worried thinking explain phone happy mirror gift wave`), so the picture changes every few seconds.
- Teach first (a real, general tip), then the product: a line "X הזה, למשל." (the product line gets `scene: "product"` automatically) and the seller's claim line starting `המוכר מציין:` with `"scene": "product"`.
- `product`: `{id, at, claim, mustMatch}` — `mustMatch` must be words in that product's own title/description.
- `send`: "שלחי לחברה ש…" (a reason to send it).
- `cta` is an object: `{"title": "כתבי *\"רוצה\"* בתגובות", "sub": "ואשלח לך את הקישור ל…"}` (a string breaks the render). A product story's keyword is "רוצה" (the comment bot sends that product's link); a tip without a product may set `"keyword": "מדריך"`.
- Forbidden: scarcity, sales counts, ratings, "קניתי/הזמנתי", invented prices, other brands' names.

## Check
```
(cd scripts/luna_reels && python -m luna_reels check episodes/ && python -m unittest discover -s tests)
node --test tests/viralMaster.test.mjs tests/lunaReelsEpisodes.test.mjs
```
The master test (`masterCheck`) must pass all twelve rules: hook, length 20–45 s, a new picture every ≤ 4 s, captions, one character (`presenter`), the product after a tip (`product.at` ≥ 2), send line, keyword, disclosure, AI label, true only, original.

## Render
Actions → "Luna reels" → `episode` = the id (`variants` 3: hooks a/b/c). Output: the `luna-reels` release (mp4 + caption .txt + preview). Cut a few frames with ffmpeg and look at them before telling her it is ready.

## Hand it over
The Instagram page (`/likelink/instagram/`, "הסטוריז") lists each story with the video, the caption and the product link for the story's link sticker. Steps for her: post as a Reel → Instagram's AI label on → share to story → link sticker "לפרטים על המוצר".
