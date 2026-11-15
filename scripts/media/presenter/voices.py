#!/usr/bin/env python3
"""The presenters' voices for a talking-slides spec (scripts/media/presenter/*.json).

Every line is spoken once with a free Edge voice (edge-tts, the same engine
and version as the Luna reels), each presenter with her own rate and pitch so
the two hosts do not sound like one person. Each line gets <id>.mp3, its word
timings <id>.words.json ([start s, duration s, word]) and a row in
voices.json; the lip-sync and the edit then play the very same recording.

  python voices.py --spec talk-slides-X.json --out DIR
"""
import argparse, asyncio, json, subprocess, sys, time
from pathlib import Path


def speak(text: str, dst: Path, voice: str, rate: str, pitch: str):
    import edge_tts

    async def run():
        words = []
        comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
        with open(dst, "wb") as fh:
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    fh.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    words.append([round(chunk["offset"] / 1e7, 3), round(chunk["duration"] / 1e7, 3), chunk["text"]])
        return words

    last = None
    for i in range(4):
        try:
            words = asyncio.run(asyncio.wait_for(run(), timeout=90))
            if dst.exists() and dst.stat().st_size > 1000:
                return words
            last = "no audio"
        except Exception as exc:  # the free service fails now and then
            last = exc
        time.sleep(2 * (2 ** i))
    raise SystemExit(f"{dst.name}: {last}")


def seconds(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
                         capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.spec, encoding="utf-8"))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for line in spec["lines"]:
        v = spec["voices"][line["presenter"]]
        mp3 = out / f"{line['id']}.mp3"
        words = speak(line["say"], mp3, v["voice"], v.get("rate", "+0%"), v.get("pitch", "+0Hz"))
        (out / f"{line['id']}.words.json").write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
        row = {"id": line["id"], "presenter": line["presenter"], "file": mp3.name, "seconds": round(seconds(mp3), 3), "words": len(words)}
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False))
    (out / "voices.json").write_text(json.dumps({"spec": spec["name"], "lines": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
