#!/usr/bin/env python3
"""LikeLink's 3D studio, stage 1½: the same woman in every shot.

The owner, 2026-10-28, comparing pilot v4 with @ravitrecommends: in Ravit's
reels the presenter is unmistakably the same person in every shot; in ours
she looked like a child in one shot and her hair turned orange in another.
Each character shot is drawn as several takes (flux.py --take); this keeps,
per shot, the take that is most the same presenter, by open models on the CPU:

  - her face: YuNet (OpenCV, MIT) finds it; a take with no face is out when a
    face is expected; without a detection the upper middle of the frame is used;
  - an adult, never a child: CLIP (OpenAI, MIT) compares the face with "an
    adult woman" against "a little girl" / "a teenage girl"; a take that reads
    clearly younger than the shot's most adult take is out;
  - the same face and hair: CLIP's picture of the face (with its hair) against
    the reference portrait (the shot list's "face" shot, chosen first);
  - the shot asked for: CLIP's picture against the shot's own prompt;
  - nothing that could pass for the product: "wearing earrings / a necklace /
    a bracelet" weighs a take down (the product appears only in its real photo).

  python pick.py --jobs jobs/x.json --pictures shots/x
Writes <shot>.png from the chosen <shot>.t<k>.png and pick.jsonl with every
score; a shot drawn once (no takes) is left as it is.
"""
import argparse, glob, json, math, os, re, sys

ADULT = ["a 3D animated cartoon of an adult woman in her late twenties"]
CHILD = ["a 3D animated cartoon of a little girl", "a 3D animated cartoon of a teenage girl"]
JEWEL = ["a cartoon woman wearing earrings, a necklace or a bracelet"]
BARE = ["a cartoon woman with bare ears, bare neck and bare wrists"]
FACE_FALLBACK = (0.2, 0.04, 0.8, 0.46)  # the upper middle of a vertical character shot
YUNET = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"


# How much each measure counts. CLIP's cosines differ between takes by a few
# hundredths, so they are scaled to the same range as a probability: a clearly
# closer face (+0.05) outweighs a slightly better match to the shot.
W_IDENTITY, W_PROMPT, W_JEWEL = 10.0, 5.0, 1.0
# CLIP reads every big-eyed cartoon face as rather young (the first real run,
# 2026-10-28: "adult" 0.11–0.63 for one and the same woman) and finds
# "jewellery" on nearly every take (0.60–0.88). Both are therefore compared
# between the takes of a shot, never against a fixed line: a take that reads
# clearly younger than the shot's most adult take is out, and jewellery
# weighs only by how much more of it a take shows than the cleanest one.
CHILD_MARGIN = 0.15


def choose(takes, character=True):
    """The chosen take of one shot from its measured takes (pure; tested).

    takes: [{"take", "face": bool, "adult": 0..1, "identity": cos or None, "prompt": cos, "jewel": 0..1}]
    A character take must show her face and must not read clearly younger than
    the shot's most adult take; among those, the same face and hair weigh most,
    then the shot asked for, minus any jewellery more than the cleanest take shows.
    """
    if not takes:
        return None
    pool = takes
    if character:
        pool = [t for t in takes if t.get("face", True)] or takes
        oldest = max(t.get("adult", 0.0) for t in pool)
        pool = [t for t in pool if t.get("adult", 0.0) >= oldest - CHILD_MARGIN]
    cleanest = min(t.get("jewel", 0.0) for t in pool)

    def score(t):
        s = W_PROMPT * t.get("prompt", 0.0)
        if character:
            s += W_IDENTITY * (t.get("identity") or 0.0) - W_JEWEL * (t.get("jewel", 0.0) - cleanest)
        return s

    return max(pool, key=score)


class Judge:
    """The open models, loaded once."""

    def __init__(self, work):
        import cv2
        import torch
        from transformers import CLIPModel, CLIPProcessor
        self.torch, self.cv2 = torch, cv2
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch16").eval()
        self.proc = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch16")
        self.detector = None
        try:
            import urllib.request
            path = os.path.join(work, "yunet.onnx")
            if not os.path.exists(path):
                urllib.request.urlretrieve(YUNET, path)
            self.detector = cv2.FaceDetectorYN.create(path, "", (320, 320), 0.6)
        except Exception as exc:  # noqa: BLE001 (the upper middle of the frame is used instead)
            print(json.dumps({"detector": None, "error": str(exc)[:160]}))
        self.labels = {k: self.text(v) for k, v in (("adult", ADULT), ("child", CHILD), ("jewel", JEWEL), ("bare", BARE))}

    # The towers and their projections directly: get_*_features returns a
    # model output object instead of a tensor in newer transformers (the
    # first run of this job failed there), and the projections are stable.
    def text(self, texts):
        inputs = self.proc(text=texts, return_tensors="pt", padding=True, truncation=True)
        with self.torch.no_grad():
            pooled = self.model.text_model(input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"]).pooler_output
            t = self.model.text_projection(pooled)
        return t / t.norm(dim=-1, keepdim=True)

    def image(self, img):
        inputs = self.proc(images=img, return_tensors="pt")
        with self.torch.no_grad():
            pooled = self.model.vision_model(pixel_values=inputs["pixel_values"]).pooler_output
            v = self.model.visual_projection(pooled)
        return (v / v.norm(dim=-1, keepdim=True))[0]

    def face(self, img):
        """The face with its hair (the box grown upward and sideways), and whether a face was found."""
        import numpy as np
        w, h = img.size
        box, detected = None, False
        if self.detector is not None:
            arr = self.cv2.cvtColor(np.array(img), self.cv2.COLOR_RGB2BGR)
            self.detector.setInputSize((w, h))
            _, found = self.detector.detect(arr)
            if found is not None and len(found):
                x, y, fw, fh = max(found, key=lambda f: f[2] * f[3])[:4]
                box, detected = (x - 0.6 * fw, y - 0.9 * fh, x + 1.6 * fw, y + 1.5 * fh), True
        if box is None:
            x0, y0, x1, y1 = FACE_FALLBACK
            box = (x0 * w, y0 * h, x1 * w, y1 * h)
        x0, y0, x1, y1 = (max(0, box[0]), max(0, box[1]), min(w, box[2]), min(h, box[3]))
        # Without a detector there is no evidence either way: the take keeps its place.
        return img.crop((round(x0), round(y0), round(x1), round(y1))), detected or self.detector is None

    def measure(self, path, prompt, character):
        from PIL import Image
        img = Image.open(path).convert("RGB")
        whole = self.image(img)
        out = {"prompt": float(whole @ self.text([prompt[:300]])[0])}
        if character:
            crop, found = self.face(img)
            f = self.image(crop)
            probs = (100 * f @ self.torch.cat([self.labels["adult"], self.labels["child"]]).T).softmax(-1)
            jewel = (100 * f @ self.torch.cat([self.labels["jewel"], self.labels["bare"]]).T).softmax(-1)
            out.update(face=found, adult=float(probs[0]), jewel=float(jewel[0]), _face=f)
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True)
    ap.add_argument("--pictures", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.jobs, encoding="utf-8"))
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from flux import prompt_of  # noqa: E402
    takes = {}
    for f in glob.glob(os.path.join(a.pictures, "*.t*.png")):
        m = re.match(r"^(.+)\.t(\d+)\.png$", os.path.basename(f))
        if m:
            takes.setdefault(m.group(1), []).append((int(m.group(2)), f))
    if not takes:
        print(json.dumps({"pick": "no takes"}))
        return 0
    judge = Judge(a.pictures)
    shots = {s["id"]: s for s in spec["shots"]}
    ref_id = (spec.get("face") or {}).get("from")
    # The reference portrait first: every other shot is compared with her face.
    order = sorted(takes, key=lambda sid: sid != ref_id)
    ref, log = None, open(os.path.join(a.pictures, "pick.jsonl"), "a", encoding="utf-8")
    single = os.path.join(a.pictures, f"{ref_id}.png")
    if ref_id and ref_id not in takes and os.path.exists(single):  # a portrait drawn once is still the reference
        ref = judge.measure(single, prompt_of(spec, shots[ref_id]), True)["_face"]
    for sid in order:
        shot = shots.get(sid)
        if shot is None:
            continue
        character = bool(shot.get("character"))
        measured = []
        for k, path in sorted(takes[sid]):
            m = judge.measure(path, prompt_of(spec, shot), character)
            if character and ref is not None:
                m["identity"] = float(m["_face"] @ ref)
            measured.append({"take": k, "path": path, **m})
        best = choose(measured, character)
        if sid == ref_id and character:
            ref = best["_face"]
        os.replace(best["path"], os.path.join(a.pictures, f"{sid}.png"))
        for t in measured:
            if t is not best and os.path.exists(t["path"]):
                os.remove(t["path"])
        row = {"shot": sid, "chosen": best["take"],
               "takes": [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in t.items() if not k.startswith("_") and k != "path"} for t in measured]}
        log.write(json.dumps(row) + "\n")
        print(json.dumps(row))
    log.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
