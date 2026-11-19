// "The radar vs luck" (the owner, 2026-11-19, "כן", after ChatGPT pointed at projects that already
// timestamp forecasts in Bitcoin: NeuPortal for markets, and the Brier Index — a forecasting score,
// not a sealed log). NeuPortal's own write-up concedes that a timestamp proves a call was not changed,
// never that it was good. So every day, beside the radar's calls, one kind of product is drawn at
// random from the kinds measured that day and graded by exactly the same rule (+15% orders within
// 14 days). The record then shows how often the radar's calls hit against how often luck does.
//
// The draw cannot be steered: its seed is the SHA-256 of that day's sealed store-price text (the
// prices AliExpress returned, which the radar does not choose), so anyone can recompute it from the
// published day text and the list of kinds read that day. A day without sealed prices has no draw.
// Every draw is a line in its own sealed book under the daily root. Pure; tested.

import { createHash } from "node:crypto";

const DAY_MS = 86_400_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[0-9a-f]{64}$/;
const CONCEPT = /^[a-z0-9][a-z0-9-]{0,79}$/;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
const round = (n) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

export const LUCK = Object.freeze({ hitPct: 15, gradeDays: 14, minGraded: 3 });

/** The day's seed: SHA-256 over the day and the sealed price text's hash. Null without a sealed price day. */
export function luckSeed(day, pricesSha) {
  if (!DAY.test(String(day || "")) || !SHA.test(String(pricesSha || ""))) return null;
  return createHash("sha256").update(`luck|${day}|${pricesSha}`).digest("hex");
}

/**
 * The draw: among the kinds measured on `day` with orders above zero, sorted by id, the one at
 * (first 12 hex of the seed) mod count. Returns { concept, base, seed } or null.
 */
export function drawLuck(readings = {}, day, seed) {
  if (!seed || !SHA.test(seed)) return null;
  const pool = Object.keys(readings || {})
    .filter((id) => CONCEPT.test(id))
    .map((id) => ({ id, last: (Array.isArray(readings[id]) ? readings[id] : []).at(-1) }))
    .filter((x) => x.last?.d === day && Number(x.last.sum) > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!pool.length) return null;
  const pick = pool[parseInt(seed.slice(0, 12), 16) % pool.length];
  return { concept: pick.id, base: Number(pick.last.sum), seed, pool: pool.length };
}

/** Adds the day's draw once (one per day, never replaced). */
export function recordLuck(list = [], draw, day, rules = LUCK) {
  const out = (Array.isArray(list) ? list : []).map((x) => ({ ...x }));
  if (!draw || !DAY.test(String(day || "")) || out.some((x) => x.at === day)) return out;
  out.push({ concept: draw.concept, at: day, base: draw.base, due: dayOf(Date.parse(day) + rules.gradeDays * DAY_MS), seed: draw.seed, pool: draw.pool });
  return out;
}

/** Grades every open draw due by its kind's newest reading, by the radar's own rule. Never edits a graded one. */
export function gradeLuck(list = [], readings = {}, rules = LUCK) {
  return (Array.isArray(list) ? list : []).map((x) => {
    if (!x || x.result) return { ...x };
    const latest = (Array.isArray(readings?.[x.concept]) ? readings[x.concept] : []).at(-1);
    if (!latest || daysBetween(x.at, latest.d) < rules.gradeDays) return { ...x };
    const growth = x.base > 0 ? (latest.sum / x.base - 1) * 100 : null;
    return { ...x, result: growth !== null && growth >= rules.hitPct ? "HIT" : "MISS", gradedAt: latest.d, growth: round(growth) };
  });
}

/** The sealed book: one sorted line per draw, `concept|drawn on|orders then|graded on|grade|seed`. */
export function luckSealText(list = []) {
  return (Array.isArray(list) ? list : [])
    .filter((x) => x && CONCEPT.test(String(x.concept || "")) && DAY.test(String(x.at || "")) && DAY.test(String(x.due || "")) && Number(x.base) > 0 && SHA.test(String(x.seed || "")))
    .map((x) => `${x.concept}|${x.at}|${Math.round(Number(x.base))}|${x.due}|${x.result === "HIT" || x.result === "MISS" ? x.result : "-"}|${x.seed}`)
    .sort()
    .join("\n");
}

const tally = (list) => {
  const graded = (Array.isArray(list) ? list : []).filter((x) => x?.result === "HIT" || x?.result === "MISS");
  const hits = graded.filter((x) => x.result === "HIT").length;
  return { graded: graded.length, hits, rate: graded.length ? Math.round((hits / graded.length) * 100) : null };
};

/**
 * The comparison the page prints: the radar's graded calls (every kind of call it seals) against the
 * graded draws. `edge` (percentage points) only once both sides have `minGraded` grades; never a claim before.
 */
export function luckVersus(radarCalls = [], draws = [], rules = LUCK) {
  const radar = tally(radarCalls);
  const luck = tally(draws);
  const edge = radar.graded >= rules.minGraded && luck.graded >= rules.minGraded ? radar.rate - luck.rate : null;
  return { radar, luck, edge };
}

/** What the board carries: today's draw (if any), the record, the comparison and the next grade day. */
export function luckBoard(draws = [], radarCalls = [], today = null) {
  const list = Array.isArray(draws) ? draws : [];
  const todays = list.find((x) => x?.at === today) || null;
  const open = list.filter((x) => x && !x.result).map((x) => x.due).sort();
  return {
    today: todays ? { concept: todays.concept, at: todays.at, base: todays.base, due: todays.due, seed: todays.seed, pool: todays.pool } : null,
    versus: luckVersus(radarCalls, list),
    draws: list.length,
    nextDue: open[0] || null,
    recent: list.filter((x) => x?.result).slice(-12).reverse().map((x) => ({ concept: x.concept, at: x.at, result: x.result, growth: x.growth ?? null })),
  };
}
