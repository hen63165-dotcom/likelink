---
name: viral-marketing
description: LikeLink2's daily marketing routine — today's post for every network (the daily drop), sales copy that stays true, trend-jacking only when a trend really matches, premium reels, Pinterest/IndexNow/size-meter traffic, and how to connect TikTok/Instagram posting. Use when the owner asks for traffic, exposure, a viral post, "today's post", TikTok/Instagram/Reels content, marketing automation, or hooks/captions.
---

# Viral marketing for LikeLink2

The owner wants real traffic, fast, for free, from the cloud. Everything here
runs on GitHub (Actions + Pages) and never needs the Supabase cloud.

## What runs by itself every day

| When | What | Where it lands |
|---|---|---|
| 06:40 Israel (deploy-frontend.yml schedule) | **Daily drop**: today's product + its best video + Google Trends Israel → the post for TikTok, Reels, Shorts, WhatsApp, Telegram, Facebook, a story poll | https://hen63165-dotcom.github.io/likelink/drop/ (+ `today.json`) |
| Every deploy | Pinterest feed (products, reel covers, size meter) | `/likelink/pins.xml` (the owner's Pinterest auto-publish reads it) |
| After a code push | IndexNow → Bing & co. | `scripts/indexnow.mjs` |
| 08:00 / 17:00 UTC | Luna tip reels | `luna-reels` release |
| On demand | Premium reels from seller footage, or from the owner's own clip (`clip` + `clip_product`) | `reels` release, then the site's /reels |

To refresh today's drop now: Actions → "Deploy frontend to GitHub Pages" → Run workflow.

## The copy rules (the tests enforce them — never weaken them)

- `#פרסומת · קישור שותפים` opens every caption. The video carries it in every frame.
- Never: prices in a hook (they go stale), "רק היום", "נשארו אחרונים", "מבצע", "הכי…", invented sales, reviews, followers or "I bought/tried it" (`HOOK_FORBIDDEN` + `DROP_FORBIDDEN`).
- A trend enters a post only when `matchTrends` matches it to the product; otherwise the post doesn't mention trends.
- "צילמנו בעצמנו / מה שרואים זה מה שמקבלים" only for footage a person filmed with the real product (look `real`). A seller video is "צילום המוצר: המוכר" and is never called real or UGC. Luna is always "דמות AI".
- No fake accounts, no bot traffic, no buying followers, no spam in groups. Publishing happens only through the networks' official APIs with the owner's connected account, and counts as PUBLISHED only with the provider's post id.

## Sales formulas that pass the rules (strongest first)

1. Pattern interrupt: "עצרי שנייה. תסתכלי על זה מקרוב".
2. See-before-you-buy (true on the site): "רואים את ה{noun} בווידאו לפני שקונים".
3. Matched trend: "מדברים על {trend} — ומה איתך?".
4. Question / problem from the product's own world (`buildHookSet`).
5. Save for later: "שמרי את זה לפעם הבאה שתחפשי מתנה".
6. Comment-to-DM: "כתבי 'רוצה' בתגובות" (the Instagram bot answers once IG is connected).

New formulas go into `dropHooks` (src/lib/growth/dailyDrop.js) with a test in `tests/dailyDrop.test.mjs`.

## Making a video look like a videographer's reel

- Seller footage → `scripts/media/product-video/premium.mjs`. Variant a is the clean cut with no text on the footage. Exclude any part that could read as a claim (`SHOT_EXCLUDE`).
- The real thing (a hand wearing the ring, dark lace, a white box, slow moves) needs real footage. Give the owner the 5-shot list (hand turning toward the light, close-up, ring on the box, putting it on, the ring alone with the phone circling it). Then run "Product video reels" with `clip` + `clip_product`.

## Connecting the networks (owner steps — never create accounts for her)

- **TikTok**: she opens the account (phone/email). Auto-posting needs a TikTok developer app with the Content Posting API. Until TikTok audits it, posts can only go to her inbox as drafts or as private posts, so say that plainly. Build the adapter only when `TIKTOK_CLIENT_KEY`/secret exist as repository secrets.
- **Instagram**: `IG_USER_ID` + `IG_ACCESS_TOKEN` secrets turn on the comment bot and `op=instagram`.
- **Pinterest**: business account → auto-publish from RSS → `https://hen63165-dotcom.github.io/likelink/pins.xml`.
- **Google**: Search Console → HTML tag. She sends the code (it is not secret) and it goes into `index.html`.

## Honest status lines to keep in replies

- Sign-up and click counting need the Supabase cloud, which is restricted until the billing cycle resets (see CLAUDE.md). Until then, the networks' own stats (TikTok/Instagram/Pinterest/Bing) are the traffic numbers.
- Nothing guarantees virality. Say what was published and where, never a forecast of views.
