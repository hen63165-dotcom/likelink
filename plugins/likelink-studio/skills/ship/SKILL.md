---
name: ship
description: Put LikeLink2's tested work live — tests and build, a pull request, CI, merge, then point likelink2.vercel.app at the new Netlify build (keeping the index robots header) and verify the live revision and pages. Use for "תעלה לאתר", "שיהיה באוויר", "deploy", "ship it", or after a change is merged.
---

# Ship it live

Follow `.claude/skills/likelink-ops/SKILL.md` (the full routine) and `CLAUDE.md` ("likelink2.vercel.app is served through a Vercel project route").

1. **Checks:** `npm test`, `npm run build` (zero `is not exported` warnings), the Python engine tests when `scripts/luna_reels` changed, the `truth-guard` skill.
2. **PR:** on the designated branch; CI (`verify`, `build`, CodeQL) green. The Vercel status "Account is blocked" is account-wide — one standing comment, not a fix. Answer review threads.
3. **Merge:** squash with the expected head SHA. Make sure the PR head's tree equals `main` (merge `main` in first when bots committed to it).
4. **Route:** find the Netlify deploy permalink of that head (`https://<deployId>--mylikelink.netlify.app`). `edit_route` on `serve-current-build` with that `dest` **and** the `response.headers` transform that sets `x-robots-tag` to `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1` (`edit_route` replaces the whole route). Then `update_route_versions` → `promote`. Both need the owner's approval in the app.
5. **Verify live:** `/version.json` names the merged commit; `/r?pid=<id>` answers the static page; the changed pages render. Update the permalink line in `CLAUDE.md`.
6. Restart the branch from `main` only after checking it holds no unmerged bot commits.
