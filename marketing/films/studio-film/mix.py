"""Score + foley for סטודיו חינמי (Dark Tech Keynote): tuned percussion as a visible process, one sound family for the product.
Writes mix.wav (48 kHz stereo). Run from the library root: .venv/bin/python films/studio-film/mix.py
"""
import sys, wave
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "core" / "audio"))
from sfx import SR, t_, env_exp, lp, hp, bp, noise, norm, click, clack, whoosh, thump, ding, pop, add, limit  # noqa: E402

DUR, BPM = 20.0, 120.0
BEAT = 60 / BPM
buf = np.zeros((int(DUR * SR), 2))

def marimba(f, d=0.9, v=1.0):
    tt = t_(d)
    x = (np.sin(2 * np.pi * f * tt) * env_exp(d, 0.32) + 0.35 * np.sin(2 * np.pi * f * 3.9 * tt) * env_exp(d, 0.05)
         + 0.12 * np.sin(2 * np.pi * f * 9.2 * tt) * env_exp(d, 0.015))
    x[:96] *= np.linspace(0, 1, 96)
    return x * v * 0.5

def pad(fs, d, v=1.0):
    tt = t_(d)
    x = sum(np.sin(2 * np.pi * f * tt + k) + 0.3 * np.sin(2 * np.pi * f * 2.001 * tt) for k, f in enumerate(fs))
    e = np.minimum(1, tt / 1.2) * np.minimum(1, (d - tt) / 1.0)
    return lp(x, 1800) * e * v / len(fs)

def sine_drop(f0=900, f1=60, d=0.3, v=1.0):
    tt = t_(d); f = f0 * (f1 / f0) ** (tt / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, 0.08) * v

def shimmer(d=0.9, v=1.0):
    n = noise(d); tt = t_(d)
    return hp(n, 5000) * np.sin(np.pi * tt / d) ** 2 * v * 0.35 + sum(np.sin(2 * np.pi * f * tt) * env_exp(d, .4) for f in (2637, 3520, 4186)) * 0.05 * v

A3, C4, D4, E4, G4, A4, C5, E5 = 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 659.26
PATTERN = [A4, E4, C5, E4, G4, E4, D4, E4]          # eighths, one bar = 4 beats = 8 notes

# Additive process: the pattern enters note by note (bar 1 only the first note of each beat, then all),
# a second voice on the same pattern enters at 8 s an eighth late and drifts (phasing), everything stops at 16 s
# (the screen switches off) and one chord rings for the end card.
for i in range(int(16.0 / (BEAT / 2))):
    t = i * BEAT / 2
    k = i % 8
    if t < 2.0 and k % 2: continue
    gain = 0.55 if t < 4 else 0.7
    add(buf, marimba(PATTERN[k], v=gain), t, 0.9, pan=-0.15)
    if t >= 8.0:
        drift = (t - 8.0) * 0.012
        add(buf, marimba(PATTERN[(k + 3) % 8] * 2, v=0.32), t + BEAT / 4 + drift, 0.8, pan=0.35)
# low sine pulse on every beat from the phone's arrival
for b in range(int(2.0 / BEAT), int(16.0 / BEAT)):
    tt = t_(0.25); add(buf, np.sin(2 * np.pi * 55 * tt) * env_exp(0.25, 0.08) * 0.8, b * BEAT, 0.9)
# pad under the middle, ducked off at the switch-off
add(buf, pad([A3, C4, E4], 12.0, 1.0), 4.0, 0.22)
# end chord
for f in (A3, E4, A4, C5, E5):
    add(buf, marimba(f, d=2.6, v=0.8), 17.0, 0.55)
add(buf, pad([A3, E4, A4, C5], 3.0, 1.0), 17.0, 0.28)

# silence at the switch-off: digital zero for 0.28 s before the stamps
s0, s1 = int(16.02 * SR), int(16.3 * SR)
buf[s0:s1] *= np.linspace(1, 0, s1 - s0)[:, None] ** 4

FOLEY = {
    'impact': lambda: thump(1.0, 62) * 0.9 + np.pad(click(0.8), (0, int(.35 * SR) - len(click(0.8)))) * 0.4,
    'tick': lambda: click(1.6, 0.5), 'tap': lambda: click(1.2, 0.6),
    'whoosh': lambda: whoosh(0.4, 0.55), 'rise': lambda: whoosh(0.7, 0.4),
    'pop': lambda: pop(0.45), 'click': lambda: click(0.9, 0.9) + 0, 'shimmer': lambda: shimmer(0.9, 0.9),
    'ding': lambda: ding(0.55), 'glass': lambda: click(2.2, 0.55),
    'warn': lambda: (marimba(E4 * 1.06, 0.4, 0.8) + marimba(E4 * 0.97, 0.4, 0.8)),
    'thump': lambda: thump(0.8, 70), 'crtoff': lambda: sine_drop(1200, 50, 0.3, 0.6),
    'stamp': lambda: thump(1.0, 58) * 0.9, 'swell': lambda: shimmer(1.6, 0.7),
}
EV = [(0.0, 'impact'), (0.5, 'tap'), (0.75, 'tap'), (1.9, 'whoosh'), (2.25, 'pop'),
      (4.5, 'whoosh'), (4.85, 'glass'), (7.5, 'whoosh'), (7.85, 'glass'), (8.0, 'pop'), (10.5, 'whoosh'), (10.85, 'glass'), (10.9, 'glass'), (11.6, 'glass'), (13.5, 'whoosh'), (13.85, 'glass'),
      (16.0, 'crtoff'), (16.3, 'stamp'), (17.0, 'swell')]
PAN = {'warn': 0.25, 'glass': -0.2}
for t, kind in EV:
    add(buf, FOLEY[kind](), t, 0.8, PAN.get(kind, 0.0))

# fade the tail, limit, write
n = int(0.6 * SR); buf[-n:] *= np.linspace(1, 0, n)[:, None]
out = np.stack([limit(buf[:, 0] / max(1e-9, np.abs(buf).max()) * 0.9), limit(buf[:, 1] / max(1e-9, np.abs(buf).max()) * 0.9)], 1)
pcm = (np.clip(out, -1, 1) * 32767).astype('<i2')
with wave.open(str(HERE / 'mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('mix.wav', round(len(pcm) / SR, 2), 's')
