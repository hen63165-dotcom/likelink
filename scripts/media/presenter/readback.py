#!/usr/bin/env python3
"""Every spoken line read back by a Hebrew speech model, before the lips are made.

Edge's Hebrew voice reads unvocalized text by guessing, and a wrong guess (a
stress, a vowel, a foreign name) is heard by every viewer. Each line's voice
is transcribed by ivrit-ai's Hebrew Whisper (faster-whisper, CPU, int8) and
printed next to what it should say, word by word (vowel marks dropped), so a
person checks the differences before the line goes on her face. It never
fixes anything by itself.

  python readback.py --spec talk-slides-X.json --voices DIR
Writes DIR/readback.json: [{id, said, heard, missing}].
"""
import argparse, json, re, sys
from pathlib import Path

MODEL = "ivrit-ai/whisper-large-v3-turbo-ct2"
bare = lambda s: re.sub(r"[֑-ׇ]", "", s)
words = lambda s: [w for w in re.sub(r"[^\w\s]", " ", bare(s)).split() if w]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--voices", required=True)
    a = ap.parse_args()
    from faster_whisper import WhisperModel
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    spec = json.load(open(a.spec, encoding="utf-8"))
    rows = []
    for line in spec["lines"]:
        mp3 = Path(a.voices) / f"{line['id']}.mp3"
        if not mp3.exists():
            continue
        segs, _ = model.transcribe(str(mp3), language="he", beam_size=5, vad_filter=False)
        heard = " ".join(s.text.strip() for s in segs).strip()
        said = bare(line["say"])
        missing = [w for w in words(said) if w not in words(heard)]
        row = {"id": line["id"], "said": said, "heard": heard, "missing": missing}
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False))
    (Path(a.voices) / "readback.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
