// The radar's Wix dashboard page (src/lib/growth/wixRadar.js, src/wix/, wix/radar.html): the logic
// over the sanitized board, the build entry, and the frame rule — only Wix's own dashboard may show
// the page in a frame, every other page of the site keeps X-Frame-Options.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import {
  KIND_LABELS, STAGE_LABELS, WIX_RADAR, WORLD_LABELS, freshOf, itemPage, kindsOf, pct, proofOf, recordOf,
  rowsFor, shortDay, verdictOf, wixLang,
} from "../src/lib/growth/wixRadar.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const BUY = "https://s.click.aliexpress.com/e/_oAbCdEf";
const IMG = "https://ae-pic-a1.aliexpress-media.com/kf/S1.jpg";
const concept = (id, kind, stage, weekPct, extra = {}) => ({ id, he: `שם ${id}`, en: `name ${id}`, kind, stage, today: { orders: 1000, listings: 50 }, accel: { cls: "STABLE", weekPct, from: "2026-11-14", to: "2026-11-20" }, factory: { weekPct: 3, from: 48, to: 50, days: 6 }, world: { state: "EARLY" }, measured: "2026-11-20", ...extra });
const board = () => sanitizeBoard({
  v: 2, at: "2026-11-20T06:00:00Z", record: { calls: 2, graded: 0, hits: 0, pending: 2, nextDue: "2026-12-01" },
  concepts: [
    concept("barrel-jeans", "style", "STEADY", 4),
    concept("cat-perch", "pets", "PEAK", 1),
    concept("ear-cuff", "earrings", "RISING", 18, { early: { level: "WATCH", count: 3, signals: { world: true, demand: true, supply: true, israel: false } } }),
    concept("old-money", "style", "EMERGING", 30),
    concept("pudding-squishy", "kids", "STEADY", 9),
  ],
  early: { need: 4, record: { calls: 1, graded: 0, hits: 0, pending: 1 }, ledger: [{ concept: "old-money", at: "2026-11-20", due: "2026-12-04" }, { concept: "barrel-jeans", at: "2026-11-02", due: "2026-11-16", result: "MISS", growth: 3 }] },
  fresh: { tracking: 6000, risers: [{ id: "1005013201890326", title: "Wide-leg pants", image: IMG, buy: BUY, orders: 156, ordersBefore: 82, from: "2026-11-16", to: "2026-11-20", weekPct: 208.2, known: { phrase: "wide leg", similar: 1483 } }], record: { calls: 3, graded: 0, hits: 0, pending: 3, nextDue: "2026-11-30" } },
  ledger: { d: "2026-11-20", sha256: "3bb51c60778c215787dbf83a75f1a26a4b413174008560d424c5b0d99d4b1779", count: 2, text: `fresh=${"a".repeat(64)}\nbrain=${"b".repeat(64)}`, ots: [] },
  anchors: { list: [], pending: 1, since: "2026-11-20" },
});

test("the language comes from Wix's locale: Hebrew for he, English for everything else", () => {
  assert.equal(wixLang("?instance=x&locale=he"), "he");
  assert.equal(wixLang("?locale=he-IL"), "he");
  assert.equal(wixLang("?locale=en"), "en");
  assert.equal(wixLang("?locale=fr"), "en");
  assert.equal(wixLang(""), "en");
});

test("the categories are the board's own kinds, biggest first, each with a name in both languages", () => {
  const b = board();
  assert.deepEqual(kindsOf(b).map((k) => k.kind), ["style", "earrings", "kids", "pets"]);
  for (const k of ["style", "clothing", "bags", "earrings", "necklaces", "bracelets", "rings", "watches", "hair", "makeup", "home", "kitchen", "kids", "gadgets", "fitness", "pets", "car"]) {
    assert.ok(KIND_LABELS[k]?.he && KIND_LABELS[k]?.en, k);
  }
});

test("rows: the chosen kinds only, moving stages first, then the fastest orders", () => {
  const b = board();
  assert.deepEqual(rowsFor(b).rows.map((r) => r.id), ["old-money", "ear-cuff", "cat-perch", "pudding-squishy", "barrel-jeans"]);
  const style = rowsFor(b, ["style"]);
  assert.equal(style.total, 2);
  assert.deepEqual(style.rows.map((r) => r.id), ["old-money", "barrel-jeans"]);
  assert.equal(style.rows[0].ordersWeekPct, 30);
  assert.equal(style.rows[0].sellersWeekPct, 3);
  assert.equal(rowsFor(b, [], { limit: 2 }).rows.length, 2);
});

test("the verdict names only calls sealed on the board's day, and the brink names what is missing", () => {
  const v = verdictOf(board());
  assert.equal(v.day, "2026-11-20");
  assert.deepEqual(v.calls.map((c) => [c.id, c.due]), [["old-money", "2026-12-04"]]);
  assert.equal(v.quiet, false);
  assert.deepEqual(v.brink.map((x) => [x.id, x.missing]), [["ear-cuff", ["israel"]]]);
  const quiet = verdictOf(sanitizeBoard({ v: 2, at: "2026-11-21T06:00:00Z", record: {}, concepts: [] }));
  assert.equal(quiet.quiet, true);
});

test("a new product links to its plain AliExpress page, never to a tracked link", () => {
  const [r] = freshOf(board());
  assert.equal(r.page, "https://www.aliexpress.com/item/1005013201890326.html");
  assert.equal(r.similar, 1483);
  assert.equal("buy" in r, false);
  assert.equal(itemPage("javascript:alert(1)"), null);
  const src = read("src/wix/WixRadar.jsx");
  assert.doesNotMatch(src, /s\.click|\.buy\b/, "the page never shows the owner's tracked links");
});

test("the record adds up every book, and the seal keeps the root with its books", () => {
  const r = recordOf(board());
  assert.equal(r.calls, 1 + 2 + 3);
  assert.equal(r.graded, 0);
  assert.equal(r.nextDue, "2026-11-30");
  const p = proofOf(board());
  assert.equal(p.root.sha256.length, 64);
  assert.deepEqual(p.root.books, ["fresh", "brain"]);
  assert.equal(p.anchored, null);
  assert.equal(p.pending, 1);
});

test("numbers carry their sign and dates read in each language", () => {
  assert.equal(pct(12.4), "+12%");
  assert.equal(pct(-4.6), "−5%");
  assert.equal(pct(0.2), "0%");
  assert.equal(pct(null), "");
  assert.equal(shortDay("2026-11-20", "he"), "20.11");
  assert.equal(shortDay("2026-11-20", "en"), "Nov 20");
});

test("the page's words say what IS: no promise, no certainty, no 'לא'/'אין' in the Hebrew", () => {
  const texts = [read("src/wix/WixRadar.jsx"), read("src/wix/main.jsx"), read("src/lib/growth/wixRadar.js")].join("\n");
  const hebrew = (texts.match(/"[^"\n]*[֐-׿][^"\n]*"/g) || []).join("\n");
  assert.doesNotMatch(hebrew, /(^|[\s"(])(לא|אין)(?=[\s".,:)]|$)/m);
  assert.doesNotMatch(hebrew, /בטוח|מובטח|הבטחה|היחיד|רק אצלנו/);
  assert.doesNotMatch(texts, /guarantee|the only one|100%|sure hit/i);
  for (const m of [STAGE_LABELS, WORLD_LABELS]) for (const v of Object.values(m)) assert.ok(v.he && v.en);
});

test("the build has its own small entry for the Wix page, and it never loads the site's cloud client", () => {
  const vite = read("vite.config.js");
  assert.match(vite, /wixRadar:.*wix\/radar\.html/);
  const html = read("wix/radar.html");
  assert.match(html, /noindex/);
  assert.match(html, /src="\/src\/wix\/main\.jsx"/);
  const main = read("src/wix/main.jsx") + read("src/wix/WixRadar.jsx");
  assert.doesNotMatch(main, /supabase|storage\.js|MarketplaceContext|getSessionToken/);
  assert.equal(WIX_RADAR.path, "/wix/radar");
});

test("only Wix's dashboard may frame /wix/*; every other page keeps X-Frame-Options", () => {
  const v = JSON.parse(read("vercel.json"));
  const wix = v.headers.find((h) => h.source === "/wix/(.*)");
  assert.ok(wix, "a header rule for /wix/*");
  const csp = wix.headers.find((x) => x.key === "Content-Security-Policy")?.value || "";
  assert.equal(csp, `frame-ancestors ${WIX_RADAR.frameAncestors.join(" ")}`);
  assert.equal(wix.headers.some((x) => x.key === "X-Frame-Options"), false);
  for (const k of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy"]) assert.ok(wix.headers.some((x) => x.key === k), k);
  const rest = v.headers.find((h) => h.source === "/((?!wix/).*)");
  assert.equal(rest.headers.find((x) => x.key === "X-Frame-Options")?.value, "SAMEORIGIN");
  assert.equal(v.headers.some((h) => h.source === "/(.*)"), false, "no catch-all rule adds X-Frame-Options back to /wix/*");
  const re = new RegExp(`^${rest.source.replace("/(", "/(")}$`);
  assert.ok(re.test("/radar") && re.test("/") && re.test("/p/x") && !re.test("/wix/radar"));
});
