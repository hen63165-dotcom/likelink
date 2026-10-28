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

    def test_a_presenter_is_framed_from_the_hips_up(self):
        # 2026-10-25: the full drawings put tight leggings at the bottom of every frame.
        from PIL import Image
        img = Image.new("RGB", (576, 1024))
        self.assertEqual(compose.upper_body(img).size, (576, round(1024 * compose.UPPER)))
        self.assertLess(compose.UPPER, 0.8)
        src = (Path(compose.__file__).parent / "compose.py").read_text(encoding="utf-8")
        self.assertIn("upper_body(still) if path else still", src, "every drawn scene of hers, not Luna's full portrait")

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

    def test_cast_prompts_put_the_shot_first_and_stay_short(self):
        """SD 1.5 reads 77 tokens and drops the rest (the first cast lost every
        scene action and the leggings). The shot leads, prompts stay short (the
        runner refuses a cast prompt it would cut), pants are long, tops cover."""
        import importlib.util
        spec = importlib.util.spec_from_file_location("cast", HERE.parent / "media" / "ai-image" / "cast.py")
        cast = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cast)
        for member in cast.CAST["characters"]:
            self.assertIn("long", member["outfit"], member["id"])
            self.assertNotRegex(member["outfit"], r"bra|crop|short", member["id"])
            for stage, shots in (("face", cast.CAST["face"]), ("scenes", cast.CAST["scenes"])):
                for job, what in zip(cast.jobs(member["id"], stage), shots.values()):
                    self.assertEqual(job["kind"], "cast")
                    self.assertTrue(job["prompt"].startswith(what), f"{member['id']} {job['id']}: the shot comes first")
                    self.assertLessEqual(len(job["prompt"].split()), 42, f"{member['id']} {job['id']}")
        self.assertLessEqual(len(cast.CAST["negative"].split()), 32)
        for word in ("shorts", "underwear", "logo", "midriff", "jewelry"):
            self.assertIn(word, cast.CAST["negative"])

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


class Studio3D(unittest.TestCase):
    """The free 3D studio's shots in the story look (scripts/media/studio3d)."""

    def test_a_studio_belongs_to_the_story_look_and_is_a_plain_name(self):
        ep = episode(look="story", studio="pilot-hoops", lines=[{"say": "שורה.", "scene": "hero"}])
        self.assertEqual(ep.studio, "pilot-hoops")
        with self.assertRaises(ScriptError):
            episode(studio="pilot-hoops")  # not a story
        for bad in ["../etc", "Pilot", "a b", "x" * 41]:
            with self.assertRaises(ScriptError, msg=bad):
                episode(look="story", studio=bad)

    def test_studio_files_resolve_only_inside_its_folder(self):
        self.assertIsNone(brand.studio_scene("hero", ""))
        self.assertIsNone(brand.studio_scene("", "pilot-hoops"))
        self.assertIsNone(brand.studio_scene("no-such-shot", "pilot-hoops"))
        pic = brand.studio_scene("hero", "pilot-hoops")
        if pic is not None:  # the pilot's pictures are committed for review
            self.assertEqual(pic.parent, brand.STUDIO_DIR / "pilot-hoops")

    def test_the_depth_camera_moves_near_things_more_than_far_ones(self):
        from PIL import Image, ImageDraw
        import numpy as np
        img = Image.new("RGB", (288, 512), (90, 120, 170))
        ImageDraw.Draw(img).ellipse((94, 196, 194, 296), fill=(240, 180, 140))
        depth = Image.new("L", (288, 512), 30)
        ImageDraw.Draw(depth).ellipse((94, 196, 194, 296), fill=230)
        clip = compose.parallax_still(img, depth, 2.0, "in")
        a, b = clip.get_frame(0).astype(int), clip.get_frame(2.0).astype(int)
        self.assertEqual(a.shape, (compose.H, compose.W, 3))
        moved = np.abs(a - b).sum(axis=2) > 30
        self.assertGreater(moved.sum(), 1000)  # the near disc grew
        h, w = moved.shape
        self.assertLess(moved[: h // 6].mean(), moved[h // 3: 2 * h // 3].mean())  # far top moves least

    def test_lip_synced_shots_belong_to_a_studio_story(self):
        ep = episode(look="story", studio="pilot-hoops", talk=["hero", "cta-2"], lines=[{"say": "שורה.", "scene": "hero"}])
        self.assertEqual(ep.talk, ["hero", "cta-2"])
        with self.assertRaises(ScriptError):
            episode(look="story", talk=["hero"])  # no studio
        with self.assertRaises(ScriptError):
            episode(look="story", studio="pilot-hoops", talk=["../x"])

    def test_an_animated_shot_uses_only_its_clean_start(self):
        self.assertLessEqual(compose.STUDIO_CLIP_KEEP, 3.0)

    def test_a_talking_shot_cuts_in_to_her_face_in_the_same_frame_shape(self):
        x0, y0, x1, y1 = compose.close_up_box(576, 1024)
        self.assertAlmostEqual((x1 - x0) / (y1 - y0), 576 / 1024, places=2)
        self.assertLess(x1 - x0, 576)  # closer than the drawing
        self.assertLess(y0, 1024 * 0.05)  # her face is near the top
        self.assertEqual((x0 + x1) / 2, 288)  # centred across
        self.assertTrue(0 <= x0 and x1 <= 576 and y1 <= 1024)


class SameWoman(unittest.TestCase):
    """pick.py: per shot, the take that is most the same adult presenter (pilot v4: a child in one shot, orange hair in another)."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(HERE.parent / "media" / "studio3d"))
        import flux  # noqa: PLC0415
        import pick  # noqa: PLC0415
        cls.flux, cls.pick = flux, pick

    def take(self, k, **kw):
        return {"take": k, "face": True, "adult": 0.9, "identity": 0.9, "prompt": 0.3, "jewel": 0.1, **kw}

    def test_each_take_draws_from_its_own_seed(self):
        shot = {"seed": 93101}
        self.assertEqual(self.flux.seed_of(shot), 93101)
        self.assertEqual(self.flux.seed_of(shot, 0), 93101)
        self.assertEqual(len({self.flux.seed_of(shot, k) for k in range(3)}), 3)

    def test_a_child_is_never_chosen_while_an_adult_take_exists(self):
        chosen = self.pick.choose([self.take(0, adult=0.2, identity=0.99), self.take(1, adult=0.7, identity=0.8)])
        self.assertEqual(chosen["take"], 1)

    def test_a_take_without_her_face_is_out(self):
        chosen = self.pick.choose([self.take(0, face=False, identity=0.99), self.take(1, identity=0.8)])
        self.assertEqual(chosen["take"], 1)

    def test_the_same_face_weighs_most_then_the_shot(self):
        takes = [self.take(0, identity=0.80, prompt=0.33), self.take(1, identity=0.93, prompt=0.30), self.take(2, identity=0.86, prompt=0.31)]
        self.assertEqual(self.pick.choose(takes)["take"], 1)

    def test_jewellery_weighs_a_take_down(self):
        takes = [self.take(0, identity=0.91, jewel=0.95), self.take(1, identity=0.90, jewel=0.05)]
        self.assertEqual(self.pick.choose(takes)["take"], 1)

    def test_an_object_shot_is_chosen_by_the_shot_asked_for(self):
        takes = [self.take(0, prompt=0.25), self.take(1, prompt=0.32)]
        self.assertEqual(self.pick.choose(takes, character=False)["take"], 1)
        self.assertIsNone(self.pick.choose([]))


class AutoPlan(unittest.TestCase):
    """One product in, one reel out (scripts/media/studio3d/autoplan.py)."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(HERE.parent / "media" / "studio3d"))
        import autoplan  # noqa: PLC0415
        cls.ap = autoplan
        cls.cast = json.loads((HERE.parent / "media" / "ai-image" / "cast.json").read_text(encoding="utf-8"))["characters"]

    def plans(self):
        for pid, product in CATALOG.items():
            for member in self.cast:
                yield pid, member, self.ap.plan(product, member)

    def test_every_listed_product_gets_a_story_that_passes_before_anything_is_drawn(self):
        self.assertGreaterEqual(len(CATALOG), 5)
        for pid, member, spec in self.plans():
            self.ap.check_plan(spec)  # hook, the master's length, scenes, no drawn jewellery, the tag
            name = f"{pid}-{member['id']}"[:40]
            check_truth(parse_episode({**spec["episode"], "look": "story", "studio": name}), CATALOG)

    def test_the_story_follows_the_product_kind(self):
        kind = self.ap.kind_of
        self.assertEqual(kind({"title": "עגילי חישוק"}), "earrings")
        self.assertEqual(kind({"title": "Gold hoop earrings"}), "earrings")
        self.assertEqual(kind({"title": "שרשרת יד עם תליונים"}), "bracelet")  # a hand chain is worn as a bracelet
        self.assertEqual(kind({"title": "טבעת כסף"}), "ring")
        self.assertEqual(kind({"title": "שרשרת עם תליון"}), "necklace")
        self.assertIsNone(kind({"title": "כרית לכלב"}))  # no story yet: refused, never guessed
        with self.assertRaises(SystemExit):
            self.ap.plan({"id": "x-1", "title": "כרית לכלב"}, self.cast[0])

    def test_the_product_is_shown_only_in_its_real_photo(self):
        for _pid, _member, spec in self.plans():
            ep = spec["episode"]
            at = ep["product"]["at"]
            self.assertGreaterEqual(at, 2, "a tip before the product")
            self.assertFalse(ep["lines"][at - 1].get("scene"), "the product line shows the seller's photo")
            for s in spec["shots"]:
                self.assertNotRegex(f"{s.get('prompt', '')} {s.get('motion', '')}", self.ap.DRAWN_JEWELLERY)
        with self.assertRaises(SystemExit):
            bad = self.ap.plan(CATALOG["p-live-05"], self.cast[0])
            bad["shots"][2]["prompt"] += ", wearing hoop earrings"
            self.ap.check_plan(bad)

    def test_each_talking_line_has_its_own_shot_and_the_tag_is_a_still(self):
        for _pid, _member, spec in self.plans():
            shots = {s["id"]: s for s in spec["shots"]}
            scenes = [l.get("scene") for l in [spec["episode"]["hook"], *spec["episode"]["lines"]] if l.get("scene")]
            for sid, s in shots.items():
                if s.get("talk"):  # the lip-sync output is named after its picture
                    self.assertEqual(scenes.count(sid), 1, sid)
            tag = shots[spec["face"]["from"]]
            self.assertTrue(tag.get("still"), "the name tag's portrait is never animated")
            self.assertNotIn(tag["id"], scenes)

    def test_one_adult_look_and_close_ups_for_the_talking_shots(self):
        for _pid, member, spec in self.plans():
            self.assertIn("in her late twenties", spec["character"])
            self.assertNotIn("auburn", spec["character"])  # read as brown in one shot, orange in another
            self.assertGreaterEqual(spec["takes"], 2)
            for s in spec["shots"]:
                if s.get("talk"):  # a large face: the lips move clearly and sharply
                    self.assertIn("from the chest up", s["prompt"], s["id"])
                self.assertNotRegex(s.get("prompt", ""), r"hands on her cheeks")  # read as a child in pilot v4

    def test_the_framing_comes_before_her_look_and_a_close_shot_names_only_her_top(self):
        import flux  # noqa: PLC0415
        for _pid, _member, spec in self.plans():
            for s in spec["shots"]:
                text = flux.prompt_of(spec, s)
                self.assertTrue(text.startswith(f"{spec['style']}, {s['prompt']}"), s["id"])  # CLIP reads 77 tokens
                if s.get("frame") == "upper":
                    self.assertNotRegex(text, r"pants|leggings", s["id"])  # drawn from the knees in v5
        self.assertEqual(self.ap.top_of("plain dusty rose half-zip sweatshirt and long sweatpants"), "plain dusty rose half-zip sweatshirt")

    def test_keyframe_candidates_for_every_presenter_are_chosen_by_eye(self):
        spec = self.ap.masters({"characters": self.cast})
        self.assertNotIn("episode", spec)  # drawn and committed for review only: nothing is animated
        self.assertEqual(len(spec["shots"]), len(self.cast) * self.ap.MASTER_TAKES)
        self.assertLessEqual(len(spec["shots"]), 20)  # one wave of free runners
        self.assertEqual(len({s["seed"] for s in spec["shots"]}), len(spec["shots"]))
        for s in spec["shots"]:
            self.assertTrue(s["still"])
            self.assertIn("in her late twenties", s["character"])
            self.assertNotRegex(s["character"], r"pants|leggings|auburn")
            self.assertNotRegex(s["prompt"], self.ap.DRAWN_JEWELLERY)

    def test_with_her_checked_keyframe_no_shot_of_her_is_drawn_again(self):
        sys.path.insert(0, str(HERE.parent / "media" / "studio3d"))
        import castframes  # noqa: PLC0415
        master = {"face": [0.3, 0.1, 0.7, 0.35]}
        spec = self.ap.plan(CATALOG["p-live-05"], self.cast[0], master)
        self.ap.check_plan(spec)
        drawn = [s["id"] for s in spec["shots"] if not s.get("cast")]
        self.assertEqual(drawn, ["hook"])  # the talking object alone
        self.assertEqual(spec["face"], {"from": "tag", "box": master["face"]})
        self.assertTrue(all(s["cast"] == "master.png" for s in spec["shots"] if s.get("character")))
        frames = castframes.frames(spec)
        self.assertEqual({sid for sid, _ in frames}, {s["id"] for s in spec["shots"] if s.get("character")})
        self.assertTrue(all(path == castframes.CAST / spec["presenter"] / "master.png" for _, path in frames))
        with self.assertRaises(SystemExit):  # never a path out of the cast folder
            castframes.frames({**spec, "shots": [{"id": "x", "cast": "../../evil.png"}]})
        self.assertIsNone(self.ap.master_of("nobody"))
        without = self.ap.plan(CATALOG["p-live-05"], self.cast[0])
        self.assertFalse(any(s.get("cast") for s in without["shots"]))  # no keyframe yet: every shot is drawn

    def test_the_story_is_held_to_the_masters_length(self):
        for _pid, _member, spec in self.plans():
            self.assertGreaterEqual(self.ap.estimate_seconds(spec["episode"]), 20)
            self.assertLessEqual(self.ap.estimate_seconds(spec["episode"]), 45)
        short = self.ap.plan(CATALOG["p-live-01"], self.cast[0])
        short["episode"]["lines"] = short["episode"]["lines"][:2]
        with self.assertRaises(SystemExit):
            self.ap.check_plan(short)


class Music(unittest.TestCase):
    def test_bed_level(self):
        self.assertAlmostEqual(music.db_to_gain(-20), 0.1)
        x = music.beat(2.0)
        self.assertLessEqual(float(abs(x).max()), 1.0)


if __name__ == "__main__":
    unittest.main()
