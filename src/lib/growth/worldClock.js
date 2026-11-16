// The global trend clock (השעון העולמי; the owner, 2026-11-16: "כן לשעון העולמי", after "the radar
// must be a world solution and also in Israel"). The worldwide check that day found no tool that
// measures how many days a PRODUCT trend takes to reach other countries, and no sealed "next country"
// call (docs/research/radar-gap-map.md, fourth check). Built from the radar's own daily readings only:
//   - the world pulse (worldPulse.js): Google's public suggestions per country for the product's
//     English store words, Baidu (Chinese) and Naver (Korean) in their own language;
//   - five more countries read for the clock alone (CLOCK_EXTRA: India, Spain, Italy, Brazil, Mexico),
//     kept out of the world pulse so the early-call signals stay exactly as they were sealed;
//   - Israel: the Israel gap's consensus of Hebrew searches (israelGap.js).
// A country's ARRIVAL is the first day the radar SAW the phrase searched there after a day it saw
// none (observed). Searched from the first reading = PRESENT (no arrival date: it was there before
// the radar looked). Never searched yet = QUIET (the phrase checked is printed, so anyone can verify).
// The national lag (e.g. Israel after the US) is shown only from `minPairs` measured pairs, with the
// count. "Which country is next" is a sealed call only once the lag table has measured data. Pure.

import { consensusOf } from "./israelGap.js";

/** The clock-only markets: read with the English store words in the country's own interface language. */
export const CLOCK_EXTRA = Object.freeze([
  Object.freeze({ id: "in", gl: "in", hl: "en", he: "הודו" }),
  Object.freeze({ id: "es", gl: "es", hl: "es", he: "ספרד" }),
  Object.freeze({ id: "it", gl: "it", hl: "it", he: "איטליה" }),
  Object.freeze({ id: "br", gl: "br", hl: "pt-BR", he: "ברזיל" }),
  Object.freeze({ id: "mx", gl: "mx", hl: "es-419", he: "מקסיקו" }),
]);

/**
 * The countries on the clock, in display order. `from` names where the daily level comes from:
 * world.by[...] (one or more readings, the highest counts), world.x[...] (clock-only), or Israel.
 * `lang` is the language of the phrase checked there (printed on the page).
 */
export const CLOCK_COUNTRIES = Object.freeze([
  Object.freeze({ id: "us", he: "ארה״ב", flag: "🇺🇸", by: ["us"], lang: "en" }),
  Object.freeze({ id: "gb", he: "בריטניה", flag: "🇬🇧", by: ["gb"], lang: "en" }),
  Object.freeze({ id: "ca", he: "קנדה", flag: "🇨🇦", by: ["ca"], lang: "en" }),
  Object.freeze({ id: "au", he: "אוסטרליה", flag: "🇦🇺", by: ["au"], lang: "en" }),
  Object.freeze({ id: "in", he: "הודו", flag: "🇮🇳", x: "in", lang: "en" }),
  Object.freeze({ id: "de", he: "גרמניה", flag: "🇩🇪", by: ["de"], lang: "en" }),
  Object.freeze({ id: "fr", he: "צרפת", flag: "🇫🇷", by: ["fr"], lang: "en" }),
  Object.freeze({ id: "es", he: "ספרד", flag: "🇪🇸", x: "es", lang: "en" }),
  Object.freeze({ id: "it", he: "איטליה", flag: "🇮🇹", x: "it", lang: "en" }),
  Object.freeze({ id: "br", he: "ברזיל", flag: "🇧🇷", x: "br", lang: "en" }),
  Object.freeze({ id: "mx", he: "מקסיקו", flag: "🇲🇽", x: "mx", lang: "en" }),
  Object.freeze({ id: "jp", he: "יפן", flag: "🇯🇵", by: ["jp"], lang: "en" }),
  Object.freeze({ id: "kr", he: "קוריאה", flag: "🇰🇷", by: ["kr", "krn"], lang: "en+ko" }),
  Object.freeze({ id: "cn", he: "סין", flag: "🇨🇳", by: ["cn"], lang: "zh" }),
  Object.freeze({ id: "il", he: "ישראל", flag: "🇮🇱", israel: true, lang: "he" }),
]);
export const CLOCK_IDS = Object.freeze(CLOCK_COUNTRIES.map((c) => c.id));

export const CLOCK = Object.freeze({
  faint: 1, // suggestions that extend the phrase, from which it is searched at all (as the world pulse)
  minPairs: 3, // measured arrival pairs before a national lag is shown
  base: "us", // the lag table is measured against this country
  callDays: 14, // a "next country" call is graded after this many days
  maxCallsPerDay: 3,
});

const DAY = 86_400_000;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

/** Is the phrase searched in one country on one day? true / false / null (no usable answer). */
export function presentIn(country, { world = null, israel = null } = {}, { rules = CLOCK } = {}) {
  if (country.israel) {
    if (!israel) return null;
    const st = consensusOf(israel).state;
    if (st === "ARRIVING" || st === "ARRIVED") return true;
    if (st === "GAP" || st === "QUIET") return false;
    return null; // UNCERTAIN / UNKNOWN: one search alone is never "not in Israel"
  }
  if (!world) return null;
  const vals = country.x ? [world.x?.[country.x]] : (country.by || []).map((k) => world.by?.[k]);
  const nums = vals.filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return Math.max(...nums) >= rules.faint;
}

/**
 * One concept's clock from its two daily histories (world.json and awareness.json): per country
 * ARRIVED (with the observed day), PRESENT (searched from the first reading), QUIET, or UNMEASURED.
 */
export function clockOf(worldHistory = [], israelHistory = [], { rules = CLOCK } = {}) {
  const w = new Map((Array.isArray(worldHistory) ? worldHistory : []).filter((r) => r?.d).map((r) => [r.d, r]));
  const il = new Map((Array.isArray(israelHistory) ? israelHistory : []).filter((r) => r?.d).map((r) => [r.d, r]));
  const dates = [...new Set([...w.keys(), ...il.keys()])].sort();
  const countries = CLOCK_COUNTRIES.map((c) => {
    let sawNone = false;
    let measured = null;
    let status = "UNMEASURED";
    let on = null;
    for (const d of dates) {
      const p = presentIn(c, { world: w.get(d) || null, israel: il.get(d) || null }, { rules });
      if (p === null) continue;
      measured = measured || d;
      if (p === false) { sawNone = true; if (status === "UNMEASURED") status = "QUIET"; continue; }
      if (sawNone) { status = "ARRIVED"; on = d; } else status = "PRESENT";
      break;
    }
    return { id: c.id, status, on, since: measured };
  });
  const order = countries.filter((c) => c.status === "ARRIVED").sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : CLOCK_IDS.indexOf(a.id) - CLOCK_IDS.indexOf(b.id))).map((c) => c.id);
  return {
    countries,
    order,
    reached: countries.filter((c) => c.status === "ARRIVED" || c.status === "PRESENT").length,
    quiet: countries.filter((c) => c.status === "QUIET").map((c) => c.id),
    measured: countries.filter((c) => c.status !== "UNMEASURED").length,
  };
}

/**
 * The national lag table: for each country, how many days after `base` (the US) a product trend
 * reached it, from concepts where BOTH arrivals were observed (a country already searching when the
 * radar began has no arrival day and is never counted). A median only from `minPairs` pairs.
 * Negative days = that country came first.
 */
export function lagTable(clocks = {}, { rules = CLOCK } = {}) {
  const at = (cl, id) => cl?.countries?.find((c) => c.id === id && c.status === "ARRIVED")?.on || null;
  return CLOCK_IDS.filter((id) => id !== rules.base).map((id) => {
    const pairs = [];
    for (const [concept, cl] of Object.entries(clocks || {})) {
      const a = at(cl, rules.base);
      const b = at(cl, id);
      if (a && b) pairs.push({ concept, base: a, on: b, days: days(a, b) });
    }
    pairs.sort((x, y) => (x.on < y.on ? 1 : -1));
    return { id, n: pairs.length, medianDays: pairs.length >= rules.minPairs ? median(pairs.map((p) => p.days)) : null, pairs: pairs.slice(0, 5) };
  });
}

/**
 * The radar's sealed "next country" call for one concept: among the countries still QUIET, the one
 * whose measured lag after the base is the shortest. Only when the trend already reached the base
 * country (observed or present) and the lag table has a measured median for that country; otherwise
 * no call (the radar never guesses without data).
 */
export function nextCountryOf(clock, table = [], { rules = CLOCK } = {}) {
  if (!clock?.countries) return null;
  const base = clock.countries.find((c) => c.id === rules.base);
  if (!base || (base.status !== "ARRIVED" && base.status !== "PRESENT")) return null;
  const lag = new Map((Array.isArray(table) ? table : []).filter((r) => r.medianDays !== null && r.medianDays !== undefined).map((r) => [r.id, r]));
  const cands = clock.quiet.filter((id) => lag.has(id)).sort((a, b) => lag.get(a).medianDays - lag.get(b).medianDays || CLOCK_IDS.indexOf(a) - CLOCK_IDS.indexOf(b));
  if (!cands.length) return null;
  const r = lag.get(cands[0]);
  return { country: cands[0], medianDays: r.medianDays, n: r.n };
}

/** Saves today's new "next country" calls (one open call per concept; at most `maxCallsPerDay`). */
export function recordNextCalls(calls = [], clocks = {}, table = [], today, { rules = CLOCK } = {}) {
  const out = Array.isArray(calls) ? [...calls] : [];
  let made = 0;
  for (const [concept, cl] of Object.entries(clocks || {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (made >= rules.maxCallsPerDay) break;
    if (out.some((c) => c.concept === concept && !c.result)) continue;
    const next = nextCountryOf(cl, table, { rules });
    if (!next) continue;
    out.push({ concept, country: next.country, at: today, due: new Date(Date.parse(today) + rules.callDays * DAY).toISOString().slice(0, 10), basis: { medianDays: next.medianDays, n: next.n } });
    made++;
  }
  return out;
}

/** Grades open calls (HIT: the called country's arrival observed by the due day; MISS after it). Never edits a graded call. */
export function gradeNextCalls(calls = [], clocks = {}, today) {
  return (Array.isArray(calls) ? calls : []).map((c) => {
    if (c.result) return c;
    const got = clocks?.[c.concept]?.countries?.find((x) => x.id === c.country);
    if (got?.status === "ARRIVED" && got.on >= c.at && got.on <= c.due) return { ...c, result: "HIT", gradedAt: today, arrivedOn: got.on };
    if (today > c.due) return { ...c, result: "MISS", gradedAt: today };
    return c;
  });
}

/** The sealed text of every "next country" call (sorted; anyone can recompute its SHA-256). */
export function nextCallsSealText(calls = []) {
  return (Array.isArray(calls) ? calls : []).filter((c) => c?.concept && c.country && c.at).map((c) => `${c.concept}|${c.at}|${c.country}`).sort().join("\n");
}

/**
 * The board's globe section: the countries, the lag table, Israel's own number, the waves worth
 * showing (most countries reached, observed arrivals first) and the calls. Pure.
 */
export function globeBoard({ clocks = {}, concepts = [], calls = [], today = null, maxWaves = 10 } = {}, { rules = CLOCK } = {}) {
  const table = lagTable(clocks, { rules });
  const il = table.find((r) => r.id === "il") || { n: 0, medianDays: null, pairs: [] };
  const byId = new Map((Array.isArray(concepts) ? concepts : []).map((c) => [c.id, c]));
  const waves = Object.entries(clocks || {}).filter(([id, cl]) => byId.has(id) && cl.reached > 0).map(([id, cl]) => {
    const c = byId.get(id);
    const ilRow = cl.countries.find((x) => x.id === "il");
    const usRow = cl.countries.find((x) => x.id === rules.base);
    const israelAfterUs = ilRow?.status === "ARRIVED" && usRow?.status === "ARRIVED" ? days(usRow.on, ilRow.on) : null;
    return { id, he: c.he || "", en: c.en || "", q: c.q || "", zh: c.zh || "", ko: c.ko || "", reached: cl.reached, measured: cl.measured, arrivals: cl.order.length, countries: cl.countries.map(({ id: cid, status, on }) => ({ id: cid, status, on })), israelAfterUs };
  }).sort((a, b) => b.arrivals - a.arrivals || b.reached - a.reached || (a.id < b.id ? -1 : 1)).slice(0, maxWaves);
  const graded = calls.filter((c) => c.result);
  return {
    at: today,
    countries: CLOCK_COUNTRIES.map(({ id, he, flag, lang }) => ({ id, he, flag, lang })),
    base: rules.base,
    minPairs: rules.minPairs,
    table: table.map(({ id, n, medianDays }) => ({ id, n, medianDays })),
    israel: { n: il.n, medianDays: il.medianDays, pairs: il.pairs },
    observed: Object.values(clocks || {}).reduce((s, cl) => s + (cl.order?.length || 0), 0),
    waves,
    calls: {
      open: calls.filter((c) => !c.result).slice(-12).map(({ concept, country, at, due }) => ({ concept, country, at, due })),
      recent: graded.slice(-12).reverse().map(({ concept, country, at, due, result, arrivedOn }) => ({ concept, country, at, due, result, arrivedOn: arrivedOn || null })),
      graded: graded.length,
      hits: graded.filter((c) => c.result === "HIT").length,
    },
  };
}
