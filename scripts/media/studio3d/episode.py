#!/usr/bin/env python3
"""LikeLink's 3D studio, stage 2: a shot list's story, ready for the reel engine.

The shot list (jobs/<name>.json) carries the story it was drawn for under
"episode" (the same format as scripts/luna_reels/episodes/*.json, look
"story"). This writes that episode with "studio": <name>, so its scenes are
the studio's own pictures, and cuts the name tag's round picture from the
drawing the shot list names under "face" ({"from": shot id, "box": [x0, y0,
x1, y1] as fractions of the picture}).

  python episode.py --jobs jobs/pilot-hoops.json --pictures out/pilot-hoops --episode /tmp/ep.json
Prints the episode's id; exits 3 when the shot list has no story (nothing to render).
"""
import argparse, json, os, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--pictures", required=True)
    ap.add_argument("--episode", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.jobs, encoding="utf-8"))
    name = os.path.splitext(os.path.basename(a.jobs))[0]
    episode = spec.get("episode")
    if not isinstance(episode, dict):
        print(f"{name}: no story in this shot list", file=sys.stderr)
        return 3
    episode = {**episode, "look": "story", "studio": name}
    face = spec.get("face") or {}
    src = os.path.join(a.pictures, f"{face.get('from', '')}.png")
    if face and os.path.exists(src):
        from PIL import Image
        img = Image.open(src).convert("RGB")
        x0, y0, x1, y1 = (float(v) for v in face["box"])
        crop = img.crop((round(x0 * img.width), round(y0 * img.height), round(x1 * img.width), round(y1 * img.height)))
        crop.resize((320, 320), Image.LANCZOS).save(os.path.join(a.pictures, "face.jpg"), quality=92)
    with open(a.episode, "w", encoding="utf-8") as f:
        json.dump(episode, f, ensure_ascii=False, indent=1)
    print(episode["id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
