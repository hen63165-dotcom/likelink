-- Restore EXECUTE on is_likelink_admin() for anon/authenticated.
--
-- 20261008000000_security_hardening revoked it, but the kv / app_state /
-- profiles / storage RLS policies call this function, so every anonymous
-- read of kv failed with "permission denied for function is_likelink_admin"
-- and the public site loaded no products. The function only returns the
-- caller's own profiles.is_admin flag (false for anon), so EXECUTE reveals
-- nothing. Applied in production on 2026-10-08 (owner-approved); kept here as
-- the source of truth. rls_auto_enable() stays revoked (event trigger only).
grant execute on function public.is_likelink_admin() to anon, authenticated;
