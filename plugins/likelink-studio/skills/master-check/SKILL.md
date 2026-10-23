---
name: master-check
description: Check any reel, story, TikTok or post plan against LikeLink2's master — the 12 rules built on Instagram's own ranking signals (watch time, likes and sends per reach) — and say in plain Hebrew what to fix before it goes out. Use for "זה יתפוצץ?", "תבדוק את הרילס", "why didn't it take off", or before rendering anything.
---

# The master check

Rules: `src/lib/growth/viralMaster.js` (`MASTER_RULES`, `masterCheck`), the skill `.claude/skills/viral-master/SKILL.md`, tested by `tests/viralMaster.test.mjs`.

1. Turn the plan into `{format: "reel"|"story", hook, seconds, beats: [{start, scene}], caption, captions, series, productAt, product, aiCharacter, onScreenLabels, source}` (`source`: `own_render`, `own_footage` or `seller_edit`; a missing field fails the rule it proves) (a story episode: see how `planOf` in `tests/viralMaster.test.mjs` estimates timing — 2.8 words a second, a breath per line, the 3 s end card).
2. Run `masterCheck(plan)`. `failed` lists rule ids; `MASTER_RULES` has the Hebrew sentence for each.
3. Answer with each failed rule, why it matters (its `why`: watch time / sends / saves / law + trust), and the exact rewrite.

Say plainly that the check is readiness, not a forecast: nobody can promise a viral reel. After 24 hours, read the reel's completion, sends and saves, and repeat what measured best.
