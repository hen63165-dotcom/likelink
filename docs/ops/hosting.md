# How likelink2.vercel.app is served (free, no Netlify)

**Why it changed:** On 2026-11-14 at about 16:36 UTC the Netlify team reached its usage limit. Every page of likelink2.vercel.app answered 503 `usage_exceeded`, because the address was a Vercel route that proxied every path to a Netlify deploy permalink.

The owner has no budget until the site earns ("the site must not depend on anyone"). Vercel's own build of `main` was READY again, at the same commit (2c3a215), so the catch-all to Netlify was removed. Vercel now serves its own build. It is free on the Hobby plan.

## The pieces

**The build.** Vercel builds every push to `main`:
- `vercel.json`: `npm run build` → `dist/`, with `cleanUrls`.
- `postbuild` prerenders `p/<id>.html`, `u/<slug>.html` and the section pages, and writes `/version.json` with `host: "vercel"`.

**The routes.** The project routes (dashboard → Routing, version `401e1d2c-ab0f-4cf8-b103-89f50920aa2f`, promoted 2026-11-14 at about 20:02 UTC) add only what the static build does not have:

| Path | Goes to | Why |
|---|---|---|
| `/api/*` | `https://vjitiuirqfysexsxdxqx.supabase.co/functions/v1/api/*` | The API is the Edge Function, as it was through Netlify. Same origin, so CORS is unchanged. |
| `/google-feed.xml`, `/discover.xml` | the same Edge Function | The feeds. |
| `/media/*` | `https://hen63165-dotcom.github.io/likelink/media/*` | The reels feed, videos and covers. The app plays them from the address that answered the feed (`src/lib/reelsFeed.js`), so on the main host they come through this route. |
| `/radar/board.json`, `/radar/kits/*` | `https://hen63165-dotcom.github.io/likelink/radar/*` | The radar board and the kits page (noindex). |
| `/sitemap.xml` | `/sitemap-static.xml` | The build's own sitemap, as on Netlify. |

**Paths with no route:**
- `/r`, `/p/<id>` and `/u/<slug>` are the prerendered files (`cleanUrls`).
- A product without a file falls through to `vercel.json`'s rewrite (`/api/og?id=`), then to the SPA.

**Headers:**
- `vercel.json` sends the security headers.
- Production sends no `x-robots-tag`. Vercel adds `noindex` only to preview and alias URLs.

## Checked live on 2026-11-14

All of these answered 200 on likelink2.vercel.app:
- `/version.json`: commit 2c3a215, host vercel.
- `/robots.txt`.
- `/p/p-live-04`: the product head, no `x-robots-tag`.
- `/api/store?mode=magic&u=…`: the Edge Function's answer.
- `/media/reels/ring-size-a-cover.jpg`: `image/jpeg`.
- After GitHub Pages came back (about 20:02 UTC): `/media/reels/index.json` and `/radar/board.json` (72 concepts) answered 200 from GitHub Pages.

On the routes' alias, before the promote, these also answered 200: `/`, `/radar`, `/u/alyostyle`, `/r?pid=p-live-04` (the static forwarder), `/sitemap.xml`, `/media/reels/index.json` and `/radar/board.json`.

## GitHub Pages

**Off from about 16:50 to 20:00 UTC on 2026-11-14.** The repository was private for about two hours, and that turned Pages off. Making the repository public again did not turn it back on. The API paths for Pages are not reachable from the agent's container.

The owner turned it back on in Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)` → Save.

**While Pages is off,** point `/media/*` and `/radar/board.json` at the `gh-pages` branch through jsDelivr: `https://cdn.jsdelivr.net/gh/hen63165-dotcom/likelink@gh-pages/<path>`.
- Free, with byte ranges.
- About 12 h of branch cache.
- At most 20 MB per file.
- It serves HTML as text, so the kits page stays unavailable.

That route version is `289d28e0-67af-4252-80e1-3e79c9f0e524`.

## Undo

The routes are versioned in Vercel: dashboard → Routing → versions, or the MCP `update_route_versions` with `restore`.
- `923ea429-07e3-48fa-939e-aa03cd2c0520` is the Netlify catch-all. It works again only once Netlify's usage resets.

## Limits to know

- **Vercel Hobby:**
  - The terms restrict commercial use.
  - At most 12 serverless functions (see CLAUDE.md).
  - The build stays free while it fits the Hobby quotas.
- **jsDelivr (the fallback):** free for files in public GitHub repositories, at most 20 MB per file. The largest file under `media/` is about 17 MB.
- **Bandwidth:** videos on the main host pass through the Vercel route. They count toward Vercel Hobby's monthly data transfer.
- **GitHub Pages:** free for public repositories only. Soft limits are 100 GB of bandwidth a month and 10 builds an hour. A private repository turns Pages off, together with the free Actions minutes and CodeQL.
- **A long-term free host with no commercial-use limit:** Cloudflare Pages needs the owner's own account. `edge/pagesProxy.mjs` already exists for it.
