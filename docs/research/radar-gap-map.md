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

## Tenth check (20.11, "check the whole world; if gaps remain, rise above everyone")

- **The sentence still holds.** No product-trend tool was found that publishes every prediction timestamped in advance with a graded record. Sealed, graded logs were found only for sports (TipsAudit), crypto and markets (HodlOdds, jansen.ai, NeuPortal). HodlOdds itself says a timestamp proves no edit after the commitment, not that every prediction was submitted. That is why the radar seals every book, misses included, under one root.
- **"Independently validated":** Spate's homepage says its 72% accuracy is independently validated. Its own help center describes an internal annual ranking (about 70%, "ranked annually in our Predicted Trends Report"), and no validator is named. Heuritech (92%), WGSN, Stylumia and Pinterest Predicts (88% over six years, per a third-party review) publish no per-prediction log.
- **The gap: how long the window stays open.** We found no tool that says how long a specific product's window stays open:
  - Sell The Trend gives a saturation score ("trend lifecycle") and Tradelle a saturation index, neither with a timeline.
  - Blogs give rules of thumb with no shared method: a viral trend lasts "5–10 days" (Retail Dive, sponsored), a single-video item "2–4 weeks" (AliDropship), a decline at "2–6 months" (Tradelle), hits shortened to "1–2 months" (36Kr), "dozens of sellers listing the same product" as the sign it is over (RapidTok).

What was built: **⏳ the window clock** (`src/lib/growth/radarWindow.js`). For every find under the radar's own saturation line (2,000 matching listings, the line the new products' check already uses), it gives a calibrated chance that the listings are past the line in 3, 7 and 14 days.
- **Model:** the same as the proven range (`calibrate`), on the listing counts the radar reads every day. These are every concept on the watch list, plus every new product's and new kind's phrase, read again for 16 days after it is shown.
- **The chance:** only from the errors of the same size band, so a small phrase is never judged by big generic searches.
- **Sealed and graded:** as the book `window` in the daily root, graded on its day with a Brier score, base rate, skill and reliability table.

Sources: [style3d: AI fashion prediction accuracy 2026](https://www.style3d.ai/blog/how-accurate-are-ai-fashion-trend-prediction-tools-in-2026/), [Spate: accurate trend prediction](https://www.spate.nyc/features/accurate-trend-prediction), [Spate help: predictive growth](https://help.spate.nyc/en/article/how-to-understand-predictive-growth), [Heuritech: fashion forecasting 2026](https://heuritech.com/articles/fashion-forecasting/), [Exploding Topics: trend forecasting platforms](https://explodingtopics.com/blog/trend-forecasting-websites), [Sell The Trend: product research](https://www.sellthetrend.com/dropshipping-product-research), [Tradelle](https://www.tradelle.io/), [Tradelle: what makes products go viral](https://www.tradelle.io/blog/what-makes-dropshipping-products-go-viral/), [Retail Dive (sponsored): the TikTok effect](https://www.retaildive.com/spons/the-tiktok-effect-how-viral-trends-are-changing-visual-merchandising/820559/), [AliDropship: trending product](https://alidropship.com/dropshipping-wiki/trending-product/), [36Kr: viral hits last under 2 months](https://eu.36kr.com/en/p/4017878360133763), [RapidTok: trending or dead](https://www.rapidtok.com/blog/tiktok-product-trending-or-dead), [ProductLair: how long products last](https://productlair.com/blog/how-long-do-dropshipping-products-last), [HodlOdds track record](https://github.com/hodlodds/track-record), [TipsAudit](https://github.com/tipsaudit/track-record-public), [jansen.ai ledger](https://github.com/jansenai/ledger), [NeuPortal](https://neuportal.ai/blog/prove-prediction-made-before-event-opentimestamps).

## Wording rules (public)

- Allowed since 17.11, after the owner's "כן" (dated, always with "we found"; narrowed to product trends on 19.11): `RADAR_CLAIM` in `src/lib/growth/radarStatic.js` — "the only product-trend radar we found in the world that seals every call in advance, misses included, and grades it in public" / "רדאר טרנדי המוצרים היחיד שמצאנו בעולם שחותם כל קביעה מראש, גם את הטעויות, ונותן לה ציון בפומבי", with the check's date beside it (`Proof` on `/radar`, the static HTML, `llms.txt`).
- Never "beats Exploding Topics", never "the most accurate", never a hit rate before the record has one: hitting better than anyone is a claim only a graded record can make.
- Numbers about competitors only as they publish them, with the source.

Sources: [Contently roundup](https://contently.com/2025/12/26/how-to-detect-micro-trends-before-they-break-out-top-10-platforms-for-2026/), [trendsmcp comparison](https://www.trendsmcp.ai/blog/best-tools-for-trend-forecasting-2026), [ai-in-fashion: WGSN/Heuritech](https://ai-in-fashion.com/en/trend-forecasting-tools-compared/), [EchoTik TikTok tools](https://echotik.live/blog/best-tiktok-product-research-tools-2026/), [SmartScout: Helium 10 vs Jungle Scout](https://www.smartscout.com/blog/helium-10-vs-jungle-scout), [DemandSage](https://www.demandsage.com/helium-10-vs-jungle-scout/), [NeuPortal](https://neuportal.ai/blog/prove-prediction-made-before-event-opentimestamps), [Exploding Topics](https://explodingtopics.com/solutions/market-researchers), [Glimpse](https://meetglimpse.com/software-guides/trend-forecasting/), [ZIK](https://www.zikanalytics.com/academy/ebay/advanced-tools/ali-growth-scanner-tutorial), [Minea](https://minea.com/./aliexpress-products-finder).


## Eleventh check (26.11.2026): Wix's purchases, sealed product-trend calls

Asked: did Wix buy a company that does what the radar does, and does the approved sentence still hold?

- **Wix's purchases.** None of them forecasts product trends.
  - [Base44](https://www.calcalistech.com/ctechnews/article/s1iflnlelx) is an AI app builder, announced June 2025, about $80M upfront plus earn-outs ([up to ~$280M reported](https://www.calcalistech.com/ctechnews/article/fu5xrwt7i)).
  - [Hour One](https://www.nasdaq.com/articles/wix-acquires-hour-one-boost-generative-ai-and-drive-innovation) makes AI video.
  - [Rise.ai](https://techradar.com/news/wix-will-offer-gift-cards-and-store-create-solutions-after-riseai-acquisition) does gift cards and re-engagement.
  - [Modalyst](https://techradar.com/news/wix-continues-acquisition-spree-with-purchase-of-dropshipping-firm-modalyst) is a dropshipping supplier marketplace. Inside Wix, it lets sellers browse "trending products" by subcategory, save and import them, and order samples ([review](https://www.websitebuilderexpert.com/building-online-stores/how-to-find-trending-products-to-sell-online/)). We found no published selection method, no dated calls and no graded record. The radar's Wix page (`/wix/radar`) already hands a find to Modalyst's search and to Wix's import file: the radar is the step before it, which product and when.
- **Sealed, graded calls.** The extended search found sealed, graded forecasts only outside product trends:
  - sports betting;
  - [NeuPortal's Bitcoin-timestamped market forecasts](https://neuportal.ai/blog/ai-and-blockchain-how-bitcoin-timestamps-make-ai-verifiable), self-published.

  We found no ecommerce trend tool publishing timestamped, publicly graded calls. The approved sentence (`RADAR_CLAIM`) still holds, with "we found" and this date.
- **What the radar's own record shows the same day.** The lab, on 17–22.11, 3 days, +10%: the radar's pick 18.3%, the simple ranking 18.3%, random 2%. It is equal to the simple ranking, not ahead of it. Nothing may say "the best" or "more accurate than" until the sealed daily duel (`radarVersus.js`) and the 14-day grades show it.

## Twelfth check (27.11.2026, afternoon): "nothing missing, number 1, impossible to pass"

Asked: after the upgrades, what is still missing for the radar to lead, worldwide, and what can be measured today?

- **Sealed, graded product-trend calls (the radar's claim).** Two extended searches the same day found sealed, graded records only outside product trends:
  - sports picks with Git history and OpenTimestamps proofs ([TipsAudit](https://github.com/tipsaudit/track-record-public), external timestamps from June 2026);
  - Brier-scored public predictions, mostly the 2026 World Cup ([Trackrecord.info](https://trackrecord.info/));
  - locked election forecasts ([Akashic](http://akashicedge.com/forecast/scorecard/)), biotech catalysts graded against SEC filings ([CatalystAlert](https://catalystalert.io/track-record)), geopolitical calls ([Aegean](https://aegeanintel.com/scorecard/)).

  For e-commerce and product trends the searches found self-reported accuracy and vendor reviews only ([one critique](https://medium.com/@jiyam/the-data-only-fashion-forecasting-fraud-why-retail-analytics-platforms-are-failing-the-industry-5ab8cf6bfe55) cites a vendor's unaudited 68%). The approved sentence (`RADAR_CLAIM`) still holds with "we found" and this date.
- **New and named players in 2026.** None publishes dated calls with grades:
  - [EchoTik](https://www.echotik.live/blog/echotik-vs-kalodata-vs-fastmoss-more-accurate) pitches "velocity" before saturation;
  - Virlo and [SmartScout](https://www.smartscout.com/blog/kalodata-alternatives) cover TikTok Shop, Amazon and Walmart;
  - TrendTrack and Sell The Trend's Nexus ([vendor page](https://www.sellthetrend.com/blog/ai-to-find-trending-products)) claim early detection;
  - Exploding Topics Pro sells trend forecasts on its Investor tier and an API on Business ([review](https://www.therundown.ai/tools/exploding-topics)).
- **What they have that the radar does not (yet), and the legal door to each:**

  | What they have | Who | The radar's door | What it needs |
  | --- | --- | --- | --- |
  | Search volume as a number, 5 years back | Exploding Topics, Glimpse | [Google Trends API (alpha)](https://developers.google.com/search/apis/trends), official and free, approved testers only ([still alpha in October 2026](https://www.seroundtable.com/google-trends-api-applications-approvals-39978.html)) | The owner applies on Google's form |
  | TikTok Shop sales and creators | Kalodata, FastMoss, EchoTik | Their data is scraped ([~80% overlap](https://www.smartscout.com/blog/fastmoss-alternatives)). TikTok's official [Commercial Content API](https://developers.tiktok.com/products/commercial-content-api) (EU ads, DSA) is by application, and its terms limit commercial products ([guide](https://www.getphyllo.com/post/tiktok-api-integration-guide-2026-setup-endpoints-common-pitfalls)). YouTube Shorts is read today. | The owner applies; the terms are read before any use |
  | Amazon and Walmart | SmartScout, Jungle Scout | Amazon's own product API (Associates) | The owner's Associates account with its first sales |
  | Korea's shopping searches | Naver DataLab | The free Developers Center reportedly [closed new applications on 31.7.2026](https://apify.com/hanpro/naver-datalab-shopping-insight); NAVER API HUB is the door now ([docs](https://api.ncloud-docs.com/docs/en/naver-api-hub-shopping-insight-keywords)). The secrets `NAVER_API_KEY_ID/KEY` and `RAKUTEN_APP_ID/ACCESS_KEY` are empty in the workflow. | The owner's keys (the price is checked before any cost) |
  | Years of history | WGSN, Google Trends | Wikipedia since 2016 (read today); every other book grows one sealed day at a time | Time |

- **The radar's own record today (the run of 27.11 10:09 UTC, the lab run of the same day):**
  - The ranges held as stated: 3 days at 90%, 593 of 657 (90.3%); at 80%, 526 of 657 (80.1%). 7 days at 90%, 109 of 124 (87.9%); at 80%, 100 of 124 (80.6%).
  - The chance at 3 days: 361 graded, Brier 0.036, 54.5% better than always saying the base rate (the board of 26.11).
  - The pick against the simple ranking (lab, real history, the later half of the days, which no choice saw):
    - The growth that beats the noise ("noise" in the duel from 28.11) was at or above the simple ranking in all 7 tests: 30% vs 29.2% (3 days), 18.7% vs 17.3% (7 days), and every takeoff setting (5% vs 3.3%, 15% vs 12.5%, 27.5% vs 22.5%, 22.5% vs 17.5%, 52.5% vs 45%).
    - The margins are small, a few hits each, and the earlier half of the days held almost no hits (the item histories were young), so no choice there means much. The sealed duel decides (first 3-day grade 29.11, the noise order's first 1.12).
  - The head-to-head's chance model had a Brier 4× a constant's. Day by day the cause was one day: on 19.11 the model had learned from 215 examples and said 62.9% where 3.5% grew. On every other day it was at or below the constant. A chance now needs 500 examples (`PROMISE.minChance`).
  - Trend calls: 0 graded (the first are due 4–5.12). New products: 6 sealed, due 4.12. Nothing may say "more accurate" or "the best" before these grades.
- **Fixed from the real runs the same day:**
  - The model install failed once on a download timeout and the evening run lost three AI doors; it now tries three times.
  - A push to main spent YouTube's daily quota (24 of 26 searches answered 429); only the daily reading uses the key now.
  - GDELT answered 429 to 9 of 14 phrases; the door now waits longer after each 429, stops after two blocked phrases and keeps a 4-minute budget.
  - Video and listing phrases carried links, app pitches and describing words ("https www", "download app", "breathable shock", "versatile end"); these are left out now.

## Thirteenth check (27.11.2026, evening): above Google Trends and Exploding Topics

The owner asked to go above Exploding Topics and Google Trends, "precisely, verified".

- **Google Trends, in Google's own FAQ** ([support.google.com/trends/answer/4365533](https://support.google.com/trends/answer/4365533)):
  - each point is a share of all searches in that place and time, scaled 0–100: relative, never a count;
  - the data is a sample of searches;
  - only popular terms are shown, and a low-volume term reads 0.
  - So Google Trends is silent exactly when a product is still small. That is where the radar works: orders, new listings, factories, customs and new shops come before people search.
- **Exploding Topics, in its own pages** ([explodingtopics.com/methodology](https://explodingtopics.com/methodology), seen through a search result; the site did not load from here):
  - it says it reads signals across Google, YouTube, Reddit, TikTok and other platforms;
  - analysts confirm and curate the trends;
  - each trend is labelled exploding, regular or peaked;
  - its trend graph is search volume.
  - No outside-graded record of its past calls was found, and its terms forbid using its content commercially (the rivals race keeps it in `RIVALS_UNFED`).
- **What the radar adds and measures:** the 🔎 Google race (`googleRace.js`). Every sealed call is timed against Google's own public doors:
  - the search box's completions in 13 countries;
  - the buzz words Google adds (tiktok/viral/trending/amazon);
  - Google's daily trending searches in 11 countries.
  - The radar counts as first only when Google was read quiet on or after the seal and showed the phrase later, at the low end of the range.
  - A search-growth tool sees a trend only once Google does, so this line also times the radar against any tool built on search volume.
  - Nothing is said as "ahead of Google" before the sealed, graded race shows it.
- **US customs:** checked from a runner. api.census.gov answers every data request without a key with "Missing Key", and its robots.txt with a firewall's rejection page. The US door waits for the owner's free Census key.
