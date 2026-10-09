"""Luna reels from the command line (run from scripts/luna_reels).

    python -m luna_reels make episodes/silver-925.json                 # 1 reel
    python -m luna_reels make episodes/silver-925.json --variants 3    # a, b, c
    python -m luna_reels make my-script.txt --voice none               # [time | say | caption] rows
    python -m luna_reels make episodes/link-chaos.json --tier pro --logo my-logo.png
    python -m luna_reels idea "התכשיט שלך באמת כסף? | חפשי חותמת 925; כסף לא נמשך למגנט" --product p-live-02
    python -m luna_reels trends episodes/                              # which trends fit which episode
    python -m luna_reels check episodes/                               # validate, render nothing
    python -m luna_reels list

Variants (--variants 3) test what stops the scroll, one change at a time:
    a  main hook · karaoke captions · no music (add a trending sound in the app)
    b  2nd hook (or a matching trend) · pop captions · no music
    c  3rd hook · pop captions · our own lo-fi bed at -20 dB
Exit codes: 0 rendered/valid · 2 a script was refused (untrue claim, missing part) · 1 other failure.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
import traceback
from pathlib import Path

from . import compose, metadata, trends, visuals
from .script import Episode, Line, ScriptError, check_truth, ideas_to_episode, load_catalog, load_episode, with_hook
from .voice import EDGE_VOICE, synthesize, temp_dir

STOCK_VOICE = "he-IL-AvriNeural"  # over stock footage / the brand backdrop (no Luna on screen)

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parent.parent
SNAPSHOT = REPO / "public" / "snapshot" / "kv.json"
TALK = REPO / "scripts" / "media" / "talking" / "talk.sh"

VARIANTS = [
    {"suffix": "a", "hook": 0, "captions": "pop", "music": None},
    {"suffix": "b", "hook": 1, "captions": "pop", "music": None, "trend": True},
    {"suffix": "c", "hook": 2, "captions": "pop", "music": "beat"},
]


def _product(episode: Episode, catalog: dict, work: Path) -> dict | None:
    if not episode.product:
        return None
    p = catalog[str(episode.product["id"])]
    photo = None
    try:
        from PIL import Image  # noqa: PLC0415
        photo = Image.open(visuals.download(str(p.get("image") or ""), work / "media", kind="image"))
    except Exception as exc:  # the card still shows the claim
        print(f"[product] photo not available ({exc}); showing the claim only", file=sys.stderr)
    return {**episode.product, "photo": photo, "title": p.get("title", "")}


def _visual(requested: str, episode: Episode, beats, total: float, work: Path) -> str:
    """Resolve 'talking' (SadTalker on Luna with this voice) and 'pexels:<query>'."""
    if requested == "talking":
        track = compose.voice_track(beats, total, work / "voice-track.wav")
        out = work / "talking"
        import subprocess  # noqa: PLC0415
        subprocess.run(["bash", str(TALK), str(visuals.brand.LUNA), str(track), str(out), "full-move"], check=True, timeout=7200)
        return f"video:{out / 'luna-full-move.mp4'}"
    if requested.startswith("pexels:"):
        clip = visuals.pexels_clip(requested[7:] or "aesthetic jewelry", work / "media")
        if clip is None:
            print("[visual] no PEXELS_API_KEY (or no result); using the brand backdrop", file=sys.stderr)
            return "aurora"
        return f"video:{clip}"
    return requested


def make(episode: Episode, *, voice: str, visual: str, out: Path, music: str | None, strict_voice: bool,
         captions: str = "pop", tier: str = "free", logo: str | None = None, edge_voice: str | None = None,
         extra_meta: dict | None = None) -> dict:
    t0 = time.time()
    catalog = load_catalog(SNAPSHOT)
    check_truth(episode, catalog)
    work = temp_dir()
    try:
        requested = visual if visual and visual != "auto" else ""
        if not requested:
            # auto: cinematic stock footage when a free Pexels key is set, else the episode's own look.
            requested = f"pexels:{episode.pexels}" if os.environ.get("PEXELS_API_KEY") and episode.pexels else (episode.visual or "still")
        # Luna (or a character clip you made) on screen → the AI-character label and Luna's voice.
        # Stock footage or the brand backdrop has no character → only the voice is labelled (Avri by default).
        character = not (requested == "aurora" or requested.startswith("pexels:"))
        voice_name = edge_voice or episode.voice or (EDGE_VOICE if character else STOCK_VOICE)
        clips, used = synthesize(compose.spoken(episode), voice, work / "voice", eid=episode.id,
                                 fallback=not strict_voice, edge_voice=voice_name)
        if used != voice.split(":", 1)[0]:
            print(f"[voice] '{voice}' was not available; used '{used}'", file=sys.stderr)
        product = _product(episode, catalog, work)
        beats, total = compose.timeline(episode, clips)
        visual = _visual(requested, episode, beats, total, work)
        character = character and visual != "aurora"
        video, beats, total = compose.build(episode, clips, visual=visual, product=product, work=work,
                                            voiced=used not in ("none", "file"), music_src=music, captions=captions,
                                            tier=tier, logo=logo, character=character)
        mp4 = out / f"{episode.id}.mp4"
        compose.render(video, mp4, preview=out / f"{episode.id}-preview.jpg")
        meta = metadata.build(episode, product=product, voice_engine=used, visual=visual, seconds=total, character=character)
        meta.update({"file": mp4.name, "captions": captions, "tier": tier, "music": music or "none",
                     "edgeVoice": voice_name if used == "edge" else None,
                     "renderSeconds": round(time.time() - t0, 1), **(extra_meta or {})})
        metadata.write(meta, out)
        print(f"✓ {mp4} · {total:.1f}s · voice={used} · captions={captions} · rendered in {meta['renderSeconds']}s")
        return meta
    finally:
        shutil.rmtree(work, ignore_errors=True)


def make_variants(episode: Episode, n: int, *, captions: str = "pop", music: str | None = None, **kw) -> list[dict]:
    """One reel as asked (n=1), or up to 3 variants that differ in hook, caption style and music."""
    if n <= 1:
        return [make(episode, captions=captions, music=music, **kw)]
    results = []
    for spec in VARIANTS[:min(n, 3)]:
        hook = episode.hooks[spec["hook"] % len(episode.hooks)] if episode.hooks else episode.hook
        extra = {"variant": spec["suffix"]}
        if spec.get("trend"):
            hit = trends.trend_hook(episode.hook.say, episode.topics)
            if hit:
                hook, extra["trend"] = Line(say=hit[0], caption=hit[0]), hit[1]
        results.append(make(with_hook(episode, hook, spec["suffix"]), captions=spec["captions"],
                            music=music or spec["music"], extra_meta=extra, **kw))
    return results


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="luna_reels", description="LikeLink2 · Luna tip reels (free, Hebrew, 9:16)")
    sub = p.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("make", help="render a script (.json or .txt)")
    m.add_argument("script")
    m.add_argument("--variants", type=int, default=1, help="1-3 variants (different hook / captions / music)")
    m.add_argument("--voice", default="edge", help="edge | gtts | chatterbox | none | file:PATH")
    m.add_argument("--edge-voice", default=None, help="he-IL-HilaNeural (Luna) or he-IL-AvriNeural")
    m.add_argument("--visual", default="auto", help="auto | still | talking | aurora | pexels:QUERY | video:PATH_OR_URL")
    m.add_argument("--captions", default="pop", choices=["pop", "karaoke"], help="pop = 2-3 outlined words, no box")
    m.add_argument("--music", default=None, help="beat (our own lo-fi bed) or a file you have the rights to")
    m.add_argument("--tier", default="free", choices=["free", "pro"], help="free = LikeLink2 watermark + outro")
    m.add_argument("--logo", default=None, help="pro tier: your own logo (.png)")
    m.add_argument("--out", default="out")
    m.add_argument("--strict-voice", action="store_true", help="fail instead of falling back to another voice")
    i = sub.add_parser("idea", help="one idea line → a script (and render it)")
    i.add_argument("idea")
    i.add_argument("--id", default="idea")
    i.add_argument("--product", default=None)
    i.add_argument("--save", default=None, help="write the generated script to this .json and stop")
    i.add_argument("--voice", default="edge")
    i.add_argument("--out", default="out")
    t = sub.add_parser("trends", help="today's Israeli trends that match an episode")
    t.add_argument("paths", nargs="+")
    c = sub.add_parser("check", help="validate scripts without rendering")
    c.add_argument("paths", nargs="+")
    sub.add_parser("list", help="list the episodes in episodes/")
    a = p.parse_args(argv)

    def files(paths):
        return [f for path in paths for f in (sorted(Path(path).glob("*.json")) if Path(path).is_dir() else [Path(path)])]

    try:
        if a.cmd == "list":
            for f in sorted((HERE / "episodes").glob("*.json")):
                d = json.loads(f.read_text(encoding="utf-8"))
                print(f"{d['id']:<22} {d.get('goal', ''):<7} {d.get('hook', '')}")
            return 0
        if a.cmd == "check":
            catalog = load_catalog(SNAPSHOT)
            for f in files(a.paths):
                check_truth(load_episode(f), catalog)
                print(f"✓ {f.name}")
            return 0
        if a.cmd == "trends":
            today = trends.fetch()
            print(f"{len(today)} trends today (Google Trends, Israel); calendar: {trends.calendar() or 'none near'}")
            for f in files(a.paths):
                ep = load_episode(f)
                hit = trends.trend_hook(ep.hook.say, ep.topics, trends=today)
                print(f"{ep.id:<22} {hit[0] if hit else '— no matching trend (the hook stays as written)'}")
            return 0
        if a.cmd == "idea":
            catalog = load_catalog(SNAPSHOT)
            ep = ideas_to_episode(a.idea, a.id, a.product, catalog)
            if a.save:
                data = {"id": ep.id, "goal": ep.goal, "hook": ep.hook.caption,
                        "lines": [{"say": x.say, "caption": x.caption} for x in ep.lines],
                        "product": ep.product, "cta": ep.cta}
                Path(a.save).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
                print(f"✓ {a.save}")
                return 0
            make(ep, voice=a.voice, visual="", out=Path(a.out), music=None, strict_voice=False)
            return 0
        make_variants(load_episode(a.script), a.variants, voice=a.voice, visual=a.visual, out=Path(a.out),
                      music=a.music, strict_voice=a.strict_voice, captions=a.captions, tier=a.tier, logo=a.logo,
                      edge_voice=a.edge_voice)
        return 0
    except ScriptError as exc:
        print(f"✗ script refused: {exc}", file=sys.stderr)
        return 2
    except Exception:  # noqa: BLE001 (CLI boundary: report and fail)
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
