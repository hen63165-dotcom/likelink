// 📡 → 📣 One selection engine for every channel (the owner, 2026-11-21: "why does Telegram show the
// same product every time, and not what I asked"; then "Telegram and Instagram must operate from one
// shared discovery and ranking engine, with platform-specific content and publishing controls").
//
// Root causes found in the real publish log of 20–21.11:
//   1. bursts: four posts within one minute (20.11 20:01–20:02);
//   2. the same product twice, 79 s apart: two quick runs each loaded the autopilot config and saved it
//      back, so one run's history erased the other's;
//   3. the pool was the site's generic KEEP list (cable trays, an egg mould), never the radar's
//      findings of the day, and never a dupe of a look people want;
//   4. one product under two item ids (the USB cable tray: same title, same photo file) counted twice.
//
// The cure, end to end (pure here; the server parts are in api/autopilot.mjs and the radar run):
//   candidates from the LATEST radar board only (its HOT listings per kind with several sellers
//   compared, the site products it measured HOT, its own new-product discoveries) → gates with a named
//   reason for every rejection → one identity per product (item id, photo file, normalised title) →
//   two scores, each with its confidence (Trend Heat, Smart Buy) and an opportunity score → per channel:
//   a different trend every post, never a product again within 14 days unless its evidence materially
//   changed (the reason is stated), 90 minutes between posts, nothing when nothing clears the bar.
//
// Truth rules: every number comes from the board (the store's own 30-day order counts, its ILS price,
// its satisfaction as a ≥95% bucket); a missing measurement scores 0 and lowers confidence, never
// counts as positive; review counts, seller history and shipping cost are not in the affiliate API and
// are labelled unavailable, never guessed. No "before everyone" claim, no promise of a hit.
import { pickMatches } from "./trendRadar.js";
import { hasBrandName, isNotListedKind } from "./deals.js";

export const ENGINE = Object.freeze({
  version: "engine-1.0",
  hot: Object.freeze({ minWeekPct: 10, minOrders: 300 }), // product-rules.md item 6 (radarOpportunity HOT)
  fresh: Object.freeze({ minOrders: 100 }), // a radar discovery still small, with real demand already
  maxAgeDays: 3, // a measurement older than this is stale and never posted
  priceMaxAgeHours: 72, // a price older than this is not "verified" (the line is left out)
  bar: Object.freeze({ heat: 35, buy: 55, confidence: 0.55, opportunity: 50 }),
  repeatDays: 14, // a product never returns within this, unless its evidence materially changed
  trendHours: 48, // a trend posted within this is skipped: every post a different trend
  minGapMinutes: 90, // never two posts closer than this
  claimMinutes: 15, // an unfinished claim blocks other runs this long
  returnWhen: Object.freeze({ weekPctUp: 20, priceDownPct: 10 }),
  poolMax: 60,
  perTrend: 3, // listings kept per kind in the radar's pool (several sellers compared)
  historyMax: 300,
});

// The weights of the two scores (documented in docs/research/channel-engine.md and on the preview).
export const HEAT_WEIGHTS = Object.freeze({ acceleration: 40, demand: 15, freshness: 10, spread: 15, saturation: 20 });
export const BUY_WEIGHTS = Object.freeze({ price: 25, satisfaction: 25, match: 20, value: 10, link: 10, photo: 10 });

const DAY = 86_400_000;
const ITEM = /^\d{6,20}$/;
const BUY = /^https:\/\/s\.click\.aliexpress\.com\/[A-Za-z0-9_\-/.?=&%]+$/;
const IMG = /^https:\/\/[a-z0-9.-]*(aliexpress-media\.com|alicdn\.com)\//i;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const round = (x, d = 0) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const ageDays = (d, now) => (d ? Math.max(0, (now - Date.parse(`${d}T12:00:00Z`)) / DAY) : Infinity);
const dm = (d) => (d ? `${Number(String(d).slice(8, 10))}.${Number(String(d).slice(5, 7))}` : "");
const n0 = (x) => Math.round(x).toLocaleString("en-US");
const isHebrew = (s) => /[֐-׿]/.test(String(s || ""));

/** The item id of a site product or a board row. */
export function itemIdOf(x = {}) {
  const raw = String(x.itemId || x.aliexpressId || x.imageSource?.itemId || "");
  if (ITEM.test(raw)) return raw;
  const m = String(x.id || "").match(/^(?:ae-)?(\d{6,20})$/);
  return m ? m[1] : "";
}

/** The photo's file name on the store CDN (the same file under two listings is the same product). */
export function imageKey(src = "") {
  const m = String(src || "").match(/\/kf\/([A-Za-z0-9_-]{16,80})\.(?:jpe?g|png|webp|avif)/i);
  return m ? m[1].toLowerCase() : "";
}

/** A title reduced to letters and digits (for "the same listing under another id"). */
export function titleKey(t = "") {
  const k = String(t || "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase().slice(0, 80);
  return k.length >= 12 ? k : "";
}

/** Every identity key of a candidate: one shared key means one product. */
export function identityKeys(c = {}) {
  const keys = [];
  if (c.itemId) keys.push(`item:${c.itemId}`);
  const img = imageKey(c.image);
  if (img) keys.push(`img:${img}`);
  const t = titleKey(c.storeTitle || c.title);
  if (t) keys.push(`title:${t}`);
  return keys;
}

const STOP = new Set(["עם", "של", "לנשים", "לגברים", "לילדים", "חדש", "חדשה", "for", "with", "women", "men", "new"]);
/** How many of the look's own words the title names (the radar's matcher, word by word). */
export function lookWords(title = "", concept = {}) {
  const words = [...new Set(String(concept.he || "").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)))];
  return words.filter((w) => pickMatches(title, { he: w }) === true).length;
}

/** The radar's concept for a title: the matching kind with the strongest stage (null when none). */
export function conceptFor(title = "", concepts = [], { pickedId = "" } = {}) {
  const order = { EMERGING: 0, RISING: 1, STEADY: 2, PEAK: 3, UNVERIFIED: 4, COOLING: 5 };
  let best = null;
  for (const c0 of Array.isArray(concepts) ? concepts : []) {
    // On the board a kind's Hebrew searches are in `match` (in the watch list, `hq`).
    const c = { ...c0, hq: Array.isArray(c0?.hq) ? c0.hq : Array.isArray(c0?.match) ? c0.match : [] };
    const picked = pickedId && String(c?.pick?.itemId || "") === pickedId;
    const words = isHebrew(c?.he) ? lookWords(title, c) : 0;
    const match = picked ? "pick" : words >= 2 ? "title" : words === 1 && pickMatches(title, c) === true ? "word" : null;
    if (!match) continue;
    const score = (picked ? 0 : 10) + (match === "title" ? 0 : 5) + (order[c.stage] ?? 6);
    if (!best || score < best.score) best = { concept: c0, match, words, score };
  }
  return best;
}

// What-IS wording for the Israel gap (israelGap.js states), for public copy.
const ISRAEL_HE = Object.freeze({ GAP: "עוד שקט בחיפושים בעברית", QUIET: "שקט בחיפושים", ARRIVING: "מתחילים לחפש בארץ", ARRIVED: "כבר מחפשים בארץ" });
const SATURATION = Object.freeze({ GAP: 1, QUIET: 1, ARRIVING: 0.6, ARRIVED: 0.2 });
const SPREAD = Object.freeze({ NONE: 0.3, EARLY: 0.6, SPREADING: 0.85, WIDE: 1, VIRAL_NOW: 1 });

function israelOf(concept, boardAt) {
  const g = concept?.gap;
  if (!g || !Object.hasOwn(ISRAEL_HE, g.state)) return null;
  return { state: g.state, he: ISRAEL_HE[g.state], confidence: g.confidence || null, at: concept.measured || (boardAt || "").slice(0, 10) || null };
}

function worldOf(concept) {
  const w = concept?.world;
  if (!w || !Object.hasOwn(SPREAD, w.state)) return null;
  return { state: w.state, he: String(w.he || ""), searched: num(w.searched), of: num(w.of) };
}

/**
 * The radar's pool for one kind, from one product.query answer (the radar run keeps it for every kind
 * it reads): every listing that passes the site's rules (findResults: ≥95% satisfaction, ≥300 orders,
 * no brand, her own link) and names the kind in its store title, with its 30-day orders and the
 * satisfaction as a bucket only (the number itself is never kept).
 */
export function kindListings(result = {}, passing = [], concept = {}) {
  const raw = result?.products?.product;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const byId = new Map(list.map((x) => [String(x?.product_id || ""), x]));
  const out = [];
  for (const it of Array.isArray(passing) ? passing : []) {
    const x = byId.get(String(it.id)) || {};
    const title = it.storeTitle || it.title;
    if (isHebrew(concept.he) && pickMatches(title, concept) === false) continue;
    const pos = parseFloat(String(x.evaluate_rate ?? "").replace("%", ""));
    const video = /^https:\/\//.test(String(x.product_video_url || ""));
    out.push({
      id: String(it.id), title: String(it.title || "").slice(0, 120), storeTitle: String(title || "").slice(0, 200), image: it.image, price: num(it.price), buy: it.buy,
      sat: Number.isFinite(pos) ? (pos >= 97 ? "97+" : pos >= 95 ? "95+" : "low") : null,
      video, words: isHebrew(concept.he) ? lookWords(title, concept) : null,
    });
  }
  return out;
}

/**
 * board.pool: the radar's HOT listings across every kind it read today (all categories), several
 * sellers compared per kind. A listing joins only with its own measured momentum (itemMomentum over
 * items.json: HOT = ≥ +10% a week and ≥ 300 orders); per kind the best `perTrend` by growth, with how
 * many sellers were compared and the cheapest verified price among the HOT ones.
 */
export function radarPool(listingsByKind = {}, momentumOf = () => null, concepts = [], { now = Date.now(), rules = ENGINE } = {}) {
  const byId = new Map((Array.isArray(concepts) ? concepts : []).map((c) => [c.id, c]));
  const rows = [];
  for (const [kind, listings] of Object.entries(listingsByKind || {})) {
    const c = byId.get(kind);
    if (!c || !Array.isArray(listings) || !listings.length) continue;
    const hot = [];
    for (const l of listings) {
      const m = momentumOf(l.id);
      if (!m || m.state !== "HOT" || !(m.weekPct >= rules.hot.minWeekPct) || !(m.orders >= rules.hot.minOrders)) continue;
      hot.push({ ...l, orders: m.orders, ordersBefore: m.ordersBefore, from: m.from, to: m.to, weekPct: m.weekPct });
    }
    if (!hot.length) continue;
    const prices = hot.map((h) => h.price).filter((p) => p > 0);
    const cheapest = prices.length ? Math.min(...prices) : null;
    hot.sort((a, b) => b.weekPct - a.weekPct);
    for (const h of hot.slice(0, rules.perTrend)) rows.push({ ...h, kind, compared: listings.length, hotSellers: hot.length, cheapest, at: dayOf(now) });
  }
  rows.sort((a, b) => b.weekPct - a.weekPct);
  return { at: new Date(now).toISOString(), kinds: Object.keys(listingsByKind || {}).length, list: rows.slice(0, rules.poolMax) };
}

const SOURCE_HE = Object.freeze({ radar_listing: "ממצאי הרדאר: פריט חם בסוג שהרדאר מודד", site_hot: "ממצאי הרדאר: מוצר מהחנות שנמדד חם", fresh_riser: "ממצאי הרדאר: מוצר חדש שמתחיל לרוץ" });

/**
 * Every candidate from the latest board (and the site's own records for the site rows), with the
 * evidence it carries. Nothing else enters: a static list, an old cache or the site catalog alone
 * never makes a candidate.
 */
export function candidatesFrom(board = null, products = [], { now = Date.now(), siteOrigin = "" } = {}) {
  if (!board || !Array.isArray(board.concepts)) return [];
  const concepts = board.concepts;
  const byConcept = new Map(concepts.map((c) => [c.id, c]));
  const boardAt = String(board.at || "");
  const prodBy = new Map((Array.isArray(products) ? products : []).map((p) => [String(p.id), p]));
  const out = [];
  const evidenceOf = (r, source) => ({
    measure: "orders_30d_store", measureHe: "הזמנות ב־30 יום, כפי שהחנות מדווחת", before: num(r.ordersBefore), after: num(r.orders), from: r.from || null, to: r.to || null,
    weekPct: num(r.weekPct), source, sourceHe: "AliExpress Affiliate API (הנתונים של החנות)", market: "AliExpress, משלוח לישראל", retrievedAt: boardAt || null,
  });
  // 1. The radar's HOT listings per kind (several sellers compared).
  for (const r of Array.isArray(board.pool?.list) ? board.pool.list : []) {
    const c = byConcept.get(r.kind);
    if (!c) continue;
    const isLook = c.kind === "style";
    out.push({
      source: "radar_listing", itemId: String(r.id), productId: null, title: r.title, storeTitle: r.storeTitle, image: r.image, link: r.buy, linkKind: "store",
      trend: { key: `c:${c.id}`, he: c.he, conceptId: c.id, stage: c.stage, kind: c.kind },
      match: { label: isLook ? "DUPE" : "DIRECT", by: r.words >= 2 ? "title" : "kind_search", look: isLook ? c.he : null, words: num(r.words), visual: r.visual || null },
      evidence: evidenceOf(r, "radar_listing"),
      price: r.price > 0 ? { value: r.price, currency: "ILS", checkedAt: r.at || boardAt.slice(0, 10), source: "aliexpress_api" } : null,
      quality: { sat: r.sat || null, reviews: null, seller: null, shipping: null, video: r.video === true },
      sellers: { compared: num(r.compared), hot: num(r.hotSellers), cheapest: num(r.cheapest) },
      israel: israelOf(c, boardAt), world: worldOf(c),
    });
  }
  // 2. Site products the radar measured HOT today (the site record gives the photo, link and price).
  for (const r of Array.isArray(board.site?.hot) ? board.site.hot : []) {
    const p = prodBy.get(String(r.id));
    const found = p ? conceptFor(p.title || r.title, concepts, { pickedId: itemIdOf(p) }) : null;
    const c = found?.concept || null;
    const isLook = c?.kind === "style" && (found.match === "pick" || found.match === "title");
    const priceAt = p?.priceCheckedAt ? Date.parse(p.priceCheckedAt) : NaN;
    out.push({
      source: "site_hot", itemId: itemIdOf(p || r), productId: String(r.id), title: p?.title || r.title, storeTitle: p?.storeTitle || p?.title || r.title, image: p?.image || null,
      link: p ? `${siteOrigin}/p/${encodeURIComponent(String(p.id))}` : null, linkKind: "site", siteStatus: p?.status || "missing", affiliateUrl: p?.affiliateUrl || null,
      trend: c ? { key: `c:${c.id}`, he: c.he, conceptId: c.id, stage: c.stage, kind: c.kind } : { key: `w:${headWords(p?.title || r.title)}`, he: headWords(p?.title || r.title).replace(/_/g, " "), conceptId: null, stage: null, kind: p?.kind || null },
      match: { label: isLook ? "DUPE" : "DIRECT", by: found?.match || "none", look: isLook ? c.he : null, words: found?.words ?? null, visual: null },
      evidence: evidenceOf(r, "site_hot"),
      price: p?.priceSource === "aliexpress_api" && num(p.price) > 0 ? { value: p.price, currency: "ILS", checkedAt: Number.isFinite(priceAt) ? new Date(priceAt).toISOString() : null, source: "aliexpress_api" } : null,
      // The site row passed the radar's quality checks only when it is still on sale (a radar archive
      // names the failed check: on 19.11 the +49% fur slippers failed "95% satisfaction").
      quality: { sat: p?.status === "approved" ? "95+" : p ? "low" : null, reviews: null, seller: null, shipping: null, video: Boolean(p?.sellerVideo || p?.videoUrl) },
      sellers: null,
      israel: c ? israelOf(c, boardAt) : null, world: c ? worldOf(c) : null,
    });
  }
  // 3. The radar's own discoveries: new products starting to run.
  for (const r of Array.isArray(board.fresh?.risers) ? board.fresh.risers : []) {
    const phrase = String(r.known?.phrase || "").toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
    out.push({
      source: "fresh_riser", itemId: String(r.id), productId: null, title: r.title, storeTitle: r.title, image: r.image, link: r.buy, linkKind: "store",
      trend: { key: `f:${phrase || r.id}`, he: null, conceptId: null, stage: "NEW", kind: r.category || null },
      match: { label: "DIRECT", by: "discovery", look: null, words: null, visual: null },
      evidence: evidenceOf(r, "fresh_riser"),
      price: num(r.price) > 0 ? { value: r.price, currency: "ILS", checkedAt: r.to || boardAt.slice(0, 10), source: "aliexpress_api" } : null,
      quality: { sat: null, reviews: null, seller: null, shipping: null, video: false },
      sellers: { compared: null, hot: null, cheapest: null, similar: num(r.known?.similar) },
      israel: null, world: null, discovery: { similar: num(r.known?.similar), youtube: r.known?.yt ?? null, called: r.called || null, due: r.due || null },
    });
  }
  return out.map((c) => ({ ...c, keys: identityKeys(c), sourceHe: SOURCE_HE[c.source] }));
}

/** The first two words of a title that carry meaning (a trend key when the radar has no kind for it). */
export function headWords(t = "") {
  const w = String(t || "").replace(/[^\p{L}\p{N} ]+/gu, " ").split(/\s+/).filter((x) => x.length >= 3 && !STOP.has(x) && !/^\d+$/.test(x));
  return w.slice(0, 2).join("_").toLowerCase() || "x";
}

/** Gates, each with a named reason. Returns null when the candidate may be scored. */
export function rejectionOf(c = {}, { now = Date.now(), rules = ENGINE } = {}) {
  if (!c.image || !IMG.test(String(c.image))) return "no_store_photo";
  if (c.linkKind === "store" ? !BUY.test(String(c.link || "")) : !c.link || !BUY.test(String(c.affiliateUrl || ""))) return "no_own_affiliate_link";
  if (c.linkKind === "site" && c.siteStatus !== "approved") return c.siteStatus === "archived" ? "archived_by_radar_quality_check" : "not_on_sale_on_site";
  if (hasBrandName(c.storeTitle || c.title) || hasBrandName(c.title)) return "brand_name";
  if (isNotListedKind(c.storeTitle || c.title)) return "unlisted_kind";
  const e = c.evidence || {};
  if (ageDays(e.to, now) > rules.maxAgeDays) return "stale_measurement";
  if (!(e.weekPct >= rules.hot.minWeekPct)) return "not_rising";
  const min = c.source === "fresh_riser" ? rules.fresh.minOrders : rules.hot.minOrders;
  if (!(e.after >= min)) return "too_few_orders";
  if (c.quality?.sat === "low") return "low_satisfaction";
  if (c.match?.visual === "MISMATCH") return "photo_shows_another_kind";
  return null;
}

/** 🔥 Trend Heat (0–100): how hot it is right now, from measurements only. */
export function trendHeat(c = {}, { now = Date.now() } = {}) {
  const W = HEAT_WEIGHTS;
  const e = c.evidence || {};
  const parts = {};
  let measured = 0;
  const add = (k, f) => { if (f === null) { parts[k] = null; return; } parts[k] = round(f, 2); measured += W[k]; };
  add("acceleration", e.weekPct >= 0 ? clamp(Math.log1p(e.weekPct / 100) / Math.log(2)) : null);
  add("demand", e.after > 0 ? clamp(Math.log10(e.after) / 4) : null);
  const age = ageDays(e.to, now);
  add("freshness", Number.isFinite(age) ? clamp(1 - age / 5) : null);
  add("spread", c.world ? SPREAD[c.world.state] ?? null : null);
  // Saturation: the Israel gap of the kind, or for a discovery its similar listings (under the radar's 2,000 line).
  const sim = c.discovery?.similar ?? c.sellers?.similar;
  add("saturation", c.israel ? SATURATION[c.israel.state] ?? null : Number.isFinite(sim) ? clamp(1 - sim / 2000) : null);
  const score = Object.entries(parts).reduce((s, [k, f]) => s + (f ?? 0) * W[k], 0);
  return { score: Math.round(score), confidence: round(measured / 100, 2), parts };
}

/** 🛒 Smart Buy (0–100): how good a buy this listing is, from what the store really says. */
export function smartBuy(c = {}, { now = Date.now(), rules = ENGINE } = {}) {
  const W = BUY_WEIGHTS;
  const parts = {};
  let measured = 0;
  const add = (k, f) => { if (f === null) { parts[k] = null; return; } parts[k] = round(f, 2); measured += W[k]; };
  const pAt = c.price?.checkedAt ? Date.parse(c.price.checkedAt.length === 10 ? `${c.price.checkedAt}T12:00:00Z` : c.price.checkedAt) : NaN;
  add("price", c.price?.value > 0 && Number.isFinite(pAt) ? ((now - pAt) / 3_600_000 <= rules.priceMaxAgeHours ? 1 : 0.4) : null);
  add("satisfaction", c.quality?.sat === "97+" ? 1 : c.quality?.sat === "95+" ? 0.8 : null);
  // The item is the trend itself (1), a dupe whose title names the look (0.7), the radar's own pick of
  // the look (0.8); a visual check of the photo adds certainty when it ran.
  const m = c.match || {};
  const base = m.label === "DIRECT" ? (m.by === "discovery" || c.source !== "radar_listing" ? 0.9 : 1) : m.by === "pick" ? 0.8 : m.by === "title" ? 0.7 : 0.5;
  add("match", m.visual === "MATCH" ? clamp(base + 0.2) : base);
  const s = c.sellers;
  add("value", s?.compared >= 2 && s.cheapest > 0 && c.price?.value > 0 ? (c.price.value <= s.cheapest * 1.05 ? 1 : c.price.value <= s.cheapest * 1.5 ? 0.6 : 0.3) : null);
  add("link", 1); // the gates already required her own affiliate link
  add("photo", 1); // and a store photo
  const score = Object.entries(parts).reduce((sum, [k, f]) => sum + (f ?? 0) * W[k], 0);
  return { score: Math.round(score), confidence: round(measured / 100, 2), parts };
}

/** Gates, scores, one identity per product (before the bar, so a duplicate is always named), then the bar. */
export function rankCandidates(cands = [], { now = Date.now(), rules = ENGINE } = {}) {
  const scored = [];
  const rejected = [];
  for (const c of Array.isArray(cands) ? cands : []) {
    const why = rejectionOf(c, { now, rules });
    if (why) { rejected.push({ ...brief(c), reason: why }); continue; }
    const heat = trendHeat(c, { now });
    const buy = smartBuy(c, { now, rules });
    scored.push({ ...c, heat, buy, confidence: round((heat.confidence + buy.confidence) / 2, 2), opportunity: Math.round(0.5 * heat.score + 0.5 * buy.score) });
  }
  // One product, one row: a shared item id, photo file or title merges listings (the strongest stays).
  scored.sort((a, b) => b.opportunity - a.opportunity || (b.evidence.weekPct || 0) - (a.evidence.weekPct || 0));
  const owner = new Map();
  const unique = [];
  for (const c of scored) {
    const hit = c.keys.map((k) => owner.get(k)).find((x) => x);
    if (hit) { hit.alsoListedAs.push({ itemId: c.itemId, productId: c.productId, source: c.source }); rejected.push({ ...brief(c), reason: "same_product_as", sameAs: hit.itemId || hit.productId }); continue; }
    const row = { ...c, alsoListedAs: [] };
    for (const k of c.keys) owner.set(k, row);
    unique.push(row);
  }
  // The quality bar: a weak product is never posted just to keep the channel busy.
  const bar = rules.bar;
  const out = [];
  for (const c of unique) {
    const weak = c.heat.score < bar.heat ? "trend_heat_below_bar" : c.buy.score < bar.buy ? "smart_buy_below_bar" : c.confidence < bar.confidence ? "confidence_below_bar" : c.opportunity < bar.opportunity ? "opportunity_below_bar" : null;
    if (weak) { rejected.push({ ...brief(c), reason: weak, heat: c.heat.score, buy: c.buy.score, confidence: c.confidence }); continue; }
    out.push(c);
  }
  return { ranked: out.map((c, i) => ({ ...c, rank: i + 1, of: out.length })), rejected };
}

const brief = (c) => ({ source: c.source, itemId: c.itemId || null, productId: c.productId || null, title: String(c.title || "").slice(0, 80), trend: c.trend?.key || null, weekPct: c.evidence?.weekPct ?? null });

/** What a history entry remembers of the evidence it was sent with. */
const snapOf = (c) => ({ weekPct: c.evidence?.weekPct ?? null, orders: c.evidence?.after ?? null, price: c.price?.value ?? null, to: c.evidence?.to || null });

/** Materially new evidence since the last send (the reason is stated), or null. */
export function newEvidence(prev = {}, c = {}, { rules = ENGINE } = {}) {
  const s = snapOf(c);
  if (Number.isFinite(prev.weekPct) && Number.isFinite(s.weekPct) && s.weekPct >= prev.weekPct + rules.returnWhen.weekPctUp) {
    return { code: "faster", he: `הקצב עלה מ־${prev.weekPct}% ל־${s.weekPct}% בשבוע מאז הפרסום הקודם` };
  }
  if (Number.isFinite(prev.price) && Number.isFinite(s.price) && s.price <= prev.price * (1 - rules.returnWhen.priceDownPct / 100)) {
    return { code: "cheaper", he: `המחיר בחנות ירד מ־₪${prev.price} ל־₪${s.price} מאז הפרסום הקודם` };
  }
  return null;
}

const entryAt = (e) => Date.parse(e?.at || "") || 0;

/**
 * The channel's next post: the strongest ranked candidate that is a different trend from the recent
 * posts and was never sent within repeatDays (unless materially new evidence, stated); nothing when the
 * last post is younger than minGapMinutes or nothing qualifies. Pure: history is read, never written.
 */
export function selectNext(ranked = [], history = [], { channel = "telegram", now = Date.now(), rules = ENGINE } = {}) {
  const mine = (Array.isArray(history) ? history : []).filter((e) => e && e.channel === channel);
  const live = mine.filter((e) => e.state === "SENT" || (e.state === "CLAIMED" && now - entryAt(e) < rules.claimMinutes * 60_000));
  const last = live.reduce((m, e) => Math.max(m, entryAt(e)), 0);
  if (last && now - last < rules.minGapMinutes * 60_000) return { pick: null, reason: "too_soon", lastAt: new Date(last).toISOString(), skipped: [] };
  const sent = live.filter((e) => now - entryAt(e) < rules.repeatDays * DAY);
  const lastEntry = live.slice().sort((a, b) => entryAt(b) - entryAt(a))[0];
  const recentTrends = new Set(live.filter((e) => now - entryAt(e) < rules.trendHours * 3_600_000).map((e) => e.trend));
  if (lastEntry?.trend) recentTrends.add(lastEntry.trend);
  const skipped = [];
  for (const c of Array.isArray(ranked) ? ranked : []) {
    const prev = sent.filter((e) => (e.keys || []).some((k) => c.keys.includes(k))).sort((a, b) => entryAt(b) - entryAt(a))[0];
    let back = null;
    if (prev) {
      back = newEvidence(prev.snap || {}, c, { rules });
      if (!back) { skipped.push({ ...brief(c), reason: "sent_within_14_days", sentAt: prev.at }); continue; }
    }
    if (recentTrends.has(c.trend.key)) { skipped.push({ ...brief(c), reason: "same_trend_posted_recently" }); continue; }
    return { pick: { ...c, returnReason: back }, reason: null, lastAt: last ? new Date(last).toISOString() : null, skipped };
  }
  return { pick: null, reason: ranked.length ? "every_strong_candidate_was_posted_or_its_trend_is_recent" : "nothing_clears_the_bar_today", lastAt: last ? new Date(last).toISOString() : null, skipped };
}

/** The history entry a run writes BEFORE it sends (the claim), then marks SENT or FAILED. */
export function claimOf(pick = {}, { channel = "telegram", now = Date.now(), runId = "" } = {}) {
  return {
    id: `${channel}_${now.toString(36)}_${String(runId || Math.random().toString(36).slice(2, 8)).slice(0, 12)}`,
    channel, state: "CLAIMED", at: new Date(now).toISOString(), keys: pick.keys || [], trend: pick.trend?.key || null,
    itemId: pick.itemId || null, productId: pick.productId || null, title: String(pick.title || "").slice(0, 80), source: pick.source || null,
    snap: snapOf(pick), heat: pick.heat?.score ?? null, buy: pick.buy?.score ?? null, opportunity: pick.opportunity ?? null,
    returnReason: pick.returnReason?.code || null, engine: ENGINE.version,
  };
}

/**
 * The history with this claim added, or null when another run holds the slot (a fresh claim or a send
 * inside the gap): the server writes it with a compare-and-swap, so two runs can never both send.
 */
export function withClaim(history = [], claim = {}, { now = Date.now(), rules = ENGINE } = {}) {
  const list = Array.isArray(history) ? history : [];
  const busy = list.some((e) => e && e.channel === claim.channel && e.id !== claim.id
    && (e.state === "SENT" || (e.state === "CLAIMED" && now - entryAt(e) < rules.claimMinutes * 60_000))
    && now - entryAt(e) < rules.minGapMinutes * 60_000);
  if (busy) return null;
  return [claim, ...list.filter((e) => e && e.id !== claim.id)].slice(0, rules.historyMax);
}

/** The claim marked SENT (with the provider's id) or FAILED (the slot is free again). */
export function settleClaim(history = [], claimId = "", { providerId = null, error = null, now = Date.now() } = {}) {
  return (Array.isArray(history) ? history : []).map((e) => (e?.id === claimId ? { ...e, state: providerId ? "SENT" : "FAILED", providerId: providerId ? String(providerId) : null, error: error ? String(error).slice(0, 120) : null, settledAt: new Date(now).toISOString() } : e));
}

const fmtTime = (iso) => {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 2 * 3_600_000); // Israel time (winter, UTC+2)
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** The Hebrew name shown: the store's Hebrew title, or the verified Hebrew title from the send-time check. */
export function hebrewName(c = {}) {
  for (const t of [c.verified?.title, c.title, c.storeTitle]) if (isHebrew(t)) return String(t).replace(/\s+/g, " ").trim().slice(0, 90);
  return null;
}

/** The Telegram post: photo + Hebrew text with the dated evidence, both scores and the reason it won. */
export function telegramPost(pick = {}, { link = pick.link } = {}) {
  const e = pick.evidence || {};
  const name = hebrewName(pick);
  const price = pick.verified?.price ?? pick.price?.value ?? null;
  const priceAt = pick.verified?.checkedAt || pick.price?.checkedAt || null;
  const lines = ["#פרסומת · קישור שותפים"];
  lines.push(pick.trend?.he ? `🔥 טרנד עכשיו: ${pick.trend.he}` : "🔥 טרנד עכשיו: מוצר חדש שהרדאר מצא");
  if (name) lines.push(`🛍️ ${name}`);
  lines.push(`📈 למה עכשיו: ההזמנות של הפריט עלו ${round(e.weekPct, 0)}% בשבוע`);
  if (Number.isFinite(e.before) && Number.isFinite(e.after)) lines.push(`🧾 ${e.measureHe}: ${n0(e.before)} ב־${dm(e.from)} ← ${n0(e.after)} ב־${dm(e.to)}`);
  if (pick.match?.label === "DUPE" && pick.match.look) lines.push(`🔁 דיופ ללוק: ${pick.match.look}${pick.match.visual === "MATCH" ? " (שם המוצר והתמונה נבדקו)" : " (לפי שם המוצר בחנות)"}`);
  else lines.push("🎯 המוצר עצמו בעלייה");
  if (price > 0) lines.push(`💰 מ־₪${price} באליאקספרס${priceAt ? ` · נבדק ${fmtTime(priceAt.length === 10 ? `${priceAt}T10:00:00Z` : priceAt)}` : ""}`);
  const sat = pick.verified?.sat || pick.quality?.sat;
  if (sat === "97+" || sat === "95+") lines.push(`✅ שביעות רצון של ${sat === "97+" ? "97%" : "95%"} ומעלה, לפי החנות`);
  if (pick.israel) lines.push(`🇮🇱 בישראל: ${pick.israel.he} (${dm(pick.israel.at)})`);
  lines.push(`🌍 ${e.market || "AliExpress, משלוח לישראל"} · נמדד ${fmtTime(e.retrievedAt)}`);
  lines.push(`📊 מדד טרנד ${pick.heat?.score ?? "?"}/100 · מדד קנייה חכמה ${pick.buy?.score ?? "?"}/100`);
  if (pick.of > 1) lines.push(`🏆 נבחר מתוך ${pick.of} מועמדים חזקים היום`);
  if (pick.returnReason?.he) lines.push(`🔄 חוזר כי ${pick.returnReason.he}`);
  if (link) lines.push(`👉 ${link}`);
  return { text: lines.join("\n"), image: pick.verified?.image || pick.image, link };
}

/**
 * Instagram from the same pick (PREPARED only: nothing is published here; a post is PUBLISHED only
 * with Instagram's own media id). Caption, story and carousel plan, all from the same evidence.
 */
export function instagramPackage(pick = {}, { link = pick.link } = {}) {
  const e = pick.evidence || {};
  const name = hebrewName(pick) || "המוצר שהרדאר מצא";
  const look = pick.match?.label === "DUPE" ? pick.match.look : null;
  const hook = look ? `הלוק שכולם רוצים: ${look}` : pick.trend?.he ? `${pick.trend.he}: עולה עכשיו` : "מוצר חדש שמתחיל לרוץ";
  const why = `ההזמנות עלו ${round(e.weekPct, 0)}% בשבוע (הנתונים של החנות, ${dm(e.from)} ← ${dm(e.to)})`;
  const price = pick.verified?.price ?? pick.price?.value ?? null;
  const caption = [
    "#פרסומת · קישור שותפים", hook, name, `📈 ${why}`, price > 0 ? `💰 מ־₪${price} באליאקספרס` : null,
    "💬 כתבו ״אני״ בתגובות ונשלח לכם את הקישור בפרטי", "#טרנד #דילים #אליאקספרס #קניות",
  ].filter(Boolean).join("\n");
  return {
    state: "PREPARED",
    caption,
    story: { frames: [{ image: pick.verified?.image || pick.image, text: hook }, { text: why }, { text: price > 0 ? `מ־₪${price}` : name, link }], sticker: link },
    carousel: [
      { image: pick.verified?.image || pick.image, text: hook },
      { text: why },
      look ? { text: `דיופ ללוק: ${look}` } : { text: "המוצר עצמו בעלייה" },
      { text: "כתבו ״אני״ בתגובות" },
    ],
    reel: { state: pick.quality?.video ? "SELLER_VIDEO_AVAILABLE" : "NEEDS_VIDEO", note: "a reel only from the seller's own video (labelled) or her own footage" },
    tracking: { utm: `utm_source=instagram&utm_medium=engine&utm_campaign=${encodeURIComponent(pick.itemId || pick.productId || "x")}` },
  };
}

/**
 * The full plan for one moment: candidates → ranking → each channel's pick (Telegram and Instagram
 * from the same ranking), with every rejection and skip named. Used by the server and the preview.
 */
export function planChannels(board = null, products = [], histories = {}, { now = Date.now(), siteOrigin = "", rules = ENGINE } = {}) {
  const cands = candidatesFrom(board, products, { now, siteOrigin });
  const { ranked, rejected } = rankCandidates(cands, { now, rules });
  const tg = selectNext(ranked, histories.telegram || [], { channel: "telegram", now, rules });
  const ig = selectNext(ranked, histories.instagram || [], { channel: "instagram", now, rules });
  return {
    engine: rules.version, at: new Date(now).toISOString(), boardAt: board?.at || null,
    counts: { candidates: cands.length, ranked: ranked.length, rejected: rejected.length, bySource: countBy(cands, (c) => c.source) },
    ranked, rejected,
    telegram: { ...tg, post: tg.pick ? telegramPost(tg.pick) : null },
    instagram: { ...ig, pkg: ig.pick ? instagramPackage(ig.pick) : null },
  };
}

const countBy = (list, f) => list.reduce((m, x) => ({ ...m, [f(x)]: (m[f(x)] || 0) + 1 }), {});
