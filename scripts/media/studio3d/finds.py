"""The finds cut: a finished story reel re-edited the way finds creators post
(the owner, 2026-11-03: "the reel shows a white shirt, nobody understands it
sells earrings; think like an influencer").

The first studio reel showed a talking T-shirt for 3 s, the presenter in her
room for 12 s, the earrings at second 16 for 2 s and a 4 s card at the end;
Instagram's own numbers: 2 views, an average watch of 10 s. People left before
they saw the product. This cut keeps the reel's voice and lips and changes
what is on the screen:

  * the product from the first frame to the last: the store's own photos
    (the catalog's `images`, labelled "תמונת המוכר"), a different one on every
    line, each with a slow camera move and a hard cut with a short punch-in;
  * one headline for the whole reel at the top (≤ 8 words);
  * the presenter in a circle over the photo's corner (her talking shots,
    cropped from the reel, so her lips stay on her voice); hidden on a line
    whose shot is not hers;
  * the spoken line as a caption; the ad tag and the AI label on every frame;
  * no end card: the last line ends on the first photo, so the reel loops.

Lines are cut from the reel by time (a spec in finds/<name>.json); a line can
be dropped (the first cut drops "every morning... something is missing").
Nothing is drawn: the product pixels are the store's.

  python scripts/media/studio3d/finds.py --spec scripts/media/studio3d/finds/<name>.json \
      --reel <story reel.mp4> --out <dir> [--photos <dir with 1.jpg 2.jpg …>]
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "luna_reels"))
from luna_reels import brand, text, visuals  # noqa: E402

W, H, FPS = 1080, 1920, 30
HEAD_Y = 226            # headline: under Instagram's top bar, one line
PHOTO = 1000            # the product photo, square, full width less a margin
PHOTO_Y = 396
PIP = 360               # the presenter's circle, over the photo's lower corner
PIP_X, PIP_Y = 40, PHOTO_Y + PHOTO - PIP - 44
CAPTION_Y = PHOTO_Y + PHOTO + 30
PUNCH = 0.2             # s: a cut lands 6% closer and settles
MAX_WORDS = 8           # the master's hook rule


class SpecError(ValueError):
    pass


def load_spec(path: Path) -> dict:
    spec = json.loads(Path(path).read_text(encoding="utf-8"))
    check_spec(spec)
    return spec


def check_spec(spec: dict) -> None:
    """Refuse a cut that breaks the rules before any frame is made."""
    head = str(spec.get("headline") or "").strip()
    if not head or text.word_count(head) > MAX_WORDS:
        raise SpecError(f"headline: 1–{MAX_WORDS} words")
    segs = spec.get("segments") or []
    if len(segs) < 2:
        raise SpecError("segments: at least two lines")
    last = -1.0
    for i, s in enumerate(segs):
        a, b = float(s["from"]), float(s["to"])
        if not (0 <= a < b) or a < last:
            raise SpecError(f"segment {i}: times must rise and not overlap")
        last = b
        if not str(s.get("caption") or "").strip():
            raise SpecError(f"segment {i}: a caption (what is said)")
        box = s.get("pip")
        if box is not None and not (len(box) == 4 and 0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1):
            raise SpecError(f"segment {i}: pip is [x0, y0, x1, y1] in fractions of the frame")
    if segs[-1].get("photo", 0) != segs[0].get("photo", 0):
        raise SpecError("the last line ends on the first photo (the reel loops)")
    total = sum(float(s["to"]) - float(s["from"]) for s in segs)
    if not 8 <= total <= 45:
        raise SpecError(f"length {total:.1f} s: 8–45 s")


def plan(spec: dict) -> list[dict]:
    """Each kept line placed on the new timeline: start, duration, source range."""
    out, t = [], 0.0
    for i, s in enumerate(spec["segments"]):
        d = float(s["to"]) - float(s["from"])
        out.append({**s, "i": i, "start": t, "dur": d})
        t += d
    return out


def photo_tile(img: Image.Image) -> Image.Image:
    """The store photo as a square (centre crop), the same pixels, scaled."""
    img = img.convert("RGB")
    side = min(img.size)
    x, y = (img.width - side) // 2, (img.height - side) // 2
    return img.crop((x, y, x + side, y + side)).resize((PHOTO, PHOTO), Image.LANCZOS)


def backdrop(img: Image.Image) -> Image.Image:
    return visuals.blurred(visuals.cover(img.convert("RGB")), radius=36, darken=0.5).convert("RGB")


def _rounded_mask(size: int, radius: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def _circle_mask(size: int) -> Image.Image:
    big = Image.new("L", (size * 3, size * 3), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * 3 - 1, size * 3 - 1), fill=255)
    return big.resize((size, size), Image.LANCZOS)


def moved(tile: Image.Image, k: float, move: str, punch: float) -> Image.Image:
    """The photo with its camera move at progress k (0..1) and the cut's punch-in."""
    ease = 0.5 - 0.5 * math.cos(math.pi * min(1.0, max(0.0, k)))
    if move == "out":
        z = 1.10 - 0.10 * ease
    else:
        z = 1.0 + 0.10 * ease
    z *= 1.0 + 0.06 * punch
    side = PHOTO / z
    dx = {"left": -0.04, "right": 0.04}.get(move, 0.0) * PHOTO * ease
    cx, cy = PHOTO / 2 + dx, PHOTO / 2
    box = (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2)
    return tile.resize((PHOTO, PHOTO), Image.BICUBIC, box=box)


MOVES = ["in", "left", "out", "right", "in", "left"]


def headline(head: str) -> Image.Image:
    return text.text_block(head, 68, W - 50, box=brand.ROSE + (255,), pad=(34, 18), radius=34)


def spoken(caption: str) -> Image.Image:
    return text.text_block(caption, 56, W - 70, color=brand.STORY_YELLOW, emphasis=brand.STORY_YELLOW,
                           box=brand.STORY_BOX, pad=(30, 12), radius=22)


def overlay(spec: dict, seg: dict, labels: list[str]) -> Image.Image:
    """Everything that does not move within a line: headline, caption, labels, name."""
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    head = headline(spec["headline"])
    sheet.alpha_composite(head, ((W - head.width) // 2, HEAD_Y))
    cap = spoken(seg["caption"])
    sheet.alpha_composite(cap, ((W - cap.width) // 2, CAPTION_Y))
    # The disclosures in the photo's top corner (right: where Hebrew starts), on every frame.
    y = PHOTO_Y + 14
    for line in [visuals.PHOTO_TAG, *labels]:
        lab = text.label(line, 28)
        sheet.alpha_composite(lab, (PHOTO_X() + PHOTO - lab.width - 14, y))
        y += lab.height - 10
    if seg.get("pip"):
        name = text.pill(spec.get("name") or brand.tag_text(spec.get("presenter", "")), 32, brand.TAG_PLATE)
        sheet.alpha_composite(name, (PIP_X + (PIP - name.width) // 2, PIP_Y + PIP - name.height // 2 + 6))
    return sheet


def PHOTO_X() -> int:  # noqa: N802
    return (W - PHOTO) // 2


def pip_frames(reel: Path, seg: dict) -> np.ndarray | None:
    """The presenter's circle for one line: her shot cropped from the reel, frame by frame."""
    box = seg.get("pip")
    if not box:
        return None
    x0, y0, x1, y1 = box
    cw, ch = int((x1 - x0) * W), int((y1 - y0) * H)
    side = min(cw, ch)
    cx, cy = int((x0 + x1) / 2 * W), int((y0 + y1) / 2 * H)
    crop = f"crop={side}:{side}:{max(0, cx - side // 2)}:{max(0, cy - side // 2)},scale={PIP}:{PIP}:flags=lanczos"
    n = max(1, round(seg["dur"] * FPS))
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{seg['from']:.3f}", "-i", str(reel), "-t", f"{seg['dur']:.3f}",
                          "-vf", f"fps={FPS},scale={W}:{H},{crop}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    frames = np.frombuffer(raw, np.uint8)
    k = len(frames) // (PIP * PIP * 3)
    frames = frames[: k * PIP * PIP * 3].reshape(k, PIP, PIP, 3)
    if k < n:  # the last frame held to the line's end
        frames = np.concatenate([frames, np.repeat(frames[-1:], n - k, axis=0)])
    return frames[:n]


def audio(reel: Path, segs: list[dict], dst: Path) -> Path:
    """The reel's own voice for the kept lines, joined with 20 ms fades."""
    parts, labels = [], []
    for i, s in enumerate(segs):
        parts.append(f"[0:a]atrim={s['from']:.3f}:{s['to']:.3f},asetpts=PTS-STARTPTS,"
                     f"afade=t=in:d=0.02,afade=t=out:st={max(0.0, s['dur'] - 0.03):.3f}:d=0.03[a{i}]")
        labels.append(f"[a{i}]")
    graph = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(segs)}:v=0:a=1,aresample=48000[out]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(reel), "-filter_complex", graph, "-map", "[out]",
                    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", str(dst)], check=True)
    return dst


def render(spec: dict, reel: Path, photos: list[Path], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    segs = plan(spec)
    tiles = [photo_tile(Image.open(p)) for p in photos]
    if not tiles:
        raise SpecError("no product photo")
    backs = [backdrop(t) for t in tiles]
    rmask, cmask = _rounded_mask(PHOTO, 44), _circle_mask(PIP)
    ring = Image.new("RGBA", (PIP + 16, PIP + 16), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse((0, 0, PIP + 15, PIP + 15), fill=(255, 255, 255, 255))
    ring.putalpha(ring.getchannel("A").filter(ImageFilter.GaussianBlur(0.6)))
    labels = [brand.AD_TAG, spec.get("aiLabel") or "דמות וקול AI"]
    name = spec.get("name") or brand.tag_text(spec.get("presenter", ""))
    spec = {**spec, "name": name}
    total = sum(s["dur"] for s in segs)
    sound = audio(reel, segs, out_dir / "voice.m4a")
    dst = out_dir / f"{spec['id']}.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-i", str(sound), "-map", "0:v", "-map", "1:a",
                            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                            "-c:a", "copy", "-shortest", "-movflags", "+faststart", str(dst)], stdin=subprocess.PIPE)
    for seg in segs:
        idx = int(seg.get("photo", seg["i"])) % len(tiles)
        tile, back = tiles[idx], backs[idx]
        move = seg.get("move") or MOVES[seg["i"] % len(MOVES)]
        if seg["i"] == len(segs) - 1:
            move = "out"  # ends where the first line starts: the loop
        top = overlay(spec, seg, labels)
        pips = pip_frames(reel, seg)
        n = max(1, round(seg["dur"] * FPS))
        for f in range(n):
            t = f / FPS
            frame = back.copy()
            punch = max(0.0, 1 - t / PUNCH) if seg["i"] else 0.0
            ph = moved(tile, t / max(seg["dur"], 1e-3), move, punch)
            frame.paste(ph, (PHOTO_X(), PHOTO_Y), rmask)
            frame = frame.convert("RGBA")
            if pips is not None:
                frame.alpha_composite(ring, (PIP_X - 8, PIP_Y - 8))
                face = Image.fromarray(pips[min(f, len(pips) - 1)]).convert("RGBA")
                face.putalpha(cmask)
                frame.alpha_composite(face, (PIP_X, PIP_Y))
            frame.alpha_composite(top)
            enc.stdin.write(frame.convert("RGB").tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        raise RuntimeError("ffmpeg failed")
    meta = {"id": spec["id"], "file": dst.name, "seconds": round(total, 2), "look": "finds", "source": spec.get("source"),
            "product": spec.get("product"), "photos": len(tiles), "labels": [visuals.PHOTO_TAG, *labels],
            "synthetic": True, "humanFilmed": False, "caption": spec.get("caption", "")}
    (out_dir / f"{spec['id']}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    if spec.get("caption"):
        (out_dir / f"{spec['id']}.txt").write_text(spec["caption"], encoding="utf-8")
    sheet(tiles, out_dir / f"{spec['id']}-photos.jpg")
    return dst


def sheet(tiles: list[Image.Image], dst: Path) -> None:
    """The store photos side by side, numbered, for a person to check by eye."""
    s = 300
    img = Image.new("RGB", (s * len(tiles), s + 40), (20, 20, 24))
    d = ImageDraw.Draw(img)
    for i, t in enumerate(tiles):
        img.paste(t.resize((s, s)), (i * s, 40))
        d.text((i * s + 10, 8), str(i), fill=(255, 255, 255), font=text.font(26))
    img.save(dst, quality=88)


def store_photos(product_id: str, dst: Path, limit: int = 6) -> list[Path]:
    """The product's own gallery from the live catalog (the public anon read), downloaded."""
    from luna_reels.script import load_cloud_catalog  # noqa: PLC0415
    p = load_cloud_catalog().get(product_id)
    if not p:
        raise SpecError(f"{product_id} is not listed")
    urls = [u for u in (p.get("images") or [p.get("image")]) if isinstance(u, str) and u.startswith("https://")][:limit]
    out = []
    for u in urls:
        try:
            out.append(visuals.download(u, dst, kind="image"))
        except Exception as e:  # noqa: BLE001 - one broken photo is skipped, never invented
            print(f"[finds] skipped a photo: {type(e).__name__}")
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--reel", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--photos", help="a folder of photos instead of the store's (a local layout check only)")
    a = ap.parse_args(argv)
    spec = load_spec(Path(a.spec))
    out = Path(a.out)
    if a.photos:
        photos = sorted(p for p in Path(a.photos).iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
    else:
        photos = store_photos(spec["product"], out / "photos")
    order = spec.get("photoOrder")
    if order:
        photos = [photos[i] for i in order if i < len(photos)]
    print(render(spec, Path(a.reel), photos, out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
