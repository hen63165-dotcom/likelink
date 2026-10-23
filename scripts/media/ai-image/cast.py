#!/usr/bin/env python3
"""The story cast's jobs for generate.py (scripts/media/ai-image/cast.json).

  python cast.py jobs <id> face     → the headshot and the full-body hero (no reference)
  python cast.py jobs <id> scenes   → every story scene, drawn with the headshot's face as reference
  python cast.py crop HEADSHOT OUT  → the face, cropped from the headshot (the IP-Adapter reference)
"""
import json
import sys
from pathlib import Path

CAST = json.loads((Path(__file__).resolve().parent / "cast.json").read_text(encoding="utf-8"))


def character(cid):
    for c in CAST["characters"]:
        if c["id"] == cid:
            return c
    raise SystemExit(f"no character '{cid}' in cast.json")


def jobs(cid, stage):
    c = character(cid)
    who = CAST["person"].format(hair=c["hair"], eyes=c["eyes"])
    wears = CAST["outfit"].format(suit=c["suit"])
    shots = CAST["face"] if stage == "face" else CAST["scenes"]
    out = []
    for i, (name, what) in enumerate(shots.items()):
        out.append({"id": name, "kind": "athlete", "prompt": f"{who}, {wears}, {what}",
                    "negative": CAST["negative"], "seed": c["seed"] + (0 if stage == "face" else 100) + i})
    return out


def crop(src, dst):
    from PIL import Image
    img = Image.open(src).convert("RGB")
    w, h = img.size
    # A head-and-shoulders portrait: the face sits in the upper middle.
    box = (int(w * 0.18), int(h * 0.04), int(w * 0.82), int(h * 0.04) + int(w * 0.64))
    img.crop(box).resize((256, 256), Image.LANCZOS).save(dst, quality=92)


if __name__ == "__main__":
    if sys.argv[1] == "jobs":
        print(json.dumps(jobs(sys.argv[2], sys.argv[3]), ensure_ascii=False, indent=1))
    elif sys.argv[1] == "crop":
        crop(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "ids":
        print(" ".join(c["id"] for c in CAST["characters"]))
