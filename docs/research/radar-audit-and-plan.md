# The radar: audit from real runs, and the ranked development map (21.11.2026)

The owner's mission (21.11), execution order: 1. finish the audit, every claim checked against real runs; 2. the worldwide research (`radar-competitive-intelligence.md`); 3. a ranked development map; 4. build, keeping what works; 5. verify in production with evidence.

## 1. The audit: what the runs really show

Evidence: the public GitHub log of the radar run on branch commit aa47b2f (run 44847186637, 21.11 01:16–01:40 UTC, real AliExpress / Google / site answers), and the daily main runs of 17–20.11.

| Area | What the run did | Class (owner's 1–5) |
|---|---|---|
| AliExpress affiliate API (official) | 139 watch-list and discovered kinds read; 240 site products, 237 read; 120 world categories asked; 3,990 new listings | 1 · working, verified in production |
| New-listing areas tech / gadgets / handheld | answered empty (resp 405) on every run 17–20.11; since 21.11 found on the second, shorter search | was 3 → now 1 |
| Google suggestions in Hebrew (Israel) and abroad | measured for every kind (Israel google / youtube / US levels in the log) | 1 |
| Google Trends RSS (Israel, abroad) | read daily | 1 |
| Baidu (China), Naver (Korea) | closed by their own robots.txt, never read | 3 (closed by the site's rules) |
| YouTube Data API, Pinterest Trends API, Instagram Graph API | keys or connections missing | 2 · in code, waiting for a connection |
| Telegram morning alert | bot and chat secrets missing | 2 |
| Crowd sensor | read, 0 items checked by 2+ people this week | 1 (valid, empty) |
| New kinds by meaning | ran; 2 candidates, both saturated, 0 shown | 1 (working, nothing passed) |
| Stages | RISING 1 · STEADY 68 · PEAK 55 · COOLING 1 · UNVERIFIED 14; 1 stage call open, due 05.12 | 4 · running, no grade yet |
| Proven range / window clock | 304 ranges and 34 window chances issued, 0 graded yet (first grades from 23.11) | 4 · running, no grade yet |
| Next-country clock | 0 arrivals observed | 4 |
| Daily schedule | starts ~9 h late every day (GitHub delay) | 4 · the page now counts from the real run |
| TikTok / TikTok Shop, Amazon, Reddit, Shopify | not connected | 5 · missing |

### Claims on the page that were not backed by a run (all fixed 21.11)

1. AliExpress was marked "read" once its keys existed, before any answer.
2. Google's search was marked "read" from its robots.txt alone.
3. A world category was counted "read" when the store answered an error; a failed hot list failed the whole category.
4. An answer with no data counted as a success.
5. Page text said the radar reads Baidu and Naver (both closed) and "Google in 8 countries", "trending in 10", "564 categories in about a week", "15 countries" as fixed numbers.
6. "Today" on the hero and the Wix page even when the board was the previous day's.

Fix (PRs #233, #234): one metered fetch counts every request by host, every 2xx checked by its body, four stages apart (asked → valid answer → with data → kept after the radar's checks), every error with its code, the scan table per kind of unit, the GitHub log link and commit, the receipt sealed as a book. Tests run the real radar against a failing and a partly failing network.

## 2. The ranked development map

Ranked by value to the owner's goal (find the next thing first, prove it), cost and dependencies. Costs: the radar today runs on free tiers only (public-repo GitHub Actions, Supabase free, Vercel Hobby, the AliExpress affiliate API, OpenTimestamps). Nothing below is bought without the owner's yes.

| # | Component | Mission phase | Status | Cost | Depends on | Advantage, and how it is measured |
|---|---|---|---|---|---|---|
| 1 | Run receipt + four stages + scan table | 2, 4, 9 | Built (#233–#234) | Free | — | Every public number traceable to a run; measured by the receipt itself |
| 2 | Capability map from the latest run | 2 | Built (this round) | Free | 1 | The owner's 5 classes computed, never declared |
| 3 | Source health registry across runs (last attempt, last valid data, kept, valid-answer rate, errors, runs per week, reliability, what each source measures) | 4 | Built (this round) | Free | 1 | Reliability from history; measures named apart (searches ≠ views ≠ orders) |
| 4 | Grades start arriving: ranges 23.11, window 23.11, luck 03.12, new products 04.12, stage call 05.12 | 9 | Automatic | Free | time | Precision, Brier, coverage, the luck baseline: real numbers instead of none |
| 5 | Per-source predictive value: which source's signal preceded the hits, per category | 12 | Next | Free | 3 + 4 (needs grades) | "Which sources predict best per category", measured on sealed grades |
| 6 | Recall and false-negative rate: a sealed random sample of uncalled items graded by the same rule (extends the luck draw) | 9 | Next | Free | 4 | Recall / FNR against a baseline, not only precision |
| 7 | Lead time against public finish lines (TikTok/Amazon echo, Google trending, Israel arrival) per call | 9, 6 | Exists for early calls; extend to new products | Free | 4 | Days ahead, per call, sealed |
| 8 | Profit check per find: store price (ILS, measured), shipping to Israel and delivery days (from the affiliate API when it returns them), commission yes/no, Israeli import threshold, the merchant's own markup; every number labelled measured or assumed | 7 | Partly (price, commission flag, Wix file) | Free | AliExpress fields | Feasibility before ranking a find as an opportunity |
| 9 | YouTube Data API key, Pinterest app token, Instagram connection, Telegram bot | 4 | Code ready | Free (owner's keys) | the owner | 3 more official sources answer |
| 10 | Google Trends API (official alpha) | 4 | Apply | Free, pilot only | Google's approval | Consistently scaled search interest, 5 years |
| 11 | TikTok Shop / social commerce data | 4 | Missing | TikTok's Research API excludes commercial use; a licensed provider (FastMoss / Kalodata, MCP or API) is a paid subscription | the owner's yes | Social-commerce demand next to AliExpress orders, labelled as estimates |
| 12 | Amazon | 4 | Missing | PA-API needs an Associates account with sales; estimate vendors are paid | the owner | Amazon demand, labelled |
| 13 | Reddit | 4 | Missing | Data API: commercial use needs Reddit's agreement | Reddit | Community language shifts |
| 15 | Version evals (Base44's practice): every instrument records its version on each call; a new version leads only after it beats the old one on sealed grades of the same period | 5, 9, 12 | The brain records `v`; extend to every instrument | Free | 4 | No unmeasured change to how the radar decides |
| 14 | Agents (discovery, signal, vision, diffusion, prediction, commercial, verification…) | 10 | The instruments already split this way inside one run | Free | — | Kept as instruments in one core (radarCore.js), each with a sealed book; a separate "agent" only where it gives a measured result |

## 3. What "proven" will mean (success criteria, measured on sealed grades)

| Criterion | Metric | Today |
|---|---|---|
| Discovery without manual input | new candidates per day from hot lists, new listings, kinds by meaning | Measured daily in the receipt |
| Real data from active sources | sources at class 1 in the capability map | Shown on /radar#capabilities |
| Early signals | lead days against public finish lines | Waiting for the first calls to cross a line |
| Forecasts checked against outcomes | hits / graded, Brier, coverage of ranges | First grades 23.11 |
| Better than a baseline | the radar's hit rate minus the sealed random draw's | Both need 3 grades (from 03.12) |
| Israel opportunities | calls made while the Israel gap was open, graded | Running |
| Profit feasibility | finds passing the profit check, each number labelled | Component 8 |

No public claim of being first in the world is made beyond the approved, dated sentence (RADAR_CLAIM).
