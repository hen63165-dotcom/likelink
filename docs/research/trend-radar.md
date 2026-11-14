# The trend radar: research, cross-check, design and verification

Written 2026-11-14 for the owner's directive ("רדאר טרנדים", in reply to ChatGPT's ViralHyp spec).
Live page: `https://likelink2.vercel.app/radar`. Code: `src/lib/growth/trendRadar.js`,
`israelGap.js`, `radarDiscovery.js`, `radarBoard.js`, `scripts/catalog/trend-radar.mjs`,
`.github/workflows/trend-radar.yml`. Tests: `tests/trendRadar.test.mjs`, `tests/israelGap.test.mjs`,
`tests/trendRadarRun.test.mjs`.

## 1. Independent research (what exists in the world)

| Group | Examples | What they measure | What they do not do |
|---|---|---|---|
| TikTok Shop analytics | FastMoss, Kalodata, EchoTik, Shoplus, Pipiads | Estimated TikTok Shop sales, creators, ads. FastMoss is used for early momentum, Kalodata for history, EchoTik for settled sales ([EchoTik's own comparison](https://www.echotik.live/blog/echotik-vs-kalodata-vs-fastmoss-more-accurate/), [SmartScout](https://www.smartscout.com/blog/fastmoss-alternatives)) | None has official TikTok API access; accuracy claims are each vendor's own. No Israel market (TikTok Shop is not open in Israel). Paid. |
| Dropshipping product finders | Sell The Trend, Minea, Dropship.io, Niche Scraper, Ecomhunt, AliNiche/FindNiche extensions | AliExpress/Shopify "winning products", sales counts, ad spend | Snapshots of what already sells; no country gap; no public record of their own calls. Paid. |
| AliExpress's own tools | Dropshipping Center "Find Products" and "Product Analysis" (7/30/90-day sales) ([importify](https://importify.com/blog/unlocking-e-commerce-success-a-deep-dive-into-aliexpress-dropshipping-center/), [dodropshipping](https://dodropshipping.com/aliexpress-dropshipping-center/)) | Sales trends per product | A May-2026 guide says Product Analysis is not fully active; per product, not per kind; no Israel signal. |
| Search-trend tools | Google Trends, Exploding Topics, Glimpse, Treendly | Search interest over time | Israel's small volumes often show "not enough data"; nothing about supply (sellers rushing in). |
| Platform forecasts | Pinterest Predicts ([method](https://business.pinterest.com/blog/how-we-forecast-trends-pinterest-predicts)) | Yearly trend calls from search data, graded in an annual scorecard; self-reported ~80% (8 of 10, three years running) | Once a year, global, self-graded without per-call public data; no Israel. |
| Patents | US20110004509A1 (sales of listings from item velocity, competing listings…); US8712822B2 (sales-rate curves); CN108256898B (sales prediction with anomaly points); US9639848 (diffusion prediction by indicator scoring) ([Google Patents](https://patents.google.com/patent/US20110004509?oq=predictive+selling), [Justia](https://patents.justia.com/patent/9639848)) | Velocity and diffusion as predictors | None claims a cross-country "arrival" gap, and none publishes its hit rate. |
| Research | Web search traffic leads product sales ([PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0194723)); early cascade prediction ([arXiv 1608.02646](https://arxiv.org/pdf/1608.02646)); multinational lead–lag diffusion ([Marketing Science 2002](https://pubsonline.informs.org/doi/fpi/10.1287/mksc.21.3.318.139)); Muller & Peres (TAU/HUJI) reviews | Lag countries learn from lead countries; similarity and time gap moderate it; some authors dispute lead–lag | No study measures the lag for Israel with daily, product-kind data. |
| "ViralHyp" (the name in ChatGPT's answer) | — | Two searches found no product, site or company by that name ([search](https://www.yotpo.com/pt-pt/blog/a-ascensao-do-tiktok-shop-a-descoberta-de-produtos-tornou-se-viral/)). | Unverified: treated as a description of the TikTok Shop analytics group above, not as a real competitor. |

## 2. Cross-check with ChatGPT's research

| ChatGPT said | Finding | Status |
|---|---|---|
| A tool called ViralHyp finds TikTok Shop products before they go viral | No trace found; the closest real tools are FastMoss/Kalodata/EchoTik, which do this for TikTok Shop markets only | **Unverified** |
| Per product: image, trend score, stage (starting/rising/peak/saturated), explaining data, AliExpress link, ILS price | All buildable from the owner's AliExpress affiliate account; built (the stage names follow the radar's own definitions, "saturated" is PEAK) | Done |
| "An indication whether the product is already common in Israel" | No tool found that does this. AliExpress and TikTok tools are blind to Israel; Google Trends is too coarse for Israel's volumes | **The gap → the radar's core addition** |
| Free start, daily data from GitHub, cloud storage | Correct and kept: GitHub Actions daily; state on a GitHub release (free, versioned, auditable). Supabase deliberately not used: its free egress quota restricted the whole project on 2026-10-08 | Done (storage: GitHub, not Supabase) |
| Nobody publishes accuracy (implied "unique") | **Corrected:** Pinterest Predicts publishes a yearly self-graded scorecard. The radar's difference is narrower and real: every call is dated, graded after 14 days, never edited, and shown per call | Corrected |

## 3. The original solution: "the factory knows first, Israel searches last"

The radar measures the two ends of a trend's path to Israel, every day, for every kind of product:

1. **Factory pulse (supply side, earliest):** through the owner's AliExpress affiliate account
   (`product.query`, ship to Israel, ILS), the top 20 items' 30-day orders, the number of listings
   (sellers rushing in) and the median price. Demand speed is the **median item's** growth scaled to
   a week, so one viral item cannot fake a trend (`signals`). Stages: EMERGING / RISING / PEAK /
   COOLING / STEADY / UNVERIFIED.
2. **Israel's searches (demand side, latest):** Google's public autocomplete in Israel in Hebrew,
   for the Hebrew words an Israeli would type (`hq`, up to three spellings), and in the US in English
   as "the world"; Google Trends' daily Israel feed. Counted as **extensions** (other people's
   searches containing the phrase, never the echo), shown as a level (none / first / many), never as
   a number of searches; the suggestions themselves are never stored (they can carry brand names).
   States: ARRIVED / ARRIVING / GAP / QUIET / UNKNOWN (`israelGap.js`).
3. **The window:** rising on AliExpress + not searched in Hebrew yet = **open window** ("חלון פתוח"),
   listed first on the page. Rising + first Hebrew searches = closing; searched here = already here.
4. **The arrival clock:** the day the radar first sees a Hebrew suggestion appear after a day with
   none is an observed arrival; with the radar's dated calls it measures, for Israel, how many days
   pass from the factories' signal to the first Hebrew searches. Shown from three arrivals. Nobody
   publishes this number for Israel.
5. **Public self-grading:** every EMERGING/RISING call is saved with its base, graded HIT (≥ +15%
   orders) or MISS after 14 days, never edited, and printed on the page.
6. **Discovery:** the watch list is a person's guess, so every day AliExpress's hot lists per
   category are read in English and a two-word phrase shared by ≥3 different hot items, not covered
   by the list, not a brand/character/unlisted kind and not the category's own search words, joins
   as a trial concept (≤3 a day, ≤24 at once, dropped after 14 days unless rising).
7. **Into the site:** the magic button (`/magic`) shows a checked item's radar stage and Israel state
   (exact by item id among a concept's top items, or by the concept's Hebrew words in the title),
   linking to `/radar#<concept>`. The radar's buy button is the owner's own tracked link with the
   disclosure; its "what to check" button opens the magic button.

Why it is not "APIs glued together": the method — supply velocity measured by the median item,
paired with a search-arrival gap for one country and an observed arrival clock graded in public — is
the product; each source alone answers a different question.

## 4. What was built and verified

Data path: GitHub Actions `Trend radar` (daily 05:37 UTC) → `radar` pre-release
(`readings.json`, `calls.json`, `awareness.json`, `discovered.json`, `board.json`) →
`deploy-frontend.yml` copies `board.json` to `/radar/board.json` → the page (via the site's own
address, proxied to GitHub Pages). Branch runs write to `radar-preview` only.

Security: the board comes from another host, so `sanitizeBoard` keeps only known fields; a store
button only to `https://s.click.aliexpress.com/…`, images only from AliExpress's own image hosts over
https, the check button only into `/magic`, text capped; `robots.txt` is read before Google every
run; no key or token is stored or printed; the radar only reads (GETs and the store's signed query
calls — a test spies every request).

Tests (all passing): 12 in `trendRadar.test.mjs` (stages, median, self-grading, no promises), 10 in
`israelGap.test.mjs` (autocomplete parsing from a real answer, levels, robots.txt, arrival clock,
window, Trends match, discovery), 2 in `trendRadarRun.test.mjs` (two daily runs end to end with every
network answer faked; a store error is no reading; a failed Google answer is no Israel reading; no
autocomplete text is stored; the sanitizer stops `javascript:` links and foreign images; the magic
bridge).

Real runs (GitHub runner, 2026-11-14):
- Sources probe: `suggestqueries.google.com/robots.txt` → 404 (no restriction), Trends RSS and the
  autocomplete answered; `www.google.com/robots.txt` has no rule for `/complete`.
- First branch run: all sources OK; 19 hot lists read; 65 concepts measured; Israel: 32 already
  searched here, 31 "first searches", 2 quiet. Calibration found: English asked from Israel matched
  the US for nearly every concept (useless for Israel) → dropped; some English phrases too specific
  for the US autocomplete → the first two words as a fallback; discovery proposed category words
  ("kitchen gadgets") → excluded. Butter-stick squishy: Hebrew searches present ("already here"),
  matching the owner's own reading that it is saturated in Israel.

## 5. What is missing, and what needs a source or a permission

| Gap | Why | Free alternative in place |
|---|---|---|
| Directions (EMERGING/RISING…) | Need two readings ≥ 2 days apart: first directions from 2026-11-16, first grades from ~2026-11-30 | Today's size map and the Israel state are shown meanwhile |
| Search volume in Israel | Google Trends has no free official API for small markets; autocomplete is a level, not a number | Levels only, labelled "סימן לחיפושים, לא מספר חיפושים" |
| TikTok/Instagram views per trend | No free official API for search by topic | Not measured; never invented |
| Israeli stores' stock (is it sold in Israel already?) | Would need scraping Israeli shops (terms, CAPTCHAs) | Not done; the Hebrew-search signal stands in |
| YouTube Hebrew videos per concept | YouTube Data API is free but needs the owner's Google Cloud key | Owner action if wanted: a key in the repo secrets; the adapter is a next step |
| Accuracy | Only time can measure it | Public per-call record from the first grades |
| Paid tier | Not built: the owner said free during the trial | The board is one JSON; a paid tier can gate depth (more concepts, alerts) without changing the engine |

Risks: Google's autocomplete is a public, keyless endpoint used by browsers; it may change or start
refusing — the run then marks the source and shows "not measured", never a zero. The Hebrew phrases
are the radar's own words; a different phrasing can miss searches, which is why the phrase checked
is printed on the page for anyone to verify.
