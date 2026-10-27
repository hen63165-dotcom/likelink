#!/usr/bin/env python3
"""LikeLink's 3D studio, stage 1: the scene pictures, free.

FLUX.1 [schnell] (black-forest-labs, Apache-2.0: commercial use allowed) on
the GitHub Actions CPU runner — no account, no key, no credits. The owner,
2026-10-27: reels at the level of @ravitrecommends, built on our own free
engine instead of a paid one. The big model does not fit a 16 GB runner
whole, so it runs in two passes:

  1. the text encoders (CLIP-L + T5-XXL, bf16) read every prompt, then leave;
  2. the transformer (a public 4-bit GGUF of the same weights,
     city96/FLUX.1-schnell-gguf) and the VAE draw each picture in 4 steps.

It draws ORIGINAL characters and talking objects only. A product is never
drawn: the reel shows its real photo (a drawn bracelet would be a promise
the seller never made). Hebrew is never drawn either; captions are
composited later.

  python flux.py --jobs jobs.json --out DIR [--width 576 --height 1024]
  jobs.json: {"style": "...", "character": "...", "shots": [{"id", "prompt", "seed", "character": true}]}
Writes DIR/<id>.png and one JSON line per picture (id, seconds, bytes).
"""
import argparse, gc, json, os, sys, time

REPO = "black-forest-labs/FLUX.1-schnell"
GGUF = os.environ.get(
    "FLUX_GGUF",
    "https://huggingface.co/city96/FLUX.1-schnell-gguf/blob/main/flux1-schnell-Q4_K_S.gguf",
)
# No studio or artist names (a style is described, never borrowed). FLUX has
# no negative prompt and reads "no X" as a hint of X, so nothing unwanted is
# named at all: the clothes are "plain", and ears, wrists and necks are never
# the subject of a shot (nothing on her can pass for the product).
GUARD = ""


def prompt_of(spec, shot):
    """The one prompt the model reads for a shot: the series style, the
    character's fixed look when she is in it, the shot, and the guard."""
    parts = [spec.get("style", ""), spec.get("character", "") if shot.get("character") else "", shot["prompt"], GUARD]
    return ", ".join(p.strip().rstrip(".") for p in parts if p and p.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=576)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--only", default="", help="comma-separated shot ids")
    a = ap.parse_args()
    spec = json.load(open(a.jobs, encoding="utf-8"))
    shots = [s for s in spec["shots"] if not a.only or s["id"] in a.only.split(",")]
    os.makedirs(a.out, exist_ok=True)

    import torch
    from diffusers import FluxPipeline, FluxTransformer2DModel, GGUFQuantizationConfig

    torch.set_num_threads(os.cpu_count() or 4)
    t0 = time.time()
    # Pass 1: the prompts become embeddings; the encoders are freed after.
    enc = FluxPipeline.from_pretrained(REPO, transformer=None, vae=None, torch_dtype=torch.bfloat16)
    embeds = {}
    with torch.no_grad():
        for s in shots:
            text = prompt_of(spec, s)
            pe, ppe, _ = enc.encode_prompt(prompt=text, prompt_2=text, max_sequence_length=256)
            embeds[s["id"]] = (pe.float(), ppe.float())
    del enc
    gc.collect()
    print(json.dumps({"stage": "encoded", "shots": len(shots), "s": round(time.time() - t0)}), flush=True)

    # Pass 2: the 4-bit transformer computes in float32 (the runner's CPU has
    # no native bf16, so float32 is the fast path here).
    transformer = FluxTransformer2DModel.from_single_file(
        GGUF,
        quantization_config=GGUFQuantizationConfig(compute_dtype=torch.float32),
        torch_dtype=torch.float32,
        config=REPO,
        subfolder="transformer",
    )
    pipe = FluxPipeline.from_pretrained(
        REPO, transformer=transformer, text_encoder=None, text_encoder_2=None,
        tokenizer=None, tokenizer_2=None, torch_dtype=torch.float32,
    )
    for s in shots:
        t = time.time()
        pe, ppe = embeds[s["id"]]
        with torch.no_grad():
            img = pipe(
                prompt_embeds=pe, pooled_prompt_embeds=ppe,
                num_inference_steps=a.steps, guidance_scale=0.0,
                width=a.width, height=a.height,
                generator=torch.Generator().manual_seed(int(s.get("seed", 1))),
            ).images[0]
        path = os.path.join(a.out, f"{s['id']}.png")
        img.save(path)
        print(json.dumps({"id": s["id"], "s": round(time.time() - t), "bytes": os.path.getsize(path)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
