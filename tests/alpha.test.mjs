// The Alpha engine (src/lib/growth/alpha.js + radarIntel.js): weights renormalize over measured
// components only, a missing component is never invented and lowers confidence (not the score),
// low samples and duplicate or stale events cannot make a high private score, the acceleration
// shield needs real history, the catalog check is a proposal, briefs are drafts with the disclosure,
// and the magic button reads the very same object as the radar's card.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALPHA, accelerationOf, alphaOf, briefOf, catalogVerdict, explain, lifecycleOf, privateSignal } from "../src/lib/growth/alpha.js";
import { enrich, siteExitRate } from "../src/lib/growth/radarIntel.js";
import { radarForItem, sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const at = (d) => Date.parse(`${d}T06:00:00Z`);
const seed = JSON.parse(readFileSync("scripts/catalog/radar-seed/momentum-2026-11-13.json", "utf8")).items;
const GAP = { state: "GAP", he: "עוד לא הגיע לארץ", confidence: "MEDIUM", confidenceHe: "ודאות בינונית" };

test("acceleration shield: never from too little history; real readings classify", () => {
  assert.equal(accelerationOf([["2026-11-12", 100], ["2026-11-13", 120]]).cls, "INSUFFICIENT");
  assert.equal(accelerationOf([["2026-11-11", 100], ["2026-11-12", 110], ["2026-11-13", 120]]).cls, "INSUFFICIENT", "3 readings over 2 days is too short");
  const earrings = accelerationOf(seed["1005011942976222"]);
  assert.equal(earrings.cls, "ACCELERATING");
  assert.ok(earrings.recentWeek > earrings.earlierWeek);
  const tennis = accelerationOf(seed["1005010706991166"]);
  assert.equal(tennis.cls, "DECELERATING", "a one-time jump then flat is slowing, not hot (the real tennis bracelet)");
  assert.equal(accelerationOf(seed["1005005262183409"]).cls, "STABLE", "a slow drift down is not a collapse");
  assert.equal(accelerationOf([["2026-11-06", 1000], ["2026-11-09", 900], ["2026-11-13", 780]]).cls, "DECLINING");
});

test("alpha: renormalized over measured components; missing lowers confidence, never invented", () => {
  const acc = accelerationOf(seed["1005011942976222"]);
  const full = alphaOf({ acc, gap: GAP, priv: { available: true, score: 0.5, confidence: 0.6, views: 40, exits: 4 } });
  const two = alphaOf({ acc, gap: GAP, priv: { available: false, reason: "רק 3 אירועים" } });
  const one = alphaOf({ acc, gap: null, priv: null });
  const none = alphaOf({});
  assert.deepEqual([full.coverage, two.coverage, one.coverage, none.coverage], ["3/3", "2/3", "1/3", "0/3"]);
  assert.ok(two.confidence < full.confidence && one.confidence < two.confidence, "less evidence, less confidence");
  assert.equal(none.score, null, "nothing measured: no score, not zero");
  assert.equal(two.components.private.missing, "רק 3 אירועים");
  assert.equal(two.verified, false, "a high score without enough evidence is not a verified opportunity");
  const w = ALPHA.weights;
  assert.equal(Math.round((w.global + w.israel + w.private) * 100), 100);
  assert.match(full.version, /^alpha-/);
});

test("private signal: low samples, duplicates and stale events cannot make a high score", () => {
  const now = at("2026-11-14");
  const ev = (i, type, d = "2026-11-10") => ({ id: `e${i}`, productId: "p1", ts: at(d), ...(type ? { type } : {}) });
  assert.equal(privateSignal([ev(1), ev(2, "view")], { productIds: ["p1"], now }).available, false, "2 events is not a signal");
  assert.equal(privateSignal([], { productIds: ["p1"], now }).available, false, "zero visitors");
  const dup = Array.from({ length: 30 }, () => ev(1));
  assert.equal(privateSignal(dup, { productIds: ["p1"], now }).available, false, "one event repeated 30 times counts once");
  const stale = Array.from({ length: 30 }, (_, i) => ev(i, "view", "2026-09-01"));
  assert.equal(privateSignal(stale, { productIds: ["p1"], now }).available, false, "events older than 30 days do not count");
  const few = [...Array.from({ length: 19 }, (_, i) => ev(i, "view")), ev(99)];
  const s = privateSignal(few, { productIds: ["p1"], now, siteRate: 0.1 });
  assert.equal(s.available, true);
  assert.ok(s.rate < 0.2, `shrunk toward the site's rate, not 1/19: ${s.rate}`);
  assert.equal(siteExitRate([ev(1, "view")], { now }), null, "no site rate from too few views");
});

test("lifecycle and the catalog policy (a proposal only)", () => {
  const acc = (cls) => ({ cls });
  assert.equal(lifecycleOf(acc("ACCELERATING"), { state: "GAP" }), "ACCELERATING");
  assert.equal(lifecycleOf(acc("ACCELERATING"), { state: "ARRIVED" }), "EXPANDING");
  assert.equal(lifecycleOf(acc("STABLE"), { state: "ARRIVED" }), "SATURATED");
  assert.equal(lifecycleOf(acc("DECLINING"), { state: "GAP" }), "DECLINING");
  assert.equal(lifecycleOf(acc("INSUFFICIENT"), null), "UNKNOWN");
  const ok = { affiliateUrl: "https://s.click.aliexpress.com/e/_a", image: "https://ae-pic-a1.aliexpress-media.com/kf/a.jpg", price: 9, priceSource: "aliexpress_api" };
  assert.equal(catalogVerdict(ok, { acc: acc("ACCELERATING") }).verdict, "KEEP");
  assert.equal(catalogVerdict(ok, { acc: acc("STABLE") }).verdict, "ARCHIVE_PROPOSED", "selling a lot without momentum is not enough");
  assert.equal(catalogVerdict(ok, { acc: acc("INSUFFICIENT") }).verdict, "HOLD", "no history is never a reason to archive");
  assert.equal(catalogVerdict({ ...ok, image: "" }, { acc: acc("ACCELERATING") }).verdict, "FIX");
  assert.equal(catalogVerdict(ok, { acc: acc("STABLE"), hot: "HOT" }).verdict, "KEEP");
});

test("explanations come only from the evidence; briefs are drafts with the disclosure first", () => {
  const acc = accelerationOf(seed["1005011942976222"]);
  const alpha = alphaOf({ acc, gap: GAP });
  const ex = explain({ alpha, acc, gap: GAP, kind: "earrings", price: 7.5 });
  assert.match(ex.why.join(" "), /6\.11–13\.11/);
  assert.match(ex.now.join(" "), /עוד לא כאן/);
  assert.match(ex.audience.basis, /כלל קבוע/, "the audience is labelled a rule, not a measurement");
  assert.ok(ex.missing.length >= 1);
  const b = briefOf({ id: "ae-1", title: "עגילים · קריסטלים" }, { hooks: [{ type: "question", text: "מחפשת עגיל ליומיום?" }, { type: "gift", text: "מתנה קטנה?" }], origin: "https://likelink2.vercel.app" });
  assert.equal(b.status, "DRAFT_FOR_APPROVAL");
  assert.match(b.caption, /^#פרסומת · קישור שותפים/);
  assert.match(b.link, /^https:\/\/likelink2\.vercel\.app\/p\/ae-1\?utm_source=instagram/);
  assert.equal(briefOf({ id: "x" }, { hooks: [] }), null, "no truth-checked hook, no brief");
});

test("one object: the radar card and the magic button show the same Alpha", () => {
  const now = at("2026-11-14");
  const items = { "1005011942976222": seed["1005011942976222"] };
  const board = {
    at: "2026-11-14T06:00:00Z", record: { calls: 0, graded: 0, hits: 0, recent: [] }, site: { checked: 1, counts: {}, hot: [], cooling: [] },
    concepts: [{ id: "crystal-earrings", he: "עגילי קריסטל", kind: "earrings", stage: "UNVERIFIED", gap: GAP, items: ["1005011942976222"], match: ["עגילי קריסטל"], pick: { itemId: "1005011942976222", title: "עגילים", buy: "https://s.click.aliexpress.com/e/_a", price: 7.5 } }],
  };
  const product = { id: "ae-1005011942976222", itemId: "1005011942976222", title: "עגילים · קריסטלים", kind: "earrings", affiliateUrl: "https://s.click.aliexpress.com/e/_a", image: "https://ae-pic-a1.aliexpress-media.com/kf/a.jpg", price: 7.5, priceSource: "aliexpress_api" };
  const out = enrich(board, { concepts: [{ id: "crystal-earrings", he: "עגילי קריסטל", hq: ["עגילי קריסטל"] }], items, siteProducts: [product], events: [], hooksFor: () => [{ type: "question", text: "מחפשת עגיל ליומיום?" }], origin: "https://likelink2.vercel.app", now });
  const view = sanitizeBoard(out.board);
  const card = view.concepts[0];
  const hint = radarForItem(view, { itemId: "1005011942976222" });
  assert.equal(hint.alpha.score, card.alpha.score);
  assert.equal(hint.alpha.confidence, card.alpha.confidence);
  assert.equal(hint.lifecycleHe, card.lifecycleHe);
  assert.equal(out.audit.counts.KEEP, 1);
  assert.equal(out.briefs.briefs.length, 1);
  assert.match(out.audit.policy, /nothing archived/);
});
