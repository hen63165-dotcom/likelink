#!/usr/bin/env python3
"""Luna's voice: Hebrew text-to-speech with open weights, no account and no key.

Engine: Chatterbox Multilingual (Resemble AI, MIT licence), which lists Hebrew
("he") among its languages. Runs on the CPU runner. Every clip carries the
model's built-in Perth watermark, so the audio stays identifiable as AI.

    python scripts/media/voice/speak.py --script scripts/media/voice/scripts/studio-phone.json \
        --out scripts/media/voice/samples

The script is a list of lines; each line becomes its own clip (so the reel can
time every caption to its own sentence) and lines.json records the durations.
A reference voice (--ref) is only ever the owner's own recording, with consent.
"""
import argparse
import json
import os
import subprocess
import sys
import time

import torch

# Chatterbox checkpoints were saved from CUDA; load everything onto the CPU.
_torch_load = torch.load
def _cpu_load(*a, **k):
    k.setdefault("map_location", "cpu")
    return _torch_load(*a, **k)
torch.load = _cpu_load

import torchaudio as ta  # noqa: E402
from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--script", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--ref", default=None, help="owner's own voice sample (wav), optional")
    a = p.parse_args()
    spec = json.load(open(a.script, encoding="utf-8"))
    os.makedirs(a.out, exist_ok=True)

    t0 = time.time()
    model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    print(f"model loaded in {time.time() - t0:.0f}s, sample rate {model.sr}", flush=True)

    report = {"engine": "chatterbox-multilingual", "license": "MIT", "language": "he",
              "watermark": "perth (built in)", "variants": []}
    for v in spec["variants"]:
        torch.manual_seed(v.get("seed", 1))
        clips = []
        for i, line in enumerate(spec["lines"]):
            t = time.time()
            kw = {"language_id": "he", "exaggeration": v.get("exaggeration", 0.5), "cfg_weight": v.get("cfg", 0.5)}
            if a.ref:
                kw["audio_prompt_path"] = a.ref
            wav = model.generate(line["say"], **kw)
            name = f"{spec['id']}-{v['id']}-{i + 1:02d}"
            wav_path = os.path.join(a.out, name + ".wav")
            ta.save(wav_path, wav, model.sr)
            dur = wav.shape[-1] / model.sr
            clips.append({"line": i + 1, "file": name + ".m4a", "seconds": round(dur, 2), "say": line["say"]})
            print(f"{name}: {dur:.2f}s audio in {time.time() - t:.0f}s", flush=True)
        # One continuous track too (0.15 s between lines), for quick listening.
        listing = os.path.join(a.out, f"{v['id']}-list.txt")
        with open(listing, "w") as f:
            for c in clips:
                f.write(f"file '{os.path.abspath(os.path.join(a.out, c['file'][:-4] + '.wav'))}'\n")
        full = os.path.join(a.out, f"{spec['id']}-{v['id']}-full.m4a")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing,
                        "-af", "apad=pad_dur=0.15", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", full], check=True)
        os.remove(listing)
        for c in clips:
            w = os.path.join(a.out, c["file"][:-4] + ".wav")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", w, "-c:a", "aac", "-b:a", "128k",
                            "-ar", "48000", os.path.join(a.out, c["file"])], check=True)
            os.remove(w)
        report["variants"].append({**v, "full": os.path.basename(full), "clips": clips})
    json.dump(report, open(os.path.join(a.out, f"{spec['id']}-lines.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("done", flush=True)


if __name__ == "__main__":
    sys.exit(main())
