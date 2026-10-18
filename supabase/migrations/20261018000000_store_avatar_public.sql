-- A creator's store photo is public, like approved product media.
--
-- 2026-10-17: the owner uploaded her store photo (Studio → "עיצוב החנות שלי")
-- to products/<studio>/<file>; visitors got 404, because media_is_public only
-- opened files an approved product of that studio references. The store
-- photo is shown on the public creator page, so a file the studio's PUBLIC
-- row (marketplace:marketers, no personal data) references is public too —
-- only under that studio's own folder, only in the same three-part paths.
-- Additive: create or replace of one function; no policy, grant or kv change.

create or replace function likelink_private.media_is_public(obj text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare parts text[] := string_to_array(coalesce(obj, ''), '/');
        products jsonb;
        marketers jsonb;
begin
  if coalesce(array_length(parts, 1), 0) <> 3 or parts[1] not in ('products', 'reels', 'ugc') then return false; end if;
  products := likelink_private.kv_json('marketplace:products');
  if jsonb_typeof(products) = 'array' then
    if parts[1] = 'ugc' then
      return exists (select 1 from jsonb_array_elements(products) p where p ->> 'id' = parts[2] and p ->> 'status' = 'approved');
    end if;
    if exists (
      select 1 from jsonb_array_elements(products) p
      where p ->> 'status' = 'approved' and p ->> 'marketerId' = parts[2] and position(obj in p::text) > 0
    ) then return true; end if;
  end if;
  if parts[1] <> 'products' then return false; end if;
  marketers := likelink_private.kv_json('marketplace:marketers');
  if jsonb_typeof(marketers) <> 'array' then return false; end if;
  return exists (
    select 1 from jsonb_array_elements(marketers) m
    where m ->> 'id' = parts[2]
      and position(obj in concat_ws(' ', m ->> 'avatar', m ->> 'avatarUrl', m ->> 'photo', m ->> 'image')) > 0
  );
end $$;
revoke all on function likelink_private.media_is_public(text) from public;
grant execute on function likelink_private.media_is_public(text) to anon, authenticated;
