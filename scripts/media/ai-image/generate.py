#!/usr/bin/env python3
"""LikeLink's own image model runner — no account, no key, no credits.

Runs an open-weights Stable Diffusion 1.5 model (Lykon/dreamshaper-8,
CreativeML OpenRAIL-M: commercial use allowed under its use restrictions)
with the LCM-LoRA (latent-consistency/lcm-lora-sdv1-5) for 6-step generation
on the GitHub Actions CPU runner. Public weights download anonymously.

It draws ORIGINAL characters and scenes only. The product is never generated:
the reel always shows the product's real photo.

  python generate.py --jobs jobs.json --out DIR
  jobs.json: [{"id": "...", "prompt": "...", "seed": 123}, ...]
Writes DIR/<id>.png and prints one JSON line per image (id, ms, bytes).
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--steps", type=int, default=6)
    ap.add_argument("--width", type=int, default=512)
    ap.add_argument("--height", type=int, default=912)
    a = ap.parse_args()
    import torch
    from diffusers import StableDiffusionPipeline, LCMScheduler

    torch.set_num_threads(os.cpu_count() or 4)
    t0 = time.time()
    pipe = StableDiffusionPipeline.from_pretrained(MODEL, torch_dtype=torch.float32, safety_checker=None, requires_safety_checker=False)
    pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    pipe.load_lora_weights(LCM_LORA)
    pipe.fuse_lora()
    pipe.set_progress_bar_config(disable=True)
    print(json.dumps({"loaded_ms": int((time.time() - t0) * 1000), "model": MODEL}), flush=True)

    os.makedirs(a.out, exist_ok=True)
    for job in json.load(open(a.jobs)):
        t = time.time()
        g = torch.Generator("cpu").manual_seed(int(job.get("seed", 1)))
        img = pipe(prompt=f"{STYLE}, {job['prompt']}", negative_prompt=NEGATIVE, num_inference_steps=a.steps,
                   guidance_scale=1.5, width=a.width, height=a.height, generator=g).images[0]
        path = os.path.join(a.out, f"{job['id']}.png")
        img.save(path)
        print(json.dumps({"id": job["id"], "ms": int((time.time() - t) * 1000), "bytes": os.path.getsize(path)}), flush=True)


if __name__ == "__main__":
    main()
