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
| **TikTok Research API** | Public video data | — | — | — | Academic and non-profit only; commercial use prohibited (third-party summaries of the 2026 Research Terms) |

## What none of them publishes (checked again 21.11)

1. **A per-call public record sealed before the outcome**, misses included. Every accuracy figure above is a percentage the vendor computed itself; none is audited from outside.
2. **The run itself as evidence.** No system shows, for each day, how many requests it really sent, which answered with data, which failed and why, with a public log of the run that did it. The radar now does (the run receipt, 21.11).
3. **A self-built capability map**: which parts work in production today, which are in code but not connected, which answer badly, which are missing, computed from the last real run instead of declared.

## Maor Shlomo / Base44

Base44 is a closed product (bought by Wix in 2025). There is **no access** to its code or internals from here, so nothing about how it is built is described or guessed. What is public and was used before (CLAUDE.md, "Building in public"): building in public every day with real numbers. To examine more, the owner would need to provide the project's address or materials she has the right to share.

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
