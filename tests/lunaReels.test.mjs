import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildAss, buildCues, chunkWords, hexToAss } from "../scripts/luna-reels/captions.mjs";
import { VOICE, CAPTION, CORNER_TAGS, AESTHETIC_KEYWORDS, BRAND, CANONICAL, HOOK_TEMPLATES, REELS, SCHEDULE, SCRIPTS, TRENDING_CATEGORIES, TRUST_FILTER, categoryRank, passesTrustFilter, pickScript, rankSourcingQueue } from "../scripts/luna-reels/config.mjs";
import { pickVideoFile, pickKeywords } from "../scripts/luna-reels/fetch-background.mjs";
import { pickProductImages } from "../scripts/luna-reels/storefront.mjs";
import { buildRenderArgs } from "../scripts/luna-reels/render.mjs";

test("canonical domain and daily volume are wired for likelink.to", () => {
  assert.equal(CANONICAL.origin, "https://likelink.to");
  assert.equal(CANONICAL.snapshotPath, "/snapshot/kv.json");
  assert.ok(!/github|netlify/i.test(CANONICAL.origin), "no github/netlify text in the canonical origin");
  assert.equal(BRAND.domain, "likelink.to");
  assert.equal(BRAND.outro, "גלו מה שווה לקנות דרך אנשים - בקליק אחד, אמין ומאובטח ב-LikeLink");
  assert.equal(REELS.perDay, 6);
  assert.equal(REELS.perRun, 3);
});

test("scripts are viral hooks only — FOMO, zero product description", () => {
  assert.ok(HOOK_TEMPLATES.length >= 6);
  const kinds = HOOK_TEMPLATES.map((t) => t.kind);
  assert.ok(kinds.includes("הסוד הצרכני"));
  assert.ok(kinds.includes("פתרון כאוס הקישורים"));
  assert.ok(HOOK_TEMPLATES.some((t) => /המפעל הסודי/.test(t.text)), "secret-factory hook present");
  assert.ok(HOOK_TEMPLATES.some((t) => /שברה את הרשת/.test(t.text)), "viral-unboxing hook present");
  for (const t of HOOK_TEMPLATES) {
    assert.equal(typeof t.text, "string");
    assert.ok(t.text.length > 40, `${t.id} must be a full TTS script`);
    assert.ok(/פראייר|מבצע|מלאי|נגמר|תפספס|אלפי|לינק|קליק אחד|אמין ומאובטח|מחיר/.test(t.text), `${t.id} must carry a conversion trigger`);
    assert.ok(!/מפרט|מידות|צבעים|דגם|SKU|משקל/i.test(t.text), `${t.id} must not be descriptive copy`);
    assert.ok(t.text.includes("לייקלינק") || t.text.includes("LikeLink"), `${t.id} closes on the platform`);
  }
  assert.deepEqual(SCRIPTS, HOOK_TEMPLATES.map((t) => t.text));
  // Deterministic rotation stays in bounds for every reel slot of a run.
  for (const seed of [0, 1, 5, 6, 7919, Date.now()]) {
    assert.ok(SCRIPTS.includes(pickScript(seed)));
  }
});

test("viral feed sourcing: trending categories rank first, trust gate drops junk", () => {
  assert.deepEqual(TRENDING_CATEGORIES, ["Aesthetic Accessories", "Premium Jewelry", "Modern Lifestyle Gadgets"]);
  assert.ok(TRUST_FILTER.minRating > 4.5 - 1e-9 && TRUST_FILTER.minRating < 4.51, "Choice-grade bar");
  assert.equal(TRUST_FILTER.requireFastDelivery, true);
  const trusted = { active: true, category: "Premium Jewelry", rating: 4.8, fastDelivery: true, reviewCount: 320 };
  assert.equal(passesTrustFilter(trusted), true);
  assert.equal(passesTrustFilter({ ...trusted, rating: 4.4 }), false, "below 4.5 stars is out");
  assert.equal(passesTrustFilter({ ...trusted, fastDelivery: false }), false, "slow shipping is out");
  assert.equal(passesTrustFilter({ ...trusted, reviewCount: 3 }), false, "unreviewed is out");
  assert.equal(passesTrustFilter({ ...trusted, inStock: false }), false, "out of stock is out");
  const queue = rankSourcingQueue({ items: [
    { active: true, category: "Kitchen", rating: 4.9, fastDelivery: true, reviewCount: 900, id: "k" },
    { active: true, category: "Premium Jewelry", rating: 4.7, fastDelivery: true, reviewCount: 120, id: "j" },
    { active: false, category: "Aesthetic Accessories", rating: 5, fastDelivery: true, reviewCount: 500, id: "dead" },
    { active: true, category: "Aesthetic Accessories", rating: 4.6, fastDelivery: true, reviewCount: 80, id: "a" },
    { active: true, category: "Premium Jewelry", rating: 4.4, fastDelivery: true, reviewCount: 999, id: "low" },
  ], limit: 3 });
  assert.deepEqual(queue.map((q) => q.id), ["a", "j", "k"], "trending categories win, junk never queues");
  assert.equal(categoryRank("Modern Lifestyle Gadgets"), 2);
});

test("live storefront images pick approved, real-photo products only", () => {
  const doc = { keys: { "marketplace:products": [
    { id: "p1", status: "approved", title: "שמלה", image: "https://cdn.example/p1.jpg" },
    { id: "p2", status: "draft", image: "https://cdn.example/p2.jpg" },
    { id: "p3", status: "approved" },
    { id: "p4", status: "approved", image: "https://cdn.example/p1.jpg" },
    { id: "p5", status: "approved", image: "https://cdn.example/p5.jpg" },
  ] } };
  assert.deepEqual(pickProductImages(doc, 2).map((p) => p.id), ["p1", "p5"]);
  assert.deepEqual(pickProductImages({}, 3), []);
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

test("captions flash at ultra-high speed: 1–2 words per lower-middle cue", () => {
  const text = "בנות אל תהיו פראייריות המפעל הסודי מוכר בעשרה שקלים";
  const frames = chunkWords(text);
  for (const frame of frames) {
    const count = frame.split(" ").length;
    assert.ok(count >= 1 && count <= 2, `cue must flash 1–2 words: "${frame}"`);
  }
  assert.equal(frames.join(" ").split(" ").length, text.split(" ").length);
  assert.deepEqual(chunkWords("מילה"), ["מילה"]);
  assert.equal(CAPTION.maxWords, 2);
  assert.equal(CAPTION.minWords, 1);
  assert.deepEqual(CAPTION.cueSeconds, [0.45, 0.7]);
  assert.equal(CAPTION.outlineWidth, 7);
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

test("background fetch pulls macro close-ups: jewelry, silk, unboxing", () => {
  assert.ok(AESTHETIC_KEYWORDS.length >= 6);
  for (const kw of AESTHETIC_KEYWORDS) assert.match(kw, /^[a-z0-9 ]+$/i);
  const blob = AESTHETIC_KEYWORDS.join(" | ");
  assert.match(blob, /jewelry/i);
  assert.match(blob, /silk/i);
  assert.match(blob, /unboxing/i);
  assert.ok(!/coffee|ocean|city night|leaves/i.test(blob), "no wide lifestyle filler");
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
  assert.match(reels, /LIKELINK_CANONICAL_URL/);
  assert.match(reels, /likelink\.to/);
  assert.deepEqual(SCHEDULE, ["0 8 * * *", "0 17 * * *"]);

  const deploy = read(".github/workflows/deploy-frontend.yml");
  assert.match(deploy, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(deploy, /npm run build/);
  assert.match(deploy, /gh-pages/);

  assert.equal(JSON.parse(read("package.json")).homepage, "https://likelink.to");
  assert.equal(read("public/CNAME").trim(), "likelink.to");
});
