// The trend radar (/radar): "what is about to become a hit, before it reaches Israel" (the owner,
// 2026-11-14: "a magic button for spotting trends before they arrive, reliable, verified, that
// nobody in the world has").
//
// The idea: the factories know first. Long before a product shows up in Israeli feeds, AliExpress
// shows two things nobody else measures for Israel: buyers ordering faster every day, and sellers
// rushing to list the same item. LikeLink2 reads both every day, for every "concept" on its watch
// list (one search term: "butter stick squishy", "italian charm bracelet"…), and turns the readings
// into a stage with its evidence:
//
//   EMERGING  — orders rising fast while the concept is still small (the early window)
//   RISING    — orders rising across most of the concept's items
//   PEAK      — big and flat: everyone already has it
//   COOLING   — orders falling
//   STEADY    — none of the above
//   UNVERIFIED — fewer than two readings, or too close together: nothing is claimed
//
// Every number is AliExpress's own, dated, and shown next to the claim ("why here"). The radar
// never says "this will be a hit": it shows signals. And it grades itself in public: every time a
// concept is flagged EMERGING or RISING, the call is saved with its date and base; 14 days later it
// is graded HIT (demand grew at least RADAR.hitPct) or MISS, and the record is printed on the page.
// Pure: no I/O. The collector is scripts/catalog/trend-radar.mjs; the page reads its board.json.
import { orderCount } from "./deals.js";
import { FIND_RULES, findResults } from "./findOnAli.js";
import { CONFIDENCE, GAP_STATES, WINDOWS, gapOf, leadTimes, windowOf } from "./israelGap.js";
import { ACTIONS, HOT_STATES, actionOf, itemMomentum, momentumLine, opportunityOf } from "./radarOpportunity.js";

export const RADAR = Object.freeze({
  topItems: 20, // the items whose orders make a concept's demand
  minItemOrders: 30, // an item below this is noise, not demand
  keepReadings: 45, // per concept (one a day)
  minSpanDays: 2, // the earliest a second reading counts
  windowDays: 7, // growth is compared over (up to) this many days
  emergingPct: 25, // 7-day demand growth that makes a small concept EMERGING
  risingPct: 10, // …and any concept RISING (with breadth)
  coolingPct: -10,
  smallOrders: 25_000, // a concept below this (30-day orders, top items) is still "small"
  peakOrders: 60_000, // and above this, with flat growth, PEAK
  minBreadth: 0.5, // the share of paired items that grew, for RISING
  hitPct: 15, // a call is a HIT when demand grew this much within gradeDays
  gradeDays: 14,
  pickRules: Object.freeze({ ...FIND_RULES, minPositivePct: 95, minOrders: 300, max: 1 }),
});

export const STAGES = Object.freeze({
  EMERGING: { he: "מתחיל לעלות", hint: "קטן עדיין, וההזמנות מאיצות" },
  RISING: { he: "בעלייה", hint: "ההזמנות עולות ברוב הפריטים" },
  PEAK: { he: "בשיא", hint: "גדול ויציב: כבר יש לכולם" },
  COOLING: { he: "דועך", hint: "ההזמנות יורדות" },
  STEADY: { he: "יציב", hint: "בלי שינוי חד" },
  UNVERIFIED: { he: "בבדיקה", hint: "צריך עוד מדידה כדי לומר משהו" },
});

const DAY = 86_400_000;
export const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (n, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);
const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "?");
const pct = (n) => `${n > 0 ? "+" : ""}${Math.round(n)}%`;
const dm = (d) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`;

/** A concept as stored: id (a-z0-9-), Hebrew name, the store search words, the shop kind. */
export function validConcept(c = {}) {
  return /^[a-z0-9][a-z0-9-]{1,40}$/.test(String(c.id || "")) && String(c.he || "").trim().length > 1 && /^[a-z0-9 '&-]{3,60}$/i.test(String(c.en || ""));
}

/**
 * One day's reading of one concept from a product.query answer (sorted by recent orders):
 * how many listings match (the sellers), and the top items' recent orders and prices.
 */
export function readingFrom(result = {}, { now = Date.now(), rules = RADAR } = {}) {
  const raw = result?.products?.product;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const listings = Number(result?.total_record_count);
  const top = [];
  const seen = new Set();
  for (const x of list) {
    const id = String(x?.product_id || "");
    const v = orderCount(x);
    if (!/^\d{6,20}$/.test(id) || seen.has(id) || v === null || v < rules.minItemOrders) continue;
    seen.add(id);
    const price = String(x?.target_sale_price_currency || "") === "ILS" ? Number(x.target_sale_price) : NaN;
    top.push([id, v, Number.isFinite(price) ? round(price, 2) : null]);
  }
  top.sort((a, b) => b[1] - a[1]);
  const kept = top.slice(0, rules.topItems);
  return {
    d: dayOf(now),
    listings: Number.isFinite(listings) && listings >= 0 ? listings : null,
    sum: kept.reduce((s, x) => s + x[1], 0),
    price: round(median(kept.map((x) => x[2]).filter((p) => p > 0)), 2),
    top: kept,
  };
}

/** Adds today's reading (one per day; a later one the same day replaces it). */
export function addReading(readings = [], reading, { rules = RADAR } = {}) {
  const prev = (Array.isArray(readings) ? readings : []).filter((r) => r && r.d && r.d !== reading.d);
  return [...prev, reading].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-rules.keepReadings);
}

/** Growth over `span` days, scaled to a 7-day rate (compounding), so short and long gaps compare. */
export const perWeek = (g, span) => (span > 0 && g > -1 ? (Math.pow(1 + g, 7 / span) - 1) * 100 : null);

/**
 * The signals of one concept from its readings: the newest against the oldest reading within the
 * window. Demand growth is the median growth of the items seen in both readings (one viral item
 * cannot fake a trend); breadth is the share of those items that grew; supply is the change in
 * matching listings; price is the change of the top items' median price.
 */
export function signals(readings = [], { rules = RADAR } = {}) {
  const rs = (Array.isArray(readings) ? readings : []).filter((r) => r?.d && Array.isArray(r.top));
  const now = rs.at(-1);
  if (!now) return { ok: false, reason: "no_reading" };
  const base = [...rs].reverse().find((r) => daysBetween(r.d, now.d) >= rules.minSpanDays && daysBetween(r.d, now.d) <= rules.windowDays)
    || (rs.length > 1 && daysBetween(rs[0].d, now.d) >= rules.minSpanDays ? rs[0] : null);
  if (!base) return { ok: false, reason: "one_reading", now };
  const span = daysBetween(base.d, now.d);
  const before = new Map(base.top.map((x) => [x[0], x[1]]));
  const growths = now.top.filter((x) => before.get(x[0]) >= rules.minItemOrders).map((x) => x[1] / before.get(x[0]) - 1);
  const itemGrowth = median(growths);
  const sumGrowth = base.sum > 0 ? now.sum / base.sum - 1 : null;
  const demand = growths.length >= 3 ? itemGrowth : sumGrowth;
  return {
    ok: demand !== null,
    reason: demand === null ? "no_pairs" : "",
    from: base.d,
    to: now.d,
    span,
    paired: growths.length,
    demandWeek: round(perWeek(demand ?? NaN, span)),
    breadth: growths.length ? round(growths.filter((g) => g > 0.02).length / growths.length, 2) : null,
    supplyWeek: base.listings > 0 && now.listings > 0 ? round(perWeek(now.listings / base.listings - 1, span)) : null,
    newListings: base.listings > 0 && now.listings >= 0 ? now.listings - base.listings : null,
    priceChange: base.price > 0 && now.price > 0 ? round((now.price / base.price - 1) * 100) : null,
    orders: now.sum,
    ordersBefore: base.sum,
    listings: now.listings,
    price: now.price,
  };
}

/** The stage of a concept from its signals (conservative: anything unclear is STEADY or UNVERIFIED). */
export function stageOf(s, { rules = RADAR } = {}) {
  if (!s?.ok || s.demandWeek === null) return "UNVERIFIED";
  const g = s.demandWeek;
  if (g <= rules.coolingPct) return "COOLING";
  if (g >= rules.emergingPct && s.orders < rules.smallOrders) return "EMERGING";
  if (g >= rules.risingPct && (s.breadth ?? 0) >= rules.minBreadth) return "RISING";
  if (s.orders >= rules.peakOrders && g < rules.risingPct) return "PEAK";
  return "STEADY";
}

/**
 * 0–100, for ordering the board only: demand speed first, then how many items share it, sellers
 * rushing in, and how early it still is. Not a probability and never shown as one.
 */
export function scoreOf(s, stage, { rules = RADAR } = {}) {
  if (!s?.ok || stage === "UNVERIFIED") return 0;
  const speed = Math.max(0, Math.min(1, (s.demandWeek ?? 0) / 60));
  const breadth = Math.max(0, Math.min(1, s.breadth ?? 0));
  const rush = Math.max(0, Math.min(1, (s.supplyWeek ?? 0) / 30));
  const early = s.orders < rules.smallOrders ? 1 : s.orders < rules.peakOrders ? 0.5 : 0;
  const base = 50 * speed + 20 * breadth + 15 * rush + 15 * early;
  const cap = stage === "COOLING" ? 15 : stage === "PEAK" ? 35 : 100;
  return Math.round(Math.min(cap, base));
}

/** The evidence lines shown under a concept (Hebrew, every number dated and sourced). */
export function evidence(s, stage) {
  if (!s?.ok) return [{ k: "wait", text: "נמדד פעם אחת. צריך עוד מדידה (לפחות יומיים) כדי לראות כיוון." }];
  const out = [];
  const days = `בין ${dm(s.from)} ל־${dm(s.to)}`;
  out.push({ k: "demand", text: `קצב ההזמנות ${days}: ${pct(s.demandWeek)} בשבוע (חציון של ${s.paired} פריטים שנמדדו בשני הימים).` });
  if (s.breadth !== null) out.push({ k: "breadth", text: `${Math.round(s.breadth * 100)}% מהפריטים עלו, לא רק פריט אחד.` });
  out.push({ k: "size", text: `הזמנות ב־30 הימים האחרונים ב־20 הפריטים המובילים: ${fmt(s.ordersBefore)} ← ${fmt(s.orders)}.` });
  if (s.newListings !== null && s.newListings > 0) out.push({ k: "supply", text: `מוכרים נכנסים: ${fmt(s.newListings)} מודעות חדשות ${days} (${pct(s.supplyWeek)} בשבוע).` });
  if (s.priceChange !== null && Math.abs(s.priceChange) >= 3) out.push({ k: "price", text: `המחיר החציוני ${s.priceChange < 0 ? "ירד" : "עלה"} ב־${Math.abs(Math.round(s.priceChange))}%${s.priceChange < 0 ? ": יותר מוכרים מתחרים" : ""}.` });
  if (stage === "PEAK") out.push({ k: "late", text: "כבר גדול: מי שמגיע עכשיו מגיע מאוחר." });
  return out;
}

/** Today's size alone (never a direction): SMALL below smallOrders, BIG from peakOrders. */
export function sizeOf(reading, { rules = RADAR } = {}) {
  if (!reading || !(reading.sum >= 0)) return null;
  return reading.sum < rules.smallOrders ? "SMALL" : reading.sum >= rules.peakOrders ? "BIG" : "MID";
}

/** The buy pick: the concept's first item that passes the site's rules (≥95%, ≥300 orders, no brand). */
export function pickFrom(result = {}, { rules = RADAR, now = Date.now() } = {}) {
  const raw = result?.products?.product;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const [first] = findResults(list, { rules: rules.pickRules, now }).items;
  if (!first) return null;
  const x0 = list.find((x) => String(x?.product_id || "") === first.id) || {};
  const rate = parseFloat(String(x0.commission_rate ?? x0.hot_product_commission_rate ?? "").replace("%", ""));
  return {
    itemId: first.id, title: first.title, image: first.image, price: first.price, checkedAt: first.checkedAt, buy: first.buy, check: first.check,
    // Facts for the opportunity checklist (the rate itself is never kept): the search asked for
    // delivery to Israel, so a returned item ships there.
    shipsIL: true,
    video: /^https:\/\//.test(String(x0.product_video_url || "")) ? true : x0.product_video_url === undefined ? null : false,
    commission: Number.isFinite(rate) ? rate > 0 : null,
  };
}

/**
 * Self-grading. A concept that becomes EMERGING or RISING (and has no open call) opens a call with
 * its demand base; after `gradeDays` the call is graded against the newest reading: HIT when the
 * concept's orders grew ≥ hitPct, else MISS. Calls are never edited after grading.
 */
export function updateCalls(calls = [], concept, stage, readings = [], { now = Date.now(), rules = RADAR } = {}) {
  const today = dayOf(now);
  const out = (Array.isArray(calls) ? calls : []).map((c) => ({ ...c }));
  const latest = (Array.isArray(readings) ? readings : []).at(-1);
  for (const c of out) {
    if (c.concept !== concept || c.result || !latest) continue;
    if (daysBetween(c.at, latest.d) < rules.gradeDays) continue;
    const growth = c.base > 0 ? (latest.sum / c.base - 1) * 100 : null;
    c.result = growth !== null && growth >= rules.hitPct ? "HIT" : "MISS";
    c.gradedAt = latest.d;
    c.growth = round(growth);
  }
  const open = out.some((c) => c.concept === concept && !c.result);
  if (!open && (stage === "EMERGING" || stage === "RISING") && latest?.sum > 0) {
    out.push({ concept, stage, at: today, base: latest.sum, due: dayOf(Date.parse(today) + rules.gradeDays * DAY) });
  }
  return out;
}

/** The public record: graded calls, hits, and when the next grade is due. */
export function trackRecord(calls = []) {
  const list = Array.isArray(calls) ? calls : [];
  const graded = list.filter((c) => c.result);
  const pending = list.filter((c) => !c.result);
  const hits = graded.filter((c) => c.result === "HIT").length;
  return {
    calls: list.length,
    graded: graded.length,
    hits,
    accuracy: graded.length ? Math.round((hits / graded.length) * 100) : null,
    pending: pending.length,
    nextDue: pending.map((c) => c.due).sort()[0] || null,
    recent: graded.slice(-12).reverse().map((c) => ({ concept: c.concept, stage: c.stage, at: c.at, gradedAt: c.gradedAt, result: c.result, growth: c.growth })),
  };
}

/**
 * The public board: every concept with its stage, score, evidence, demand series, buy pick, the
 * Israel gap (israelGap.js: is it already searched here?) and the opportunity window; strongest
 * first, open windows first among the rising; the radar's own record and its arrival clock.
 * Nothing private (no seller ids, no ratings, no autocomplete texts).
 */
export function buildBoard({ concepts = [], readings = {}, picks = {}, calls = [], awareness = {}, items = {}, site = null, now = Date.now(), rules = RADAR } = {}) {
  const rows = [];
  const gaps = {};
  for (const c of concepts.filter(validConcept)) {
    const rs = readings[c.id] || [];
    const s = signals(rs, { rules });
    const stage = stageOf(s, { rules });
    const gap = gapOf(awareness[c.id] || []);
    gaps[c.id] = gap;
    const window = windowOf(stage, gap);
    rows.push({
      id: c.id,
      he: c.he,
      kind: c.kind || "",
      ...(c.auto ? { auto: true, found: c.found || null, why: c.why || null } : {}),
      stage,
      stageHe: STAGES[stage].he,
      score: scoreOf(s, stage, { rules }),
      evidence: evidence(s, stage),
      series: rs.slice(-21).map((r) => [r.d, r.sum]),
      listings: rs.slice(-21).map((r) => [r.d, r.listings]),
      since: rs[0]?.d || null,
      measured: rs.at(-1)?.d || null,
      // Today's size (not a direction): AliExpress's 30-day orders of the top items and the listings.
      today: rs.at(-1) ? { orders: rs.at(-1).sum, listings: rs.at(-1).listings, price: rs.at(-1).price } : null,
      size: sizeOf(rs.at(-1), { rules }),
      gap: { state: gap.state, he: GAP_STATES[gap.state].he, confidence: gap.confidence, confidenceHe: gap.confidence ? CONFIDENCE[gap.confidence].he : null, il: gap.il, yt: gap.yt, world: gap.world, arrivedOn: gap.arrivedOn, evidence: gap.evidence },
      window,
      windowHe: window ? WINDOWS[window].he : null,
      // The top items' AliExpress ids: the magic button finds a pasted item's concept by them.
      items: (rs.at(-1)?.top || []).map((x) => x[0]).slice(0, rules.topItems),
      // …and each one's momentum when it has two readings 3+ days apart: [state, %/week].
      hot: Object.fromEntries((rs.at(-1)?.top || []).map((x) => [x[0], itemMomentum(items[x[0]] || [])]).filter(([, m]) => m.state !== "UNVERIFIED").map(([id, m]) => [id, [m.state, m.weekPct]])),
      match: [...new Set([...(Array.isArray(c.hq) ? c.hq : []), ...(c.auto ? [] : [c.he])].filter(Boolean))].slice(0, 4),
      ...pickView(picks[c.id], { items, gap, stage, window }),
    });
  }
  const order = { EMERGING: 0, RISING: 1, STEADY: 2, PEAK: 3, COOLING: 4, UNVERIFIED: 5 };
  const win = { OPEN: 0, CLOSING: 1, CLOSED: 3 };
  rows.sort((a, b) => order[a.stage] - order[b.stage] || (win[a.window] ?? 2) - (win[b.window] ?? 2) || b.score - a.score || a.he.localeCompare(b.he, "he"));
  return {
    v: 2,
    at: new Date(now).toISOString(),
    source: "aliexpress_affiliate_api",
    sources: ["aliexpress_affiliate_api", "google_autocomplete_public", "google_trends_rss_IL"],
    stages: STAGES,
    gapStates: GAP_STATES,
    windows: WINDOWS,
    hotStates: HOT_STATES,
    actions: ACTIONS,
    concepts: rows,
    // The site's own products, checked against AliExpress's daily orders (radarOpportunity.js siteHotness).
    site: site ? { checked: site.checked, counts: site.counts, hot: site.rows.filter((r) => r.state === "HOT").slice(0, 24), cooling: site.rows.filter((r) => r.state === "COOLING").slice(0, 24) } : null,
    record: trackRecord(calls),
    clock: leadTimes(calls, gaps),
    rules: { emergingPct: rules.emergingPct, risingPct: rules.risingPct, smallOrders: rules.smallOrders, peakOrders: rules.peakOrders, hitPct: rules.hitPct, gradeDays: rules.gradeDays },
  };
}

/** A concept's buy pick with its own momentum, the opportunity checklist and the recommendation. */
function pickView(pick, { items = {}, gap = null, stage = "UNVERIFIED", window = null } = {}) {
  const momentum = pick?.itemId ? itemMomentum(items[pick.itemId] || []) : null;
  const action = actionOf({ stage, window, gap, pick, momentum });
  return {
    pick: pick ? { ...pick, momentum: momentum ? { state: momentum.state, he: HOT_STATES[momentum.state].he, weekPct: momentum.weekPct, line: momentumLine(momentum) } : null } : null,
    opportunity: pick ? opportunityOf(pick, { momentum, gap, stage }) : null,
    action,
    actionHe: ACTIONS[action],
  };
}
