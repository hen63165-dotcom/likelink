#!/usr/bin/env python3
"""LikeLink's 3D studio: the presenter says her line, on a free CPU.

SadTalker (talk.sh) moves a 256-px face over a still picture: on our drawn
presenters the mouth only opened and closed inside her smile (v6, checked at
5 fps, 2026-11-02), far from @ravitrecommends' reels, where every syllable
has its own mouth shape. This redraws only her mouth and jaw to the sound,
frame by frame, over her own animated clip (LTX-Video: she blinks, nods and
moves her hair), so the rest of the shot stays exactly as it was made:

  - MuseTalk 1.5 (TMElyralab, code MIT; "the trained models are available
    for any purpose, even commercially"): one UNet step per frame regenerates
    the lower half of the face crop from Whisper-tiny audio features (MIT)
    through the SD VAE ft-mse (MIT). No diffusion loop, so a CPU runner can
    do a line in minutes;
  - her face is found by YuNet (OpenCV Zoo, MIT), the detector the studio
    already uses to pick takes; MuseTalk's own detectors are not installed;
  - the new mouth is laid back with a soft oval from just under the nose to
    the chin (no face-parsing model: it is trained on photos), enlarged with
    the studio's animation upscaler so it is as sharp as the rest.

  python musetalk.py --scene hero --jobs jobs/X.json --pictures shots/X --voices VOICES --out hero.talk.mp4
  python musetalk.py --base SHOT.mp4|SHOT.png --audio LINE.mp3 --out SHOT.talk.mp4
                     [--head x0,y0,x1,y1] [--n 0] [--seconds 3.4]

Writes the close-up (cut around her head like every talking shot, compose.
close_up_box) at 1080×1920, 25 fps, with the line's own voice. Exit 1 when
no face is found or a weight cannot be read: the reel then uses SadTalker.
The result is synthetic like every studio shot (the reel labels it).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FPS = 25                      # MuseTalk's audio windows are cut for 25 fps
SIZE = (1080, 1920)
CROP = 256                    # the face crop the model was trained on
MARGIN = 0.05                 # below the chin, of the face box height (v1.5's extra margin)
KEEP = 3.0                    # an animated clip's clean first seconds (STUDIO_CLIP_KEEP)
SMOOTH = 5                    # frames: the face box and landmarks are averaged over this window
BATCH = 4
MUSE = ("TMElyralab/MuseTalk", "musetalkV15/musetalk.json", "musetalkV15/unet.pth")
VAE = "stabilityai/sd-vae-ft-mse"
WHISPER = "openai/whisper-tiny"
YUNET = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"


# ── pure (tested) ────────────────────────────────────────────────────────────

def frames_for(seconds: float, fps: int = FPS) -> int:
    """Frames that cover the whole line (never shorter than its voice)."""
    return max(1, math.ceil(round(seconds * fps, 6)))


def base_index(i: int, base_frames: int, base_fps: float, fps: int = FPS, keep: float = KEEP) -> int:
    """Which frame of her animated clip is under output frame i: the clean
    first `keep` seconds played forward, then back, then forward (a nod
    reversed is still a nod; a loop would jump)."""
    if base_frames <= 1:
        return 0
    span = min(keep, (base_frames - 1) / base_fps)
    if span <= 0:
        return 0
    t = (i / fps) % (2 * span)
    if t > span:
        t = 2 * span - t
    return min(base_frames - 1, max(0, round(t * base_fps)))


def muse_box(face, w: int, h: int, margin: float = MARGIN) -> tuple[int, int, int, int]:
    """MuseTalk's crop from a YuNet face (x, y, bw, bh, landmarks…): cheek to
    cheek, from the chin (plus a margin) up to as far above the nose tip as
    the chin is below it, so the nose sits on the line between the half the
    model keeps (eyes) and the half it redraws (mouth and jaw)."""
    x, y, bw, bh = (float(v) for v in face[:4])
    nose_y = float(face[9])
    y2 = y + bh * (1 + margin)
    y1 = nose_y - (y2 - nose_y)
    x1, x2 = x, x + bw
    x1, y1 = max(0, round(x1)), max(0, round(y1))
    x2, y2 = min(w, round(x2)), min(h, round(y2))
    if x2 - x1 < 32 or y2 - y1 < 32:
        raise ValueError("face too small")
    return x1, y1, x2, y2


def smooth(rows: list, k: int = SMOOTH) -> list:
    """Each frame's face (a list of numbers) averaged with its neighbours, so the crop never jitters."""
    out = []
    for i in range(len(rows)):
        lo, hi = max(0, i - k // 2), min(len(rows), i + k // 2 + 1)
        win = rows[lo:hi]
        out.append([sum(r[j] for r in win) / len(win) for j in range(len(rows[i]))])
    return out


def fill_gaps(rows: list) -> list:
    """A frame where the face was not found takes the nearest found one (None when none is)."""
    found = [i for i, r in enumerate(rows) if r is not None]
    if not found:
        return []
    return [rows[min(found, key=lambda j: (abs(j - i), j))] if r is None else r for i, r in enumerate(rows)]


def mouth_oval(box_w: int, box_h: int, nose_rel: float):
    """The soft mask (0..1, numpy) laid over the crop: an oval from just under
    the nose (nose_rel: its height in the crop, 0..1) down to the chin, cheek
    to cheek inside the face, feathered so no edge shows."""
    import numpy as np
    yy, xx = np.mgrid[0:box_h, 0:box_w].astype(np.float32)
    top = (nose_rel + 0.04) * box_h
    cy, ry = (top + box_h) / 2, (box_h - top) / 2 * 1.02
    cx, rx = box_w / 2, box_w * 0.40
    d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    edge = 0.22  # the outer part of the oval fades out
    return np.clip((1.0 - d) / edge, 0.0, 1.0) ** 1.5


def line_for(spec: dict, manifest: dict, pictures, voices, scene: str) -> dict:
    """One talking shot's job from the shot list and the voices manifest (luna_reels
    voices): her clip (else her picture), the line's own voice file and length,
    which talking line it is (the close-up's variety) and her head box."""
    talking = [s["id"] for s in spec.get("shots", []) if s.get("talk") and not s.get("still")]
    if scene not in talking:
        raise ValueError(f"'{scene}' is not a talking shot")
    rows = [r for r in manifest.get("beats", []) if r.get("scene") == scene]
    if len(rows) != 1:
        raise ValueError(f"'{scene}' must be said on exactly one line (found {len(rows)})")
    name = str(rows[0].get("file") or "")
    if not name or "/" in name or name.startswith("."):
        raise ValueError(f"'{scene}': no voice file")
    folder = Path(pictures)
    clip, still = folder / f"{scene}.mp4", folder / f"{scene}.png"
    head = None
    side = folder / f"{scene}.face.json"
    if side.exists():
        box = json.loads(side.read_text(encoding="utf-8")).get("head")
        if isinstance(box, list) and len(box) == 4:
            head = [float(v) for v in box]
    return {"scene": scene, "base": str(clip if clip.exists() else still), "audio": str(Path(voices) / name),
            "seconds": float(rows[0].get("seconds") or 0), "n": talking.index(scene), "head": head}


# ── the models ───────────────────────────────────────────────────────────────

class Lips:
    def __init__(self):
        import torch
        from diffusers import AutoencoderKL, UNet2DConditionModel
        from huggingface_hub import hf_hub_download
        from transformers import WhisperFeatureExtractor, WhisperModel
        torch.set_num_threads(os.cpu_count() or 4)
        self.torch = torch
        t = time.time()
        cfg = json.load(open(hf_hub_download(MUSE[0], MUSE[1]), encoding="utf-8"))
        self.unet = UNet2DConditionModel.from_config(cfg)
        state = torch.load(hf_hub_download(MUSE[0], MUSE[2]), map_location="cpu", weights_only=True)
        missing, unexpected = self.unet.load_state_dict(state, strict=False)
        if missing or unexpected:
            raise RuntimeError(f"unet weights: {len(missing)} missing, {len(unexpected)} unexpected")
        self.unet.eval()
        self.vae = AutoencoderKL.from_pretrained(VAE).eval()
        self.scale = self.vae.config.scaling_factor
        self.features = WhisperFeatureExtractor.from_pretrained(WHISPER)
        self.whisper = WhisperModel.from_pretrained(WHISPER).eval()
        self.pe = self._positions(384)
        print(json.dumps({"lips": "loaded", "s": round(time.time() - t)}))

    def _positions(self, d: int, n: int = 5000):
        torch = self.torch
        pe = torch.zeros(n, d)
        pos = torch.arange(0, n, dtype=torch.float).unsqueeze(1)
        div = torch.exp(torch.arange(0, d, 2).float() * (-math.log(10000.0) / d))
        pe[:, 0::2], pe[:, 1::2] = torch.sin(pos * div), torch.cos(pos * div)
        return pe[None]

    def audio(self, wav, n: int, left: int = 2, right: int = 2):
        """Per output frame, the Whisper features around it (MuseTalk's own windows: 10 steps × 5 layers)."""
        torch = self.torch
        sr, audio_fps = 16000, 50
        feats = []
        with torch.no_grad():
            for k in range(0, len(wav), 30 * sr):
                x = self.features(wav[k:k + 30 * sr], sampling_rate=sr, return_tensors="pt").input_features
                hs = self.whisper.encoder(x, output_hidden_states=True).hidden_states
                feats.append(torch.stack(hs, dim=2))
        f = torch.cat(feats, dim=1)[:, :math.floor(len(wav) / sr * audio_fps)]
        mult = audio_fps / FPS
        pad = math.ceil(mult)
        f = torch.cat([torch.zeros_like(f[:, :pad * left]), f, torch.zeros_like(f[:, :pad * 3 * right])], 1)
        per = 2 * (left + right + 1)
        rows = []
        for i in range(n):
            a = math.floor(i * mult)
            clip = f[:, a:a + per]
            if clip.shape[1] < per:  # past the end of the voice: silence
                clip = torch.cat([clip, torch.zeros_like(f[:, :per - clip.shape[1]])], 1)
            rows.append(clip)
        out = torch.cat(rows, 0)  # n, 10, 5, 384
        return out.reshape(out.shape[0], -1, out.shape[-1])  # n, 50, 384

    def _encode(self, crops):
        torch = self.torch
        import numpy as np
        x = torch.from_numpy(np.stack(crops).astype(np.float32) / 255.0).permute(0, 3, 1, 2)
        masked = x.clone()
        masked[:, :, CROP // 2:, :] = 0  # the half the model redraws starts black
        with torch.no_grad():
            m = self.vae.encode(masked * 2 - 1).latent_dist.mode() * self.scale
            r = self.vae.encode(x * 2 - 1).latent_dist.mode() * self.scale
        return torch.cat([m, r], dim=1)

    def mouths(self, crops, feats):
        """256×256 RGB crops + their audio windows → the same crops with the mouth that says them."""
        torch = self.torch
        import numpy as np
        out = []
        for k in range(0, len(crops), BATCH):
            lat = self._encode(crops[k:k + BATCH])
            a = feats[k:k + BATCH]
            a = a + self.pe[:, :a.shape[1]]
            with torch.no_grad():
                pred = self.unet(lat, torch.tensor([0]), encoder_hidden_states=a).sample
                img = self.vae.decode(pred / self.scale).sample
            img = ((img / 2 + 0.5).clamp(0, 1).permute(0, 2, 3, 1).numpy() * 255).round().astype(np.uint8)
            out += list(img)
        return out


# ── the shot ─────────────────────────────────────────────────────────────────

def _yunet(work: Path):
    import cv2
    path = work / "yunet.onnx"
    if not path.exists():
        import urllib.request
        urllib.request.urlretrieve(YUNET, path)
    return cv2.FaceDetectorYN.create(str(path), "", (320, 320), 0.6)


def _faces(frames, det):
    """YuNet on every frame (at half size, scaled back): [x, y, w, h, 10 landmark numbers] or None."""
    import cv2
    rows = []
    for img in frames:
        small = cv2.resize(img, (img.shape[1] // 2, img.shape[0] // 2))
        det.setInputSize((small.shape[1], small.shape[0]))
        _, found = det.detect(cv2.cvtColor(small, cv2.COLOR_RGB2BGR))
        if found is None or not len(found):
            rows.append(None)
            continue
        best = max(found, key=lambda f: f[2] * f[3])
        rows.append([float(v) * 2 for v in best[:14]])
    return rows


def _voice(audio: Path, work: Path):
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def _base(base: Path, work: Path, n: int, head, close_n: int):
    """Her close-up under every output frame (1080×1920 RGB arrays) from her clip, or her picture held."""
    import numpy as np
    from PIL import Image
    sys.path.insert(0, str(ROOT / "scripts" / "luna_reels"))
    from luna_reels.compose import close_up_box  # noqa: PLC0415 (the reel's own framing)
    if base.suffix.lower() == ".mp4":
        src = work / "base"
        src.mkdir(exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(base), str(src / "f%05d.png")], check=True)
        files = sorted(src.glob("f*.png"))
        rate = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                               "-of", "csv=p=0", str(base)], capture_output=True, text=True, check=True).stdout.strip()
        num, _, den = rate.partition("/")
        base_fps = float(num) / float(den or 1)
    else:
        files, base_fps = [base], float(FPS)
    cache = {}
    frames = []
    for i in range(n):
        j = base_index(i, len(files), base_fps)
        if j not in cache:
            img = Image.open(files[j]).convert("RGB")
            box = close_up_box(*img.size, head=head, n=close_n)
            cache[j] = np.asarray(img.crop(box).resize(SIZE, Image.LANCZOS))
        frames.append(cache[j])
    return frames


def _sharp(face):
    """The redrawn 256-px face, enlarged by the studio's animation upscaler when it loads."""
    try:
        sys.path.insert(0, str(ROOT / "scripts" / "media" / "studio3d"))
        import upscale  # noqa: PLC0415
        import numpy as np
        m = upscale.model()
        if m is None:
            return face
        import torch
        x = torch.from_numpy(face.astype(np.float32) / 255.0).permute(2, 0, 1)[None]
        with torch.no_grad():
            y = m(x).clamp(0, 1)[0].permute(1, 2, 0).numpy()
        return (y * 255.0 + 0.5).astype(np.uint8)
    except Exception as exc:  # noqa: BLE001 (the plain enlargement is still a mouth)
        print(json.dumps({"lips": "upscale skipped", "error": str(exc)[:160]}))
        return face


def make(base: Path, audio: Path, out: Path, head=None, close_n: int = 0, seconds: float | None = None) -> dict:
    import numpy as np
    from PIL import Image
    t0 = time.time()
    work = Path(tempfile.mkdtemp(prefix="lips-"))
    try:
        wav = _voice(audio, work)
        secs = seconds or len(wav) / 16000
        n = frames_for(secs)
        frames = _base(base, work, n, head, close_n)
        faces = fill_gaps(_faces(frames, _yunet(work)))
        if not faces:
            raise SystemExit(f"{base.name}: no face found")
        faces = smooth(faces)
        lips = Lips()
        feats = lips.audio(wav, n)
        h, w = frames[0].shape[:2]
        boxes = [muse_box(f, w, h) for f in faces]
        crops = [np.asarray(Image.fromarray(fr[y1:y2, x1:x2]).resize((CROP, CROP), Image.LANCZOS))
                 for fr, (x1, y1, x2, y2) in zip(frames, boxes)]
        t1 = time.time()
        mouths = lips.mouths(crops, feats)
        t2 = time.time()
        dst = work / "out"
        dst.mkdir()
        for i, (fr, (x1, y1, x2, y2), face, m) in enumerate(zip(frames, boxes, faces, mouths)):
            bw, bh = x2 - x1, y2 - y1
            big = np.asarray(Image.fromarray(_sharp(m)).resize((bw, bh), Image.LANCZOS)).astype(np.float32)
            mask = mouth_oval(bw, bh, (face[9] - y1) / bh)[..., None]
            frame = fr.astype(np.float32).copy()
            frame[y1:y2, x1:x2] = frame[y1:y2, x1:x2] * (1 - mask) + big * mask
            Image.fromarray(frame.clip(0, 255).astype(np.uint8)).save(dst / f"f{i:05d}.png")
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", str(dst / "f%05d.png"), "-i", str(audio),
                        "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", str(out)], check=True)
        row = {"lips": out.name, "engine": "musetalk-1.5", "frames": n, "seconds": round(secs, 3),
               "base": base.name, "model_s": round(t2 - t1), "s": round(time.time() - t0)}
        print(json.dumps(row))
        return row
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="", help="with --jobs/--pictures/--voices: the talking shot to make")
    ap.add_argument("--jobs", default="")
    ap.add_argument("--pictures", default="")
    ap.add_argument("--voices", default="", help="the folder `luna_reels voices` wrote (voices.json + the files)")
    ap.add_argument("--base", default="", help="her animated clip (.mp4) or her picture (.png)")
    ap.add_argument("--audio", default="", help="the line's own voice")
    ap.add_argument("--out", required=True)
    ap.add_argument("--head", default="", help="her head box in the picture, fractions x0,y0,x1,y1 (castframes)")
    ap.add_argument("--n", type=int, default=0, help="which talking line this is (each is cut a little closer or wider)")
    ap.add_argument("--seconds", type=float, default=0.0)
    a = ap.parse_args(argv)
    if a.scene:
        spec = json.load(open(a.jobs, encoding="utf-8"))
        manifest = json.load(open(Path(a.voices) / "voices.json", encoding="utf-8"))
        job = line_for(spec, manifest, a.pictures, a.voices, a.scene)
        print(json.dumps({"lips": "job", **job}))
        make(Path(job["base"]), Path(job["audio"]), Path(a.out), job["head"], job["n"], job["seconds"] or None)
        return 0
    if not (a.base and a.audio):
        raise SystemExit("--scene with --jobs/--pictures/--voices, or --base and --audio")
    head = [float(v) for v in a.head.split(",")] if a.head else None
    if head and not (len(head) == 4 and 0 <= head[0] < head[2] <= 1 and 0 <= head[1] < head[3] <= 1):
        raise SystemExit("--head: four fractions x0,y0,x1,y1")
    make(Path(a.base), Path(a.audio), Path(a.out), head, a.n, a.seconds or None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
