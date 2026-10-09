"""A soft lo-fi bed under the voice, made here from numbers (no licence to clear).

`--music beat` writes a loop: a warm chord pad (Am7 → Fmaj7 → Cmaj7 → G6),
a soft kick and snare, a lazy hi-hat and a little vinyl crackle, at 82 BPM.
It sits at -20 dB under the voice (the brief's level). For a trending sound,
leave the reel's music off and pick one in the Instagram app when posting:
Instagram's library is licensed for Reels, a downloaded track usually is not.
"""
from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 82
BED_DB = -20.0
CHORDS = [  # Hz, one chord per bar
    [220.00, 261.63, 329.63, 392.00],   # Am7
    [174.61, 220.00, 261.63, 329.63],   # Fmaj7
    [130.81, 164.81, 196.00, 246.94],   # Cmaj7
    [196.00, 246.94, 293.66, 329.63],   # G6
]


def db_to_gain(db: float) -> float:
    return float(10 ** (db / 20))


def _env(n: int, attack: float, release: float) -> np.ndarray:
    a, r = max(1, int(attack * SR)), max(1, int(release * SR))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def _lowpass(x: np.ndarray, alpha: float) -> np.ndarray:
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):  # one-pole filter: enough to round off the pad
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def beat(seconds: float, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    beat_s = 60 / BPM
    bar = 4 * beat_s
    n = int(seconds * SR)
    out = np.zeros(n)
    t_bar = np.arange(int(bar * SR)) / SR
    # Pad: detuned triangles per chord, low-passed.
    pads = []
    for chord in CHORDS:
        tone = sum(2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * d * t_bar)) for f in chord for d in (1.0, 1.003))
        tone = tone / (len(chord) * 2) * _env(len(t_bar), 0.25, 0.4)
        pads.append(_lowpass(tone, 0.08) * 0.55)
    kick_t = np.arange(int(0.25 * SR)) / SR
    kick = np.sin(2 * np.pi * (55 + 70 * np.exp(-kick_t * 30)) * kick_t) * np.exp(-kick_t * 14)
    snare = rng.normal(0, 1, int(0.18 * SR)) * np.exp(-np.arange(int(0.18 * SR)) / SR * 22) * 0.35
    hat = rng.normal(0, 1, int(0.05 * SR)) * np.exp(-np.arange(int(0.05 * SR)) / SR * 90) * 0.12
    k = 0
    pos = 0.0
    while pos < seconds:
        start = int(pos * SR)
        pad = pads[k % len(pads)]
        end = min(n, start + len(pad))
        out[start:end] += pad[: end - start]
        for b in range(4):
            bt = int((pos + b * beat_s) * SR)
            for sample, at in ((kick, bt if b in (0, 2) else None), (snare, bt if b in (1, 3) else None)):
                if at is not None and at < n:
                    e = min(n, at + len(sample))
                    out[at:e] += sample[: e - at]
            for h in (0, 0.5):  # swung eighths
                ht = int((pos + (b + h + (0.08 if h else 0)) * beat_s) * SR)
                if ht < n:
                    e = min(n, ht + len(hat))
                    out[ht:e] += hat[: e - ht]
        pos += bar
        k += 1
    crackle = (rng.random(n) > 0.9993) * rng.normal(0, 0.25, n)
    out += _lowpass(crackle, 0.5)
    out /= max(1e-6, np.max(np.abs(out)))
    fade = _env(n, 0.8, 1.2)
    return out * fade


def write_bed(seconds: float, dst: Path, db: float = BED_DB) -> Path:
    """A stereo AAC bed at `db` (default -20 dB full-scale peak)."""
    x = beat(seconds) * db_to_gain(db)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    wav = dst.with_suffix(".wav")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "128k", str(dst)],
                   check=True, timeout=120)
    wav.unlink(missing_ok=True)
    return dst
