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

black-forest-labs' own repository asks every downloader to sign in (the first
run, 2026-10-27: 401 GatedRepoError), so the pipeline is put together from
open copies of the same parts, with the configs written here: CLIP-L
(openai, MIT), the T5-XXL encoder (Apache-2.0), the GGUF transformer and the
FLUX autoencoder (Apache-2.0, from the first open source that answers; the
tiny open TAEF1 decoder, MIT, only when none does — the log says which).

It draws ORIGINAL characters and talking objects only. A product is never
drawn: the reel shows its real photo (a drawn bracelet would be a promise
the seller never made). Hebrew is never drawn either; captions are
composited later.

  python flux.py --jobs jobs.json --out DIR [--width 576 --height 1024]
  jobs.json: {"style": "...", "character": "...", "characterTop": "...",
              "shots": [{"id", "prompt", "seed", "character": true | "<her own look>", "frame": "upper"}]}
Writes DIR/<id>.png and one JSON line per picture (id, seconds, bytes).
"""
import argparse, gc, json, os, sys, time

GGUF = os.environ.get(
    "FLUX_GGUF",
    "https://huggingface.co/city96/FLUX.1-schnell-gguf/blob/main/flux1-schnell-Q4_K_S.gguf",
)
CLIP = "openai/clip-vit-large-patch14"
T5_TOKENIZER = "google/t5-v1_1-xxl"  # its config and tokenizer only (small files)
# The T5-XXL encoder: a diffusers-ready encoder-only copy, else the single
# encoder file ComfyUI ships (same tensor names as transformers' T5EncoderModel).
T5_SOURCES = [("pretrained", "city96/t5-v1_1-xxl-encoder-bf16", None),
              ("file", "comfyanonymous/flux_text_encoders", "t5xxl_fp16.safetensors")]
# The FLUX autoencoder ("ae", Apache-2.0 with FLUX.1 [schnell]); other open
# models ship the very same file, so the first open copy that answers is used.
VAE_SOURCES = [("file", "Comfy-Org/Lumina_Image_2.0_Repackaged", "split_files/vae/ae.safetensors"),
               ("file", "Comfy-Org/z_image_turbo", "split_files/vae/ae.safetensors"),
               ("file", "Comfy-Org/HiDream-I1_ComfyUI", "split_files/vae/ae.safetensors"),
               ("pretrained", "Tongyi-MAI/Z-Image-Turbo", "vae")]
TINY_VAE = "madebyollin/taef1"

# FLUX.1 [schnell]'s own configs (the gated repository's model_index parts).
TRANSFORMER_CONFIG = {
    "_class_name": "FluxTransformer2DModel", "attention_head_dim": 128, "guidance_embeds": False,
    "in_channels": 64, "joint_attention_dim": 4096, "num_attention_heads": 24, "num_layers": 19,
    "num_single_layers": 38, "patch_size": 1, "pooled_projection_dim": 768, "axes_dims_rope": [16, 56, 56],
}
VAE_CONFIG = {
    "_class_name": "AutoencoderKL", "act_fn": "silu", "block_out_channels": [128, 256, 512, 512],
    "down_block_types": ["DownEncoderBlock2D"] * 4, "up_block_types": ["UpDecoderBlock2D"] * 4,
    "force_upcast": True, "in_channels": 3, "out_channels": 3, "latent_channels": 16, "layers_per_block": 2,
    "mid_block_add_attention": True, "norm_num_groups": 32, "sample_size": 1024,
    "scaling_factor": 0.3611, "shift_factor": 0.1159, "use_post_quant_conv": False, "use_quant_conv": False,
}
SCHEDULER_CONFIG = {"num_train_timesteps": 1000, "shift": 1.0, "use_dynamic_shifting": False, "base_shift": 0.5,
                    "max_shift": 1.15, "base_image_seq_len": 256, "max_image_seq_len": 4096}
# No studio or artist names (a style is described, never borrowed). FLUX has
# no negative prompt and reads "no X" as a hint of X, so nothing unwanted is
# named at all: the clothes are "plain", and ears, wrists and necks are never
# the subject of a shot (nothing on her can pass for the product).
GUARD = ""


def seed_of(shot, take=-1):
    """A shot's seed; each further take of it draws from another seed."""
    return int(shot.get("seed", 1)) + (max(0, take) * 7919)


def look_of(spec, shot):
    """Her fixed look in this shot: the shot's own (a cast candidate), else the
    shot list's; a shot framed from the waist up names only her top — "long
    sweatpants" in the prompt drew her whole body in every "close-up" (2026-10-28)."""
    c = shot.get("character")
    if isinstance(c, str):
        return c
    if not c:
        return ""
    if shot.get("frame") == "upper" and spec.get("characterTop"):
        return spec["characterTop"]
    return spec.get("character", "")


def prompt_of(spec, shot):
    """The one prompt the model reads for a shot: the series style, the shot
    (its framing first), the character's fixed look when she is in it, and the
    guard. CLIP reads only the first 77 tokens: with the look before the shot,
    the framing fell outside them and "from the chest up" was drawn from the knees."""
    parts = [spec.get("style", ""), shot["prompt"], look_of(spec, shot), GUARD]
    return ", ".join(p.strip().rstrip(".") for p in parts if p and p.strip())


def write_configs(root):
    """The transformer and VAE configs as a local folder (from_single_file reads them there)."""
    for sub, cfg in (("transformer", TRANSFORMER_CONFIG), ("vae", VAE_CONFIG)):
        os.makedirs(os.path.join(root, sub), exist_ok=True)
        with open(os.path.join(root, sub, "config.json"), "w", encoding="utf-8") as f:
            json.dump(cfg, f)
    return root


def note(**kw):
    print(json.dumps(kw), flush=True)


def first_source(kind, sources, load):
    """The first source that loads; every refusal is logged (short), none is fatal here."""
    for src in sources:
        try:
            obj = load(*src)
            note(source=kind, used=src[1], path=src[2])
            return obj
        except Exception as exc:  # noqa: BLE001 (a closed or missing copy: try the next)
            note(source=kind, refused=src[1], error=f"{type(exc).__name__}: {str(exc)[:160]}")
    return None


def load_t5(torch):
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file
    from transformers import T5Config, T5EncoderModel

    def load(how, repo, path):
        if how == "pretrained":
            return T5EncoderModel.from_pretrained(repo, torch_dtype=torch.bfloat16)
        cfg = T5Config.from_pretrained(T5_TOKENIZER)
        with torch.device("meta"):  # no second copy in memory: the file's tensors are used as they are
            model = T5EncoderModel(cfg)
        state = load_file(hf_hub_download(repo, path))
        missing, _ = model.load_state_dict(state, strict=False, assign=True)
        del state
        model.tie_weights()  # encoder.embed_tokens is "shared"
        missing = [k for k in missing if k != "encoder.embed_tokens.weight"]
        if missing:
            raise RuntimeError(f"missing {len(missing)} tensors, e.g. {missing[:3]}")
        return model.to(torch.bfloat16).eval()

    t5 = first_source("t5", T5_SOURCES, load)
    if t5 is None:
        raise SystemExit("no open copy of the T5-XXL encoder answered")
    return t5


def load_vae(torch, cfg_root):
    from diffusers import AutoencoderKL, AutoencoderTiny
    from huggingface_hub import hf_hub_download

    def load(how, repo, path):
        if how == "pretrained":
            vae = AutoencoderKL.from_pretrained(repo, subfolder=path, torch_dtype=torch.float32)
            if vae.config.latent_channels != 16:
                raise RuntimeError(f"not the FLUX autoencoder (latent_channels={vae.config.latent_channels})")
            # The same weights as FLUX's "ae": its own scaling and shift.
            vae.register_to_config(scaling_factor=VAE_CONFIG["scaling_factor"], shift_factor=VAE_CONFIG["shift_factor"])
            return vae
        return AutoencoderKL.from_single_file(hf_hub_download(repo, path), config=cfg_root, subfolder="vae",
                                              torch_dtype=torch.float32)

    vae = first_source("vae", VAE_SOURCES, load)
    if vae is None:
        vae = AutoencoderTiny.from_pretrained(TINY_VAE, torch_dtype=torch.float32)
        note(source="vae", used=TINY_VAE, path="tiny", warning="full autoencoder unavailable; finer detail is softer")
    return vae


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=576)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--only", default="", help="comma-separated shot ids")
    ap.add_argument("--device", default="cpu", choices=["cpu", "cuda"],
                    help="cuda on the cloud studio's GPU (scripts/media/gpu): the same open copies, in bf16, seconds a picture")
    ap.add_argument("--take", type=int, default=-1,
                    help="one of several takes of a shot (another seed); writes <shot>.t<take>.png for pick.py")
    a = ap.parse_args()
    spec = json.load(open(a.jobs, encoding="utf-8"))
    # A shot from the presenter's checked keyframe ("cast") is never drawn again.
    shots = [s for s in spec["shots"] if not s.get("cast") and (not a.only or s["id"] in a.only.split(","))]
    os.makedirs(a.out, exist_ok=True)

    import tempfile
    import torch
    from diffusers import FlowMatchEulerDiscreteScheduler, FluxPipeline, FluxTransformer2DModel, GGUFQuantizationConfig
    from transformers import CLIPTextModel, CLIPTokenizer, T5TokenizerFast

    gpu = a.device == "cuda"
    if not gpu:
        torch.set_num_threads(os.cpu_count() or 4)
    cfg_root = write_configs(tempfile.mkdtemp(prefix="flux-cfg-"))
    scheduler = FlowMatchEulerDiscreteScheduler(**SCHEDULER_CONFIG)
    t0 = time.time()
    # Pass 1: the prompts become embeddings; the encoders are freed after.
    enc = FluxPipeline(
        scheduler=scheduler, vae=None, transformer=None,
        text_encoder=CLIPTextModel.from_pretrained(CLIP, torch_dtype=torch.bfloat16),
        tokenizer=CLIPTokenizer.from_pretrained(CLIP),
        text_encoder_2=load_t5(torch), tokenizer_2=T5TokenizerFast.from_pretrained(T5_TOKENIZER),
    )
    if gpu:
        enc.to("cuda")
    embeds = {}
    with torch.no_grad():
        for s in shots:
            text = prompt_of(spec, s)
            pe, ppe, _ = enc.encode_prompt(prompt=text, prompt_2=text, max_sequence_length=256)
            embeds[s["id"]] = (pe.float(), ppe.float()) if not gpu else (pe.to(torch.bfloat16), ppe.to(torch.bfloat16))
    del enc
    gc.collect()
    note(stage="encoded", shots=len(shots), s=round(time.time() - t0))

    # Pass 2: the 4-bit transformer computes in float32 on the runner's CPU (it
    # has no native bf16, so float32 is the fast path there), in bf16 on a GPU.
    dtype = torch.bfloat16 if gpu else torch.float32
    transformer = FluxTransformer2DModel.from_single_file(
        GGUF,
        quantization_config=GGUFQuantizationConfig(compute_dtype=dtype),
        torch_dtype=dtype,
        config=cfg_root,
        subfolder="transformer",
    )
    pipe = FluxPipeline(
        scheduler=scheduler, vae=None, transformer=transformer,
        text_encoder=None, tokenizer=None, text_encoder_2=None, tokenizer_2=None,
    )
    pipe.vae = load_vae(torch, cfg_root)  # after: the tiny decoder has no block_out_channels (scale stays 8)
    if gpu:
        pipe.to("cuda")
        pipe.vae.to(dtype=dtype)  # the latents arrive in bf16
    pipe.set_progress_bar_config(disable=True)
    note(stage="loaded", s=round(time.time() - t0))
    for s in shots:
        t = time.time()
        pe, ppe = embeds[s["id"]]
        with torch.no_grad():
            img = pipe(
                prompt_embeds=pe, pooled_prompt_embeds=ppe,
                num_inference_steps=a.steps, guidance_scale=0.0,
                width=a.width, height=a.height,
                generator=torch.Generator("cuda" if gpu else "cpu").manual_seed(seed_of(s, a.take)),
            ).images[0]
        path = os.path.join(a.out, f"{s['id']}.png" if a.take < 0 else f"{s['id']}.t{a.take}.png")
        img.save(path)
        note(id=s["id"], take=a.take, seed=seed_of(s, a.take), s=round(time.time() - t), bytes=os.path.getsize(path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
