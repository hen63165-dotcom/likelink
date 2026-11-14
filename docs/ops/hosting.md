# How likelink2.vercel.app is served (free, no Netlify)

**Why:** On 2026-11-14 at about 16:36 UTC the Netlify team reached its usage limit, and every page of likelink2.vercel.app answered 503 `usage_exceeded`. The owner has no budget until the site earns ("the site must not depend on anyone"), so the main host is served from GitHub Pages. GitHub Pages is free for a public repository.

## The pieces

- **The build.** `.github/workflows/deploy-frontend.yml` builds the site twice on every deploy:
  - The mirror, base `/likelink/`, at `https://hen63165-dotcom.github.io/likelink/`. This is unchanged.
  - The main host's copy, base `/`, under `/likelink/site/`.
- **The address.** likelink2.vercel.app is a Vercel project with routes only (Vercel cannot deploy; see CLAUDE.md). The routes send:

| Path | Goes to |
|---|---|
| `/api/*` | `https://vjitiuirqfysexsxdxqx.supabase.co/functions/v1/api/*` (the Edge Function; same origin, so CORS is unchanged) |
| `/google-feed.xml`, `/discover.xml` | the same Edge Function |
| `/media/*`, `/radar/*` (board.json, kits/) | `https://hen63165-dotcom.github.io/likelink/media/*`, `/radar/*` |
| `/r` | `/likelink/site/r.html` (the static forwarder; the query string is kept) |
| `/sitemap.xml` | `/likelink/site/sitemap-static.xml` |
| app-only paths (`/studio`, `/sell`, `/admin`, `/owner`, `/search`, `/saved`, `/wish`, `/status`, `/merchants`, `/feed`, and `/discover`, `/products`, `/creators`, `/collections` sub-paths) | `/likelink/site/index.html` |
| `/likelink/*` | `https://hen63165-dotcom.github.io/likelink/*` (the mirror's own fallback page, for a path neither copy has) |
| everything else | `https://hen63165-dotcom.github.io/likelink/site/*` (pages, `/p/<id>`, `/u/<slug>`, sections, assets) |

- **Headers.** The catch-all sets `x-robots-tag` to the site's own value (`INDEX_ROBOTS`; GitHub Pages sends none). It also sets the security headers `public/_headers` gave on Netlify: Referrer-Policy, X-Content-Type-Options, X-Frame-Options and Permissions-Policy.

## Undo

The routes are versioned in Vercel: dashboard → Routing → versions, or the MCP `update_route_versions` with action `restore` on the previous version. The previous version pointed every path at a Netlify deploy permalink. It works again once Netlify's usage resets.

## Limits to know

- **GitHub Pages:** free for public repositories only. Soft limits are 100 GB of bandwidth a month and 10 builds an hour.
- **A private repository** turns Pages off. On 2026-11-14 it did, together with Actions minutes and CodeQL.
