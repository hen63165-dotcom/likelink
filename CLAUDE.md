# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LikeLink2: a Hebrew-first (RTL) creator marketplace / creator "Studio" built with React 18 + Vite + Tailwind, deployed on Vercel at `https://likelink2.vercel.app` (Vercel Hobby plan). Every push to `main` auto-deploys to production. Shared data lives in a Supabase Postgres `kv` table (key → JSON text). Capacitor wraps the web build for `android/` and `ios/`.

## Commands

Node >= 22 is required.

```bash
npm run dev                                   # Vite dev server
npm test                                      # node --test tests/*.test.mjs (built-in node:test, no framework)
node --test tests/domainOrigin.test.mjs       # run a single test file
node --test --test-name-pattern="verifyProduct" tests/*.test.mjs   # run tests by name
npm run build                                 # vite build → dist/
npm run feed:google                           # generate google-feed.xml (scripts/generate-google-feed.mjs)
npm run pages:build                           # regenerate public/pricing.html + public/legal/*.html from plans.js / legal/documents.js
node scripts/authorship-evidence.mjs          # dated SHA-256 fingerprints → legal/AUTHORSHIP_EVIDENCE.md
npx cap sync                                  # after build, copy dist/ into the native projects
```

There is no linter. CI (`.github/workflows/production-checks.yml`) runs `npm ci`, `npm test`, `npm audit --omit=dev --audit-level=high`, `npm run build`, and then probes the live `/api/autopilot?mode=status`.

Before calling a change done, check that `npm run build` prints no `"X" is not exported by ...` warnings. Vite only warns about these, but they break at runtime.

## Serverless API (`api/`): hard 12-function limit

Vercel Hobby allows **at most 12 serverless functions per deployment**. Going over fails the deploy with `exceeded_serverless_functions_per_deployment`. Every `.mjs`/`.js` file under `api/` counts, except files in directories whose names start with `_`.

- **Never add a new top-level file under `api/`.** New endpoints go in `api/_utils/<name>Handler.mjs`. They are dispatched by a `?mode=` query param from an existing function, usually `api/store.mjs` (see its `export default handler`: `finance`, `push`, `intelligence`, …). Add a `rewrites` entry in `vercel.json` if the endpoint needs a pretty URL (for example `/api/push` → `/api/store?mode=push`).
- Count check: `find api -type f \( -name '*.mjs' -o -name '*.js' \) | grep -v '/_' | wc -l` must be ≤ 12.
- Several functions are multiplexers. `api/og.mjs` handles `mode=r|fetch|image|growth` plus `/u/:slug` and `/p/:id` OG pages. `api/google-feed.mjs` handles `kind=sitemap|discover|story|google`. `api/autopilot.mjs` handles cron plus `mode=status`. `api/store.mjs` handles dozens of `mode` values.
- ES module named imports between functions fail at **load time** and take the whole function down (`FUNCTION_INVOCATION_FAILED`). For example, `api/ads.mjs` imports `kvGet/kvSet/kvDelete` from `./store.mjs`, so those must stay in its `export { … }` list. To verify all functions load: `for f in $(find api -type f -name '*.mjs' | grep -v '/_'); do node -e "import('./$f').catch(e=>{console.log('FAIL $f',e.message);process.exit(1)})"; done`
- `vercel.json` also defines the crons (`/api/autopilot?cron=daily`, `/api/price-watch`), security headers, and the SPA rewrites (`/studio`, `/sell`, `/admin`, … → `/`). `.github/workflows/cloud-dispatcher.yml` calls `/api/autopilot?cron=light` every 15 minutes with `AUTOPILOT_SECRET`.
- `netlify/` holds older Netlify equivalents of some endpoints. Vercel is the live target.

## Data and security model

- **Reads** come from the browser straight from Supabase with the anon key (`src/lib/storage.js`, `src/lib/supabaseClient.js`).
- **Writes** from the browser go through `POST /api/store`. It uses `SUPABASE_SERVICE_ROLE_KEY` server-side. Money/config keys (for example `marketplace:settings`) require an admin token. Every other non-admin write is **merged, never replaced**, by `api/_utils/storeWritePolicy.mjs`:
  - Only the keys listed in `BROWSER_WRITE_POLICIES` are writable; every other key returns `server_only_key`.
  - A caller may change only records it owns. Ownership means the verified Supabase email matches the marketer record's email.
  - Anonymous visitors may only append click/view events and bump a product's `clicks` counter by 1.
  - Creating an unowned record returns 401 or 403.
  - `src/lib/storage.js` sends the admin token or the Supabase session token.
- **Failed reads never become writes:** every server kv helper uses `src/lib/cloud/kvReadGuard.js`. A failed read marks the key, and `kvSet` refuses to write it until a read succeeds. Keep this for any new kv helper.
- **Migrations deploy on push.** A Supabase GitHub integration applies every file pushed to `supabase/migrations/` on `main` to PRODUCTION.
  - Observed: `20260930000000_product_images_bucket` was applied about 70 s after its push, recorded under the file's own version. `20260928000000_kv_lockdown` was applied the same way. No workflow in this repo does it.
  - Never commit a migration you do not intend to run in production. A prepared-only migration must stay out of `supabase/migrations/` until it is approved.
- **The kv RLS lockdown is live.** `supabase/migrations/20260928000000_kv_lockdown.sql` is applied in production (verified 2026-09-30 in `supabase_migrations.schema_migrations` and `pg_policies`). The file's header comment still says "NOT APPLIED".
  - anon/authenticated can SELECT only the 11 allowlisted keys and cannot write `kv`. Writes need `is_likelink_admin()` or the service role.
  - A new key the browser must read directly needs a new migration that adds it to the allowlist.
- **Creator privacy** (`src/lib/cloud/marketerPrivacy.js`): the public rows `marketplace:marketers` and `marketplace:payouts` carry no personal data.
  - E-mail and payout fields live in the server-only keys `marketplace:marketers:private` and `marketplace:payouts:recipients`. They are not on the allowlist, so no RLS change was needed.
  - Every server kv helper that touches these keys goes through `createPrivateKv`, which merges on read and splits on write. An empty client value never erases a stored private value.
  - The browser gets the signed-in creator's own private fields from `GET /api/store?mode=me` (`api/_utils/meHandler.mjs`). Login resolves the studio through it, because the public row has no e-mail to match.
  - The admin panel loads every creator's private fields with the admin token.
- **Cron/machine auth** (`api/_utils/cronAuth.mjs`) accepts only `Authorization: Bearer` with `CRON_SECRET` or the function's own secret, such as `AUTOPILOT_SECRET`. Never trust `x-vercel-cron` or `?secret=`. `.github/workflows/cloud-daily.yml` runs the daily jobs with `AUTOPILOT_SECRET`. The daily autopilot pipeline runs at most once per ~20h (`cron:daily:last`).
- **Luna Discovery Engine** (`src/lib/discovery/`, served at `/api/store?mode=discovery` by `api/_utils/discoveryHandler.mjs`): turns a goal ("לונה, תגדילי את החשיפה") into a per-product Discovery Passport, an explainable Discovery Score (readiness/coverage — never a sales/traffic forecast), an Opportunity Graph and a channel registry. `surfaces.js` is the single source of truth for derived surfaces (SEO/JSON-LD/OG — `/p/:id` in `api/og.mjs` renders exactly `buildProductSeo`, the builder the engine audits), `mediaTruth.js` defines REAL_VIDEO / RENDER_JOB_ACTIVE / SYNTHETIC_ANIMATION / STATIC_IMAGE / MISSING_MEDIA, and `merchantStatus` mirrors `collectFeedItems` (a test pins the two together). Only SAFE internal actions execute (share asset + tracking link, content drafts, SEO verification) into `discovery:*` keys; everything external/paid/destructive is returned as `approval` or `blocked` with the requirement. Writes are fingerprint-idempotent and the action log is duplicate-safe per day. Channel env is reported as booleans only; env-var names (`ownerAction`) reach admins only. The daily loop is the `discovery-sweep` job in `autonomousJobs.js`.
- **Luna operating system** (same folder, same endpoint). It runs this pipeline:
  - **Goal → intent:** `intent.js` `compileIntent` is a deterministic grammar, not an AI call.
  - **Intent → action graph:** `buildActionGraph` compares the intent with the real passports and resolves each gap through the `capabilities.js` registry.
  - **Execution:** `orchestrator.js` `runIntent` / `executeStep` handle it:
    - Only `native` + `executor: internal` + `permission: session` steps run on their own. Each one is verified by reading back what it wrote.
    - Failures are classified (`classifyFailure`) and dead-lettered.
    - Asset writes keep `previous` for `rollbackAssets`. A manual restore is pinned (`pinnedFor`) until the product changes.
    - Memory goes to `discovery:memory:<scope>`.
  - **Laws audit:** `laws.js` lists the 15 Luna Operating Laws with the code that enforces each one. `auditRun` checks every run, and a test fails if an `enforcedBy` name stops existing.
  - **Truth records:** `truth.js` creates evidence records. VERIFIED/OBSERVED require a source and evidence, and an expired proof becomes STALE.
  - **Publication proof:** `engine.js` `verifyPublication` counts a web post only if its id is in `brand_pulse:posts`, and an external post only with a provider id.
  - **Entitlements:** `entitlements.js` `resolveEntitlement` is the single decider of the plan, from the server-verified subscription only. Pending/unknown means free. `api/store.mjs` `sub=get` uses `pickSubscription` so a pending record still reaches the PayPal self-heal.
  - **System check:** `systemCheck.js` `evaluateSystem` turns live probes into GREEN/YELLOW/RED/UNVERIFIED with evidence. The owner/admin view names missing env vars; the public view hides env names, vulnerability details and private counts.
  - **New capabilities:** add them with `registerCapability`, which refuses a capability without `verification`.
- **Scheduler fairness:** `growthScheduler.runDueJobs` runs due jobs longest-waiting first, so registration order never decides. The light cron is time-boxed (`budgetMs: 90_000`) instead of a fixed job count, because GitHub fires the dispatcher only every few hours; deferred jobs keep priority on the next beat.
- **Media storage** (`src/lib/cloud/mediaStore.js`): the `product-images` bucket is private.
  - Reads go through `/api/og?mode=media&path=<kind>/<id>/<file>`, which asks Storage with the anon key, so the storage RLS policies are the only gate.
  - Uploads go to `products|reels/<own studio id>/`.
  - The bucket + policies migration is `supabase/migrations/20260930000000_product_images_bucket.sql` (applied 2026-09-30 — see the migrations note).
  - The system check runs a daily real upload → readback → anon-denied self-test once the bucket exists.
- **Discovery fabric** (`surfaces.js`, `experiments.js`):
  - Every affiliate share pack and product page carries a disclosure (`AFFILIATE_DISCLOSURE_HE`). `SHARE_FORMAT` bumps rebuild older packs once, keeping `previous`.
  - Passports carry `commerce` (`commerceRoute`: price is labelled catalog, stock UNVERIFIED, conversions verified only by a PayPal capture), `connections` (real, public-only) and `experiment` (A/B share variants `luna_share_a/b`). An experiment never names a winner without known exposures.
  - Crawlers get `renderProductBody`: the same content a person sees, with no crawler-only links.
- **Native agentic capabilities** (`src/lib/discovery/campaigns.js`). All draft-only and native:
  - `build_campaign` runs once per campaign goal (scope `run`). It takes real product ids and writes a draft to `discovery:campaigns:<scope>`, verified by read-back.
  - `recruit_creator` is `OWNER_EXPLICIT`. LikeLink never sends: `deliverInvitation` refuses without owner-explicit permission and, even with it, only returns the text.
  - `agent_commerce_readiness` checks the JSON-LD on `/p/:id`. Offers state the real seller, never merchant stock. The creator is not the brand. It is readiness, not a protocol connection.
  - Creator matching uses real profile `tags`/`categories` only; without them it returns "insufficient data".
  - `tests/negativeAuth.test.mjs` is the negative-auth suite: things that must be refused, proven by trying them with a network spy.
- **Native reel pipeline** (`src/lib/media/reelPipeline.js` pure core, `src/lib/cloud/reelPublisher.js` server, `api/_utils/mediaPipelineHandler.mjs` at `/api/store?mode=media-pipeline`, renderer `scripts/media/`):
  - A Vercel function cannot render video, so `.github/workflows/media-render.yml` (every 6h + manual dispatch, `AUTOPILOT_SECRET`) runs `scripts/media/render-reels.mjs`: `op=plan` → Chromium canvas frames (`reel-scene.html`, styles `likeloop_cinematic` / `ugc_style` / `cinematic3d` / `animated_story` / `animated_unbox`, disclosure burned into every frame) → ffmpeg H.264 MP4 + poster → `op=ingest`.
  - Ingest stores `ugc/<productId>/…` (service role), verifies by reading back with the ANON key (length + sha256), registers `marketplace:videos` + `ugc:assets:<id>` + the product's `video*` fields (never over a creator's own video), verifies the anon read of `marketplace:videos`, then publishes a reel post to `brand_pulse:posts` (PUBLISHED only after read-back). External: Telegram/webhook only with a provider id, else `REQUIRES_CONNECTION`. Every failure rolls back. Proof: `media:proof:<assetId>`, `publish:log`.
  - Renders are always `SYNTHETIC_ANIMATION` (`synthetic: true`, provider `likelink_native_render`). "UGC-style" is a disclosed style, never a human; no third-party studio names. `op=status` is public-safe; the `native-reel-audit` job re-verifies, unregisters broken reels and records per-style learning (labelled correlation).
  - The media proxy (`/api/og?mode=media`) serves byte ranges (206) — iOS Safari needs them for MP4.
  - Renderer v2 (`reel-canvas-v2`): every reel opens with a 1.5 s question hook (`HOOK_QUESTIONS`, questions only — never sales/stock/popularity claims) before the product appears, and carries a silent AAC 48 kHz track (Instagram's Reels API requires audio; ingest refuses a v2 upload without it). Styles: `cinematic3d`, `ugc_style`, `animated_story`, `animated_unbox`. The workflow runs every 3h (limit 4).
  - `buildSocialPack` (pure) writes the Hebrew copy per network (Instagram/TikTok/Shorts/Facebook/Telegram/WhatsApp/X/Pinterest) from real fields only, with `#פרסומת · קישור שותפים`, the animation disclosure and UTM links on `PRODUCTION_ORIGIN`. The Studio's Reels panel shows it as a share kit.
  - Instagram: `op=instagram` (cron auth) is one step of a two-phase Graph API publisher (`instagramPublishStep`: container → FINISHED → `media_publish` → read-back). It sends nothing without `IG_USER_ID` + `IG_ACCESS_TOKEN` (`REQUIRES_CONNECTION`); `IG_DAILY_CAP` (default 3) per day; only v2 reels with audio; never the same reel twice. State/proof: `publish:instagram`, entries in `publish:log` with the IG media id.
- **Catalog truth resolver** (`src/lib/cloud/catalogResolver.js`, `scripts/catalog/resolve-products.mjs`, `.github/workflows/catalog-resolve.yml`, daily + dispatch with `dry_run`): Chrome on the runner follows a product's OWN affiliate link to the store product page and reads its `og:image`; `op=catalog-resolve` accepts it only for a public product with an unshared link, an AliExpress `/item/<id>.html` page and a store-CDN image the server downloads itself (image/*, ≥4 KB), then writes `image` + `imageSource` (keeps `previous`) and reads it back. Products sharing a link are reported (`needsOwnerLink`), never "fixed".
- **LikeLoop growth loop** (`src/lib/growth/likeloop.js` pure core, `src/lib/cloud/likeloopRunner.js` server, `op=likeloop` GET public summary / full with `AUTOPILOT_SECRET`, `op=likeloop-run` POST, run every 3h by the Native reels workflow):
  - Product truth per product (`catalogTruth`): PROMOTABLE only with an own affiliate link and a real photo; otherwise REQUIRES_PRODUCT_DATA with the exact repair (`repairQueue`). Price is `catalog_price_unverified`, availability UNVERIFIED.
  - Hook engine (`buildHookSet`): 8 typed Hebrew hooks (problem, curiosity, before_after, question, didnt_know, gift, trend, story), ≤70 chars, `HOOK_FORBIDDEN` blocks claims. The trend hook uses a radar trend only when it really matched the product (Google Trends public RSS IL, Hebrew 4-letter stem match); otherwise a labelled calendar-season line.
  - Each render style maps to a creative (`STYLE_CREATIVE` in reelPipeline.js; the server recomputes it on ingest): `creativeId`, hook type, opening, format, CTA, `mediaType` (SYNTHETIC_UGC for `ugc_style`, CINEMATIC otherwise — never REAL_UGC). New style `likeloop_cinematic` (20 s, 6 beats: hook → world → tension → change → hero → CTA, original "spark" character, burned-in Hebrew captions).
  - Matrix 3 hooks × 3 openings × 2 formats × 2 CTAs; `selectCreatives` explores untried hook types first and exploits only with ≥`MIN_EVIDENCE` (30) attributed landings; `learn` reports INSUFFICIENT_EVIDENCE below that. Attribution: `src/lib/attribution.js` keeps utm/`cid` for the session; views/clicks carry `cid`; the click write policy keeps only known fields (clipped).
  - Channels (`channelStates`): CONNECTED only with a provider post id in `publish:log`; CONFIGURED with env; adapters without a publisher are `CONFIGURED_NO_PUBLISHER`; the calendar (`likeloop:queue`) caps per day (Instagram 3) and stays READY_FOR_EXTERNAL_PUBLICATION until a provider confirms. `op=instagram-insights` stores Instagram's own numbers per posted reel (with its hook type).
  - Resolver backoff: `op=catalog-resolve-status` records SOURCE_BLOCKED / NOT_PRODUCT_PAGE with 12h·2ⁿ backoff (`catalog:resolve:state`); the runner stops asking the store after the first CAPTCHA in a run and never works around it.
- **Video truth:** anything LikeLink renders (`videoEngine.js` reels, the `likelink_*` sources) is `SYNTHETIC_ANIMATION`, never `REAL_VIDEO` and never titled UGC.
  - `src/lib/media/videoCapability.js` is the typed chain VideoIntent → VideoStoryboard → SceneCompiler → provider → VideoAsset. `planRenders` hands the renderer the compiled spec, and ingest stores the creative brief on the asset (`creative`: style, prompt, product reference, provider, generation status).
  - `ugcMode`: a render in UGC format is `SYNTHETIC_UGC_STYLE`. `REAL_UGC` needs a real video with `humanFilmed: true`, which nothing sets today.
  - External video providers can only be added with `registerVideoProvider`, which refuses one without credentials, verification and a truth state. None is registered.
- **Publishing orchestrator** (`src/lib/publishing/orchestrator.js` + `adapters.js`):
  - It runs as the `publishing-orchestrator` job and after every render (`mode=media-pipeline&op=audit`).
  - Per creative it records CREATED → GENERATED → STORED → PUBLISHED → VERIFIED → TRACKED with evidence, in `publish:proof:<assetId>` and `publish:ledger`. Failures go to `publish:deadletter`; state changes go to `discovery:memory:platform`.
  - Internal surfaces (media proxy, `/p/:id`, `/reels`, home rail, creator page) are verified over their public URLs. Verification never hits `/r`, because that would log a click.
  - External destinations report provider ids, or `NEEDS_CONNECTION` with the missing credential names (names reach admins only). The sweep never posts a backlog externally.
  - A creative whose product fails catalog integrity is `BLOCKED` for promotion.
  - Public proof: `GET /api/store?mode=discovery&action=publication-proof[&asset=<id>]`. Studio ledger: `action=media-ledger` (session).
  - `/p/:id` serves the attached video as `og:video` plus a VideoObject labelled as animation. Reel shop clicks carry `src=likelink_reels` and `camp=v-<assetId>`.
- **Subscriptions:** ACTIVE records are reconciled with PayPal at most every 12h (`entitlements.reconcileActiveSubscription`). A cancellation keeps the paid period, and a failed lookup never revokes. PayPal billing plans are in ILS at exactly the site's prices (`PLAN_CURRENCY`). `ensureBillingPlans` adopts an existing ACTIVE plan with the same name/currency/price before creating one (PayPal allows duplicate names), creates nothing when that lookup fails, sends a `PayPal-Request-Id`, and retries only missing plans. Its ids are stored in `marketplace:paypal_plans` (with `currency`). One-time provisioning is `POST /api/store?mode=subs&sub=provision-plans` (admin token or the `OWNER_EMAIL` session), available as a button in the admin panel's payouts section. It never runs from a customer checkout: `resolvePayPalPlanId` only reads the stored plans (no plans → `plan_not_configured`). The public catalog (`sub=plans`, POST) reports `paypalConfigured` per plan from that same lookup, so the checkout button stays disabled until the plans exist; `paypalConnected` is the credentials signal.
- **Checkout:** `create-order` prices the cart from the catalog (`api/_utils/checkoutCatalog.mjs`) and stores `checkout:order:<paypalOrderId>`. `capture-order` records only that stored record and checks the captured amount against it. Never trust client prices or owners.
- **Plans (`src/lib/plans.js`) are the single source of truth.** The same file feeds five things, and `tests/plansConsistency.test.mjs` fails if any of them disagree:
  - the generated `/pricing` page;
  - the studio "מה כלול" view (`PlanCheckout.jsx`);
  - `entitlements.js` quotas;
  - the PayPal plan bodies (`paypal.js` `buildPlanBody`/`plannedBillingPlans`);
  - the checkout allow-list.
- **Plan rules:**
  - Plans: Free, Starter ₪29/₪290 and Professional ₪79/₪790. Elite ₪149 is a waitlist only: never purchasable and never provisioned.
  - Every `FEATURES` row is `live` or `soon`. A `soon` feature is never included in any plan, and every `live` one must name code that exists.
  - Quotas are enforced on the server: `src/lib/discovery/quotas.js`, counted in `quota:<scope>:<yyyy-mm>`.
    - A feature not in the plan returns 402 `plan_required`, with the cheapest plan that includes it.
    - An exhausted quota returns 429 `quota_exceeded`.
    - A product-count overflow returns 402 `plan_limit_products`. It only blocks writes that grow the catalog.
  - `OWNER_EMAIL` resolves to the unlimited internal plan `owner`.
- **Subscription cancellation stops PayPal first.**
  - `sub=cancel` calls PayPal's cancel endpoint. If PayPal fails, nothing changes (502), so there is never a fake "cancelled".
  - Terms come from `src/lib/billing/cancellation.js`:
    - within 14 days: a refund minus the lesser of 5% and ₪100;
    - monthly: access stays to the end of the paid month;
    - yearly: access stays to the end of the current month, and unused months are refunded.
  - Yearly PayPal plans are one 12-month term (`total_cycles: 1`), with no automatic renewal (Consumer Protection Law 13א).
  - Refunds are never sent automatically. They go to `billing:refund_requests`; the owner lists them and marks each one done with PayPal's refund ID via `sub=refunds`.
  - Checkout refuses a second paid subscription next to an active one (409), and requires acceptance of the current legal version (428).
- **Legal pack:**
  - Texts: `src/lib/legal/documents.js`, 11 documents. `[OWNER_INPUT: …]` placeholders only; attorney notes and owner-only instructions are kept OUTSIDE this public repository (never on a page, never committed).
  - Version: `src/lib/legal/catalog.js` `LEGAL_VERSION`. Bump it on any material text change; users re-accept.
  - `npm run pages:build` renders `public/pricing.html`, `public/legal.html` and `public/legal/*.html`. `tests/legalPack.test.mjs` and `plansConsistency` fail when a committed page is stale.
  - Acceptance, marketing consent and the Elite waitlist live in `mode=legal` (`api/_utils/legalHandler.mjs`):
    - acceptance is stored as version + time + context in `legal:acceptances`;
    - marketing opt-in (30א) is separate and explicit, with a signed one-click unsubscribe;
    - the waitlist is `plans:waitlist`.
  - All of these are server-only keys.
- **Distribution:**
  - `src/lib/discovery/distribution.js` builds plans only from the product's own fields: hooks, scripts, captions, hashtags, a storyboard and prompts for original 3D characters.
    - `FORBIDDEN_CLAIMS` blocks testimonials, rankings and guarantees.
    - The disclosure opens every caption, and every post gets its own `/r` link (`src=<channel>.<postId>`).
  - Routes are in `api/_utils/distributionRoutes.mjs`, under `mode=discovery`. They cover the plan, export, click stats and publishing.
  - **Publishing (Telegram only today)** is in `src/lib/discovery/publishers/telegram.js`:
    - It needs the creator's own bot + channel from the autopilot channel settings, or the brand bot for the platform scope.
    - It needs `confirm: <postId>` from a studio session, the owner's explicit approval of that one post.
    - A post is `PUBLISHED` only with Telegram's `message_id`. It is `PUBLIC_VERIFIED` only when the post is visible at `t.me/<channel>/<id>`.
    - Publishing is idempotent, and a failure leaves the post unpublished with `lastError`.
  - Other networks return 409 `channel_requires_connection` with the exact owner action.
  - A post the creator reports is `REPORTED_BY_CREATOR`, never `PUBLISHED`.
- **Catalog integrity** (`src/lib/discovery/catalogIntegrity.js`), used by distribution plans, brand pulse, the GPT API, the UGC job, the reel render planner (`planRenders`), the Instagram reel selection (`nextInstagramReel`), the public reels feed (`buildPublicGraph`) and the system check:
  - An affiliate link shared by several different products blocks promotion. On the live catalog, 22 seed products shared two links that open the AliExpress home page.
  - A stock photo (`imageProvenance` = `stock_photo`) is never used or labelled as the product's image. `isRealProductPhoto` = not stock and not missing (an unlisted store CDN still counts).
  - The products stay listed; only promotion (reels, posts, distribution) is withheld.
- **AI images** (`/api/store?mode=ugc-model`):
  - Only the platform owner (`OWNER_EMAIL`) may generate, because it spends the owner's OpenAI budget. It needs `OPENAI_API_KEY`.
  - It requires a real product photo, sent as the reference to `images/edits`. The default is an ORIGINAL 3D cartoon character.
  - The result is stored as a synthetic, AI-labelled asset (`aiGenerated`, `aiLabelRequired`, `referencePhoto`).
  - The UGC video job reuses one catalog asset per product (it used to append a duplicate each run). It skips stock photos.
- **Custom GPT** (`api/_utils/gptHandler.mjs`, `mode=gpt`, pretty URLs `/api/gpt/*`, spec `/api/gpt/openapi.json`):
  - Actions: list_products, get_tracking_link, create_content_draft (DRAFT only), list_drafts, get_draft_status.
  - There is no publish or approve action. Approval happens only in the studio, with a session (`op=draft-approve`).
  - Keys are Professional-only. They are shown once, stored as SHA-256 in `gpt:keys`, rate-limited and revocable.
  - Setup instructions are in `docs/chatgpt/`.
- **Bot guard** (`api/_utils/botGuard.mjs`):
  - On `/r`, `/p/:id` and `/u/:slug`, scraping tools get 403 and bursts get 429.
  - Link-preview bots and search crawlers are redirected but never counted as clicks.
  - The guard is in-memory, so it limits per instance.
- Server code must never fall back to the anon key. Missing service-role config returns 500 on purpose ("fail loud").
- Admin login is `POST /api/admin/auth` against the `ADMIN_CODE` env var and returns an HMAC-signed token (`api/_utils/adminAuth.js`). Server-only secrets must never get a `VITE_` prefix, because that prefix ships them to the browser bundle.
- Several API files define their own private `kvGet/kvSet` Supabase helpers (for example `api/_utils/pushHandler.mjs`) instead of sharing one.
- Allowed browser origins are checked by `api/_utils/cors.js` (`isApprovedOrigin`). Requests without an approved `Origin` get 403 `origin_not_allowed`, so include `-H "Origin: https://likelink2.vercel.app"` when probing endpoints with curl.

## Frontend (`src/`)

- `src/main.jsx` → `src/App.jsx`. Routing is custom (`src/utils/routing.js` `parsePath`), not react-router.
  - **Public site** (`src/components/discover/`, one lazy chunk `PublicSite.jsx`): `/` home, `/discover[/cat]`, `/products[/cat]`, `/creators[/cat]`, `/u/:slug`, `/p/:id`, `/reels`, `/trends`, `/collections[/id]`, `/deals`, `/search?q=`, `/saved`. `/feed` maps to Discover; `/?product=<id>` (Google feed links) redirects to `/p/<id>`. New public paths need a `vercel.json` SPA rewrite (a test checks).
  - Every public surface renders only `buildPublicGraph` (`src/lib/publicDiscovery.js`): approved + attributed products, trends only from recorded click/view events, deals only from a real previous price, reels only from playable media classified by `mediaTruth`, "verified" only when the record says so, Luna picks only from local signals. `tests/publicDiscovery.test.mjs` pins this.
  - Design system: `src/public.css` (scoped to `.lx`, loaded after Tailwind — don't combine an `lx-*` class that sets display/position with a responsive Tailwind display/position utility on the same element; wrap it). `luxury.css` has global `!important` image rules, neutralized inside `.lx`.
  - The dark `StudioShell` (`src/components/studio/`) is lazy-loaded at `/studio`; admin at `/admin`. `tests/studioShellContract.test.mjs` locks the separation. In `src/PAGES/`, the remaining files are unused duplicates.
- State lives in React contexts under `src/context/` (`MarketplaceContext` is the main one).
- `src/lib/cloud/` is **isomorphic**: it is imported by both the browser and the serverless functions (for example `api/store.mjs` imports `trustVerification.js`, `lunaGrowth.js`, and `veritas.js`). Keep it free of browser-only globals at module top level.
- `src/constants/domain.js` `PRODUCTION_ORIGIN` is the single source of truth for the public origin. `index.html`, `public/robots.txt`, and `public/sitemap.xml` mirror it, and `tests/domainOrigin.test.mjs` fails if they diverge. `likelink.com` is not ours; never emit it.
- UI copy is Hebrew and RTL (`tailwindcss-rtl`). Code comments are mixed Hebrew/English.

## Test-enforced invariants

Tests are mostly contract/regression tests. Read the header comment of a failing test before changing it. Key ones:
- `sourceIntegrity`: no NUL bytes or BOMs in any source file (a UTF-16 blob once broke a file).
- `lunaStatusTruth`: the UI may only show statuses the cloud actually reports. Never hardcode "ACTIVE"/"PUBLISHED". An unconfigured channel is `REQUIRES_CONNECTION`, not a silent success.
- `providerIndependence*` and `intelligence`: the AI layer (`api/_utils/intelligence*.mjs`, served at `/api/store?mode=intelligence`) routes tasks through a provider registry. These tests pin its behavior: a missing credential sends no request and marks status degraded, fallback goes to a compatible provider, retries are bounded, quotas apply, and credentials never appear in status output.
- `financial*`: PayPal checkout/callback flows (`api/_utils/financialHandler.mjs`, `paymentGateway.mjs`). These are tested with an in-process HTTP harness.

## Repo notes

- The many root-level `.bat`/`.ps1`/`.vbs`/`fix_*.js`/`git-*.js` files are ad-hoc helper scripts, not part of the build or deploy.
- Don't touch `.env*` files or Vercel env vars unless asked. `.env.example` lists only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ADMIN_CODE`. The API reads many more, such as `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_*`, `AUTOPILOT_SECRET`, `STORE_SIGN_SECRET`, `ADMIN_SESSION_SECRET`, `RESEND_API_KEY`, `OPENAI_API_KEY`, and `ALLOWED_ORIGINS`.
- After a push, verify that the Vercel deployment reaches READY and then hit the live changed endpoints. A READY deploy can still have functions that crash on first invocation.
