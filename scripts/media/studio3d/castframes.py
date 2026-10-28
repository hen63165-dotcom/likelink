#!/usr/bin/env python3
"""LikeLink's 3D studio: the presenter's checked keyframe into a shot list's folder.

A shot with "cast": "<file>" is not drawn: its picture is the presenter's own
keyframe, cast/<presenter>/<file>, chosen by eye once (the same face, hair and
age as her portrait, plain clothes, nothing that could pass for jewellery).
Every shot of her is then animated from that one picture, so she is the same
woman in every shot and every reel. Run after the pictures are downloaded,
before animate.py and the reel engine read the folder.

  python castframes.py --jobs jobs/x.json --pictures shots/x
"""
import argparse, json, shutil, sys
from pathlib import Path

CAST = Path(__file__).resolve().parent / "cast"


def frames(spec):
    """[(shot id, keyframe path)] for every shot drawn from the cast (pure; tested)."""
    who = spec.get("presenter", "")
    out = []
    for s in spec.get("shots", []):
        if s.get("cast"):
            if not who or "/" in who or "/" in s["cast"] or s["cast"].startswith("."):
                raise SystemExit(f"shot {s['id']}: a cast keyframe needs the shot list's presenter and a plain file name")
            out.append((s["id"], CAST / who / s["cast"]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--pictures", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.jobs, encoding="utf-8"))
    dest = Path(a.pictures)
    dest.mkdir(parents=True, exist_ok=True)
    for sid, src in frames(spec):
        if not src.exists():
            raise SystemExit(f"shot {sid}: {src.relative_to(CAST.parent)} is missing")
        shutil.copyfile(src, dest / f"{sid}.png")
        print(json.dumps({"cast": sid, "from": str(src.relative_to(CAST.parent))}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
