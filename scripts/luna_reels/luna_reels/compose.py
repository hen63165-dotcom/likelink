"""Assemble one reel: background + hook + captions + product + end card + audio.

Layout keeps to Instagram's safe zone: nothing important in the top ~200 px
(the Reels header), the bottom ~400 px (name, caption) or the right edge
above the bottom (like / comment / share buttons).

Timeline (seconds):  hook | line 1 | line 2 | ... | end card
Each beat lasts as long as its voice clip (+ a short breath); without a voice,
as long as it takes to read. Captions follow the voice word by word: with
Edge voices from the engine's own word timings, otherwise spread by length.

Caption styles:
  karaoke  the whole line in a dark box, the spoken word on a yellow pill
  pop      2-3 big words at a time in the centre, the spoken word in colour,
           outlined and shadowed, each word popping in (the fast Reels look)
Tiers:
  free     LikeLink2 branding: series tag, logo watermark, and the outro
           "גלו מה שווה לקנות דרך אנשים · LikeLink2" with the site address
  pro      no LikeLink2 tag, watermark or outro; your own logo if you pass one
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from moviepy import AudioFileClip, CompositeAudioClip, CompositeVideoClip, ImageClip, VideoClip, VideoFileClip, vfx
from PIL import Image

from . import brand, music, text, visuals
from .script import Episode, spoken_text
from .voice import PAD, Clip, silent_track

W, H = brand.WIDTH, brand.HEIGHT
END_SECONDS = 3.0
CAPTION_Y = 1290      # karaoke box centre
POP_Y = 1250          # pop words centre: lower-middle, below faces and products
HOOK_Y = 1230
CARD_Y = 740          # product card centre (karaoke)
CARD_Y_POP = 620      # product card centre (pop)
TOP_Y = 236
OUTRO_SLOGAN = "גלו מה שווה לקנות דרך אנשים"


@dataclass
class Beat:
    start: float
    seconds: float      # spoken part
    end: float          # spoken part + breath
    caption: str
    clip: Clip


def timeline(episode: Episode, clips: list[Clip]) -> tuple[list[Beat], float]:
    beats, t = [], 0.0
    for line, clip in zip(episode.beats, clips):
        if line.t is not None and clip.path is None:
            t = max(t, line.t)  # a timestamp from the script, when there is no voice to follow
        dur = max(clip.seconds, 0.6)
        beats.append(Beat(start=t, seconds=dur, end=t + dur + PAD, caption=line.caption, clip=clip))
        t += dur + PAD
    return beats, t + END_SECONDS


def _norm(word: str) -> str:
    return re.sub(r"[^\w]", "", word.replace("*", "")).translate(str.maketrans("ךםןףץ", "כמנפצ"))


def word_times(beat: Beat) -> list[tuple[float, float]]:
    """(start, duration) for each caption word.

    Same words as spoken → the voice's own timing per word. Otherwise the
    caption is spread over the time the voice actually speaks (from the first
    word to the last), weighted by word length.
    """
    words = [w for w, _ in text.tokens(beat.caption)]
    spoken = beat.clip.words or []
    if spoken and [_norm(w) for w in words] == [_norm(w) for _, _, w in spoken]:
        return [(beat.start + s, max(0.12, d)) for s, d, _ in spoken]
    t0, t1 = 0.0, beat.seconds
    if spoken:
        t0 = spoken[0][0]
        t1 = spoken[-1][0] + spoken[-1][1]
    weights = [max(2, len(w)) for w in words] or [1]
    total = sum(weights)
    out, t = [], beat.start + t0
    for wgt in weights:
        d = (t1 - t0) * wgt / total
        out.append((t, d))
        t += d
    return out


def _img_clip(img: Image.Image, start: float, dur: float, pos) -> ImageClip:
    return ImageClip(np.array(img.convert("RGBA")), duration=max(0.04, dur)).with_start(start).with_position(pos)


def _popping(img: Image.Image, start: float, dur: float, cy: int, peak: float = 1.12, settle: float = 0.14) -> ImageClip:
    """An overlay that pops in (overshoots, then settles), centred on (W/2, cy)."""
    w, h = img.size
    scale = lambda t: 1.0 + (peak - 1.0) * max(0.0, 1 - t / settle)  # noqa: E731
    return (ImageClip(np.array(img.convert("RGBA")), duration=max(0.04, dur)).with_start(start)
            .resized(scale).with_position(lambda t: ((W - w * scale(t)) / 2, cy - h * scale(t) / 2)))


def background(total: float, visual: str, work: Path):
    """The moving backdrop: Luna with a slow push-in, or a character / stock video."""
    if visual.startswith("video:"):
        src = visual[6:]
        path = Path(src) if Path(src).exists() else visuals.download(src, work / "media", kind="video")
        clip = VideoFileClip(str(path), audio=False)
        scale = max(W / clip.w, H / clip.h)
        clip = clip.resized(scale)
        clip = clip.cropped(x_center=clip.w / 2, y_center=clip.h / 2, width=W, height=H)
        if clip.duration < total:
            clip = clip.with_effects([vfx.Loop(duration=total)])
        return clip.with_duration(total)
    if visual == "aurora":
        return _aurora(total)
    # Still Luna: an eased push-in with a slight sway reads as a camera, not a slideshow.
    big = visuals.cover(Image.open(brand.LUNA).convert("RGB"), (int(W * 1.12), int(H * 1.12)))
    arr = np.array(big)
    bw, bh = big.size

    def frame(t):
        k = t / max(total, 0.01)
        zoom = 1.02 + 0.07 * (0.5 - 0.5 * math.cos(math.pi * k))   # eases from 1.02 to 1.09
        win_w, win_h = int(bw / zoom), int(bh / zoom)
        sway = int(10 * math.sin(2 * math.pi * t / 6.0))
        x0 = max(0, min(bw - win_w, (bw - win_w) // 2 + sway))
        y0 = max(0, min(bh - win_h, int((bh - win_h) * 0.4)))
        crop = Image.fromarray(arr[y0:y0 + win_h, x0:x0 + win_w])
        return np.array(crop.resize((W, H), Image.BILINEAR))

    return VideoClip(frame_function=frame, duration=total)


def _aurora(total: float):
    """The site's look as a moving backdrop: brand colours drifting on ink (no character)."""
    small_w, small_h = 108, 192
    yy, xx = np.mgrid[0:small_h, 0:small_w].astype(np.float32)
    blobs = [((210, 47, 93), 0.9, 0.0), ((109, 74, 255), 1.3, 2.1), ((15, 181, 212), 0.7, 4.2), ((255, 159, 90), 1.1, 1.0)]

    def frame(t):
        img = np.zeros((small_h, small_w, 3), np.float32) + np.array(brand.INK, np.float32)
        for color, speed, phase in blobs:
            cx = small_w * (0.5 + 0.38 * math.sin(speed * t * 0.35 + phase))
            cy = small_h * (0.5 + 0.36 * math.cos(speed * t * 0.27 + phase * 1.7))
            g = np.exp(-(((xx - cx) / 46) ** 2 + ((yy - cy) / 64) ** 2))[..., None]
            img += g * (np.array(color, np.float32) - img) * 0.85
        return np.array(Image.fromarray(img.clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC))

    return VideoClip(frame_function=frame, duration=total)


def _shade() -> Image.Image:
    """A soft dark gradient over the lower half, so white text reads on any footage."""
    a = Image.new("L", (1, H))
    a.putdata([0 if y < H * 0.45 else int(120 * ((y - H * 0.45) / (H * 0.55)) ** 1.2) for y in range(H)])
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shade.putalpha(a.resize((W, H)))
    return shade


def _captions(beats: list[Beat], style: str) -> list:
    layers = []
    for n, beat in enumerate(beats[1:]):
        times = word_times(beat)
        if not times:
            continue
        if style == "pop":
            for ci, (a, b) in enumerate(text.chunks(beat.caption)):
                chunk_words = text.tokens(beat.caption)[a:b + 1]
                chunk = " ".join(f"*{w}*" if e else w for w, e in chunk_words)
                for k in range(a, b + 1):
                    t0 = times[k][0]
                    t_next = times[k + 1][0] if k + 1 < len(times) else beat.end
                    img = text.pop(chunk, active=k - a, color_index=n + ci)
                    first = k == a
                    layers.append(_popping(img, t0, t_next - t0, POP_Y, peak=1.16 if first else 1.05,
                                           settle=0.16 if first else 0.09))
        else:
            for i, (t0, d) in enumerate(times):
                last = i == len(times) - 1
                img = text.caption(beat.caption, active=i)
                dur = (beat.end - t0) if last else d
                layers.append(_img_clip(img, t0, dur, ((W - img.width) // 2, CAPTION_Y - img.height // 2)))
    return layers


def build(episode: Episode, clips: list[Clip], *, visual: str, product: dict | None, work: Path,
          voiced: bool, music_src: str | None = None, captions: str = "karaoke", tier: str = "free",
          logo: str | None = None, character: bool = True) -> tuple[CompositeVideoClip, list[Beat], float]:
    beats, total = timeline(episode, clips)
    end_at = total - END_SECONDS
    free = tier != "pro"
    bg_clip = background(total, visual, work)
    layers = [bg_clip, _img_clip(_shade(), 0, end_at, (0, 0))]

    if free:
        # The LikeLink2 wordmark (top left): the watermark of the free tier.
        layers.append(_img_clip(text.wordmark(46), 0, end_at, (44, TOP_Y)))
    elif logo:
        own = Image.open(logo).convert("RGBA")
        own.thumbnail((180, 120), Image.LANCZOS)
        layers.append(_img_clip(own, 0, total, (52, TOP_Y)))

    # Hook: pops in, stays for the first beat.
    hook_beat = beats[0]
    hook_img = text.hook(hook_beat.caption) if captions == "karaoke" else text.pop(hook_beat.caption, active=-1, size=124)
    layers.append(_popping(hook_img, 0, hook_beat.end, HOOK_Y, peak=1.18, settle=0.22))

    layers.extend(_captions(beats, captions))

    # Product: the store's own photo and the seller's own claim, sliding up.
    if product:
        at = beats[min(product["at"], len(beats) - 1)]
        card = visuals.product_card(product.get("photo"), product.get("claim", ""))
        cw, ch = card.size
        y_end = (CARD_Y if captions != "pop" else CARD_Y_POP) - ch // 2
        slide = lambda t: y_end + max(0.0, 1 - t / 0.35) ** 2 * 420  # noqa: E731
        layers.append(_img_clip(card, at.start, end_at - at.start, lambda t: ((W - cw) // 2, slide(t))))

    # Disclosures, small, in a corner: the ad tag (only when a product is shown) and AI.
    short = brand.corner_label(character, voiced)
    labels = (["#פרסומת · קישור שותפים"] if product else []) + ([short] if short else [])
    if labels:
        sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        visuals.corner(sheet, labels)
        layers.append(_img_clip(sheet, 0, end_at, (0, 0)))

    # Outro: the reel's own last frame, blurred, with the call to action and a pulsing button.
    cta = episode.cta or {}
    end, button_y = visuals.outro(Image.fromarray(bg_clip.get_frame(max(0.0, end_at - 0.05))),
                                  slogan=OUTRO_SLOGAN if free else None, branded=free, logo=None if free else logo,
                                  title=cta.get("title") or f"כתבי \"{brand.COMMENT_KEYWORD}\" בתגובות",
                                  sub=cta.get("sub") or "ואשלח לך את הקישור בפרטי", labels=labels)
    layers.append(_img_clip(end, end_at, END_SECONDS, (0, 0)).with_effects([vfx.CrossFadeIn(0.25)]))
    if free:
        btn = text.button(brand.SITE_URL)
        bw, bh = btn.size
        pulse = lambda t: 1.0 + 0.045 * math.sin(2 * math.pi * 1.3 * t)  # noqa: E731
        layers.append(ImageClip(np.array(btn), duration=END_SECONDS - 0.35).with_start(end_at + 0.35).resized(pulse)
                      .with_position(lambda t: ((W - bw * pulse(t)) / 2, button_y - bh * pulse(t) / 2)))

    video = CompositeVideoClip(layers, size=(W, H)).with_duration(total)
    return video.with_audio(_audio(beats, total, work, music_src)), beats, total


def _audio(beats: list[Beat], total: float, work: Path, music_src: str | None):
    tracks = [AudioFileClip(str(silent_track(total, work / "silence.m4a")))]
    for beat in beats:
        if beat.clip.path is not None:
            a = AudioFileClip(str(beat.clip.path))
            tracks.append(a.with_start(beat.start).with_duration(min(a.duration, total - beat.start)))
    if music_src:
        if music_src == "beat":
            bed = AudioFileClip(str(music.write_bed(total, work / "bed.m4a")))
        else:  # your own file (one you have the rights to), brought to -20 dB under the voice
            from moviepy import afx  # noqa: PLC0415
            bed = AudioFileClip(music_src).with_effects([afx.AudioLoop(duration=total), afx.MultiplyVolume(music.db_to_gain(music.BED_DB))])
        tracks.append(bed.with_duration(total))
    return CompositeAudioClip(tracks).with_duration(total)


def voice_track(beats: list[Beat], total: float, dst: Path) -> Path:
    """All voice clips on one track at their beat times (for the talking-face render)."""
    import subprocess  # noqa: PLC0415

    inputs, filters = [], []
    for i, beat in enumerate(b for b in beats if b.clip.path is not None):
        inputs += ["-i", str(beat.clip.path)]
        filters.append(f"[{i}:a]adelay={int(beat.start * 1000)}|{int(beat.start * 1000)}[a{i}]")
    if not inputs:
        return silent_track(total, dst)
    mix = "".join(f"[a{i}]" for i in range(len(filters)))
    graph = ";".join(filters) + f";{mix}amix=inputs={len(filters)}:normalize=0,apad=whole_dur={total:.2f}[out]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[out]",
                    "-t", f"{total:.2f}", "-ac", "1", "-ar", "16000", str(dst)], check=True, timeout=300)
    return dst


def render(video: CompositeVideoClip, dst: Path, preview: Path | None = None) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    video.write_videofile(
        str(dst), fps=brand.FPS, codec="libx264", audio_codec="aac", audio_fps=48000, preset="medium", threads=4,
        ffmpeg_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "20"], logger=None,
    )
    if preview is not None:
        # Hook, the middle and the end card, side by side, for a quick look.
        times = [0.6, video.duration * 0.55, video.duration - 1.0]
        frames = [Image.fromarray(video.get_frame(t)).resize((360, 640)) for t in times]
        sheet = Image.new("RGB", (360 * len(frames) + 20 * (len(frames) - 1), 640), "white")
        for i, f in enumerate(frames):
            sheet.paste(f, (i * 380, 0))
        sheet.save(preview, quality=88)


def spoken(episode: Episode) -> list[str]:
    return [spoken_text(b.say) for b in episode.beats]
