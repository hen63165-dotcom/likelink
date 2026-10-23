---
name: today
description: The owner's whole day on LikeLink2 in one command — is the site live and healthy, what to post today on Instagram/TikTok/stories (with the ready files and captions), which story reel to render next, and what to log from yesterday's numbers. Use when the owner says "מה היום", "מה לפרסם", "today", "the daily plan", or opens a session without a clear task.
---

# Today on LikeLink2

Work from the LikeLink2 repository (https://github.com/hen63165-dotcom/likelink). Read `CLAUDE.md` first.
Answer the owner in short, simple Hebrew (feminine forms), as a numbered to-do she can follow on her phone.

## 1. Is the site live and healthy
- Run `npm run ops:doctor` (report only, prints no secrets). Each finding is APP_DEFECT / PROVIDER_LIMIT / MISSING_CREDENTIAL / EXTERNAL_ACTION / NOT_TESTED.
- Compare the live revision (`https://likelink2.vercel.app/version.json`, or the Vercel `web_fetch` tool when the sandbox blocks the host) with `main`. If `main` is ahead, say so and offer the `ship` skill.
- An APP_DEFECT is fixed before anything is posted.

## 2. What to post today (nothing is posted for her)
Every page below is rebuilt on each deploy (`.github/workflows/deploy-frontend.yml`) and is noindex:
| Network | Page | What she does |
|---|---|---|
| Instagram grid + stories | `https://hen63165-dotcom.github.io/likelink/instagram/` | 1–2 posts a day from the last one up; stories: post the reel, share to story, link sticker |
| TikTok | `https://hen63165-dotcom.github.io/likelink/tiktok/` | today's two TikToks, in-app steps, the "גילוי תוכן" switch |
| Every network | `https://hen63165-dotcom.github.io/likelink/drop/` | today's product, its best video, the post per network |
Give her the 3 actions for today, each with its file to download and its caption to paste.

## 3. Which story to render next
- List `scripts/luna_reels/episodes/story-*.json` and the newest renders in the `luna-reels` release; pick the episode with no render, or the oldest.
- Render with Actions → "Luna reels" (`episode` = its id). See the `story` skill.

## 4. Yesterday's numbers
- Ask for each post's reach, completion, sends and saves (Instagram insights), and TikTok numbers → Actions → "TikTok results".
- Below 3 posts per format nothing is called a winner (`learnTikTok`, `MIN_POSTS`). Repeat the hook type that measured best.

## Never
Post, message, buy, or spend credits for her; promise a viral result; show sales/ratings that are not real.
