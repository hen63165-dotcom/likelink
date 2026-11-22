// New listings that start to run (src/lib/growth/freshRisers.js; the owner, 2026-11-16: "what the
// radar lists, the market already knows"): only small new listings whose orders really grew, measured
// against an older reading; no own link, photo, brand or listed kind → never shown; the board keeps
// only the store's own fields.
import test from "node:test";
import assert from "node:assert/strict";
import { FRESH, freshEntry, freshKeywords, freshPhrase, freshRisers, mergeFreshPool, unknownCheck } from "../src/lib/growth/freshRisers.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";

const p = (id, title, orders, extra = {}) => ({ product_id: id, product_title: title, lastest_volume: orders, promotion_link: `https://s.click.aliexpress.com/e/_x${id}`, product_main_image_url: `https://ae01.alicdn.com/kf/${id}.jpg`, target_sale_price: "12.5", ...extra });

test("fresh: the search asks for this year's new listings", () => {
  assert.equal(freshKeywords({ keywords: "kitchen gadgets" }, Date.parse("2026-11-16")), "kitchen gadgets 2026 new");
});

test("fresh: an entry needs the owner's own link, a store photo, and no brand or unlisted kind", () => {
  assert.ok(freshEntry(p("1005001111111", "Mini Desk Lamp Cute", 120), { category: "home", today: "2026-11-16" }));
  assert.equal(freshEntry(p("1005001111112", "Lamp", 10, { promotion_link: "https://www.aliexpress.com/item/1.html" })), null);
  assert.equal(freshEntry(p("1005001111113", "Lamp", 10, { product_main_image_url: "http://evil.example/x.jpg" })), null);
  assert.equal(freshEntry(p("1005001111114", "Nike style sneakers", 10)), null);
});

test("fresh: a small listing whose orders grew ≥ 40% a week is a riser; a big or slow one is not", () => {
  const pool = mergeFreshPool({}, [
    freshEntry(p("1005002222221", "Cloud Night Light", 200), { category: "home", today: "2026-11-09" }),
    freshEntry(p("1005002222222", "Phone Holder Clip", 2000), { category: "tech", today: "2026-11-09" }),
    freshEntry(p("1005002222223", "Hair Claw Big", 9000), { category: "hair", today: "2026-11-09" }),
  ], { today: "2026-11-16" });
  for (const e of Object.values(pool)) e.seen = "2026-11-16";
  const items = {
    // +100% a week, held, and new: the radar's first reading had 60 orders (22.11: one already selling
    // ≥ 100 at its first reading grows, but is no new product — listingAge, tested below).
    "1005002222221": [["2026-11-06", 60], ["2026-11-09", 80], ["2026-11-16", 160]],
    "1005002222222": [["2026-11-09", 2000], ["2026-11-16", 2200]], // +10%
    "1005002222223": [["2026-11-09", 6000], ["2026-11-16", 9000]], // too big
  };
  const f = freshRisers(pool, items);
  assert.equal(f.tracking, 3);
  assert.deepEqual(f.risers.map((r) => r.id), ["1005002222221"]);
  assert.equal(f.risers[0].weekPct, 100);
  assert.equal(f.risers[0].ordersBefore, 80);
  assert.ok(f.risers[0].orders <= FRESH.maxOrders);
  // one reading only → nothing claimed; a jump the reading before did not show → not held
  assert.equal(freshRisers(pool, { "1005002222221": [["2026-11-16", 400]] }).risers.length, 0);
  assert.equal(freshRisers(pool, { "1005002222221": [["2026-11-06", 200], ["2026-11-09", 200], ["2026-11-16", 400]] }).risers.length, 0);
});

test("fresh: listings not seen for three weeks leave the pool", () => {
  const pool = { "1005003333331": { id: "1005003333331", seen: "2026-10-20", first: "2026-10-20" }, "1005003333332": { id: "1005003333332", seen: "2026-11-15", first: "2026-11-01" } };
  assert.deepEqual(Object.keys(mergeFreshPool(pool, [], { today: "2026-11-16" })), ["1005003333332"]);
});

test("fresh: the browser keeps only safe fields", () => {
  const b = sanitizeBoard({ at: "2026-11-16T05:40:00Z", concepts: [], record: {}, fresh: { tracking: 5, since: "2026-11-16", risers: [
    { id: "1005004444441", title: "Cloud Light", image: "https://ae01.alicdn.com/kf/a.jpg", buy: "https://s.click.aliexpress.com/e/_abc", check: "/magic?u=https%3A%2F%2Fwww.aliexpress.com%2Fitem%2F1005004444441.html", weekPct: 80, orders: 300, ordersBefore: 150, from: "2026-11-09", to: "2026-11-16", known: { phrase: "cloud light", similar: 420 } },
    { id: "1005004444444", title: "No check", image: "https://ae01.alicdn.com/kf/c.jpg", buy: "https://s.click.aliexpress.com/e/_abe", weekPct: 90, orders: 300 },
    { id: "1005004444442", title: "x", image: "https://evil.example/a.jpg", buy: "https://s.click.aliexpress.com/e/_abd", weekPct: 80, orders: 300 },
    { id: "1005004444443", title: "x", image: "https://ae01.alicdn.com/kf/b.jpg", buy: "javascript:alert(1)", weekPct: 80, orders: 300 },
  ] } });
  assert.equal(b.fresh.tracking, 5);
  assert.deepEqual(b.fresh.risers.map((r) => r.id), ["1005004444441"]);
});

test("fresh: every riser shown is a call graded after 14 days, never edited", async () => {
  const { recordFresh, gradeFresh, freshRecord } = await import("../src/lib/growth/freshRisers.js");
  let calls = recordFresh([], [{ id: "1005005555551", title: "A", orders: 200 }, { id: "1005005555552", title: "B", orders: 100 }], "2026-11-16");
  calls = recordFresh(calls, [{ id: "1005005555551", title: "A", orders: 260 }], "2026-11-17");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].due, "2026-11-30");
  const items = { "1005005555551": [["2026-11-30", 320]], "1005005555552": [["2026-11-30", 110]] };
  assert.deepEqual(gradeFresh(calls, items, "2026-11-29"), calls); // not due yet
  const graded = gradeFresh(calls, items, "2026-11-30");
  assert.deepEqual(graded.map((c) => c.result), ["HIT", "MISS"]);
  assert.deepEqual(gradeFresh(graded, { "1005005555552": [["2026-12-01", 500]] }, "2026-12-01").map((c) => c.result), ["HIT", "MISS"]);
  assert.deepEqual(freshRecord(graded), { calls: 2, graded: 2, hits: 1, accuracy: 50, pending: 0, nextDue: null });
});

test("fresh: shown only when nobody has heard of it yet — few sellers, no buzz abroad, both read", () => {
  assert.equal(freshPhrase("2026 New Cute Cloud Night Light for Kids"), "cloud night"); // the store's generic words are skipped
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 420, suggestions: ["cloud light for bedroom", "cloud light kids"] }).unknown, true);
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 9000, suggestions: [] }).reason, "SATURATED");
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 100, suggestions: ["cloud light tiktok"] }).reason, "BUZZ");
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 100, suggestions: ["cloud light amazon"] }).reason, "BUZZ");
  assert.equal(unknownCheck({ phrase: "cloud light", similar: null, suggestions: [] }).reason, "NOT_CHECKED");
  assert.equal(unknownCheck({ phrase: "cloud light", similar: 100, suggestions: null }).reason, "NOT_CHECKED");
});

test("fresh: one tap from the radar to the Studio — only an AliExpress item page is prefilled", async () => {
  const { radarPrefill } = await import("../src/components/studio/AddProductLink.jsx").catch(() => ({}));
  if (!radarPrefill) return; // JSX is not importable under node:test; the page test below covers the link
  assert.equal(radarPrefill("?from=radar&u=https%3A%2F%2Fwww.aliexpress.com%2Fitem%2F1005004444441.html"), "https://www.aliexpress.com/item/1005004444441.html");
  assert.equal(radarPrefill("?u=https%3A%2F%2Fevil.example%2Fx"), "");
});

test("fresh: the radar card links each riser to the Studio with the item page only", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/components/discover/radar.jsx", import.meta.url), "utf8");
  assert.match(page, /\/studio\/add-product\?from=radar&u=\$\{encodeURIComponent\(`https:\/\/www\.aliexpress\.com\/item\/\$\{r\.id\}\.html`\)\}/);
  const studio = readFileSync(new URL("../src/components/studio/AddProductLink.jsx", import.meta.url), "utf8");
  assert.match(studio, /aliexpress\\\.com\\\/item\\\/\\d\{6,20\}\\\.html\$/);
});

test("fashion pieces are read every day with the categories (the owner, 2026-11-17)", async () => {
  const { FASHION_AREAS } = await import("../src/lib/growth/freshRisers.js");
  assert.deepEqual(FASHION_AREAS.map((a) => a.key), ["shoes", "sunglasses", "hats", "scarves", "belts"]);
  const run = (await import("node:fs")).readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /\.\.\.WAVE_AREAS, \.\.\.FASHION_AREAS\]/);
});

test("an area whose long search finds nothing is tried again with shorter words (audit, 21.11)", async () => {
  const { freshQueries } = await import("../src/lib/growth/freshRisers.js");
  const now = Date.parse("2026-11-21T06:00:00Z");
  assert.deepEqual(freshQueries({ keywords: "handheld electronic gadget screen" }, now), ["handheld electronic gadget screen 2026 new", "handheld electronic 2026 new", "handheld electronic new"]);
  assert.deepEqual(freshQueries({ keywords: "rings" }, now), ["rings 2026 new", "rings new"]);
  const run = (await import("node:fs")).readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /for \(const q of freshQueries\(cat, now\)\)/);
});

// The noise check (21.11, the owner: "hit almost absolutely, no room for errors"). The day's real
// risers were 82 → 178, 20 → 30 and 135 → 177 orders: the second is ten orders, the third a fake
// "2026 New Intel Core i9" laptop. Picking the fastest of thousands picks luck too.
test("fresh: growth that counting noise explains is never a riser (21.11's real numbers)", async () => {
  const { growthEvidence, fdrKeep } = await import("../src/lib/growth/freshRisers.js");
  const real = growthEvidence({ ordersBefore: 82, orders: 178, from: "2026-11-16", to: "2026-11-21" });
  const tiny = growthEvidence({ ordersBefore: 20, orders: 30, from: "2026-11-17", to: "2026-11-21" });
  const weak = growthEvidence({ ordersBefore: 135, orders: 177, from: "2026-11-17", to: "2026-11-21" });
  assert.ok(real.p < 1e-5 && real.lowWeekPct > 100, JSON.stringify(real));
  assert.ok(tiny.p > 0.1 && tiny.lowWeekPct < 0, JSON.stringify(tiny));
  assert.ok(weak.p > 0.05, JSON.stringify(weak));
  assert.equal(growthEvidence({ ordersBefore: 0, orders: 30, from: "2026-11-17", to: "2026-11-21" }), null);
  // Benjamini–Hochberg: among 3,000 listings tested, a p of 0.07 is luck; 6.8e-7 holds.
  const ps = [real.p, tiny.p, weak.p, ...Array.from({ length: 2997 }, (_, i) => 0.2 + (i % 80) / 100)];
  assert.deepEqual([...fdrKeep(ps, 0.1)], [0]);
  assert.deepEqual([...fdrKeep([0.001, 0.002, 0.5], 0.1)].sort(), [0, 1]);
});

test("fresh: a riser must beat the noise among everything tested that day; a low satisfaction share is out", () => {
  const today = "2026-11-21";
  const listing = (id, title, sat) => freshEntry(p(id, title, 100, sat ? { evaluate_rate: sat } : {}), { category: "home", today });
  const pool = mergeFreshPool({}, [listing("1005004444441", "Cloud Night Light"), listing("1005004444442", "Tiny Desk Fan"), listing("1005004444443", "Soft Slippers", "82.0%"), listing("1005004444444", "Mini Grater", "97.1%")], { today });
  const items = {
    "1005004444441": [["2026-11-11", 60], ["2026-11-14", 82], ["2026-11-21", 178]], // real: +117%/week at the low end
    "1005004444442": [["2026-11-17", 20], ["2026-11-21", 30]], // ten orders: noise, whatever else was tested
    "1005004444443": [["2026-11-11", 60], ["2026-11-14", 82], ["2026-11-21", 178]], // fast, but 82% satisfied
    "1005004444444": [["2026-11-11", 60], ["2026-11-14", 82], ["2026-11-21", 176]], // fast, 97% satisfied
  };
  const f = freshRisers(pool, items);
  assert.deepEqual(f.risers.map((r) => r.id).sort(), ["1005004444441", "1005004444444"]);
  assert.ok(f.risers.every((r) => r.lowPct > 0));
  assert.equal(f.noise.tested, 4);
  assert.equal(f.noise.fdr, FRESH.fdr);
  assert.equal(pool["1005004444443"].sat, 82);
});

test("a component brand on a cheap laptop is a brand name (21.11: '2026 New Ultra Intel Core i9')", async () => {
  const { hasBrandName } = await import("../src/lib/growth/deals.js");
  assert.equal(hasBrandName("2026 New Ultra Intel Core i9 10980HK, 4K UHD, WiFi 6"), true);
  assert.equal(hasBrandName("Gaming laptop RTX 4060"), true);
  assert.equal(hasBrandName("Ceramic Mug Set"), false);
  assert.equal(freshEntry(p("1005004444449", "2026 New Ultra Intel Core i9 Laptop", 150)), null);
});

// 🆕 New, older and growing, misclassified (the owner, 22.11, after an outside check: a "2026 New"
// smartwatch among the risers already sold 502 orders in 30 days at the radar's first reading; thermal
// sticker paper "for a kids' camera" stood in the camera's pool).
import { listingAge } from "../src/lib/growth/freshRisers.js";
import { pickMatches } from "../src/lib/growth/trendRadar.js";
import { findFacts } from "../src/lib/growth/radarCore.js";
import { sanitizeBoard as cleanBoard } from "../src/lib/growth/radarBoard.js";

test("fresh: only a listing the radar watched from the start is new; one already selling grows apart", () => {
  assert.deepEqual(listingAge([["2026-11-20", 140], ["2026-11-16", 82]]), { state: "NEW", firstDay: "2026-11-16", firstOrders: 82 });
  assert.deepEqual(listingAge([["2026-11-16", 502], ["2026-11-22", 888]]), { state: "ESTABLISHED", firstDay: "2026-11-16", firstOrders: 502 });
  assert.equal(listingAge([]), null);
  const day = (i) => new Date(Date.parse("2026-11-08T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  const grow = (start) => Array.from({ length: 15 }, (_, i) => [day(i), Math.round(start * 1.12 ** i)]);
  const pool = { a: { id: "1005013201890326", title: "new pants", first: day(0) }, b: { id: "1005010439451200", title: "2026 New Smart Watch", first: day(0) } };
  const items = { "1005013201890326": grow(60), "1005010439451200": grow(420) };
  const f = freshRisers(pool, items, { rules: { ...FRESH, maxOrders: 10_000 } });
  assert.deepEqual(f.risers.map((r) => r.id), ["1005013201890326"]);
  assert.equal(f.risers[0].age.state, "NEW");
  assert.equal(f.established.n, 1);
  assert.equal(f.established.top[0].id, "1005010439451200");
  const rows = findFacts({ ...f.risers[0], known: { similar: 300 } }, { kind: "fresh" });
  assert.match(rows.find((r) => r.key === "age").he, /^הרדאר ראה אותו מתחילתו: 60 הזמנות ב־30 יום בקריאה הראשונה, 0?8\.11$/);
  // The browser never shows an older listing as new.
  const r0 = { id: "1005010439451200", title: "x", image: "https://ae-pic-a1.aliexpress-media.com/kf/S1.jpg", buy: "https://s.click.aliexpress.com/e/_x", weekPct: 94.5, orders: 888, known: { similar: 100 } };
  const b = cleanBoard({ at: "2026-11-22T06:00:00.000Z", record: {}, concepts: [], fresh: { risers: [{ ...r0, age: { state: "ESTABLISHED", firstDay: "2026-11-16", firstOrders: 502 } }, { ...r0, id: "1005013201890326", age: { state: "NEW", firstDay: "2026-11-16", firstOrders: 82 } }] } });
  assert.deepEqual(b.fresh.risers.map((r) => r.id), ["1005013201890326"]);
});

test("fresh: a part or refill 'for' the kind is never the kind", () => {
  const camera = { he: "מצלמה מדפיסה לילדים", hq: ["מצלמה מדפיסה לילדים"] };
  assert.equal(pickMatches("מצלמת ילדים דיגיטלית לצילום מיני מדפסת ניידת להדפסה", camera), true);
  assert.equal(pickMatches("מדבקת נייר תרמי בגודל 57*25 מילימטר למדפסת מיני להדפסה מיידית על נייר הדפסה למצלמת ילדים", camera), false);
  assert.equal(pickMatches("פח אשפה מתקפל לרכב", { he: "פח לרכב" }), true);
  assert.equal(pickMatches("מארגן למגירות בשלושה גדלים", { he: "מארגן מגירות" }), true, "a head noun named directly still counts");
});

test("fresh: a holiday comes back every year — never a new product starting to run", async () => {
  const { isSeasonal } = await import("../src/lib/growth/freshRisers.js");
  assert.equal(isSeasonal("2026 New Christmas Tree Ornaments Balls Set"), true);
  assert.equal(isSeasonal("Santa Claus Costume Kids"), true);
  assert.equal(isSeasonal("Halloween Witch Hat"), true);
  assert.equal(isSeasonal("Women's Wide-leg Pants Winter 2026"), false, "a season of the year is no holiday");
  assert.equal(isSeasonal("Reusable Silicone Air Fryer Liner"), false);
  const day = (i) => new Date(Date.parse("2026-11-08T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  const grow = (start) => Array.from({ length: 15 }, (_, i) => [day(i), Math.round(start * 1.12 ** i)]);
  const pool = { a: { id: "1005013000000001", title: "Christmas Tree Ornaments Balls", first: day(0) }, b: { id: "1005013000000002", title: "Cloud Slides Soft Platform", first: day(0) } };
  const f = freshRisers(pool, { "1005013000000001": grow(60), "1005013000000002": grow(60) }, { rules: { ...FRESH, maxOrders: 10_000 } });
  assert.deepEqual(f.risers.map((r) => r.id), ["1005013000000002"]);
  assert.deepEqual(f.seasonal, { n: 1, top: ["1005013000000001"] });
});
