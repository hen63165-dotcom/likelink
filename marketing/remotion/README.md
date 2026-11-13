# Remotion reels

Reels made in code with Remotion (skill `.claude/skills/remotion-best-practices`, free licence for one person).

- `ClipEarbuds`: the lilac clip earbuds, 17 s. The seller's photos cropped clear of the brand marks
  and printed text, a drawn diagram labelled "איור להמחשה", the AI voice lines from
  `scripts/marketing/kling/voice.json` (`ta410-app`), the bed from `scripts/luna_reels` and
  `#פרסומת · קישור שותפים` on every frame. No price and no sound or battery claim.

```bash
cd marketing/remotion && npm ci
npx remotion render ClipEarbuds out/clip-earbuds.mp4 --codec=h264 --crf=18 --audio-codec=aac \
  --browser-executable=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
ffmpeg -i out/clip-earbuds.mp4 -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 -c:a aac -b:a 192k -movflags +faststart ../reels/pro/clip-earbuds-remotion.mp4
```

Nothing here posts anything.

- `StudioSteps`: "open a studio" with one stick figure (skill `stick-figure`), 17.5 s: a question hook,
  then the real Studio steps (פתיחת סטודיו בחינם → הוספת קישור → the store ready to share) and
  "כתבי: סטודיו" for the comment funnel (→ `/join`). LikeLink2's own promotion: no affiliate tag,
  no income, no counts; labelled "אנימציה · LikeLink2". Render: `marketing/reels/pro/studio-steps-stickfigure.mp4`.

- `ButterflyFix`: the owner's own Gemini clip (butterfly clip earbuds, `public/gemini-butterfly.mp4`, 2026-11-13)
  repaired for posting: the Instagram mark the model drew in the top-left corner is covered, the garbled last
  caption ("בתבזניות", "קיישור") is set again on a white card, and `#פרסומת · קישור שותפים` + "סרטון AI · הדמות
  נוצרה ב־AI" are on every frame. Render: `marketing/reels/kling/butterfly-gemini-fixed.mp4`. Not posted: the
  product link is unknown and the voice says the earbuds "don't move when dancing or working out", which needs
  the seller's own listing before it can stay (Actions → "Transcribe" wrote the line down).

- `ButterflyUgc`: the owner's second Gemini clip (`public/gemini-butterfly-2.mp4`, no words; the runner heard only
  noise, so its sound is muted under the music bed): one pro-style caption per shot, the model's fake Instagram
  comment sheet and back button covered by our own "כתבו: אוזניות" card, the disclosure and the AI label on every
  frame. Render: `marketing/reels/kling/butterfly-gemini-2-edit.mp4`. Not posted: the product link is not known yet.
