// 📏 The radar against the simple ranking and against chance (the owner, 26.11, over an outside check:
// "two critical things are missing — proof that the forecasts beat a random choice or a simple ranking
// by order growth"). Every day, from the very pool the radar's new-product calls come from (the small
// listings, 30–3,000 orders in 30 days, with a measured weekly pace), two yardsticks pick their own:
//   • the simple ranking — the `perDay` listings growing fastest this week, with none of the radar's
//     checks (no noise test, no held acceleration, no unknown check, no world gap, no brand rule);
//   • chance — `perDay` listings drawn from the same pool by a seed nobody chooses: the SHA-256 of the
//     day and that day's sealed store-price text (the prices AliExpress returned), like the luck draw.
// Both are graded by exactly the radar's own new-product rule (FRESH.hitPct: +50% orders within 14 days,
// gradeFresh), never edited, and sealed every day as the book `baseline` under the daily root. The
// comparison is printed only once each side has `minGraded` grades, on the same days (the radar's calls
// from the yardsticks' first day), with the edge in points, negative too.
//
// A day before the first run is rebuilt once (`rebuilt`: the day it was rebuilt) only while none of its
// picks could be graded yet, from that day's own readings and sealed prices: a fixed rule over recorded
// numbers, so anyone can recompute it from the published evidence. Pure; tested.

import { FRESH, gradeFresh } from "./freshRisers.js";
import { HOT, itemMomentum } from "./radarOpportunity.js";

const DAY_MS = 86_400_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[0-9a-f]{64}$/;
const ITEM = /^\d{6,20}$/;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export const BASELINE = Object.freeze({ perDay: 3, minGraded: 3, backDays: 7, unreadDays: 3, keep: 1500 });
export const BASELINE_BOOKS = Object.freeze(["naive", "random"]);

/**
 * The text whose SHA-256 is the chance seed: the day and its sealed price text's hash (null without
 * sealed prices). The runner hashes it; this file stays free of node modules, since the page imports it.
 */
export function baselineSeedText(day, pricesSha) {
  if (!DAY.test(String(day || "")) || !SHA.test(String(pricesSha || ""))) return null;
  return `baseline|${day}|${pricesSha}`;
}

/**
 * The day's pool, exactly the radar's: every listing read on `day` with a weekly pace from the readings
 * up to that day and 30–3,000 orders. Sorted by id, so the draw is the same for anyone.
 */
export function baselinePool(pool = {}, items = {}, day, { rules = FRESH } = {}) {
  const out = [];
  for (const e of Object.values(pool || {})) {
    if (!ITEM.test(String(e?.id || ""))) continue;
    const series = (items?.[e.id] || []).filter((r) => Array.isArray(r) && r[0] <= day);
    if (series.at(-1)?.[0] !== day) continue;
    const m = itemMomentum(series, { rules: HOT });
    if (m.weekPct === null || !(m.orders >= rules.minOrders) || m.orders > rules.maxOrders) continue;
    out.push({ id: String(e.id), title: String(e.title || "").slice(0, 140), orders: m.orders, weekPct: m.weekPct });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The simple ranking: the fastest weekly growth, ties by the smaller listing, then the id. */
export function naivePicks(cands = [], { n = BASELINE.perDay } = {}) {
  return [...cands].sort((a, b) => b.weekPct - a.weekPct || a.orders - b.orders || (a.id < b.id ? -1 : 1)).slice(0, n);
}

/** Chance: `n` listings without replacement, each from the next 12 hex of the seed (mod what is left). */
export function randomPicks(cands = [], seed, { n = BASELINE.perDay } = {}) {
  if (!SHA.test(String(seed || ""))) return [];
  const left = [...cands];
  const out = [];
  for (let i = 0; i < n && left.length && (i + 1) * 12 <= 64; i++) out.push(left.splice(parseInt(seed.slice(i * 12, i * 12 + 12), 16) % left.length, 1)[0]);
  return out;
}

const entry = (p, day, extra) => ({ id: p.id, title: p.title, at: day, base: p.orders, due: addDays(day, FRESH.gradeDays), weekPct: p.weekPct, ...extra });

/** Adds one day's picks to each book once (never replaced). */
export function recordBaseline(state = {}, { day, pool = [], seed = null, rebuilt = null } = {}, { rules = BASELINE } = {}) {
  const out = { naive: [...(state?.naive || [])], random: [...(state?.random || [])] };
  if (!DAY.test(String(day || "")) || !pool.length) return out;
  const extra = rebuilt ? { rebuilt } : {};
  if (!out.naive.some((x) => x.at === day)) out.naive.push(...naivePicks(pool, { n: rules.perDay }).map((p) => entry(p, day, extra)));
  if (seed && !out.random.some((x) => x.at === day)) out.random.push(...randomPicks(pool, seed, { n: rules.perDay }).map((p) => entry(p, day, { ...extra, seed })));
  for (const k of BASELINE_BOOKS) out[k] = out[k].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).slice(-rules.keep);
  return out;
}

/**
 * The days to rebuild: from the first day the radar called a new product, the days without picks yet
 * whose picks are all still open (day + 14 > today), at most `backDays` back, never today.
 */
export function rebuildDays(state = {}, radarCalls = [], today, { rules = BASELINE } = {}) {
  const first = (Array.isArray(radarCalls) ? radarCalls : []).map((c) => c?.at).filter((d) => DAY.test(String(d || ""))).sort()[0];
  if (!first || !DAY.test(String(today || ""))) return [];
  const have = new Set([...(state?.naive || []), ...(state?.random || [])].map((x) => x.at));
  const out = [];
  for (let d = addDays(today, -1), i = 0; i < rules.backDays && d >= first; d = addDays(d, -1), i++) {
    if (daysBetween(d, today) >= FRESH.gradeDays || have.has(d)) continue;
    out.push(d);
  }
  return out.sort();
}

/** Grades each book by the radar's own rule; a pick unread `unreadDays` past its day is set aside, never counted. */
export function gradeBaseline(state = {}, items = {}, today, { rules = BASELINE } = {}) {
  const out = {};
  for (const k of BASELINE_BOOKS) {
    out[k] = gradeFresh(state?.[k] || [], items, today).map((x) => {
      if (x.result || x.unread || !(x.due <= today) || daysBetween(x.due, today) < rules.unreadDays) return x;
      const read = (items?.[x.id] || []).some((r) => r[0] >= x.due);
      return read ? x : { ...x, unread: today };
    });
  }
  return out;
}

/** The open picks still to be read again (each book's listings whose day has not come or is not graded). */
export function baselineOpenIds(state = {}) {
  return [...new Set(BASELINE_BOOKS.flatMap((k) => (state?.[k] || []).filter((x) => !x.result && !x.unread).map((x) => String(x.id))))].filter((id) => ITEM.test(id));
}

const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

function tally(list = []) {
  const graded = (Array.isArray(list) ? list : []).filter((x) => x?.result === "HIT" || x?.result === "MISS");
  const hits = graded.filter((x) => x.result === "HIT").length;
  return { calls: (list || []).length, graded: graded.length, hits, rate: graded.length ? Math.round((hits / graded.length) * 100) : null, medianGrowth: median(graded.map((x) => Number(x.growth))) };
}

/**
 * The comparison: the radar's new-product calls from the yardsticks' first day, against each yardstick.
 * `edge` (points) only once both sides have `minGraded` grades. `overlap`: radar calls that the simple
 * ranking also picked the same day (a radar that only re-ranks growth would overlap fully).
 */
export function baselineVersus(radarCalls = [], state = {}, { rules = BASELINE } = {}) {
  const since = [...(state?.naive || []), ...(state?.random || [])].map((x) => x.at).sort()[0] || null;
  const radarList = since ? (Array.isArray(radarCalls) ? radarCalls : []).filter((c) => c?.at >= since) : [];
  const radar = tally(radarList);
  const naive = tally(state?.naive);
  const random = tally(state?.random);
  const edge = (side) => (radar.graded >= rules.minGraded && side.graded >= rules.minGraded ? radar.rate - side.rate : null);
  const naiveDays = new Map();
  for (const x of state?.naive || []) naiveDays.set(`${x.at}|${x.id}`, true);
  const overlap = radarList.filter((c) => naiveDays.has(`${c.at}|${c.id}`)).length;
  return { since, radar, naive, random, edgeNaive: edge(naive), edgeRandom: edge(random), overlap, minGraded: rules.minGraded };
}

/** The sealed book: one sorted line per pick, `book|item|day|orders then|due|grade|rebuilt day|seed`. */
export function baselineSealText(state = {}) {
  const lines = [];
  for (const k of BASELINE_BOOKS) {
    for (const x of state?.[k] || []) {
      if (!ITEM.test(String(x?.id || "")) || !DAY.test(String(x.at || "")) || !DAY.test(String(x.due || "")) || !(Number(x.base) > 0)) continue;
      const grade = x.result === "HIT" || x.result === "MISS" ? x.result : x.unread ? "UNREAD" : "-";
      lines.push(`${k}|${x.id}|${x.at}|${Math.round(Number(x.base))}|${x.due}|${grade}|${DAY.test(String(x.rebuilt || "")) ? x.rebuilt : "-"}|${k === "random" && SHA.test(String(x.seed || "")) ? x.seed : "-"}`);
    }
  }
  return lines.sort().join("\n");
}

/** What the board carries: the comparison, today's picks of each yardstick, the latest grades, the next grade day. */
export function baselineBoard(state = {}, radarCalls = [], today = null) {
  const open = BASELINE_BOOKS.flatMap((k) => (state?.[k] || []).filter((x) => !x.result && !x.unread).map((x) => x.due)).sort();
  const pick = (x) => ({ id: x.id, title: x.title, base: x.base, weekPct: x.weekPct, due: x.due });
  const recent = BASELINE_BOOKS.flatMap((k) => (state?.[k] || []).filter((x) => x.result).map((x) => ({ book: k, id: x.id, title: x.title, at: x.at, result: x.result, growth: x.growth ?? null })))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 12);
  const rebuilt = [...new Set(BASELINE_BOOKS.flatMap((k) => (state?.[k] || []).filter((x) => x.rebuilt).map((x) => x.at)))].sort();
  return {
    d: today,
    versus: baselineVersus(radarCalls, state),
    today: { naive: (state?.naive || []).filter((x) => x.at === today).map(pick), random: (state?.random || []).filter((x) => x.at === today).map(pick) },
    rebuilt,
    nextDue: open[0] || null,
    recent,
    rule: { perDay: BASELINE.perDay, hitPct: FRESH.hitPct, days: FRESH.gradeDays, minOrders: FRESH.minOrders, maxOrders: FRESH.maxOrders },
  };
}

/** The browser's copy (sanitizeBoard; the seal is cleaned there). `full: false` (the lock): the record only, never a pick. */
export function cleanBaseline(b, { full = true } = {}) {
  if (!b || typeof b !== "object" || !b.versus || typeof b.versus !== "object") return null;
  const day = (d) => (DAY.test(String(d || "")) ? d : null);
  // A missing number stays missing (Number(null) is 0: an edge before any grade would read as "0 points").
  const n = (x, max = 1e7) => (typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= max ? Math.round(x * 10) / 10 : null);
  const side = (t) => ({ calls: n(t?.calls) ?? 0, graded: n(t?.graded) ?? 0, hits: n(t?.hits) ?? 0, rate: n(t?.rate, 100), medianGrowth: n(t?.medianGrowth, 1e6) });
  const v = b.versus;
  const versus = { since: day(v.since), radar: side(v.radar), naive: side(v.naive), random: side(v.random), edgeNaive: n(v.edgeNaive, 100), edgeRandom: n(v.edgeRandom, 100), overlap: n(v.overlap) ?? 0, minGraded: n(v.minGraded, 100) ?? BASELINE.minGraded };
  const out = { d: day(b.d), versus, nextDue: day(b.nextDue), rebuilt: (Array.isArray(b.rebuilt) ? b.rebuilt : []).map(day).filter(Boolean).slice(0, 14), rule: { perDay: BASELINE.perDay, hitPct: FRESH.hitPct, days: FRESH.gradeDays, minOrders: FRESH.minOrders, maxOrders: FRESH.maxOrders }, today: { naive: [], random: [] }, recent: [] };
  if (!full) return out;
  const text = (s) => String(s || "").replace(/[<>]/g, "").slice(0, 140);
  const pick = (x) => (ITEM.test(String(x?.id || "")) ? { id: String(x.id), title: text(x.title), base: n(x.base), weekPct: n(x.weekPct, 1e6), due: day(x.due) } : null);
  out.today = { naive: (b.today?.naive || []).map(pick).filter(Boolean).slice(0, BASELINE.perDay), random: (b.today?.random || []).map(pick).filter(Boolean).slice(0, BASELINE.perDay) };
  out.recent = (Array.isArray(b.recent) ? b.recent : []).filter((x) => BASELINE_BOOKS.includes(x?.book) && ITEM.test(String(x?.id || "")) && (x.result === "HIT" || x.result === "MISS")).slice(0, 12)
    .map((x) => ({ book: x.book, id: String(x.id), title: text(x.title), at: day(x.at), result: x.result, growth: n(x.growth, 1e6) }));
  return out;
}
