# The channel engine: one selection for Telegram and Instagram (21.11.2026)

Code: `src/lib/growth/channelEngine.js` (pure), `api/autopilot.mjs` `runChannelEngine` (the owner's
channel), `scripts/catalog/trend-radar.mjs` (the radar's pool), `scripts/marketing/channel-preview.mjs`
(the real-data preview, nothing sent). Tests: `tests/channelEngine.test.mjs`.

## Root causes found in the real publish log (20–21.11)

| # | What happened | Cause | Fix |
|---|---|---|---|
| 1 | Four posts within one minute (20.11 20:01–20:02) | Nothing enforced a gap between posts | 90 minutes between posts, read from the channel's own history |
| 2 | The same product twice, 79 s apart | Two quick runs each loaded the autopilot config and saved it back; the second erased the first's history | A separate history key (`channel:history:<id>`) written with a compare-and-swap (`updated_at`), and a claim written BEFORE the send: a second run finds the slot taken |
| 3 | Generic products (cable trays, an egg mould), never the radar's findings | The pool was the site's KEEP list | Candidates come only from the latest radar board: its HOT listings per kind (several sellers compared), the site products it measured HOT, its new-product discoveries |
| 4 | One product under two item ids (the USB cable tray) | Identity was the item id only | Identity = item id + the photo's file on the store CDN + the normalised title; one shared key merges them |

## The pipeline

board (latest radar reading) → candidates (with source, dates, market) → gates (each rejection named)
→ Trend Heat + Smart Buy → one row per product → the quality bar → per channel: the next post (a
different trend every post, 14 days without a repeat unless the evidence changed, 90 minutes apart)
→ the store check right before the post (`productdetail.get`) → claim (compare-and-swap) → send → the
claim marked SENT with Telegram's message id, or FAILED (the slot frees again) → the plan kept as proof
(`channel:plan:<id>`).

## Gates (a candidate is out, with this reason)

`no_store_photo`, `no_own_affiliate_link`, `archived_by_radar_quality_check` / `not_on_sale_on_site`,
`brand_name`, `unlisted_kind`, `stale_measurement` (older than 3 days), `not_rising` (under +10% a
week), `too_few_orders` (under 300; a radar discovery under 100), `low_satisfaction` (under 95%),
`photo_shows_another_kind` (the lens model, when it ran), `same_product_as`, and the bar:
`trend_heat_below_bar` (35), `smart_buy_below_bar` (55), `confidence_below_bar` (0.55),
`opportunity_below_bar` (50).

## Trend Heat (0–100)

| Part | Weight | Measure | Missing |
|---|---|---|---|
| Acceleration | 40 | the item's weekly order growth: log(1 + w/100) / log 2, capped at 1 (100%/week = full) | 0, confidence −40 |
| Demand | 15 | the item's 30-day orders: log10(orders) / 4 | 0, −15 |
| Freshness | 10 | age of the measurement: 1 − days/5 | 0, −10 |
| Spread | 15 | the kind's world state: NONE .3, EARLY .6, SPREADING .85, WIDE / VIRAL_NOW 1 | 0, −15 |
| Saturation (inverse) | 20 | the kind's Israel gap: GAP / QUIET 1, ARRIVING .6, ARRIVED .2; for a discovery, 1 − similar listings / 2,000 | 0, −20 |

## Smart Buy (0–100)

| Part | Weight | Measure | Missing |
|---|---|---|---|
| Price | 25 | the store's ILS price, checked within 72 h = 1, older = .4 | 0, −25 |
| Satisfaction | 25 | the store's own positive-feedback share as a bucket only: 97%+ = 1, 95%+ = .8 | 0, −25 |
| Match | 20 | the item is the trend itself 1 (a site row or discovery .9); a dupe of a look: the radar's pick .8, the title names the look .7; +.2 when the photo matched the kind | — |
| Value | 10 | among the HOT sellers of the kind compared: cheapest (within 5%) 1, within 50% .6, else .3 | 0, −10 |
| Link | 10 | her own affiliate link (required by the gates) | — |
| Photo | 10 | the store's photo (required by the gates) | — |

Opportunity = ½ Trend Heat + ½ Smart Buy. Confidence = the average share of weights really measured.
A missing measurement never counts as positive.

## What the store's API does not give (labelled unavailable, never guessed)

Review counts, verified-purchase or photo reviews, complaints, seller history and seller rating,
shipping cost and delivery days, stock. The satisfaction share is the only quality number the
affiliate API returns; it is used as a bucket, never printed as a precise rating.

## Instagram

The same ranking feeds Instagram (`instagramPackage`): a caption (disclosure first, the comment
keyword "אני"), a story and a four-slide carousel plan, `PREPARED`. Nothing is published by the engine;
a post is PUBLISHED only with Instagram's own media id, after the owner's yes.

## Visual matching

On the radar's runner the preview compares each leading candidate's store photo with the kind it
claims (MobileCLIP-S0, the lens model, against `public/lens/labels.json`: the kind among the top 3 =
MATCH). The owner's 111 example screenshots of 19.11 are private and stay out of the public
repository; matching against them needs a private store for their vectors (open item).
