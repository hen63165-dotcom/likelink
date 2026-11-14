// The Israel gap (פער ישראל) — the trend radar's second half: has this kind of product already
// reached Israel, or is the world ahead of us? (The owner, 2026-11-14, after ChatGPT's ViralHyp
// spec: "an indication whether the product is already common in Israel".)
//
// AliExpress tells the radar what the world is ordering (trendRadar.js). Google tells it what
// people type. Every day, for every concept, the collector asks Google's public autocomplete
// (suggestqueries.google.com, no key, no account; its robots.txt is checked on every run and the
// source is skipped the day it disallows the path) three things:
//   - in Israel, in Hebrew   (hl=he, gl=il, the concept's `hq` phrases)
//   - in Israel, in English  (hl=he, gl=il, the concept's store words)
//   - in the US, in English  (hl=en, gl=us, the same store words) — "the world"
// and counts how many suggestions EXTEND the phrase (other people's searches that contain it, not
// the echo of the phrase itself). Autocomplete only suggests what enough people search, so the
// count is a sign of search interest, never a volume: it is shown as a level, never as a number of
// searches, and the suggestions themselves are never stored or shown (they can carry brand names).
// Google Trends' daily Israel feed (public RSS) adds one more fact: the phrase was a trending
// search in Israel today.
//
// From the daily levels:
//   ARRIVED   (כבר כאן)        — Israelis search it in Hebrew (several extensions), or it trended here
//   ARRIVING  (מתחיל להגיע)    — a first Hebrew suggestion or two
//   GAP       (עוד לא הגיע)    — the world orders it (AliExpress), no Hebrew search in Israel yet
//   QUIET     (שקט)            — no search sign anywhere yet (not in Israel, not in the US)
//   UNKNOWN   (לא נבדק)        — not measured (no phrase, the source failed or was skipped)
// …and the arrival clock: the day the radar first SAW a Hebrew suggestion appear after an earlier
// reading with none (an observed arrival; a concept already searched when measuring began has no
// arrival date). With the radar's own dated calls this measures, for Israel, how many days pass
// between the factories' signal and Israelis starting to search — a number nobody publishes.
// Pure, no imports (the browser bundle reads it too): the collector is scripts/catalog/trend-radar.mjs.

export const SUGGEST_HOST = "https://suggestqueries.google.com";
export const SUGGEST_PATH = "/complete/search";
export const TRENDS_IL_RSS = "https://trends.google.com/trending/rss?geo=IL";

export const GAP = Object.freeze({
  keep: 60, // daily awareness readings per concept
  faint: 1, // extensions from which a phrase is searched at all
  aware: 3, // …and from which it is common
  windowStages: Object.freeze(["EMERGING", "RISING"]),
  minLeads: 3, // observed arrivals before a typical lead time is shown
});

export const GAP_STATES = Object.freeze({
  ARRIVED: { he: "כבר בארץ", hint: "ישראלים כבר מחפשים את זה בגוגל בעברית" },
  ARRIVING: { he: "מתחיל להגיע", hint: "הופיעו חיפושים ראשונים בעברית" },
  GAP: { he: "עוד לא הגיע לארץ", hint: "בעולם מזמינים, בעברית עוד לא מחפשים" },
  QUIET: { he: "שקט", hint: "עוד אין סימן חיפוש, לא בארץ ולא בחו״ל" },
  UNKNOWN: { he: "לא נבדק", hint: "אין עדיין מדידה של חיפושים" },
});

export const WINDOWS = Object.freeze({
  OPEN: { he: "חלון פתוח", hint: "עולה בעולם ועוד לא מחפשים בעברית" },
  CLOSING: { he: "החלון נסגר", hint: "עולה בעולם והחיפושים בעברית מתחילים" },
  CLOSED: { he: "כבר כאן", hint: "ישראלים כבר מחפשים את זה" },
});

const dm = (d) => `${Number(String(d).slice(8, 10))}.${Number(String(d).slice(5, 7))}`;
const DAY = 86_400_000;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Lowercase, no niqqud or cantillation, one kind of apostrophe, single spaces. */
export function normalize(s = "") {
  return String(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[׳`’‘´]/g, "'")
    .replace(/[״“”]/g, '"')
    .replace(/[^\p{L}\p{N}'" ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The autocomplete address for one phrase (the Firefox format: [query, [suggestions…], …]). */
export function suggestUrl(q, { hl = "he", gl = "il" } = {}) {
  const p = new URLSearchParams({ client: "firefox", hl, gl, q: String(q || "").slice(0, 80) });
  return `${SUGGEST_HOST}${SUGGEST_PATH}?${p}`;
}

/** The suggestions of one answer, or null when it is not a valid answer (never an empty "zero"). */
export function parseSuggest(body) {
  let doc = body;
  if (typeof body === "string") {
    try { doc = JSON.parse(body); } catch { return null; }
  }
  if (!Array.isArray(doc) || !Array.isArray(doc[1])) return null;
  return doc[1].filter((s) => typeof s === "string").slice(0, 20);
}

/** How many suggestions extend the phrase: contain it, and are not the phrase itself. */
export function extensions(phrase, suggestions) {
  if (!Array.isArray(suggestions)) return null;
  const q = normalize(phrase);
  if (!q) return null;
  const seen = new Set();
  for (const s of suggestions) {
    const n = normalize(s);
    if (n && n !== q && n.includes(q)) seen.add(n);
  }
  return seen.size;
}

/** A count of extensions → NONE / FAINT / AWARE (null when not measured). */
export function levelOf(n, { rules = GAP } = {}) {
  if (!Number.isFinite(n)) return null;
  return n >= rules.aware ? "AWARE" : n >= rules.faint ? "FAINT" : "NONE";
}
const RANK = { NONE: 0, FAINT: 1, AWARE: 2 };

/**
 * robots.txt says whether a path may be read by any crawler (the group for "*"). A missing file
 * (404) allows everything; an unreadable answer (5xx, network) does not: the source is skipped.
 */
export function robotsAllows(status, txt = "", path = SUGGEST_PATH) {
  if (status === 404 || status === 410) return true;
  if (status !== 200) return false;
  let applies = false;
  let best = { len: -1, allow: true };
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") { applies = val === "*"; continue; }
    if (!applies || !val) continue;
    const prefix = val.replace(/\*.*$/, "").replace(/\$$/, "");
    if (path.startsWith(prefix) && prefix.length > best.len) best = { len: prefix.length, allow: key === "allow" };
  }
  return best.allow;
}

/** Concepts whose Hebrew phrase (or name) shows up in today's Google Trends Israel feed (its terms,
 *  parsed by likeloop.js parseTrendsRss in the collector). */
export function trendingInIsrael(concepts = [], trendTerms = []) {
  const terms = (Array.isArray(trendTerms) ? trendTerms : []).map((t) => normalize(typeof t === "string" ? t : t?.term)).filter((t) => t.length >= 3);
  const out = new Set();
  for (const c of concepts) {
    const phrases = [...(Array.isArray(c.hq) ? c.hq : []), c.he].map(normalize).filter((p) => p.length >= 4);
    if (terms.some((t) => phrases.some((p) => t.includes(p) || (t.length >= 6 && p.includes(t))))) out.add(c.id);
  }
  return out;
}

/**
 * One day's awareness of one concept from the counted answers:
 *   he: [n per Hebrew phrase] (null = not answered), en: n in Israel (English), world: n in the US.
 */
export function awarenessReading({ he = [], en = null, world = null, trend = false } = {}, { now = Date.now() } = {}) {
  const heCounts = (Array.isArray(he) ? he : []).filter(Number.isFinite);
  const il = heCounts.length ? Math.max(...heCounts) : null;
  return {
    d: new Date(now).toISOString().slice(0, 10),
    il,
    ilEn: Number.isFinite(en) ? en : null,
    world: Number.isFinite(world) ? world : null,
    trend: trend === true,
  };
}

/** Adds today's awareness reading (one per day; a later one the same day replaces it). */
export function addAwareness(history = [], reading, { rules = GAP } = {}) {
  const prev = (Array.isArray(history) ? history : []).filter((r) => r && r.d && r.d !== reading.d);
  return [...prev, reading].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-rules.keep);
}

/** The Israel level of one reading: Hebrew first; a Trends hit or English searches in Israel count too. */
function ilLevel(r, rules) {
  if (!r) return null;
  if (r.trend) return "AWARE";
  const he = levelOf(r.il, { rules });
  const en = levelOf(r.ilEn, { rules });
  if (he === null && en === null) return null;
  // English searches from Israel say less than Hebrew ones (they mix with the world's): they can
  // lift NONE to FAINT, never to AWARE.
  const enCapped = en === "AWARE" ? "FAINT" : en;
  return RANK[enCapped ?? "NONE"] > RANK[he ?? "NONE"] ? enCapped : he ?? enCapped;
}

/**
 * The gap of one concept from its awareness history: today's state, the levels, an observed arrival
 * date, and the evidence lines (Hebrew, dated, no counts of searches — levels only).
 */
export function gapOf(history = [], { rules = GAP } = {}) {
  const rs = (Array.isArray(history) ? history : []).filter((r) => r?.d);
  const now = rs.at(-1);
  if (!now) return { state: "UNKNOWN", il: null, world: null, arrivedOn: null, measuredSince: null, evidence: [] };
  const il = ilLevel(now, rules);
  const world = levelOf(now.world, { rules });
  let state = "UNKNOWN";
  if (il === "AWARE") state = "ARRIVED";
  else if (il === "FAINT") state = "ARRIVING";
  // AliExpress's orders already say the world buys it (that is why it is on the radar); the US
  // autocomplete is supporting evidence. Only "nobody searches it anywhere" is QUIET.
  else if (il === "NONE") state = world === "NONE" ? "QUIET" : "GAP";

  // The arrival clock: the first day a Hebrew sign appeared after a day the radar saw none.
  let arrivedOn = null;
  let sawNone = false;
  for (const r of rs) {
    const l = ilLevel(r, rules);
    if (l === "NONE") sawNone = true;
    else if (sawNone && (l === "FAINT" || l === "AWARE")) { arrivedOn = r.d; break; }
  }
  const evidence = [];
  const day = dm(now.d);
  if (now.trend) evidence.push({ k: "trend", text: `ב־${day} זה היה חיפוש חם בישראל לפי Google Trends.` });
  if (il !== null) {
    evidence.push({ k: "il", text: il === "NONE"
      ? `בגוגל בישראל, בעברית: אין עדיין השלמות לחיפוש הזה (${day}).`
      : il === "FAINT"
        ? `בגוגל בישראל, בעברית: מופיעות השלמות ראשונות לחיפוש (${day}).`
        : `בגוגל בישראל, בעברית: הרבה השלמות לחיפוש, כלומר מחפשים את זה (${day}).` });
  }
  if (world !== null) {
    evidence.push({ k: "world", text: world === "NONE"
      ? `בגוגל בארה״ב: אין עדיין השלמות לחיפוש באנגלית (${day}).`
      : world === "FAINT" ? `בגוגל בארה״ב: יש השלמות ראשונות לחיפוש באנגלית (${day}).` : `בגוגל בארה״ב: מחפשים את זה באנגלית (${day}).` });
  }
  if (arrivedOn) evidence.push({ k: "arrived", text: `החיפושים בעברית התחילו להופיע ב־${dm(arrivedOn)} (לפני כן הרדאר לא ראה אותם).` });
  return { state, il, world, arrivedOn, measuredSince: rs[0].d, evidence };
}

/** The opportunity window: a rising concept that has not reached Israel yet. */
export function windowOf(stage, gap, { rules = GAP } = {}) {
  if (gap?.state === "ARRIVED") return "CLOSED";
  if (!rules.windowStages.includes(stage)) return null;
  if (gap?.state === "GAP" || gap?.state === "QUIET") return "OPEN";
  if (gap?.state === "ARRIVING") return "CLOSING";
  return null;
}

/**
 * The arrival clock across concepts: for every radar call (EMERGING/RISING, dated) followed by an
 * observed arrival in Israel, the days between them. A typical lead time is shown only from
 * `minLeads` observed arrivals; below that the radar says how many it has seen.
 */
export function leadTimes(calls = [], gaps = {}, { rules = GAP } = {}) {
  const firstCall = new Map();
  for (const c of Array.isArray(calls) ? calls : []) {
    if (!c?.concept || !c.at) continue;
    if (!firstCall.has(c.concept) || c.at < firstCall.get(c.concept)) firstCall.set(c.concept, c.at);
  }
  const leads = [];
  for (const [concept, at] of firstCall) {
    const arrived = gaps[concept]?.arrivedOn;
    if (arrived && arrived >= at) leads.push({ concept, called: at, arrived, days: daysBetween(at, arrived) });
  }
  const days = leads.map((l) => l.days).sort((a, b) => a - b);
  const mid = days.length ? (days.length % 2 ? days[(days.length - 1) / 2] : Math.round((days[days.length / 2 - 1] + days[days.length / 2]) / 2)) : null;
  return { observed: leads.length, typicalDays: leads.length >= rules.minLeads ? mid : null, leads: leads.slice(-12) };
}
