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
- **RLS is still open until `supabase/migrations/20260928000000_kv_lockdown.sql` is applied** (prepared, not applied). Until then anon can read and write `kv` directly over REST.
- **Cron/machine auth** (`api/_utils/cronAuth.mjs`) accepts only `Authorization: Bearer` with `CRON_SECRET` or the function's own secret, such as `AUTOPILOT_SECRET`. Never trust `x-vercel-cron` or `?secret=`. `.github/workflows/cloud-daily.yml` runs the daily jobs with `AUTOPILOT_SECRET`. The daily autopilot pipeline runs at most once per ~20h (`cron:daily:last`).
- **Checkout:** `create-order` prices the cart from the catalog (`api/_utils/checkoutCatalog.mjs`) and stores `checkout:order:<paypalOrderId>`. `capture-order` records only that stored record and checks the captured amount against it. Never trust client prices or owners.
- Server code must never fall back to the anon key. Missing service-role config returns 500 on purpose ("fail loud").
- Admin login is `POST /api/admin/auth` against the `ADMIN_CODE` env var and returns an HMAC-signed token (`api/_utils/adminAuth.js`). Server-only secrets must never get a `VITE_` prefix, because that prefix ships them to the browser bundle.
- Several API files define their own private `kvGet/kvSet` Supabase helpers (for example `api/_utils/pushHandler.mjs`) instead of sharing one.
- Allowed browser origins are checked by `api/_utils/cors.js` (`isApprovedOrigin`). Requests without an approved `Origin` get 403 `origin_not_allowed`, so include `-H "Origin: https://likelink2.vercel.app"` when probing endpoints with curl.

## Frontend (`src/`)

- `src/main.jsx` → `src/App.jsx`. Routing is custom (`src/utils/routing.js` `parsePath`), not react-router. The root `/` renders the dark `StudioShell` (`src/components/studio/`). Feed, sell, and admin views are lazy-loaded from `src/components/*`. `tests/studioShellContract.test.mjs` locks this in. In `src/PAGES/`, only `CreatorProfilePage.jsx` is live (lazy-loaded by `App.jsx`); the other files there are unused duplicates.
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
