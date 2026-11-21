// 📣 One engine for Telegram and Instagram (src/lib/growth/channelEngine.js; the owner, 2026-11-21:
// "why does Telegram show the same product every time, and not what I asked", then the master mission:
// "Telegram must select from the latest actual ranked discovery results", "concurrency-safe delivery
// state", "a 14-day repeat cooldown", "at least 90 minutes between posts", "no forced publishing").
// The fixtures are the real rows of the radar board of 21.11 01:35 UTC (kv radar:board) and the real
// site records they point to; only the history and the clock are set by the test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENGINE, candidatesFrom, claimOf, identityKeys, imageKey, instagramPackage, planChannels, radarPool, rankCandidates,
  selectNext, settleClaim, smartBuy, telegramPost, trendHeat, withClaim,
} from "../src/lib/growth/channelEngine.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const BUY = (k) => `https://s.click.aliexpress.com/s/${k}pyFri10M6ltAv61YZY9TfrxiDaaFXRre`;
const IMG = (f) => `https://ae-pic-a1.aliexpress-media.com/kf/${f}.jpg`;
const slippers = {
  id: "platform-fur-slippers", kind: "style", stage: "RISING", he: "נעלי בית פלטפורמה עם פרווה", match: ["נעלי בית פרווה", "נעלי בית פלטפורמה", "נעלי בית פלטפורמה עם פרווה"],
  gap: { state: "ARRIVED", he: "כבר מחפשים בארץ", confidence: "HIGH" }, world: { state: "EARLY", he: "מתחילים לחפש בעולם", searched: 1, of: 9 }, measured: "2026-11-21",
  pick: { itemId: "1005009763188833" },
};
const sweaterKind = { id: "chunky-knit-sweater", kind: "style", stage: "STEADY", he: "סוודר סרוג עבה", match: ["סוודר סרוג"], gap: { state: "ARRIVED", he: "כבר מחפשים בארץ" }, world: { state: "WIDE" } };
const hot = (id, title, before, after, weekPct, from = "2026-11-15") => ({ id, title, orders: after, ordersBefore: before, weekPct, from, to: "2026-11-21", state: "HOT", he: "חם עכשיו" });
const board = () => ({
  at: "2026-11-21T01:35:53.097Z",
  concepts: [slippers, sweaterKind],
  record: {},
  site: {
    hot: [
      hot("ae-1005013236635286", "כפכפי פרווה לנשים מתאימים לחורף ולשימוש בחוץ", 5161, 6858, 48.9, "2026-11-16"),
      hot("ae-1005007011405828", "2 ב 1 לשפוך תרסיס מרסס מטגן אוויר שמן מנפק בקבוק זית", 1882, 2532, 34.5, "2026-11-14"),
      hot("ae-1005012966678990", "מגש אחסון כבלים USB עם 11 22 תאים", 4761, 5751, 24.7),
      hot("ae-1005012967925438", "נעלי בית פרוותיות לנשים", 6386, 7458, 19.8),
      hot("ae-1005013205496649", "מגש אחסון כבלים USB עם 11 22 תאים", 5274, 6104, 18.6),
      hot("ae-1005008077732057", "סוודר צווארון גולף לנשים חורף רטרו עם בטנת קטיפה", 2395, 2581, 14, "2026-11-17"),
    ],
  },
  fresh: { risers: [
    { id: "1005013201890326", title: "FSLE Women's Wide-leg Straight-leg Slim-fit Casual Pants with No Waistband New Style for Winter 2026", image: IMG("Sba267ebd6eb44d788aac48866224798ft"), buy: BUY("a"), price: 171.84, orders: 170, ordersBefore: 82, from: "2026-11-16", to: "2026-11-21", weekPct: 177.5, known: { phrase: "fsle women's", similar: 1483 }, called: "2026-11-20", due: "2026-12-04" },
    { id: "1005013253354226", title: "Golden Camel Men's High-top Snow Boots 2026 Winter New Thick-Soled Velvet Warm", image: IMG("Sgoldencamelbootsxxxxxxxx1"), buy: BUY("b"), price: 284.37, orders: 30, ordersBefore: 20, from: "2026-11-17", to: "2026-11-21", weekPct: 103.3, known: { phrase: "golden camel", similar: 900 } },
  ] },
});
const product = (id, title, image, extra = {}) => ({ id, title, image, status: "approved", marketerId: "msd6go4kff49s5", affiliateUrl: BUY(id), price: 17.69, priceSource: "aliexpress_api", priceCheckedAt: "2026-11-20T09:00:00Z", kind: "home", ...extra });
// The two cable trays are one product: the same photo file and title under two item ids (21.11).
const products = () => [
  product("ae-1005013236635286", "כפכפי פרווה לנשים מתאימים לחורף ולשימוש בחוץ", IMG("S4464de2cd498401f8ae3d35914ccd1e9x"), { status: "archived", kind: "clothing" }),
  product("ae-1005007011405828", "2 ב 1 לשפוך תרסיס מרסס מטגן אוויר שמן מנפק בקבוק זית", IMG("Soilsprayer0000000000000001")),
  product("ae-1005012966678990", "מגש אחסון כבלים USB עם 11 22 תאים", IMG("Sd14a5415d3a44a52a49d07f351843e77P"), { price: 18.79 }),
  product("ae-1005012967925438", "נעלי בית פרוותיות לנשים", IMG("Sfurryslippers000000000000001"), { kind: "clothing" }),
  product("ae-1005013205496649", "מגש אחסון כבלים USB עם 11 22 תאים", IMG("Sd14a5415d3a44a52a49d07f351843e77P")),
  product("ae-1005008077732057", "סוודר צווארון גולף לנשים חורף רטרו עם בטנת קטיפה", IMG("Sturtleneck000000000000000001"), { kind: "clothing" }),
];
const plan = (history = [], b = board()) => planChannels(b, products(), { telegram: history }, { now: NOW, siteOrigin: "https://likelink2.vercel.app" });

test("candidates come from the latest board only: site HOT rows, the radar's pool and its discoveries", () => {
  const c = candidatesFrom(board(), products(), { now: NOW });
  assert.deepEqual([...new Set(c.map((x) => x.source))].sort(), ["fresh_riser", "site_hot"]);
  assert.equal(candidatesFrom(null, products()).length, 0, "no board → no candidate (never the catalog alone)");
  assert.equal(candidatesFrom({ concepts: [] }, products()).length, 0, "a board with nothing measured → nothing");
  for (const x of c) assert.ok(x.evidence.retrievedAt && x.evidence.from && x.evidence.to && x.evidence.market, `${x.itemId}: source, dates and market are kept`);
});

test("the two USB cable trays are one product (same photo file, same title, two item ids)", () => {
  assert.equal(imageKey(IMG("Sd14a5415d3a44a52a49d07f351843e77P")), "sd14a5415d3a44a52a49d07f351843e77p");
  const { ranked, rejected } = rankCandidates(candidatesFrom(board(), products(), { now: NOW }), { now: NOW });
  const trays = ranked.filter((r) => /כבלים/.test(r.title));
  assert.equal(trays.length, 1, "only one tray is ranked");
  assert.equal(trays[0].alsoListedAs.length, 1, "the other listing is recorded on it");
  assert.ok(rejected.some((r) => r.reason === "same_product_as" && /כבלים/.test(r.title)));
});

test("weak or unsafe candidates are rejected with a named reason", () => {
  const { ranked, rejected } = rankCandidates(candidatesFrom(board(), products(), { now: NOW }), { now: NOW });
  const why = Object.fromEntries(rejected.map((r) => [r.itemId, r.reason]));
  // +49% a week, but the radar archived it on 19.11: it failed the 95% satisfaction check.
  assert.equal(why["1005013236635286"], "archived_by_radar_quality_check");
  // A discovery with 30 orders is not real demand yet.
  assert.equal(why["1005013253354226"], "too_few_orders");
  assert.ok(!ranked.some((r) => r.itemId === "1005013236635286" || r.itemId === "1005013253354226"));
  const brand = rankCandidates([{ ...candidatesFrom(board(), products(), { now: NOW })[1], title: "Lululemon Align leggings", storeTitle: "Lululemon Align leggings" }], { now: NOW });
  assert.equal(brand.rejected[0].reason, "brand_name");
  const stale = { ...board(), site: { hot: [hot("ae-1005007011405828", "x", 1882, 2532, 34.5, "2026-11-01")].map((r) => ({ ...r, to: "2026-11-10" })) }, fresh: { risers: [] } };
  assert.equal(rankCandidates(candidatesFrom(stale, products(), { now: NOW }), { now: NOW }).rejected[0].reason, "stale_measurement");
});

test("a missing measurement lowers confidence and scores 0, never counts as positive", () => {
  const [c] = candidatesFrom({ ...board(), fresh: { risers: [] } }, products(), { now: NOW }).filter((x) => x.itemId === "1005007011405828");
  const h = trendHeat(c, { now: NOW });
  assert.equal(h.parts.spread, null);
  assert.equal(h.parts.saturation, null);
  assert.ok(h.confidence < 1 && h.confidence === 0.65, `confidence ${h.confidence}`);
  const b = smartBuy(c, { now: NOW });
  assert.equal(b.parts.value, null, "sellers were not compared for a site row");
  assert.ok(b.confidence < 1);
  // The same row with the Israel gap measured as quiet scores higher and is more certain.
  const withGap = trendHeat({ ...c, israel: { state: "GAP" }, world: { state: "EARLY" } }, { now: NOW });
  assert.ok(withGap.score > h.score && withGap.confidence === 1);
});

test("Telegram: one post per pick, a different trend every post, never the same product within 14 days", () => {
  const p1 = plan();
  assert.ok(p1.telegram.pick, "a strong candidate exists today");
  const first = p1.telegram.pick;
  // History after the first post, then 3 hours later the next run.
  let history = [{ ...claimOf(first, { now: NOW }), state: "SENT", providerId: "601" }];
  const seen = [first];
  for (let i = 1; i <= 6; i++) {
    const t = NOW + i * 3 * 3_600_000;
    const p = planChannels(board(), products(), { telegram: history }, { now: t, siteOrigin: "https://likelink2.vercel.app" });
    if (!p.telegram.pick) break;
    const pick = p.telegram.pick;
    assert.ok(!seen.some((s) => s.keys.some((k) => pick.keys.includes(k))), `run ${i}: ${pick.itemId} was never sent before`);
    assert.ok(!seen.some((s) => s.trend.key === pick.trend.key), `run ${i}: a different trend (${pick.trend.key})`);
    seen.push(pick);
    history = [{ ...claimOf(pick, { now: t }), state: "SENT", providerId: String(601 + i) }, ...history];
  }
  assert.ok(seen.length >= 3, `several different trends were posted (${seen.map((s) => s.trend.key).join(", ")})`);
  // When every strong candidate was posted, the channel stays quiet and says why.
  const end = planChannels(board(), products(), { telegram: history }, { now: NOW + 30 * 3_600_000, siteOrigin: "x" });
  assert.equal(end.telegram.pick, null);
  assert.match(end.telegram.reason, /every_strong_candidate_was_posted|nothing_clears/);
});

test("never two posts within 90 minutes; a running claim blocks the slot", () => {
  const first = plan().telegram.pick;
  const sent = [{ ...claimOf(first, { now: NOW - 30 * 60_000 }), state: "SENT", providerId: "9" }];
  assert.equal(selectNext(plan().ranked, sent, { now: NOW }).reason, "too_soon");
  const claimed = [{ ...claimOf(first, { now: NOW - 5 * 60_000 }) }];
  assert.equal(selectNext(plan().ranked, claimed, { now: NOW }).reason, "too_soon");
  const failed = settleClaim(claimed, claimed[0].id, { error: "telegram 502", now: NOW });
  assert.equal(failed[0].state, "FAILED");
  assert.ok(selectNext(plan().ranked, failed, { now: NOW }).pick, "a failed send frees the slot");
});

test("a product returns within 14 days only with materially new evidence, and the reason is stated", () => {
  const p = plan();
  const pick = p.telegram.pick;
  const old = { ...claimOf(pick, { now: NOW - 3 * 86_400_000 }), state: "SENT", snap: { ...claimOf(pick).snap, weekPct: (pick.evidence.weekPct || 0) - 25 }, trend: "c:another-trend" };
  const back = selectNext(p.ranked, [old], { now: NOW });
  assert.equal(back.pick.itemId, pick.itemId);
  assert.equal(back.pick.returnReason.code, "faster");
  assert.match(telegramPost(back.pick).text, /🔄 חוזר כי הקצב עלה/);
  const same = { ...old, snap: claimOf(pick).snap };
  const skip = selectNext(p.ranked, [same], { now: NOW });
  assert.notEqual(skip.pick?.itemId, pick.itemId);
  assert.ok(skip.skipped.some((s) => s.itemId === pick.itemId && s.reason === "sent_within_14_days"));
});

test("two runs at the same moment can never both send (20.11: the same product twice, 79 s apart)", async () => {
  const { updateChannelHistory } = await import("../api/autopilot.mjs");
  // An in-memory compare-and-swap row, like kv's updated_at version.
  let row = { value: [], version: "v0" };
  let n = 0;
  const read = async () => ({ ok: true, value: row.value, version: row.version });
  const swap = async (_k, value, version) => { if (version !== row.version) return false; row = { value, version: `v${++n}` }; return true; };
  const pick = plan().telegram.pick;
  // Both runs read the same empty history first (the race of 20.11), then both try to claim.
  const a = claimOf(pick, { now: NOW, runId: "run-a" });
  const b = claimOf(pick, { now: NOW + 79_000, runId: "run-b" });
  const [ra, rb] = await Promise.all([
    updateChannelHistory("channel:history:x", (list) => withClaim(list, a, { now: NOW }), { read, swap }),
    updateChannelHistory("channel:history:x", (list) => withClaim(list, b, { now: NOW + 79_000 }), { read, swap }),
  ]);
  assert.equal([ra, rb].filter((r) => r.ok).length, 1, "exactly one run holds the slot");
  assert.equal([ra, rb].find((r) => !r.ok).error, "slot_taken");
  assert.equal(row.value.length, 1, "one claim in the history, none erased");
  const unreadable = await updateChannelHistory("k", (l) => l, { read: async () => ({ ok: false }), swap });
  assert.equal(unreadable.error, "history_unreadable", "an unreadable history sends nothing");
});

test("a quiet day: nothing measured hot → no post, and the reason is named", () => {
  const quiet = { at: "2026-11-21T01:35:53Z", concepts: [slippers], record: {}, site: { hot: [] }, fresh: { risers: [] } };
  const p = planChannels(quiet, products(), {}, { now: NOW });
  assert.equal(p.telegram.pick, null);
  assert.equal(p.telegram.reason, "nothing_clears_the_bar_today");
  assert.equal(p.instagram.pkg, null);
});

test("the post looks like the deals groups (photo, short lines, one link, join links), with dated evidence and both scores", () => {
  const pick = plan().telegram.pick;
  const join = { telegram: "https://t.me/likelink_deals", whatsapp: "https://chat.whatsapp.com/abc" };
  const { text, image, link } = telegramPost(pick, { link: "https://likelink2.vercel.app/p/x", join });
  assert.match(text, /^#פרסומת · קישור שותפים\n🔥 /);
  assert.match(text, /✨ [\u0590-\u05ff]/, "a Hebrew name");
  assert.match(text, /📈 ההזמנות עלו \d+% בשבוע · לפי החנות, \d+\.\d+ ← \d+\.\d+/);
  assert.match(text, /🧾 [\d,]+ ← [\d,]+ הזמנות ב־30 יום, כפי שהחנות מדווחת/);
  assert.match(text, /📊 מדד טרנד \d+ · קנייה חכמה \d+ · הכי חזק מתוך \d+/);
  assert.match(text, /👉 https:\/\/likelink2\.vercel\.app\/p\/x/);
  assert.match(text, /―+\n🚀 להצטרפות לטלגרם: https:\/\/t\.me\/likelink_deals\n💚 לקבוצת הוואטסאפ: https:\/\/chat\.whatsapp\.com\/abc/);
  assert.match(text, /🕒 נמדד \d+\.\d+ \d\d:\d\d$/);
  assert.ok(/^https:\/\//.test(image) && link);
  for (const w of ["בטוח", "מובטח", "תחזית", "היחיד", "לפני כולם", "דירוג", "מקורי", "לוגו"]) assert.ok(!text.includes(w), `no "${w}"`);
  assert.ok(text.length <= 1024 - 150, "fits a photo caption");
  // Without her join links set, the post has none (never a guessed link).
  assert.doesNotMatch(telegramPost(pick).text, /להצטרפות|לקבוצת/);
});

test("WhatsApp gets the same post, ready to send (its API never posts into a group)", async () => {
  const { whatsappPost } = await import("../src/lib/growth/channelEngine.js");
  const p = plan();
  assert.equal(p.whatsapp.pick.itemId, p.telegram.pick.itemId, "one engine, one pick");
  const w = whatsappPost(p.telegram.pick, { link: "https://likelink2.vercel.app/p/x" });
  assert.equal(w.state, "READY_TO_SEND");
  assert.match(w.text, /^#פרסומת · קישור שותפים\n\*🔥 .+\*\n/, "the headline in WhatsApp bold");
  assert.ok(w.open.startsWith("https://wa.me/?text=") && decodeURIComponent(w.open.slice(20)) === w.text);
});

test("a brand-name listing never reaches a post, even when it is the hottest (LV, UGG, Nike, Miu Miu…)", () => {
  const base = candidatesFrom(board(), products(), { now: NOW }).find((c) => c.itemId === "1005007011405828");
  for (const t of ["Louis Vuitton LV mini bag", "UGG platform boots", "Nike Air socks", "Miu Miu bucket bag", "Zara suede jacket", "Alo yoga set"]) {
    const r = rankCandidates([{ ...base, title: t, storeTitle: t, evidence: { ...base.evidence, weekPct: 300 } }], { now: NOW });
    assert.equal(r.ranked.length, 0, t);
    assert.equal(r.rejected[0].reason, "brand_name", t);
  }
});

test("Instagram is fed by the same ranking (prepared only, never published here)", () => {
  const p = plan();
  assert.equal(p.instagram.pick.itemId, p.telegram.pick.itemId, "the same engine and the same top pick for an empty history");
  const pkg = instagramPackage(p.instagram.pick);
  assert.equal(pkg.state, "PREPARED");
  assert.match(pkg.caption, /^#פרסומת · קישור שותפים/);
  assert.match(pkg.caption, /כתבו ״אני״ בתגובות/);
  assert.equal(pkg.carousel.length, 4);
});

test("the radar's pool: only listings HOT on their own measured momentum, sellers compared per kind", () => {
  const listings = { "platform-fur-slippers": [
    { id: "1005000000000001", title: "נעלי בית פרווה פלטפורמה", image: IMG("Sa1aaaaaaaaaaaaaaaaaaaaaa"), price: 31.6, buy: BUY("c"), sat: "97+", words: 3 },
    { id: "1005000000000002", title: "נעלי בית פרווה רכות", image: IMG("Sb2bbbbbbbbbbbbbbbbbbbbbb"), price: 24.9, buy: BUY("d"), sat: "95+", words: 2 },
    { id: "1005000000000003", title: "נעלי בית פרווה", image: IMG("Sc3cccccccccccccccccccccc"), price: 19.9, buy: BUY("e"), sat: "95+", words: 2 },
  ] };
  const m = { "1005000000000001": { state: "HOT", weekPct: 31, orders: 4200, ordersBefore: 3300, from: "2026-11-14", to: "2026-11-21" }, "1005000000000002": { state: "HOT", weekPct: 12, orders: 900, ordersBefore: 800, from: "2026-11-14", to: "2026-11-21" }, "1005000000000003": { state: "SLOW", weekPct: 2, orders: 5000 } };
  const pool = radarPool(listings, (id) => m[id], [slippers], { now: NOW });
  assert.deepEqual(pool.list.map((r) => r.id), ["1005000000000001", "1005000000000002"], "the SLOW seller is out");
  assert.equal(pool.list[0].compared, 3);
  assert.equal(pool.list[0].cheapest, 24.9, "the cheapest verified price among the HOT sellers");
  // The pool survives the board sanitizer (her own links, store photos), and the lock keeps it out of the teaser.
  const clean = sanitizeBoard({ ...board(), record: { calls: 0 }, pool: { ...pool, list: [...pool.list, { ...pool.list[0], id: "1005000000000009", buy: "https://evil.example/x" }] } });
  assert.equal(clean.pool.list.length, 2);
  assert.equal(teaserBoard(clean).pool, undefined);
  // A pool row is a DUPE of the look (a style kind), with the sellers compared.
  const c = candidatesFrom({ ...board(), pool }, products(), { now: NOW }).find((x) => x.source === "radar_listing");
  assert.equal(c.match.label, "DUPE");
  assert.equal(c.sellers.compared, 3);
  assert.equal(smartBuy(c, { now: NOW }).parts.value, 0.6, "not the cheapest of the HOT sellers");
});

test("identity keys: item id, photo file and title", () => {
  const k = identityKeys({ itemId: "1005012966678990", image: IMG("Sd14a5415d3a44a52a49d07f351843e77P"), title: "מגש אחסון כבלים USB עם 11 22 תאים" });
  assert.deepEqual(k.map((x) => x.split(":")[0]), ["item", "img", "title"]);
});

test("the owner's autopilot runs the engine before any older path, with a strict history and a store check", () => {
  const src = readFileSync(new URL("../api/autopilot.mjs", import.meta.url), "utf8");
  assert.ok(src.indexOf("return runChannelEngine(store, marketerId, cfg, origin, board)") < src.indexOf("lookPool(pool, board)"));
  assert.match(src, /history_unreadable: nothing sent/);
  assert.match(src, /aliexpressItemFacts\(pick\.itemId/);
  assert.match(src, /withClaim\(list, claim/);
  assert.match(src, /settleClaim\(list, claim\.id/);
  assert.equal(ENGINE.repeatDays, 14);
  assert.equal(ENGINE.minGapMinutes, 90);
});

test("the photo check (lens on the runner): its own kind first, or top three with 15%; a 0% kind is never a match", async () => {
  const { visualVerdict } = await import("../scripts/marketing/channel-preview.mjs");
  // The real answers of 21.11's run.
  assert.equal(visualVerdict([{ id: "category-car", p: 1 }, { id: "car-seat-gap-filler", p: 0 }, { id: "bag-charm", p: 0 }], "car-seat-gap-filler").verdict, "CATEGORY_ONLY");
  assert.equal(visualVerdict([{ id: "butter-squishy", p: 0.6 }, { id: "mini-food-squishy-set", p: 0.17 }, { id: "fruit-squishy", p: 0.12 }], "crunchy-squishy").verdict, "MISMATCH");
  assert.equal(visualVerdict([{ id: "oil-sprayer", p: 1 }, { id: "bag-charm", p: 0 }], "oil-sprayer").verdict, "MATCH");
  assert.equal(visualVerdict([{ id: "category-mensocks", p: 0.84 }, { id: "leg-warmers", p: 0.13 }, { id: "ribbed-crew-socks", p: 0.02 }], "ribbed-crew-socks").verdict, "CATEGORY_ONLY");
  // The verdict travels on the board, and a photo of another kind is rejected by the server's engine too.
  const listing = { id: "1005000000000001", kind: "platform-fur-slippers", title: "נעלי בית פרווה", image: IMG("Sa1aaaaaaaaaaaaaaaaaaaaaa"), price: 31.6, buy: BUY("c"), sat: "97+", words: 2, orders: 4200, ordersBefore: 3300, from: "2026-11-14", to: "2026-11-21", weekPct: 31, compared: 3, cheapest: 24.9, at: "2026-11-21" };
  const clean = sanitizeBoard({ ...board(), record: { calls: 0 }, pool: { at: "x", kinds: 1, list: [{ ...listing, visual: "MISMATCH" }] } });
  assert.equal(clean.pool.list[0].visual, "MISMATCH");
  const r = rankCandidates(candidatesFrom({ ...board(), site: { hot: [] }, fresh: { risers: [] }, pool: clean.pool }, products(), { now: NOW }), { now: NOW });
  assert.equal(r.rejected[0].reason, "photo_shows_another_kind");
});
