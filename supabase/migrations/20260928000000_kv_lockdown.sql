-- ============================================================================
-- LikeLink2 — kv lockdown  (prepared 2026-09-28 — NOT APPLIED)
-- ----------------------------------------------------------------------------
-- Apply ONLY after the owner explicitly approves it (Supabase SQL editor or
-- `supabase db push`). It changes access policies only — no data is modified.
--
-- WHY (checked read-only against production on 2026-09-28):
--   public.kv has PERMISSIVE policies "public read" / "public insert" /
--   "public update" (USING/CHECK true) for every role, including anon. The
--   public anon key ships in the site bundle, so anyone can:
--     • INSERT/UPDATE any kv row directly over Supabase REST — bypassing every
--       ownership/merge rule in /api/store (api/_utils/storeWritePolicy.mjs);
--     • READ every row — including marketplace:autopilot (creators' channel
--       tokens), marketplace:vapid (push private key), marketplace:pushsubs,
--       checkout:order:* (buyer e-mails), audit/cron/growth internals.
--   "kv_no_client_write_sensitive" is PERMISSIVE, so it restricts nothing.
--   Only finance:* / intelligence:* / marketplace:subscriptions are protected
--   (RESTRICTIVE policies from earlier migrations — kept as they are).
--
-- AFTER THIS MIGRATION:
--   • No client (anon / authenticated) can write kv at all. The site never
--     writes kv directly: src/lib/storage.js sends every shared write to
--     /api/store, which uses the service role (bypasses RLS) and enforces the
--     owner-scoped merge. Admin (is_likelink_admin()) policies are kept.
--   • Clients can SELECT only the keys the public site reads
--     (src/context/MarketplaceContext.jsx, VideoContext.jsx, lib/referral.js).
--     Everything else is server-only.
--
-- KNOWN REMAINING EXPOSURE (needs an app change, not RLS): the allowlisted
-- marketplace:marketers and marketplace:payouts rows are still readable and
-- contain creators' e-mails / payout details. RLS is row-level, so hiding
-- fields requires serving sanitized copies from the API instead.
--
-- VERIFY after applying (as anon, e.g. with the site's anon key):
--   select key from kv where key = 'marketplace:vapid';        -- 0 rows
--   select key from kv where key = 'marketplace:products';     -- 1 row
--   insert into kv(key, value) values ('x','1');               -- denied
--
-- ROLLBACK (restores today's behaviour — not recommended):
--   create policy "public read"   on public.kv for select using (true);
--   create policy "public insert" on public.kv for insert with check (true);
--   create policy "public update" on public.kv for update using (true);
-- ============================================================================

begin;

-- 1) No direct client writes to kv.
drop policy if exists "public insert" on public.kv;
drop policy if exists "public update" on public.kv;
drop policy if exists "kv_no_client_write_sensitive" on public.kv;

-- 2) Client reads limited to the public keys the site actually loads.
drop policy if exists "public read" on public.kv;
drop policy if exists "kv_select_public" on public.kv;
create policy "kv_select_public_allowlist"
  on public.kv
  for select
  to anon, authenticated
  using (
    lower(key) in (
      'marketplace:marketers',
      'marketplace:products',
      'marketplace:clicks',
      'marketplace:sales',
      'marketplace:settings',
      'marketplace:collections',
      'marketplace:payouts',
      'marketplace:charges',
      'marketplace:notifications',
      'marketplace:videos',
      'marketplace:referral_clicks'
    )
  );

-- 3) Legacy demo table: stop anonymous writes (the app does not use it).
drop policy if exists "demo public updates app state" on public.app_state;
drop policy if exists "demo public writes app state" on public.app_state;

commit;
