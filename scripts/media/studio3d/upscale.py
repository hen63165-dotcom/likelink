#!/usr/bin/env python3
"""LikeLink's 3D studio: sharp at 1080×1920.

Pictures and clips are made at 576×1024 (what a CPU runner can draw and
animate); enlarging them plainly to the reel's 1080×1920 left them soft next
to @ravitrecommends' reels. This enlarges them with Real-ESRGAN's model for
animation (realesr-animevideov3, BSD-3-Clause, xinntao/Real-ESRGAN v0.2.5.0)
through spandrel (MIT) on the CPU — ×4, then down to 1080×1920 — so lines and
eyes stay crisp. Pixels are only enlarged, never repainted.

  python upscale.py video IN.mp4 [OUT.mp4]     (OUT defaults to IN)
  python upscale.py image IN.png [OUT.png]
Without torch/spandrel or the weights it leaves the file as it is (exit 0).
"""
import json, os, shutil, subprocess, sys, tempfile, time

WEIGHTS = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth"
SIZE = (1080, 1920)
_model = None


def model():
    """The ×4 animation upscaler, loaded once (None when it cannot be)."""
    global _model
    if _model is None:
        try:
            import torch
            from spandrel import ModelLoader
            cache = os.path.join(os.environ.get("HF_HOME", tempfile.gettempdir()), "realesr-animevideov3.pth")
            if not os.path.exists(cache):
                import urllib.request
                urllib.request.urlretrieve(WEIGHTS, cache)
            torch.set_num_threads(os.cpu_count() or 4)
            _model = ModelLoader().load_from_file(cache).eval()
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"upscale": None, "error": str(exc)[:200]}))
            _model = False
    return _model or None


def enlarge(img):
    """One PIL picture → 1080×1920 (cover), through the model when it is available."""
    from PIL import Image
    m = model()
    if m is not None:
        import numpy as np
        import torch
        x = torch.from_numpy(np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0).permute(2, 0, 1)[None]
        with torch.no_grad():
            y = m(x).clamp(0, 1)[0].permute(1, 2, 0).numpy()
        img = Image.fromarray((y * 255.0 + 0.5).astype("uint8"))
    scale = max(SIZE[0] / img.width, SIZE[1] / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left, top = (img.width - SIZE[0]) // 2, (img.height - SIZE[1]) // 2
    return img.crop((left, top, left + SIZE[0], top + SIZE[1]))


def image(src, dst=None):
    from PIL import Image
    if model() is None:
        return False
    enlarge(Image.open(src)).save(dst or src)
    return True


def video(src, dst=None):
    """Every frame of a clip enlarged; the clip keeps its frame rate and its sound."""
    from PIL import Image
    if model() is None:
        return False
    t = time.time()
    work = tempfile.mkdtemp(prefix="up-")
    try:
        fps = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                              "-of", "csv=p=0", src], capture_output=True, text=True, check=True).stdout.strip() or "24"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, os.path.join(work, "f%05d.png")], check=True)
        frames = sorted(f for f in os.listdir(work) if f.startswith("f"))
        for f in frames:
            p = os.path.join(work, f)
            enlarge(Image.open(p)).save(p)
        out = os.path.join(work, "out.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", fps, "-i", os.path.join(work, "f%05d.png"), "-i", src,
                        "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-pix_fmt", "yuv420p",
                        "-c:a", "copy", "-shortest", out], check=True)
        shutil.move(out, dst or src)
        print(json.dumps({"upscaled": os.path.basename(dst or src), "frames": len(frames), "s": round(time.time() - t)}))
        return True
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main(argv):
    if len(argv) < 2 or argv[0] not in ("video", "image"):
        print(__doc__)
        return 2
    try:
        (video if argv[0] == "video" else image)(argv[1], argv[2] if len(argv) > 2 else None)
    except Exception as exc:  # noqa: BLE001 (the file is left as it was)
        print(json.dumps({"upscale": None, "file": argv[1], "error": str(exc)[:200]}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
