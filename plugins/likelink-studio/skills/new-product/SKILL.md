---
name: new-product
description: Take one product from the owner's affiliate link all the way to the site and her feeds — check the link, add the product with the store's real title/photos/price, make its studio photo, give it a character and a story, write its posts, run every truth and master check, and ship. Use when the owner pastes an AliExpress (or other affiliate) link and says "תוסיף", "מוצר חדש", "add this product".
---

# A new product, end to end

Repository: https://github.com/hen63165-dotcom/likelink. Read `CLAUDE.md` first. Hebrew, simple, feminine forms.

1. **The link.** Only her own affiliate link (`https://s.click.aliexpress.com/e/…`) or the store's item page. Never open it to "test" it (it would count a click).
2. **Add it.** Actions → "Add trend products" (`.github/workflows/trend-add.yml`, input `TREND_IDS`, ≤ 10): it re-reads the item with the store's affiliate API (`productdetail.get`), refuses ALREADY_ON_SITE / LINK_ALREADY_USED / MISSING_REAL_FIELDS, adds it to `public/snapshot/kv.json` with the store's title, gallery, ILS price and check date, runs the whole test suite and commits. No price, rating or sales number is typed by hand.
3. **Its picture.** Pick the seller's worn photo, else a clean gallery photo; make a studio photo with the `studio-photo` skill (never a white catalog shot on the feed).
4. **Its character.** One product per character (`scripts/media/ai-image/cast.json`, the `cast` skill). Add a new character for it, or move a free one.
5. **Its story.** Write `scripts/luna_reels/episodes/story-<slug>.json` with the `story` skill (claim = the seller's own words, `mustMatch` from the listing).
6. **Its posts.** The Instagram grid (`src/lib/growth/instagramGrid.js`) and the daily drop pick it up on the next deploy; check the captions open with `#פרסומת · קישור שותפים`.
7. **Checks.** `npm test`, `npm run build` (no `is not exported` warnings), `python -m unittest discover -s tests` and `python -m luna_reels check episodes/` in `scripts/luna_reels`, then the `truth-guard` skill.
8. **Ship.** The `ship` skill.

Tell her at the end: where the product is live, the story's file, and today's post for it.
