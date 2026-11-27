// 🔎 Who knew it first: the radar or Google (the owner, 27.11: "find a genius way to surpass Google
// Trends, so the radar is above them and above everyone"; and Exploding Topics, a search-growth tool).
// Google Trends shows what people already search: Google's search box completes a phrase only once
// enough people type it, and a phrase reaches Google's daily trending searches only once it is big.
// So every sealed call of the radar is timed against Google itself, on three of its own public doors:
//   box      — Google's suggestions complete the phrase in ≥ `spreadFrom` of the countries read (13),
//              or in at least half of them (the world gap's SPREADING / KNOWN by share);
//   echo     — Google's suggestions add tiktok / viral / trending / amazon to it in any country;
//   trending — the phrase is in Google's daily trending searches of any country read (Israel + 10).
// Each open call's phrase is read again in the box every `everyDays` for `watchDays` after its seal,
// and every world-gap reading of the day is kept too. Per call and line:
//   AHEAD        — Google was quiet at a reading on or after the seal and showed it later: the radar
//                  sealed it first; Google crossed between the last quiet reading and the first showing,
//                  so the lead is a range (`minDays`–`maxDays`), counted at its low end;
//   GOOGLE_FIRST — Google already showed it on or before the seal day (never in the radar's favour);
//   LATE_READ    — first read after the seal already showing it: who was first is unknown, counted apart;
//   QUIET        — quiet at every reading since the seal (so far), for `quietDays`;
//   UNREAD       — no reading on or after the seal yet.
// Counts only: no suggestion text is kept; the trending terms are kept in the encrypted state (60 days)
// and never published. Pure.
import { pairsOf } from "./rivalSignal.js";

export const GRACE = Object.freeze({
  spreadFrom: 3,
  knownShare: 0.5,
  minMeasured: 10, // countries that answered, for a box reading to count
  everyDays: 3,
  watchDays: 60,
  maxPerRun: 30,
  maxReads: 30, // box readings kept per phrase
  maxPhrases: 3000,
  trendDays: 60,
  trendTerms: 40,
  budgetMs: 240_000,
  maxFailures: 25,
});
export const RACE_LINES = Object.freeze(["box", "echo", "trending"]);
export const RACE_BOOKS = Object.freeze(["early", "stages", "fresh", "kinds", "prelaunch", "noise"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const dayBack = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** The phrase as the race keys it: lower case, single spaces, Latin letters, digits and apostrophes. */
export function phraseKey(p) {
  const k = String(p || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  return k.length >= 3 && k.length <= 80 ? k : null;
}

/** Whether one box reading shows the phrase (searched in enough countries) and whether it echoes. */
export function boxShows(r, { rules = GRACE } = {}) {
  if (!r || !(r.measured >= rules.minMeasured)) return null;
  return r.searched >= rules.spreadFrom || r.searched / r.measured >= rules.knownShare;
}

/** One day's box reading for a phrase ({ searched, measured, echo }), one per day (the newest wins). */
export function recordBox(state = {}, phrase, reading, today, { rules = GRACE } = {}) {
  const s = { ...state, box: { ...(state.box || {}) }, since: { ...(state.since || {}) } };
  const key = phraseKey(phrase);
  if (!key || !DAY.test(String(today || "")) || !reading) return s;
  const searched = Number(reading.searched), measured = Number(reading.measured);
  if (!Number.isFinite(searched) || !Number.isFinite(measured) || measured < rules.minMeasured) return s;
  const row = [today, Math.round(searched), Math.round(measured), reading.echo ? 1 : 0];
  const reads = (s.box[key] || []).filter((x) => x[0] !== today);
  s.box[key] = [...reads, row].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-rules.maxReads);
  s.since.box ||= today;
  const keys = Object.keys(s.box);
  if (keys.length > rules.maxPhrases) {
    const last = (k) => s.box[k].at(-1)?.[0] || "";
    for (const k of keys.sort((a, b) => (last(a) < last(b) ? -1 : 1)).slice(0, keys.length - rules.maxPhrases)) delete s.box[k];
  }
  return s;
}

/** Google's trending searches of the day, per country ({ geo: [terms] }); days older than `trendDays` out. */
export function recordTrends(state = {}, byGeo = {}, today, { rules = GRACE } = {}) {
  const s = { ...state, trends: { ...(state.trends || {}) }, since: { ...(state.since || {}) } };
  if (!DAY.test(String(today || ""))) return s;
  const day = {};
  for (const [geo, terms] of Object.entries(byGeo && typeof byGeo === "object" ? byGeo : {})) {
    if (!/^[a-z]{2}$/i.test(geo) || !Array.isArray(terms)) continue;
    const t = [...new Set(terms.map((x) => String((typeof x === "string" ? x : x?.term) || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80)).filter(Boolean))].slice(0, rules.trendTerms);
    if (t.length) day[geo.toLowerCase()] = t;
  }
  if (Object.keys(day).length) { s.trends[today] = day; s.since.trends ||= today; }
  const cut = dayBack(today, rules.trendDays);
  for (const d of Object.keys(s.trends)) if (!DAY.test(d) || d < cut) delete s.trends[d];
  return s;
}

/** Whether a trending term names the phrase: every two-word part of the phrase is in the term. */
export function termNames(phrase, term) {
  const want = pairsOf(phrase);
  if (!want.length) return false;
  const has = new Set(pairsOf(term));
  return want.every((x) => has.has(x));
}

/** The readings of one line for a phrase, oldest first: [{ d, shown }]. */
export function lineReadings(phrase, state = {}, line, { rules = GRACE } = {}) {
  const key = phraseKey(phrase);
  if (!key) return [];
  if (line === "trending") {
    if (!pairsOf(key).length) return [];
    return Object.entries(state.trends || {}).filter(([d]) => DAY.test(d)).sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([d, byGeo]) => ({ d, shown: Object.values(byGeo || {}).some((terms) => (terms || []).some((t) => termNames(key, t))) }));
  }
  return (state.box?.[key] || []).map(([d, searched, measured, echo]) => {
    const shown = line === "echo" ? (measured >= rules.minMeasured ? echo === 1 : null) : boxShows({ searched, measured }, { rules });
    return { d, shown };
  }).filter((r) => DAY.test(String(r.d)) && r.shown !== null);
}

/** One sealed call against one line's readings. */
export function raceLine(called, readings = []) {
  if (!DAY.test(String(called || ""))) return { state: "UNREAD" };
  const first = readings.find((r) => r.shown);
  if (first && first.d <= called) return { state: "GOOGLE_FIRST", d: first.d, days: daysBetween(first.d, called) };
  const after = readings.filter((r) => r.d >= called);
  if (!after.length) return { state: "UNREAD" };
  if (!first) return { state: "QUIET", last: after.at(-1).d, quietDays: daysBetween(called, after.at(-1).d) };
  const quiet = after.filter((r) => !r.shown && r.d < first.d);
  if (!quiet.length) return { state: "LATE_READ", d: first.d };
  return { state: "AHEAD", d: first.d, quiet: quiet.at(-1).d, minDays: daysBetween(called, quiet.at(-1).d) + 1, maxDays: daysBetween(called, first.d) };
}

/**
 * One call against Google, all lines together, never in the radar's favour: Google first on any line
 * wins; a late read on any line leaves the order unknown; ahead only when no line says otherwise, at the
 * smallest lead; quiet when every line read is quiet.
 */
export function googleRace(called, phrase, state = {}, { rules = GRACE } = {}) {
  const lines = Object.fromEntries(RACE_LINES.map((l) => [l, raceLine(called, lineReadings(phrase, state, l, { rules }))]));
  const st = Object.values(lines).map((x) => x.state);
  let all;
  if (st.includes("GOOGLE_FIRST")) {
    const g = Object.entries(lines).filter(([, x]) => x.state === "GOOGLE_FIRST").sort((a, b) => (a[1].d < b[1].d ? -1 : 1))[0];
    all = { state: "GOOGLE_FIRST", line: g[0], d: g[1].d, days: g[1].days };
  } else if (st.includes("LATE_READ")) all = { state: "LATE_READ" };
  else if (st.includes("AHEAD")) {
    const a = Object.entries(lines).filter(([, x]) => x.state === "AHEAD").sort((x, y) => x[1].minDays - y[1].minDays)[0];
    all = { state: "AHEAD", line: a[0], d: a[1].d, minDays: a[1].minDays, maxDays: a[1].maxDays };
  } else if (st.includes("QUIET")) all = { state: "QUIET", quietDays: Math.max(...Object.values(lines).filter((x) => x.state === "QUIET").map((x) => x.quietDays)) };
  else all = { state: "UNREAD" };
  return { ...all, lines };
}

/** The phrases to read in Google's box today: calls sealed within `watchDays`, longest unread first. */
export function raceQueue(entries = [], state = {}, today, { rules = GRACE } = {}) {
  if (!DAY.test(String(today || ""))) return [];
  const due = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    const key = phraseKey(e?.phrase);
    if (!key || !DAY.test(String(e?.called || "")) || e.called > today || daysBetween(e.called, today) > rules.watchDays) continue;
    const reads = state.box?.[key] || [];
    const last = reads.at(-1)?.[0] || "";
    if (last && daysBetween(last, today) < rules.everyDays) continue;
    // Shown in the box and echoed: both lines crossed, nothing left to time.
    if (lineReadings(key, state, "box", { rules }).some((r) => r.shown) && lineReadings(key, state, "echo", { rules }).some((r) => r.shown)) continue;
    const prev = due.get(key);
    if (!prev || e.called < prev.called) due.set(key, { phrase: key, called: e.called, last });
  }
  return [...due.values()].sort((a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : a.called < b.called ? 1 : -1)).slice(0, rules.maxPerRun).map((x) => x.phrase);
}

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const tally = () => ({ calls: 0, read: 0, ahead: 0, googleFirst: 0, quiet: 0, lateRead: 0, unread: 0, aheadMin: [], quietDays: [] });
const add = (t, r) => {
  t.calls++;
  if (r.state === "UNREAD") { t.unread++; return; }
  t.read++;
  if (r.state === "AHEAD") { t.ahead++; t.aheadMin.push(r.minDays); } else if (r.state === "GOOGLE_FIRST") t.googleFirst++;
  else if (r.state === "LATE_READ") t.lateRead++;
  else if (r.state === "QUIET") { t.quiet++; t.quietDays.push(r.quietDays); }
};
const out = (t) => ({ calls: t.calls, read: t.read, ahead: t.ahead, googleFirst: t.googleFirst, quiet: t.quiet, lateRead: t.lateRead, unread: t.unread, medianAheadMinDays: median(t.aheadMin), medianQuietDays: median(t.quietDays) });

/** The board: every sealed call against Google, per line and together, per book; named calls (full board only). */
export function googleRaceBoard(entries = [], state = {}, today, { doors = {}, readToday = 0, rules = GRACE } = {}) {
  const all = tally();
  const lines = Object.fromEntries(RACE_LINES.map((l) => [l, tally()]));
  const books = {};
  const named = [];
  const seen = new Set();
  for (const e of Array.isArray(entries) ? entries : []) {
    const key = phraseKey(e?.phrase);
    if (!key || !DAY.test(String(e?.called || "")) || !RACE_BOOKS.includes(e.book)) continue;
    const id = `${e.book}|${key}|${e.called}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const r = googleRace(e.called, key, state, { rules });
    add(all, r);
    for (const l of RACE_LINES) add(lines[l], r.lines[l]);
    add((books[e.book] ||= tally()), r);
    if (r.state === "AHEAD" || r.state === "GOOGLE_FIRST") named.push({ book: e.book, phrase: key, called: e.called, state: r.state, line: r.line, d: r.d, ...(r.state === "AHEAD" ? { minDays: r.minDays, maxDays: r.maxDays } : { days: r.days }) });
  }
  return {
    d: today,
    doors: { box: doors.box || null, trending: doors.trending || null },
    since: { box: state.since?.box || null, trends: state.since?.trends || null },
    tracked: Object.keys(state.box || {}).length,
    trendDays: Object.keys(state.trends || {}).length,
    readToday,
    rules: { spreadFrom: rules.spreadFrom, everyDays: rules.everyDays, watchDays: rules.watchDays },
    all: out(all),
    lines: Object.fromEntries(RACE_LINES.map((l) => [l, out(lines[l])])),
    books: Object.fromEntries(Object.entries(books).map(([b, t]) => [b, out(t)])),
    named: named.sort((a, b) => (a.called < b.called ? 1 : -1)).slice(0, 20),
  };
}

/** The browser's copy. Behind the lock (`full: false`) the counts only, never a named call's phrase. */
export function cleanGoogleRace(b, { full = true } = {}) {
  if (!b || typeof b !== "object" || !DAY.test(String(b.d || ""))) return null;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 1e6 ? Math.round(Number(x)) : null);
  const d = (x) => (DAY.test(String(x || "")) ? x : null);
  const door = (x) => (["OK", "FAILED", "ROBOTS_DISALLOW", "EMPTY", "OFF", "SKIPPED"].includes(x) ? x : null);
  const t = (x = {}) => ({ calls: n(x.calls) ?? 0, read: n(x.read) ?? 0, ahead: n(x.ahead) ?? 0, googleFirst: n(x.googleFirst) ?? 0, quiet: n(x.quiet) ?? 0, lateRead: n(x.lateRead) ?? 0, unread: n(x.unread) ?? 0, medianAheadMinDays: n(x.medianAheadMinDays), medianQuietDays: n(x.medianQuietDays) });
  const r = b.rules || {};
  return {
    d: b.d,
    doors: { box: door(b.doors?.box), trending: door(b.doors?.trending) },
    since: { box: d(b.since?.box), trends: d(b.since?.trends) },
    tracked: n(b.tracked) ?? 0,
    trendDays: n(b.trendDays) ?? 0,
    readToday: n(b.readToday) ?? 0,
    rules: { spreadFrom: n(r.spreadFrom) ?? GRACE.spreadFrom, everyDays: n(r.everyDays) ?? GRACE.everyDays, watchDays: n(r.watchDays) ?? GRACE.watchDays },
    all: t(b.all),
    lines: Object.fromEntries(RACE_LINES.map((l) => [l, t(b.lines?.[l])])),
    books: Object.fromEntries(RACE_BOOKS.filter((k) => b.books?.[k]).map((k) => [k, t(b.books[k])])),
    named: full ? (Array.isArray(b.named) ? b.named : []).filter((x) => RACE_BOOKS.includes(x?.book) && phraseKey(x?.phrase) === x?.phrase && ["AHEAD", "GOOGLE_FIRST"].includes(x?.state) && RACE_LINES.includes(x?.line)).slice(0, 20)
      .map((x) => ({ book: x.book, phrase: x.phrase, called: d(x.called), state: x.state, line: x.line, d: d(x.d), ...(x.state === "AHEAD" ? { minDays: n(x.minDays), maxDays: n(x.maxDays) } : { days: n(x.days) }) })) : [],
  };
}
