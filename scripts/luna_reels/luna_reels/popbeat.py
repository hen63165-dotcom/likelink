"""An original, upbeat pop/house bed made from numbers (no sample, no licence to clear).
122 BPM, A minor vi-IV-I-V (Am F C G): four-on-the-floor kick, claps on 2 and 4, off-beat hats,
an off-beat plucked bass, a side-chained supersaw pad and a plucked arpeggio. No risers or whooshes."""
import sys, wave, subprocess
from pathlib import Path
import numpy as np

SR = 44100
BPM = 122
BEAT = 60 / BPM
BAR = 4 * BEAT
CHORDS = [  # (bass root, chord tones), one chord per bar
    (110.00, [220.00, 261.63, 329.63]),  # Am
    (87.31, [174.61, 220.00, 261.63]),   # F
    (130.81, [261.63, 329.63, 392.00]),  # C
    (98.00, [196.00, 246.94, 293.66]),   # G
]

def lp(x, cutoff):
    """One-pole low-pass as a short exponential FIR (vectorised)."""
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    k = a * (1 - a) ** np.arange(int(6 / a) + 1)
    return np.convolve(x, k)[: len(x)]

def hp(x, cutoff):
    return x - lp(x, cutoff)

def saw(f, t):
    return 2 * ((f * t) % 1.0) - 1

def place(out, sig, start):
    i = int(start * SR)
    if i >= len(out): return
    j = min(len(out), i + len(sig))
    out[i:j] += sig[: j - i]

def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 50 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.16)
    click = np.exp(-t / 0.003) * 0.4
    return body + click

def clap(rng):
    n = int(0.22 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    env = np.exp(-t / 0.07)
    for d in (0.0, 0.011, 0.022):  # three hand taps
        m = (t >= d) & (t < d + 0.008)
        env[m] += 0.6
    return hp(lp(noise, 5000), 900) * env * 0.6

def hat(rng, length=0.035):
    n = int(length * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t / (length / 3))

def bass_note(f, length):
    n = int(length * SR); t = np.arange(n) / SR
    x = 0.6 * saw(f, t) + 0.4 * np.sin(2 * np.pi * f * t)
    x = lp(x, 900)
    return x * np.exp(-t / 0.16) * np.minimum(1, t / 0.004)

def pad(chord, length):
    n = int(length * SR); t = np.arange(n) / SR
    x = sum(saw(f * d, t) for f in chord for d in (0.994, 1.0, 1.006)) / (3 * len(chord))
    x = lp(x, 2200)
    return x * np.minimum(1, t / 0.02) * np.minimum(1, (length - t) / 0.05)

def pluck(f, length=0.22):
    n = int(length * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.15 * saw(f, t)
    return lp(x, 3500) * np.exp(-t / 0.09) * np.minimum(1, t / 0.002)

def build(seconds, seed=11):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    drums = np.zeros(n); music = np.zeros(n); lead = np.zeros(n)
    K, bars = kick(), int(np.ceil(seconds / BAR))
    for b in range(bars):
        root, chord = CHORDS[b % 4]
        t0 = b * BAR
        place(music, pad(chord, BAR) * 0.9, t0)
        for q in range(4):
            tb = t0 + q * BEAT
            place(drums, K * 0.95, tb)
            if q in (1, 3): place(drums, clap(rng) * 0.55, tb)
            place(drums, hat(rng) * 0.22, tb + BEAT / 2)            # off-beat hat
            place(drums, hat(rng, 0.02) * 0.08, tb + BEAT / 4)      # ghost 16ths
            place(drums, hat(rng, 0.02) * 0.08, tb + 3 * BEAT / 4)
            place(music, bass_note(root, BEAT / 2) * 0.55, tb + BEAT / 2)  # off-beat bass
        arp = [chord[0] * 2, chord[1] * 2, chord[2] * 2, chord[1] * 2]
        for s in range(8):  # eighth-note arpeggio, one octave up
            place(lead, pluck(arp[s % 4]) * 0.32, t0 + s * BEAT / 2)
    # side-chain pump on the pad + bass: duck right after every kick
    t = np.arange(n) / SR
    since = (t % BEAT)
    pump = 1 - 0.6 * np.exp(-since / 0.09)
    music *= pump
    # a dotted-eighth echo on the lead
    d = int(0.75 * BEAT * SR)
    echo = np.zeros(n); echo[d:] = lead[:-d] * 0.28
    mix = drums + music + lead + lp(echo, 2500)
    mix = np.tanh(1.3 * mix) / np.tanh(1.3)
    return mix / (np.abs(mix).max() or 1) * 0.9

def write(seconds, dst):
    # The owner, 27.11: no made-up music under a post (music.generated_music_on): silence unless
    # LIKELINK_GENERATED_MUSIC=1; the trending sound comes from the platform's own library.
    import os
    x = build(seconds) if os.environ.get("LIKELINK_GENERATED_MUSIC") == "1" else np.zeros(int(float(seconds) * SR))
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    wav = Path(dst).with_suffix(".wav")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    return wav

if __name__ == "__main__":
    print(write(float(sys.argv[1]), sys.argv[2]))
