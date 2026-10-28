#!/usr/bin/env python3
"""LikeLink's 3D studio, stage 1b: real motion, free.

Each scene picture becomes a short clip in which the character really moves
(image-to-video), from the open LTX-Video distilled weights (Lightricks; the
2B model, the one a 16 GB CPU runner can hold) on the free GitHub Actions
runner. One shot per runner, several runners side by side, so a reel's
shots are animated at the same time. No account, no key, no credits.

Like flux.py it runs in two passes: the T5-XXL encoder reads the motion
prompt and leaves, then the video transformer and its VAE animate the
picture. Before the real clip it renders a tiny one, so a wiring mistake
costs a minute, not an hour. The log names every source used or refused
and the licence the model's own repository states.

  python animate.py --jobs jobs.json --pictures DIR --only SHOT [--width 480 --height 832 --frames 97]
Writes DIR/<shot>.mp4 (24 fps). A shot list's shot may set "motion": what
moves (the character's action, hair, the camera); the picture is the first frame.
"""
import argparse, gc, json, os, re, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flux import T5_TOKENIZER, first_source, load_t5, note  # noqa: E402

FILES_REPO = "Lightricks/LTX-Video"
CHECKPOINT = re.compile(r"^ltxv-2b-(\d+)\.(\d+)\.(\d+)-distilled[^/]*\.safetensors$")
# Diffusers-format repositories whose scheduler config fits the distilled models.
SCHEDULER_REPOS = ["Lightricks/LTX-Video-0.9.7-distilled", "Lightricks/LTX-Video-0.9.7-dev", "Lightricks/LTX-Video-0.9.5"]
# The distilled models' own 8 steps (diffusers' documented schedule), no guidance.
TIMESTEPS = [1000, 993, 987, 981, 975, 909, 725, 0.03]
QUALITY = ("cinematic 3D animated film, smooth natural motion, consistent character, "
           "stable face, detailed, soft lighting, high quality")


def checkpoint():
    """The newest 2B distilled single file in Lightricks' open repository, and its licence."""
    from huggingface_hub import HfApi
    api = HfApi()
    info = api.model_info(FILES_REPO)
    lic = getattr(getattr(info, "card_data", None), "license", None)
    names = [f for f in api.list_repo_files(FILES_REPO) if CHECKPOINT.match(f) and "fp8" not in f.lower()]
    if not names:
        raise SystemExit(f"no 2B distilled checkpoint in {FILES_REPO}")
    best = max(names, key=lambda f: tuple(int(x) for x in CHECKPOINT.match(f).groups()))
    note(source="ltx", used=FILES_REPO, path=best, gated=getattr(info, "gated", None), license=lic)
    try:  # the licence's own words, for the record (its name in the card is only "other")
        from huggingface_hub import hf_hub_download
        names = [f for f in api.list_repo_files(FILES_REPO) if re.search(r"licen[cs]e", f, re.I)]
        for name in names[:2]:
            text = open(hf_hub_download(FILES_REPO, name), encoding="utf-8", errors="replace").read()
            note(licence_file=name, head=re.sub(r"\s+", " ", text)[:1500])
    except Exception as exc:  # noqa: BLE001
        note(licence_file=None, error=str(exc)[:160])
    return f"https://huggingface.co/{FILES_REPO}/blob/main/{best}"


def motion_prompt(spec, shot):
    parts = [spec.get("style", ""), spec.get("character", "") if shot.get("character") else "",
             shot.get("prompt", ""), shot.get("motion", "gentle natural movement, the camera slowly pushes in"), QUALITY]
    return ", ".join(p.strip().rstrip(".") for p in parts if p and p.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--pictures", required=True)
    ap.add_argument("--only", required=True, help="one shot id")
    # The pictures' own size (sharper than 480x832 upscaled) and 3 s: the
    # model drifts from the first frame after about 3 s (the 2026-10-27 pilot).
    ap.add_argument("--width", type=int, default=576)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--frames", type=int, default=73, help="8k+1 frames at 24 fps (73 = 3 s)")
    a = ap.parse_args()
    spec = json.load(open(a.jobs, encoding="utf-8"))
    shot = next((s for s in spec["shots"] if s["id"] == a.only), None)
    if shot is None:
        raise SystemExit(f"no shot '{a.only}'")
    picture = os.path.join(a.pictures, f"{shot['id']}.png")
    if not os.path.exists(picture):
        raise SystemExit(f"no picture {picture}")

    import torch
    from diffusers import AutoencoderKLLTXVideo, FlowMatchEulerDiscreteScheduler, LTXConditionPipeline, LTXVideoTransformer3DModel
    from diffusers.pipelines.ltx.pipeline_ltx_condition import LTXVideoCondition
    from diffusers.utils import export_to_video
    from PIL import Image
    from transformers import T5TokenizerFast

    torch.set_num_threads(os.cpu_count() or 4)
    t0 = time.time()
    # Pass 1: the motion prompt → T5 embeddings; the encoder leaves.
    text = motion_prompt(spec, shot)
    tok = T5TokenizerFast.from_pretrained(T5_TOKENIZER)
    ids = tok(text, padding="max_length", max_length=256, truncation=True, add_special_tokens=True, return_tensors="pt")
    t5 = load_t5(torch)
    with torch.no_grad():
        embeds = t5(ids.input_ids)[0].float()
    mask = ids.attention_mask
    del t5
    gc.collect()
    note(stage="encoded", tokens=int(mask.sum()), s=round(time.time() - t0))

    # Pass 2: the video model.
    url = checkpoint()
    transformer = LTXVideoTransformer3DModel.from_single_file(url, torch_dtype=torch.float32)
    vae = AutoencoderKLLTXVideo.from_single_file(url, torch_dtype=torch.float32)
    scheduler = first_source("scheduler", [("pretrained", r, "scheduler") for r in SCHEDULER_REPOS],
                             lambda how, repo, sub: FlowMatchEulerDiscreteScheduler.from_pretrained(repo, subfolder=sub))
    if scheduler is None:
        raise SystemExit("no scheduler config answered")
    # Decoding 97 frames at once needs ~20 GB on the CPU (the first run's
    # runner was shut down there): the VAE decodes in small tiles, a few
    # frames at a time, overlapping so the seams blend.
    try:
        vae.enable_tiling(tile_sample_min_height=256, tile_sample_min_width=256, tile_sample_min_num_frames=16,
                          tile_sample_stride_height=192, tile_sample_stride_width=192, tile_sample_stride_num_frames=8)
    except TypeError:
        vae.enable_tiling()
    vae.use_framewise_decoding = True
    pipe = LTXConditionPipeline(scheduler=scheduler, vae=vae, text_encoder=None, tokenizer=None, transformer=transformer)
    pipe.set_progress_bar_config(disable=True)
    note(stage="loaded", s=round(time.time() - t0))

    image = Image.open(picture).convert("RGB")

    def render(width, height, frames):
        with torch.no_grad():
            return pipe(
                conditions=[LTXVideoCondition(image=image.resize((width, height), Image.LANCZOS), frame_index=0)],
                prompt_embeds=embeds, prompt_attention_mask=mask,
                width=width, height=height, num_frames=frames, frame_rate=24,
                timesteps=TIMESTEPS, guidance_scale=1.0,
                decode_timestep=0.05, decode_noise_scale=0.025, image_cond_noise_scale=0.0,
                generator=torch.Generator().manual_seed(int(shot.get("seed", 1))),
                output_type="pil",
            ).frames[0]

    t = time.time()
    render(256, 448, 17)  # the wiring check
    note(stage="smoke", s=round(time.time() - t))
    t = time.time()
    frames = render(a.width, a.height, a.frames)
    path = os.path.join(a.pictures, f"{shot['id']}.mp4")
    export_to_video(frames, path, fps=24, quality=9)  # the default quality left ~600 kb/s
    note(id=shot["id"], kind="clip", frames=len(frames), s=round(time.time() - t), bytes=os.path.getsize(path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
