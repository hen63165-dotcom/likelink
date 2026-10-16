-- LikeLink2 — what a NEW Supabase project needs before supabase/migrations/.
--
-- The production project (2026-07-31) got its kv/profiles/app_state tables,
-- helper functions and first policies from the dashboard, before migrations
-- existed. A new project (the move off the restricted project, 2026-10-16)
-- runs this file once, then every file in supabase/migrations/ in order.
--
-- Deliberately OUTSIDE supabase/migrations/: the Supabase GitHub integration
-- applies that folder to production on every push to main, and production
-- already has all of this. Every statement is idempotent anyway.
--
-- Copied from production's catalog (pg_get_functiondef / pg_policies /
-- information_schema) on 2026-10-16. The empty legacy tables (products,
-- click_events, sales, saved_products) are not used by the code and are not
-- recreated.

-- ---------- tables ----------
create table if not exists public.kv (
  key text primary key,
  value text not null,
  shared boolean not null default true,
  updated_at timestamptz not null default now(),
  mutable_by_client boolean not null default true
);
create index if not exists idx_kv_key on public.kv using btree (key text_pattern_ops);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'seller',
  created_at timestamptz not null default now(),
  is_admin boolean not null default false
);

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.kv enable row level security;
alter table public.profiles enable row level security;
alter table public.app_state enable row level security;

-- ---------- functions ----------
create or replace function public.tg_set_updated_at()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end; $function$;

drop trigger if exists trg_kv_updated_at on public.kv;
create trigger trg_kv_updated_at before update on public.kv
  for each row execute function public.tg_set_updated_at();

create or replace function public.is_likelink_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select p.is_admin from public.profiles p
    where p.id = auth.uid()
  ), false);
$function$;

-- New tables in public get RLS on by themselves (production's event trigger).
create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
    if cmd.schema_name is not null and cmd.schema_name in ('public') then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$function$;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();
  end if;
end $$;

-- ---------- policies production had before the migrations ----------
-- (profiles insert already refuses is_admin here; 20261016000000_profiles_no_self_admin
-- adds the trigger that guards it whatever the grants say.)
drop policy if exists kv_system_write_admin on public.kv;
create policy kv_system_write_admin on public.kv for all
  using (public.is_likelink_admin()) with check (public.is_likelink_admin());
drop policy if exists kv_no_delete_by_anon on public.kv;
create policy kv_no_delete_by_anon on public.kv for delete
  using (public.is_likelink_admin());

drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles for select using (true);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check ((auth.uid() = id) and (not is_admin));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check ((auth.uid() = id) and (not is_admin));
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles for delete using (auth.uid() = id);
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update using (public.is_likelink_admin());

drop policy if exists app_state_select_all on public.app_state;
create policy app_state_select_all on public.app_state for select using (true);
drop policy if exists app_state_system_write on public.app_state;
create policy app_state_system_write on public.app_state for all
  using (public.is_likelink_admin()) with check (public.is_likelink_admin());
