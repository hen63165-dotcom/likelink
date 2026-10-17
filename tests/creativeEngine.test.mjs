// The Creative Engine (src/lib/creative/engine.js, scripts/creative/,
// .github/workflows/creative-engine.yml): product → video with no paid
// credits. These tests pin: the zero-paid-credit mode, product validation,
// media rights (only the product's own, checked media), the character
// registry, claim-free scripts, idempotent jobs with bounded retries, QC on
// the real file, the live proof, and how the site labels the result.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHARACTER_NEVER, JOB, MAX_ATTEMPTS, MODES, PROVIDERS, QC_LIMITS, TEMPLATES, buildScript, checkProviders, classifyProduct,
  discoverMedia, emptyLedger, engineMode, fingerprint, getCharacter, liveProof, markFailed, markRendered, markStored,
  planProduct, qcVerdict, reconcile, registerCharacter, updateJob, validateProduct,
} from "../src/lib/creative/engine.js";
import { STORE_GALLERY_PICKS, cleanImage, galleryPicks } from "../src/lib/looks.js";
import { FEED_LOOKS, REELS_FEED_HOME, SELLER_SKIP, feedLook, feedToVideos } from "../src/lib/reelsFeed.js";
import { lookbookReels } from "../scripts/reels-feed.mjs";
import { photoFilter, segments, totalSeconds } from "../scripts/creative/lookbook.mjs";
import { REEL_STYLE_LABELS, buildPublicGraph } from "../src/lib/publicDiscovery.js";
import { CREATIVE_CLASS } from "../src/lib/media/videoCapability.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const snap = JSON.parse(read("public/snapshot/kv.json")).keys;
const products = snap["marketplace:products"];
const byId = (id) => products.find((p) => p.id === id);
const ALL_CLIPS = new Set(["p-live-02", "p-live-03", "p-live-04", "p-live-05"]);

test("zero paid credits: every template runs on free providers; a paid or unknown provider is refused before any work", () => {
  assert.equal(engineMode({}), MODES.ZERO_PAID_CREDITS, "the default mode");
  assert.equal(engineMode({ CREATIVE_MODE: "anything" }), MODES.ZERO_PAID_CREDITS);
  for (const [id, t] of Object.entries(TEMPLATES)) assert.ok(checkProviders(t.providers).ok, `${id} uses only free providers`);
  for (const paid of ["openai_images", "elevenlabs", "replicate_video", "kling", "manymotions_ugc"]) {
    assert.equal(PROVIDERS[paid].paid, true);
    const r = checkProviders(["ffmpeg", paid]);
    assert.equal(r.ok, false);
    assert.deepEqual(r.refused, [{ provider: paid, reason: "paid_provider_in_zero_credit_mode" }]);
  }
  assert.equal(checkProviders(["some_new_api"]).refused[0].reason, "unknown_provider", "nothing unverified is assumed free");
  // The runner and its workflow never read a paid provider's key.
  const code = read("scripts/creative/run.mjs") + read("scripts/creative/lookbook.mjs") + read("src/lib/creative/engine.js") + read(".github/workflows/creative-engine.yml");
  assert.doesNotMatch(code, /OPENAI_API_KEY|ELEVENLABS|REPLICATE_API|KLING_|MANYMOTIONS/);
  assert.match(read(".github/workflows/creative-engine.yml"), /CREATIVE_MODE: ZERO_PAID_CREDITS/);
});

test("validation: only a listed product with its own store link gets a video", () => {
  assert.equal(validateProduct(byId("p-live-01"), products).ok, true);
  assert.deepEqual(validateProduct({ ...byId("p-live-01"), status: "pending" }, products).issues, ["not_approved"]);
  assert.ok(validateProduct({ ...byId("p-live-01"), affiliateUrl: "" }, products).issues.includes("no_affiliate_url"));
  const twin = { ...byId("p-live-05"), id: "p-twin", affiliateUrl: byId("p-live-01").affiliateUrl };
  assert.ok(validateProduct(byId("p-live-01"), [...products, twin]).issues.includes("not_promotable"), "a link shared by two products leads to neither");
  assert.equal(planProduct({ ...byId("p-live-01"), status: "pending" }, { products }).stage, "validation");
});

test("media rights: only the product's own checked gallery photos (via the affiliate API) and a seller clip a person checked", () => {
  const p1 = byId("p-live-01");
  const m = discoverMedia(p1, { sellerVideos: ALL_CLIPS });
  assert.equal(m.photos.length, STORE_GALLERY_PICKS["p-live-01"].length);
  for (const ph of m.photos) {
    assert.ok(p1.images.includes(ph.url), "every photo is in the product's own gallery");
    assert.equal(ph.rights, "store_listing_media_via_affiliate_api");
  }
  assert.equal(m.video, null, "no seller clip on hand for p-live-01");
  // Not from the affiliate API → no photo.
  assert.equal(discoverMedia({ ...p1, priceSource: "" }).photos.length, 0);
  // A photo no longer in the product's gallery is not used.
  assert.deepEqual(galleryPicks({ ...p1, images: [p1.images[0]] }).map((g) => g.url), [p1.images[0]]);
  // The seller's clip of p-live-02 shows a necklace: refused; p-live-05's clip was checked by a person.
  assert.ok(SELLER_SKIP["p-live-02"]);
  assert.deepEqual(discoverMedia(byId("p-live-02"), { sellerVideos: ALL_CLIPS }).rejected, [{ media: "seller-video:p-live-02", reason: "clip_shows_another_item" }]);
  assert.equal(discoverMedia(byId("p-live-05"), { sellerVideos: ALL_CLIPS }).video.rights, "store_listing_video");
  assert.equal(discoverMedia({ ...byId("p-live-05"), id: "p-unchecked" }, { sellerVideos: new Set(["p-unchecked"]) }).rejected[0].reason, "clip_not_checked_by_a_person");
});

test("the catalog's plans: a lookbook only with a worn photo; otherwise the product stays with Luna's engine, with the reason", () => {
  const plans = Object.fromEntries(["p-live-01", "p-live-02", "p-live-03", "p-live-04", "p-live-05"].map((id) => [id, planProduct(byId(id), { products, sellerVideos: ALL_CLIPS })]));
  assert.equal(plans["p-live-01"].look, "lookbook_photos");
  assert.equal(plans["p-live-02"].look, "lookbook_photos", "photos only: its clip shows another item");
  assert.equal(plans["p-live-04"].look, "lookbook");
  assert.equal(plans["p-live-05"].look, "lookbook");
  assert.equal(plans["p-live-03"].ok, false);
  assert.equal(plans["p-live-03"].reason, "no_worn_photo_checked");
  assert.deepEqual(plans["p-live-03"].delegate, { template: "luna_tip", executor: "luna_reels", character: "luna" });
  for (const p of Object.values(plans).filter((x) => x.ok)) {
    assert.equal(p.character, null, "no character: the model in the photos is the seller's, never presented as a creator or a buyer");
    assert.equal(p.media.photos[0].kind, "worn", "the item worn leads");
    assert.equal(p.mode, MODES.ZERO_PAID_CREDITS);
    assert.equal(p.asset, `${p.productId}-lookbook`);
    assert.equal(classifyProduct(byId(p.productId)), "jewelry");
  }
});

test("scripts: scene words and the product's own name only — no number, price, claim or superlative; the disclosure and whose media", () => {
  for (const p of products) {
    for (const withVideo of [false, true]) {
      const s = buildScript(p, { withVideo });
      assert.doesNotMatch(s.opening.text, /[\d₪%]|הנחה|מבצע|הכי|מושלם|יהלום|אמיתי|כולם|נגמר|קניתי/, s.opening.text);
      assert.ok(s.opening.text.length <= 40);
      assert.equal(s.labels[0], "#פרסומת · קישור שותפים");
      assert.equal(s.labels[1], withVideo ? "תמונות וסרטון: המוכר" : "תמונות: המוכר");
      assert.doesNotMatch(s.name, /\n/);
    }
  }
  const plan = planProduct(byId("p-live-05"), { products, sellerVideos: ALL_CLIPS });
  assert.match(plan.caption, /^#פרסומת · קישור שותפים: /m);
  assert.match(plan.caption, /תמונות וסרטון המוצר|תמונות וסרטון: המוכר, מעמוד המוצר בחנות/);
  assert.doesNotMatch(plan.caption, /UGC|צילום אמיתי|ניסיתי|קניתי/);
});

test("characters: a presenter needs its own assets, a voice, suitability, templates and — when virtual — a label; Luna is registered", () => {
  const luna = getCharacter("luna");
  assert.ok(luna);
  assert.equal(luna.kind, "virtual");
  assert.match(luna.disclosure.he, /דמות AI/);
  assert.match(read("scripts/luna_reels/assets/luna.png").slice(1, 4), /PNG/, "her asset is a real file in the repo");
  for (const rule of CHARACTER_NEVER) assert.ok(luna.never.includes(rule));
  assert.deepEqual(registerCharacter({ id: "x", name: "X", kind: "virtual", personality: "p", assets: ["a.png"], voice: {}, suitability: { Other: 1 }, templates: ["luna_tip"] }), { ok: false, missing: ["disclosure"] });
  assert.equal(registerCharacter({ id: "y" }).ok, false);
  assert.equal(getCharacter("y"), null);
});

test("jobs: idempotent (same inputs → reused), a changed product supersedes, retries back off and stop at the dead letter, a run is bounded", () => {
  const plans = ["p-live-01", "p-live-02", "p-live-04", "p-live-05"].map((id) => planProduct(byId(id), { products, sellerVideos: ALL_CLIPS }));
  assert.equal(fingerprint({ a: 1 }), fingerprint({ a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
  assert.equal(planProduct(byId("p-live-05"), { products, sellerVideos: ALL_CLIPS }).key, plans[3].key, "the same inputs, the same key");

  let r = reconcile(emptyLedger(), plans, { now: 1000, limit: 3 });
  assert.equal(r.due.length, 3);
  assert.deepEqual(r.waiting.map((w) => w.reason), ["run_limit"]);
  let ledger = r.ledger;
  const [a, b] = r.due;
  ledger = updateJob(ledger, a, (j) => markStored(markRendered(j, { bytes: 10 }, { pass: true }, 1100), { bytes: 10 }, 1200));
  ledger = updateJob(ledger, b, (j) => markFailed(j, new Error("render: ffmpeg exited 1"), 1100));
  r = reconcile(ledger, plans, { now: 1300, limit: 5 });
  assert.ok(r.reused.includes(a), "stored → reused, never rendered twice");
  assert.ok(r.waiting.some((w) => w.id === b && w.reason === "backoff"), "a failure waits for its backoff");
  r = reconcile(ledger, plans, { now: 1100 + 2 * 3_600_000, limit: 5 });
  assert.ok(r.due.includes(b), "and is retried after it");

  // Out of attempts → dead letter; an input problem is not retried at all.
  let job = ledger.jobs.find((j) => j.id === b);
  for (let i = 1; i < MAX_ATTEMPTS; i++) job = markFailed(job, new Error("render: timeout"), 5000 + i);
  assert.equal(job.status, JOB.DEAD);
  assert.equal(job.attempts, MAX_ATTEMPTS);
  assert.equal(markFailed({ attempts: 0, history: [] }, new Error("no_media: 404")).status, JOB.DEAD);

  // A changed product (new photo order or title) → a new job; the old one is superseded.
  const changed = planProduct({ ...byId("p-live-05"), title: `${byId("p-live-05").title} חדש` }, { products, sellerVideos: ALL_CLIPS });
  r = reconcile(ledger, [changed], { now: 9000 });
  assert.equal(r.due[0], `cj_${changed.key}`);
  assert.equal(r.ledger.jobs.filter((j) => j.productId === "p-live-05" && j.status !== JOB.SUPERSEDED).length, 1);
  for (const j of r.ledger.jobs) assert.ok(j.history.length >= 1 && j.createdAt && j.updatedAt, "every job keeps its timestamps and history");
});

const probe = (over = {}) => ({
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, pix_fmt: "yuv420p", ...over.v },
    ...(over.noAudio ? [] : [{ codec_type: "audio", codec_name: "aac", sample_rate: "48000" }]),
  ],
  format: { duration: "13.15", size: "4519121", ...over.f },
});

test("QC: the real file must be H.264 1080×1920 with AAC 48 kHz, a sane length, visible frames and real motion — a still is not a video", () => {
  assert.equal(qcVerdict(probe(), { luma: [200, 123, 199], motion: 9.6 }).pass, true);
  const fails = (p, s) => qcVerdict(p, s).checks.filter((c) => !c.pass).map((c) => c.name);
  assert.deepEqual(fails(probe(), { luma: [200, 200, 200], motion: 0 }), ["motion"]);
  assert.deepEqual(fails(probe({ v: { width: 720, height: 1280 } }), { luma: [120, 120, 120], motion: 3 }), ["size_1080x1920"]);
  assert.deepEqual(fails(probe({ noAudio: true }), { luma: [120, 120, 120], motion: 3 }), ["audio_aac_48k"]);
  assert.deepEqual(fails(probe(), { luma: [3, 4, 5], motion: 3 }), ["not_black_or_white"]);
  assert.deepEqual(fails(probe({ f: { duration: "4" } }), { luma: [120, 120, 120], motion: 3 }), ["duration"]);
  assert.ok(QC_LIMITS.minMotion > 0);
});

test("live proof: LIVE only when the site's reels feed lists it, labelled, and serves the stored bytes", () => {
  const job = { productId: "p-live-05", look: "lookbook", release: { bytes: 4519121 } };
  const feed = { reels: [{ id: "lookbook-p-live-05", productId: "p-live-05", video: "lookbook-p-live-05.mp4", look: "lookbook", labels: ["#פרסומת · קישור שותפים", "תמונות וסרטון: המוכר"] }] };
  assert.deepEqual(liveProof(feed, job, 4519121), { live: true, feedId: "lookbook-p-live-05", video: "lookbook-p-live-05.mp4", bytes: 4519121 });
  assert.equal(liveProof({ reels: [] }, job, 4519121).reason, "not_in_feed");
  assert.equal(liveProof(feed, job, 100).reason, "served_size_differs");
  assert.equal(liveProof({ reels: [{ ...feed.reels[0], labels: ["x"] }] }, job, 4519121).reason, "no_disclosure_label");
});

test("on the site: a lookbook is the seller's media in LikeLink2's edit — never AI, never UGC, never 'real'; its shop clicks are tracked", () => {
  const listed = new Set(["p-live-05", "p-live-01"]);
  const meta = { product: { id: "p-live-05" }, look: "lookbook", synthetic: false, labels: ["#פרסומת · קישור שותפים", "תמונות וסרטון: המוכר"], seconds: 13.2 };
  const asset = (name) => ({ name, url: `https://api.example/${name}`, updated_at: "2026-10-17T05:00:00Z" });
  const picked = lookbookReels([asset("p-live-05-lookbook.mp4"), asset("p-live-01-lookbook.mp4"), asset("p-gone-lookbook.mp4")], listed, new Map([["p-live-05", meta], ["p-live-01", { ...meta, product: { id: "p-live-01" }, labels: ["תמונות: המוכר"] }]]));
  assert.deepEqual(picked.map((r) => r.productId), ["p-live-05"], "no details, no ad label or an unlisted product → left out");
  const [v] = feedToVideos({ reels: [picked[0].entry] }, REELS_FEED_HOME);
  assert.equal(v.style, "seller_lookbook");
  assert.equal(v.synthetic, false);
  assert.notEqual(v.humanFilmed, true);
  const graph = buildPublicGraph({ products, marketers: snap["marketplace:marketers"], collections: [], clicks: [], videos: [v] });
  const reel = graph.reels.find((r) => r.id === "v-lookbook-p-live-05");
  assert.ok(reel, "it reaches the product page's reels");
  assert.equal(reel.creativeClass, CREATIVE_CLASS.REAL_PRODUCT_VIDEO);
  for (const style of ["seller_lookbook", "seller_photo_reel"]) {
    assert.match(REEL_STYLE_LABELS[style].he, /המוכר · בעריכת LikeLink2/);
    assert.doesNotMatch(REEL_STYLE_LABELS[style].he, /אמיתי|UGC|AI/);
  }
  const kit = read("src/components/discover/kit.jsx");
  assert.match(kit, /style === "seller_lookbook" \|\| style === "seller_photo_reel"\)\) return null/, "no generic 'real video' badge on it");
  assert.match(kit, /attribution=\{attribution \|\| \{ src: "likelink_posts", camp: reel\.id \}\}/, "the shop button carries the video's id");
  // Every reader of the feed labels it the same way; an unknown look is the strictest (AI).
  assert.equal(feedLook("lookbook").ai, false);
  assert.equal(feedLook("whatever").ai, true);
  assert.match(FEED_LOOKS.lookbook.note, /המוכר/);
});

test("the home page and the cards show the item worn by the seller's model, named as the seller's photo", () => {
  const p5 = byId("p-live-05");
  assert.deepEqual(cleanImage(p5), { src: STORE_GALLERY_PICKS["p-live-05"][0].url, source: "seller_photo" });
  assert.equal(cleanImage({ id: "p-live-05" }).source, "seller_video", "without its gallery: the clean video frame");
  const luxe = read("src/components/discover/luxe.jsx");
  assert.match(luxe, /galleryPicks\(p\)\.filter\(\(g\) => g\.kind !== "flat"/, "the collage is filled with worn and held photos");
  assert.match(read("src/lib/looks.js"), /seller_photo: Object\.freeze\(\{ he: "תמונת המוכר"/);
});

test("the lookbook template: framed photos with a smooth (oversampled) camera move, a length inside QC", () => {
  for (const withVideo of [true, false]) {
    const segs = segments(["a.jpg", "b.jpg", "c.jpg"], withVideo);
    const t = totalSeconds(segs);
    assert.ok(t >= QC_LIMITS.minSeconds && t <= QC_LIMITS.maxSeconds, `${t} s`);
    assert.equal(segs[0].text, "opening");
    assert.equal(segs.at(-1).text, "end");
    assert.equal(segs.some((s) => s.kind === "video"), withVideo);
  }
  assert.match(photoFilter({ seconds: 2.4, zoom: [1, 1.07] }), /scale=4320:4320.*zoompan=z='1\+\(0\.0700\)\*on\/71'.*s=1080x1080:fps=30/);
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
test("a real render: one framed photo segment is a playable H.264 file with motion", { skip: hasFfmpeg ? false : "ffmpeg is not installed here (the Creative engine workflow installs it)" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "creative-"));
  const img = join(dir, "in.png");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=800x800:d=1", "-frames:v", "1", img]);
  const out = join(dir, "seg.mp4");
  const seg = { seconds: 1.2, zoom: [1, 1.08], photo: img };
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0xF4EFE8:s=1080x1920:r=30:d=1.2", "-i", img, "-filter_complex", `[1:v]${photoFilter(seg)}[ph];[0:v][ph]overlay=0:400:shortest=1[v]`, "-map", "[v]", "-t", "1.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
  const p = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", out], { encoding: "utf8" }));
  assert.equal(p.streams[0].codec_name, "h264");
  assert.equal(p.streams[0].width, 1080);
  const diffs = execFileSync("ffmpeg", ["-v", "error", "-i", out, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-", "-f", "null", "-"], { encoding: "utf8" });
  const motion = [...diffs.matchAll(/YDIF=([\d.]+)/g)].map((m) => Number(m[1])).slice(1);
  assert.ok(motion.some((d) => d > 0), "the camera moves");
  writeFileSync(join(dir, "ok"), "1");
});
