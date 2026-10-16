---
name: cloud-guard
description: Keep LikeLink2's Supabase cloud (database, sign-in, the API) from being blocked again, and recover when it is — the free plan's quotas, what spends them, the static-first rule for visitors, the 402 "restricted" diagnosis, and the runbook for moving to a fresh free project. Use when the owner says the cloud/ענן is blocked or חסום, sign-up or login fails, 402 / exceed_cached_egress_quota appears, before adding anything that reads or serves files from Supabase, or when planning a cloud move.
---

# Cloud guard (Supabase)

The site's shop pages work without the cloud (static copy + GitHub Pages
reels). The cloud is needed for: creator sign-up and login (Supabase Auth),
saving links in the Studio (`POST /api/store` → `kv`), click counting,
payments, the admin panel and the scheduled jobs (`api` Edge Function).

## Why it gets blocked

The free plan gives **one quota per organization**, shared by all its
projects (Supabase docs, "About billing": quotas are applied to the entire
organization). Going over a line item (here: cached egress, 5 GB/month)
restricts **every** project in that org with HTTP 402 on every API call
(REST, Auth, Storage, Functions) until the billing cycle resets, or until a
paid plan. The database itself (SQL through the management API, pg_net) keeps
working while restricted.

- 2026-10-08: restricted (`exceed_cached_egress_quota`). Cause: videos served
  from Supabase Storage through the media proxy (each play and each range
  request downloaded the whole file), a browser check that played every reel
  after each run, reels rendered every 3 hours.
- 2026-10-16: still restricted; the owner chose to move to a fresh free
  project in its own organization (see the runbook).

## Rules that keep the quota safe

1. **Visitors never stream media from Supabase.** Reels/videos come from
   GitHub Pages (`/media/reels/*`, `REELS_FEED_HOME`), product photos from the
   store CDN or `public/looks/`. No automated job downloads whole media files
   (CLAUDE.md, media storage).
2. **Public pages read the static copy first.** The shop rows a visitor needs
   (`SNAPSHOT_KEYS`) come from the copy on the site; the live cloud is read
   only by a signed-in creator, the admin, or after a failed copy read.
3. **Every scheduled job is cheap and spaced** (hourly light cron, daily
   jobs); a new job that reads the cloud says how many bytes per run.
4. Never look for loopholes in Supabase's limits (the owner asked once): it
   breaks their terms and they can close the account with all its data. The
   honest options are: wait for the reset, a paid plan, or the second free
   project in its own organization (allowed: 2 free projects per person).

## Diagnose (two minutes)

```sql
-- through the Supabase MCP execute_sql (works even while restricted)
select net.http_get('https://<ref>.supabase.co/rest/v1/kv?select=key&limit=1',
  headers => jsonb_build_object('apikey', '<anon key>'));
-- then: select status_code, left(content::text, 200) from net._http_response where id = <id>;
```

200 with the anon key = up. 402 + `exceed_*_quota` = restricted (quota).
401 = the key or the request is wrong (not a quota problem; the API is not
proven usable until a keyed read answers 200). Report a 402
as PROVIDER_LIMIT, never as a code bug, and never claim sign-up or saving
works while it says 402 (`likelink-ops` skill).

## Runbook: move to a fresh free project

Only with the owner's explicit choice (it creates a project in her account
and copies her users' records).

1. The owner creates a **new organization** (Free) in the dashboard — there is
   no tool for it. A project in the restricted org would be restricted too.
2. `create_project` in that org (eu-central-1, $0 quote).
3. SQL: `supabase/baseline/00_before_migrations.sql`, then every file in
   `supabase/migrations/` in order (apply_migration, same names). Do not add
   the baseline to `supabase/migrations/`: the GitHub integration applies that
   folder to the linked project on every push.
4. Copy data **server to server**, never through the chat: a temporary
   SECURITY DEFINER import function on the new project guarded by a one-time
   token, called by the old database with `net.http_post` in batches; then
   drop the function and compare counts and per-key md5 on both sides.
   - `kv`: all rows; references to the old project's Storage files are
     removed from `marketplace:videos` / products (the files are not copied),
     with the original kept under `migration:backup:<key>`.
   - `auth.users` + `auth.identities` (bcrypt hashes move as they are).
5. Edge Function `api`: the loader `index.ts` imports
   `edge/bundle/api.mjs` from jsDelivr pinned to a main commit
   (rebuild with `node scripts/edge/build.mjs` first), `verify_jwt: false`.
6. Secrets: `create_edge_function_secret` for each name — the owner types the
   value in the dashboard; it never passes through the chat.
7. Auth settings (owner, dashboard): Site URL `https://likelink2.vercel.app`,
   redirect URLs for the site and `/studio`.
8. Point the site: `src/constants/cloud.js` (public URL + anon key),
   `public/_redirects` (`/api/*`, feeds), then the usual deploy (Netlify
   preview permalink → Vercel route) and live checks: `/api/store?mode=status`
   200, a kv read 200, Auth settings 200.
9. Pause the old project only after the owner confirms the new one works.
