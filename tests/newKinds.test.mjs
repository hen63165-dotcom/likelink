// New kinds by meaning (src/lib/growth/newKinds.js; the owner, 2026-11-20: "כן לשתיהן"). An open sentence
// model groups the fresh pool's new listings by meaning; a kind is ≥ 3 different new listings whose
// MEDIAN weekly growth is ≥ 25% (one viral listing cannot fake it), still small, never a brand or a
// kind the watch list names. Every kind shown is a call, graded after 14 days and sealed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KINDS, gradeKinds, groupByMeaning, kindCandidates, kindLabel, kindsRecord, kindsSealText, newKinds, recordKinds } from "../src/lib/growth/newKinds.js";
import { packVector, poolVectors, unpackVector } from "../scripts/catalog/radar-embed.mjs";
import { admitDiscovered } from "../src/lib/growth/radarDiscovery.js";

const near = (base, k) => base.map((x, i) => x + (i === k ? 0.05 : 0));
const A = [1, 0, 0, 0];
const B = [0, 1, 0, 0];
const series = (a, b) => [["2026-11-12", a], ["2026-11-19", b]];
const entry = (id, title, orders, extra = {}) => ({ id, title, orders, image: "https://ae-pic-a1.aliexpress-media.com/kf/x.jpg", link: "https://s.click.aliexpress.com/e/_x", category: "earrings", first: "2026-11-10", seen: "2026-11-19", ...extra });

test("listings are grouped by meaning, not by shared words", () => {
  assert.deepEqual(groupByMeaning([A, near(A, 1), B, near(A, 2), near(B, 0)]), [[0, 1, 3], [2, 4]]);
  assert.deepEqual(groupByMeaning([A, [], B]), [[0], [2]], "a listing without a vector is left out");
});

test("a new kind needs three new listings growing together, by their median", () => {
  const pool = {
    "1001": entry("1001", "Magnetic Ear Cuff No Piercing Crystal", 400),
    "1002": entry("1002", "Women Magnetic Ear Cuff Clip Earring", 300),
    "1003": entry("1003", "Magnetic Ear Cuff Rhinestone Clip", 200),
    "2001": entry("2001", "Silicone Kitchen Spatula", 900),
    "2002": entry("2002", "Kitchen Spatula Heat Resistant", 800),
  };
  const vectors = { "1001": A, "1002": near(A, 1), "1003": near(A, 2), "2001": B, "2002": near(B, 0) };
  const items = { "1001": series(200, 400), "1002": series(200, 300), "1003": series(160, 200), "2001": series(100, 900), "2002": series(100, 800) };
  const kinds = newKinds(pool, items, vectors);
  assert.equal(kinds.length, 1, "two listings are not a kind, however fast");
  const k = kinds[0];
  assert.equal(k.en, "ear cuff", "the shortest phrase all three share");
  assert.deepEqual(k.members, ["1001", "1002", "1003"]);
  assert.equal(k.medianWeekPct, 50, "the median member (+50%), never the fastest (+100%)");
  assert.equal(k.orders, 900);
  assert.deepEqual(k.bases, { "1001": 400, "1002": 300, "1003": 200 });
  assert.equal(k.kind, "earrings");
  assert.equal(k.samples[0].id, "1001");
  // one viral listing among two flat ones: no kind
  const flat = { ...items, "1002": series(300, 300), "1003": series(200, 200) };
  assert.equal(newKinds(pool, flat, vectors).length, 0);
  // the watch list already names it: not a new kind
  assert.equal(newKinds(pool, items, vectors, { concepts: [{ id: "x", en: "magnetic ear cuff" }] }).length, 0);
  // a brand in a member's title: never
  const branded = { ...pool, "1002": entry("1002", "Pandora Magnetic Ear Cuff Clip", 300) };
  assert.equal(newKinds(branded, items, vectors).length, 0);
  // too big together: no longer new
  const big = { "1001": series(10_000, 20_000), "1002": series(5_000, 9_000), "1003": series(3_000, 5_000) };
  assert.equal(newKinds(pool, big, vectors).length, 0);
});

test("the kind's name is in the store's own words, shared by at least two of its listings", () => {
  assert.equal(kindLabel(["Cloud Slides Pillow Soft", "Women Cloud Slides Thick", "Slipper Cloud Slides"]), "cloud slides");
  assert.equal(kindLabel(["Alpha Beta", "Gamma Delta"]), null);
});

test("each kind shown is a call: graded on the same listings after 14 days, sealed, never edited", () => {
  const kinds = [{ en: "ear cuff", members: ["1001", "1002"], orders: 700, bases: { "1001": 400, "1002": 300 } }];
  let calls = recordKinds([], kinds, "2026-11-20");
  assert.deepEqual(calls, [{ en: "ear cuff", at: "2026-11-20", bases: { "1001": 400, "1002": 300 }, base: 700, due: "2026-12-04", f: { members: 2, median: null, orders: 700, category: "" }, v: 1 }]);
  assert.equal(recordKinds(calls, kinds, "2026-11-21").length, 1, "one open call per kind");
  const items = { "1001": [["2026-12-04", 700]], "1002": [["2026-12-04", 400]] };
  assert.equal(gradeKinds(calls, items, "2026-12-03")[0].result, undefined, "not before its day");
  const graded = gradeKinds(calls, items, "2026-12-04");
  assert.equal(graded[0].result, "HIT");
  assert.equal(graded[0].growth, 57.1);
  assert.deepEqual(gradeKinds(graded, { "1001": [["2026-12-05", 1]] }, "2026-12-05"), graded, "a graded call is never edited");
  assert.equal(gradeKinds(calls, { "1001": [["2026-12-04", 900]] }, "2026-12-05")[0].result, undefined, "a listing not read yet: wait");
  const late = gradeKinds(calls, { "1001": [["2026-12-04", 500]] }, "2026-12-07")[0];
  assert.equal(late.result, "MISS", "three days late: graded on what was read, each against its own base");
  assert.equal(late.growth, 25);
  assert.deepEqual(kindsRecord(graded), { calls: 1, graded: 1, hits: 1, accuracy: 100, pending: 0, nextDue: null });
  assert.equal(kindsSealText(graded), "ear cuff|2026-11-20|1001+1002|700|2026-12-04|HIT");
  assert.equal(kindsSealText([]), null);
});

test("the strongest kinds join the radar as trial concepts, marked as found by meaning", () => {
  const cands = kindCandidates([{ en: "magnetic ear", members: ["1", "2", "3"], orders: 900, category: "earrings", kind: "earrings" }]);
  const admitted = admitDiscovered([], cands, { now: Date.parse("2026-11-20T06:00:00Z") });
  assert.equal(admitted[0].id, "auto-magnetic-ear");
  assert.equal(admitted[0].why.via, "meaning");
  assert.equal(KINDS.admit, 3);
});

test("vectors are kept between runs; only new titles are embedded", async () => {
  const v = unpackVector(packVector([3, 4]));
  assert.ok(Math.abs(v[0] - 0.6) < 0.01 && Math.abs(v[1] - 0.8) < 0.01);
  let asked = [];
  const load = async () => async (texts) => { asked.push(...texts); return texts.map((t) => (t.includes("ear") ? [1, 0] : [0, 1])); };
  const pool = { a: { id: "a", title: "ear cuff" }, b: { id: "b", title: "spatula" } };
  const first = await poolVectors(pool, {}, { load });
  assert.equal(first.embedded, 2);
  asked = [];
  const second = await poolVectors({ ...pool, c: { id: "c", title: "ear clip" } }, first.cache, { load });
  assert.deepEqual(asked, ["ear clip"], "kept vectors are not embedded again");
  assert.equal(Object.keys(second.vectors).length, 3);
  const dropped = await poolVectors({ c: pool.b }, second.cache, { load });
  assert.deepEqual(Object.keys(dropped.cache.vecs), ["b"], "the cache keeps only listings still in the pool");
});

test("wiring: the model is installed on the radar runner only, and its book is in the daily root", () => {
  const wf = readFileSync(".github/workflows/trend-radar.yml", "utf8");
  assert.match(wf, /npm install --no-save --no-audit --no-fund @huggingface\/transformers@4\.3\.1/);
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(!pkg.dependencies?.["@huggingface/transformers"] && !pkg.devDependencies?.["@huggingface/transformers"], "never shipped with the site");
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /kinds: board\.kinds\?\.seal\?\.sha256/);
  assert.match(run, /RADAR_KINDS !== "0"/);
});

test("a kind reaches the page only with its 'nobody heard of it yet' check (20.11: Christmas ornaments were saturated)", async () => {
  const { sanitizeBoard } = await import("../src/lib/growth/radarBoard.js");
  const sample = { id: "1005000000000001", title: "Magnetic Ear Cuff", image: "https://ae-pic-a1.aliexpress-media.com/kf/x.jpg", buy: "https://s.click.aliexpress.com/e/_x", orders: 400, weekPct: 100 };
  const kind = { en: "ear cuff", members: ["1005000000000001", "1005000000000002", "1005000000000003"], measured: 3, medianWeekPct: 50, orders: 900, samples: [sample] };
  const board = (list) => sanitizeBoard({ v: 2, at: "2026-11-20T06:00:00Z", record: {}, concepts: [], kinds: { model: "m", tracked: 6000, list } });
  assert.equal(board([kind]).kinds.list.length, 0, "unchecked: hidden");
  const shown = board([{ ...kind, known: { similar: 640 } }]).kinds.list[0];
  assert.deepEqual([shown.en, shown.known.similar, shown.members], ["ear cuff", 640, 3]);
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /unknownCheck\(\{ phrase: k\.en, similar, suggestions \}\)/);
});

// 👁️ The same look (21.11, past Heuritech: it reads what people already post; the radar reads the
// store photos of new listings before anyone wears them). Fast listings only, photos grouped when
// they look alike, the same rules as the kinds by meaning, merged without repeating a kind.
test("looks: only growing listings are looked at; look groups join the kinds without repeating one", async () => {
  const { KINDS, lookCandidates, mergeLooks, newKinds } = await import("../src/lib/growth/newKinds.js");
  const pool = {};
  const items = {};
  const add = (id, title, before, now) => {
    pool[id] = { id, title, image: `https://ae01.alicdn.com/kf/${id}.jpg`, link: `https://s.click.aliexpress.com/e/_${id}`, category: "home", first: "2026-11-10", orders: now };
    items[id] = [["2026-11-14", before], ["2026-11-21", now]];
  };
  add("1005005000001", "Ripple Glass Vase Wavy Flower", 40, 80);
  add("1005005000002", "Wavy Ripple Glass Vase Modern", 50, 90);
  add("1005005000003", "Ripple Glass Vase Bud Wavy", 60, 100);
  add("1005005000004", "Desk Organizer Plain", 100, 101); // slow: never looked at
  const cands = lookCandidates(pool, items);
  assert.deepEqual(cands.map((e) => e.id).sort(), ["1005005000001", "1005005000002", "1005005000003"]);
  // Three photos that look alike (cosine ≥ lookSim), whatever their titles say.
  const v = (x) => [1, x, 0, 0];
  const vectors = { "1005005000001": v(0.1), "1005005000002": v(0.12), "1005005000003": v(0.08) };
  const looks = newKinds(Object.fromEntries(cands.map((e) => [e.id, e])), items, vectors, { rules: { ...KINDS, sim: KINDS.lookSim, minOrders: 200 } });
  assert.equal(looks.length, 1);
  assert.equal(looks[0].en, "glass vase");
  const merged = mergeLooks([], looks);
  assert.equal(merged[0].via, "look");
  // The same thing found by meaning first is kept once, as meaning.
  assert.deepEqual(mergeLooks([{ ...looks[0], via: undefined }], looks).map((k) => k.via), ["meaning"]);
});

test("looks: the photo vectors are kept between runs; a photo that fails is skipped, never guessed", async () => {
  const { poolImageVectors, thumbUrl } = await import("../scripts/catalog/radar-embed.mjs");
  assert.equal(thumbUrl("https://ae01.alicdn.com/kf/S1.jpg"), "https://ae01.alicdn.com/kf/S1.jpg_350x350.jpg");
  assert.equal(thumbUrl("https://ae01.alicdn.com/kf/S1.jpg_220x220.jpg"), "https://ae01.alicdn.com/kf/S1.jpg_220x220.jpg");
  const asked = [];
  const load = async () => async (url) => { asked.push(url); if (url.includes("bad")) throw new Error("photo 404"); return [0.6, 0.8]; };
  const entries = [{ id: "1", image: "https://ae01.alicdn.com/kf/a.jpg" }, { id: "2", image: "https://ae01.alicdn.com/kf/bad.jpg" }];
  const first = await poolImageVectors(entries, {}, { load, model: "m" });
  assert.equal(first.embedded, 1);
  assert.equal(first.failed, 1);
  assert.deepEqual(Object.keys(first.vectors), ["1"]);
  const again = await poolImageVectors(entries.slice(0, 1), first.cache, { load, model: "m" });
  assert.equal(again.embedded, 0);
  assert.equal(asked.length, 2);
});

test("kinds: the members' orders together must grow beyond counting noise (21.11)", async () => {
  const { KINDS, newKinds } = await import("../src/lib/growth/newKinds.js");
  const pool = {};
  const items = {};
  const add = (id, title, before, now) => {
    pool[id] = { id, title, image: `https://ae01.alicdn.com/kf/${id}.jpg`, link: `https://s.click.aliexpress.com/e/_${id}`, category: "home", first: "2026-11-10", orders: now };
    items[id] = [["2026-11-14", before], ["2026-11-21", now]];
  };
  // Three tiny listings at +50% each and one big flat one: the median says +50%, together it is noise.
  add("1005006000001", "Ripple Glass Vase Wavy", 4, 6);
  add("1005006000002", "Wavy Ripple Glass Vase", 4, 6);
  add("1005006000003", "Ripple Glass Vase Bud", 4, 6);
  add("1005006000004", "Ripple Glass Vase Big", 300, 300);
  const v = { "1005006000001": [1, 0.1], "1005006000002": [1, 0.11], "1005006000003": [1, 0.09], "1005006000004": [1, 0.1] };
  assert.equal(newKinds(pool, items, v, { rules: { ...KINDS, minOrders: 100 } }).length, 0);
});
