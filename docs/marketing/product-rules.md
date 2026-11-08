# Which products LikeLink2 posts (the owner's rules)

The owner, 2026-11-08, in her words: *"תקרא ותבצע תמיד מה שכתבתי, שים לך בתזכורת
שאלו הפרמטרים שאני רוצה לפרסום מוצרים"*. This page is that reminder. Every
product chosen for the site, the Telegram channel (@likelink_deals), Instagram
or a carousel follows it, and so does the daily routine.

## What to post

1. **Only what is hot right now.** The items the market wants today:
   - many real recent orders on AliExpress;
   - orders that are growing (`deals:momentum` RISING first);
   - high satisfaction (≥ 95% positive);
   - a Google Trends Israel term that really matches it is a bonus.
   Never post something "just because": *"אם תפרסם סתם לא יקנו וחבל"*.
2. **Every subject, not only jewellery**: kids (squishies, fidget and
   Montessori toys), smart watches, wireless earbuds, men (quality socks, tank
   tops, wallets), clothes, home, kitchen, car, pets, beauty, bags, jewellery.
   The categories live in `TREND_CATEGORIES` (`src/lib/growth/trendBoard.js`)
   with their deal rules in `CATEGORY_DEALS` (`src/lib/growth/deals.js`).
3. **The highest quality and the most trusted.** A clean, beautiful store
   photo, chosen by eye on the probe's sheets (Actions → "Deals probe"). No
   cheap junk, no wholesale lots (`isBulkPack`).
4. **Real sales on the items people want.** A price drop LikeLink2 saw itself
   (our own price history, `pricePrevious`). Never the seller's "before" price,
   which nobody checked.
5. **Presentation at the level of the best deals channels**:
   - an album of the store's own photos (`telegramAlbum`);
   - a few warm, specific lines with one practical tip (`postPitches.js`);
   - the disclosure first.

## What is never posted, even when it is hot

- **Brand copies.** On AliExpress, "Lululemon", "Loewe", "Alo", "Calvin Klein",
  "Pokémon gold cards", "Labubu", "Stitch", "AirPods" or an "iPhone mini" are
  imitations or unlicensed. That is illegal (trade marks), AliExpress bans
  affiliate accounts that promote it, and buyers who get a copy never come
  back. Post the same trend without the logo instead: a no-name smart watch,
  quality socks and tank tops, original squishies (`hasBrandName`).
- **Invented claims.** No "I tried it", no stock or urgency, no rankings,
  ratings or sales counts shown, no prices in hooks. A material is the
  seller's word.
- **Unlisted kinds.** Weapons, vapes, adult items, slimming or health claims
  (`isNotListedKind`).

## The routine

1. Every day: Actions → "Deals probe" (or the daily import) reads every
   category.
2. A person looks at the sheets and picks the best-looking hot items.
3. The owner sees the picks and says "כן".
4. The picks are added through "Add trend products" (`trend-add.yml`).
5. Each picked item gets its lines in `postPitches.js`.
6. The AutoPilot posts them first, as an album.
