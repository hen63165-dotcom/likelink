# 11.11: המחיר באמת ירד? — a 16 s film made in code (Lemo-Opuscar, Dark Tech Keynote style)

The owner, 2026-11-08: "magic nobody has seen". The magic button now remembers the price a shopper saw
(`priceMemory`, PR #164); this film shows it on the live page three days before 11.11.
Every screen inside the phone is a real frame of the live /magic page recorded after the change went live
(the magic-demo release, magic-clean.mp4, 2026-11-08 19:14 UTC): the paste screen (s1.0), the store's answer
(s7.0) and the real "שמרנו בדפדפן שלך את המחיר של היום" box (s9.0). The second check has not happened yet,
so the film says it in words only — no invented screen.

Render (from a Lemo-Opuscar clone, with this folder copied to `films/price-memory/`):

    PLAYWRIGHT_CHROME=<chrome-headless-shell> node core/render/video.mjs films/price-memory --fps 30 --workers 4 --size 1080x1920 --out films/price-memory/out/video.mp4
    .venv/bin/python films/price-memory/mix.py
    ffmpeg -i out/video.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.85:level=false" -c:a aac -b:a 192k -shortest price-memory.mp4

The finished file is `marketing/reels/pro/price-memory-film.mp4`. Ends on the comment keyword "קסם" (the approved magic DM).
