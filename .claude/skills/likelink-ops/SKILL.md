---
name: likelink-ops
description: Operate LikeLink2 in production — find out what is really live, diagnose failures from evidence (code defect vs Supabase/Vercel limit vs missing credential), run the right checks, deploy through the Vercel route → Netlify build, and verify the live revision. Use for "the site/Studio/login is broken", 402s, "is it live?", deploys, health checks, or an operations report.
---

# LikeLink2 operations

Read `CLAUDE.md` first; this is the working routine on top of it.

## 1. What is live (do not assume)

- `https://likelink2.vercel.app` is a **Vercel project route** (`serve-current-build`, project `prj_RViASEgbdHeZdz4niJQhWpIsRKcI`, team `team_RdjlAT4niPKKUjw7t8nq5agk`) that proxies every path to an immutable **Netlify deploy permalink** (`https://<deployId>--mylikelink.netlify.app`). Vercel itself cannot deploy ("Account is blocked" status on every commit — not a PR's fault).
- `/version.json` on any host names the commit it was built from (`scripts/write-version.mjs`, run by `postbuild`).
- The API (`/api/*`) goes through Netlify `_redirects` → the Supabase edge function `api`. When Supabase is restricted, it answers **402** too.

## 2. Diagnose: one command

```bash
npm run ops:doctor                      # production
ORIGIN=https://<deployId>--mylikelink.netlify.app npm run ops:doctor   # a candidate build
VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run ops:doctor      # + database and sign-in checks (public values)
```

Or Actions → **Ops doctor** (daily, and on demand; the result is in the run summary). From a sandbox whose proxy blocks the site, probe with Supabase `pg_net` (`select net.http_get(url, headers => '{"Range":"bytes=0-1023"}')`, then read `net._http_response`).

Every line has a kind. Act by kind:

| Kind | Meaning | Who acts |
|---|---|---|
| `APP_DEFECT` | code or data in this repo can fix it | fix, test, deploy |
| `PROVIDER_LIMIT` | Supabase/Vercel refuse (402 `exceed_*_quota`, 5xx, outage) | owner: billing-cycle reset or plan/spend cap; the code already serves the shipped catalog copy |
| `MISSING_CREDENTIAL` | a secret/permission is absent (e.g. `ALIEXPRESS_APP_KEY/APP_SECRET/TRACKING_ID`) | owner adds it, then re-run the job |
| `EXTERNAL_ACTION` | a step outside the code (repoint the route, refresh the snapshot) | you, with the tools below |
| `NOT_TESTED` | no evidence either way | say so; never report it as passing |

A 402 is never "fixed" in code. Code can only stop wasting requests (the browser breaker, `src/lib/cloudBreaker.js`), fail writes honestly (`cloud_restricted` → `CLOUD_PAUSED_HE`) and keep the storefront up from `public/snapshot/kv.json`.

## 2b. The catalog skills

`npm run skills:run` (or `node scripts/skills/run.mjs --feed <url|file|none> --out <file>`) runs the `catalog-health` workflow (`src/lib/skills/`) on the catalog copy and the reels feed; every build writes `/ops/skills.json` and `/status` shows it. A new deterministic check is a `defineSkill` in `src/lib/skills/catalog.js` plus a step in `CATALOG_HEALTH` and a test in `tests/skills.test.mjs`. After a person checks a seller clip frame by frame, add it to `SELLER_REVIEWED` (`src/lib/reelsFeed.js`); a clip of another item goes to `SELLER_SKIP`.

## 3. Check before shipping

```bash
npm test                                   # node:test; one test (AI images, unsafe_url:dns) fails only where DNS is blocked
npm run build                              # no '"X" is not exported by' warnings allowed
VITE_BASE=/likelink/ npm run build         # the GitHub Pages mirror
```

Browser check in snapshot mode (the cloud down, as in production now): build with placeholder `VITE_SUPABASE_URL=https://fixture.supabase.co VITE_SUPABASE_ANON_KEY=fixture`, `npx vite preview --port 4173`, and in Playwright route `supabase.co` and `localhost:4173/api/` to a 402. Check phone 390/320, tablet 768, desktop 1440: horizontal overflow, page errors, that every video names whose it is under it, no counters/ratings, `/studio` shows the cloud-paused notice.

## 4. Deploy (the route, since Vercel is blocked)

1. Merge the PR into `main` only with CI green (`verify`, build 18/20/22, CodeQL). The red `Vercel` status is the account block.
2. Netlify builds only PR previews: take the preview deploy id of the PR head whose tree equals the merged `main` (`git diff --quiet <head> origin/main`).
3. `edit_route` on `serve-current-build`: `dest` = `https://<deployId>--mylikelink.netlify.app/$1`, keep the transform `response.headers delete x-robots-tag`, update the description. It only **stages**: `update_route_versions` action `promote` with the returned version id.
4. Verify live: `/version.json` commit = the merged head, key routes 200 with `id="root"`, `/r?pid=<id>` answers the static forwarder (not a 402), the reels feed and `/looks/*` answer 206 to a 1 KB range. Then `npm run ops:doctor` (or the workflow) for the full picture.

## 5. Never

- Download whole media files in any automated check (Supabase egress is the tightest quota; it took the project down on 2026-10-08).
- Present a snapshot or catalog price as a live store price; invent ratings, reviews, sales or follower counts.
- Print key values; put a server secret behind a `VITE_` prefix.
- Commit a migration you do not mean to run in production (pushes to `supabase/migrations/` apply).
- Claim a capability works because a page returns 200.

## 6. Report

Per capability: `PASS` (verified by a test or a live probe, with the evidence), `PARTIAL`, `BLOCKED` (the exact external action), `FAIL`, `NOT TESTED`. List files changed, commands run with results, the commit and the deploy id that is live.
