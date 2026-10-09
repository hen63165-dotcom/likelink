import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildAss, buildCues, chunkWords, hexToAss } from "../scripts/luna-reels/captions.mjs";
import { VOICE, CAPTION, CORNER_TAGS, AESTHETIC_KEYWORDS, SCHEDULE } from "../scripts/luna-reels/config.mjs";
import { pickVideoFile, pickKeywords } from "../scripts/luna-reels/fetch-background.mjs";
import { buildRenderArgs } from "../scripts/luna-reels/render.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

test("captions are chunked into 2–3 word frames without losing words", () => {
  const text = "מה אם החנות שלך הייתה מוכרת גם כשאת ישנה לגמרי";
  const frames = chunkWords(text);
  for (const frame of frames) {
    const count = frame.split(" ").length;
    assert.ok(count >= 2 && count <= 3, `frame must hold 2–3 words: "${frame}"`);
  }
  assert.equal(frames.join(" ").split(" ").length, text.split(" ").length);
  assert.deepEqual(chunkWords("מילה"), ["מילה"]);
});

test("caption cues stay inside the narration window and never overlap", () => {
  const cues = buildCues("די לקמפיינים מסובכים פוסט אחד לינק אחד ולקוחות חדשים", 8000);
  assert.ok(cues.length > 1);
  let prevEnd = 0;
  for (const cue of cues) {
    assert.ok(cue.startMs >= prevEnd, "cues must be sequential");
    assert.ok(cue.endMs <= 8000 && cue.endMs > cue.startMs);
    prevEnd = cue.endMs;
  }
});

test("caption styling is lower-middle, yellow/white, black outline, no box", () => {
  const { ass } = buildAss("החנות שלך מוכרת גם כשאת ישנה", 6000, {
    closing: { startMs: 6000, durationMs: 2800 },
  });
  const luna = ass.split("\n").find((l) => l.startsWith("Style: Luna,"));
  const cols = luna.split(",");
  assert.equal(cols[0], "Style: Luna");
  assert.equal(cols[3], hexToAss(CAPTION.primaryColor), "primary must be #FBBF24");
  assert.equal(cols[5], hexToAss("#000000"), "outline must be bold black");
  assert.equal(cols[6], "&HFF000000", "back colour must be fully transparent (no box)");
  assert.equal(cols[15], "1", "BorderStyle 1 = outline only, NO background box");
  assert.equal(cols[16], String(CAPTION.outlineWidth));
  assert.equal(cols[18], "2", "alignment 2 = bottom-centre (lower-middle)");
  assert.ok(Number(cols[21]) > 0, "MarginV lifts captions into the lower-middle band");
  assert.equal(CAPTION.primaryColor, "#FBBF24");
  assert.equal(CAPTION.backgroundBox, false);
  assert.match(ass, /\{\\an7[^}]*\}#פרסומת/);
  assert.match(ass, /\{\\an9[^}]*\}AI/);
  assert.match(ass, /LikeLink/);
  assert.match(ass, /לרכישה עכשיו/);
});

test("tts layer targets the fluent free Hebrew voice", () => {
  assert.equal(VOICE.name, "he-IL-AvriNeural");
  assert.match(VOICE.name, /^he-IL-/);
});

test("background fetch uses pure aesthetic lifestyle keywords + portrait files", () => {
  assert.ok(AESTHETIC_KEYWORDS.length >= 6);
  for (const kw of AESTHETIC_KEYWORDS) assert.match(kw, /^[a-z0-9 ]+$/i);
  assert.equal(new Set(pickKeywords(4)).size >= 2, true);
  const file = pickVideoFile({ video_files: [
    { link: "https://a/low.mp4", width: 640, height: 360 },
    { link: "https://a/vert.mp4", width: 720, height: 1280, file_type: "video/mp4" },
  ] });
  assert.equal(file.link, "https://a/vert.mp4");
});

test("renderer burns captions and animates the closing CTA button", () => {
  const args = buildRenderArgs({
    clips: ["tmp/luna-reels/bg/bg-01.mp4", "tmp/luna-reels/bg/bg-02.mp4"],
    audio: "tmp/luna-reels/narration.mp3",
    assPath: path.join(ROOT, "tmp", "luna-reels", "captions.ass"),
    out: "out/luna-reels/reel.mp4",
    mainSec: 9,
    closingSec: 2.8,
  });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, /subtitles=/);
  assert.match(graph, /drawbox=.*enable='gte\(t,9\.350\)'/);
  assert.match(graph, /concat=n=2:v=1:a=0\[cat\]/);
  assert.ok(args.includes("-stream_loop"));
  assert.ok(args.includes("+faststart"));
});

test("autonomy + deployment wiring: crons, secrets and static publish", () => {
  const reels = read(".github/workflows/luna-reels.yml");
  assert.match(reels, /cron: "0 8 \* \* \*"/);
  assert.match(reels, /cron: "0 17 \* \* \*"/);
  assert.match(reels, /PEXELS_API_KEY/);
  assert.match(reels, /he-IL-AvriNeural/);
  assert.deepEqual(SCHEDULE, ["0 8 * * *", "0 17 * * *"]);

  const deploy = read(".github/workflows/deploy-frontend.yml");
  assert.match(deploy, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(deploy, /npm run build/);
  assert.match(deploy, /gh-pages/);

  assert.equal(JSON.parse(read("package.json")).homepage, "https://github.io");
});
