"""A voice-over for a real-footage reel (scripts/media/studio3d/voiceover.py).
The seller cuts were silent; the owner, 2026-11-03: "exactly professional".
No line may claim what is not true, the post names the seller's footage and
the computer voice, and a voice that was not made never ships as voiced."""
import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec_ = importlib.util.spec_from_file_location("voiceover", ROOT / "scripts" / "media" / "studio3d" / "voiceover.py")
vo = importlib.util.module_from_spec(spec_)
sys.modules["voiceover"] = vo
spec_.loader.exec_module(vo)

SPECS = sorted((ROOT / "scripts" / "media" / "studio3d" / "voiceover").glob("*.json"))


class VoiceOver(unittest.TestCase):
    def test_every_shipped_spec_passes(self):
        self.assertTrue(SPECS)
        for p in SPECS:
            spec = vo.load_spec(p)
            self.assertIn(spec["source"]["release"], ("reels", "studio3d", "studio3d-preview"))
            self.assertNotIn("ואשלח", spec["caption"], "no DM is promised: nothing answers DMs on the account")

    def base(self):
        return json.loads(SPECS[0].read_text(encoding="utf-8"))

    def test_untrue_lines_and_missing_labels_are_refused(self):
        bad = self.base()
        bad["lines"][1]["say"] = "הצמיד הכי נמכר באתר"
        with self.assertRaises(vo.SpecError):
            vo.check_spec(bad)
        bad = self.base()
        bad["caption"] = bad["caption"].replace("קול ממוחשב", "")
        with self.assertRaises(vo.SpecError):
            vo.check_spec(bad)
        bad = self.base()
        bad["caption"] = "קנו עכשיו " + bad["caption"]
        with self.assertRaises(vo.SpecError):
            vo.check_spec(bad)  # the ad tag comes first
        bad = self.base()
        bad["headline"]["text"] = "אחת שתיים שלוש ארבע חמש שש שבע שמונה תשע"
        with self.assertRaises(vo.SpecError):
            vo.check_spec(bad)

    def test_a_long_line_pushes_the_next_one_instead_of_overlapping(self):
        lines = [{"at": 0.0}, {"at": 1.0}, {"at": 5.0}]
        t = vo.placed(lines, [2.0, 1.0, 1.0])
        self.assertEqual(t[0], (0.0, 2.0))
        self.assertAlmostEqual(t[1][0], 2.0 + vo.GAP)
        self.assertEqual(t[2][0], 5.0)

    def test_a_voice_that_was_not_made_fails_the_run(self):
        from luna_reels.voice import Clip
        real = vo.voice.synthesize
        vo.voice.synthesize = lambda texts, *a, **k: ([Clip(t, 1.0, None) for t in texts], "none")
        try:
            with self.assertRaises(RuntimeError):
                vo.render(vo.load_spec(SPECS[0]), Path("missing.mp4"), Path(__import__("tempfile").mkdtemp()))
        finally:
            vo.voice.synthesize = real


if __name__ == "__main__":
    unittest.main()
