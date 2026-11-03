"""LikeLink's cloud studio: what to make on the GPU, decided without the cloud (pure; tested).

The cloud studio (studio_gpu.py, on Modal) makes every scene of a 3D studio
reel say its own line on camera. This module decides, from the shot list and
the voices the reel engine spoke (luna_reels voices → voices.json):

  - which pictures are still missing and are drawn there (never a shot from
    the presenter's checked keyframe: "cast");
  - one talking job per scene: its picture, its line's own voice file, what it
    does while it talks, its seed;
  - whether this month's GPU allowance still covers the reel (a hard limit
    kept under the free monthly credit, so nothing is ever spent beyond it);
  - the InfiniteTalk command line (MeiGen-AI, Apache-2.0, on Wan2.1-I2V-14B,
    Apache-2.0) with the step-distilled LoRA it was given, if any.
"""
from __future__ import annotations

import time
from pathlib import Path

# A scene on the GPU: the model loaded from the weights volume, a few seconds
# of video at 4 steps, the enlargement to 1080×1920 — about this much, measured
# against the allowance before anything starts (the real seconds are added after).
SCENE_ESTIMATE_S = 300
DRAW_ESTIMATE_S = 180
# The month's GPU allowance: about $24 of H100 time at $3.95 an hour, under the
# $30 free monthly credit of Modal's Starter plan; override with STUDIO_GPU_MONTH_HOURS.
MONTH_HOURS = 6.0
DEFAULT_TALK = "the character talks to the camera with natural expressions and small gestures, 3D animated cartoon"

# Step-distilled LoRAs for Wan2.1-I2V-14B-480P, the first one that downloads is used:
# (repo, file, steps, shift, text guidance, audio guidance).
LORAS = [
    ("Kijai/WanVideo_comfy", "Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors", 4, 2.0, 1.0, 2.0),
    ("vrgamedevgirl84/Wan14BT2VFusioniX", "FusionX_LoRa/Wan2.1_I2V_14B_FusionX_LoRA.safetensors", 8, 2.0, 1.0, 2.0),
]
# Without one: the model's own 40 steps and guidance (slower, the same look).
NO_LORA = (40, None, 5.0, 4.0)


def draw_needed(spec: dict, pictures: str | Path) -> list[str]:
    """The shots to draw on the GPU: not from the cast keyframe, and no picture yet."""
    folder = Path(pictures)
    return [s["id"] for s in spec.get("shots", []) if not s.get("cast") and not (folder / f"{s['id']}.png").exists()]


def talk_jobs(spec: dict, manifest: dict, pictures: str | Path, voices: str | Path) -> list[dict]:
    """One job per talking scene, in the story's order: its picture, its own line's voice, its action."""
    shots = {s["id"]: s for s in spec.get("shots", [])}
    jobs, seen = [], set()
    for row in manifest.get("beats", []):
        sid = row.get("scene") or ""
        shot = shots.get(sid)
        if not shot or not shot.get("talk") or shot.get("still"):
            continue
        if sid in seen:  # the reel plays a scene's talking shot on its one line
            raise ValueError(f"scene '{sid}' is said on two lines; give each line its own scene")
        seen.add(sid)
        name = str(row.get("file") or "")
        if not name or "/" in name or name.startswith("."):
            raise ValueError(f"beat {row.get('beat')}: no voice file")
        jobs.append({
            "scene": sid,
            "picture": str(Path(pictures) / f"{sid}.png"),
            "audio": str(Path(voices) / name),
            "seconds": float(row.get("seconds") or 0),
            "prompt": shot.get("talkPrompt") or shot.get("motion") or DEFAULT_TALK,
            "seed": int(shot.get("seed", 1)),
        })
    return jobs


def month_key(now: float | None = None) -> str:
    return time.strftime("%Y-%m", time.gmtime(time.time() if now is None else now))


def planned_seconds(n_talks: int, n_draws: int) -> int:
    return n_talks * SCENE_ESTIMATE_S + (DRAW_ESTIMATE_S if n_draws else 0)


def budget_allows(used_s: float, planned_s: float, month_hours: float = MONTH_HOURS) -> bool:
    """Start only when the whole reel fits in what is left of the month's allowance."""
    return used_s + planned_s <= month_hours * 3600


def infinitetalk_args(weights: str, lora: dict | None, input_json: str, save: str, seed: int,
                      low_vram: bool = False) -> list[str]:
    """generate_infinitetalk.py's arguments: one image + one voice → one talking clip (streaming for any length)."""
    w = weights.rstrip("/")
    args = ["--ckpt_dir", f"{w}/Wan2.1-I2V-14B-480P",
            "--wav2vec_dir", f"{w}/chinese-wav2vec2-base",
            "--infinitetalk_dir", f"{w}/InfiniteTalk/single/infinitetalk.safetensors",
            "--input_json", input_json, "--size", "infinitetalk-480", "--mode", "streaming", "--motion_frame", "9",
            "--save_file", save, "--base_seed", str(int(seed))]
    if lora:
        args += ["--lora_dir", lora["path"], "--lora_scale", "1.0", "--sample_steps", str(lora["steps"]),
                 "--sample_shift", str(lora["shift"]), "--sample_text_guide_scale", str(lora["text"]),
                 "--sample_audio_guide_scale", str(lora["audio"])]
    else:
        steps, _shift, text, audio = NO_LORA
        args += ["--sample_steps", str(steps), "--sample_text_guide_scale", str(text), "--sample_audio_guide_scale", str(audio)]
    if low_vram:
        args += ["--num_persistent_param_in_dit", "0"]
    return args
