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
