"""Luna's voice: one audio clip per beat (hook + each line).

Engines, all free, no credit card:
  edge        Microsoft Edge read-aloud voices through the open-source
              `edge-tts` package (he-IL-HilaNeural). Natural Hebrew, fast.
              It is an unofficial use of a free Microsoft service: it can be
              rate-limited or stop working, and Microsoft publishes no
              commercial licence for it. The fallback chain covers outages.
  gtts        Google Translate's voice through `gTTS`. Plainer, also unofficial.
  chatterbox  Our own open model (Chatterbox Multilingual, MIT) through
              scripts/media/voice/speak.py: slow on a CPU, but the cleanest
              licence, and every line is read back by Hebrew speech
              recognition and only kept when it matches the script.
  file:PATH   Your own recording of the whole script (the strongest option:
              a real voice, still anonymous). Lines are timed by text length.
  none        Silent: captions carry the reel; add a trending sound in the app.

Each beat's duration comes from its real audio, so captions follow the voice.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

EDGE_VOICE = os.environ.get("LUNA_EDGE_VOICE", "he-IL-HilaNeural")
EDGE_RATE = os.environ.get("LUNA_EDGE_RATE", "+12%")
CHARS_PER_SEC = 13.0      # silent / single-file timing: an easy Hebrew reading pace
MIN_BEAT, PAD = 1.4, 0.12  # never flash a caption; a short breath between beats


@dataclass
class Clip:
    text: str
    seconds: float
    path: Path | None = None
    # (start, duration, word) from the voice engine, when it reports them
    # (edge-tts WordBoundary events): captions then follow each spoken word.
    words: list[tuple[float, float, str]] | None = None


class VoiceError(RuntimeError):
    pass


def estimate(text: str) -> float:
    return max(MIN_BEAT, len(text) / CHARS_PER_SEC)


def audio_seconds(path: Path) -> float:
    """Duration with ffprobe (ships with FFmpeg)."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, timeout=60,
    )
    try:
        return float(out.stdout.strip())
    except ValueError as exc:
        raise VoiceError(f"cannot read the length of {path.name}") from exc


def _retry(fn, attempts=3, wait=2.0):
    last = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:  # network engines fail transiently
            last = exc
            time.sleep(wait * (2 ** i))
    raise VoiceError(str(last))


def _edge(text: str, dst: Path, voice: str = EDGE_VOICE) -> list[tuple[float, float, str]]:
    """Speak with an Edge voice and collect each word's timing (100 ns units → s)."""
    import edge_tts  # noqa: PLC0415 (optional dependency)

    async def run():
        words = []
        comm = edge_tts.Communicate(text, voice, rate=EDGE_RATE, boundary="WordBoundary")
        with open(dst, "wb") as fh:
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    fh.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    words.append((chunk["offset"] / 1e7, chunk["duration"] / 1e7, chunk["text"]))
        return words

    words = asyncio.run(asyncio.wait_for(run(), timeout=90))
    if not dst.exists() or dst.stat().st_size < 1000:
        raise VoiceError("edge-tts returned no audio")
    return words


def _gtts(text: str, dst: Path) -> None:  # no word timings from gTTS
    from gtts import gTTS  # noqa: PLC0415 (optional dependency)

    gTTS(text, lang="iw").save(str(dst))
    if not dst.exists() or dst.stat().st_size < 1000:
        raise VoiceError("gTTS returned no audio")


def _chatterbox(texts: list[str], out_dir: Path, eid: str) -> list[Clip]:
    root = Path(__file__).resolve().parents[3]
    speak = root / "scripts" / "media" / "voice" / "speak.py"
    spec = {"id": eid, "variants": [{"id": "calm", "exaggeration": 0.5, "cfg": 0.5, "temperature": 0.6, "seed": 11}],
            "lines": [{"say": t} for t in texts]}
    spec_path = out_dir / f"{eid}-voice.json"
    spec_path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    subprocess.run([sys.executable, str(speak), "--script", str(spec_path), "--out", str(out_dir), "--takes", "3"],
                   check=True, timeout=5400)
    report = json.loads((out_dir / f"{eid}-lines.json").read_text(encoding="utf-8"))
    variant = report["variants"][0]
    if not variant.get("pass"):
        bad = [c["line"] for c in variant["clips"] if not c.get("pass")]
        raise VoiceError(f"chatterbox: lines {bad} did not read back cleanly; not using a voice with mistakes")
    return [Clip(text=c["say"], seconds=float(c["seconds"]), path=out_dir / c["file"]) for c in variant["clips"]]


def synthesize(texts: list[str], engine: str, out_dir: Path, eid: str = "reel", fallback: bool = True,
               edge_voice: str = EDGE_VOICE) -> tuple[list[Clip], str]:
    """Audio for every beat. Returns (clips, the engine actually used)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    chain = [engine] + (["gtts", "none"] if fallback and engine == "edge" else ["none"] if fallback and engine != "none" else [])
    errors = []
    for name in chain:
        try:
            if name == "none":
                return [Clip(t, estimate(t)) for t in texts], "none"
            if name.startswith("file:"):
                return _from_recording(texts, Path(name[5:]), out_dir), "file"
            if name == "chatterbox":
                return _chatterbox(texts, out_dir, eid), "chatterbox"
            if name not in ("edge", "gtts"):
                raise VoiceError(f"unknown voice engine '{name}'")
            clips = []
            for i, text in enumerate(texts):
                dst = out_dir / f"{eid}-{i:02d}.mp3"
                if name == "edge":
                    words = _retry(lambda: _edge(text, dst, edge_voice))
                else:
                    _retry(lambda: _gtts(text, dst))
                    words = None
                clips.append(Clip(text, audio_seconds(dst), dst, words or None))
            return clips, name
        except Exception as exc:  # report and fall back; never stop at a half-voiced reel
            errors.append(f"{name}: {exc}")
            print(f"[voice] {name} failed: {exc}", file=sys.stderr)
    raise VoiceError("; ".join(errors))


def _from_recording(texts: list[str], recording: Path, out_dir: Path) -> list[Clip]:
    """One recording of the whole script: split the time by text length."""
    if not recording.exists():
        raise VoiceError(f"recording not found: {recording}")
    total = audio_seconds(recording)
    weights = [max(1, len(t)) for t in texts]
    scale = total / sum(weights)
    dst = out_dir / f"recording{recording.suffix}"
    shutil.copyfile(recording, dst)
    clips = [Clip(t, w * scale) for t, w in zip(texts, weights)]
    clips[0].path = dst  # the whole recording plays from the first beat
    return clips


def silent_track(seconds: float, dst: Path) -> Path:
    """A silent AAC track (Instagram's Reels API requires audio)."""
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                    "-t", f"{seconds:.3f}", "-c:a", "aac", "-b:a", "96k", str(dst)], check=True, timeout=120)
    return dst


def temp_dir() -> Path:
    return Path(tempfile.mkdtemp(prefix="luna-voice-"))
