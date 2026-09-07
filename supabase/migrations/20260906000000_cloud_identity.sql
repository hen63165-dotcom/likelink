-- ============================================================
-- LIKE LINK CLOUD CORE — PHASE 1: CLOUD IDENTITY & OWNERSHIP
-- ADDITIVE + IDEMPOTENT. No data is modified, updated or deleted.
-- Run ONCE in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Existing marketer IDs, slugs, URLs and KV data are untouched.
-- ============================================================

-- ─── 1) Identity link: profiles.id (= auth.uid) → LikeLink studio ──────────
-- marketer_id holds the existing LikeLink marketer id (kv marketplace:marketers).
-- The column is NULLable: existing creators link later via the verified
-- server-side flow (POST /api/identity). No rows are inserted here.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketer_id text;

-- Uniqueness: one studio can be claimed by at most ONE auth user.
-- Partial index → any number of NULLs is allowed (unlinked users stay valid).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_marketer_id_uidx
  ON public.profiles (marketer_id)
  WHERE marketer_id IS NOT NULL;

-- ─── 2) RLS on profiles (CONDITIONAL — never breaks an existing setup) ─────
-- If RLS is already enabled or any policy exists, this block does NOTHING.
-- If RLS is off AND no policies exist, it enables RLS with self-row-only
-- policies so enabling it can never lock out existing reads/writes.
DO $$
DECLARE
  rls_enabled  boolean;
  policy_count int;
BEGIN
  SELECT c.relrowsecurity INTO rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'profiles';

  IF rls_enabled IS NULL THEN
    RAISE NOTICE 'SKIP: profiles table not found — create it first (see NEXT_STEPS.md)';
    RETURN;
  END IF;

  SELECT count(*) INTO policy_count
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'profiles';

  IF NOT rls_enabled AND policy_count = 0 THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    CREATE POLICY profiles_select_own ON public.profiles
      FOR SELECT TO authenticated
      USING (id = auth.uid());

    CREATE POLICY profiles_insert_own ON public.profiles
      FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());

    CREATE POLICY profiles_update_own ON public.profiles
      FOR UPDATE TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());

    RAISE NOTICE 'RLS enabled on profiles with self-row-only policies';
  ELSE
    RAISE NOTICE 'SKIP: RLS already enabled or policies exist — nothing changed';
  END IF;
END $$;

-- ─── 3) Anti self-promotion guard ───────────────────────────────────────────
-- A normal authenticated user must never be able to make themselves admin by
-- updating their own profiles row. Column-level UPDATE on is_admin is removed
-- for the authenticated role; admin role changes stay server/service-role only.
-- (INSERT of a fresh row with is_admin=false at signup is unaffected.)
REVOKE UPDATE ( is_admin ) ON public.profiles FROM authenticated;

-- ─── 4) Deliberately NOT included in this phase ─────────────────────────────
-- RLS for products / sales / click_events / saved_products: the application
-- does not write those relational tables yet (kv compatibility layer is still
-- authoritative), and their live column layout must be verified first.
-- They will be hardened in the next phase, before the app starts writing them.

-- ─── Verification queries (read-only, for the owner to run afterwards) ──────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='profiles' AND column_name='marketer_id';
-- SELECT c.relrowsecurity AS rls_enabled FROM pg_class c
--  JOIN pg_namespace n ON n.oid=c.relnamespace
--  WHERE n.nspname='public' AND c.relname='profiles';
