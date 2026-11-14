# The trend radar: research, cross-check, design and verification

Written 2026-11-14 for the owner's directives ("רדאר טרנדים"; "FINAL MASTER DIRECTIVE"), in reply to
ChatGPT's ViralHyp spec. Live page: `https://likelink2.vercel.app/radar`. Code:
`src/lib/growth/trendRadar.js` (stages, calls), `israelGap.js` (Israel), `radarOpportunity.js` (hot
now, opportunity, action), `radarDiscovery.js` (discovery), `radarBoard.js` (browser + magic button),
`scripts/catalog/trend-radar.mjs` (daily collector), `.github/workflows/trend-radar.yml`.
Tests: `tests/trendRadar.test.mjs`, `israelGap.test.mjs`, `radarOpportunity.test.mjs`,
`trendRadarRun.test.mjs`.

## 1. Independent research: the comparison table

Every claim below is the vendor's own unless marked otherwise. "Israel" = whether the product can
say anything about the Israeli market specifically.

| System | What it really measures (sources) | Method | Geography / Israel | Discovery → sale link | Weakness / gap |
|---|---|---|---|---|---|
| [Exploding Topics](https://explodingtopics.com/methodology) (Semrush) | Search, social, forums, news, e-commerce, podcasts, GitHub, Kickstarter | ML + human analysts; claims 87% back-tested accuracy over 12 months ([page](https://explodingtopics.com/solutions/market-researchers)) | Global; no Israel view | None (topics, not products to buy) | Accuracy self-reported, method of the back-test not published; reviewers note opaque sources ([unite.ai](https://www.unite.ai/exploding-topics-review/)) |
| [Spate](https://help.spate.nyc/en/article/how-spate-data-works) | Google Search, TikTok, Instagram, Reddit | ML on search + social; 1-year forecast ([feature](https://www.spate.nyc/features/accurate-trend-prediction)); search refreshed monthly, social weekly | Beauty/food/wellness, mainly US | None | Monthly search refresh; no per-product purchase link; paid |
| [Kantar Emerging Trends](https://www.kantar.com/press-center/kantar-emerging-trends-turns-search-data-into-the-worlds-first-cross-category-trend-prediction-tool) | 18 years of search data, ~200 markets | "Stickiness": global presence, multi-category presence, brand independence | ~200 markets (Israel not confirmed) | None | Enterprise; category trends, not items |
| [WGSN](https://www.wgsn.com/en/wgsn-methodology) | 2,800 third-party sources + "Shows, Social, Shelf, Search, Sentiment" | STEPIC framework, 15 weighted criteria, experts publish trends scoring ≥ 30 | Global fashion/retail | None | Expensive; months-ahead forecasts; no accuracy published |
| [Trendalytics](https://trendalytics.co/technology) | E-commerce sites, Instagram/TikTok, search | AI forecasting for fashion/beauty | US | Retail assortment | Fashion only; paid |
| [Heuritech](https://faq.heuritech.com/articles/6388848-how-does-trend-forecasting-work) | Social images (computer vision) | Visual recognition of items worn | Fashion markets | None | Fashion only |
| TrendBridge | — | — | — | — | **Not found** in two searches; treated as unverified |
| [Google Trends](https://developers.google.com/search/blog/2025/07/trends-api) | Search interest | Official API in alpha (July 2025), application-only | Has Israel, but small volumes often show "not enough data" | None | No free API for our use; relative values only |
| [Pinterest Trends / Predicts](https://business.pinterest.com/blog/how-we-forecast-trends-pinterest-predicts) | Pinterest searches | Trend score + yearly calls graded in a public scorecard (~80%, self-reported) | 30+ countries; **Israel not in the lists found** ([newsroom](https://newsroom.pinterest.com/news/pinterest-rolls-out-new-tools-to-help-advertisers-discover-emerging-trends-and-measure-success)) | None | Yearly; no Israel |
| [TikTok Creative Center](https://ads.tiktok.com/help/article/trend-discovery?lang=en) | Hashtags, songs, creators, ads by region | Platform's own counts | Region list; Israel not confirmed | Ads only | No free API; TikTok Shop not open in Israel |
| FastMoss / Kalodata / EchoTik ([comparison](https://www.echotik.live/blog/echotik-vs-kalodata-vs-fastmoss-more-accurate/), [SmartScout](https://www.smartscout.com/blog/fastmoss-alternatives)) | Estimated TikTok Shop sales, creators | Estimates without official TikTok API | TikTok Shop markets only | Yes (TikTok Shop) | Accuracy self-reported; no Israel |
| Sell The Trend, Minea, Dropship.io, Niche Scraper, Ecomhunt, [TrendTrack](https://www.trendtrack.io/tools/winning-product-finder), [Ecom Spy](https://goecomspy.com/) | Store/ad spy, AliExpress/Shopify sales counts | "Winning products" lists | Some per-country filters (TrendTrack: 6 EU markets) | Dropshipping | Snapshots of what already sells; no public record of their calls |
| AliExpress DS Center ([importify](https://importify.com/blog/unlocking-e-commerce-success-a-deep-dive-into-aliexpress-dropshipping-center/)) | Per-product 7/30/90-day sales | Store's own | Global | Yes | Product Analysis reported not fully active (May 2026); per item only |
| [Amazon TrendSpotter](https://www.amazon.science/publications/trendspotter-forecasting-e-commerce-product-trends) (research) | Customer engagement on Amazon | ML predicts future popularity | Amazon marketplaces | Amazon | Research, not a product; over time, not across countries |
| Israeli companies: [Trendos](https://startupim.com/company/trendos), Bright Insights, Tastewise, Belle AI | Public web data / brand activity / food trends / retail forecasting | AI | Israel-based, not Israel-gap tools | Brands/retailers | None measures "has this reached Israel yet" for affiliate products |
| Patents: [US20110004509A1](https://patents.google.com/patent/US20110004509?oq=predictive+selling) (item velocity, competing listings), US8712822B2 (sales-rate curves), CN108256898B, [US9639848](https://patents.justia.com/patent/9639848) (diffusion by indicator scoring) | — | Velocity / diffusion | — | — | None claims a per-country arrival gap or a public per-call record |
| Research: [PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0194723) (search leads sales), [arXiv 1608.02646](https://arxiv.org/pdf/1608.02646) (early cascades), [Marketing Science 2002](https://pubsonline.informs.org/doi/fpi/10.1287/mksc.21.3.318.139) (lead–lag across countries), Muller & Peres (TAU/HUJI) | — | — | Lag countries learn from lead countries; some authors dispute lead–lag | — | No study measures the lag for Israel with daily product-kind data |
| "ViralHyp" (ChatGPT's name) | — | — | — | — | **Not found** anywhere; unverified |

## 2. Cross-check with the earlier (ChatGPT) research

| Claim | Finding | Status |
|---|---|---|
| ViralHyp exists and finds TikTok Shop products before they go viral | No trace; the real tools doing this for TikTok Shop are FastMoss/Kalodata/EchoTik | Unverified |
| Per product: image, trend score, stage, explaining data, AliExpress link, ILS price | All built from the owner's AliExpress affiliate account | Built |
| "Indication whether the product is already common in Israel" | No system found that does it. Pinterest has no Israel; Google Trends is too coarse for Israel; TikTok Shop is closed here | The core addition (Israel gap) |
| Free start: GitHub daily, cloud storage, new page, free trial | Kept; storage is a GitHub release (free, versioned, auditable), not Supabase (its free egress quota once restricted the project) | Built |
| Nobody publishes accuracy | **Corrected:** Pinterest publishes a yearly self-graded scorecard; Exploding Topics claims 87% back-tested. The radar's difference: every call dated, graded after 14 days, never edited, shown per call | Corrected |
| "Spot it before it's a trend" is new | **Corrected:** Exploding Topics, Spate, Kantar and others claim it. What none of them does is below | Corrected |

## 3. The innovation map: what nobody solves fully

| Need | Global tools | Gap |
|---|---|---|
| Rising demand for a kind of product | Many (search/social) | Few read the supply side (factories/sellers rushing in) |
| **Has it reached Israel yet?** | None found | Open |
| **Days from "rising abroad" to "searched in Israel"** | None found | Open |
| A buyable item, checked against an affiliate shop's own rules | Dropshipping tools (no truth rules) | Open for creators |
| Is the specific item hot this week (not just "popular")? | DS Center (inactive), spy tools | Partly open |
| Public, per-call, never-edited accuracy | Pinterest (yearly, aggregate) | Open per call |

**What LikeLink2 built (the original part):** one daily loop that joins the factory side
(AliExpress listings and the median item's order acceleration) to the Israeli search side (Hebrew
Google and YouTube autocomplete, two sources that must agree, plus LikeLink2's own visitors), opens a
**window** only when it rises abroad and is not searched in Hebrew here, measures the **arrival
clock** for Israel from observed arrivals, checks the exact buyable item for **hot now** (its own
30-day orders accelerating) and a 12-point **opportunity check**, gives one **action**, grades its own
calls in public, and is wired into the **magic button** for any pasted link.

**On "unique in the world":** the research above found no system that measures whether a product has
reached Israel or the Israel arrival lag, and none that publishes per-call grades. That is evidence,
not proof — private tools and unpublished work cannot be ruled out — so LikeLink2 should say "we
found no other tool that does this", never "the only one in the world".

Ideas examined and NOT built, with the reason:
- **Where a trend was born / which country next:** needs per-country demand. No free source gives it
  for products: AliExpress order counts are global; English autocomplete barely changes by country
  (measured 2026-11-14: English from Israel matched the US for nearly every concept); Pinterest has no
  Israel; Google Trends' API is alpha by application. Per-language autocomplete would need our own
  translations of every concept (our guess, not data). Free alternative built: world (US) vs Israel,
  with the arrival clock; country spread is the next step when a source exists.
- **Israeli stores' stock:** Zap's search pages and DuckDuckGo's suggestions are disallowed to
  automated readers by their robots.txt (checked on a runner, 2026-11-14), so they are not read.
- **Sales per concept from LikeLink2's own orders:** the store's order list is the owner's private
  business data; the radar's state is a public release, so it is not joined there.

## 4. Built and verified

- **Real data sources:** AliExpress affiliate API (product.query, hotproduct.query,
  productdetail.get; ship to Israel, ILS); Google autocomplete (Israel/Hebrew, US/English), YouTube
  autocomplete (Israel/Hebrew), Google Trends Israel RSS — robots.txt read first every run; LikeLink2's
  public click events and catalog (anon read). Seeded once with the server's own item readings
  (`deals:momentum`, 2026-11-06..13).
- **Database:** the `radar` release: `readings.json`, `items.json`, `awareness.json`, `calls.json`,
  `discovered.json`, `board.json` — append-only daily history, the knowledge base that grows.
- **Scoring and predictions:** stages from median item acceleration; window; hot-now per item;
  opportunity checklist (unmeasured is never passed); action; self-graded calls.
- **UI:** `/radar` (open windows first, Israel line with confidence and sources, action, opportunity
  check, "on the site now: what is really hot", arrival clock, public record).
- **Magic button:** a checked item shows its concept's stage, Israel state + confidence, the item's own
  momentum, the opportunity check (when it is the pick) and the action; a site product shows its own
  momentum.
- **Security:** the board is untrusted input in the browser (`sanitizeBoard`); store buttons only to
  the owner's own s.click links; images only from AliExpress hosts; no key or token stored or shown;
  autocomplete texts never stored (brand names); only reads (a test spies every request).

### Real results, 2026-11-14

- Of the site's 206 listed products, 79 have AliExpress order history: **4 are HOT** (orders +10–14% a
  week: a watch, a tennis bracelet, crystal earrings, a heart bracelet), 39 sell a lot without
  accelerating, 11 are slow, 25 need another reading; 127 have no history yet (read daily from now).
- Israel (first runs): butter-stick squishy is already searched in Hebrew (matches the owner's own
  reading that it is saturated here); capybara, tofu, maltose and fruit squishies, cat window perches,
  dog lick mats, seat-gap fillers and more show no Hebrew searches yet.
- First directions: from 2026-11-16; first grades: ~2026-11-30.

## 5. Completed / proven / still needs work

| Item | Status |
|---|---|
| Research, cross-check, innovation map | Done (this file) |
| Collector + state + board | Done; proven by real runner runs (logs in Actions → "Trend radar") |
| Israel gap (two search sources, confidence, arrival clock) | Done; real readings; arrival clock needs observed arrivals |
| Hot now for picks and site products | Done; real readings + seed |
| Opportunity check + action | Done; tested; real from the next run |
| Magic button integration | Done; tested end to end with a faked network |
| Accuracy | **Not proven yet:** needs 14+ days of calls |
| Country spread / origin | Not built: no free per-country source (see §3) |
| Israeli stores, social views | Not read: robots.txt / no free API |
| Paid tier | Not built (free trial); the engine is one JSON board, so depth can be gated later |
