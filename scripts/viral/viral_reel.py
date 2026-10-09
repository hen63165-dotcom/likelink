#!/usr/bin/env python3
"""LikeLink2 viral reel: script -> voice -> video -> edit -> Instagram Reels.

One run, no manual steps:
  1. Script   a 25-30 s Hebrew script with a 2.5 s hook, chosen from variants
              that state only what the site does today (no invented numbers,
              no testimonials, no income promises).
  2. Voice    ElevenLabs, one natural take with per-character timestamps
              (word-by-word captions are timed from them).
  3. Video    Replicate text-to-video, several 9:16 clips.
  4. Edit     MoviePy: clips + voice, a punch-in visual hook, big word-by-word
              captions in the centre, the AI label, an end card, optional
              background music (only a track you chose), 1080x1920 H.264/AAC.
  5. Publish  Instagram Graph API: resumable upload of the file, status poll,
              media_publish, then a read-back of the media id and permalink.
              The reel counts as published only after that read-back.

Every key comes from the environment (never printed):
  ELEVENLABS_API_KEY   ElevenLabs key
  REPLICATE_API_TOKEN  Replicate token
  IG_ACCESS_TOKEN      long-lived token with instagram_content_publish
  IG_USER_ID           the Instagram Business/Creator account id
Optional:
  SITE_URL (https://likelink2.vercel.app), HEALTHCHECK_URL, ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODEL (eleven_v3), REPLICATE_VIDEO_MODEL, REPLICATE_VIDEO_INPUT
  (JSON merged into every clip request), SCENES (3), MUSIC_PATH, MUSIC_VOLUME
  (0.12), FONT_PATH, GRAPH_HOST (graph.facebook.com), GRAPH_API_VERSION
  (v23.0), SCRIPT_VARIANT, POST_TO_INSTAGRAM (1), OUT_DIR (.)

  python scripts/viral/viral_reel.py                 # full run, posts the reel
  POST_TO_INSTAGRAM=0 python scripts/viral/viral_reel.py   # render only
  python scripts/viral/viral_reel.py --offline-render-test # editor check, no APIs
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import time

import requests

# ----------------------------------------------------------------- settings

ENV = os.environ.get
SITE_URL = ENV("SITE_URL", "https://likelink2.vercel.app").rstrip("/")
SITE_LABEL = re.sub(r"^https?://", "", SITE_URL)
# The site's own data API: a reel must not send people to a site that cannot
# load its catalog (e.g. while the database is restricted).
HEALTHCHECK_URL = ENV("HEALTHCHECK_URL", f"{SITE_URL}/api/store?mode=brand-pulse")
ELEVEN_MODEL = ENV("ELEVENLABS_MODEL", "eleven_v3")
ELEVEN_VOICE = ENV("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
VIDEO_MODEL = ENV("REPLICATE_VIDEO_MODEL", "wan-video/wan-2.2-t2v-fast")
VIDEO_EXTRA = ENV("REPLICATE_VIDEO_INPUT", "")
SCENES = max(1, min(6, int(ENV("SCENES", "3") or 3)))
MUSIC_PATH = ENV("MUSIC_PATH", "")
MUSIC_VOLUME = float(ENV("MUSIC_VOLUME", "0.12") or 0.12)
GRAPH_HOST = ENV("GRAPH_HOST", "graph.facebook.com")
GRAPH_VERSION = ENV("GRAPH_API_VERSION", "v23.0")
OUT_DIR = os.path.abspath(ENV("OUT_DIR", "."))
FINAL_NAME = "viral_reel_final.mp4"

W, H, FPS = 1080, 1920, 30
HOOK_SECONDS = 2.5
END_CARD_SECONDS = 2.4
CAPTION_Y = 1130

FONT_CANDIDATES = [
    ENV("FONT_PATH", ""),
    "/usr/share/fonts/truetype/noto/NotoSansHebrew-Black.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansHebrew-ExtraBold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansHebrew-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def log(msg: str) -> None:
    print(f"[{dt.datetime.utcnow().strftime('%H:%M:%S')}] {msg}", flush=True)


class Stop(Exception):
    """A step failed; the run stops and nothing half-done is published."""


# ------------------------------------------------------------ 1. the script

# Each variant: the on-screen hook (2 lines, *word* = highlighted), the spoken
# sentences (the first one is the spoken hook), the words to highlight in the
# captions, and the scenes for the video model. Every sentence describes
# something LikeLink2 does today.
VARIANTS = [
    {
        "id": "where-bought",
        "hook_screen": ["20 הודעות של", "*״איפה קנית?״*"],
        "say": [
            "עשרים הודעות של ״איפה קנית?״... ואפס מושג כמה באמת לחצו.",
            "את ממליצה על מוצרים כל יום. בסטורי, בוואטסאפ, בקבוצות.",
            "ובסוף הכל נבלע בצ׳אט.",
            "בלייקלינק פותחים סטודיו בחינם, תוך דקה.",
            "עמוד אישי אחד, עם כל ההמלצות שלך.",
            "קישור מעקב לכל מוצר.",
            "ואת רואה כמה אנשים באמת לחצו, ומאיזו רשת.",
            "סטודיו חינם. הקישור בביו.",
        ],
        "highlight": ["איפה", "קנית", "באמת", "לחצו", "חינם", "קישור", "מעקב", "בביו"],
        "caption": "20 הודעות של ״איפה קנית?״ ואפס מושג כמה באמת לחצו 🤯\n\nבלייקלינק פותחים סטודיו בחינם: עמוד אישי עם כל ההמלצות שלך, קישור מעקב לכל מוצר, ורואים כמה לחצו ומאיזו רשת.",
        "scenes": [
            "vertical 9:16 video, a young woman on a sofa in a bright modern apartment looking at her smartphone, dozens of chat message bubbles popping up around the phone, playful and energetic, warm cinematic light, shallow depth of field, smooth handheld camera, photorealistic, no text, no logos",
            "vertical 9:16 video, close-up of hands holding a smartphone, the screen glowing with a clean shopping dashboard of product cards and rising bar charts, soft violet and pink neon light, slow push-in camera, cinematic, no readable text, no logos",
            "vertical 9:16 video, a smiling young woman filming a product recommendation with her phone on a tripod in a cozy colorful room, ring light, fairy lights, dynamic camera movement, vibrant, cinematic, no text, no logos",
        ],
    },
    {
        "id": "lost-link",
        "hook_screen": ["ראית מוצר בסרטון", "*ואין קישור?*"],
        "say": [
            "ראית מוצר בסרטון... ואין לך מושג איפה הקישור?",
            "אל תחפשי שעה בתגובות.",
            "בלייקלינק פשוט מדביקים קישור, מצלמים תמונה, או אומרים מה ראיתם.",
            "ומקבלים את המוצר, עם תמונה אמיתית, מחיר, וחנות ברורה.",
            "וכל תוצאה מראה למה היא שם.",
            "בלי ביקורות מומצאות. בלי כוכבים מזויפים.",
            "חפשי עכשיו. הקישור בביו.",
        ],
        "highlight": ["קישור", "תמונה", "אמיתית", "ברורה", "למה", "מומצאות", "בביו"],
        "caption": "ראית מוצר בסרטון ואין קישור? 👀\n\nבלייקלינק מדביקים קישור, מצלמים תמונה או אומרים מה ראיתם, ומקבלים את המוצר עם תמונה אמיתית, מחיר וחנות ברורה. וכל תוצאה מראה למה היא שם.",
        "scenes": [
            "vertical 9:16 video, a young woman scrolling short videos on her phone at night in bed, her face lit by the screen, she pauses with a curious surprised expression, cinematic blue and violet light, shallow depth of field, photorealistic, no text, no logos",
            "vertical 9:16 video, a hand pointing a smartphone camera at a stylish sneaker on a wooden table, soft daylight, a glowing scan line sweeps across, sleek tech aesthetic, slow camera move, no readable text, no logos",
            "vertical 9:16 video, an elegant flat lay of trendy fashion accessories and gadgets appearing one by one on a pastel background, smooth stop-motion feel, bright studio light, satisfying, no text, no logos",
        ],
    },
    {
        "id": "real-clicks",
        "hook_screen": ["כמה באמת לחצו", "*על ההמלצה שלך?*"],
        "say": [
            "כמה אנשים באמת לחצו על ההמלצה האחרונה שלך?",
            "אם התשובה היא ״אין לי מושג״, זה בשבילך.",
            "בלייקלינק כל מוצר שאת ממליצה עליו מקבל קישור מעקב משלו.",
            "את משתפת באינסטגרם, בטיקטוק, בוואטסאפ.",
            "ובסטודיו רואים קליקים אמיתיים, לפי רשת.",
            "בלי מספרים מומצאים. רק מה שקרה.",
            "פותחים סטודיו בחינם. הקישור בביו.",
        ],
        "highlight": ["באמת", "לחצו", "מושג", "קישור", "מעקב", "אמיתיים", "חינם", "בביו"],
        "caption": "כמה אנשים באמת לחצו על ההמלצה האחרונה שלך? 🤔\n\nבלייקלינק כל מוצר מקבל קישור מעקב משלו, ובסטודיו רואים קליקים אמיתיים לפי רשת. בלי מספרים מומצאים.",
        "scenes": [
            "vertical 9:16 video, a young woman content creator looking at her phone with a puzzled expression in a bright cafe, golden hour light through the window, shallow depth of field, cinematic handheld, photorealistic, no text, no logos",
            "vertical 9:16 video, an abstract glowing network of connected dots and light trails flowing between floating smartphone screens, violet pink and cyan colors, smooth camera fly-through, futuristic, no readable text, no logos",
            "vertical 9:16 video, a confident young woman smiling at her laptop and phone at a stylish desk, colorful charts glowing on the screens, celebratory energy, soft neon light, cinematic, no readable text, no logos",
        ],
    },
]

CTA_LINES = ["🔗 הקישור בביו", f"🌐 {SITE_LABEL}"]
DISCLOSURE = "🎬 הסרטון והקול נוצרו בבינה מלאכותית"
HASHTAGS = ["#לייקלינק", "#LikeLink2", "#המלצות", "#ממליצה", "#קניותאונליין", "#שופינג", "#יוצרות", "#משפיעניות",
            "#יוצריתוכן", "#סטודיו", "#מציאות", "#טיפים", "#עסקקטן", "#ישראל", "#רילס"]


def pick_variant() -> dict:
    wanted = (ENV("SCRIPT_VARIANT", "") or "").strip()
    if wanted:
        for v in VARIANTS:
            if v["id"] == wanted:
                return v
        raise Stop(f"unknown SCRIPT_VARIANT {wanted!r} (one of: {', '.join(v['id'] for v in VARIANTS)})")
    return VARIANTS[dt.date.today().toordinal() % len(VARIANTS)]


def build_caption(v: dict) -> str:
    assert len(HASHTAGS) == 15
    text = "\n\n".join([v["caption"], "\n".join(CTA_LINES), DISCLOSURE, " ".join(HASHTAGS)])
    if len(text) > 2200:
        raise Stop("caption longer than Instagram's 2,200 characters")
    return text


# ------------------------------------------------------------- 2. the voice

_PUNCT = "״\"'׳,.!?…:;()—–-"


def plain_word(w: str) -> str:
    return w.strip(_PUNCT)


def words_from_alignment(alignment) -> list[dict]:
    chars = list(getattr(alignment, "characters", None) or alignment["characters"])
    starts = list(getattr(alignment, "character_start_times_seconds", None) or alignment["character_start_times_seconds"])
    ends = list(getattr(alignment, "character_end_times_seconds", None) or alignment["character_end_times_seconds"])
    words, cur, s, e = [], "", None, None
    for ch, a, b in zip(chars, starts, ends):
        if ch.isspace():
            if cur.strip():
                words.append({"word": cur, "start": s, "end": e})
            cur, s, e = "", None, None
            continue
        if s is None:
            s = a
        cur += ch
        e = b
    if cur.strip():
        words.append({"word": cur, "start": s, "end": e})
    return [w for w in words if plain_word(w["word"])]


def words_by_length(sentences: list[str], spans: list[tuple[float, float]]) -> list[dict]:
    """Word timings when only sentence spans are known: share by letters."""
    out = []
    for sentence, (a, b) in zip(sentences, spans):
        ws = [w for w in sentence.split() if plain_word(w)]
        total = sum(len(plain_word(w)) + 1 for w in ws) or 1
        t = a
        for w in ws:
            d = (b - a) * (len(plain_word(w)) + 1) / total
            out.append({"word": w, "start": t, "end": t + d})
            t += d
    return out


def synthesize_voice(sentences: list[str], workdir: str) -> tuple[str, list[dict]]:
    key = ENV("ELEVENLABS_API_KEY", "")
    if not key:
        raise Stop("ELEVENLABS_API_KEY is not set")
    from elevenlabs.client import ElevenLabs

    client = ElevenLabs(api_key=key)
    text = " ".join(sentences)
    path = os.path.join(workdir, "voice.mp3")
    try:
        r = client.text_to_speech.convert_with_timestamps(
            ELEVEN_VOICE, text=text, model_id=ELEVEN_MODEL, output_format="mp3_44100_128")
        audio = getattr(r, "audio_base_64", None) or getattr(r, "audio_base64", None)
        alignment = getattr(r, "alignment", None) or getattr(r, "normalized_alignment", None)
        if not audio or not alignment:
            raise ValueError("no audio/alignment in the response")
        with open(path, "wb") as f:
            f.write(base64.b64decode(audio))
        words = words_from_alignment(alignment)
        if not words:
            raise ValueError("empty alignment")
        log(f"voice: one take, {len(words)} timed words ({ELEVEN_MODEL})")
        return path, words
    except Exception as e:  # timestamps not offered for this model/voice: time by sentence
        log(f"voice: timestamps unavailable ({type(e).__name__}); generating sentence by sentence")
    from moviepy import AudioFileClip, concatenate_audioclips, AudioClip

    parts, spans, t = [], [], 0.0
    gap = 0.12
    for i, s in enumerate(sentences):
        p = os.path.join(workdir, f"voice-{i:02d}.mp3")
        audio = client.text_to_speech.convert(
            ELEVEN_VOICE, text=s, model_id=ELEVEN_MODEL, output_format="mp3_44100_128",
            previous_text=" ".join(sentences[:i])[-500:] or None, next_text=" ".join(sentences[i + 1:])[:500] or None)
        with open(p, "wb") as f:
            for chunk in audio:
                f.write(chunk)
        clip = AudioFileClip(p)
        parts.append(clip)
        spans.append((t, t + clip.duration))
        t += clip.duration
        if i < len(sentences) - 1:
            parts.append(AudioClip(lambda tt: [0, 0], duration=gap, fps=44100))
            t += gap
    full = concatenate_audioclips(parts)
    full.write_audiofile(path, fps=44100, logger=None)
    return path, words_by_length(sentences, spans)


# -------------------------------------------------------------- 3. the video

def _read_output(out) -> bytes:
    if isinstance(out, (list, tuple)):
        if not out:
            raise Stop("the video model returned no file")
        out = out[0]
    if hasattr(out, "read"):
        return out.read()
    if isinstance(out, str) and out.startswith("http"):
        r = requests.get(out, timeout=300)
        r.raise_for_status()
        return r.content
    raise Stop(f"unexpected video model output: {type(out).__name__}")


def generate_clips(prompts: list[str], workdir: str) -> list[str]:
    if not ENV("REPLICATE_API_TOKEN", ""):
        raise Stop("REPLICATE_API_TOKEN is not set")
    import replicate

    extra = json.loads(VIDEO_EXTRA) if VIDEO_EXTRA.strip() else {}
    paths = []
    for i, prompt in enumerate(prompts[:SCENES]):
        inp = {"prompt": prompt, "aspect_ratio": "9:16", **extra}
        for attempt in (1, 2):
            try:
                t0 = time.time()
                data = _read_output(replicate.run(VIDEO_MODEL, input=inp))
                if len(data) < 10_000:
                    raise Stop("video file too small")
                p = os.path.join(workdir, f"scene-{i + 1}.mp4")
                with open(p, "wb") as f:
                    f.write(data)
                paths.append(p)
                log(f"video: scene {i + 1} ready ({len(data) // 1024} KB, {time.time() - t0:.0f}s, {VIDEO_MODEL})")
                break
            except Exception as e:
                if attempt == 2:
                    raise Stop(f"video scene {i + 1} failed twice: {type(e).__name__}: {str(e)[:200]}")
                log(f"video: scene {i + 1} failed ({type(e).__name__}), retrying once")
    return paths


# --------------------------------------------------------------- 4. the edit

def find_font() -> str:
    for p in FONT_CANDIDATES:
        if p and os.path.exists(p):
            return p
    raise Stop("no Hebrew font found; set FONT_PATH to a .ttf with Hebrew letters")


def visual(text: str) -> str:
    """Hebrew for Pillow: with libraqm Pillow lays out RTL itself; without it, reorder."""
    from PIL import features

    if features.check("raqm"):
        return text
    try:
        from bidi import get_display
    except ImportError:
        from bidi.algorithm import get_display
    return get_display(text)


def cover(clip, w=W, h=H):
    """Scale to fill 1080x1920 and crop the centre (no letterbox)."""
    scale = max(w / clip.w, h / clip.h)
    c = clip.resized(scale)
    return c.cropped(x_center=c.w / 2, y_center=c.h / 2, width=w, height=h)


def edit(clips: list[str], voice_path: str, words: list[dict], v: dict, out_path: str) -> float:
    from moviepy import (AudioFileClip, ColorClip, CompositeAudioClip, CompositeVideoClip, TextClip,
                         VideoFileClip, afx, concatenate_videoclips, vfx)

    font = find_font()
    voice = AudioFileClip(voice_path)
    talk_end = voice.duration + 0.3
    total = talk_end + END_CARD_SECONDS

    scenes = [cover(VideoFileClip(p).without_audio()) for p in clips]
    base = concatenate_videoclips(scenes, method="compose")
    base = base.with_effects([vfx.Loop(duration=total)]) if base.duration < total else base.subclipped(0, total)
    # Visual hook: a hard punch-in that settles in 0.6 s, then a slow push.
    base = base.resized(lambda t: (1.22 - 0.22 * min(1.0, t / 0.6)) if t < HOOK_SECONDS else 1.0 + 0.012 * (t - HOOK_SECONDS) / 10)
    layers = [base.with_position("center"),
              ColorClip((W, H), color=(0, 0, 0)).with_opacity(0.2).with_duration(total)]

    def text(s, size, color="white", stroke=10):
        return TextClip(font=font, text=visual(s), font_size=size, color=color, stroke_color="black",
                        stroke_width=stroke, method="label", margin=(30, 30))

    # The hook headline for the first 2.5 s (second line in yellow).
    y = 420
    for i, line in enumerate(v["hook_screen"]):
        hot = line.startswith("*") and line.endswith("*")
        clip = text(line.strip("*"), 104 if i == 0 else 128, "#FFD23F" if hot else "white", 12)
        clip = clip.with_start(0).with_duration(HOOK_SECONDS).with_position(("center", y))
        clip = clip.resized(lambda t, d=i * 0.12: 0.6 + 0.4 * min(1.0, max(0.0, t - d) / 0.18))
        layers.append(clip)
        y += clip.h + 10

    # Word-by-word captions after the hook; each word stays until the next one.
    hot_words = {plain_word(w) for w in v["highlight"]}
    timed = [w for w in words if w["start"] >= HOOK_SECONDS - 0.05 and w["start"] < talk_end]
    for i, w in enumerate(timed):
        start = w["start"]
        until = timed[i + 1]["start"] if i + 1 < len(timed) else min(w["end"] + 0.35, talk_end)
        dur = max(0.12, until - start)
        shown = plain_word(w["word"]) + ("?" if w["word"].rstrip().endswith("?") else "")
        hot = any(plain_word(w["word"]).endswith(h) or plain_word(w["word"]) == h for h in hot_words)
        clip = text(shown, 132, "#FFD23F" if hot else "white", 12).with_start(start).with_duration(dur)
        clip = clip.resized(lambda t: 1.0 + 0.18 * max(0.0, 1 - t / 0.1)).with_position(("center", CAPTION_Y))
        layers.append(clip)

    # Honest label, always visible.
    label = text("נוצר בבינה מלאכותית", 34, "white", 3).with_opacity(0.85)
    layers.append(label.with_start(0).with_duration(talk_end).with_position(("center", H - 190)))

    # End card.
    card = [ColorClip((W, H), color=(43, 22, 110)).with_start(talk_end).with_duration(END_CARD_SECONDS)]
    for s, size, color, yy in (("סטודיו חינם", 150, "white", 640), ("הקישור בביו", 96, "#FFD23F", 840), (SITE_LABEL, 54, "white", 1010)):
        card.append(text(s, size, color, 8).with_start(talk_end).with_duration(END_CARD_SECONDS).with_position(("center", yy)))
    layers += card

    audio_parts = [voice.with_start(0)]
    if MUSIC_PATH:
        if not os.path.exists(MUSIC_PATH):
            raise Stop(f"MUSIC_PATH does not exist: {MUSIC_PATH}")
        music = AudioFileClip(MUSIC_PATH).with_effects(
            [afx.AudioLoop(duration=total), afx.MultiplyVolume(MUSIC_VOLUME), afx.AudioFadeOut(1.2)])
        audio_parts.append(music.with_start(0))
        log(f"edit: music {os.path.basename(MUSIC_PATH)} at {MUSIC_VOLUME:.2f}")
    else:
        log("edit: no MUSIC_PATH, so no background music (never a random track)")

    final = CompositeVideoClip(layers, size=(W, H)).with_duration(total).with_audio(CompositeAudioClip(audio_parts).with_duration(total))
    final.write_videofile(out_path, fps=FPS, codec="libx264", audio_codec="aac", audio_fps=48000, audio_bitrate="192k",
                          preset="medium", threads=4, ffmpeg_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"], logger=None)
    log(f"edit: {out_path} ({total:.1f}s, {os.path.getsize(out_path) // 1024} KB)")
    return total


# ------------------------------------------------------------ 5. Instagram

def _graph(method: str, path: str, token: str, **kw) -> dict:
    url = f"https://{GRAPH_HOST}/{GRAPH_VERSION}/{path.lstrip('/')}"
    try:
        r = requests.request(method, url, headers={"Authorization": f"Bearer {token}"}, timeout=kw.pop("timeout", 60), **kw)
    except requests.RequestException as e:  # never echo the URL or headers
        raise Stop(f"Instagram API unreachable: {type(e).__name__}")
    try:
        body = r.json()
    except ValueError:
        body = {}
    if not r.ok or "error" in body:
        err = body.get("error", {}) if isinstance(body, dict) else {}
        raise Stop(f"Instagram API {r.status_code}: {err.get('message', r.text[:200])} (code {err.get('code')})")
    return body


def publish_reel(video_path: str, caption: str) -> dict:
    token, user = ENV("IG_ACCESS_TOKEN", ""), ENV("IG_USER_ID", "")
    if not token or not user:
        raise Stop("IG_ACCESS_TOKEN and IG_USER_ID are required to post")
    size = os.path.getsize(video_path)
    # 1) container for a resumable upload of the local file
    c = _graph("POST", f"{user}/media", token, data={"media_type": "REELS", "upload_type": "resumable",
                                                      "caption": caption, "share_to_feed": "true"})
    cid = c["id"]
    uri = c.get("uri") or f"https://rupload.facebook.com/ig-api-upload/{GRAPH_VERSION}/{cid}"
    log(f"instagram: container {cid}, uploading {size // 1024} KB")
    with open(video_path, "rb") as f:
        try:
            up = requests.post(uri, headers={"Authorization": f"OAuth {token}", "offset": "0", "file_size": str(size)}, data=f, timeout=900)
        except requests.RequestException as e:
            raise Stop(f"upload failed: {type(e).__name__}")
    if not up.ok:
        raise Stop(f"upload failed: HTTP {up.status_code} {up.text[:200]}")
    # 2) wait until Instagram has processed the video
    status = ""
    for _ in range(90):
        s = _graph("GET", cid, token, params={"fields": "status_code,status"})
        status = s.get("status_code", "")
        if status == "FINISHED":
            break
        if status in ("ERROR", "EXPIRED"):
            raise Stop(f"Instagram could not process the video: {s.get('status', status)}")
        time.sleep(10)
    if status != "FINISHED":
        raise Stop("Instagram did not finish processing within 15 minutes")
    # 3) publish
    media_id = _graph("POST", f"{user}/media_publish", token, data={"creation_id": cid})["id"]
    # 4) read back: published only when Instagram returns the media and its permalink
    back = _graph("GET", media_id, token, params={"fields": "id,permalink,media_type,timestamp"})
    if back.get("id") != media_id or not back.get("permalink"):
        raise Stop("published, but the read-back did not return the media and its permalink")
    log(f"instagram: PUBLISHED {back['permalink']}")
    return {"media_id": media_id, "permalink": back["permalink"], "timestamp": back.get("timestamp"), "container_id": cid}


# ------------------------------------------------------------- preflight

def preflight_site() -> None:
    try:
        page = requests.get(SITE_URL, timeout=30)
        data = requests.get(HEALTHCHECK_URL, headers={"Origin": SITE_URL}, timeout=30)
    except requests.RequestException as e:
        raise Stop(f"the site is unreachable ({type(e).__name__}); not posting a reel that leads nowhere")
    ok = page.ok and data.ok
    try:
        ok = ok and data.json().get("ok") is True
    except ValueError:
        ok = False
    if not ok:
        raise Stop(f"the site is not healthy (page {page.status_code}, data {data.status_code}); not posting")
    log(f"preflight: {SITE_URL} and its data API answer")


# ------------------------------------------------------------- offline test

def offline_assets(v: dict, workdir: str) -> tuple[list[str], str, list[dict]]:
    """Stand-ins for the paid APIs, used only by --offline-render-test."""
    spans, t, parts = [], 0.0, []
    for i, s in enumerate(v["say"]):
        d = max(1.2, len(s) / 14.0)
        p = os.path.join(workdir, f"tone-{i}.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency={220 + 30 * i}:duration={d}",
                        "-ar", "44100", "-ac", "1", p], check=True)
        parts.append(p)
        spans.append((t, t + d))
        t += d
    voice = os.path.join(workdir, "voice.wav")
    lst = os.path.join(workdir, "list.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, voice], check=True)
    clips = []
    for i, src in enumerate(["testsrc2", "smptebars", "mandelbrot"][:SCENES]):
        p = os.path.join(workdir, f"scene-{i}.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"{src}=size=720x1280:rate=30", "-t", "5",
                        "-pix_fmt", "yuv420p", p], check=True)
        clips.append(p)
    return clips, voice, words_by_length(v["say"], spans)


# ------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--offline-render-test", action="store_true", help="check the editor with local stand-ins; no APIs, no posting")
    args = ap.parse_args()
    post = (ENV("POST_TO_INSTAGRAM", "1") or "1").strip().lower() not in ("0", "false", "no")
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, FINAL_NAME)
    result = {"site": SITE_URL, "at": dt.datetime.utcnow().isoformat() + "Z", "published": False}
    try:
        v = pick_variant()
        result["variant"] = v["id"]
        caption = build_caption(v)
        log(f"script: variant {v['id']}, {sum(len(s.split()) for s in v['say'])} words")
        with tempfile.TemporaryDirectory() as work:
            if args.offline_render_test:
                post = False
                clips, voice, words = offline_assets(v, work)
            else:
                if post:
                    preflight_site()
                voice, words = synthesize_voice(v["say"], work)
                clips = generate_clips(v["scenes"], work)
            result["seconds"] = round(edit(clips, voice, words, v, out_path), 2)
        result["file"] = out_path
        if post:
            result["instagram"] = publish_reel(out_path, caption)
            result["published"] = True
        else:
            log("render only (POST_TO_INSTAGRAM=0): not posted")
        code = 0
    except Stop as e:
        result["error"] = str(e)
        log(f"STOPPED: {e}")
        code = 2
    with open(os.path.join(OUT_DIR, "viral_reel_result.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    return code


if __name__ == "__main__":
    sys.exit(main())
