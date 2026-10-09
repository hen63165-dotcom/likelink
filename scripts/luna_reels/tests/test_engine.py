"""Luna reels engine: the rules that must hold before any frame is drawn.

Run from scripts/luna_reels:  python -m unittest discover -s tests -v
"""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from luna_reels import brand, compose, metadata, music, text, trends  # noqa: E402
from luna_reels.script import (  # noqa: E402
    ScriptError, check_truth, ideas_to_episode, load_catalog, load_episode, parse_episode, parse_text_script)
from luna_reels.voice import Clip  # noqa: E402

SNAPSHOT = HERE.parent.parent / "public" / "snapshot" / "kv.json"
CATALOG = load_catalog(SNAPSHOT)


def episode(**over):
    data = {"id": "t-ep", "goal": "trust", "hook": "החבילה *לא הגיעה*?",
            "lines": [{"say": "בודקים את הגנת הקונה.", "caption": "בודקים *הגנת קונה*"}]}
    data.update(over)
    return parse_episode(data)


class Episodes(unittest.TestCase):
    def test_every_shipped_episode_passes_the_truth_check(self):
        files = sorted((HERE / "episodes").glob("*.json"))
        self.assertGreaterEqual(len(files), 5)
        for f in files:
            check_truth(load_episode(f), CATALOG)

    def test_invented_claims_are_refused(self):
        for bad in ["קניתי את זה וזה מושלם", "הכי נמכר באתר", "נשארו רק 2", "5 כוכבים", "רק היום"]:
            with self.assertRaises(ScriptError, msg=bad):
                check_truth(episode(lines=[{"say": bad}]), CATALOG)
        with self.assertRaises(ScriptError):
            check_truth(episode(hooks=["קניתי ואני מתה על זה"]), CATALOG)

    def test_a_product_claim_must_be_in_the_listing(self):
        ok = episode(product={"id": "p-live-02", "claim": "המוכר מציין: כסף סטרלינג 925", "mustMatch": "סטרלינג 925"})
        check_truth(ok, CATALOG)
        with self.assertRaises(ScriptError):
            check_truth(episode(product={"id": "p-live-02", "claim": "זהב 18K", "mustMatch": "18K"}), CATALOG)
        with self.assertRaises(ScriptError):
            check_truth(episode(product={"id": "p-live-02", "claim": "כסף"}), CATALOG)  # no proof given
        with self.assertRaises(ScriptError):
            check_truth(episode(product={"id": "p-not-listed", "at": 1}), CATALOG)

    def test_text_script_rows(self):
        ep = parse_text_script("00:00 | שלום? | *שלום*?\n00:02.5 | טיפ אחד | טיפ\n", "rows")
        self.assertEqual(ep.hook.say, "שלום?")
        self.assertEqual(ep.lines[0].t, 2.5)
        with self.assertRaises(ScriptError):
            parse_text_script("רק שורה אחת", "x")

    def test_idea_line_becomes_an_episode(self):
        ep = ideas_to_episode("התכשיט שלך באמת כסף? | חפשי חותמת 925; כסף לא נמשך למגנט", "idea-x")
        self.assertEqual(len(ep.lines), 3)
        self.assertIn("שני טיפים", ep.lines[0].say)

    def test_emoji_never_reach_the_screen(self):
        ep = episode(lines=[{"say": "טיפ 🔥", "caption": "טיפ 🔥✨"}])
        self.assertEqual(ep.lines[0].caption, "טיפ")


class Hebrew(unittest.TestCase):
    def test_emphasis_marks(self):
        self.assertEqual(text.tokens("מגנט יכול לגלות *זיוף*?"), [("מגנט", False), ("יכול", False), ("לגלות", False), ("זיוף?", True)])
        self.assertEqual(text.tokens("על *ההמלצות שלך* החודש"), [("על", False), ("ההמלצות", True), ("שלך", True), ("החודש", False)])

    def test_word_order_right_to_left_with_latin_runs(self):
        words = text.tokens("לונה · LikeLink2")
        order = [words[i][0] for i in text._visual_order([0, 1, 2], words)]
        self.assertEqual(order, ["LikeLink2", "·", "לונה"])  # drawn left → right: reads "לונה · LikeLink2"
        self.assertEqual(text.display("2."), ".2")         # numbers belong to the right-to-left line
        self.assertEqual(text.display("LikeLink2"), "LikeLink2")

    def test_pop_chunks_are_short(self):
        for a, b in text.chunks("ראית מוצר ברילס ירדת לתגובות ומצאת עשרים שאלות"):
            self.assertLessEqual(b - a + 1, 4)


class Timing(unittest.TestCase):
    def test_voice_word_timings_are_used_when_the_words_match(self):
        beat = compose.Beat(start=3.0, seconds=1.2, end=1.4, caption="לא *מאשרים* קבלה",
                            clip=Clip("לא מאשרים קבלה", 1.2, None, [(0.1, 0.2, "לא"), (0.35, 0.4, "מאשרים"), (0.8, 0.3, "קבלה")]))
        self.assertEqual([round(t, 2) for t, _ in compose.word_times(beat)], [3.1, 3.35, 3.8])

    def test_other_captions_spread_over_the_spoken_span(self):
        beat = compose.Beat(start=0.0, seconds=2.0, end=2.2, caption="*3 בדיקות* לפני",
                            clip=Clip("שלוש בדיקות קטנות לפני", 2.0, None, [(0.2, 0.3, "שלוש"), (1.5, 0.3, "לפני")]))
        times = compose.word_times(beat)
        self.assertAlmostEqual(times[0][0], 0.2)
        self.assertAlmostEqual(times[-1][0] + times[-1][1], 1.8)
        self.assertTrue(all(b[0] >= a[0] for a, b in zip(times, times[1:])))


class Truth(unittest.TestCase):
    def test_labels_follow_what_is_on_screen(self):
        self.assertEqual(brand.truth_label(True, True), brand.AI_VOICE_LABEL)
        self.assertEqual(brand.truth_label(False, True), brand.VOICE_LABEL)
        self.assertIsNone(brand.truth_label(False, False))
        self.assertEqual(brand.corner_label(True, False), "דמות AI")

    def test_caption_opens_with_the_ad_tag_only_with_a_product(self):
        ep = load_episode(HERE / "episodes" / "silver-925.json")
        with_product = metadata.build(ep, product={"id": "p-live-02", "claim": "x"}, voice_engine="edge", visual="still", seconds=20)
        self.assertTrue(with_product["caption"].startswith(brand.AD_TAG))
        self.assertIn("רוצה", with_product["caption"])
        tip = load_episode(HERE / "episodes" / "parcel-refund.json")
        plain = metadata.build(tip, product=None, voice_engine="none", visual="still", seconds=20)
        self.assertNotIn("#פרסומת", plain["caption"])
        self.assertIn(brand.AI_LABEL, plain["caption"])


class Trends(unittest.TestCase):
    def test_calendar_dates(self):
        self.assertEqual(trends.calendar(dt.date(2026, 10, 9)), ["11.11"])
        self.assertIn("בלאק פריידיי", trends.calendar(dt.date(2026, 11, 20)))
        self.assertEqual(trends.calendar(dt.date(2026, 3, 1)), [])

    def test_unrelated_trends_never_touch_a_hook(self):
        self.assertIsNone(trends.trend_hook("החבילה לא הגיעה?", ["חבילה", "משלוח"], trends=["פיגוע בצפון", "מכבי"], today=dt.date(2026, 3, 1)))
        hit = trends.trend_hook("המבצע הזה באמת מבצע?", ["מבצע", "11.11"], trends=[], today=dt.date(2026, 10, 9))
        self.assertEqual(hit[1]["source"], "calendar")


class Music(unittest.TestCase):
    def test_bed_level(self):
        self.assertAlmostEqual(music.db_to_gain(-20), 0.1)
        x = music.beat(2.0)
        self.assertLessEqual(float(abs(x).max()), 1.0)


if __name__ == "__main__":
    unittest.main()
