---
name: traffic-engine
description: LikeLink2's traffic engine (מכונת התנועה) — how strangers reach the site from Instagram/TikTok every day, for free. The comment-keyword funnel (a free useful thing → one word in the comments → the link in a private DM), the three video formats that carry it (pro product reels from the store's photos, films made in code with Lemo-Opuscar from the site's real pages, and the owner's own phone clips edited UGC-style), the daily cadence, her two minutes, and how her numbers decide what repeats. Use when the owner asks for traffic, "תנועה", "תביא קונים/מוכרות", "כמו המשפיענים", a comment-to-DM post, "כתבי X בתגובות", UGC, a reel that brings people to the site, or "the skill for the site".
---

# מכונת התנועה (the traffic engine)

The owner, 2026-11-08: *"אתה חייב להביא לי תנועה מטורפת כבר"*, and, about the creators she follows
(dalitm_social, barshaltiel.ai, its.oran.ai): *"תעשה לי כמוהם"*.

## The truth to start from
- Until 2026-11-08 the only purchases (`affiliate:earnings`: 8 orders in 30 days — squishies, fidget toys,
  cards) came from a friend who asked her for a link. The site itself sent ~1 visitor a week to the store.
- So the job is **reach to strangers**. No one can promise a viral post; we raise the odds daily and let
  her numbers decide (Windsor `get_data` reach/views per post; `GET /api/store?mode=growth-engine&op=metrics`
  for visits by `utm_source`; `affiliate:earnings` for orders — an estimate is never called income).

## Why the comment keyword works
Their posts get 139–190 comments because they give something free and useful and ask for **one word** in the
comments; the link arrives in a private DM. Each comment tells Instagram the post is worth showing, and
each DM is a click to the site. Our keywords (one per post, one word):

| Keyword | What they get in the DM | Link |
|---|---|---|
| אני | the product | `/p/<id>?utm_source=instagram&utm_medium=dm&utm_campaign=<slug>_<yyyymmdd>` |
| קסם | the magic button (check an AliExpress item before buying) | `/magic?…` |
| מדריך | the free guide, 8 checks before buying | `/guide?…` |
| סטודיו | a free studio for creators (up to 5 products, no card) | `/join?…` |

- The DM is sent by Upload-Post AutoDM: `start_autodm` (profile `default`, platform `instagram`,
  `post_url` = the permalink, `trigger_keywords` = [the word], `confirmed: true`). **A new DM text needs her
  explicit approval first** (show the exact text; the auto-mode classifier refuses an unapproved one).
- Also a first comment with the link (Windsor `create_comment`), for people who don't comment.
- **Upload-Post's free plan starts at most 2 AutoDM monitors per profile per day** (429 "maximum 2 monitors per
  profile per day", seen 2026-11-08). Give the day's two monitors to the posts with the most comments (the lead
  magnets: מדריך, סטודיו, קסם); answer the rest by hand in scheduled comment sweeps: `get_post_comments` →
  `reply_to_comment` (one private reply per comment, Instagram's 7-day window, the approved text only). A
  monitor only answers comments made after it started, so the sweep also covers the earlier ones.
- Product DMs and captions keep "#פרסומת · קישור שותפים" / the affiliate line; tool posts (קסם, מדריך,
  סטודיו) carry "(באתר יש קישורי שותפים…)".

## The selling format: real hands, a real product (the owner, 2026-11-15)

The owner, after the photo slideshows: *"זה לא מוכר בכלל הסרטונים האלה... תעשה סרטונים שווים ומוכרים, תשקיע כמשפיען ועורך סרטונים"*, then *"תעשה את כל הסרטונים ככה"*. Every product video is now hands-on footage, never a photo slideshow:
1. **Real footage only.** The owner's own clip of a package she really received (the strongest: label "צילום אמיתי", REAL_UGC), or the store's own video of hands opening and using the product (label "סרטון המוכר", Actions → "Store videos"). Never "we got a package" over footage we did not film: that is a fake testimonial.
2. **The product on screen in the first second**, with a short hook on screen whose payoff the video really delivers (a question or a problem, ≤ 8 words).
3. **Show it working**, no feature list: open → take out → use → detail → size next to something familiar.
4. **9–20 s, a new picture every 1–2 s**: each cut must give something new, the best moment early.
5. **Big captions** (3–5 words a line), the energetic own beat (`luna_reels/popbeat.py`, 122 BPM, no samples, no licence), **no whoosh on the cuts**.
6. **End card**: the comment word ("אני") → the link in a DM; `#פרסומת · קישור שותפים` and who filmed it on every frame.
7. **Only products HOT on the radar** (the hot-now gate in `docs/marketing/product-rules.md`).
Research behind it (2026-11-15, vendor blogs, treated as hypotheses to test on her numbers): the product in the first 3 s, problem → solution, showing beats telling, unpolished phone footage often beats polished work, every cut must add something.
Sources: pulse-advertising.com (anatomy of a shoppable TikTok video), optimizon.co.uk (TikTok Shop best practices), async.com (editing Reels for retention), socialmediaexaminer.com (why unpolished Reels win), digistore24.com (affiliate Reels).

## Carousels and captions that get saved and shared (research, 2026-11-15)

The owner: *"תבדוק איך נראות הקרוסלות הכי חזקות ומה הכי חזק מבחינת הכיתוב... תעשה ממש בדיקה מקיפה"*. What the sources agree on (vendor blogs; hypotheses to test on her numbers):
- **Slide 1 does most of the work:** hint at a result, a mistake or a surprise without giving it away (e.g. "אל תעשי את 5 הטעויות האלה" with the five blurred). Slide 2 matters too (Instagram may show it to people who did not swipe).
- **6–10 slides, one idea per slide**, 1080×1350 (4:5; the grid crops slide 1 to 3:4). Formats that get saved: numbered lists, mistakes/myth-vs-fact, step by step, before/after.
- **The last slide: one ask** ("שמרי ושלחי לחברה" + one comment word). Saves and sends count more than likes.
- **Caption:** the hook inside the first ~125 characters (after the disclosure), 3–6 short lines of value, ONE specific call to action (a comment word that gets the link in a DM). Comment goal → a question; DM goal → the keyword.
- Reels reach people who do not follow yet; carousels build saves and trust. Use both.
Sources: adpicto.com, carouselli.com, posteverywhere.ai, krumzi.com (carousels); heropost.io, postsyncer.com, krumzi.com (captions).

## No transition noise (the owner, 2026-11-15)

Every video LikeLink2 publishes cuts **silently** over its music bed or voice: no whoosh, swoosh, riser or any other sound effect on the transitions. The owner, in her words: *"מעכשיו תעשה שכל סרטון שאתה מפרסם יהיה בלי הרעש המוזר הזה של המעברים, שים לך תזכורת"*.
- `scripts/marketing/pro-reel.mjs` and `scripts/luna_reels` (compose) no longer add one.
- A film from `marketing/films/*` (its `mix.py` / `film.js` sound events) drops every `whoosh`/`rise` before it is shown to her for posting.
- Before showing any video for approval, listen to it once for transition noise.

## The three formats (all free, all real)
1. **Pro product reel** — `scripts/marketing/pro-reel.mjs`, Actions → "Pro reels" (jobs in
   `scripts/marketing/pro-reels/jobs.json`). The store's own photos full screen, one caption style, hook →
   what → tip → "תגיבי 'אני'". Photos picked by eye from `<id>-gallery.jpg` (hands/worn first; never printed
   text, sizes, packaging words or a seller mark). Toys/squishies first: that is what sold.
2. **Film made in code** — Lemo-Opuscar (github.com/lemomo-ai/lemo-opuscar, MIT; films we make are ours),
   style Dark Tech Keynote. Sources in `marketing/films/<name>/` (magic-button, guide-film, studio-film):
   the phone shows **real pages of the site** (captured from the site's own build at 360×640 @3x, or frames
   of the live recording), captions in a dark pill, a hook on frame 0, and an end card with the keyword.
   Render: clone the library to the scratchpad, `npm install`, `python3 -m venv .venv && .venv/bin/pip
   install -r requirements.txt`, copy the folder to `films/<name>/`, then `PLAYWRIGHT_CHROME=<chrome-headless-shell>
   node core/render/video.mjs films/<name> --fps 30 --workers 4 --size 1080x1920`, `.venv/bin/python
   films/<name>/mix.py`, and mux with ffmpeg (`loudnorm` + `alimiter`; the library's mux.sh rejects our WAV).
   Never invent a screen: if the page does not show it, the film does not say it.
3. **Her own phone clip, edited UGC** — `node scripts/marketing/ugc-edit.mjs <clip> <job.json> <out>`:
   covers 9:16, a hook (≤10 words) in the first second, story captions at the times she does things, her own
   sound with a soft bed under it, the end card "כתבי ״<keyword>״". Real footage only. Every line passes
   HOOK_FORBIDDEN / DROP_FORBIDDEN / hasBrandName or the edit is refused. No emoji in burned-in lines.

**Never** on the grid: cartoons, AI characters, dark text slides, site screenshots as a post, stock people
presented as her, or a stranger's video under her name. A realistic AI "UGC" person needs paid credits
(Kling has 0) and an AI label; the owner has no budget — the natural UGC is her own phone.

## Scripts she can film (10–20 s, her phone, no face needed)
- **"ככה אני בודקת לפני שאני שולחת קישור"** (keyword קסם): screen-record — AliExpress app → share → copy
  link → likelink2.vercel.app/magic → "הדבקה ובדיקה" → scroll the result slowly.
- **"מצאתי לך באלי בעברית"** (keyword קסם): screen-record the tab "מצאי לי באלי", type "סקווישי עד 20 ש״ח",
  scroll the results.
- **Unboxing a squishy** (keyword אני, ad): her hands open the parcel and squeeze it, 10 s, natural sound.
- **"פתחתי חנות בדקה"** (keyword סטודיו): screen-record /studio → paste a link → the product page appears.
Stories must be true: say only what she really did ("חברה ביקשה ממני קישור" is true; "קניתי שנים" only if
she says so).

## The day
- 11:17 the daily run (scheduled task): hot products in, three reels shown for one "כן", scheduled at
  12:45 / 17:30 / 20:30 with first comment + AutoDM, her two minutes listed.
- Her two minutes: the same reels to TikTok @likelink by hand (bio link with utm_source=tiktok), one
  helpful post in 3 Israeli AliExpress Facebook groups (from her own account, each group's rules), Sun/Wed one
  post in creators' groups (/join), Pinterest feed once (pins.xml).
- Saturday: no posts; the week's real numbers and which reel did best — make more of that one.
