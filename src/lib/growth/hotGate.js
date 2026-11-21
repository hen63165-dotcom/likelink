// Hot-only posting (the owner, 2026-11-16: "every product sent to Telegram must be a crazy product
// that not everyone has yet, with crazy demand — my channel must be unique"). The radar checks every
// site product daily against its 8 criteria (radarIntel.js criteriaOf: hot now, momentum, rising, not
// saturated in Israel, ≥ 300 orders, ships to Israel, pays commission, quality); only KEEP rows reach
// board.site.keep. The owner's channel posts only those, strongest Alpha first. No KEEP product →
// nothing is posted (silence beats a product everyone already has). Pure; tested.
export function hotOnlyPool(pool = [], board = null) {
  const keep = Array.isArray(board?.site?.keep) ? board.site.keep : null;
  if (!keep) return { pool: [], reason: "radar_board_missing" };
  const rank = new Map(keep.map((r, i) => [String(r.id), { i, alpha: Number(r.alpha) }]));
  const out = (Array.isArray(pool) ? pool : []).filter((p) => rank.has(String(p?.id)));
  out.sort((a, b) => (rank.get(String(b.id)).alpha || 0) - (rank.get(String(a.id)).alpha || 0) || rank.get(String(a.id)).i - rank.get(String(b.id)).i);
  return { pool: out, reason: out.length ? null : "no_hot_product_today" };
}

/**
 * The owner's channel, dupes only, never twice (the owner, 2026-11-21: "why does Telegram show the same
 * product every time, and not what I asked — I sent examples of the trendiest dupes"). Two causes were
 * found in the real log: bursts (four posts within one minute on 20.11) and the same product sent
 * twice in a row (79 s apart), because quick runs overwrote each other's history; and the picks were
 * generic KEEP products (cable trays, an egg mould), never her looks.
 *
 * Now: (1) only a site product of one of her looks (kind "style" on the watch list) whose demand is
 * EMERGING or RISING today: the look's picked item, or a product whose store title names the look in
 * the radar's own words (pickMatches); (2) never a
 * product (or the same title) posted to the channel in the last CHANNEL.repeatDays, read from the
 * publish log itself (the one record every send writes); (3) never a post sooner than
 * CHANNEL.minGapMinutes after the last one. Nothing rising → nothing posted, and the log names why.
 */
import { pickMatches } from "./trendRadar.js";

export const CHANNEL = Object.freeze({ repeatDays: 14, minGapMinutes: 90, lookStages: Object.freeze(["EMERGING", "RISING"]) });

const itemIdOf = (p) => String(p?.aliexpressId || p?.itemId || (String(p?.id || "").match(/^ae-(\d{6,20})$/) || [])[1] || "");
const titleKey = (t) => String(t || "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase().slice(0, 60);

/** Her looks rising today: style kinds at EMERGING/RISING with the radar's picked item. */
export function risingLooks(board = null, { rules = CHANNEL } = {}) {
  return (Array.isArray(board?.concepts) ? board.concepts : [])
    .filter((c) => c?.kind === "style" && rules.lookStages.includes(c.stage))
    .map((c) => ({ id: String(c.id), he: String(c.he || ""), hq: Array.isArray(c.hq) ? c.hq.map(String) : [], stage: c.stage, itemId: /^\d{6,20}$/.test(String(c.pick?.itemId || "")) ? String(c.pick.itemId) : null, weekPct: Number(c.signals?.demandWeek ?? c.demandWeek) || null }));
}

/** The channel's pool: only site products that are a rising look's picked item (exact item id). */
export function lookPool(pool = [], board = null, { rules = CHANNEL } = {}) {
  if (!board || !Array.isArray(board.concepts)) return { pool: [], reason: "radar_board_missing", looks: [] };
  const looks = risingLooks(board, { rules });
  if (!looks.length) return { pool: [], reason: "no_rising_look_today", looks };
  // A product belongs to a rising look when it is the look's picked item, or when its store title names
  // the look in the radar's own words (trendRadar.js pickMatches: the same check that validates picks).
  const lookOf = (p) => looks.find((l) => (l.itemId && l.itemId === itemIdOf(p)) || pickMatches(String(p?.title || ""), { he: l.he, hq: l.hq }) === true) || null;
  const order = (l) => (l.stage === "EMERGING" ? 0 : 1);
  const out = (Array.isArray(pool) ? pool : []).map((p) => [p, lookOf(p)]).filter(([, l]) => l)
    .sort(([, a], [, b]) => order(a) - order(b) || (b.weekPct || 0) - (a.weekPct || 0)).map(([p]) => p);
  return { pool: out, reason: out.length ? null : "rising_look_not_on_site", looks };
}

/**
 * No repeats and no bursts, from the publish log: drop every product posted to Telegram for this brand
 * in the last repeatDays (by id, or by the same title under another id), and say "too soon" when the
 * last post is younger than minGapMinutes.
 */
export function freshForChannel(pool = [], log = [], { brandId = "", now = Date.now(), rules = CHANNEL } = {}) {
  const sent = (Array.isArray(log) ? log : []).filter((e) => e && e.channel === "telegram" && (e.status === "PUBLISHED" || e.status === "DELIVERED_UNVERIFIED") && (!brandId || e.brandId === brandId));
  const at = (e) => Date.parse(e.publishedAt || e.at || "") || Number(e.ts) || 0;
  const last = sent.reduce((m, e) => Math.max(m, at(e)), 0);
  if (last && now - last < rules.minGapMinutes * 60_000) return { pool: [], tooSoon: true, lastAt: new Date(last).toISOString() };
  const since = now - rules.repeatDays * 86_400_000;
  const recent = sent.filter((e) => at(e) >= since);
  const ids = new Set(recent.map((e) => String(e.productId || "")));
  // The log keeps the post's text; its product line is "🛍️ <title>".
  const titleOf = (e) => e.title || (String(e.text || "").match(/🛍️\s*([^\n]+)/u) || [])[1] || "";
  const titles = new Set(recent.map((e) => titleKey(titleOf(e))).filter(Boolean));
  const out = (Array.isArray(pool) ? pool : []).filter((p) => !ids.has(String(p.id)) && !(titleKey(p.title) && titles.has(titleKey(p.title))));
  return { pool: out, tooSoon: false, lastAt: last ? new Date(last).toISOString() : null };
}
