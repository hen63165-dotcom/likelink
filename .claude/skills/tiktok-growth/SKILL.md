---
name: tiktok-growth
description: LikeLink2's TikTok engine — today's two TikToks (plus a bonus the owner films), the trend formats (video reveal, photo-mode checklist carousel, "yes or no?", Luna's tip, green-screen script), rendered slides, captions and in-app steps at /likelink/tiktok/, the learning loop from the owner's logged results, the account setup, and how TikTok connects to the site. Use when the owner asks about TikTok, טיקטוק, a TikTok account, TikTok posts/ideas/trends, "what do I post today", growing on TikTok, or the TikTok results.
---

# TikTok for LikeLink2

The owner wants the site to grow on TikTok, for free, without spending her day
on it. The engine plans and prepares everything every morning; she posts in a
minute from her phone and logs the numbers two days later; the plan learns
from them. Everything runs on GitHub (Actions + Pages), never on the Supabase
cloud.

## What runs by itself

| When | What | Where |
|---|---|---|
| Every morning (06:40 Israel) and every deploy | `scripts/marketing/tiktok-kit.mjs`: today's plan (`tiktokDay` in `src/lib/growth/tiktok.js`) → 2 posts + a bonus, the photo-mode slides rendered as 1080×1920 PNGs (the runner's Chrome), the profile photo | https://hen63165-dotcom.github.io/likelink/tiktok/ + `today.json` |
| Same run | `tiktokWeek`: the next 7 days' ready-made posts (from tomorrow, at 12:45 / 20:30 Israel time, slides rendered too), for scheduling in TikTok Studio (desktop, up to 10 days ahead) in one sitting when the account is offered the "schedule" option; otherwise she posts from the phone at the listed times | the "השבוע מראש" section + `week.json` |
| When the owner logs a result | Actions → "TikTok results" (`tiktok-results.yml`) → `marketing/tiktok-results.json` on the `ops/tiktok` branch (a refused push re-reads the branch and re-applies, 5 tries; an unreadable file stops the run) → deploy-frontend rebuilds the page | the "מה למדנו" table + tomorrow's formats |

The daily drop (`/drop/`) links to it; the TikTok page links back.

## The formats (`TIKTOK_FORMATS`)

| id | What | Made from |
|---|---|---|
| `reveal` | the product video + an on-screen line + a trending sound from TikTok's library | the best real footage: a person's own clip > the seller's video in LikeLink2's cut (never a clip in `SELLER_SKIP`) |
| `checklist` | photo-mode carousel: a title slide, 3 checks from Luna's guide that fit the product, "הקישור לחנות בביו" | the product's clean image (`cleanImage`) + `GUIDE.checks` (a check about sales/discounts stays in the guide) |
| `would_you` | the product video with "כן או לא?" | same as reveal |
| `luna_tip` | Luna's tip reel, opening with the tip's own topic | the `luna-reels` feed; the post turns on TikTok's AI label |
| `green_screen` | **bonus, the owner films**: she talks to the camera over the product page, with a script | the product + 2 guide checks |

Two daily slots come from `AUTO_FORMATS` (everything ready-made); the owner's
format is a bonus card, never a slot. Each format walks its own product order
day by day, so a video does not come back the next day. A Google Trends Israel
term enters a post only when `matchTrends` really matches it to the product.

## How it learns (`learnTikTok`, `selectFormats`)

- Results are the owner's own TikTok analytics (views, likes, comments, shares,
  saves) per post id (`tt-<yyyymmdd>-<slot>-<format>`; the id carries the
  format, so nothing else needs storing). A post logged again replaces its
  numbers.
- A format needs `MIN_POSTS` (3) logged posts before it is compared:
  below that it is INSUFFICIENT_EVIDENCE and the plan keeps exploring it.
- A leader (best median views, engagement as the tie-break) is named only when
  two formats are measured; it then takes one slot every day and the other
  slot keeps exploring. Always said as "a correlation over your posts, not a
  promise".
- Click and landing numbers from `utm_source=tiktok` join this when the cloud
  is back (the click log lives in Supabase); until then TikTok's own numbers
  are the evidence.

## The copy rules (`tiktokSafe` = `HOOK_FORBIDDEN` + `DROP_FORBIDDEN` + `TIKTOK_FORBIDDEN`)

- `#פרסומת · קישור שותפים` opens every caption and is on every rendered slide.
  Every post's steps include TikTok's own switch: "גילוי תוכן הפוסט" → "תוכן ממותג".
- Luna is AI: her posts say "לונה היא דמות AI" and turn on "תוכן שנוצר ב-AI".
- A seller video is "צילום המוצר: המוכר"; only footage a person filmed is "צילום אמיתי".
- Never: prices (they go stale), "רק היום", "נשארו אחרונים", "מבצע", "הכי…",
  "ויראלי", "קניתי/ניסיתי/הזמנתי", invented reviews/sales/followers, or bait
  ("לייק אם…", "תייגו 3 חברים"). A hook never promises what the video doesn't
  show (no "what's in the box" over a clip with no box).
- No buying followers, views or comments; no fake accounts; no posting in
  other people's comments or groups.

## The account (the owner opens it — never Claude)

TikTok asks for her phone or e-mail and may show a CAPTCHA: only she can open
it. The page's "פתיחת החשבון" block gives her: username ideas, the name, the
bio (`accountKit`, ≤80 chars, with the disclosure), the bio link
(`bioLink()` = `/reels?utm_source=tiktok&utm_medium=bio`: the site's video
feed, every video with its product and store link), and a rendered profile
photo. A free business account adds analytics, when TikTok lets her switch
without company documents (see below).

When she sends the handle: put it in `src/lib/growth/socialAccounts.js`
(`SOCIAL_ACCOUNTS.tiktok.handle`) **and** add the same URL to the
Organization `sameAs` in `index.html` (a test keeps them equal). The footer
then shows "עקבו אחרינו". Nothing links to an account that doesn't exist.

**Done 2026-10-16: `@likelink`** (https://www.tiktok.com/@likelink), with the
bio. It stays a personal account: the business switch (app and Business
Suite) asked for a business licence number and company documents, which she
doesn't have yet. Never suggest filling those with anything but real
documents; a personal account can post, see analytics (Creator tools) and use
TikTok Studio. Once the account exists the page shows "החשבון: @likelink"
(name, bio, photo, and the bio link for when TikTok offers the website field)
instead of the opening steps.

## Posting by API later (not built — say so plainly)

TikTok's Content Posting API needs a TikTok developer app, her OAuth consent
and TikTok's review; until the app is audited, direct posts are private-only
and "upload" sends a draft to her inbox. Trending sounds can only be added in
the app anyway. Build the adapter only when she has the app and asks: client
key/secret as repository secrets, drafts to her inbox (`video.upload`), a post
counted as published only with TikTok's `publish_id` and her own post in the
app.

## Honest status lines

- Nothing guarantees views or virality: say what is ready and what she posted.
- Sign-up and click counting on the site need the Supabase cloud, which is
  restricted (402) until its quota resets or the plan changes (CLAUDE.md).
- Tests: `tests/tiktok.test.mjs`. New formats go into `TIKTOK_FORMATS` with
  their hooks in `hookFor` and a test.
