# Third-party animation skills

Installed 2026-11-12 at the owner's request (from barshaltiel.ai's list of free animation skills, and AI Master's six).
Copied as published and read before installing: no install scripts, no network calls of their own.
To update one, copy the folder again from the same repository and change the commit below.

| Folder | Source | Commit | License |
| --- | --- | --- | --- |
| `remotion-best-practices/` | github.com/remotion-dev/skills (`skills/remotion-best-practices`, the router that holds all Remotion skills) | 7e541aa (v4.0.543) | Remotion License: free for an individual; companies over 3 people need a paid licence |
| `gsap-*/` (8 folders) | github.com/greensock/gsap-skills (`skills/`) | aed9cfd | MIT (`LICENSE.txt` in each folder). Every GSAP plugin is free |
| `text-to-lottie/` | github.com/diffusionstudio/lottie (`skills/text-to-lottie`) | 3c72912 | MIT (`LICENSE.txt`) |
| `zack-d-films/`, `breakdown/`, `stick-figure/`, `map-route/`, `graph/`, `minimalistic-graphics/` | AI Master (עמיחי שקל), `ai-master-animation-skills.zip` v1.0.0 (2026-11-10) from its public Notion page, fetched by Actions → "Page read" (zip sha256 `480eed03b611bbeb…`) | v1.0.0 | No licence stated; given away free for installing into Claude's skills folder. Instructions only, no code. AI Master's own note: not affiliated with Zack D. Films or David Ho; the names only match the shortcuts in its video |

## LikeLink2 rules that win over these skills

- No paid service: Remotion's voice-over guide suggests ElevenLabs; use the free edge-tts voices
  (`.github/workflows/voice-lines.yml`, `scripts/luna_reels`) instead. No map keys (Mapbox, Google Maps Tiles).
- Remotion renders under the free licence only while LikeLink2 is the owner alone; pass `"free-license"`.
- A video made with these tools follows the reel rules: `#פרסומת · קישור שותפים` on every frame when it
  shows a product, the AI label when a character or voice is AI, only true claims, nothing posted without the owner's yes.
- Site animation (GSAP) respects `prefers-reduced-motion` and never adds a counter, rating or fake activity.
