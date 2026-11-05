# motion-likelink: "רואים בסרטון, קונים בחנות" (9:16, 15 s)

This is a LikeLink2 motion ad rendered from code with the `motion-reel` plugin. How to make one is in the plugin skill `plugins/likelink-studio/skills/motion-ad/SKILL.md`. The plan is in `docs/shotlist.md` and the review rounds are in `docs/critique.md`.

The audio is not committed. To make it again:
`uv run <motion-reel>/scripts/beats.py motion-likelink --synth --flavor house --bpm 120 --mode major --tonic A --duration 15 --drop 6`, then `sfx.mjs` and `mix.mjs`.
