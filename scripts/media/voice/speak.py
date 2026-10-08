#!/usr/bin/env python3
"""Luna's voice: Hebrew text-to-speech with open weights, no account and no key.

Engine: Chatterbox Multilingual (Resemble AI, MIT licence), which lists Hebrew
("he") among its languages. Runs on the CPU runner. Every clip carries the
model's built-in Perth watermark, so the audio stays identifiable as AI.

    python scripts/media/voice/speak.py --script scripts/media/voice/scripts/studio-phone.json \
        --out scripts/media/voice/samples [--takes 3]

Quality gate (nothing is kept on faith):
  • Hebrew vowel marks (niqqud) come from Dicta's open model (DICTA_MODEL),
    the input the Hebrew voice was trained on.
  • Every line is spoken several times (takes); each take is transcribed back
    with a Hebrew speech-recognition model (ivrit.ai Whisper), scored by
    character error rate against the script and by a speaking-rate limit, and
    the best take is kept. lines.json records the transcript and the score of
    every take, and `pass` is true only when the kept take reads back cleanly.
A reference voice (--ref) is only ever the owner's own recording, with consent.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import unicodedata

import torch

# Chatterbox checkpoints were saved from CUDA; load everything onto the CPU.
_torch_load = torch.load
def _cpu_load(*a, **k):
    k.setdefault("map_location", "cpu")
    return _torch_load(*a, **k)
torch.load = _cpu_load

import torchaudio as ta  # noqa: E402
from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: E402

ASR_MODEL = os.environ.get("LIKELINK_ASR_MODEL", "ivrit-ai/whisper-large-v3-turbo-ct2")
MAX_CER = 0.25          # a kept take must read back at least ~75% right
MIN_CHARS_PER_SEC = 6   # slower than this means the model babbled or stalled


def plain(s):
    """Letters only: no niqqud, punctuation or spaces, final letters folded."""
    s = "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))
    s = s.translate(str.maketrans("ךםןףץ", "כמנפצ"))
    return re.sub(r"[^א-ת0-9a-z]", "", s.lower())


def cer(ref, hyp):
    r, h = plain(ref), plain(hyp)
    if not r:
        return 1.0
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        cur = [i]
        for j, hc in enumerate(h, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc)))
        prev = cur
    return prev[-1] / len(r)


def setup_niqqud():
    """Give Chatterbox's Hebrew path a working Dicta (it calls Dicta() without the model file)."""
    path = os.environ.get("DICTA_MODEL")
    if not path or not os.path.exists(path):
        print("niqqud: OFF (no DICTA_MODEL file)", flush=True)
        return None
    from dicta_onnx import Dicta
    import chatterbox.models.tokenizers.tokenizer as tk
    tk._dicta = Dicta(path)
    print(f"niqqud: ON ({os.path.basename(path)})", flush=True)
    return tk._dicta


def trim(src, dst):
    """Cut leading/trailing silence and encode AAC 48 kHz."""
    edge = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src,
                    "-af", f"{edge},areverse,{edge},areverse",
                    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", dst], check=True)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst],
                         capture_output=True, text=True, check=True).stdout.strip()
    return round(float(out), 2)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--script", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--takes", type=int, default=3)
    p.add_argument("--ref", default=None, help="owner's own voice sample (wav), optional")
    a = p.parse_args()
    spec = json.load(open(a.script, encoding="utf-8"))
    os.makedirs(a.out, exist_ok=True)
    tmp = os.path.join(a.out, ".takes")
    os.makedirs(tmp, exist_ok=True)

    dicta = setup_niqqud()
    if dicta:
        print("niqqud sample:", dicta.add_diacritics(spec["lines"][0]["say"]), flush=True)

    t0 = time.time()
    model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    print(f"tts loaded in {time.time() - t0:.0f}s, sample rate {model.sr}", flush=True)
    from faster_whisper import WhisperModel
    asr = WhisperModel(ASR_MODEL, device="cpu", compute_type="int8")
    print(f"asr loaded: {ASR_MODEL}", flush=True)

    report = {"engine": "chatterbox-multilingual", "license": "MIT", "language": "he",
              "watermark": "perth (built in)", "niqqud": bool(dicta), "asr": ASR_MODEL,
              "gate": {"maxCer": MAX_CER, "minCharsPerSec": MIN_CHARS_PER_SEC}, "variants": []}
    for v in spec["variants"]:
        clips = []
        for i, line in enumerate(spec["lines"]):
            text, n = line["say"], len(plain(line["say"]))
            takes = []
            for k in range(a.takes):
                torch.manual_seed(v.get("seed", 1) * 100 + i * 10 + k)
                kw = {"language_id": "he", "exaggeration": v.get("exaggeration", 0.5),
                      "cfg_weight": v.get("cfg", 0.5), "temperature": v.get("temperature", 0.7)}
                if a.ref:
                    kw["audio_prompt_path"] = a.ref
                t = time.time()
                wav = model.generate(text, **kw)
                raw = os.path.join(tmp, f"{i + 1:02d}-{k}.wav")
                ta.save(raw, wav, model.sr)
                m4a = raw[:-4] + ".m4a"
                secs = trim(raw, m4a)
                segs, _ = asr.transcribe(m4a, language="he", beam_size=1, vad_filter=False)
                heard = " ".join(s.text.strip() for s in segs).strip()
                e = round(cer(text, heard), 3)
                rate = round(n / max(secs, 0.1), 1)
                score = e + (0.5 if rate < MIN_CHARS_PER_SEC else 0)
                takes.append({"take": k, "file": m4a, "seconds": secs, "heard": heard, "cer": e,
                              "charsPerSec": rate, "score": round(score, 3)})
                print(f"line {i + 1} take {k}: {secs:.2f}s cer {e:.2f} rate {rate} in {time.time() - t:.0f}s | {heard}", flush=True)
            best = min(takes, key=lambda x: x["score"])
            name = f"{spec['id']}-{v['id']}-{i + 1:02d}.m4a"
            os.replace(best["file"], os.path.join(a.out, name))
            ok = best["cer"] <= MAX_CER and best["charsPerSec"] >= MIN_CHARS_PER_SEC
            clips.append({"line": i + 1, "file": name, "seconds": best["seconds"], "say": text,
                          "heard": best["heard"], "cer": best["cer"], "pass": ok,
                          "takes": [{k: t[k] for k in ("take", "seconds", "cer", "charsPerSec", "heard")} for t in takes]})
        # One continuous track too (0.25 s between lines), for quick listening.
        listing = os.path.join(tmp, "list.txt")
        gap = os.path.join(tmp, "gap.m4a")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-t", "0.25", "-i",
                        "anullsrc=r=48000:cl=mono", "-c:a", "aac", gap], check=True)
        with open(listing, "w") as f:
            for c in clips:
                f.write(f"file '{os.path.abspath(os.path.join(a.out, c['file']))}'\nfile '{os.path.abspath(gap)}'\n")
        full = os.path.join(a.out, f"{spec['id']}-{v['id']}-full.m4a")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing,
                        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", full], check=True)
        report["variants"].append({**v, "full": os.path.basename(full), "pass": all(c["pass"] for c in clips), "clips": clips})
    subprocess.run(["rm", "-rf", tmp], check=True)
    json.dump(report, open(os.path.join(a.out, f"{spec['id']}-lines.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    for v in report["variants"]:
        print(f"variant {v['id']}: pass={v['pass']} cer={[c['cer'] for c in v['clips']]}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
