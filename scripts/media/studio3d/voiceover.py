"""A voice-over for a finished real-footage reel (the owner, 2026-11-03: "at
Ravit's level, exactly professional").

The seller-footage cuts (scripts/media/product-video, the `reels` release)
carry a silent audio track: a reel with no sound reads as unfinished and
Instagram ranks it on watch time. This adds what a creator's edit has:

  * her voice (the free Edge voice, labelled "קול ממוחשב" on every frame),
    one short line at a time, each placed at its own second;
  * the spoken line as a yellow caption while it is said;
  * a quiet music bed (scripts/luna_reels music.py, generated, no licence
    needed) that ducks under the voice.

The footage, its labels and its timing are left as they are. A line that would
claim something untrue (the reel engine's FORBIDDEN rules) is refused before
anything is made, and a voice that cannot be made fails the run: never a
silent "voiced" reel.

  python scripts/media/studio3d/voiceover.py --spec scripts/media/studio3d/voiceover/<name>.json \
      --video <reel.mp4> --out <dir>
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "luna_reels"))
from PIL import Image  # noqa: E402

from luna_reels import brand, music, text, voice  # noqa: E402
from luna_reels.script import FORBIDDEN, spoken_text  # noqa: E402

W, H = 1080, 1920
CAPTION_Y = 1300        # under the product, above the product name the cut shows at its end
GAP = 0.15              # s between two lines when one runs long
MAX_LINES = 6
BED_DB = -24.0


class SpecError(ValueError):
    pass


def check_spec(spec: dict) -> None:
    lines = spec.get("lines") or []
    if not 1 <= len(lines) <= MAX_LINES:
        raise SpecError(f"lines: 1–{MAX_LINES}")
    last = -1.0
    for i, ln in enumerate(lines):
        at = float(ln.get("at", -1))
        if at < 0 or at < last:
            raise SpecError(f"line {i}: 'at' must rise")
        last = at
        if not str(ln.get("say") or "").strip():
            raise SpecError(f"line {i}: say")
        for part in ("say", "caption"):  # a line whose words are already on the footage needs no caption
            s = str(ln.get(part) or "").strip()
            if FORBIDDEN.search(s):
                raise SpecError(f"line {i}: an untrue claim ({FORBIDDEN.search(s).group(0)})")
    head = spec.get("headline")
    if head is not None:
        words = str(head.get("text") or "").split()
        if not 1 <= len(words) <= 8:
            raise SpecError("headline: 1–8 words (the master's hook rule)")
        if FORBIDDEN.search(head["text"]):
            raise SpecError(f"headline: an untrue claim ({FORBIDDEN.search(head['text']).group(0)})")
        if not 0 <= float(head.get("from", 0)) < float(head.get("to", 0)):
            raise SpecError("headline: from < to")
    rate = spec.get("rate")
    if rate is not None and not __import__("re").fullmatch(r"[+-]\d{1,2}%", str(rate)):
        raise SpecError("rate: like +15% (the Edge voice's speed)")
    post = str(spec.get("caption") or "")
    if not post.startswith(brand.AD_TAG):
        raise SpecError("the post caption opens with the ad tag")
    if "המוכר" not in post or brand.VOICE_LABEL not in post:
        raise SpecError("the post names the seller's footage and the computer voice")
    if FORBIDDEN.search(post):
        raise SpecError(f"the post caption: an untrue claim ({FORBIDDEN.search(post).group(0)})")


def load_spec(path: Path) -> dict:
    spec = json.loads(Path(path).read_text(encoding="utf-8"))
    check_spec(spec)
    return spec


def placed(lines: list[dict], seconds: list[float]) -> list[tuple[float, float]]:
    """Each line's start and end: at its own second, or just after the one before."""
    out, end = [], 0.0
    for ln, d in zip(lines, seconds):
        start = max(float(ln["at"]), end + GAP if out else float(ln["at"]))
        out.append((start, start + d))
        end = start + d
    return out


def duration(path: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def render(spec: dict, video: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    work = out_dir / "work"
    work.mkdir(exist_ok=True)
    lines = spec["lines"]
    if spec.get("rate"):
        voice.EDGE_RATE = str(spec["rate"])  # read by the Edge voice at call time
    clips, used = voice.synthesize([spoken_text(ln["say"]) for ln in lines], spec.get("voice", "edge"), work,
                                   eid=spec["id"], fallback=False)
    if used in ("none", "") or any(c.path is None for c in clips):
        raise RuntimeError("no voice was made; a silent reel is never published as voiced")
    times = placed(lines, [c.seconds for c in clips])
    length = duration(video)
    total = max(length, times[-1][1] + 0.5)
    if total - length > 2.0:
        raise SpecError(f"the lines run {total - length:.1f} s past the footage; shorten them")
    bed = music.write_bed(total + 0.5, work / "bed.m4a", db=BED_DB)
    caps = []
    for i, ln in enumerate(lines):
        p = work / f"cap{i}.png"
        if str(ln.get("caption") or "").strip():
            text.story(ln["caption"], size=56).save(p)
        else:
            Image.new("RGBA", (2, 2), (0, 0, 0, 0)).save(p)
        caps.append(p)
    lab = work / "voice-label.png"
    text.label(brand.VOICE_LABEL, 26).save(lab)
    head = spec.get("headline")
    hp = work / "headline.png"
    if head:
        text.text_block(head["text"], 80, W - 110, color=brand.WHITE, emphasis=brand.WHITE, shadow=True,
                        box=(13, 12, 20, 120), pad=(30, 18), radius=28).save(hp)
    else:
        Image.new("RGBA", (2, 2), (0, 0, 0, 0)).save(hp)

    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(video)]
    for c in clips:
        cmd += ["-i", str(c.path)]
    cmd += ["-i", str(bed)]
    for p in caps + [lab, hp]:
        cmd += ["-loop", "1", "-i", str(p)]
    n = len(clips)
    bed_i = 1 + n
    cap_i = bed_i + 1
    lab_i = cap_i + len(caps)
    g = []
    pad = max(0.0, total - length)
    g.append(f"[0:v]tpad=stop_mode=clone:stop_duration={pad:.3f},format=yuv420p[v0]" if pad else "[0:v]format=yuv420p[v0]")
    cur = "v0"
    for i, (a, b) in enumerate(times):
        g.append(f"[{cur}][{cap_i + i}:v]overlay=x=(W-w)/2:y={CAPTION_Y}:enable='between(t,{a:.3f},{b + 0.12:.3f})'[v{i + 1}]")
        cur = f"v{i + 1}"
    hf, ht = (float(head["from"]), float(head["to"])) if head else (0.0, 0.0)
    g.append(f"[{cur}][{lab_i}:v]overlay=x=W-w-28:y=118[vl]")
    g.append(f"[vl][{lab_i + 1}:v]overlay=x=(W-w)/2:y=250:enable='between(t,{hf:.3f},{ht:.3f})'[vout]")
    for i, (a, _) in enumerate(times):
        ms = int(round(a * 1000))
        g.append(f"[{1 + i}:a]aresample=48000,adelay={ms}|{ms},apad[a{i}]")
    g.append("".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0:duration=longest,asplit=2[vox1][vox2]")
    g.append(f"[{bed_i}:a]aresample=48000[bed]")
    g.append("[bed][vox1]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[duck]")
    g.append("[duck][vox2]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.9[aout]")
    dst = out_dir / f"{spec['id']}.mp4"
    cmd += ["-filter_complex", ";".join(g), "-map", "[vout]", "-map", "[aout]", "-t", f"{total:.3f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", str(dst)]
    subprocess.run(cmd, check=True)
    meta = {"id": spec["id"], "file": dst.name, "seconds": round(total, 2), "source": spec.get("source"),
            "product": spec.get("product"), "voice": used, "lines": [{"say": ln["say"], "start": round(a, 2), "end": round(b, 2)}
                                                                      for ln, (a, b) in zip(lines, times)],
            "labels": [brand.AD_TAG, "צילום המוצר: המוכר", brand.VOICE_LABEL], "synthetic": False, "humanFilmed": False}
    (out_dir / f"{spec['id']}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / f"{spec['id']}.txt").write_text(spec["caption"], encoding="utf-8")
    if spec.get("firstComment"):
        (out_dir / f"{spec['id']}-comment.txt").write_text(spec["firstComment"], encoding="utf-8")
    return dst


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    print(render(load_spec(Path(a.spec)), Path(a.video), Path(a.out)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
