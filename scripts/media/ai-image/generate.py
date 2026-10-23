#!/usr/bin/env python3
"""LikeLink's own image model runner — no account, no key, no credits.

Runs an open-weights Stable Diffusion 1.5 model (Lykon/dreamshaper-8,
CreativeML OpenRAIL-M: commercial use allowed under its use restrictions)
with the LCM-LoRA (latent-consistency/lcm-lora-sdv1-5) for 6-step generation
on the GitHub Actions CPU runner. Public weights download anonymously.

It draws ORIGINAL characters and scenes only. The product is never generated:
the reel always shows the product's real photo.

  python generate.py --jobs jobs.json --out DIR [--ref face.jpg]
  jobs.json: [{"id": "...", "prompt": "...", "seed": 123, "negative": "optional extra"}, ...]
Writes DIR/<id>.png and prints one JSON line per image (id, ms, bytes).

--ref keeps one character's face across scenes (SD 1.5 only): the open
IP-Adapter "plus face" weights (h94/IP-Adapter, Apache-2.0) read the face in
the reference picture, so Luna stays Luna from scene to scene. If the adapter
cannot load, the run goes on without it and says so.
"""
import argparse, json, os, time

MODEL = os.environ.get("LIKELINK_IMAGE_MODEL", "Lykon/dreamshaper-8")
LCM_LORA = "latent-consistency/lcm-lora-sdv1-5"
# Cartoon, not a photo; modest; no text (Hebrew is composited later, never drawn by the model).
NEGATIVE = ("photo, photograph, photorealistic, realistic, realistic skin texture, real person, "
            "text, letters, words, watermark, logo, signature, brand name, "
            "cleavage, revealing clothes, short skirt, sexy, nsfw, "
            "deformed, disfigured, extra fingers, extra limbs, bad hands, lowres, blurry, jpeg artifacts")
STYLE = ("3d animated feature film still, original stylized character, large expressive eyes, glossy hair, "
         "soft subsurface lighting, vibrant colors, highly detailed, blender render")
# Talking-object mascots (series F): no human cues in the style, and people are
# pushed out by the negative prompt, or the model turns every object into a girl.
OBJECT_STYLE = "stylized 3d animated film render, cute anthropomorphic mascot with big glossy eyes and an expressive mouth, soft light, vibrant, high detail"
OBJECT_NEGATIVE = NEGATIVE + ", human, person, woman, man, girl, boy, child, people, human face, hair, body, legs"
# Sportswear (a sports bra and leggings, the owner's reference look, 2026-10-23):
# the same character style and the same limits, without the "revealing clothes"
# term that would cover the outfit up; nothing sexualised, still.
ATHLETE_NEGATIVE = NEGATIVE.replace("revealing clothes, ", "") + ", lingerie, swimsuit, suggestive pose"
# The story cast (cast.json): a short style and no built-in negative, because
# SD 1.5's text encoder reads 77 tokens and silently drops the rest. The first
# cast (2026-10-23) lost the end of every prompt: "a sports bra and" without
# "full-length leggings" came out as underwear, no scene action was ever read,
# and the negative's "shorts, logo" never applied. The job carries the whole
# negative, and a cast job that would be cut is refused (strict_length).
CAST_STYLE = "3d animated film still, original stylized character, soft light"
KINDS = {"character": (STYLE, NEGATIVE), "object": (OBJECT_STYLE, OBJECT_NEGATIVE), "athlete": (STYLE, ATHLETE_NEGATIVE),
         "cast": (CAST_STYLE, "")}
STRICT_LENGTH = {"cast"}


def texts(job):
    """The prompt and negative the model reads for one job."""
    style, negative = KINDS.get(job.get("kind", "character"), KINDS["character"])
    # A job may push out more (a presenter wears no jewellery, so nothing
    # on her can be taken for the product the reel shows).
    negative = ", ".join(t for t in (negative, job.get("negative", "")) if t)
    return f"{style}, {job['prompt']}", negative


def too_long(tokenizer, jobs):
    """Jobs whose prompt or negative the text encoder would cut, as {id, field, tokens, limit}."""
    limit = tokenizer.model_max_length
    out = []
    for job in jobs:
        for field, text in zip(("prompt", "negative"), texts(job)):
            n = len(tokenizer(text).input_ids)
            if n > limit:
                out.append({"id": job["id"], "kind": job.get("kind", "character"), "field": field, "tokens": n, "limit": limit})
    return out


# A stronger open model for 3D "talking object" mascots: Segmind SSD-1B (a
# distilled SDXL, Apache-2.0) with its LCM-LoRA (4–8 steps). Still CPU-only,
# no account, no key, no credits — just slower than SD 1.5 per image.
SDXL_ENGINES = {
    "ssd1b": ("segmind/SSD-1B", "latent-consistency/lcm-lora-ssd-1b"),
}


def load_pipeline(engine):
    import torch
    from diffusers import LCMScheduler
    if engine in SDXL_ENGINES:
        from diffusers import StableDiffusionXLPipeline
        model, lora = SDXL_ENGINES[engine]
        pipe = StableDiffusionXLPipeline.from_pretrained(model, torch_dtype=torch.float32)
    else:
        from diffusers import StableDiffusionPipeline
        model, lora = MODEL, LCM_LORA
        pipe = StableDiffusionPipeline.from_pretrained(model, torch_dtype=torch.float32, safety_checker=None, requires_safety_checker=False)
    pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    pipe.load_lora_weights(lora)
    pipe.fuse_lora()
    pipe.set_progress_bar_config(disable=True)
    return pipe, model


IP_ADAPTER = ("h94/IP-Adapter", "models", "ip-adapter-plus-face_sd15.safetensors")


def load_reference(pipe, path, scale):
    """The face to keep (IP-Adapter), or None when it cannot be used."""
    from PIL import Image
    try:
        repo, sub, weights = IP_ADAPTER
        pipe.load_ip_adapter(repo, subfolder=sub, weight_name=weights)
        pipe.set_ip_adapter_scale(scale)
        return Image.open(path).convert("RGB")
    except Exception as exc:  # noqa: BLE001 (a missing adapter must not stop the run)
        print(json.dumps({"reference": "unavailable", "error": str(exc)[:200]}), flush=True)
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--steps", type=int, default=6)
    ap.add_argument("--width", type=int, default=512)
    ap.add_argument("--height", type=int, default=912)
    ap.add_argument("--engine", default=os.environ.get("LIKELINK_IMAGE_ENGINE", "sd15"), choices=["sd15", *SDXL_ENGINES])
    ap.add_argument("--ref", default=None, help="a face picture to keep across images (SD 1.5)")
    ap.add_argument("--ref-scale", type=float, default=0.6)
    a = ap.parse_args()
    import torch

    torch.set_num_threads(os.cpu_count() or 4)
    t0 = time.time()
    pipe, model = load_pipeline(a.engine)
    # SDXL-family models are trained at ~1 megapixel; SD 1.5 at 512.
    width, height = (768, 1344) if a.engine in SDXL_ENGINES and a.width == 512 else (a.width, a.height)
    ref = load_reference(pipe, a.ref, a.ref_scale) if a.ref and a.engine not in SDXL_ENGINES else None
    print(json.dumps({"loaded_ms": int((time.time() - t0) * 1000), "model": model, "engine": a.engine, "reference": bool(ref)}), flush=True)

    jobs = json.load(open(a.jobs))
    cut = too_long(pipe.tokenizer, jobs)
    for c in cut:
        print(json.dumps({"truncated": c}), flush=True)
    if any(c["kind"] in STRICT_LENGTH for c in cut):
        raise SystemExit("a cast prompt is longer than the text encoder reads; shorten it in cast.json")

    os.makedirs(a.out, exist_ok=True)
    for job in jobs:
        t = time.time()
        g = torch.Generator("cpu").manual_seed(int(job.get("seed", 1)))
        prompt, negative = texts(job)
        if ref is not None:  # once loaded, the adapter needs the picture; a job can turn its weight off
            pipe.set_ip_adapter_scale(a.ref_scale if job.get("ref", True) else 0.0)
        img = pipe(prompt=prompt, negative_prompt=negative, num_inference_steps=a.steps,
                   guidance_scale=1.5, width=width, height=height, generator=g,
                   **({"ip_adapter_image": ref} if ref is not None else {})).images[0]
        path = os.path.join(a.out, f"{job['id']}.png")
        img.save(path)
        print(json.dumps({"id": job["id"], "ms": int((time.time() - t) * 1000), "bytes": os.path.getsize(path)}), flush=True)


if __name__ == "__main__":
    main()
