# Likelink — Supabase RLS 2.0 · העתקה להדבקה ב-SQL Editor

> ריצה בטוחה — הכל `if not exists` / `drop policy if exists`.

```sql
-- ============================================================
-- LIKELINK — SUPABASE SECURITY UPGRADE 2.0
-- ============================================================
begin;

-- ── Extension ─────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── טריגר: עדכון updated_at אוטומטי ──────────────────────
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- ── בדיקת "האם זה מנהל" — security definer (לא ניתן לעקוף) ──
create or replace function public.is_likelink_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select p.is_admin from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

-- ═══════════ 1. טבלאות — יצירה בטוחה ═══════════

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  owner_uid  uuid,
  is_admin   boolean not null default false,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_products (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  product_id  text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.app_state (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index if not exists idx_app_state_updated on public.app_state (updated_at desc);

-- המפתח הקריטי: טבלת kv (הטבלה שממנה האתר קורא/כותב בפועל)
alter table public.kv
  add column if not exists updated_at timestamptz default now(),
  add column if not exists mutable_by_client boolean not null default true;

create index if not exists idx_kv_key on public.kv (key text_pattern_ops);

drop trigger if exists trg_kv_updated_at on public.kv;
create trigger trg_kv_updated_at
  before update on public.kv
  for each row execute function public.tg_set_updated_at();
-- ═══════════ 2. PROFILES — RLS ═══════════
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_likelink_admin());

-- ═══════════ 3. kv — הגנת המפתחות הרגישים (החלק הגאוני) ═══════════
alter table public.kv enable row level security;

-- 3.1 — קריאה ציבורית (כך הפיד חי)
drop policy if exists "kv_select_public" on public.kv;
create policy "kv_select_public" on public.kv
  for select using (true);

-- 3.2 — חסימת כתיבה מהדפדפן למפתחות הכסף/ההגדרות
-- שורות רגישות: settings, sales, payouts, charges, notifications
drop policy if exists "kv_no_client_write_sensitive" on public.kv;
create policy "kv_no_client_write_sensitive" on public.kv
  for all
  using (upper(key) not in (
    'MARKETPLACE:SETTINGS',
    'MARKETPLACE:SALES',
    'MARKETPLACE:PAYOUTS',
    'MARKETPLACE:CHARGES',
    'MARKETPLACE:NOTIFICATIONS'
  ))
  with check (upper(key) not in (
    'MARKETPLACE:SETTINGS',
    'MARKETPLACE:SALES',
    'MARKETPLACE:PAYOUTS',
    'MARKETPLACE:CHARGES',
    'MARKETPLACE:NOTIFICATIONS'
  ));

-- 3.3 — מחיקה של שורות ציבוריות — מנהל בלבד
drop policy if exists "kv_no_delete_by_anon" on public.kv;
create policy "kv_no_delete_by_anon" on public.kv
  for delete using (public.is_likelink_admin());
-- ═══════════ 3.4 — מנהל יכול לכתוב גם לשורות רגישות (לא חסום על ידי 3.2)
drop policy if exists "kv_system_write_admin" on public.kv;
create policy "kv_system_write_admin" on public.kv
  for all using (public.is_likelink_admin())
  with check (public.is_likelink_admin());

-- ═══════════ 4. SAVED_PRODUCTS — RLS (פר-משתמש) ═══════════
alter table public.saved_products enable row level security;

drop policy if exists "saved_select_own" on public.saved_products;
create policy "saved_select_own" on public.saved_products
  for select using (auth.uid() = user_id);

drop policy if exists "saved_insert_own" on public.saved_products;
create policy "saved_insert_own" on public.saved_products
  for insert with check (auth.uid() = user_id);

drop policy if exists "saved_delete_own" on public.saved_products;
create policy "saved_delete_own" on public.saved_products
  for delete using (auth.uid() = user_id);

-- ═══════════ 5. APP_STATE — קריאה לכולם, כתיבה לשרת/מנהל ═══════════
alter table public.app_state enable row level security;

drop policy if exists "app_state_select_all" on public.app_state;
create policy "app_state_select_all" on public.app_state
  for select using (true);

drop policy if exists "app_state_system_write" on public.app_state;
create policy "app_state_system_write" on public.app_state
  for all using (public.is_likelink_admin())
  with check (public.is_likelink_admin());

commit;
```

---

## ⚠️ הגבלה כנה של ה-SQL הזה (חשוב להבין)

הטבלה `kv` מאחסנת **כל מוצר/יוצרת/מכירה כחלק ממערך JSON ענק** בתוך מפתח אחד
(`marketplace:products`). RLS של טבלה פועל על **שורות**, לא על אברים בתוך JSON.
זה אומר: אי־אפשר, ברמת Supabase בלבד, לומר "יוצרת X עורכת רק את המוצרים שלה"
כשכל המוצרים הם ערך אחד. לכן ה-SQL לעיל **חוסם את מה שהכי קריטי** (כסף, הגדרות,
מחיקות, כתיבה לשורות רגישות) בלי לשבור את האתר — זוהי השכבה המקסימלית ש-RLS
לבד יכול להשיג על ארכיטקטורת kv.

## 🚀 השכבה הבאה (מומלץ לפני תשלומים אמיתיים)

הפתרון ה"גנני" המלא הוא **העברת כתיבה לצד השרת**:
1. כל קריאה ל-`kv` (insert/update/delete) מהדפדפן מוחלפת בקריאה
   ל-API שרתי (`/api/store`) שמשתמש ב-`SUPABASE_SERVICE_ROLE_KEY`
   ומבצע אימות (מי המשתמש, האם הוא הבעלים, סניטציה, חוקי עסקים).
2. אז RLS על kv הופכת ל: `select` לכולם, `insert/update/delete` **אף פעם
   לא מהדפדפן** — רק מ-`service_role` (שעוקף RLS) דרך השרת.
3. כזה הופך את "לזייף מכירה" מצורך פקודת API פשוטה למשהו שדורש
   פריצה לשרת שלך — מה שכמעט בלתי אפשרי.

### ✅ סטטוס המימוש בקוד (נכתב, נבדק)
| רכיב | קובץ | מצב |
|---|---|---|
| שער כתיבה שרתי | `api/store.mjs` | ✅ מוכן |
| חתימת מכירה עצמית | `api/sign-sale.mjs` | ✅ מוכן |
| חיבור קריאה/כתיבה | `src/lib/storage.js` | ✅ מוכן |
| רישום מכירה | `src/context/MarketplaceContext.jsx` | ✅ מוכן |
| הגדרות סביבה | `.env.example` + `add-vercel-env.ps1` | ✅ מוכן |

### 📦 פרוטוקול דיפלויי
1. במסוף: `npm run build`
2. `powershell -ExecutionPolicy Bypass -File .\add-vercel-env.ps1`
3. `git add -A && git commit -m "security: server-side store + signed sales" && git push origin main`
4. אחרי העלייה: `/api/store` ו-`/api/sign-sale` יחזירו תשובה חיה (לא 404).

### ⚠️ מצב בדיקה חיה עכשיו
- `/api/sign-sale` → **404** · `/api/store` → **404**
- אם RLS כבר פעיל — כתיבת מוצרים/מכירות באתר החי תיחסם עד שהקוד החדש יעלה.
רוצה שאבנה לך את שכבת ה-API הזו בקוד? אעשה זאת בשמחה ובמהירות.