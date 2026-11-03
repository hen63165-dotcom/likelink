"""LikeLink's cloud studio: every scene of a 3D studio reel says its line, on a cloud GPU.

The owner, 2026-10-28: a Ravit-level reel in minutes, in the cloud, for any
product and character — what the free CPU runners (about two hours a reel,
SadTalker lips) cannot do. Modal (modal.com) runs it on the owner's own account
(the repository secrets MODAL_TOKEN_ID / MODAL_TOKEN_SECRET; nothing runs
without them), every scene on its own GPU side by side, with open models only:

  - a missing picture (the talking object; a presenter without a checked
    keyframe) is drawn by FLUX.1 [schnell] (Apache-2.0), the studio's own
    flux.py with the same open copies, in bf16 on the GPU;
  - every scene says its own line: InfiniteTalk (MeiGen-AI, Apache-2.0, on
    Wan2.1-I2V-14B, Apache-2.0) moves the whole picture — mouth, head, hands —
    to the line's own voice file (spoken by the reel engine, LUNA_VOICE_CACHE,
    so the edit plays the very same audio), with a step-distilled LoRA when one
    downloads;
  - each clip is enlarged to 1080×1920 (upscale.py, Real-ESRGAN, on the GPU).

The weights live in a Modal volume (downloaded once); a month's GPU time is
held under the free monthly credit (cloudplan.budget_allows, a Modal dict);
nothing is posted anywhere. The reel itself is edited on the runner by the
reel engine (captions, labels, the seller's real photo), as before.

  modal run scripts/media/gpu/studio_gpu.py --jobs JOBS.json --pictures DIR --voices DIR --out DIR
Writes OUT/<scene>.talk.mp4 (+ any drawn <shot>.png in PICTURES) and OUT/gpu.jsonl.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
sys.path.insert(0, "/studio")
import cloudplan  # noqa: E402

W = "/weights"
INFINITETALK = "https://github.com/MeiGen-AI/InfiniteTalk.git"
INFINITETALK_REF = os.environ.get("INFINITETALK_REF", "main")
READY = f"{W}/ready-v1.json"

app = modal.App("likelink-studio")
weights = modal.Volume.from_name("likelink-studio-weights", create_if_missing=True)
budget = modal.Dict.from_name("likelink-studio-budget", create_if_missing=True)

# InfiniteTalk's own environment (its README: torch 2.4.1 + cu121, xformers 0.0.28, flash-attn 2.7.4.post1).
talk_image = (
    modal.Image.from_registry("nvidia/cuda:12.1.1-cudnn8-devel-ubuntu22.04", add_python="3.10")
    .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0", "build-essential")
    .pip_install("torch==2.4.1", "torchvision==0.19.1", "torchaudio==2.4.1", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("xformers==0.0.28", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("ninja", "packaging", "wheel", "psutil", "misaki[en]", "librosa", "pillow", "huggingface_hub[hf_transfer]")
    .pip_install("flash_attn==2.7.4.post1", extra_options="--no-build-isolation")
    .run_commands(
        f"git clone {INFINITETALK} /infinitetalk && cd /infinitetalk && git checkout {INFINITETALK_REF} && git log -1 --format=%H > /infinitetalk/COMMIT",
        "printf 'torch==2.4.1\\ntorchvision==0.19.1\\ntorchaudio==2.4.1\\nxformers==0.0.28\\n' > /constraints.txt",
        "pip install -r /infinitetalk/requirements.txt -c /constraints.txt",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": f"{W}/hf", "TOKENIZERS_PARALLELISM": "false"})
    .add_local_file(HERE / "cloudplan.py", "/studio/cloudplan.py")
    .add_local_file(HERE.parent / "studio3d" / "upscale.py", "/studio/upscale.py")
)

# The studio's FLUX.1 [schnell] loader (flux.py: open copies, GGUF transformer) on a GPU.
draw_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch==2.5.1", "diffusers>=0.32", "transformers>=4.46,<5", "accelerate", "sentencepiece", "protobuf",
                 "gguf", "safetensors", "pillow", "huggingface_hub[hf_transfer]")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": f"{W}/hf"})
    .add_local_file(HERE.parent / "studio3d" / "flux.py", "/studio/flux.py")
    .add_local_file(HERE / "cloudplan.py", "/studio/cloudplan.py")
)


def note(**kw):
    print(json.dumps(kw, ensure_ascii=False), flush=True)


@app.function(image=talk_image, volumes={W: weights}, timeout=3600, cpu=8, memory=32768)
def fetch_weights() -> dict:
    """The models in the volume, once: Wan2.1-I2V-14B-480P, the audio encoder, InfiniteTalk, a step LoRA."""
    if os.path.exists(READY):
        return json.loads(Path(READY).read_text())
    from huggingface_hub import hf_hub_download, snapshot_download
    t = time.time()
    snapshot_download("Wan-AI/Wan2.1-I2V-14B-480P", local_dir=f"{W}/Wan2.1-I2V-14B-480P")
    snapshot_download("TencentGameMate/chinese-wav2vec2-base", local_dir=f"{W}/chinese-wav2vec2-base")
    hf_hub_download("TencentGameMate/chinese-wav2vec2-base", "model.safetensors", revision="refs/pr/1",
                    local_dir=f"{W}/chinese-wav2vec2-base")
    snapshot_download("MeiGen-AI/InfiniteTalk", allow_patterns=["single/*"], local_dir=f"{W}/InfiniteTalk")
    lora = None
    for repo, path, steps, shift, text, audio in cloudplan.LORAS:
        try:
            local = hf_hub_download(repo, path, local_dir=f"{W}/lora")
            lora = {"repo": repo, "file": path, "path": local, "steps": steps, "shift": shift, "text": text, "audio": audio}
            break
        except Exception as exc:  # noqa: BLE001 (the next one, else the model's own 40 steps)
            note(lora=path, refused=f"{type(exc).__name__}: {str(exc)[:160]}")
    info = {"lora": lora, "commit": Path("/infinitetalk/COMMIT").read_text().strip(), "s": round(time.time() - t)}
    Path(READY).write_text(json.dumps(info))
    weights.commit()
    return info


@app.function(image=draw_image, gpu=["L40S", "A100-80GB", "H100"], volumes={W: weights}, timeout=1800)
def draw(spec: dict, only: list[str]) -> dict:
    """The missing pictures, with the studio's own flux.py on the GPU."""
    work = Path(tempfile.mkdtemp(prefix="draw-"))
    (work / "jobs.json").write_text(json.dumps(spec, ensure_ascii=False))
    t = time.time()
    r = subprocess.run([sys.executable, "/studio/flux.py", "--jobs", str(work / "jobs.json"), "--out", str(work / "pics"),
                        "--only", ",".join(only), "--device", "cuda"], capture_output=True, text=True)
    weights.commit()  # the encoders and the transformer stay cached for the next reel
    if r.returncode != 0:
        raise RuntimeError(f"flux.py failed: {(r.stdout + r.stderr)[-1500:]}")
    pics = {p.stem: p.read_bytes() for p in (work / "pics").glob("*.png")}
    return {"pictures": pics, "s": round(time.time() - t), "log": r.stdout[-1500:]}


@app.function(image=talk_image, gpu=["H100", "A100-80GB"], volumes={W: weights}, timeout=1800)
def talk(job: dict, picture: bytes, audio: bytes, info: dict) -> dict:
    """One scene says its line: InfiniteTalk on the picture with the line's own voice, then 1080×1920."""
    import torch
    work = Path(tempfile.mkdtemp(prefix="talk-"))
    (work / "in.png").write_bytes(picture)
    (work / "voice.mp3").write_bytes(audio)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(work / "voice.mp3"), "-ar", "16000", "-ac", "1",
                    str(work / "voice.wav")], check=True)
    (work / "in.json").write_text(json.dumps({"prompt": job["prompt"], "cond_video": str(work / "in.png"),
                                              "cond_audio": {"person1": str(work / "voice.wav")}}, ensure_ascii=False))
    t = time.time()
    log = ""
    for low_vram in (False, True):  # out of memory once: again, keeping less of the model on the GPU
        args = cloudplan.infinitetalk_args(W, info.get("lora"), str(work / "in.json"), str(work / "out"), job["seed"], low_vram)
        r = subprocess.run([sys.executable, "generate_infinitetalk.py", *args], cwd="/infinitetalk", capture_output=True, text=True)
        log = (r.stdout + r.stderr)[-3000:]
        if r.returncode == 0 or "out of memory" not in log.lower():
            break
    out = work / "out.mp4"
    if not out.exists():
        raise RuntimeError(f"{job['scene']}: InfiniteTalk made no clip: {log[-1500:]}")
    made = round(time.time() - t)
    import upscale  # noqa: PLC0415 (from /studio)
    sharp = upscale.video(str(out))
    return {"scene": job["scene"], "mp4": out.read_bytes(), "s": round(time.time() - t), "generate_s": made,
            "upscaled": bool(sharp), "gpu": torch.cuda.get_device_name(0), "lora": (info.get("lora") or {}).get("file"),
            "commit": info.get("commit"), "log": log[-800:]}


@app.local_entrypoint()
def main(jobs: str, pictures: str, voices: str, out: str):
    spec = json.loads(Path(jobs).read_text(encoding="utf-8"))
    manifest = json.loads((Path(voices) / "voices.json").read_text(encoding="utf-8"))
    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    pics = Path(pictures)
    pics.mkdir(parents=True, exist_ok=True)
    need = cloudplan.draw_needed(spec, pics)
    talks = cloudplan.talk_jobs(spec, manifest, pics, voices)
    month = cloudplan.month_key()
    hours = float(os.environ.get("STUDIO_GPU_MONTH_HOURS") or cloudplan.MONTH_HOURS)
    used = float(budget.get(month, 0) or 0)
    planned = cloudplan.planned_seconds(len(talks), len(need))
    note(month=month, used_s=round(used), planned_s=planned, allowance_h=hours, draw=need, talk=[j["scene"] for j in talks])
    if not talks:
        raise SystemExit("nothing to say on camera in this shot list")
    if not cloudplan.budget_allows(used, planned, hours):
        print(f"GPU_BUDGET: this month's GPU allowance ({hours} h) would be passed; the free studio makes this reel instead")
        sys.exit(4)

    spent = 0.0
    info = fetch_weights.remote()
    note(weights=info)
    if need:
        drawn = draw.remote(spec, need)
        spent += drawn["s"]
        for sid, data in drawn["pictures"].items():
            (pics / f"{sid}.png").write_bytes(data)
            (out_dir / f"{sid}.png").write_bytes(data)
        note(drew=sorted(drawn["pictures"]), s=drawn["s"])
        missing = [sid for sid in need if not (pics / f"{sid}.png").exists()]
        if missing:
            raise SystemExit(f"not drawn: {missing}")

    calls = [(j, talk.spawn(j, Path(j["picture"]).read_bytes(), Path(j["audio"]).read_bytes(), info)) for j in talks]
    made = 0
    with open(out_dir / "gpu.jsonl", "a", encoding="utf-8") as log:
        for job, call in calls:
            try:
                res = call.get()
            except Exception as exc:  # noqa: BLE001 (that scene falls back to the free studio's motion)
                row = {"scene": job["scene"], "ok": False, "error": f"{type(exc).__name__}: {str(exc)[:600]}"}
            else:
                (out_dir / f"{job['scene']}.talk.mp4").write_bytes(res.pop("mp4"))
                spent += res["s"]
                made += 1
                row = {"ok": True, **res}
            log.write(json.dumps(row, ensure_ascii=False) + "\n")
            note(**{k: v for k, v in row.items() if k != "log"})
    budget[month] = used + spent
    note(month=month, spent_s=round(spent), used_s=round(used + spent), made=made, of=len(talks))
    if not made:
        sys.exit(5)
