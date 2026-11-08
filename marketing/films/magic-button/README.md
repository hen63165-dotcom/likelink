# כפתור הקסם — a 20 s film made in code (Lemo-Opuscar, Dark Tech Keynote style)

The owner asked (2026-11-08) for films made with the Lemo-Opuscar library (github.com/lemomo-ai/lemo-opuscar, MIT; films made with it are ours).
Every screen inside the phone is a real frame of the live /magic page (the magic-demo release, magic-clean.mp4, 2026-11-07).

Render (from a Lemo-Opuscar clone, with this folder copied to `films/magic-button/`):

    PLAYWRIGHT_CHROME=<chrome-headless-shell> node core/render/video.mjs films/magic-button --fps 30 --workers 4 --size 1080x1920 --out films/magic-button/out/video.mp4
    .venv/bin/python films/magic-button/mix.py
    ffmpeg -i out/video.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.85:level=false" -c:a aac -b:a 192k -shortest magic-button.mp4

The finished file is `marketing/reels/pro/magic-button-film.mp4`. Fonts: Heebo (OFL), from @fontsource.
