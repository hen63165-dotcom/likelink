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

## Google Merchant Center product feed

Likelink ships a ready-to-upload **RSS 2.0** product feed
(`google-feed.xml`) that uses Google's Shopping namespace (`xmlns:g`) with
`g:id`, `g:title`, `g:description`, `g:link`, `g:image_link`, `g:price`,
`g:availability`, `g:brand` (plus `g:condition` and `g:product_type`) — the
exact attributes Google Merchant Center requires, with no crawlable-validation
errors. Only **approved** products with a title and image are emitted.

There are three ways to get the feed:

### 1. Dedicated endpoint (recommended for scheduled updates)

Once deployed, hit:

```
https://<your-domain>/api/google-feed
```

Vercel turns `api/google-feed.mjs` into a serverless function; Netlify uses
`netlify/functions/google-feed.js`. Both read the live product/marketer feed
straight from the Supabase `kv` table and return the XML with
`Content-Type: application/xml` and `Content-Disposition: attachment`,
so you can paste the URL into Google Merchant Center as a **Scheduled fetch**.

Required env vars (the same ones the app uses):

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Optional overrides:

```
LIKELINK_BASE_URL  (g:link origin, default https://www.likelink.com)
LIKELINK_CURRENCY  (default ILS)
LIKELINK_BRAND     (default Likelink)
```

Add them in Vercel → Settings → Environment Variables (and re-deploy), or
Netlify → Site settings → Environment variables.

### 2. One click from the admin panel

Open the app, unlock the **Admin** tab, and click **"Download google-feed.xml"**
on the "Google Merchant Feed" card in the Overview section. This builds the
exact same XML from the live in-app data and downloads it straight away.

### 3. Locally with the CLI

```bash
# From Supabase (needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env)
npm run feed:google

# …or from a JSON export: { "marketers": [], "products": [...] }
npm run feed:google -- --input feed-input/products.json --base https://www.likelink.com
```

The output path defaults to `./google-feed.xml` — override with `--output`.

### Where does each feed value come from?

| Feed field | Source (Likelink product) |
| --- | --- |
| `g:id` | `product.id` |
| `g:title` | `product.title` |
| `g:description` | `product.description` |
| `g:link` | `https://www.likelink.com/?product=<id>` (deep-links to the product in the app) |
| `g:image_link` | `product.image` (absolute http(s) URL only) |
| `g:price` | `product.price` formatted as `<amount> ILS`, e.g. `249.00 ILS` |
| `g:availability` | `in stock` when `status === "approved"`, else `out of stock` |
| `g:brand` | `Likelink` (override with `LIKELINK_BRAND`) |
| `g:condition` | `new` |
| `g:product_type` | `product.category > <creator name>` |

A sample generated feed is committed at `google-feed.xml` (built from the seed
products in `feed-input/products.json`) so you can validate the structure before
pointing Merchant Center at your live endpoint.

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
- **Admin access** is verified server-side via `POST /api/admin/auth` — the
  code lives only in the `ADMIN_CODE` env var (never with a `VITE_` prefix,
  which would ship it to browsers) and returns an HMAC-signed 8-hour token.
