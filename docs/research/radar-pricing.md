# The trend radar's pricing (proposal, 2026-11-14)

**Status:** PROPOSED. Nothing is charged and no price is shown on the site until the owner approves these exact numbers and switches billing on in the admin panel ("רדאר הטרנדים: תקופת ניסיון ומסלולים"). Code: `src/lib/growth/radarPlans.js` (`RADAR_PRICES`, `billingOf`).

## What comparable tools charge (entry tier, USD per month)

| Tool | What it does | Monthly | Billed yearly | Trial | Source (checked 2026) |
|---|---|---|---|---|---|
| Exploding Topics Pro | Trend discovery (global, English) | $39 / $99 / $249 | not consistent across sources | 7 days | [trendsmcp.ai](https://www.trendsmcp.ai/blog/exploding-topics-pricing), [tipsonblogging](https://tipsonblogging.com/2025/05/exploding-topics-pricing/) |
| Sell The Trend | Dropshipping product research | $29.97 / $49.97 / $99.97 | $19.97 / $32.97 / $66.64 | 14 days (card required, auto-bills) | [productlair](https://productlair.com/sell-the-trend-pricing), [revenuegeeks](https://revenuegeeks.com/software/sell-the-trend/pricing) |
| Minea | Ad spy + winning products | $49 / $99 / $199 | $34 / $69 / $139 | none | [klipio](https://klipio.io/blog/minea-review), [tipsonblogging](https://tipsonblogging.com/2023/02/minea-pricing/) |
| Kalodata | TikTok Shop analytics | ≈$60 / ≈$120 | ≈30% off | 7 days | [fastmoss blog](https://www.fastmoss.com/blog/kalodata-pricing/), [carouscale](https://www.carouscale.com/en/kalodata-review) |

The entry tier of these global tools costs about $30–60 a month (≈ ₪110–220 at ≈3.65 ₪/$).

## What the radar has that they don't, and what it doesn't have yet

**It has:**
- The Israel gap. Google and YouTube autocomplete in Hebrew show whether Israelis already search for a product, with a confidence level.
- Daily AliExpress order speed per item, with the acceleration shield.
- A public self-grading record.
- A promotion kit for each hot product.

**Not yet:**
- An accuracy record. The first grades come 14 days after the first calls.
- Coverage. The radar watches about 60–75 product kinds, against millions of items in the global tools.
- Any market beyond Israel.

## Proposal

| Tier | Monthly | Yearly (10 months for 12) | What it includes |
|---|---|---|---|
| Radar Basic | ₪39 | ₪390 | the daily board, the Israel gap, the public grading, the magic button's radar line |
| Radar Pro | ₪89 | ₪890 | Basic + Alpha score and confidence, the acceleration shield, the 12-point opportunity check, the promotion kits |

**Why these numbers:**
- **Launch price.** About $11 and $24 a month, well below the global entry tiers. The record is still being built, and the buyer is an Israeli creator or small seller.
- **Fits the site's own plans:** Starter ₪29 and Professional ₪79.
- **Yearly is cheaper:** 10 months for 12 (≈17% off), the same rule the site's plans use.
- **Fees:** PayPal's fee on ₪39 is roughly ₪1.5–2. The radar's running cost today is free runners and free APIs, so most of the price is margin.

**When to revisit:**
- After 30 graded calls, with the accuracy on the page.
- Or when the radar covers a second market.

## Terms built in

- **Trial: on the site, set by the owner (7–60 days, default 14).**
  - No card and no automatic charge when it ends.
  - The visitor subscribes on purpose, through PayPal's own approval page.
- **Monthly:** renews until cancelled.
- **Yearly:** one 12-month term with no automatic renewal. This is the site's rule under Consumer Protection Law 13א (`paypal.js` `planTotalCycles`).
- **Cancellation:** the site's cancellation policy (`src/lib/billing/cancellation.js`).
- **The radar is a separate PayPal subscription**, with its own plans (`marketplace:paypal_plans:radar`) and records (`radar:subscriptions`). The site's Starter and Professional plans are unchanged.

## For the owner to check before switching it on

- **VAT.** If she is an עוסק מורשה, the price shown must include VAT. If she is an עוסק פטור, no VAT is added. The numbers above are the final price the customer pays.
- **PayPal and terms.** The PayPal account is the one already connected to the site, and the terms (`/legal`) cover a radar subscription.
