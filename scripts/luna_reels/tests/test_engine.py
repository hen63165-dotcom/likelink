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

    def test_real_footage_is_marked_filmed_never_ai_character(self):
        ep = load_episode(HERE / "episodes" / "silver-925.json")
        real = metadata.build(ep, product={"id": "p-live-02", "claim": "x"}, voice_engine="none", visual="video:x",
                              seconds=20, character=False, real=True)
        self.assertIs(real["synthetic"], False)
        self.assertIs(real["humanFilmed"], True)
        self.assertEqual(real["labels"], [brand.AD_TAG])
        self.assertNotIn("לונה", real["altText"])
        voiced = metadata.build(ep, product={"id": "p-live-02", "claim": "x"}, voice_engine="edge", visual="video:x",
                                seconds=20, character=False, real=True)
        self.assertIn(brand.VOICE_LABEL, voiced["labels"], "an AI voice over real footage is still labelled")
        engine = metadata.build(ep, product={"id": "p-live-02", "claim": "x"}, voice_engine="edge", visual="still", seconds=20)
        self.assertIs(engine["synthetic"], True)
        self.assertIs(engine["humanFilmed"], False)


class Trends(unittest.TestCase):
    def test_calendar_dates(self):
        self.assertEqual(trends.calendar(dt.date(2026, 10, 9)), ["11.11"])
        self.assertIn("בלאק פריידיי", trends.calendar(dt.date(2026, 11, 20)))
        self.assertEqual(trends.calendar(dt.date(2026, 3, 1)), [])

    def test_unrelated_trends_never_touch_a_hook(self):
        self.assertIsNone(trends.trend_hook("החבילה לא הגיעה?", ["חבילה", "משלוח"], trends=["פיגוע בצפון", "מכבי"], today=dt.date(2026, 3, 1)))
        hit = trends.trend_hook("המבצע הזה באמת מבצע?", ["מבצע", "11.11"], trends=[], today=dt.date(2026, 10, 9))
        self.assertEqual(hit[1]["source"], "calendar")


class Story(unittest.TestCase):
    """The story look (the owner's example, 2026-10-23: a creator's story with one
    character, yellow captions on a dark box, a name tag): what it may show."""

    def story(self, **over):
        data = {"id": "t-story", "goal": "sales", "look": "story",
                "hook": {"say": "הטבעת הגיעה, ולא עולה?", "scene": "worried"},
                "lines": [{"say": "מודדים קודם.", "scene": "explain"},
                          {"say": "המוכר מציין: כסף סטרלינג 925."},
                          {"say": "ואז מזמינים."}],
                "product": {"id": "p-live-01", "at": 2, "claim": "המוכר מציין: כסף סטרלינג 925", "mustMatch": "סטרלינג 925"},
                "cta": {"title": "כתבי \"רוצה\" בתגובות"}}
        data.update(over)
        return parse_episode(data)

    def test_the_product_line_shows_the_real_photo_and_scenes_carry_on(self):
        ep = self.story()
        check_truth(ep, CATALOG)
        self.assertEqual([b.scene for b in ep.beats], ["worried", "explain", "product", ""])
        beats = [compose.Beat(start=i, seconds=1, end=i + 1, caption=b.caption, clip=Clip(None, 1.0)) for i, b in enumerate(ep.beats)]
        # A line without a scene keeps the one before it; after the product, Luna comes back.
        self.assertEqual(compose.story_scenes(ep, beats), ["worried", "explain", "product", "luna"])

    def test_scenes_are_names_the_product_or_your_own_https_clip(self):
        self.story(lines=[{"say": "א", "scene": "video:https://drive.google.com/file/d/abcdefghijklmnop/view"}], product=None,
                   cta={"title": "שמרי"})
        for bad in ["../etc/passwd", "video:http://x.example/a.mp4", "Worried Face", "video:javascript:alert(1)"]:
            with self.assertRaises(ScriptError, msg=bad):
                self.story(lines=[{"say": "א", "scene": bad}], product=None, cta={"title": "שמרי"})
        with self.assertRaises(ScriptError):
            episode(lines=[{"say": "א", "scene": "worried"}])            # scenes belong to the story look
        with self.assertRaises(ScriptError):
            self.story(lines=[{"say": "א", "scene": "product"}], product=None, cta={"title": "שמרי"})
        with self.assertRaises(ScriptError):
            episode(look="cinema")

    def test_story_captions_break_where_the_sentence_pauses(self):
        cut = lambda c: [" ".join(w for w, _ in text.tokens(c)[a:b + 1]) for a, b in text.phrases(c)]  # noqa: E731
        self.assertEqual(cut("טיפ: פרק היד + 1.5 עד 2 ס״מ"), ["טיפ:", "פרק היד + 1.5", "עד 2 ס״מ"])
        self.assertEqual(cut("החתונה הערב... והיד נראית ריקה?"), ["החתונה הערב...", "והיד נראית ריקה?"])
        self.assertEqual(cut("1. כסף או זהב?"), ["1. כסף או זהב?"], "a list number stays with its item")
        for c in ["זה קורה כשמזמינים בלי לדעת את המידה", "3 שאלות, והמתנה בוחרת את עצמה"]:
            self.assertTrue(all(b - a < 4 for a, b in text.phrases(c)), c)

    def test_the_name_tag_and_the_yellow_box(self):
        from PIL import Image
        tag = text.name_tag(Image.open(brand.LUNA_FACE), branded=True)
        self.assertLess(tag.width, 420, "a corner tag, not a banner")
        cap = text.story("הטבעת הגיעה")
        self.assertIn(brand.STORY_YELLOW + (255,), set(cap.getdata()), "the words are yellow")
        self.assertEqual(brand.NAME_TAG, "לונה ממליצה")

    def test_every_story_has_its_own_presenter_and_its_product_photo(self):
        """Like a creator's series: one character per product (the cast), her name on the tag."""
        seen = {}
        for f in sorted((HERE / "episodes").glob("story-*.json")):
            ep = load_episode(f)
            self.assertEqual(ep.look, "story", f.name)
            member = brand.cast_member(ep.presenter)
            self.assertIsNotNone(member, f"{f.name}: a presenter from the cast")
            self.assertEqual(member["product"], ep.product["id"], f"{f.name}: she presents her own product")
            self.assertNotIn(ep.presenter, seen.values(), "one product per character")
            seen[f.name] = ep.presenter
            self.assertEqual(brand.tag_text(ep.presenter), f"{member['name']} ממליצה")
            self.assertTrue(any(b.scene == "product" for b in ep.beats), f"{f.name}: the product line shows its real photo")
        self.assertEqual(brand.tag_text(""), "לונה ממליצה")
        with self.assertRaises(ScriptError):
            self.story(presenter="nobody")

    def test_every_story_scene_is_drawn_for_its_own_presenter(self):
        """A missing picture would quietly show another face (Luna's); each
        character's own folder (Actions → "Story cast") holds every scene her story names."""
        for f in sorted((HERE / "episodes").glob("story-*.json")):
            ep = load_episode(f)
            folder = brand.CAST_DIR / ep.presenter
            self.assertEqual(brand.face_path(ep.presenter), folder / "face.jpg", f"{f.name}: her own face on the tag")
            for scene in {b.scene for b in ep.beats if b.scene and b.scene != "product" and not b.scene.startswith("video:")}:
                path = brand.scene_path(scene, ep.presenter)
                self.assertIsNotNone(path, f"{f.name}: scene {scene}")
                self.assertEqual(path.parent, folder, f"{f.name}: scene {scene} is her own, not a shared picture")


class Music(unittest.TestCase):
    def test_bed_level(self):
        self.assertAlmostEqual(music.db_to_gain(-20), 0.1)
        x = music.beat(2.0)
        self.assertLessEqual(float(abs(x).max()), 1.0)


if __name__ == "__main__":
    unittest.main()
