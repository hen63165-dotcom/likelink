// What the browser does with the radar's board.json (the /radar page and the magic button). The
// board is fetched from another host (GitHub Pages, proxied), so it is treated as untrusted input:
// sanitizeBoard keeps only known fields of known shapes — a store button only to the owner's own
// tracked AliExpress links, a picture only over https from AliExpress's own image hosts, the check
// button only into /magic, text capped — and drops anything else. radarForItem is the magic button's
// bridge: where a checked item sits on the radar. Tiny and import-light: both pages bundle it.
import { CONFIDENCE, GAP_STATES, WINDOWS, normalize } from "./israelGap.js";
import { ACTIONS, HOT_STATES } from "./radarOpportunity.js";

const STAGE_KEYS = new Set(["EMERGING", "RISING", "STEADY", "PEAK", "COOLING", "UNVERIFIED"]);
const SIZES = new Set(["SMALL", "MID", "BIG"]);
const LEVELS = new Set(["NONE", "FAINT", "AWARE"]);
const HOTS = new Set(Object.keys(HOT_STATES));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const ITEM = /^\d{6,20}$/;
const BUY = /^https:\/\/s\.click\.aliexpress\.com\/[A-Za-z0-9_\-/.?=&%]+$/;
const IMG_HOST = /(^|\.)(aliexpress-media\.com|alicdn\.com|aliexpress\.com)$/i;

const str = (v, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const day = (v) => (typeof v === "string" && DAY.test(v) ? v : null);
const lines = (list, max = 8) => (Array.isArray(list) ? list : []).slice(0, max).map((e) => ({ k: str(e?.k, 20), text: str(e?.text, 300) })).filter((e) => e.text);
const series = (list) => (Array.isArray(list) ? list : []).slice(-60).filter((p) => Array.isArray(p) && day(p[0])).map((p) => [p[0], num(p[1])]);

/** An image only over https from AliExpress's own image hosts. */
export function radarImage(src) {
  try {
    const u = new URL(String(src || ""));
    return u.protocol === "https:" && IMG_HOST.test(u.hostname) ? u.href : null;
  } catch { return null; }
}

function cleanPick(p) {
  if (!p || typeof p !== "object") return null;
  const buy = typeof p.buy === "string" && BUY.test(p.buy) ? p.buy : null;
  if (!buy) return null; // no store button without the owner's own tracked link
  const check = typeof p.check === "string" && /^\/magic\?u=[A-Za-z0-9%._\-]+$/.test(p.check) ? p.check : null;
  const price = num(p.price);
  const m = p.momentum && HOTS.has(p.momentum.state) ? { state: p.momentum.state, he: HOT_STATES[p.momentum.state].he, weekPct: num(p.momentum.weekPct), line: str(p.momentum.line, 200) } : null;
  return { itemId: ITEM.test(String(p.itemId || "")) ? String(p.itemId) : null, title: str(p.title, 140), image: radarImage(p.image), price: price !== null && price > 0 ? price : null, checkedAt: str(p.checkedAt, 30), buy, check, momentum: m };
}

function cleanOpportunity(o) {
  if (!o || typeof o !== "object" || !Array.isArray(o.checks)) return null;
  const checks = o.checks.slice(0, 16).map((c) => ({ id: str(c?.id, 20), he: str(c?.he, 90), ok: c?.ok === true ? true : c?.ok === false ? false : null })).filter((c) => c.id && c.he);
  const measured = checks.filter((c) => c.ok !== null);
  return { checks, passed: measured.filter((c) => c.ok).length, measured: measured.length, score: measured.length ? Math.round((measured.filter((c) => c.ok).length / measured.length) * 100) : 0 };
}

const cleanSiteRow = (r) => (r && /^[\w-]{2,60}$/.test(String(r.id || "")) && HOTS.has(r.state)
  ? { id: r.id, title: str(r.title, 60), state: r.state, he: HOT_STATES[r.state].he, weekPct: num(r.weekPct), orders: num(r.orders), ordersBefore: num(r.ordersBefore), from: day(r.from), to: day(r.to) }
  : null);

function cleanRow(c) {
  if (!c || typeof c !== "object" || !ID.test(String(c.id || ""))) return null;
  const stage = STAGE_KEYS.has(c.stage) ? c.stage : "UNVERIFIED";
  const gapState = c.gap && Object.hasOwn(GAP_STATES, c.gap.state) ? c.gap.state : "UNKNOWN";
  const window = Object.hasOwn(WINDOWS, c.window) ? c.window : null;
  const today = c.today && typeof c.today === "object" ? { orders: num(c.today.orders), listings: num(c.today.listings), price: num(c.today.price) } : null;
  return {
    id: c.id,
    he: str(c.he, 80) || c.id,
    kind: str(c.kind, 20),
    auto: c.auto === true,
    found: day(c.found),
    stage,
    stageHe: str(c.stageHe, 40),
    score: Math.max(0, Math.min(100, num(c.score) ?? 0)),
    evidence: lines(c.evidence),
    series: series(c.series),
    listings: series(c.listings),
    since: day(c.since),
    measured: day(c.measured),
    today,
    size: SIZES.has(c.size) ? c.size : null,
    gap: { state: gapState, he: str(c.gap?.he, 40) || GAP_STATES[gapState].he, confidence: Object.hasOwn(CONFIDENCE, c.gap?.confidence) ? c.gap.confidence : null, confidenceHe: Object.hasOwn(CONFIDENCE, c.gap?.confidence) ? CONFIDENCE[c.gap.confidence].he : null, il: LEVELS.has(c.gap?.il) ? c.gap.il : null, yt: LEVELS.has(c.gap?.yt) ? c.gap.yt : null, world: LEVELS.has(c.gap?.world) ? c.gap.world : null, arrivedOn: day(c.gap?.arrivedOn), evidence: lines(c.gap?.evidence, 7) },
    window,
    windowHe: window ? WINDOWS[window].he : null,
    items: (Array.isArray(c.items) ? c.items : []).filter((x) => typeof x === "string" && ITEM.test(x)).slice(0, 20),
    match: (Array.isArray(c.match) ? c.match : []).map((m) => str(m, 60)).filter(Boolean).slice(0, 4),
    hot: Object.fromEntries(Object.entries(c.hot && typeof c.hot === "object" ? c.hot : {}).filter(([id, v]) => ITEM.test(id) && Array.isArray(v) && HOTS.has(v[0])).slice(0, 20).map(([id, v]) => [id, [v[0], num(v[1])]])),
    pick: cleanPick(c.pick),
    opportunity: cleanOpportunity(c.opportunity),
    action: Object.hasOwn(ACTIONS, c.action) ? c.action : null,
    actionHe: Object.hasOwn(ACTIONS, c.action) ? ACTIONS[c.action] : null,
  };
}

/** The board as the pages may use it, or null when it is not a radar board. */
export function sanitizeBoard(doc) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.concepts) || typeof doc.at !== "string" || !doc.record || typeof doc.record !== "object") return null;
  const r = doc.record;
  const recent = (Array.isArray(r.recent) ? r.recent : []).slice(0, 12).map((x) => ({ concept: str(x?.concept, 45), result: x?.result === "HIT" ? "HIT" : "MISS", at: day(x?.at), gradedAt: day(x?.gradedAt), growth: num(x?.growth) }));
  const clock = doc.clock && typeof doc.clock === "object" ? { observed: Math.max(0, num(doc.clock.observed) ?? 0), typicalDays: num(doc.clock.typicalDays) } : { observed: 0, typicalDays: null };
  return {
    v: num(doc.v) ?? 1,
    at: str(doc.at, 30),
    concepts: doc.concepts.slice(0, 200).map(cleanRow).filter(Boolean),
    record: { calls: num(r.calls) ?? 0, graded: num(r.graded) ?? 0, hits: num(r.hits) ?? 0, accuracy: num(r.accuracy), pending: num(r.pending) ?? 0, nextDue: day(r.nextDue), recent },
    clock,
    site: doc.site && typeof doc.site === "object" ? {
      checked: Math.max(0, num(doc.site.checked) ?? 0),
      counts: Object.fromEntries(Object.entries(doc.site.counts || {}).filter(([k, v]) => HOTS.has(k) && Number.isFinite(v))),
      hot: (Array.isArray(doc.site.hot) ? doc.site.hot : []).slice(0, 24).map(cleanSiteRow).filter((r) => r && r.state === "HOT"),
      cooling: (Array.isArray(doc.site.cooling) ? doc.site.cooling : []).slice(0, 24).map(cleanSiteRow).filter((r) => r && r.state === "COOLING"),
    } : null,
    rules: { hitPct: num(doc.rules?.hitPct) ?? 15, gradeDays: num(doc.rules?.gradeDays) ?? 14 },
  };
}

/**
 * The magic button's bridge: where a checked AliExpress item sits on the radar. An exact match is
 * the item being one of a concept's top items today; otherwise a concept whose Hebrew search words
 * appear in the item's store title ("looks like"). Null when the radar knows nothing about it.
 */
export function radarForItem(board, { itemId = "", title = "" } = {}) {
  const rows = Array.isArray(board?.concepts) ? board.concepts : [];
  const id = String(itemId || "").replace(/^ae-/, "");
  const pick = (c, match) => ({
    id: c.id, he: c.he, stage: c.stage, stageHe: c.stageHe, window: c.window || null, windowHe: c.windowHe || null,
    gap: c.gap?.state || "UNKNOWN", gapHe: c.gap?.he || "", confidenceHe: c.gap?.confidenceHe || null, measured: c.measured || null, auto: !!c.auto, match,
    action: c.action || null, actionHe: c.actionHe || null,
    // The checked item's own momentum when it is one of the concept's top items, or its buy pick.
    item: (match === "item" && c.hot?.[id]) ? { state: c.hot[id][0], he: HOT_STATES[c.hot[id][0]]?.he || "", weekPct: c.hot[id][1] } : null,
    isPick: Boolean(c.pick?.itemId && c.pick.itemId === id),
    opportunity: c.pick?.itemId && c.pick.itemId === id ? c.opportunity || null : null,
  });
  if (ITEM.test(id)) {
    const exact = rows.find((c) => Array.isArray(c.items) && c.items.includes(id));
    if (exact) return pick(exact, "item");
  }
  const t = normalize(title);
  if (t.length < 4) return null;
  let best = null;
  for (const c of rows) {
    for (const m of Array.isArray(c.match) ? c.match : []) {
      const p = normalize(m);
      if (p.length >= 4 && t.includes(p) && (!best || p.length > best.len)) best = { c, len: p.length };
    }
  }
  return best ? pick(best.c, "title") : null;
}

/** The checked item as one of the site's own products (from the board's site check), or null. */
export function siteHotFor(board, itemId = "") {
  const id = `ae-${String(itemId || "").replace(/^ae-/, "")}`;
  const rows = [...(board?.site?.hot || []), ...(board?.site?.cooling || [])];
  return rows.find((r) => r.id === id) || null;
}
