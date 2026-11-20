# The radar against the big trend tools: what they do, what none of them does

Written 15.11.2026 from public sources (roundups and the vendors' own pages, mostly self-reported; checked again before any public claim). The owner: "learn what all the big companies do and don't, and do what nobody does" — legally, from public information only.

## What they do

| Tool | What it is | Price (as published) | Its limit |
|---|---|---|---|
| WGSN | Enterprise forecasting: experts, 2,800+ sources, colours and materials | not published (enterprise) | built for brands' design teams, not for one creator |
| Trendalytics | Retail product data: search + social + 10M products | higher tiers for the advanced parts | US retail, no local-language market check |
| Exploding Topics | Rising topics, "3–12 months ahead" | from $39/month | accuracy is backtested (87%), not calls sealed in advance; English/US |
| Glimpse | Google-search trends | from $159/month | Google only; "95%" is self-reported |
| Trend Hunter | Curated trend collections | — | no time series, no measured direction |
| Kalodata / FastMoss | TikTok Shop sales and creators | FastMoss $49/month, 7-day trial; Kalodata unpublished | one marketplace, no proof record |
| Jungle Scout / Helium 10 | Amazon sales estimates | $29–$99/month | estimates; reviewers measure 15–86% accuracy and disagree |
| Minea / ZIK | Ads spy / fast-growing AliExpress items | — | dropshipping; no Hebrew, no Israel, no sealed record |
| NeuPortal | Event forecasts sealed with OpenTimestamps, graded publicly | — | events, not products |
| Ecomhunt | Trending products for dropshippers | — | curated lists, no Hebrew/Israel, no sealed record (2020 coverage) |
| ZyG (Israeli, Calcalist 2025 list) | Data-driven product publishing for e-commerce brands | — | for brands; no public trend calls or Hebrew-market radar found |
| Onebeat (Israeli) | Predicts what sells per physical store | — | inventory, not trends |

## What none of them does (and the radar does)

1. **The local-market gap.** Whether a world trend has reached Israel yet, measured in Hebrew searches (Google + YouTube), with an honest "not searched in Hebrew yet" rather than "not in Israel".
2. **Product calls sealed in advance and graded in public.** Every call fingerprinted in Bitcoin (OpenTimestamps) and graded after 14 days, misses included. The others publish backtests or their own accuracy figure.
3. **The head start, measured.** Days ahead of four public finish lines (the networks' buzz, Hebrew searches, Google's trending searches, many countries).
4. **The store's own numbers, never estimates.** AliExpress's own order counts through the affiliate API, instead of modelled sales (the Amazon tools' estimates disagree with each other).
5. **China and Korea in their own engines** (Baidu, Naver), not English Google only.
6. **From the call to the action, in Hebrew.** A real item, the owner's own link, a promotion kit with the disclosure.
7. **Simple enough for anyone.** A traffic light: 🟢 called today, 🟡 maybe tomorrow, ⚪ no call — one button.
8. **A price a creator can pay.** ₪29/month, with each user's own 7-day trial.

## What to build next (gaps nobody fills yet)

- **"Who spotted it first" (מי זיהתה ראשונה):** subscribers seal their own pick from the radar's list; after 14 days a leaderboard (nickname only) shows who was right first. No tool above has a sealed prediction game for creators. Waits for the owner's "כן לטבלה".
- **The guarantee goes live:** a missed sniper call in a paid month earns that month back (radarPlans.js, `live: false` until the claims job writes refund requests). No tool above backs its calls with money.
- **The factory signal at birth:** sellers listing a new kind of product before buyers search (built: "🐣 נולד עכשיו"); next, catching kinds below the hot lists' thresholds.

## Third check (15.11, Israel)

No Israeli or Hebrew-market tool that calls product trends in advance was found (search: Israeli startups predicting viral products; [Calcalist 2025 list](https://www.calcalistech.com/ctechnews/article/923yvb6hw), [JPost on Onebeat](https://www.jpost.com/business-and-innovation/tech-and-start-ups/article-695408), [CTech 2020](https://www.calcalistech.com/ctech/articles/0,7340,L-3812350,00.html)). Nobody's accuracy — ours included — has been verified independently: the radar has no graded call yet, so no claim of hitting better than anyone can be made until it has a sealed, graded record.

## Fourth check (16.11, worldwide: the country clock)

The owner asked "מה עוד" again. Searched for a measured country-by-country arrival clock for product trends and for markets on viral products:
- No study or tool was found that measures how many days a product trend takes to reach other countries. The closest is research on search trends, not products: GoogleTrendArchive (125 countries, 2026) counts how many countries a search trend reaches and for how long ([arXiv 2603.21871](https://arxiv.org/pdf/2603.21871)), and a TikTok study gives lifespans in days, not cross-border lag ([LBB](https://lbbonline.com/news/Why-Some-TikTok-Trends-Take-Over-the-World)).
- No product-trend tool with a country map was found. Google Trends breaks down one search term by region, and WGSN sells a social signal map to large brands ([WGSN](https://www.wgsn.com/en/about-us)). Neither seals a "next country" call.
- Prediction markets (Kalshi, Polymarket) run culture and "mention" markets, but none was found on a specific product going viral ([NPR](https://www.npr.org/transcripts/nx-s1-5718399), [DeFi Rate](https://defirate.com/prediction-markets/culture/)).

**Proposed next move (waits for the owner's yes): the global trend clock.**
1. Each product's arrival day in 11 countries, measured from local-language searches. The sources are Google's and YouTube's public suggestions in each language (robots.txt is checked first) and the store's own localized title (AliExpress API, so no translation is guessed).
2. A map that shows the wave moving from country to country, with dates.
3. Israel's number: how many days after the US a product reaches Israel. It is shown only from measured arrivals (3 or more), always with the count.
4. "Which country is next": a sealed call by the radar, plus visitors' picks in the sixth-sense game (points only). Both are graded in public.

## Fifth check (17.11, worldwide: who audits their own accuracy)

The owner asked for a check "of every company, above everything". What was found:
- The big trend companies publish an accuracy they measured themselves: Pinterest Predicts (80%), WGSN (94%), Heuritech (92%), Glimpse (95%). None was found audited from outside or sealed before the outcome.
- Forecasts sealed in advance and graded in public exist for sports and events (NeuPortal) and general questions (Nostradamus Intellect, 16 sealed, 0 graded at the time). No product-trend tool in any language was found doing it.
- A timestamp proves something only when every call, misses included, is sealed (otherwise "seal every outcome, show the winner" fakes a record). So the radar seals every book — early calls, stage calls (from 18.11), every new product shown (from 18.11), next-country calls, the store prices — under one daily root (`radarLedger.js`), plus its own picks and the weekly challenge in their own seals.

## Sixth check (19.11, after ChatGPT said "no differentiation")

The owner reported that ChatGPT checked the radar and found nothing that sets it apart. Two findings:
- **What ChatGPT read:** AI engines read the HTML without running the app. /radar's HTML carried only the home page's line ("ההמלצות של היוצרים…") — not one word about the radar. Now the build writes the radar's own facts into it (`src/lib/growth/radarStatic.js`) and `public/llms.txt` has a radar section.
- **Wider search:** forecasts published in advance with the misses beside the hits exist in other fields — sports ([TipsAudit](https://github.com/tipsaudit/track-record-public), Git + Bitcoin), elections ([PollSee](https://itspollsee.org/forecasts)), markets ([NeuPortal](https://neuportal.ai/blog/prove-prediction-made-before-event-opentimestamps)), general questions ([Predictomat](https://predictomat.com/), [Trackrecord.info](https://trackrecord.info/)), institutional scenarios ([Vektora](https://menafn.com/1111796995/Vektora-Publishes-A-Forecasting-Record-That-Shows-Misses-Beside-Hits)) and AI-search visibility ([AIOweather](https://aioweather.com/why-forecasts-miss/), not reachable from here; per the search it forecasts brands' visibility in AI answers). Product-trend tools ([FastMoss](https://www.fastmoss.com/blog/how-to-find-trending-products-tiktok-shop/), Kalodata, Minea, Sell The Trend, Exploding Topics, [Zik](https://www.zikanalytics.com/aliexpress/product-research)) rank what is selling; none was found sealing its calls or publishing misses, and none in Hebrew or for Israel.
- So the sentence is narrowed to **product** trends and re-dated 19.11: "the only product-trend radar we found in the world that seals every call in advance, misses included, and grades it in public" (`RADAR_CLAIM`).

## Seventh check (19.11, ChatGPT's two names)

- **NeuPortal**: real — forecasts on crypto, prediction markets and market direction, hashed and timestamped with OpenTimestamps before the event ([NeuPortal](https://neuportal.ai/blog/prove-prediction-made-before-event-opentimestamps)). Not products.
- **The Brier Index**: a forecasting *score* by the Forecasting Research Institute (the Brier score rescaled to 0–100%, now ForecastBench's main metric) ([FRI](https://forecastingresearch.substack.com/p/introducing-the-brier-index)); no source found tying it to a Bitcoin-sealed log.
- No sealed, graded record of e-commerce or product-trend predictions was found ([Dropship.io](https://www.dropship.io/blog/how-to-find-trending-products) recommends logging your own; vendors publish lists without grading).
- The radar's sentence never said "no system seals forecasts": it is narrowed to product trends, "we found", dated. The next step beyond a timestamp is skill against a baseline: **the radar vs luck** (`radarLuck.js`).

## Eighth check (20.11, "what nobody can promise")

The owner, 20.11: "for everything nobody can promise today, build the other way that can". The check that day:

- **Accuracy:** WGSN (94% a year ahead), Heuritech (90–92%), Glimpse (95%) and Spate (72%) publish accuracy they measured themselves; reviews call the numbers vendor claims with varying definitions (direction only, a chosen horizon). Trendalytics and Exploding Topics publish none. No independent audit was found.
- **Money back on a wrong call:** none found. TrendWatching's 14-day refund is a plain trial refund, not tied to a prediction.
- **A range with a coverage guarantee:** conformal prediction (distribution-free coverage) is used in research on e-commerce demand and delivery times, and in forecasting libraries for a company's own data (Nixtla's StatsForecast/TimeGPT intervals). We found no product-trend radar that gives per-item ranges, seals them in advance and publishes how often they held.

What was built: **📐 the proven range** (`src/lib/growth/radarPromise.js`). A model learns every morning from the radar's own item histories. Split conformal widths are set per size band. Adaptive conformal inference (Gibbs & Candès, 2021) keeps the long-run share of ranges that hold at the stated level, even under drift. Every range is sealed as the book `promise` and graded on its day, and the coverage record is printed as it is. What it claims: a coverage level that the public record proves or disproves. It never claims a hit.

Sources: [Glimpse on trend forecasting](https://meetglimpse.com/software-guides/trend-forecasting/), [apexfashionlab: WGSN 94%](https://www.apexfashionlab.com/glossary/trend-forecasting), [fashionaidaily: boutique tools](https://fashionaidaily.com/blog/best-ai-trend-forecasting-tools-for-boutiques/), [ai-in-fashion: what WGSN, Heuritech and others measure](https://ai-in-fashion.com/en/trend-forecasting-tools-compared/), [TrendWatching](https://www.trendwatching.com/), [Nixtla: conformal prediction](https://nixtlaverse.nixtla.io/statsforecast/docs/tutorials/conformalprediction.html), [Nixtla: TimeGPT prediction intervals](https://www.nixtla.io/docs/forecasting/probabilistic/prediction_intervals), [arXiv 2505.17340: conformal predictive distributions for order fulfillment](https://arxiv.org/abs/2505.17340), [productphilosophy: demand forecasting with conformal prediction](https://productphilosophy.com/articles/demand-forecasting-conformal-prediction).

## Ninth check (20.11, the next round: "find more gaps")

- **Calibrated probabilities:** weather services publish Brier skill scores (Deutscher Wetterdienst), and prediction markets publish calibration studies (Kalshi). A self-graded AI forecaster blog reported Brier 0.202 over 32 forecasts. We found no product-trend or product-research tool that publishes out-of-sample Brier scores or a reliability table against a stated base rate.
- **Sales estimates:** Jungle Scout and Helium 10 dispute each other's accuracy in tests each ran itself (Helium 10: 89.59% vs 60%; Jungle Scout: 84.1% vs 74%, a median error of 15.9%). No independent test was found. The radar uses AliExpress's own order counts, never an estimate.
- **"Winning products" saturate:** curated picks are shared widely and saturate fast; tools add saturation scores (Minea, Sell The Trend), but none limits how many see a find. This is a product decision for the owner (an allocation of each find), proposed, not built.

What was built: **🎯 the calibrated chance** (`radarPromise.js` `chanceFor`, `chanceRecord`). For each item, the same model's held-out errors give a conformal predictive distribution, and from it the chance to grow +10% in 3 days, +25% in 7 or +50% in 14. Every chance is sealed with its range and graded on its day. The record shows the Brier score, the base rate, the skill against always saying the base rate, and the reliability table (said vs happened).

Sources: [DWD: Brier Skill Score](https://www.dwd.de/EN/ourservices/seasonals_forecasts/forecast_reliability.html), [Kalshi: calibration in prediction markets](https://kalshi.com/research/kalshi-research-calibration.pdf), [WorldMonitor Brier scorecard](https://www.worldmonitor.app/blog/posts/ai-forecast-accuracy-brier-scorecard-worldmonitor), [arXiv 2509.08744: luck vs skill in prediction tournaments](https://arxiv.org/pdf/2509.08744), [Helium 10 vs Jungle Scout accuracy](https://www.helium10.com/blog/helium-10-jungle-scout-amazon-sales-data-accuracy/), [Jungle Scout sales estimates update](https://www.junglescout.com/blog/amazon-sales-estimates-update), [dodropshipping: research tools](https://dodropshipping.com/best-dropshipping-product-research-tools/), [dropship.io: research tools](https://www.dropship.io/blog/best-dropshipping-research-tools).

## Wording rules (public)

- Allowed since 17.11, after the owner's "כן" (dated, always with "we found"; narrowed to product trends on 19.11): `RADAR_CLAIM` in `src/lib/growth/radarStatic.js` — "the only product-trend radar we found in the world that seals every call in advance, misses included, and grades it in public" / "רדאר טרנדי המוצרים היחיד שמצאנו בעולם שחותם כל קביעה מראש, גם את הטעויות, ונותן לה ציון בפומבי", with the check's date beside it (`Proof` on `/radar`, the static HTML, `llms.txt`).
- Never "beats Exploding Topics", never "the most accurate", never a hit rate before the record has one: hitting better than anyone is a claim only a graded record can make.
- Numbers about competitors only as they publish them, with the source.

Sources: [Contently roundup](https://contently.com/2025/12/26/how-to-detect-micro-trends-before-they-break-out-top-10-platforms-for-2026/), [trendsmcp comparison](https://www.trendsmcp.ai/blog/best-tools-for-trend-forecasting-2026), [ai-in-fashion: WGSN/Heuritech](https://ai-in-fashion.com/en/trend-forecasting-tools-compared/), [EchoTik TikTok tools](https://echotik.live/blog/best-tiktok-product-research-tools-2026/), [SmartScout: Helium 10 vs Jungle Scout](https://www.smartscout.com/blog/helium-10-vs-jungle-scout), [DemandSage](https://www.demandsage.com/helium-10-vs-jungle-scout/), [NeuPortal](https://neuportal.ai/blog/prove-prediction-made-before-event-opentimestamps), [Exploding Topics](https://explodingtopics.com/solutions/market-researchers), [Glimpse](https://meetglimpse.com/software-guides/trend-forecasting/), [ZIK](https://www.zikanalytics.com/academy/ebay/advanced-tools/ali-growth-scanner-tutorial), [Minea](https://minea.com/./aliexpress-products-finder).
