"""Luna reels engine: the rules that must hold before any frame is drawn.

Run from scripts/luna_reels:  python -m unittest discover -s tests -v
"""
import datetime as dt
import json
import re
import sys
import tempfile
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

    def test_from_her_keyframe_the_close_up_is_cut_around_her_head(self):
        head = [0.32, 0.12, 0.68, 0.36]  # a head-and-hair box, a little left of centre would move the crop too
        boxes = [compose.close_up_box(576, 1024, head=head, n=n) for n in range(3)]
        for x0, y0, x1, y1 in boxes:
            self.assertAlmostEqual((x1 - x0) / (y1 - y0), 9 / 16, places=2)
            self.assertTrue(0 <= x0 and x1 <= 576 and 0 <= y0 and y1 <= 1024)
            self.assertLessEqual(x0, head[0] * 576)
            self.assertGreaterEqual(x1, head[2] * 576)  # her whole head is in
            self.assertLessEqual(y0, head[1] * 1024)
        self.assertEqual(len({b[2] - b[0] for b in boxes}), 3)  # each talking line another cut
        x0, _y0, x1, _y1 = compose.close_up_box(576, 1024, head=[0.0, 0.1, 0.3, 0.3])
        self.assertEqual(x0, 0)  # never outside the picture
        with tempfile.TemporaryDirectory() as d:
            pic = Path(d) / "hero.png"
            self.assertIsNone(compose.head_of(pic))
            (Path(d) / "hero.face.json").write_text(json.dumps({"head": head}))
            self.assertEqual(compose.head_of(pic), head)
            (Path(d) / "hero.face.json").write_text(json.dumps({"head": [0.5, 0.1, 0.2, 0.3]}))
            self.assertIsNone(compose.head_of(pic))  # a box turned inside out is no box


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

    def test_earrings_open_on_a_jewellery_box_and_the_comment_ending_promises_nothing(self):
        # The owner, 2026-11-03: the talking T-shirt hid that the reel sells earrings,
        # and viewers left during the 4 s end card. The box says what it is in the
        # first second; it is drawn closed and never named as jewellery to the
        # image model (the product is shown only in its real photo).
        member = next(m for m in self.cast if m["id"] == "shira")
        hoops = {"id": "ae-1", "title": "עגילים · חישוק", "storeTitle": "hoop earrings"}
        spec = self.ap.plan(hoops, member, ending="comment")
        self.ap.check_plan(spec)
        ep = spec["episode"]
        self.assertIn("קופסת התכשיטים", ep["hook"]["say"])
        self.assertNotRegex(spec["shots"][0]["prompt"], self.ap.DRAWN_JEWELLERY)
        self.assertIs(ep["outro"], False)
        self.assertNotIn("keyword", ep)
        said = " ".join(l["say"] for l in [ep["hook"], *ep["lines"]])
        self.assertNotIn("אשלח", said, "nothing answers DMs on such an account")
        self.assertEqual(ep["lines"][-1]["caption"], "הקישור בתגובה הראשונה")
        episode = parse_episode({**ep, "look": "story", "studio": "ae-1-shira"})
        self.assertFalse(episode.outro)
        self.assertEqual(compose.end_seconds(episode), 0.0)
        default = self.ap.plan(hoops, member)
        self.assertEqual(default["episode"]["keyword"], "רוצה", "the default keeps the comment bot's word")
        self.assertNotIn("outro", default["episode"])
        self.assertEqual(compose.end_seconds(parse_episode({**default["episode"], "look": "story", "studio": "ae-1-shira"})), compose.END_SECONDS)
        with self.assertRaises(SystemExit):
            self.ap.plan(hoops, member, ending="other")
        # The post says where the link is, never a DM, and names no comment keyword.
        meta = metadata.build(episode, product={"id": "ae-1", "claim": ""}, voice_engine="edge", visual="scenes",
                              seconds=24.0, character=True) if hasattr(metadata, "build") else None
        if meta is not None:
            self.assertIn("הקישור בתגובה הראשונה", meta["caption"])
            self.assertNotIn("ואשלח", meta["caption"])
            self.assertIsNone(meta["commentKeyword"])

    def test_the_keyword_ending_asks_for_the_word_without_an_end_card(self):
        # The owner, 2026-11-05: "כתבי רוצה" (a comment link cannot be tapped on Instagram).
        member = next(m for m in self.cast if m["id"] == "shira")
        spec = self.ap.plan({"id": "ae-1", "title": "עגילים · חישוק"}, member, ending="keyword")
        self.ap.check_plan(spec)
        ep = spec["episode"]
        self.assertEqual(ep["keyword"], "רוצה")
        self.assertIs(ep["outro"], False)
        self.assertIn("רוצה", ep["lines"][-1]["say"])
        episode = parse_episode({**ep, "look": "story", "studio": "ae-1-shira"})
        self.assertEqual(compose.end_seconds(episode), 0.0)
        meta = metadata.build(episode, product={"id": "ae-1", "claim": ""}, voice_engine="edge", visual="scenes",
                              seconds=24.0, character=True)
        self.assertIn('כתבי "רוצה" בתגובות', meta["caption"])
        self.assertEqual(meta["commentKeyword"], "רוצה")

    def test_the_sellers_photo_stays_in_a_corner_from_the_line_that_names_it(self):
        # The owner, 2026-11-03: the earrings were on screen for 2 s of 29.
        member = next(m for m in self.cast if m["id"] == "shira")
        spec = self.ap.plan({"id": "ae-1", "title": "עגילים · חישוק"}, member, ending="comment")
        ep = parse_episode({**spec["episode"], "look": "story", "studio": "ae-1-shira"})
        # 2026-11-04: 7–9 of 10 viewers left in the first 3 s, so the product is there from the hook.
        self.assertEqual(ep.inset_from, 0)
        beats = [compose.Beat(start=float(i * 3), seconds=2.5, end=i * 3 + 2.8, caption="x", clip=None) for i in range(7)]
        spans = compose.inset_spans(beats, ep.inset_from, ep.product["at"], 21.0)
        self.assertEqual(spans, [(0.0, 12.0), (15.0, 21.0)], "hidden on the product's own full-screen line")
        self.assertEqual(compose.inset_spans(beats, 2, -1, 21.0), [(6.0, 21.0)])
        with self.assertRaises(ScriptError):
            parse_episode({**spec["episode"], "look": "story", "studio": "ae-1-shira", "productInset": -1})
        card = compose.product_inset_card(compose.Image.new("RGB", (800, 800), (200, 10, 10)))
        self.assertGreaterEqual(card.width, compose.INSET)

    def test_a_long_line_cuts_closer_about_every_two_and_a_half_seconds(self):
        self.assertEqual(compose.jump_times(2.4), [])
        self.assertEqual(compose.jump_times(3.4), [1.7])
        self.assertEqual(compose.jump_times(5.4), [1.8, 3.6])
        self.assertEqual(compose.jump_times(5.0), [2.5])
        # v14: the closer crop cut off the seller photo's own label.
        self.assertFalse(compose.jumps("product"))
        self.assertTrue(compose.jumps("hero"))

    def test_the_corner_photo_shows_from_the_hook(self):
        # v14: productInset 0 was planned, but "0 < inset_from" kept the photo off the whole reel.
        self.assertTrue(compose.inset_on(0, 7))
        self.assertTrue(compose.inset_on(2, 7))
        self.assertFalse(compose.inset_on(-1, 7))
        self.assertFalse(compose.inset_on(7, 7))

    def test_the_talking_object_never_borrows_her_clip(self):
        # v13, 2026-11-04: the box's hook played Shira's clip and the box never appeared.
        import importlib.util  # noqa: PLC0415
        spec_ = importlib.util.spec_from_file_location("musetalk", HERE.parent / "media" / "talking" / "musetalk.py")
        m = importlib.util.module_from_spec(spec_)
        spec_.loader.exec_module(m)
        member = next(x for x in self.cast if x["id"] == "shira")
        plan = self.ap.plan({"id": "ae-1", "title": "עגילים · חישוק"}, member,
                            master={"face": [0.2, 0.05, 0.9, 0.44]}, engine="gpu", ending="comment")
        hers = m.her_talking_shots(plan)
        self.assertNotIn("hook", hers)
        self.assertIn("cta", hers)

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

    def test_every_saved_keyframe_is_a_cast_member_with_a_square_head_box(self):
        from PIL import Image  # noqa: PLC0415
        ids = {c["id"] for c in self.cast}
        saved = sorted(p.parent.name for p in self.ap.CAST_DIR.glob("*/master.json"))
        self.assertTrue(saved)
        for who in saved:
            self.assertIn(who, ids)
            master = self.ap.master_of(who)
            self.assertIsNotNone(master, who)  # the picture is there too
            x0, y0, x1, y1 = master["face"]
            w, h = Image.open(self.ap.CAST_DIR / who / "master.png").size
            self.assertAlmostEqual((x1 - x0) * w, (y1 - y0) * h, delta=3, msg=who)  # the name tag is round

    def test_a_later_round_is_drawn_from_the_chest_up_with_new_seeds(self):
        first = self.ap.masters({"characters": self.cast}, only=["noa"])
        later = self.ap.masters({"characters": self.cast}, only=["noa"], round_=2)
        self.assertEqual(len(later["shots"]), self.ap.MASTER_TAKES)
        self.assertTrue(all(s["id"].startswith("noa-r2m") and "from the chest up" in s["prompt"] for s in later["shots"]))
        self.assertFalse({s["seed"] for s in first["shots"]} & {s["seed"] for s in later["shots"]})

    def test_from_round_three_a_grown_womans_features_come_right_after_the_framing(self):
        r2 = self.ap.masters({"characters": self.cast}, only=["noa"], round_=2)
        r3 = self.ap.masters({"characters": self.cast}, per=6, only=["noa"], round_=3)
        self.assertEqual(len(r3["shots"]), 6)
        for s in r3["shots"]:
            self.assertTrue(s["prompt"].startswith("medium close-up from the chest up, a grown woman, not a girl"))
            self.assertNotIn("oversized", s["character"])
            self.assertIn("fitted", s["character"])
        self.assertFalse({s["seed"] for s in r2["shots"]} & {s["seed"] for s in r3["shots"]})
        self.assertNotIn("grown woman", r2["shots"][0]["prompt"], "earlier rounds stay as they were drawn")
        for s in r3["shots"]:  # nothing that could be drawn as jewellery
            self.assertNotRegex(s["prompt"] + s["character"], r"(?i)earring|necklace|bracelet|\bring\b|jewel")

    def test_when_she_talks_the_camera_stays_still(self):
        for master in (None, {"face": [0.26, 0.18, 0.86, 0.51]}):
            spec = self.ap.plan(CATALOG["p-live-05"], self.cast[2], master)
            talking = [s for s in spec["shots"] if s.get("talk")]
            self.assertEqual([s["id"] for s in talking], ["hero", "tip", "cta"])
            for s in talking:
                self.assertIn(self.ap.STEADY, s["motion"])
                self.assertIn(self.ap.EYES, s["motion"])
                self.assertNotIn("pushes in", s["motion"])
                self.assertNotIn("points at", s["motion"], "a pointing hand came out as a squint and no hand")

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

    def test_the_sites_own_stories_say_only_what_is_live_and_promise_nothing(self):
        # The owner, 2026-11-03: reels that make buyers and creators understand
        # what LikeLink2 gives. No product, no ad tag, no income or crowd claims.
        promise = re.compile(r"הכנסה|להרוויח|תרוויחי|רווח|כסף קל|משתמשות|משתמשים|אלפי|מקומות אחרונים|רק היום|מובטח|הכי")
        self.assertEqual(set(self.ap.BRAND_STORIES), {"creators", "buyers", "magic"})
        for story, st in self.ap.BRAND_STORIES.items():
            for engine in ("cpu", "gpu"):
                for member in self.cast:
                    spec = self.ap.plan_brand(story, member, engine=engine)
                    self.ap.check_plan(spec)
                    ep = parse_episode({**spec["episode"], "look": "story", "studio": f"brand-{story}-{member['id']}"})
                    check_truth(ep, {})
                    self.assertIsNone(ep.product)  # no product scene, so no ad tag on the frames
                    self.assertTrue(20 <= self.ap.estimate_seconds(spec["episode"]) <= 45)
                    self.assertTrue(re.fullmatch(r"[a-z0-9][a-z0-9-]{1,48}", ep.id))
                    self.assertEqual(spec["product"], f"brand-{story}")
                    self.assertTrue(re.fullmatch(r"[a-z0-9-]{2,30}", spec["product"]))  # the workflow's product input
            words = " ".join(" ".join(v) if isinstance(v, tuple) else str(v) for v in st.values())
            self.assertIsNone(promise.search(words), story)
            self.assertIn(st["link"], ("/", "/join", "/magic"))
            self.assertIn("בתגובה הראשונה", st["card"]["sub"])  # the posting task puts the link there
        meta = metadata.build(parse_episode({**self.ap.plan_brand("creators", self.cast[0])["episode"], "look": "story"}),
                              product=None, voice_engine="edge", visual="scenes", seconds=22)
        self.assertNotIn(brand.AD_TAG, meta["caption"])
        self.assertNotIn("רוצה", meta["caption"])  # no DM promise: the link is in the first comment
        self.assertIn("פתיחת סטודיו בחינם", meta["caption"])
        # 2026-11-03: the buyers reel told by Noa carried "#לונהממליצה"; the series tag names who tells it.
        noa = next(m for m in self.cast if m["id"] == "noa")
        buyers = metadata.build(parse_episode({**self.ap.plan_brand("buyers", noa)["episode"], "look": "story"}),
                                product=None, voice_engine="edge", visual="scenes", seconds=22)
        self.assertIn(f"#{noa['name']}ממליצה", buyers["caption"])
        self.assertNotIn("#לונהממליצה", buyers["caption"])
        # ...and its box had made-up letters printed on it: the talking object is described as unprinted.
        self.assertIn("without any printing", self.ap.BRAND_STORIES["buyers"]["object"][0])
        with self.assertRaises(SystemExit):
            self.ap.plan_brand("investors", self.cast[0])

    def test_the_magic_button_reel_shows_the_real_page_recorded(self):
        # The owner, 2026-11-07: a Ravit-level reel that explains the magic button.
        # Two of its lines play the live page (clean recording), pinned to a commit,
        # and the files are in this repository; the rest is the series as usual.
        st = self.ap.BRAND_STORIES["magic"]
        self.assertEqual(st["link"], "/magic")
        self.assertIn(st["mood"], self.ap.MOODS)
        for member in self.cast:
            spec = self.ap.plan_brand("magic", member)
            self.ap.check_plan(spec)
            scenes = {line["caption"]: line.get("scene") for line in spec["episode"]["lines"]}
            clips = [v for v in scenes.values() if str(v).startswith("video:")]
            self.assertEqual(len(clips), 2)
            for clip in clips:
                m = re.fullmatch(r"video:https://raw\.githubusercontent\.com/hen63165-dotcom/likelink/[0-9a-f]{40}/(marketing/reels/proof/[a-z-]+\.mp4)", clip)
                self.assertIsNotNone(m, clip)
                self.assertTrue((HERE.parent.parent / m.group(1)).exists(), m.group(1))
            ep = parse_episode({**spec["episode"], "look": "story", "studio": f"brand-magic-{member['id']}"})
            check_truth(ep, {})
            self.assertIsNone(ep.product)
        # A drawn shot is still required for every other line: a clip replaces only its own line.
        bad = self.ap.plan_brand("magic", self.cast[0])
        bad["episode"]["lines"][0]["scene"] = "nowhere"
        with self.assertRaises(SystemExit):
            self.ap.check_plan(bad)

    def test_every_caption_on_the_screen_uses_only_characters_the_font_draws(self):
        # 2026-11-03: "מדביקים קישור → חנות" came out as an empty box: the
        # story captions' font has no arrow (emoji are dropped, but → is not one).
        drawable = re.compile(r"[א-ת־ A-Za-z0-9.,:!?'\"+\-…()]*")
        for st in [*self.ap.STORIES.values(), *self.ap.BRAND_STORIES.values()]:
            for value in st.values():
                if isinstance(value, tuple) and len(value) == 2 and all(isinstance(v, str) for v in value):
                    self.assertTrue(drawable.fullmatch(value[1]), f"caption '{value[1]}'")
        self.assertTrue(drawable.fullmatch(self.ap.CTA[1]))


class CloudStudio(unittest.TestCase):
    """The cloud studio (scripts/media/gpu): every scene says its own line, from the very voice the edit plays."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(HERE.parent / "media" / "gpu"))
        sys.path.insert(0, str(HERE.parent / "media" / "studio3d"))
        import autoplan  # noqa: PLC0415
        import cloudplan  # noqa: PLC0415
        cls.ap, cls.cp = autoplan, cloudplan
        cls.cast = json.loads((HERE.parent / "media" / "ai-image" / "cast.json").read_text(encoding="utf-8"))["characters"]

    def spec(self, master=None):
        return self.ap.plan(CATALOG["p-live-05"], self.cast[2], master, engine="gpu")

    def manifest(self, spec):
        beats = [spec["episode"]["hook"], *spec["episode"]["lines"]]
        return {"beats": [{"beat": i, "scene": b.get("scene", ""), "file": f"ep-{i:02d}.mp3", "seconds": 2.5}
                          for i, b in enumerate(beats)]}

    def test_the_modal_token_is_read_out_of_whatever_was_pasted_and_never_shown(self):
        # 2026-11-04: Modal answered "Token ID is malformed" for the stored id.
        tid, sec = "ak-exampleId0001", "as-exampleSecret0001"
        self.assertEqual(self.cp.modal_tokens(tid, sec), (tid, sec))
        self.assertEqual(self.cp.modal_tokens(f" {tid}\n", f"'{sec}'"), (tid, sec))
        self.assertEqual(self.cp.modal_tokens(f"modal token set --token-id {tid} --token-secret {sec}", ""), (tid, sec))
        self.assertEqual(self.cp.modal_tokens(f"MODAL_TOKEN_ID={tid}", f"MODAL_TOKEN_SECRET={sec}"), (tid, sec))
        self.assertEqual(self.cp.modal_tokens(sec, tid), (tid, sec), "swapped fields")
        self.assertEqual(self.cp.modal_tokens("not a token", ""), ("", ""))
        shape = self.cp.token_shape(f"modal token set --token-id {tid}")
        self.assertTrue(shape["hasAk"] and shape["spaceInside"])
        self.assertNotIn("example", json.dumps(shape), "the shape never carries the value")

    def test_on_the_gpu_every_scene_says_its_line_and_nothing_claims(self):
        spec = self.spec()
        self.ap.check_plan(spec)
        talking = [s["id"] for s in spec["shots"] if s.get("talk")]
        self.assertEqual(talking, ["hook", "problem", "hero", "tip", "wow", "cta"])
        self.assertEqual(spec["engine"], "gpu")
        for s in spec["shots"]:
            if s.get("talk"):
                self.assertIn("talks", s["talkPrompt"])
                self.assertNotRegex(s["talkPrompt"], self.ap.DRAWN_JEWELLERY)
        with self.assertRaises(SystemExit):
            self.ap.plan(CATALOG["p-live-05"], self.cast[2], engine="kling")
        cpu = self.ap.plan(CATALOG["p-live-05"], self.cast[2])
        self.assertFalse(any(s.get("talkPrompt") for s in cpu["shots"]))  # the free studio is unchanged

    def test_one_job_per_scene_with_its_own_line_and_the_product_line_is_never_drawn_talking(self):
        spec = self.spec()
        jobs = self.cp.talk_jobs(spec, self.manifest(spec), "/p", "/v")
        self.assertEqual([j["scene"] for j in jobs], ["hook", "problem", "hero", "tip", "wow", "cta"])
        hero = next(j for j in jobs if j["scene"] == "hero")
        self.assertEqual(hero["audio"], "/v/ep-02.mp3")  # the trick line is said in the hero shot
        self.assertEqual(hero["picture"], "/p/hero.png")
        self.assertNotIn("tag", [j["scene"] for j in jobs])  # the name tag's portrait never moves
        twice = self.manifest(spec)
        twice["beats"][1]["scene"] = "hook"
        with self.assertRaises(ValueError):
            self.cp.talk_jobs(spec, twice, "/p", "/v")
        bad = self.manifest(spec)
        bad["beats"][0]["file"] = "../../etc/passwd"
        with self.assertRaises(ValueError):
            self.cp.talk_jobs(spec, bad, "/p", "/v")

    def test_with_her_keyframe_only_the_talking_object_is_drawn(self):
        spec = self.spec({"face": [0.3, 0.1, 0.7, 0.35]})
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self.cp.draw_needed(spec, d), ["hook"])
            (Path(d) / "hook.png").write_bytes(b"x")
            self.assertEqual(self.cp.draw_needed(spec, d), [])
        without = self.spec()
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(len(self.cp.draw_needed(without, d)), len(without["shots"]))

    def test_the_month_allowance_stays_under_the_free_credit(self):
        self.assertLessEqual(self.cp.MONTH_HOURS * 3.95, 30)  # H100 at $3.95 an hour, $30 free a month
        planned = self.cp.planned_seconds(6, 1)
        self.assertTrue(self.cp.budget_allows(0, planned))
        self.assertFalse(self.cp.budget_allows(self.cp.MONTH_HOURS * 3600 - planned + 1, planned))
        self.assertEqual(self.cp.month_key(0), "1970-01")

    def test_the_infinitetalk_command_follows_its_lora(self):
        lora = {"path": "/w/lora/x.safetensors", "steps": 4, "shift": 2.0, "text": 1.0, "audio": 2.0}
        args = self.cp.infinitetalk_args("/w/", lora, "/t/in.json", "/t/out", 7)
        self.assertIn("/w/Wan2.1-I2V-14B-480P", args)
        self.assertEqual(args[args.index("--sample_steps") + 1], "4")
        self.assertEqual(args[args.index("--mode") + 1], "streaming")  # any line length
        self.assertNotIn("--num_persistent_param_in_dit", args)
        plain = self.cp.infinitetalk_args("/w", None, "/t/in.json", "/t/out", 7, low_vram=True)
        self.assertEqual(plain[plain.index("--sample_steps") + 1], "40")
        self.assertNotIn("--lora_dir", plain)
        self.assertIn("--num_persistent_param_in_dit", plain)

    def test_the_edit_plays_the_very_voice_the_scene_was_made_with(self):
        from luna_reels import voice  # noqa: PLC0415
        a = voice.cache_key("שורה אחת.", "he-IL-HilaNeural")
        self.assertEqual(a, voice.cache_key("שורה אחת.", "he-IL-HilaNeural"))
        self.assertNotEqual(a, voice.cache_key("שורה אחרת.", "he-IL-HilaNeural"))
        self.assertNotEqual(a, voice.cache_key("שורה אחת.", "he-IL-AvriNeural"))
        with tempfile.TemporaryDirectory() as d:
            cache = Path(d) / "cache"
            cache.mkdir()
            (cache / f"{a}.mp3").write_bytes(b"\0" * 2000)
            (cache / f"{a}.json").write_text(json.dumps([[0.1, 0.3, "שורה"]]))
            dst = Path(d) / "out.mp3"
            words = voice._edge_cached("שורה אחת.", dst, "he-IL-HilaNeural", str(cache))  # no network: from the cache
            self.assertEqual(dst.read_bytes(), b"\0" * 2000)
            self.assertEqual(words, [(0.1, 0.3, "שורה")])

    def test_a_made_talking_shot_is_used_only_when_it_lasts_the_line(self):
        self.assertIsNone(compose.made_talk(None, 2.0))
        with tempfile.TemporaryDirectory() as d:
            pic = Path(d) / "hero.png"
            self.assertIsNone(compose.made_talk(pic, 2.0))
            from moviepy import ColorClip  # noqa: PLC0415
            ColorClip((64, 112), (200, 120, 120), duration=2.0).write_videofile(
                str(Path(d) / "hero.talk.mp4"), fps=10, codec="libx264", audio=False, logger=None)
            self.assertEqual(compose.made_talk(pic, 2.1), Path(d) / "hero.talk.mp4")
            self.assertIsNone(compose.made_talk(pic, 3.0))  # the end of the line would go unsaid

    def test_the_cloud_runs_only_with_the_owners_token_and_falls_back_to_the_free_studio(self):
        wf = (HERE.parent.parent / ".github" / "workflows" / "studio3d.yml").read_text(encoding="utf-8")
        # Usable, not just present: an id ak-… and a secret as-… (2026-11-04: "Token ID is malformed").
        self.assertIn("HAS_GPU: ${{ steps.mt.outputs.ok == 'true' }}", wf)
        self.assertIn("run: python3 scripts/media/gpu/cloudplan.py tokens --check", wf)
        self.assertIn('cloudplan.py tokens --env-file "$RUNNER_TEMP/modal.env"', wf)
        self.assertIn("if: always() && needs.plan.result == 'success' && needs.plan.outputs.stage == 'all' && needs.gpu.result != 'success'", wf)
        self.assertIn("needs.gpu.result != 'success' && needs.plan.outputs.moving", wf)  # no CPU animation after the cloud
        self.assertNotRegex(wf, r"echo .*MODAL_TOKEN")  # the token is never printed
        gpu = (HERE.parent / "media" / "gpu" / "studio_gpu.py").read_text(encoding="utf-8")
        self.assertIn("budget_allows", gpu)
        self.assertNotRegex(gpu, r"kling|klingai|runway|heygen", "open models only")


class Music(unittest.TestCase):
    def test_bed_level(self):
        self.assertAlmostEqual(music.db_to_gain(-20), 0.1)
        x = music.beat(2.0)
        self.assertLessEqual(float(abs(x).max()), 1.0)


class FreeLipSync(unittest.TestCase):
    """The free lip-sync (scripts/media/talking/musetalk.py): only her mouth and jaw are redrawn, over her own clip."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(HERE.parent / "media" / "talking"))
        import musetalk  # noqa: PLC0415 (no torch at import: the models load only when a shot is made)
        cls.m = musetalk

    def test_the_shot_covers_the_whole_line(self):
        self.assertEqual(self.m.frames_for(3.0), 75)
        self.assertEqual(self.m.frames_for(3.01), 76)
        self.assertEqual(self.m.frames_for(0.0), 1)

    def test_her_clip_plays_forward_then_back_never_jumps(self):
        idx = [self.m.base_index(i, 73, 24.0) for i in range(200)]
        self.assertEqual(idx[0], 0)
        self.assertTrue(all(0 <= j <= 72 for j in idx))
        self.assertTrue(all(abs(a - b) <= 2 for a, b in zip(idx, idx[1:])), "no jump back to the first frame")
        self.assertEqual(max(idx), 72)
        self.assertEqual({self.m.base_index(i, 1, 25.0) for i in range(10)}, {0})

    def test_a_zooming_clip_plays_only_its_steady_opening(self):
        self.assertEqual(self.m.steady_frames([100, 104, 110, 118, 125, 140]), 4)
        self.assertEqual(self.m.steady_frames([100, None, 105, 99]), 4, "a frame without a face keeps the run")
        self.assertEqual(self.m.steady_frames([100, 130]), 1, "an immediate zoom holds her first frame")
        self.assertEqual(self.m.steady_frames([None, None, None]), 3)
        self.assertEqual(self.m.steady_frames([100, 90, 85]), 3)
        self.assertEqual(self.m.steady_frames([100, 80]), 1, "a zoom out counts too")

    def test_a_line_whose_clip_squints_or_zooms_borrows_her_best_talking_clip(self):
        v10 = {"hero": (36, 0.515), "tip": (34, 0.530), "cta": (27, 0.443)}
        self.assertEqual(self.m.pick_base(v10, "cta"), "tip", "her eyes half-closed through the line")
        self.assertEqual(self.m.pick_base(v10, "hero"), "hero")
        self.assertEqual(self.m.pick_base(v10, "tip"), "tip")
        self.assertEqual(self.m.pick_base({"hero": (36, 0.5), "cta": (10, 0.5)}, "cta"), "hero", "too short to talk over")
        self.assertEqual(self.m.pick_base({"hero": (10, 0.5), "cta": (12, 0.3)}, "cta"), "cta", "nothing better: its own")
        self.assertEqual(self.m.pick_base({}, "cta"), "cta")

    def test_open_eyes_score_higher_than_a_squint(self):
        import numpy as np
        face = [100, 100, 200, 200, 150, 160, 250, 160, 200, 220, 170, 260, 230, 260]
        open_eyes = np.full((400, 400), 220, np.uint8)
        squint = open_eyes.copy()
        for x in (150, 250):
            open_eyes[150:171, x - 10:x + 11] = 20   # a big dark iris
            squint[159:162, x - 20:x + 21] = 20      # a thin lash line
        self.assertGreater(self.m.eye_score(open_eyes, face), 2 * self.m.eye_score(squint, face))

    def test_a_borrowed_clip_starts_elsewhere(self):
        self.assertNotEqual(self.m.base_index(0, 36, 24.0, phase=0.5), self.m.base_index(0, 36, 24.0))
        idx = [self.m.base_index(i, 36, 24.0, phase=0.5) for i in range(120)]
        self.assertTrue(all(0 <= j <= 35 for j in idx))
        self.assertTrue(all(abs(a - b) <= 2 for a, b in zip(idx, idx[1:])), "still never jumps")

    def test_the_crop_is_musetalks_nose_in_the_middle(self):
        # YuNet: x, y, w, h, right eye, left eye, nose, mouth corners (Shira's keyframe at 1080x1920)
        face = [420, 500, 372, 432, 500, 640, 700, 640, 566, 769, 518, 833, 660, 822]
        x1, y1, x2, y2 = self.m.muse_box(face, 1080, 1920)
        self.assertEqual((x1, x2), (420, 792))
        self.assertAlmostEqual((y1 + y2) / 2, 769, delta=1)
        self.assertGreater(y2, 500 + 432)
        with self.assertRaises(ValueError):
            self.m.muse_box([10, 10, 8, 8, 0, 0, 0, 0, 12, 14, 0, 0, 0, 0], 100, 100)

    def test_a_missed_frame_takes_the_nearest_face_and_the_box_is_steady(self):
        rows = [None, [10.0], None, None, [20.0], None]
        self.assertEqual(self.m.fill_gaps(rows), [[10.0], [10.0], [10.0], [20.0], [20.0], [20.0]])
        self.assertEqual(self.m.fill_gaps([None, None]), [])
        steady = self.m.smooth([[0.0], [10.0], [0.0], [10.0], [0.0]], k=5)
        self.assertTrue(all(2 <= r[0] <= 8 for r in steady))

    def test_each_talking_shot_gets_its_own_line_clip_and_framing(self):
        spec = {"shots": [{"id": "hook"}, {"id": "hero", "talk": True}, {"id": "tip", "talk": True},
                          {"id": "tag", "still": True, "talk": True}]}
        manifest = {"beats": [{"scene": "hook", "file": "ep-00.mp3", "seconds": 2.0},
                              {"scene": "hero", "file": "ep-01.mp3", "seconds": 1.8},
                              {"scene": "tip", "file": "ep-02.mp3", "seconds": 3.2}]}
        with tempfile.TemporaryDirectory() as tmp:
            pics = Path(tmp)
            (pics / "tip.mp4").write_bytes(b"x")
            (pics / "tip.face.json").write_text(json.dumps({"head": [0.2, 0.1, 0.8, 0.5]}), encoding="utf-8")
            tip = self.m.line_for(spec, manifest, pics, "/v", "tip")
            self.assertEqual((tip["base"], tip["audio"], tip["seconds"], tip["n"], tip["head"]),
                             (str(pics / "tip.mp4"), "/v/ep-02.mp3", 3.2, 1, [0.2, 0.1, 0.8, 0.5]))
            hero = self.m.line_for(spec, manifest, pics, "/v", "hero")
            self.assertEqual((hero["base"], hero["n"], hero["head"]), (str(pics / "hero.png"), 0, None))
            for bad in ("hook", "tag"):
                with self.assertRaises(ValueError):
                    self.m.line_for(spec, manifest, pics, "/v", bad)
            twice = {"beats": manifest["beats"] + [{"scene": "tip", "file": "ep-03.mp3", "seconds": 1}]}
            with self.assertRaises(ValueError):
                self.m.line_for(spec, twice, pics, "/v", "tip")

    def test_only_the_mouth_and_jaw_change(self):
        mask = self.m.mouth_oval(200, 240, 0.5)
        self.assertEqual(mask.shape, (240, 200))
        self.assertEqual(float(mask[:120].max()), 0.0, "eyes and nose stay as drawn")
        self.assertGreater(float(mask[190, 100]), 0.9, "the mouth is redrawn")
        self.assertEqual(float(mask[190, 2]), 0.0, "her cheeks' edge and hair stay")
        self.assertEqual(float(mask[190, 30]), 0.0, "her cheek outline (and a hand by it) is never redrawn")
        self.assertGreater(float(mask[190, 80]), 0.5, "the corners of her mouth are")
        # Shira's keyframe: her mouth at 26%..65% of the face box, off its middle
        off = self.m.mouth_oval(200, 200, 0.5, (0.26, 0.65))
        row = round(0.657 * 200)  # her mouth's height in the box
        self.assertGreater(float(off[row, round(0.26 * 200)]), 0.9, "the left corner is fully redrawn")
        self.assertGreater(float(off[row, round(0.65 * 200)]), 0.9, "and the right one")
        self.assertEqual(float(off[row, 8]), 0.0)
        self.assertEqual(float(off[row, 192]), 0.0, "never out to her cheek line")


if __name__ == "__main__":
    unittest.main()
