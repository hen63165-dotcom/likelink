// Opportunity engine — the whole catalog, ranked from evidence.
//
// Every product gets a persistent fingerprint (its own fields, so a changed
// product is re-scored and an unchanged one is not re-processed), a trend
// lifecycle computed from LikeLink's OWN recorded events, and twelve scores.
// Each score carries its basis and a confidence; a dimension without data is
// scored 0 with confidence "none" — never guessed. Batches let the same code
// rank 10 or 10,000 products.
//
//   HOT_NOW   ≥ 10 events in 24h and more than the previous 24h
//   RISING    7-day events ≥ 5 and ≥ 1.5× the 7 days before
//   STABLE    7-day events ≥ 5, within 0.67–1.5× the 7 days before
//   COOLING   7-day events < 0.67× the 7 days before (which had ≥ 5)
//   EXPIRED   events earlier, none in the last 14 days
//   UNVERIFIED too few events to say anything
// Pure, isomorphic, no I/O.
import { stableId, TRUTH } from "./likeloop.js";

const DAY = 86_400_000;
const arr = (v) => (Array.isArray(v) ? v : []);
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export const TREND_STATE = Object.freeze(["HOT_NOW", "RISING", "STABLE", "COOLING", "EXPIRED", "UNVERIFIED"]);

/** A product's fingerprint: changes only when a field that affects promotion changes. */
export function productFingerprint(p) {
  return stableId("fp", [p?.id, p?.title, p?.price, p?.image, p?.affiliateUrl, p?.category, p?.status, p?.marketerId, p?.videoUrl]);
}

/** Recorded events for one product, by window. Only LikeLink's own ledger. */
export function eventWindows(productId, events = [], now = Date.now()) {
  const w = { h24: 0, prevH24: 0, d7: 0, prevD7: 0, d14: 0, total: 0, outbound: 0, views: 0, withCreative: 0, lastAt: 0 };
  for (const e of arr(events)) {
    if (e?.productId !== productId) continue;
    const t = Number(e.ts) || 0;
    const age = now - t;
    w.total += 1;
    if (e.type === "view") w.views += 1; else w.outbound += 1;
    if (e.cid) w.withCreative += 1;
    if (t > w.lastAt) w.lastAt = t;
    if (age < DAY) w.h24 += 1; else if (age < 2 * DAY) w.prevH24 += 1;
    if (age < 7 * DAY) w.d7 += 1; else if (age < 14 * DAY) w.prevD7 += 1;
    if (age < 14 * DAY) w.d14 += 1;
  }
  return w;
}

/** Trend lifecycle from the product's own events — with its evidence. */
export function trendLifecycle(w, { radar = null, now = Date.now() } = {}) {
  let state = "UNVERIFIED";
  if (w.h24 >= 10 && w.h24 > w.prevH24) state = "HOT_NOW";
  else if (w.d7 >= 5 && w.d7 >= 1.5 * Math.max(1, w.prevD7)) state = "RISING";
  else if (w.d7 >= 5 && w.prevD7 >= 1 && w.d7 >= 0.67 * w.prevD7) state = "STABLE";
  else if (w.prevD7 >= 5 && w.d7 < 0.67 * w.prevD7) state = "COOLING";
  else if (w.total > 0 && w.d14 === 0) state = "EXPIRED";
  const n = w.d7 + w.prevD7;
  return {
    state,
    source: "likelink_events (marketplace:clicks)",
    observedAt: new Date(now).toISOString(),
    confidence: n >= 50 ? "high" : n >= 15 ? "medium" : n >= 5 ? "low" : "none",
    evidence: { last24h: w.h24, prev24h: w.prevH24, last7d: w.d7, prev7d: w.prevD7, total: w.total },
    external: radar ? { term: radar.term, source: radar.source, observedAt: radar.observedAt, confidence: radar.confidence } : null,
  };
}

const WEIGHTS = { demand: 0.14, trend: 0.1, content: 0.1, creatorFit: 0.06, commercial: 0.1, click: 0.1, conversion: 0.08, freshness: 0.06, media: 0.1, platform: 0.06, trust: 0.06, confidence: 0.04 };

/**
 * Twelve scores for one product, each { score 0–100, basis, confidence }.
 * Opportunity = weighted sum, and 0 for a product that cannot be promoted
 * honestly (it still gets its scores, so the owner sees what it would need).
 */
export function scoreProduct({ product, truth, windows, trend, reels = [], creator = null, conversions = 0, now = Date.now() }) {
  const s = {};
  const has = (x) => Boolean(x);
  s.demand = { score: clamp(Math.min(100, windows.d14 * 4)), basis: `${windows.d14} recorded events / 14 days`, confidence: windows.d14 >= 5 ? "measured" : "none" };
  s.trend = { score: { HOT_NOW: 100, RISING: 75, STABLE: 50, COOLING: 20, EXPIRED: 5, UNVERIFIED: 0 }[trend.state], basis: `lifecycle ${trend.state}`, confidence: trend.confidence };
  const hookable = has(product?.title) && has(product?.category) && truth.imageSource !== "stock_photo" && truth.imageSource !== "none";
  s.content = { score: hookable ? 70 + (product?.description ? 20 : 0) + (Number(product?.price) > 0 ? 10 : 0) : 0, basis: hookable ? "real photo + title + category (8 typed hooks)" : "no real photo — no honest visual content", confidence: "derived" };
  const tags = arr(creator?.tags).length + arr(creator?.categories).length;
  s.creatorFit = { score: tags ? 60 : 0, basis: tags ? `${tags} profile tags/categories` : "creator profile has no tags — INSUFFICIENT_DATA", confidence: tags ? "derived" : "none" };
  s.commercial = { score: (Number(product?.price) > 0 ? 50 : 0) + (truth.issues.includes("shared_affiliate_link") || truth.issues.includes("no_affiliate_url") ? 0 : 50), basis: "catalog price present + own affiliate link", confidence: "derived" };
  s.click = { score: clamp(windows.outbound * 10), basis: `${windows.outbound} recorded outbound/product clicks`, confidence: windows.outbound >= 5 ? "measured" : "none" };
  s.conversion = { score: conversions > 0 ? clamp(conversions * 20) : 0, basis: conversions > 0 ? `${conversions} verified conversions` : "no conversion data (affiliate sales are not reported back) — none claimed", confidence: conversions > 0 ? "measured" : "none" };
  const ageDays = (now - (Number(product?.updatedAt || product?.createdAt) || now)) / DAY;
  s.freshness = { score: clamp(100 - ageDays * 2), basis: `${Math.round(ageDays)} days since the product changed`, confidence: "derived" };
  const withAudio = reels.filter((v) => v.audio === "aac").length;
  s.media = { score: clamp(reels.length * 20 + withAudio * 5), basis: `${reels.length} verified reels (${withAudio} with an AAC track)`, confidence: reels.length ? "measured" : "none" };
  s.platform = { score: withAudio ? 80 : reels.length ? 40 : 0, basis: withAudio ? "9:16 reels with audio — fit for Reels / Shorts / TikTok" : "no publishable vertical video yet", confidence: "derived" };
  s.trust = { score: truth.truthStatus === TRUTH.PROMOTABLE ? 100 : 0, basis: truth.truthStatus === TRUTH.PROMOTABLE ? "own link + real photo + disclosure" : `blocked: ${truth.issues.join(", ")}`, confidence: "derived" };
  const measured = Object.values(s).filter((x) => x.confidence === "measured").length;
  s.confidence = { score: clamp((measured / 4) * 100), basis: `${measured} of 4 measured signals (demand, clicks, conversions, media)`, confidence: "derived" };
  const raw = Object.entries(WEIGHTS).reduce((t, [k, w]) => t + s[k].score * w, 0);
  const opportunity = truth.truthStatus === TRUTH.PROMOTABLE ? clamp(raw) : 0;
  return { scores: s, opportunity };
}

/** The next best action for a product, from its own state. */
export function nextAction({ truth, reels, trend, igPosted = 0 }) {
  if (truth.truthStatus !== TRUTH.PROMOTABLE) return { action: "REPAIR_DATA", why: truth.repair[0] || truth.issues.join(", ") };
  if (!reels.length) return { action: "CREATE_REEL", why: "promotable, no reel yet" };
  if (reels.length < 5) return { action: "CREATE_VARIANT", why: `${reels.length}/5 styles — next hook type to explore` };
  if (!igPosted) return { action: "PUBLISH_EXTERNAL", why: "reels ready; no external post yet" };
  if (trend.state === "COOLING") return { action: "COOL_DOWN", why: "events falling vs. the previous week" };
  return { action: "MEASURE", why: "published — collecting evidence" };
}

/**
 * Rank the catalog in batches (resource-aware): only products whose
 * fingerprint changed (or that were never scored) are re-processed when
 * `previous` is given; everything is returned ranked.
 */
export function rankCatalog({ products = [], truthRows = [], events = [], videos = [], marketers = [], radarMatches = [], igPosted = [], previous = {}, batchSize = 100, now = Date.now() } = {}) {
  const byTruth = new Map(arr(truthRows).map((r) => [r.productId, r]));
  const out = [];
  let processed = 0, reused = 0, batches = 0;
  const list = arr(products).filter((p) => p?.id);
  for (let i = 0; i < list.length; i += batchSize) {
    batches += 1;
    for (const p of list.slice(i, i + batchSize)) {
      const fp = productFingerprint(p);
      const truth = byTruth.get(p.id);
      if (!truth) continue;
      const windows = eventWindows(p.id, events, now);
      const prev = previous[p.id];
      // Re-score when the product changed or new events arrived; otherwise reuse.
      if (prev && prev.fingerprint === fp && prev.eventsTotal === windows.total && now - Date.parse(prev.at) < DAY) {
        out.push(prev); reused += 1; continue;
      }
      const reels = arr(videos).filter((v) => /^likelink_/.test(String(v?.source || "")) && v.productTags?.[0]?.productId === p.id && v.public !== false);
      const radar = arr(radarMatches).find((t) => arr(t.products).includes(p.id)) || null;
      const trend = trendLifecycle(windows, { radar, now });
      const creator = arr(marketers).find((m) => m?.id === p.marketerId) || null;
      const { scores, opportunity } = scoreProduct({ product: p, truth, windows, trend, reels, creator, now });
      const posted = arr(igPosted).filter((x) => x?.productId === p.id).length;
      out.push({
        productId: p.id, title: truth.title, fingerprint: fp, at: new Date(now).toISOString(), eventsTotal: windows.total,
        truthStatus: truth.truthStatus, opportunity, scores, trend, reels: reels.length,
        next: nextAction({ truth, reels, trend, igPosted: posted }),
      });
      processed += 1;
    }
  }
  out.sort((a, b) => b.opportunity - a.opportunity || String(a.productId).localeCompare(String(b.productId)));
  const by = (k) => out.reduce((o, r) => ({ ...o, [k(r)]: (o[k(r)] || 0) + 1 }), {});
  return {
    ranked: out,
    stats: { total: out.length, processed, reused, batches, batchSize, eligible: out.filter((r) => r.opportunity > 0).length },
    trends: Object.fromEntries(TREND_STATE.map((s) => [s, by((r) => r.trend.state)[s] || 0])),
    nextActions: by((r) => r.next.action),
  };
}
