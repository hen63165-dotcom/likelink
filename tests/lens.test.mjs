// The radar's lens, "Shazam for products" (src/lib/growth/lens.js; the owner, 2026-11-20: "כן לשתיהן"):
// a screenshot is read by an open model IN THE BROWSER (the picture stays on the phone); the answer is
// the kinds it looks like with how sure the model is; only the kind's id is recorded, once per session,
// and the crowd sensor counts kinds photographed by different people.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LENS, firstKindThisSession, lensLabels, rankKinds, unpackVec } from "../src/lib/growth/lens.js";
import { crowdKinds } from "../src/lib/growth/crowdSensor.js";
import { applyStoreWritePolicy } from "../api/_utils/storeWritePolicy.mjs";

test("the lens knows every watch-list kind and every shop category, by id, in Hebrew", () => {
  const labels = lensLabels([{ id: "ear-cuff", he: "עגיל קליפס", en: "ear cuff" }, { id: "bad id", he: "x", en: "y" }, { id: "no-he", en: "z" }], [{ key: "rings", he: "טבעות", keywords: "women ring zircon" }]);
  assert.deepEqual(labels.map((l) => [l.id, l.prompt]), [["ear-cuff", "a photo of ear cuff"], ["category-rings", "a photo of ring zircon"]]);
});

test("the answer says how sure the model is, and never more", () => {
  const labels = [{ id: "aaa", he: "א", vec: [1, 0, 0] }, { id: "bbb", he: "ב", vec: [0, 1, 0] }, { id: "ccc", he: "ג", vec: [0, 0, 1] }];
  assert.equal(rankKinds([1, 0, 0], labels).verdict, "SURE");
  assert.equal(rankKinds([1, 0, 0], labels).kinds[0].id, "aaa");
  const between = rankKinds([1, 1, 0], labels);
  assert.equal(between.verdict, "MAYBE", "two kinds alike: maybe");
  const six = ["k1a", "k2a", "k3a", "k4a", "k5a", "k6a"].map((id) => ({ id, he: id, vec: [1, 0, 0] }));
  assert.equal(rankKinds([1, 0, 0], six).verdict, "UNSURE", "six kinds alike: unsure");
  assert.deepEqual(rankKinds([], labels), { verdict: "UNSURE", kinds: [] });
  const packed = Buffer.from(new Int8Array([127, 0, -127]).buffer).toString("base64");
  assert.deepEqual(unpackVec(packed), [1, 0, -1]);
  assert.equal(rankKinds([1, 0, -1], [{ id: "ddd", he: "ד", v: packed }]).kinds[0].p, 1);
});

test("only the kind's id is recorded, once per kind per browser session", () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(firstKindThisSession("ear-cuff", store), true);
  assert.equal(firstKindThisSession("ear-cuff", store), false);
  assert.equal(firstKindThisSession("<script>", store), false);
  const r = applyStoreWritePolicy("marketplace:funnel", "[]", JSON.stringify([{ id: "f_1", type: "magic_check", ts: Date.now(), place: "lens", kind: "ear-cuff", image: "data:image/png;base64,AAAA", email: "x@y.z" }]), { now: Date.now() });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value[0], { id: "f_1", type: "magic_check", ts: r.value[0].ts, place: "lens", kind: "ear-cuff" }, "the kind only: never the picture, never the person");
  const bad = applyStoreWritePolicy("marketplace:funnel", "[]", JSON.stringify([{ id: "f_2", type: "magic_check", ts: Date.now(), kind: "<b>x</b>" }]), { now: Date.now() });
  assert.equal(bad.value[0].kind, undefined);
  const funnel = readFileSync("src/lib/funnel.js", "utf8");
  assert.match(funnel, /ev\.kind = String\(extra\.kind\)/);
});

test("the crowd sensor counts kinds photographed by different people this week", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const ev = (kind, h) => ({ type: "magic_check", kind, ts: now - h * 3_600_000 });
  const list = crowdKinds([ev("ear-cuff", 1), ev("ear-cuff", 5), ev("pilates-bar", 2), ev("ear-cuff", 24 * 9), ev("BAD KIND", 1), { type: "landing", kind: "ear-cuff", ts: now }], { now });
  assert.deepEqual(list, [{ kind: "ear-cuff", people: 2, first: "2026-11-20", last: "2026-11-20" }]);
});

test("the model runs in the browser from the CDN at an exact version; the labels ship with the site", () => {
  assert.match(LENS.lib, /^https:\/\/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@\d+\.\d+\.\d+\//);
  const page = readFileSync("src/components/discover/magic.jsx", "utf8");
  assert.match(page, /import\(\/\* @vite-ignore \*\/ LENS\.lib\)/);
  assert.match(page, /trackFunnel\("magic_check", "lens", \{ kind: top\.id \}\)/);
  assert.doesNotMatch(page.slice(page.indexOf("function MagicLens"), page.indexOf("export function MagicPage")), /fetch\([^)]*(image|file|blob)/i, "the picture is never sent");
});
