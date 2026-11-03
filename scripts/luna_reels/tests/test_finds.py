"""The finds cut (scripts/media/studio3d/finds.py): the product on screen from
the first frame (the owner, 2026-11-03: the first studio reel showed a white
shirt and the earrings only at second 16; 2 views, 10 s average watch)."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec_ = importlib.util.spec_from_file_location("finds", ROOT / "scripts" / "media" / "studio3d" / "finds.py")
finds = importlib.util.module_from_spec(spec_)
sys.modules["finds"] = finds
spec_.loader.exec_module(finds)

SPECS = sorted((ROOT / "scripts" / "media" / "studio3d" / "finds").glob("*.json"))


def base(**over):
    s = {"id": "finds-x", "product": "ae-1", "headline": "חולצה לבנה? תוסיפי רק את אלה",
         "segments": [{"from": 0, "to": 5, "caption": "א", "photo": 0, "pip": [0.2, 0.2, 0.8, 0.5]},
                      {"from": 6, "to": 12, "caption": "ב", "photo": 0, "pip": None}]}
    s.update(over)
    return s


class Finds(unittest.TestCase):
    def test_every_shipped_cut_passes_the_rules(self):
        self.assertTrue(SPECS)
        for p in SPECS:
            spec = finds.load_spec(p)
            self.assertTrue(spec["caption"].startswith("#פרסומת · קישור שותפים"), p.name)
            self.assertIn("בינה מלאכותית", spec["caption"], "the AI is named in the post")
            self.assertIn("המוכר", spec["caption"], "the photos are the seller's")

    def test_a_long_headline_an_open_loop_or_a_bad_box_is_refused(self):
        with self.assertRaises(finds.SpecError):
            finds.check_spec(base(headline="אחת שתיים שלוש ארבע חמש שש שבע שמונה תשע"))
        bad = base()
        bad["segments"][1]["photo"] = 2
        with self.assertRaises(finds.SpecError):
            finds.check_spec(bad)  # the last line must end on the first photo
        bad = base()
        bad["segments"][0]["pip"] = [0.8, 0.2, 0.2, 0.5]
        with self.assertRaises(finds.SpecError):
            finds.check_spec(bad)
        bad = base()
        bad["segments"][1]["from"] = 3
        with self.assertRaises(finds.SpecError):
            finds.check_spec(bad)  # overlapping lines
        with self.assertRaises(finds.SpecError):
            finds.check_spec(base(segments=[{"from": 0, "to": 2, "caption": "א", "photo": 0},
                                            {"from": 2, "to": 4, "caption": "ב", "photo": 0}]))  # 4 s: too short

    def test_the_timeline_drops_cut_lines_and_keeps_order(self):
        segs = finds.plan(base())
        self.assertEqual([round(s["start"], 2) for s in segs], [0, 5])
        self.assertEqual(round(sum(s["dur"] for s in segs), 2), 11)

    def test_the_store_photo_keeps_its_pixels_square(self):
        from PIL import Image
        img = Image.new("RGB", (1200, 800), (10, 20, 30))
        tile = finds.photo_tile(img)
        self.assertEqual(tile.size, (finds.PHOTO, finds.PHOTO))
        self.assertEqual(tile.getpixel((500, 500)), (10, 20, 30))


if __name__ == "__main__":
    unittest.main()
