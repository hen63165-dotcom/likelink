-- ============================================================
-- 2026-10-16 · profiles: nobody makes themselves an admin.
--
-- Found while reviewing the baseline for the cloud move (PR #111):
--   • The INSERT policies on public.profiles only check the row's id
--     ("own profile insert", "profile can be created by owner",
--     profiles_insert_own), so a signed-in user could create their own row
--     with is_admin = true.
--   • 20260906000000_cloud_identity's REVOKE UPDATE (is_admin) has no effect
--     while the table-level UPDATE grant exists (Postgres consults column
--     privileges only when the table privilege is missing), and the
--     permissive "profile can be edited by owner" policy accepts the change.
-- is_likelink_admin() reads that flag, and kv_system_write_admin lets an
-- admin's browser write ANY kv key (money, payouts, settings) past the
-- server's write policy. The cloud answers 402 today, so this could not be
-- used from outside right now; it would reopen with the cloud.
--
-- The fix: a trigger that refuses an is_admin change from the API roles
-- (anon, authenticated) whatever the grants or policies say, and the
-- policies say the same. The owner still sets admins from the dashboard /
-- SQL / service role. Idempotent.
-- ============================================================

create or replace function public.tg_profiles_admin_guard()
 returns trigger
 language plpgsql
 set search_path = public
as $function$
begin
  -- SECURITY INVOKER on purpose: current_user is the caller's API role.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and coalesce(new.is_admin, false) then
      raise exception 'is_admin is set by the site owner only' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin is set by the site owner only' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.tg_profiles_admin_guard() from public, anon, authenticated;

drop trigger if exists trg_profiles_admin_guard on public.profiles;
create trigger trg_profiles_admin_guard
  before insert or update on public.profiles
  for each row execute function public.tg_profiles_admin_guard();

-- One insert policy and one self-update policy, both refusing is_admin.
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "profile can be created by owner" on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert
  with check ((auth.uid() = id) and (not is_admin));

drop policy if exists "own profile update" on public.profiles;
drop policy if exists "profile can be edited by owner" on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (auth.uid() = id)
  with check ((auth.uid() = id) and (not is_admin));
