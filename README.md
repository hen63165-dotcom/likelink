# Likelink

A mobile-first marketplace where independent creators post affiliate links and
shoppers browse one clean, algorithm-free feed. Built with React + Vite + Tailwind.

## Run it locally

```bash
npm install
npm run dev
```

Open the printed `localhost` URL — resize your browser to a phone width, or
open it on your phone via your computer's local IP, to test the mobile UI.

## Deploy to Vercel (get a public URL)

1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Social-Commerce Hub"
   git branch -M main
   git remote add origin https://github.com/<you>/social-commerce-hub.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import that repo.
3. Vercel auto-detects Vite. Leave the defaults:
   - Build command: `vite build` (or `npm run build`)
   - Output directory: `dist`
4. Click **Deploy**. In under a minute you'll get a public URL like
   `social-commerce-hub.vercel.app` — open it on your phone to test.

Every push to `main` auto-redeploys.

## Backend: Supabase (shared, live feed across every visitor)

This project is already wired up to use Supabase for all shared marketplace
data (marketers, products, clicks, sales, platform settings) — you just need
to create the free project and drop in two credentials.

### 1. Create the project

Go to [supabase.com](https://supabase.com) → **New project** (free tier is fine).

### 2. Create the table

In the Supabase dashboard, open **SQL Editor** → **New query**, paste this, and run it:

```sql
create table kv (
  key text primary key,
  value text not null,
  shared boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table kv enable row level security;

-- Demo-friendly policies: anyone with the public anon key can read/write.
-- See the security note below before handling real money.
create policy "public read"   on kv for select using (true);
create policy "public insert" on kv for insert with check (true);
create policy "public update" on kv for update using (true);
```

### 3. Get your credentials

In the Supabase dashboard: **Settings → API**. Copy the **Project URL** and
the **anon public** key.

### 4. Configure the app locally

```bash
cp .env.example .env
```

Paste your Project URL and anon key into `.env`. Then:

```bash
npm install
npm run dev
```

Open the app, post a listing from one browser tab, and refresh a second tab —
it should show up. That confirms Supabase is live.

### 5. Configure it on Vercel

In your Vercel project: **Settings → Environment Variables**, add the same
two variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), then redeploy
(or trigger a new deploy by pushing to `main`). Your live URL is now a real,
shared marketplace — any phone that opens it sees the same feed.

### 6. One more table for real photo uploads

The app now lets creators upload a photo directly from their phone instead of
only pasting an image URL. For those photos to be visible to every visitor
(not just the device that uploaded them), run this once in the same **SQL
Editor**:

```sql
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "public read images" on storage.objects;
drop policy if exists "public upload images" on storage.objects;

create policy "public read images" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "public upload images" on storage.objects
  for insert with check (bucket_id = 'product-images');
```

Until this is run, uploaded photos still work, but only on the uploader's own
device (same local fallback behavior as the `kv` table).

## New in this version

- **Creator pages** — every creator gets a shareable link at `/u/<their-slug>`
- **Follow + Favorites** — shoppers can follow creators and save products, stored per-device
- **Collections** — creators can group their products into themed collections, shown on their page
- **Earnings charts** — 14-day trend in the creator studio and the admin panel
- **Installable app (PWA)** — visitors can "Add to Home Screen" from their browser; works today, no extra setup
- **Native app project (Capacitor)** — see "Native app store submission" below
- **Pretty link previews (Open Graph)** — see below; requires a different deploy method than drag-and-drop

## Native app store submission (Android / iOS)

This project includes a Capacitor-wrapped native app (`android/` and `ios/`
folders) — the actual project files Google Play and the Apple App Store
require. What's already done: app name, bundle ID (`com.socialcommercehub.app`),
and generated icons/splash screens for both platforms.

**What you still need to do — these are Apple/Google requirements, not
something any tool can skip:**

### Android
1. Install [Android Studio](https://developer.android.com/studio) on your computer.
2. Open the `android/` folder in Android Studio (File → Open).
3. Let it sync (first time takes a few minutes).
4. Build → Generate Signed Bundle/APK, following Android Studio's prompts to create a signing key (keep it safe — you'll need it for every future update).
5. Create a [Google Play Console](https://play.google.com/console) account (~$25 one-time), create a new app listing, and upload the signed `.aab` file.

### iOS
1. Requires a **Mac** with [Xcode](https://developer.apple.com/xcode/) installed — there's no way around this, it's an Apple requirement.
2. Open `ios/App/App.xcworkspace` in Xcode.
3. Create an [Apple Developer](https://developer.apple.com/programs/) account (~$99/year).
4. In Xcode: set your Team (your developer account), then Product → Archive, then follow the prompts to upload to App Store Connect.
5. Fill out the listing in [App Store Connect](https://appstoreconnect.apple.com) and submit for review.

Both stores review submissions before they go live (Apple: usually 1–3 days, Google: a few hours to a couple of days).

**Keeping the app in sync with future web updates:** after any code change, run:
```bash
npm run build
npx cap sync
```
This copies your latest web build into both native projects before you rebuild in Android Studio / Xcode.

## Pretty link previews (Open Graph)

By default, sharing a creator's link (`/u/maya`) on WhatsApp shows a generic
preview. `netlify/edge-functions/creator-og.js` fixes this — it detects when
WhatsApp/Facebook/Twitter/etc. are generating a preview and serves a proper
title + image, while real visitors still get the normal app.

**Important:** Netlify Edge Functions are not included in a plain
drag-and-drop deploy to Netlify Drop — that method only understands static
files. To use this feature, switch to one of:
- **Netlify CLI**: `npm install -g netlify-cli`, then `netlify login` and `netlify deploy --prod` from the project folder (this uploads functions too).
- **Git-connected deploy**: push this project to GitHub and connect the repo in Netlify (Site settings → Build & deploy) instead of dragging a folder.

Either way, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **Site settings → Environment variables** so the function can look up creator names.

### Security note (read before real users touch it)

The RLS policies above allow **anyone holding the public anon key** (which is
visible in your deployed site's JS bundle — this is normal for anon keys, but
worth understanding) to read *and write* every row in `kv`. That's fine for a
demo or a closed pilot with people you trust, but it means:

- Anyone could technically overwrite the platform fee, forge a "sale," or
  wipe listings via direct API calls — not just through the app's UI.
- There's no real user authentication yet — "creator studios" are just a name
  + email, and the admin passcode is a hardcoded string in the source.

Before this handles real creators, real shoppers, or real money, the next
step is adding **Supabase Auth** (email/password or magic link) and rewriting
the RLS policies to be scoped per-user (e.g. a creator can only update their
own products, only the admin's user ID can change the platform fee). Happy to
build that next if you want to keep going.

## What's simulated vs. real

- **Click tracking** is real — every "Get This Deal" tap is logged before the
  affiliate link opens.
- **Sale/commission confirmation** is currently self-reported by the creator
  ("Log a sale"). No affiliate network (AliExpress, Amazon, etc.) will notify
  your app automatically without integrating their conversion/postback API —
  that's a bigger follow-up project once you've validated the concept.
- **Admin access** uses a plain client-side passcode (`hub-admin`) — fine for
  a demo, not for production. Swap in real auth (Supabase Auth, Clerk, etc.)
  before this handles real money.
