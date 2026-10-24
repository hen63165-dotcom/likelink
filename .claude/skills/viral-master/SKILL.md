---
name: viral-master
description: LikeLink2's master rulebook for content that travels — the one place that gathers what works for Reels, TikTok and stories (hook in the first second, short and complete, a new picture every few seconds, a reason to send, one comment keyword, the disclosure, the AI label, truth only), the formats that carry it (Luna's stories, premium product cuts, luxe-set product photos, the Instagram grid), and how the owner's own numbers decide what to repeat. Use when the owner asks for viral / "מתפוצץ" content, a master or playbook, why a post did not take off, better-looking product pictures, or "what do influencers do that works".
---

# The master (המאסטר)

The owner, 2026-10-23: *"everything influencers use that really explodes —
gather it and make it a master for me."* This skill is that master. The rules
live in code, `src/lib/growth/viralMaster.js` (`MASTER_RULES`, `masterCheck`),
are printed on the Instagram page (`/likelink/instagram/`, "המאסטר") and are
enforced by `tests/viralMaster.test.mjs` on every Luna story.

## Never promise a viral reel
No one can — not Instagram, not an influencer, not this repo. Say so plainly
when asked ("כל רילס יתפוצץ בוודאות" is not a promise anyone can keep). What we
do: raise the odds with every rule below, then let her numbers decide.

## What the rules rest on
- **Instagram (Adam Mosseri, Jan 2025):** the strongest Reels signals are
  watch time, likes per reach and **sends per reach**.
- **Originality (Instagram, 2024):** original content ranks above reposts.
- Most feeds play **muted**: the words on screen carry the story.
- A comment keyword answered in private (our bot, `scripts/instagram/comment-bot.mjs`)
  turns attention into a click without a link in the caption.

## The 12 rules (MASTER_RULES)
hook in the first second (≤ 8 words) · short and complete (product reel 7–15 s,
Luna story 20–45 s) · a new picture at least every 4 s · captions on screen ·
one look per series (each product's own character and her "<name> ממליצה" tag, yellow captions) · teach
before you sell · a reason to send ("שלחי לחברה ש…", episode field `send`) ·
one keyword ("רוצה" product link / "מדריך" guide) · `#פרסומת · קישור שותפים`
first · AI character labelled on screen and with Instagram's AI label · true
only (no scarcity, sales counts, invented prices, "קניתי") · our own content
only (no other creator's video, no other brand's logo or name).

## The formats that carry them
| Format | Where it is made | Notes |
|---|---|---|
| Story (look `story`) | `scripts/luna_reels`, episodes `story-*.json`, Actions → "Luna reels" | one character per product (`scripts/media/ai-image/cast.json`, drawn by Actions → "Story cast"), a scene per line, yellow captions cut at the sentence's pauses, the "<name> ממליצה" tag, the product's real photo full screen, `send` line in the caption |
| Premium product cut | `scripts/media/product-video/` | the seller's footage, ~11 s; variants b/c keep the on-screen hook |
| Luxe-set product photo | `scripts/media/luxe-set/luxe.py`, chosen sets in `public/sets/index.json` | seller's photo cut out (rembg, free) on noir / champagne / sky; only the background is ours; label "תמונת המוכר · רקע: LikeLink2"; despill for green-screen sources |
| Instagram grid | `src/lib/growth/instagramGrid.js` | tips before products; uses the luxe sets first |
| TikTok kit / daily drop | skills `tiktok-growth`, `viral-marketing` | same copy rules |

White catalog photos and busy seller backgrounds read as cheap (the owner,
2026-10-23). A product post uses, in order: a luxe set, the seller's worn
photo, a checked frame of the seller's video — never a plain white catalog shot.

## Accounts and posting
- TikTok `@likelink` (personal account, 2026-10-16) — in `src/lib/growth/socialAccounts.js`.
- The owner has a Facebook page and an Instagram business account (2026-10-23).
  Automatic Instagram posting and the comment bot need `IG_USER_ID` +
  `IG_ACCESS_TOKEN` as repository secrets, added by the owner in GitHub
  settings — never pasted into a chat. Until then she posts from the kit pages.
- Nothing is ever posted without her explicit approval.

## The loop
Post → after 24 h read the reel's insights (completion, sends, saves) → log
TikTok numbers in Actions → "TikTok results" → repeat the hook type and format
that measured best; below 3 posts per format nothing is called a winner.
