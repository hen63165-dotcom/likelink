// The Israel gap (פער ישראל) — the trend radar's second half: has this kind of product already
// reached Israel, or is the world ahead of us? (The owner, 2026-11-14, after ChatGPT's ViralHyp
// spec: "an indication whether the product is already common in Israel".)
//
// AliExpress tells the radar what the world is ordering (trendRadar.js). Google tells it what
// people type. Every day, for every concept, the collector asks Google's public autocomplete
// (suggestqueries.google.com, no key, no account; its robots.txt is checked on every run and the
// source is skipped the day it disallows the path):
//   - Google in Israel, in Hebrew   (hl=he, gl=il, the concept's `hq` phrases, up to three spellings)
//   - YouTube in Israel, in Hebrew  (the same, ds=yt: what Israelis look for in videos — a second,
//                                    independent search behaviour)
//   - Google in the US, in English  (hl=en, gl=us, the store words; their first two words when the
//                                    full phrase is too specific to be completed) — "the world"
// plus LikeLink2's own visitors: exits to the store from the radar for the concept, in 30 days
// (the public click events). A state needs agreement: "not in Israel yet" only when BOTH Hebrew
// search sources show nothing (one search alone is UNCERTAIN), and every state carries its
// confidence (HIGH / MEDIUM / LOW) and the sources and dates behind it. Israeli stores' own search
// pages (Zap) and DuckDuckGo's suggestions were checked and are closed to automated reading by their
// robots.txt (2026-11-14), so they are not read.
// (English asked from Israel was measured on the first run, 2026-11-14, and dropped: its answers
// matched the US ones for nearly every concept, so it says nothing about Israel.)
// and counts how many suggestions EXTEND the phrase (other people's searches that contain it, not
// the echo of the phrase itself). Autocomplete only suggests what enough people search, so the
// count is a sign of search interest, never a volume: it is shown as a level, never as a number of
// searches, and the suggestions themselves are never stored or shown (they can carry brand names).
// Google Trends' daily Israel feed (public RSS) adds one more fact: the phrase was a trending
// search in Israel today.
//
// From the daily levels:
//   ARRIVED   (כבר כאן)        — a Hebrew search shows it a lot (confidence rises when another agrees), or it trended
//   ARRIVING  (מתחיל להגיע)    — first Hebrew searches in one source
//   UNCERTAIN (לא ודאי)        — only one Hebrew source answered, and it shows nothing
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
  ARRIVED: { he: "כבר בארץ", hint: "ישראלים כבר מחפשים את זה בעברית" },
  ARRIVING: { he: "מתחיל להגיע", hint: "הופיעו חיפושים ראשונים בעברית" },
  GAP: { he: "עוד לא הגיע לארץ", hint: "בעולם מזמינים, בעברית עוד לא מחפשים" },
  QUIET: { he: "שקט", hint: "עוד אין סימן חיפוש, לא בארץ ולא בחו״ל" },
  UNCERTAIN: { he: "לא ודאי", hint: "רק מקור אחד נמדד, ולא מספיק כדי לקבוע" },
  UNKNOWN: { he: "לא נבדק", hint: "אין עדיין מדידה של חיפושים" },
});

export const CONFIDENCE = Object.freeze({
  HIGH: { he: "ודאות גבוהה" },
  MEDIUM: { he: "ודאות בינונית" },
  LOW: { he: "ודאות נמוכה" },
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
export function suggestUrl(q, { hl = "he", gl = "il", ds = "" } = {}) {
  const p = new URLSearchParams({ client: "firefox", ...(ds ? { ds } : {}), hl, gl, q: String(q || "").slice(0, 80) });
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

/**
 * The Hebrew "skeleton" used for matching: without the vowel letters ו and י inside a word, so the
 * spellings Israelis really type compare equal ("סקווישי" = "סקוושי", seen on YouTube 2026-11-14).
 */
export const skeleton = (s = "") => normalize(s).split(" ").map((w) => (/[\u05d0-\u05ea]/.test(w) ? w[0] + w.slice(1).replace(/[וי]/g, "") : w)).join(" ");

/** How many suggestions extend the phrase: contain it (in any spelling), and are not the phrase itself. */
export function extensions(phrase, suggestions) {
  if (!Array.isArray(suggestions)) return null;
  const q = skeleton(phrase);
  if (!q) return null;
  const seen = new Set();
  for (const s of suggestions) {
    const n = skeleton(s);
    if (n && n !== q && n.includes(q)) seen.add(n);
  }
  return seen.size;
}

/** A count of extensions → NONE / FAINT / AWARE (null when not measured). */
export function levelOf(n, { rules = GAP } = {}) {
  if (!Number.isFinite(n)) return null;
  return n >= rules.aware ? "AWARE" : n >= rules.faint ? "FAINT" : "NONE";
}

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
 *   he: [n per Hebrew phrase] (null = not answered), world: n in the US, q: the Hebrew phrase that
 *   answered most (our own words, shown so anyone can check it on Google).
 */
export function awarenessReading({ he = [], yt = [], hq = [], world = null, trend = false, site = null } = {}, { now = Date.now() } = {}) {
  const best = (counts) => (Array.isArray(counts) ? counts : []).map((n, i) => [n, (Array.isArray(hq) ? hq : [])[i]]).filter(([n]) => Number.isFinite(n)).sort((a, b) => b[0] - a[0])[0];
  const g = best(he);
  const y = best(yt);
  return {
    d: new Date(now).toISOString().slice(0, 10),
    il: g ? g[0] : null,
    ...(g && typeof g[1] === "string" ? { q: g[1].slice(0, 60) } : {}),
    yt: y ? y[0] : null,
    world: Number.isFinite(world) ? world : null,
    trend: trend === true,
    ...(Number.isFinite(site) ? { site } : {}),
  };
}

/** Adds today's awareness reading (one per day; a later one the same day replaces it). */
export function addAwareness(history = [], reading, { rules = GAP } = {}) {
  const prev = (Array.isArray(history) ? history : []).filter((r) => r && r.d && r.d !== reading.d);
  return [...prev, reading].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-rules.keep);
}

/**
 * The consensus of one reading. Independent Hebrew search sources (Google, YouTube) and LikeLink2's
 * own visitors: ARRIVED when one shows it a lot (confidence HIGH when another agrees), or Google
 * Trends Israel had it; ARRIVING on a first sign; GAP/QUIET only when BOTH searches show
 * nothing; UNCERTAIN when only one search answered and it shows nothing. Confidence from how many
 * sources agree.
 */
export function consensusOf(r, { rules = GAP } = {}) {
  if (!r) return { state: "UNKNOWN", confidence: null, sources: 0 };
  const g = levelOf(r.il, { rules });
  const y = levelOf(r.yt, { rules });
  const s = Number.isFinite(r.site) ? (r.site >= 5 ? "AWARE" : r.site >= 1 ? "FAINT" : null) : null; // no visit is no evidence of absence
  const searches = [g, y].filter((l) => l !== null);
  const signs = [g, y, s].filter((l) => l === "AWARE" || l === "FAINT");
  const aware = [g, y, s].filter((l) => l === "AWARE").length;
  const world = levelOf(r.world, { rules });
  if (r.trend) return { state: "ARRIVED", confidence: "HIGH", sources: searches.length + 1 };
  // Many Hebrew completions in one source already mean Israelis search it; agreement raises confidence.
  if (aware >= 1) return { state: "ARRIVED", confidence: aware >= 2 || signs.length >= 2 ? "HIGH" : "MEDIUM", sources: signs.length };
  if (signs.length >= 1) return { state: "ARRIVING", confidence: signs.length >= 2 ? "MEDIUM" : "LOW", sources: signs.length };
  if (searches.length >= 2) return { state: world === "NONE" ? "QUIET" : "GAP", confidence: "MEDIUM", sources: searches.length };
  if (searches.length === 1) return { state: "UNCERTAIN", confidence: "LOW", sources: 1 };
  return { state: "UNKNOWN", confidence: null, sources: 0 };
}

const level = (n) => ({ NONE: "אין עדיין השלמות לחיפוש", FAINT: "מופיעות השלמות ראשונות לחיפוש", AWARE: "הרבה השלמות לחיפוש, כלומר מחפשים את זה" });

/**
 * The gap of one concept from its awareness history: today's consensus, its confidence (raised to
 * HIGH when the same state held on two days in a row), an observed arrival date, and the evidence
 * lines (Hebrew, dated, per source — levels only, never a number of searches).
 */
export function gapOf(history = [], { rules = GAP } = {}) {
  const rs = (Array.isArray(history) ? history : []).filter((r) => r?.d);
  const now = rs.at(-1);
  if (!now) return { state: "UNKNOWN", confidence: null, il: null, yt: null, world: null, arrivedOn: null, measuredSince: null, evidence: [] };
  const today = consensusOf(now, { rules });
  const before = rs.length > 1 ? consensusOf(rs.at(-2), { rules }) : null;
  const confidence = today.confidence === "MEDIUM" && before?.state === today.state ? "HIGH" : today.confidence;
  const il = levelOf(now.il, { rules });
  const yt = levelOf(now.yt, { rules });
  const world = levelOf(now.world, { rules });

  // The arrival clock: the first day the consensus showed a Hebrew sign after a day it showed none.
  let arrivedOn = null;
  let sawNone = false;
  for (const r of rs) {
    const st = consensusOf(r, { rules }).state;
    if (st === "GAP" || st === "QUIET") sawNone = true;
    else if (sawNone && (st === "ARRIVING" || st === "ARRIVED")) { arrivedOn = r.d; break; }
  }
  const evidence = [];
  const day = dm(now.d);
  const L = level();
  const q = now.q ? ` (״${now.q}״)` : "";
  if (now.trend) evidence.push({ k: "trend", text: `ב־${day} זה היה חיפוש חם בישראל לפי Google Trends.` });
  if (il !== null) evidence.push({ k: "il", text: `גוגל בישראל, בעברית${q}: ${L[il]} (${day}).` });
  if (yt !== null) evidence.push({ k: "yt", text: `יוטיוב בישראל, בעברית${q}: ${L[yt]} (${day}).` });
  if (Number.isFinite(now.site) && now.site > 0) evidence.push({ k: "site", text: `מבקרי LikeLink2 יצאו לחנות מהרדאר לסוג הזה ב־30 הימים האחרונים (${day}).` });
  if (world !== null) evidence.push({ k: "world", text: world === "NONE" ? `גוגל בארה״ב, באנגלית: אין עדיין השלמות לחיפוש (${day}).` : `גוגל בארה״ב, באנגלית: ${world === "FAINT" ? "מופיעות השלמות ראשונות" : "מחפשים את זה"} (${day}).` });
  if (today.state === "UNCERTAIN") evidence.push({ k: "uncertain", text: "רק מקור חיפוש אחד ענה היום, ולכן לא קובעים שזה עוד לא בארץ." });
  if (arrivedOn) evidence.push({ k: "arrived", text: `החיפושים בעברית התחילו להופיע ב־${dm(arrivedOn)} (לפני כן הרדאר לא ראה אותם).` });
  return { state: today.state, confidence, il, yt, world, arrivedOn, measuredSince: rs[0].d, evidence };
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
