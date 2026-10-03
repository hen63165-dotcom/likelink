// Visual search: in-browser signatures, honest labels (never "exact product").
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dHash, colorHistogram, compareSignatures, MATCH_LABELS, MIN_SIMILARITY } from "../src/lib/visualSearch.js";

const gray = (f) => Array.from({ length: 72 }, (_, i) => f(i % 9, Math.floor(i / 9)));
const rgba = (r, g, b, n = 64) => { const a = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) a.set([r, g, b, 255], i * 4); return a; };

test("the same picture is 'same photo', a different one is at most 'similar' — there is no 'exact product' label", () => {
  const sigA = { hash: dHash(gray((x) => x * 20)), hist: colorHistogram(rgba(200, 30, 60)) };
  const sigB = { hash: dHash(gray((x) => 200 - x * 20)), hist: colorHistogram(rgba(20, 90, 200)) };
  assert.equal(compareSignatures(sigA, sigA).label, "same_photo");
  assert.ok(compareSignatures(sigA, sigA).similarity > 0.99);
  const ab = compareSignatures(sigA, sigB);
  assert.equal(ab.label, "similar");
  assert.ok(ab.similarity < MIN_SIMILARITY, "unrelated photos fall below the threshold");
  assert.deepEqual(Object.keys(MATCH_LABELS).sort(), ["same_photo", "similar"]);
  assert.ok(!JSON.stringify(MATCH_LABELS).match(/exact|זהה|מדויק/i));
});

test("a white studio backdrop does not count as colour", () => {
  const h = colorHistogram(rgba(250, 250, 250));
  assert.ok(h.every((v) => v === 0));
});

test("the buyer's photo stays on the device (no upload, no provider)", () => {
  const src = readFileSync("src/lib/visualSearch.js", "utf8");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|FormData/);
  assert.match(src, /URL\.createObjectURL/);
});
