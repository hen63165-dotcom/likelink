# The world's trend and commerce-intelligence systems, checked (21.11.2026)

The owner's mission (21.11): "build the world's most advanced commerce trend intelligence engine", phase 1: for every leading system, what it does, what data it really collects, through which doors, how it discovers, sees, forecasts, measures accuracy and connects to money; what is **proven**, what is a **marketing claim**, and what **cannot be checked**. Earlier checks: `docs/research/radar-gap-map.md` (ten rounds, 15–20.11).

Method: public pages only (vendor pages, vendor documentation, third-party reviews, academic papers), read on 21.11.2026. Nothing here is copied code or design; only ideas and principles.

Key: **P** = proven by something outside the vendor (an audit, a reproducible test, public documentation of an API anyone can call). **C** = the vendor's own claim, not checked from outside. **U** = cannot be verified from public material.

| System | What it does | Data it says it uses | Discovery / vision / forecast | Accuracy | What is missing or limited |
|---|---|---|---|---|---|
| **WGSN** (TrendCurve) | Consumer and fashion forecasts, product-level forecasts for buyers | "2,800 third-party sources" for macro trends (C); five proprietary feeds for product forecasts: social, surveys/clickstream panels, 5+ years of search, shelf tracking, catwalk/street image tagging (C, trade press) | AI-triangulated data + human peer review, re-scored twice a year (C) | "94%", "over 90%", "over 93%" on different pages (C); no published definition or audit (U) | No public, per-call record; accuracy defined by the vendor |
| **Exploding Topics** | Topics rising before they peak | Search, social, forums, news, e-commerce, podcasts; scrapes GitHub trending and Kickstarter daily (C, own blog) | ML + human analysts; filters non-commercial topics (C) | "12+ months before everyone" (C); no benchmark (U) | No sealed calls; scraping-based sources |
| **Heuritech** | Fashion attributes from images | Instagram, Weibo, later RedNote and TikTok; ~3M images/day; 2,000+ attributes (C) | Image recognition + a "master algorithm" of 7 forecasters (C) | "90%" / "92%" up to 24 months (C, via an affiliate); undefined (U) | Fashion only; panel selection not public |
| **Spate** | Popularity index for beauty, food, wellness | Google, TikTok, Instagram, Reddit; "1T search signals" (C) | Index blending platforms with growth adjustment (C) | "72%" 12-month forecast accuracy (C); no backtest published (U) | Category-limited; index formula not public |
| **Trendalytics** | Search + social + retail demand index | Google keyword data, TikTok views, retail crawl of 20k brands / 10M products (C, partly third-party) | Supply vs demand to estimate saturation (C) | Not published (U) | Formula not public |
| **EDITED** | Retail assortment and pricing intelligence | Pricing/assortment across 120+ regions, 90k brands, 5bn+ SKUs (C) | Ranks trends by commercial adoption (C) | A 2019 academic study compared it with WGSN (P, limited) | Sees what retailers already stock: late by design |
| **Brandwatch / Talkwalker / Sprinklr** | Social listening and consumer intelligence | Social networks, web, reviews; Talkwalker: 30 networks, 150M sites (C) | Spike detection, sentiment, logo/image recognition (C) | Not published as forecast accuracy (U) | Listening, not product-demand forecasting |
| **Similarweb** | Web/app traffic intelligence | Opted-in panel, direct measurement, crawlers, public data (C, own methodology page) | Traffic trends; API sold separately (P: public API docs) | Panel size and weights not published (U); one study: 94% more sessions than GA (single study) | Estimates; weak on niche products |
| **FastMoss** | TikTok Shop products, creators, shops, videos, lives | "500M–620M products, 300M–380M creators" (figures differ by page, C) | Remote MCP server with 45–55 tools for AI agents (P: public developer docs) | Not published (U) | Estimates; numbers differ between its own pages |
| **Kalodata** | TikTok Shop analytics | Public TikTok commerce data refined by AI models retrained daily (C) | Ranking and trend direction | Its own FAQ: amounts "may vary slightly", not for settlements (C, honest) | Lags on 24–48 h spikes; soft for small shops (third-party reviews) |
| **Jungle Scout / Helium 10** | Amazon sales estimates, keywords | Reverse-engineered from Best Seller Rank (P: both describe it) | Sales estimates, keyword volume | JS "84%" (own 2019 case study, C); H10 compares itself favourably (C); independent tests 74–89%, samples undisclosed | Amazon only; estimates, not sales |
| **Pinterest Trends** | Top growing keywords, Pinterest Predicts | Pinterest's own searches (first-party) | Official v5 API `trends/*` (P: public docs); needs an approved app | Predicts "80%" (own, earlier check) | Only Pinterest's own users |
| **Google Trends** | Search interest by term, country, time; daily "Trending now" | Google's own searches (first-party) | Public Trends pages and RSS; the official **Trends API is a limited alpha** opened July 2025 to a small pilot, 5-year window, consistent scaling, no "Trending now" (P: Google's developer pages) | — | No public API for everyone yet; relative interest, never volume |
| **Minea** | Ad spy for dropshippers: ads, shops, products | "100M+ ads" from Meta, TikTok, Pinterest (C); reviews disagree on coverage | The user filters ads by engagement to define "winning" (third-party review) | Not published (U) | Reviews: feeds lean to already-saturated products, data can be stale |
| **TikTok Research API** | Public video data | — | — | — | Academic and non-profit only; commercial use prohibited (third-party summaries of the 2026 Research Terms) |

## Who is strong at what

- **Breadth of data:** WGSN (2,800 sources, C), EDITED (5bn+ SKUs, C), Similarweb (panel + measurement), Brandwatch/Talkwalker (listening at scale).
- **Seeing products in pictures:** Heuritech (2,000+ attributes from social images, C); Talkwalker (logo/image recognition, C).
- **Social commerce sales:** FastMoss, Kalodata (TikTok Shop estimates; Kalodata says plainly they are estimates).
- **Marketplace sales estimates:** Jungle Scout, Helium 10 (reverse-engineered from Amazon's rank; independent tests 74–89%).
- **Opening data to AI agents:** FastMoss (public MCP server with 45–55 tools).
- **First-party search interest:** Google Trends, Pinterest Trends.

## What is still missing in the world (as far as these public checks found)

1. Accuracy audited from outside: every figure (72%–94%) is computed by the vendor itself; none is a per-call public record.
2. Misses published next to hits, sealed before the outcome.
3. The scan itself shown as evidence: how much was asked, what answered, what failed, today.
4. A measured window: how long until a find is saturated, as a calibrated, graded chance.
5. A measured "Israel gap": the same product's state abroad and in Hebrew search, side by side, dated.
6. Separation of metrics: several dashboards blend searches, views and sales into one index (Spate's index blends platforms); estimates are rarely labelled as estimates.

## Where an original advantage can be built (and what LikeLink2 already has)

| Opportunity | Status in LikeLink2 on 21.11 |
|---|---|
| Sealed, graded public record of every call, misses included | Live: the daily root sealed in Bitcoin, books per instrument; first grades due 23.11 (ranges) and 04.12 (new products) |
| The run receipt and the capability map (evidence of what really ran) | Built 21.11 (PR #233–#235) |
| Calibrated chance and window clock (Brier, reliability bins) | Live since 20.11; first grades from 23.11 |
| Luck as a baseline (the radar vs a sealed random draw) | Live; first grade 03.12 |
| Discovery without a typed name (hot lists, new listings by category, new kinds by meaning, screenshots) | Live; measured in the receipt |
| Israel gap and next-country clock | Live on Google/YouTube suggestions in Hebrew and abroad; Baidu and Naver closed by their own rules |
| Source health over time (which source answers, which predicts best per category) | Next: the health registry across runs (this round), then per-source predictive value once grades exist |
| Social commerce (TikTok Shop), Amazon, Reddit, Shopify | Missing: each needs official access (TikTok Shop Partner, Amazon PA-API / SP-API, Reddit Data API terms, a Shopify app) or a licensed provider (paid, the owner's decision) |

## What none of them publishes (checked again 21.11)

1. **A per-call public record sealed before the outcome**, misses included. Every accuracy figure above is a percentage the vendor computed itself; none is audited from outside.
2. **The run itself as evidence.** No system shows, for each day, how many requests it really sent, which answered with data, which failed and why, with a public log of the run that did it. The radar now does (the run receipt, 21.11).
3. **A self-built capability map**: which parts work in production today, which are in code but not connected, which answer badly, which are missing, computed from the last real run instead of declared.

## Maor Shlomo / Base44 (built with Claude; public material read 21.11)

There is no access to Base44's code, so nothing about its internals is guessed. What its makers and Anthropic published (self-reported, not independently verified):

- **Claude at the centre, several models routed by task.** Anthropic's customer story: Base44 "integrated Claude via API in just a few hours" into a "multi-model pipeline"; Claude Sonnet is the default "creative center" for planning and UI, Opus 4.5 for more complex apps; "smart routing" sends design and UX tasks to Claude while "users maintain full control to override these defaults". Shlomo, in interviews: Claude for UI, Gemini for logic at one point (secondary write-ups).
- **Every new model is evaluated before it is trusted.** Anthropic's July 2026 article (Yoav Orlev, Base44's head of product): "Base44 runs each new Claude model through evals across different app types, measuring latency, cost, and build errors"; changes are measured with A/B tests; Claude Fable 5 now does their hardest engineering work (rebuilding the system prompt, the agent harness, native mobile), with "the model executes tasks while Orlev's team reviews, tests, and approves the code before shipping it". The model also "flagged a gap in Base44's own evals" (cache hits were not tested).
- **A codebase built for the model to read.** Shlomo: he structured the repository "so it would be easy for LLMs to navigate and read the code" (secondary accounts).
- **Vertically integrated.** Every app comes with its database, sign-in, integrations; nothing to wire.
- **Users vote with their builds.** The customer story: "When you give users real choice, they vote with their builds."
- **Building in public with real numbers.** Lenny's Podcast: he posted what he built, revenue, retention and costs on LinkedIn and X; from three friends to 400,000 users with no paid marketing; sold to Wix for about $80M six months after starting.
- **Numbers on Anthropic's page (self-reported):** 2M+ users, 7× growth June–September 2025, 1,000+ new paying subscribers a day, same-day apps instead of multi-day cycles.

### What the radar takes from it (principles only, our own implementation)

| Base44 principle | In the radar |
|---|---|
| Route each task to what measured best, let the user override | Choose sources and instruments by their measured record per category (the health registry now; per-source predictive value once grades exist, plan item 5) |
| Evaluate every new model on fixed evals before trusting it | Every instrument version recorded on each call (the brain's `v`); compare versions on sealed grades before a new one leads (plan item 15) |
| A codebase the model can read | One core (`radarCore.js`) lists every instrument; CLAUDE.md describes every part |
| Vertical integration | Find → check → store file → content, inside LikeLink2 |
| Users vote with their builds | The sixth-sense picks and the crowd sensor are graded by the same rule as the radar |
| Build in public with real numbers | The daily post uses the board's numbers only; the run receipt is now public evidence |
| Human review before shipping | Nothing posted, bought or published without the owner's yes |

## Sources

- WGSN: [AI and data](https://www.wgsn.com/en/what-we-do/ai-data), [Fashion buying](https://www.wgsn.com/en/wgsn-fashion-buying), [Fashion forecasting](https://www.wgsn.com/en/products/fashion-design), [comparison](https://ai-in-fashion.com/en/trend-forecasting-tools-compared/)
- Exploding Topics: [Methodology](https://explodingtopics.com/methodology), [new data sources](https://explodingtopics.com/blog/new-trend-data-sources)
- Heuritech: [How Heuritech forecasts](https://heuritech.com/articles/how-heuritech-forecasts-fashion-trends-thanks-to-artificial-intelligence/), [Fashion data](https://heuritech.com/fashion-data/), [Luxurynsight](https://www.luxurynsight.com/article/heuritech-s-ai-trend-forecasting-featured-in-premiere-vision-s-visions-series.html), [arXiv 2005.00986](https://arxiv.org/pdf/2005.00986)
- Spate: [Beauty trends report](https://www.spate.nyc/reports/spate-report-decoding-beauty-trends), [Research & insights](https://www.spate.nyc/teams/research-insights)
- Trendalytics / EDITED: [Trendalytics technology](https://trendalytics.co/technology), [EDITED forecasting](https://edited.com/blog/how-to-forecast-fashion-trends-with-data-in-2026/), [WGSN vs big data study](https://udspace.udel.edu/server/api/core/bitstreams/2565859a-a82a-4d49-ad8e-887879e3e5f7/content)
- Listening: [Brandwatch tools](https://www.brandwatch.com/blog/social-listening-tools/), [Pulsar guide](https://www.pulsarplatform.com/guides/best-social-listening-tools-2026-guide-for-enterprise-buyers)
- Similarweb: [Data methodology](https://support.similarweb.com/hc/articles/360001631538), [Data accuracy](https://support.similarweb.com/hc/en-us/articles/360002219177), [API docs](https://developers.similarweb.com:443), [GA comparison](https://omniconvert.com/blog/we-analyzed-1787-ecommerce-websites-similarweb-google-analytics-thats-we-learned.html)
- FastMoss: [Developer center](https://developers.fastmoss.com/home), [MCP overview](https://developers.fastmoss.com/mcp/overview), [MCP landing](https://www.fastmoss.com/mcp-landing)
- Kalodata: [koala-apps review](https://koala-apps.io/blog/kalodata-everything-you-need-to-know/), [agency verdict](https://medialabs-co.com/blog/kalodata-vs-fastmoss-vs-echotik)
- Jungle Scout / Helium 10: [Helium 10 accuracy post](https://www.helium10.com/blog/helium-10-jungle-scout-amazon-sales-data-accuracy/), [BagEngine test](https://bagengine.com/articles/jungle-scout-accuracy), [SmartScout comparison](https://www.smartscout.com/blog/helium-10-vs-jungle-scout)
- Pinterest: [trends/topics/featured](https://developers.pinterest.com/docs/api/v5/trends_featured_topics-list/), [authentication](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/)
- TikTok: [Research API eligibility](https://apidojo.io/blog/tiktok-api/research-api/), [pricing and commercial use](https://crawlfeed.dev/blog/tiktok-api-pricing)
- Google Trends API: [announcement](https://developers.google.com/search/blog/2025/07/trends-api), [early access](https://developers.google.com/search/apis/trends), [pilot status](https://www.searchenginejournal.com/google-trends-api-alpha-mueller-confirms-small-pilot-group/554078/)
- Base44: [Anthropic customer story](https://claude.com/customers/base44), [Working at the frontier (15.07.2026)](https://claude.com/resources/articles/working-at-the-frontier-why-base44-trusts-claude-fable-5-with-their-most-challenging-engineering-work), [Lenny's Podcast episode](https://podwise.ai/episodes/4612372), [Calcalist](https://www.calcalistech.com/ctechnews/article/y0kdgmw7a), [Copy the greats](https://copythegreats.substack.com/p/maor-shlomo-and-base44-the-solo-builder)
- Minea: [ad spy](https://www.minea.com/ad-spy-tool), [dodropshipping review](https://dodropshipping.com/minea-review/), [TrendTrack review](https://www.trendtrack.io/blog-post/minea-review)
