#!/usr/bin/env python3
"""LikeLink's 3D studio: a depth map for every scene picture (<id>.depth.png),
so the reel engine can move the camera in 3D over a still (near things move
more than far ones) when a shot has no animated clip of its own.

Depth Anything V2 Small (Apache-2.0), on the CPU, a few seconds a picture.
  python depth.py DIR
"""
import glob, json, os, sys

MODEL = "depth-anything/Depth-Anything-V2-Small-hf"


def main():
    folder = sys.argv[1]
    todo = [p for p in sorted(glob.glob(os.path.join(folder, "*.png")))
            if not p.endswith(".depth.png") and not os.path.exists(p[:-4] + ".depth.png")]
    if not todo:
        return 0
    from PIL import Image
    from transformers import pipeline
    estimate = pipeline("depth-estimation", model=MODEL, device="cpu")
    for path in todo:
        depth = estimate(Image.open(path).convert("RGB"))["depth"]  # near = bright
        depth.save(path[:-4] + ".depth.png")
        print(json.dumps({"depth": os.path.basename(path)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
