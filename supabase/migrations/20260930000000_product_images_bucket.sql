-- ============================================================================
-- LikeLink2 — private `product-images` bucket + explicit storage policies
-- ----------------------------------------------------------------------------
-- ADDITIVE ONLY. Does not touch public.kv, kv_select_public_allowlist, the
-- 11-key allowlist or any existing restrictive policy.
--
-- Mirrors the kv lockdown model:
--   • the bucket is PRIVATE — nothing is served from Supabase's public URL;
--     the site reads through /api/og?mode=media, which asks Storage with the
--     anon key, so these policies are the only gate;
--   • PUBLIC READ only for already-approved product media:
--       products/<marketerId>/<file>, reels/<marketerId>/<file>
--         → an APPROVED product of that creator references the object
--       ugc/<productId>/<file> → that product is APPROVED
--   • WRITE only by the owning creator (their verified auth e-mail matches
--     the creator's private record) into products/ or reels/ of their own
--     studio, image/video extensions only — or by an admin;
--     ugc/ and health/ are written by the server (service role) only.
--
-- Helper functions live in schema likelink_private (not exposed by the REST
-- API). Only boolean answers are callable by anon/authenticated; the kv
-- reader itself is not.
--
-- VERIFY after applying:
--   select public from storage.buckets where id = 'product-images';        -- false
--   select policyname from pg_policies where schemaname = 'storage'
--     and tablename = 'objects' and policyname like 'likelink_media_%';     -- 5 rows
-- ============================================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml','video/mp4','video/webm']
)
on conflict (id) do nothing;

create schema if not exists likelink_private;
revoke all on schema likelink_private from public;
grant usage on schema likelink_private to anon, authenticated, service_role;

-- kv row as jsonb (tolerates legacy double-encoded JSON). NOT callable by clients.
create or replace function likelink_private.kv_json(k text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v text; j jsonb;
begin
  select value into v from public.kv where key = k;
  if v is null then return null; end if;
  begin j := v::jsonb; exception when others then return null; end;
  while jsonb_typeof(j) = 'string' loop
    begin j := (j #>> '{}')::jsonb; exception when others then exit; end;
  end loop;
  return j;
end $$;
revoke all on function likelink_private.kv_json(text) from public, anon, authenticated;

-- Does the caller's verified auth e-mail own this studio? (private record,
-- plus the legacy public copy until the creators row is split)
create or replace function likelink_private.owns_marketer(mid text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', ''));
        priv jsonb; pub jsonb;
begin
  if em = '' or coalesce(mid, '') = '' then return false; end if;
  priv := likelink_private.kv_json('marketplace:marketers:private');
  if jsonb_typeof(priv) = 'object' and lower(coalesce(priv -> mid ->> 'email', '')) = em then return true; end if;
  pub := likelink_private.kv_json('marketplace:marketers');
  if jsonb_typeof(pub) = 'array' then
    return exists (select 1 from jsonb_array_elements(pub) m where m ->> 'id' = mid and lower(coalesce(m ->> 'email', '')) = em);
  end if;
  return false;
end $$;
revoke all on function likelink_private.owns_marketer(text) from public;
grant execute on function likelink_private.owns_marketer(text) to anon, authenticated;

-- Is this object approved product media?
create or replace function likelink_private.media_is_public(obj text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare parts text[] := string_to_array(coalesce(obj, ''), '/');
        products jsonb;
begin
  if coalesce(array_length(parts, 1), 0) <> 3 or parts[1] not in ('products', 'reels', 'ugc') then return false; end if;
  products := likelink_private.kv_json('marketplace:products');
  if jsonb_typeof(products) <> 'array' then return false; end if;
  if parts[1] = 'ugc' then
    return exists (select 1 from jsonb_array_elements(products) p where p ->> 'id' = parts[2] and p ->> 'status' = 'approved');
  end if;
  return exists (
    select 1 from jsonb_array_elements(products) p
    where p ->> 'status' = 'approved' and p ->> 'marketerId' = parts[2] and position(obj in p::text) > 0
  );
end $$;
revoke all on function likelink_private.media_is_public(text) from public;
grant execute on function likelink_private.media_is_public(text) to anon, authenticated;

-- Policies (explicit; nothing is inherited from a "public" bucket flag).
create policy "likelink_media_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images' and likelink_private.media_is_public(name));

create policy "likelink_media_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in ('products', 'reels')
    and likelink_private.owns_marketer((storage.foldername(name))[2])
  );

create policy "likelink_media_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in ('products', 'reels')
    and array_length(storage.foldername(name), 1) = 2
    and likelink_private.owns_marketer((storage.foldername(name))[2])
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'mp4', 'webm')
  );

create policy "likelink_media_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in ('products', 'reels')
    and likelink_private.owns_marketer((storage.foldername(name))[2])
  );

create policy "likelink_media_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-images' and public.is_likelink_admin())
  with check (bucket_id = 'product-images' and public.is_likelink_admin());

-- Server-side proof for the Luna system check (service role only).
create or replace function public.likelink_media_policy_status()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'bucket_exists', exists (select 1 from storage.buckets where id = 'product-images'),
    'bucket_public', coalesce((select public from storage.buckets where id = 'product-images'), null),
    'policies', coalesce((select jsonb_agg(policyname order by policyname) from pg_policies
                          where schemaname = 'storage' and tablename = 'objects' and policyname like 'likelink_media_%'), '[]'::jsonb)
  );
$$;
revoke all on function public.likelink_media_policy_status() from public, anon, authenticated;
grant execute on function public.likelink_media_policy_status() to service_role;

commit;
