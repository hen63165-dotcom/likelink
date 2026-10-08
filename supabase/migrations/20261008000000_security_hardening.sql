-- LikeLink Cloud Core security hardening
-- Applied to production on 2026-10-08 and kept here as the source-of-truth migration.
begin;
revoke execute on function public.is_likelink_admin() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
alter function public.tg_set_updated_at() set search_path = public;
commit;
