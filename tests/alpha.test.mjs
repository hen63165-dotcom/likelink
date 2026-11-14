// The Alpha engine (src/lib/growth/alpha.js + radarIntel.js): weights renormalize over measured
// components only, a missing component is never invented and lowers confidence (not the score),
// low samples and duplicate or stale events cannot make a high private score, the acceleration
// shield needs real history, the 8 criteria keep only hot products (missing data holds, never
// archives), the archive touches only the owner's products and keeps every field and its history,
// promotion kits are drafts locked to the store photos with the disclosure,
// and the magic button reads the very same object as the radar's card.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALPHA, AUTOPOST, accelerationOf, alphaOf, catalogVerdict, criteriaOf, explain, kitOf, lifecycleOf, privateSignal } from "../src/lib/growth/alpha.js";
import { MAX_CHANGES, applyArchive, syncArchive } from "../src/lib/cloud/catalogArchive.js";
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
  const israelOnly = alphaOf({ gap: GAP });
  assert.equal(israelOnly.score, null, "a gap in Israel alone is not an opportunity: no score without global momentum");
  assert.match(israelOnly.noScore, /מומנטום עולמי/);
  assert.ok(full.score < 100 && two.score < 100, "uncertain components are pulled toward neutral");
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

const IMG = (n) => `https://ae-pic-a1.aliexpress-media.com/kf/S${n}.jpg`;
const OK = { id: "ae-1", itemId: "1", title: "עגילים · קריסטלים", affiliateUrl: "https://s.click.aliexpress.com/e/_a", image: IMG(0), images: [IMG(1), IMG(2), IMG(3)], price: 9, priceSource: "aliexpress_api" };
const FACTS = { ships: true, commission: true, satisfied: true, orders: 1200 };

test("lifecycle and the 8 criteria of the hot-only policy", () => {
  const acc = (cls) => ({ cls });
  assert.equal(lifecycleOf(acc("ACCELERATING"), { state: "GAP" }), "ACCELERATING");
  assert.equal(lifecycleOf(acc("ACCELERATING"), { state: "ARRIVED" }), "EXPANDING");
  assert.equal(lifecycleOf(acc("STABLE"), { state: "ARRIVED" }), "SATURATED");
  assert.equal(lifecycleOf(acc("DECLINING"), { state: "GAP" }), "DECLINING");
  assert.equal(lifecycleOf(acc("INSUFFICIENT"), null), "UNKNOWN");
  const c = criteriaOf(OK, { acc: acc("ACCELERATING"), gap: GAP, hot: "HOT", facts: FACTS });
  assert.deepEqual(c.map((x) => x.id), ["hot", "momentum", "direction", "israel", "demand", "ships", "commission", "quality"]);
  assert.ok(c.every((x) => x.ok === true), "a hot, accelerating, unsaturated, shipped, paying, checked product passes all 8");
  const blank = criteriaOf(OK, {});
  assert.ok(blank.every((x) => x.ok === null || x.ok === false));
  assert.equal(blank.find((x) => x.id === "ships").ok, null, "no store answer: not measured, never a fail");
  assert.equal(blank.find((x) => x.id === "demand").ok, null);
  assert.equal(criteriaOf({ ...OK, affiliateUrl: "https://www.aliexpress.com/item/1.html" }, {}).find((x) => x.id === "quality").ok, false, "no own affiliate link fails quality");
  assert.equal(criteriaOf(OK, { facts: { ...FACTS, satisfied: false } }).find((x) => x.id === "quality").ok, false);
  assert.equal(criteriaOf(OK, { facts: { ...FACTS, orders: 120 } }).find((x) => x.id === "demand").ok, false);
  assert.equal(criteriaOf(OK, { acc: acc("EMERGING"), facts: { ...FACTS, orders: 120 } }).find((x) => x.id === "demand").ok, true, "an emerging item is allowed to be small");
  assert.equal(criteriaOf(OK, { acc: acc("STABLE"), gap: { state: "ARRIVED" } }).find((x) => x.id === "israel").ok, false, "saturated in Israel");
});

test("catalog verdicts: keep only the hot, archive the cooling and the saturated, never archive for missing data", () => {
  const acc = (cls) => ({ cls });
  assert.equal(catalogVerdict(OK, { acc: acc("ACCELERATING"), facts: FACTS }).verdict, "KEEP");
  assert.equal(catalogVerdict(OK, { acc: acc("STABLE"), hot: "HOT", facts: FACTS }).verdict, "KEEP", "the item itself is hot this week");
  assert.equal(catalogVerdict(OK, { acc: acc("STABLE"), facts: FACTS }).verdict, "ARCHIVE_PROPOSED", "selling a lot without momentum is not enough");
  assert.equal(catalogVerdict(OK, { acc: acc("DECELERATING"), facts: FACTS }).verdict, "ARCHIVE_PROPOSED", "losing momentum");
  assert.equal(catalogVerdict(OK, { acc: acc("DECLINING"), facts: FACTS }).verdict, "ARCHIVE_PROPOSED");
  assert.equal(catalogVerdict(OK, { acc: acc("STABLE"), gap: { state: "ARRIVED" }, facts: FACTS }).verdict, "ARCHIVE_PROPOSED");
  assert.equal(catalogVerdict(OK, { acc: acc("INSUFFICIENT"), facts: FACTS }).verdict, "HOLD", "no history is never a reason to archive");
  assert.equal(catalogVerdict(OK, {}).verdict, "HOLD");
  const noShip = catalogVerdict(OK, { acc: acc("ACCELERATING"), facts: { ...FACTS, ships: false } });
  assert.equal(noShip.verdict, "ARCHIVE_PROPOSED", "a hard criterion fails even when hot");
  assert.match(noShip.reasons[0], /לישראל/);
  assert.equal(catalogVerdict({ ...OK, image: "" }, { acc: acc("ACCELERATING"), facts: FACTS }).verdict, "ARCHIVE_PROPOSED", "no photo fails quality");
  assert.equal(catalogVerdict(OK, { acc: acc("ACCELERATING"), facts: { ...FACTS, commission: false } }).verdict, "ARCHIVE_PROPOSED");
  const v = catalogVerdict(OK, { acc: acc("ACCELERATING"), facts: FACTS });
  assert.equal(v.criteria.length, 8);
});

test("promotion kits: locked to the store photos, halted when evidence is missing, drafts with the disclosure", () => {
  const hooks = [{ type: "question", text: "מחפשת עגיל ליומיום?" }, { type: "gift", text: "מתנה קטנה שנראית יקרה?" }, { type: "curiosity", text: "ראית את זה כבר?" }];
  const k = kitOf(OK, { hooks, origin: "https://likelink2.vercel.app/", why: ["ההזמנות עולות השבוע"], now: at("2026-11-14") });
  assert.equal(k.status, "DRAFT_FOR_APPROVAL");
  assert.equal(k.cta, "כתבו ״קישור״ ונשלח לכם");
  assert.equal(k.variants.length, 3, "A/B/C variations");
  for (const v of k.variants) {
    assert.match(v.caption, /^#פרסומת · קישור שותפים/);
    assert.ok(v.hook3s.split(/\s+/).length <= 8, "a hook said in 3 seconds");
    assert.equal(v.script.length, 4);
    assert.match(v.link, new RegExp(`^https://likelink2\\.vercel\\.app/p/ae-1\\?utm_source=instagram&utm_medium=reel&utm_campaign=radar_ae-1&utm_content=${v.variant}$`));
  }
  assert.ok(k.storyboard.every((s) => OK.images.includes(s.photo)), "every shot names one of the product's own store photos");
  assert.deepEqual(k.queue.map((q) => q.status), ["READY_FOR_APPROVAL", "READY_FOR_APPROVAL", "READY_FOR_APPROVAL"]);
  assert.match(k.queue.find((q) => q.channel === "tiktok").link, /utm_source=tiktok/);
  assert.ok(k.queue.every((q) => /^BLOCKED/.test(q.autopost) && q.autopost === AUTOPOST[q.channel]), "external auto-posting is blocked with its reason");
  const foreign = kitOf({ ...OK, images: ["https://images.unsplash.com/a.jpg", IMG(1)] }, { hooks, origin: "https://x" });
  assert.equal(foreign.status, "HALTED", "a stock photo is not the product");
  assert.match(foreign.flags[0], /תמונות מאומתות/);
  assert.equal(kitOf({ ...OK, priceSource: "manual" }, { hooks, origin: "https://x" }).status, "HALTED");
  assert.equal(kitOf(OK, { hooks: [{ type: "q", text: "מילה אחת שתיים שלוש ארבע חמש שש שבע שמונה תשע" }], origin: "https://x" }).status, "HALTED", "a hook longer than 8 words is not a 3-second hook");
  assert.equal(kitOf({}, { hooks }), null);
});

test("archive: owner's products only, approved only, restore only the radar's, history kept, nothing deleted", () => {
  const now = at("2026-11-14");
  const P = (id, extra = {}) => ({ id, marketerId: "owner", status: "approved", title: id, ...extra });
  const products = [P("a"), P("b"), P("c", { marketerId: "creator2" }), P("d", { status: "archived", archivedBy: "radar", archivedAt: "2026-11-01T00:00:00.000Z", archiveHistory: [{ action: "archive" }] }), P("e", { status: "archived", archivedBy: "owner" }), P("f", { status: "draft" })];
  const decisions = [
    { id: "a", action: "archive", reason: "ההזמנות יורדות", evidence: { accel: "DECLINING", weekPct: -8, israel: "ARRIVED", at: "2026-11-14" } },
    { id: "c", action: "archive" }, { id: "d", action: "restore", reason: "מאיץ" }, { id: "e", action: "restore" },
    { id: "f", action: "archive" }, { id: "zz", action: "archive" }, { id: "../x", action: "archive" }, { id: "b", action: "delete" },
  ];
  const r = applyArchive(products, decisions, { ownerId: "owner", now });
  assert.equal(r.products.length, products.length, "nothing is deleted");
  assert.deepEqual(r.applied.map((x) => `${x.id}:${x.action}`), ["a:archive", "d:restore"]);
  assert.deepEqual(Object.fromEntries(r.refused.map((x) => [x.id, x.error])), { c: "not_owner_product", e: "not_radar_archived", f: "not_approved", zz: "unknown_product", "../x": "bad_id", b: "bad_action" });
  const a = r.products.find((x) => x.id === "a");
  assert.equal(a.status, "archived");
  assert.equal(a.archivedBy, "radar");
  assert.equal(a.archiveEvidence.accel, "DECLINING");
  assert.equal(a.archiveHistory.length, 1);
  assert.equal(a.title, "a", "every other field is kept (links, tracking, history)");
  const d = r.products.find((x) => x.id === "d");
  assert.equal(d.status, "approved");
  assert.equal(d.archivedBy, undefined);
  assert.equal(d.archiveHistory.length, 2, "restore keeps the history");
  assert.equal(r.products.find((x) => x.id === "c").status, "approved", "a creator's product is never touched");
  const many = Array.from({ length: MAX_CHANGES + 5 }, (_, i) => P(`p${i}`));
  const capped = applyArchive(many, many.map((p) => ({ id: p.id, action: "archive" })), { ownerId: "owner", now });
  assert.equal(capped.applied.length, MAX_CHANGES);
  assert.equal(capped.refused.filter((x) => x.error === "over_run_limit").length, 5);
  assert.equal(applyArchive(products, decisions, { ownerId: "", now }).applied.length, 0, "no owner id, nothing changes");
});

test("archive on the server: dry run by default; a confirmed run swaps, reads back and logs", async () => {
  const now = at("2026-11-14");
  let stored = [{ id: "a", marketerId: "owner", status: "approved" }, { id: "b", marketerId: "owner", status: "approved" }];
  let version = "v1";
  let log = [];
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(`${init.method || "GET"} ${new URL(url).search}`);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (!init.method || init.method === "GET") {
      if (url.includes("catalog%3Aarchive%3Alog")) return json([{ value: JSON.stringify(log), updated_at: "l1" }]);
      return json([{ value: JSON.stringify(stored), updated_at: version }]);
    }
    if (init.method === "PATCH") {
      if (!url.includes(`updated_at=eq.${version}`)) return json([]);
      stored = JSON.parse(JSON.parse(init.body).value); version = "v2";
      return json([{ key: "marketplace:products" }]);
    }
    log = JSON.parse(JSON.parse(init.body).value);
    return json([], 201);
  };
  const env = { SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "k", MARKETPLACE_SINGLE_OWNER_ID: "owner" };
  const body = { decisions: [{ id: "a", action: "archive", reason: "ההזמנות יורדות" }] };
  const dry = await syncArchive(body, { env, fetchImpl, now });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.proof.status, "DRY_RUN");
  assert.equal(stored[0].status, "approved", "a dry run writes nothing");
  assert.ok(!calls.some((c) => c.startsWith("PATCH") || c.startsWith("POST")));
  const real = await syncArchive({ ...body, confirm: "archive" }, { env, fetchImpl, now });
  assert.equal(real.ok, true);
  assert.equal(real.proof.status, "VERIFIED");
  assert.equal(stored.find((x) => x.id === "a").status, "archived");
  assert.equal(stored.find((x) => x.id === "b").status, "approved");
  assert.equal(log[0].applied[0].id, "a");
  const failing = await syncArchive({ ...body, confirm: "archive" }, { env, fetchImpl: async () => new Response("no", { status: 500 }), now });
  assert.equal(failing.ok, false);
  assert.equal(failing.error, "kv_read_failed", "a failed read never becomes a write");
});

test("explanations come only from the evidence", () => {
  const acc = accelerationOf(seed["1005011942976222"]);
  const alpha = alphaOf({ acc, gap: GAP });
  const ex = explain({ alpha, acc, gap: GAP, kind: "earrings", price: 7.5 });
  assert.match(ex.why.join(" "), /6\.11–13\.11/);
  assert.match(ex.now.join(" "), /עוד לא כאן/);
  assert.match(ex.audience.basis, /כלל קבוע/, "the audience is labelled a rule, not a measurement");
  assert.ok(ex.missing.length >= 1);
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
  assert.match(out.audit.policy, /never deleted/);
  assert.deepEqual(out.decisions, [], "a kept product is never sent to the archive");
});

test("the kits page: escaped, store photos and the site's own tracked links only, noindex", async () => {
  const { kitsPage } = await import("../scripts/marketing/radar-kits.mjs");
  const hooks = [{ type: "question", text: "מחפשת עגיל ליומיום?" }];
  const k = kitOf(OK, { hooks, origin: "https://likelink2.vercel.app", now: at("2026-11-14") });
  const evil = { ...k, productId: "<script>x</script>", variants: [{ ...k.variants[0], link: "javascript:alert(1)" }], storyboard: [{ t: "0", shot: "x", photo: "https://evil.example/a.jpg" }] };
  const html = kitsPage({ status: "S", ready: 1, halted: 1, briefs: [k, evil, { productId: "h", status: "HALTED", flags: ["אין מחיר מאומת מהחנות"] }] });
  assert.match(html, /noindex/);
  assert.match(html, /#פרסומת · קישור שותפים/);
  assert.ok(html.includes(`href="${k.variants[0].link.replace(/&/g, "&amp;")}"`));
  assert.ok(!html.includes("<script>x"), "text is escaped");
  assert.ok(!html.includes("javascript:"), "only the site's own links");
  assert.ok(!html.includes("evil.example"), "only store photos");
  assert.match(html, /נעצר: חסר מידע מאומת/);
  assert.match(kitsPage(null), /אין עדיין מוצר/);
});

test("archive timing: store-fact failures apply now; momentum calls wait for the 17.11 scan; restores always", async () => {
  const { mayApply, applicableNow, ARCHIVE_NOT_BEFORE } = await import("../scripts/catalog/push-archive.mjs");
  const main = { RADAR_ARCHIVE: "apply", GITHUB_REF: "refs/heads/main" };
  assert.equal(ARCHIVE_NOT_BEFORE, "2026-11-17");
  assert.equal(mayApply(main), true);
  assert.equal(mayApply({ ...main, GITHUB_REF: "refs/heads/claude/x" }), false, "never from a branch");
  assert.equal(mayApply({ GITHUB_REF: "refs/heads/main" }), false, "never without RADAR_ARCHIVE=apply");
  const ds = [{ id: "a", action: "archive", basis: "hard" }, { id: "b", action: "archive", basis: "momentum" }, { id: "c", action: "restore", basis: "restore" }, { id: "d", action: "archive" }];
  assert.deepEqual(applicableNow(ds, at("2026-11-15")).map((d) => d.id), ["a", "c"]);
  assert.deepEqual(applicableNow(ds, at("2026-11-17")).map((d) => d.id), ["a", "b", "c", "d"]);
  const acc = (cls) => ({ cls });
  assert.equal(catalogVerdict(OK, { acc: acc("ACCELERATING"), facts: { ...FACTS, orders: 50 } }).basis, "hard");
  assert.equal(catalogVerdict(OK, { acc: acc("STABLE"), facts: FACTS }).basis, "momentum");
  assert.equal(catalogVerdict(OK, { acc: acc("INSUFFICIENT"), facts: FACTS }).basis, undefined, "a product waiting for readings is never archived");
});
