#!/usr/bin/env python3
"""One talking-slides line: the presenter says it on camera, on a free CPU.

Her mouth and jaw are redrawn to the line's own voice by MuseTalk 1.5
(scripts/media/talking/musetalk.py, the 3D studio's free lip-sync), over one
of her own animated clips (LTX-Video from her checked keyframe: she blinks,
nods and moves her hair). Her clips are profiled first (the steady part and
how open her eyes are); only the good ones are used, taken in turn so two
lines of hers never open the same way. Output: <id>.talk.mp4, 1080×1920,
25 fps, with the voice. Synthetic like every studio shot; the edit labels it.

  python talk.py --spec talk-slides-X.json --line m1 --voices DIR --out DIR
"""
import argparse, functools, json, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "media" / "talking"))
import musetalk  # noqa: E402


def good_clips(paths, det):
    """Her clips that can carry a line, best first (steady long enough, eyes open)."""
    profiles = {}
    for p in paths:
        if Path(p).exists():
            profiles[p] = musetalk.clip_profile(Path(p), det)
    print(json.dumps({"talk": "profiles", **{Path(p).parent.name + "/" + Path(p).name: [s, round(e, 3)] for p, (s, e) in profiles.items()}}))
    if not profiles:
        raise SystemExit("no clip of her")
    best = max(e for _, e in profiles.values())
    ok = [p for p, (s, e) in profiles.items() if s >= musetalk.MIN_STEADY and e >= musetalk.EYES_SHARE * best]
    return ok or [max(profiles, key=lambda p: (profiles[p][1], profiles[p][0]))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--line", required=True)
    ap.add_argument("--voices", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.spec, encoding="utf-8"))
    line = next(x for x in spec["lines"] if x["id"] == a.line)
    who = line["presenter"]
    hers = [x["id"] for x in spec["lines"] if x["presenter"] == who]
    k = hers.index(line["id"])
    det = musetalk._yunet(Path(tempfile.mkdtemp(prefix="det-")))
    listed = [str(ROOT / p) for p in spec["bases"][who]]
    # bases checked by eye are used as listed (the eye score once preferred a clip whose face
    # drifted into another woman's after ~1.8 s); otherwise the profiles choose
    clips = [p for p in listed if Path(p).exists()] if spec.get("checkedBases") else good_clips(listed, det)
    if not clips:
        raise SystemExit("no clip of her")
    keep = float((spec.get("keep") or {}).get(who, musetalk.KEEP))
    musetalk.base_index = functools.partial(musetalk.base_index, keep=keep)  # only her clean opening is played
    base = clips[k % len(clips)]
    phase = (k // len(clips)) * 0.5 % 1.0
    print(json.dumps({"talk": "job", "line": line["id"], "presenter": who, "base": Path(base).name, "phase": phase, "keep": keep}))
    out = Path(a.out) / f"{line['id']}.talk.mp4"
    musetalk.make(Path(base), Path(a.voices) / f"{line['id']}.mp3", out, spec["heads"].get(who), k, None, phase)
    return 0


if __name__ == "__main__":
    sys.exit(main())
