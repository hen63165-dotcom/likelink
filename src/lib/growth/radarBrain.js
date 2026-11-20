// The radar's brain (the owner, 2026-11-20: "כן למוח"): the radar learns from every call it sealed and
// every grade it got. Each new-product call (freshRisers.js) and each new-kind call (newKinds.js) keeps
// the signals it had THE DAY IT WAS MADE (`f`, with the brain's version `v`); after the grade, the brain
// counts how often calls WITH each signal hit and how often calls WITHOUT it hit (smoothed, never a guess
// below `minEach` graded calls on each side), draws the learning curve (graded calls and hits per week)
// and, for today's candidates, gives the HISTORICAL hit rate of past calls that shared their strongest
// learned signals ("calls like this hit X% of N") — a frequency of what already happened, never a
// forecast. It never lowers the bar (freshBar, KINDS stay as they are); it orders what passed it and
// says what it learned. Like a public forecast benchmark (a frozen calibration, a new version announced),
// the rules here are version `BRAIN.version`, every call records the version it was made under, and the
// brain's whole state is sealed every day as its own book. Learning uses only calls graded before today.
// Pure; tested in tests/radarBrain.test.mjs.

export const BRAIN = Object.freeze({ version: 1, minEach: 5, curveWeeks: 12 });

/** The signals each book's calls are judged by. Every test reads only what the call recorded. */
export const SIGNALS = Object.freeze({
  fresh: Object.freeze([
    { key: "fast", he: "קצב של 80% או יותר בשבוע", en: "80%+ a week", test: (f) => f.weekPct >= 80 },
    { key: "held40", he: "ההאצה החזיקה 40% או יותר גם במדידה הקודמת", en: "held 40%+ in the reading before", test: (f) => f.heldPct >= 40 },
    { key: "tiny", he: "עוד קטן מאוד: פחות מ־500 הזמנות בחודש", en: "very small: under 500 orders a month", test: (f) => f.orders < 500 },
    { key: "fewSellers", he: "פחות מ־500 מודעות דומות באליאקספרס", en: "under 500 similar listings", test: (f) => Number.isFinite(f.similar) && f.similar < 500 },
    { key: "ytEarly", he: "ביוטיוב כבר יש סרטונים ראשונים מהשבוע", en: "first YouTube videos this week", test: (f) => f.yt === "EARLY" },
    { key: "ytQuiet", he: "ביוטיוב שקט מוחלט", en: "YouTube quiet", test: (f) => f.yt === "NONE" },
    { key: "cheap", he: "מחיר עד ₪20", en: "up to ₪20", test: (f) => Number.isFinite(f.price) && f.price <= 20 },
  ]),
  kinds: Object.freeze([
    { key: "many", he: "5 מודעות חדשות או יותר באותו סוג", en: "5+ new listings in the kind", test: (f) => f.members >= 5 },
    { key: "median50", he: "החציון עולה ב־50% או יותר בשבוע", en: "median 50%+ a week", test: (f) => f.median >= 50 },
    { key: "small", he: "פחות מ־2,000 הזמנות יחד", en: "under 2,000 orders together", test: (f) => f.orders < 2000 },
  ]),
});

const num = (x) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : null);

/** What a new-product call knew the day it was made (freshRisers.js riser + its unknown check). */
export function freshFeatures(r = {}) {
  return { weekPct: num(r.weekPct), heldPct: num(r.heldPct), orders: num(r.orders), similar: num(r.known?.similar), yt: r.known?.yt?.level || null, price: num(r.price), category: String(r.category || "") };
}
/** What a new-kind call knew the day it was made (newKinds.js kind). */
export function kindFeatures(k = {}) {
  return { members: Array.isArray(k.members) ? k.members.length : num(k.members), median: num(k.medianWeekPct), orders: num(k.orders), category: String(k.category || "") };
}

const rate = (hits, n) => (n ? Math.round(((hits + 1) / (n + 2)) * 1000) / 10 : null); // smoothed, in %
const weekOf = (d) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  const monday = t - (((new Date(t).getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(monday).toISOString().slice(0, 10);
};

/** Graded calls with the signals they recorded, graded before `today` (no peeking at today's grades). */
function usable(calls = [], today) {
  return (Array.isArray(calls) ? calls : []).filter((c) => (c?.result === "HIT" || c?.result === "MISS") && c.f && typeof c.f === "object" && (!today || !c.gradedAt || c.gradedAt < today));
}

/**
 * What the brain learned, per book: graded calls, hits, the smoothed hit rate, every signal's record
 * with and without it (`ready` once both sides have minEach), the lift, and the weekly learning curve.
 */
export function learn(callsByBook = {}, { today = null, rules = BRAIN } = {}) {
  const books = {};
  for (const [book, signals] of Object.entries(SIGNALS)) {
    const all = Array.isArray(callsByBook[book]) ? callsByBook[book] : [];
    const graded = usable(all, today);
    const hits = graded.filter((c) => c.result === "HIT").length;
    const rows = signals.map((s) => {
      const w = graded.filter((c) => s.test(c.f));
      const wo = graded.filter((c) => !s.test(c.f));
      const wh = w.filter((c) => c.result === "HIT").length;
      const woh = wo.filter((c) => c.result === "HIT").length;
      const ready = w.length >= rules.minEach && wo.length >= rules.minEach;
      return {
        key: s.key, he: s.he, en: s.en,
        with: { n: w.length, hits: wh, rate: rate(wh, w.length) },
        without: { n: wo.length, hits: woh, rate: rate(woh, wo.length) },
        lift: ready ? Math.round((rate(wh, w.length) - rate(woh, wo.length)) * 10) / 10 : null,
        ready,
      };
    }).sort((a, b) => (b.ready - a.ready) || (b.lift ?? -999) - (a.lift ?? -999) || (a.key < b.key ? -1 : 1));
    const byWeek = new Map();
    for (const c of graded) {
      const wk = weekOf(c.gradedAt || c.due || c.at);
      const r = byWeek.get(wk) || { week: wk, graded: 0, hits: 0 };
      r.graded++;
      if (c.result === "HIT") r.hits++;
      byWeek.set(wk, r);
    }
    const curve = [...byWeek.values()].sort((a, b) => (a.week < b.week ? -1 : 1)).slice(-rules.curveWeeks);
    books[book] = {
      calls: all.length,
      withSignals: all.filter((c) => c?.f).length,
      waiting: all.filter((c) => c?.f && !c.result).length,
      graded: graded.length, hits, rate: rate(hits, graded.length),
      ready: rows.some((r) => r.ready),
      signals: rows, curve,
      nextDue: all.filter((c) => c?.f && !c.result).map((c) => c.due).filter(Boolean).sort()[0] || null,
    };
  }
  return { version: rules.version, at: today, books, ready: Object.values(books).some((b) => b.ready) };
}

/**
 * The record of past calls like this one: graded calls of the same book that share the candidate's
 * value on its book's learned signals, strongest first, narrowed while at least minEach remain.
 * Returns { rate, n, hits, basis } (history only), or null before the brain has learned anything.
 */
export function likeThis(features, bookModel, callsInBook = [], { book = "fresh", today = null, rules = BRAIN } = {}) {
  if (!bookModel?.ready || !features) return null;
  const tests = new Map(SIGNALS[book].map((s) => [s.key, s.test]));
  let pool = usable(callsInBook, today);
  const basis = [];
  for (const s of bookModel.signals.filter((x) => x.ready)) {
    const t = tests.get(s.key);
    const mine = Boolean(t(features));
    const next = pool.filter((c) => Boolean(t(c.f)) === mine);
    if (next.length < rules.minEach) break;
    pool = next;
    basis.push({ key: s.key, has: mine });
  }
  if (!basis.length) return null;
  const hits = pool.filter((c) => c.result === "HIT").length;
  return { rate: rate(hits, pool.length), n: pool.length, hits, basis };
}

/** The brain's whole state as text, one line per signal (sealed every day as the book "brain"). */
export function brainText(model) {
  if (!model?.books) return null;
  const lines = [];
  for (const [book, b] of Object.entries(model.books)) {
    lines.push(`v${model.version}|${book}|all|${b.graded}|${b.hits}`);
    const sure = model.sure?.[book];
    if (sure?.pattern?.length) lines.push(`v${model.version}|${book}|sure|${sure.since}|${sure.key.replace(/ /g, "_")}|${sure.live.n}|${sure.live.hits}`);
    for (const s of b.signals) lines.push(`v${model.version}|${book}|${s.key}|${s.with.n}|${s.with.hits}|${s.without.n}|${s.without.hits}`);
  }
  return lines.sort().join("\n");
}

// 🎯 The sure voice (the owner, 2026-11-20: "99% hit exactly"). Nobody can promise 99% of trend calls
// made before everyone; what can be built is a radar that speaks in its sure voice ONLY when its own
// sealed record proves it (selective prediction with risk control): for each pattern of learned signals,
// the Wilson lower bound of past hits (95% confidence) over graded calls in the last `windowDays`; a
// level (99 / 95 / 90 / 80) is certified only when that bound reaches it. Today's candidates with the
// certified pattern carry the level; every other call stays an early call with its measured record.
// The definition of a hit never changes to make the number look better.
export const SURE = Object.freeze({ levels: Object.freeze([99, 95, 90, 80]), z: 1.96, windowDays: 180, maxSignals: 3 });

/** Wilson score lower bound of a hit rate, in % (one decimal). */
export function wilsonLower(hits, n, { z = SURE.z } = {}) {
  if (!(n > 0)) return 0;
  const p = hits / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, Math.floor(((centre - margin) / (1 + z2 / n)) * 1000) / 10);
}

/** Hits in a row (no miss) needed before a level can be certified. */
export function hitsToProve(level, { z = SURE.z } = {}) {
  let n = 1;
  while (wilsonLower(n, n, { z }) < level && n < 100_000) n++;
  return n;
}

const DAYMS = 86_400_000;
const PATTERN_KEYS = (pattern) => pattern.map((p) => `${p.has ? "+" : "-"}${p.key}`).join(" ");

/**
 * The pattern the sure voice will speak with: among combinations (up to maxSignals) of a book's signals,
 * the one whose past graded calls (last windowDays) have the highest Wilson lower bound. Chosen on the
 * past only; it is then frozen and sealed (sureState), and ONLY calls made after that day can certify it,
 * so picking the best of many patterns never inflates the record.
 */
export function choosePattern(calls = [], book = "fresh", { today = null, rules = SURE } = {}) {
  const since = today ? new Date(Date.parse(`${today}T00:00:00Z`) - rules.windowDays * DAYMS).toISOString().slice(0, 10) : "";
  const graded = usable(calls, today).filter((c) => !since || String(c.gradedAt || c.due || "") >= since);
  const signals = SIGNALS[book] || [];
  let best = null;
  const walk = (start, chosen) => {
    if (chosen.length) {
      const pool = graded.filter((c) => chosen.every((x) => Boolean(x.test(c.f)) === x.has));
      if (pool.length >= BRAIN.minEach) {
        const hits = pool.filter((c) => c.result === "HIT").length;
        const lower = wilsonLower(hits, pool.length);
        if (!best || lower > best.lower) best = { pattern: chosen.map(({ key, has }) => ({ key, has })), n: pool.length, hits, lower };
      }
    }
    if (chosen.length >= rules.maxSignals) return;
    for (let i = start; i < signals.length; i++) for (const has of [true, false]) walk(i + 1, [...chosen, { key: signals[i].key, has, test: signals[i].test }]);
  };
  walk(0, []);
  return best;
}

/**
 * The sure voice of one book, day by day: yesterday's frozen pattern is kept and judged only on calls
 * made from the day it was chosen (`since`) and graded before today (`live`). A level of SURE.levels is
 * certified only when the live Wilson lower bound reaches it. A pattern whose live record is clearly
 * poor (≥ 16 graded and a lower bound under 50%) is replaced by a newly chosen one, and its count
 * restarts from that day. Before the brain has learned anything there is no pattern and no level.
 */
export function sureState(prev = null, calls = [], book = "fresh", { today = null, rules = SURE } = {}) {
  const toProve = Object.fromEntries(rules.levels.map((l) => [l, hitsToProve(l)]));
  const live = (pattern, since) => {
    const tests = new Map((SIGNALS[book] || []).map((s) => [s.key, s.test]));
    const pool = usable(calls, today).filter((c) => String(c.at || "") >= since && pattern.every((p) => tests.has(p.key) && Boolean(tests.get(p.key)(c.f)) === p.has));
    const hits = pool.filter((c) => c.result === "HIT").length;
    return { n: pool.length, hits, lower: wilsonLower(hits, pool.length) };
  };
  let pattern = Array.isArray(prev?.pattern) && prev.pattern.length && prev.since ? prev.pattern : null;
  let since = pattern ? prev.since : null;
  if (pattern) {
    const l = live(pattern, since);
    if (l.n >= 16 && l.lower < 50) pattern = null;
  }
  if (!pattern) {
    const chosen = choosePattern(calls, book, { today, rules });
    if (chosen) { pattern = chosen.pattern; since = today; }
  }
  if (!pattern) return { pattern: null, since: null, live: { n: 0, hits: 0, lower: 0 }, level: null, toProve };
  const l = live(pattern, since);
  return { pattern, key: PATTERN_KEYS(pattern), since, live: l, level: rules.levels.find((x) => l.lower >= x) ?? null, toProve };
}

/** True when a candidate's features match a certified pattern (then it may carry the level). */
export function matchesPattern(features, cert, book = "fresh") {
  if (!cert?.level || !cert.pattern?.length || !features) return false; // speaks only with a certified level
  const tests = new Map((SIGNALS[book] || []).map((s) => [s.key, s.test]));
  return cert.pattern.every((p) => tests.has(p.key) && Boolean(tests.get(p.key)(features)) === p.has);
}
