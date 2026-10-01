// LikeLoop runner — the server side of the growth loop (src/lib/growth/likeloop.js).
//
// One run (cron auth, op=likeloop-run; every 3h from the Native reels workflow):
//   DISCOVER   product truth for the whole catalog + the data-repair queue
//   SELECT     8 typed hooks + a creative matrix per promotable product
//   CREATE     (renders are done by the reel runner; this run maps them to creatives)
//   PUBLISH    a calendar per channel with caps; READY_FOR_EXTERNAL_PUBLICATION until
//              a provider confirms (the Instagram publisher is op=instagram)
//   MEASURE    recorded landings/clicks with a creative id + Instagram insights
//   LEARN      per creative / hook type, INSUFFICIENT_EVIDENCE below the threshold
//   TRENDS     Google Trends public RSS (IL), matched to products only on real overlap
// Every write goes through the kv read guard and is read back.
import { assertKvWritable, noteKvReadFailed, readKvResponse } from "./kvReadGuard.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import {
  buildCreativeMatrix,
  buildHookSet,
  catalogTruth,
  channelStates,
  creativeUrl,
  learn,
  matchTrends,
  parseTrendsRss,
  planCalendar,
  profileChecklist,
  selectCreatives,
  TRUTH,
} from "../growth/likeloop.js";
import { rankCatalog } from "../growth/opportunity.js";

const KEYS = {
  products: "marketplace:products",
  marketers: "marketplace:marketers",
  videos: "marketplace:videos",
  clicks: "marketplace:clicks",
  log: "publish:log",
  ig: "publish:instagram",
  resolve: "catalog:resolve:state",
  trends: "trends:radar",
  queue: "likeloop:queue",
  state: "likeloop:state",
  scores: "likeloop:scores",
};
const TRENDS_URL = "https://trends.google.com/trending/rss?geo=IL";
const TREND_TTL_MS = 6 * 3_600_000;
const arr = (v) => (Array.isArray(v) ? v : []);

/** Env as booleans only — values never leave this function. */
export function envFlags(env = process.env) {
  const names = ["IG_USER_ID", "IG_ACCESS_TOKEN", "FB_PAGE_ID", "FB_PAGE_TOKEN", "TIKTOK_ACCESS_TOKEN", "PINTEREST_ACCESS_TOKEN", "PINTEREST_BOARD_ID", "YOUTUBE_REFRESH_TOKEN", "BRAND_TELEGRAM_BOT", "BRAND_TELEGRAM_CHAT", "BRAND_WEBHOOK_URL"];
  return Object.fromEntries(names.map((n) => [n, Boolean(env[n])]));
}

function client({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  async function kvRead(k) {
    let res;
    try { res = await fetchImpl(`${url}/rest/v1/kv?key=eq.${encodeURIComponent(k)}&select=value`, { headers: h, signal: AbortSignal.timeout(10000) }); }
    catch { noteKvReadFailed(k); return { ok: false }; }
    const row = await readKvResponse(k, res);
    return row.failed ? { ok: false } : { ok: true, value: row.found ? row.value : null };
  }
  async function kvWrite(k, value) {
    assertKvWritable(k);
    const res = await fetchImpl(`${url}/rest/v1/kv?on_conflict=key`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: k, value: JSON.stringify(value) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`kv_write_failed_${res.status}`);
  }
  return { kvRead, kvWrite, fetchImpl };
}

async function refreshTrends(c, prev, products, now) {
  if (prev?.observedAt && now - Date.parse(prev.observedAt) < TREND_TTL_MS && prev.status === "OK") return { ...prev, trends: matchTrends(prev.trends, products) };
  try {
    const res = await c.fetchImpl(TRENDS_URL, { headers: { "user-agent": "LikeLink trend radar (+https://likelink2.vercel.app)" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const observedAt = new Date(now).toISOString();
    const trends = parseTrendsRss(await res.text(), { observedAt });
    return { status: trends.length ? "OK" : "EMPTY", source: TRENDS_URL, observedAt, trends: matchTrends(trends, products) };
  } catch (e) {
    return { ...(prev || {}), status: "SOURCE_UNAVAILABLE", error: String(e?.message || e).slice(0, 120), trends: matchTrends(arr(prev?.trends), products) };
  }
}

/** One full LikeLoop pass. Fails closed on any failed read (nothing is written). */
export async function likeloopRun({ env = process.env, fetchImpl, now = Date.now() } = {}) {
  const c = client({ env, fetchImpl });
  const reads = await Promise.all(Object.values(KEYS).map((k) => c.kvRead(k)));
  if (!reads.every((r) => r.ok)) return { ok: false, status: 503, error: "kv_read_failed" };
  const d = Object.fromEntries(Object.keys(KEYS).map((k, i) => [k, reads[i].value]));
  const products = arr(d.products), marketers = arr(d.marketers), videos = arr(d.videos), clicks = arr(d.clicks), log = arr(d.log);
  const igPosted = arr(d.ig?.posted);
  const origin = env.LIKELINK_BASE_URL || PRODUCTION_ORIGIN;

  // DISCOVER
  const published = igPosted.map((x) => ({ productId: x.productId, providerPostId: x.mediaId }));
  const truth = catalogTruth({ products, marketers, videos, clicks, resolveState: d.resolve || {}, published, origin });
  const promotable = truth.rows.filter((r) => r.truthStatus === TRUTH.PROMOTABLE).map((r) => products.find((p) => p.id === r.productId));

  // TRENDS (sourced; matched only on real overlap)
  const radar = await refreshTrends(c, d.trends, promotable, now);

  // SELECT + LEARN
  const allCreatives = [];
  const creatives = {};
  const videoCreatives = videos.filter((v) => v?.creative?.creativeId).map((v) => ({ ...v.creative, productId: v.productTags?.[0]?.productId, videoId: v.id }));
  const learning = learn(clicks, [...videoCreatives]);
  for (const p of promotable) {
    const trend = arr(radar.trends).find((t) => t.relevance === "MATCHED" && t.products.includes(p.id));
    const hooks = buildHookSet(p, { now, trend: trend ? { term: trend.term, source: trend.source, observedAt: trend.observedAt } : null });
    const matrix = buildCreativeMatrix(p, { hooks });
    allCreatives.push(...matrix);
    const made = new Set(videoCreatives.filter((v) => v.productId === p.id).map((v) => v.creativeId));
    creatives[p.id] = { hooks, matrixSize: matrix.length, rendered: made.size, next: selectCreatives(matrix, learning, { limit: 2, done: made, seed: now % 997 }).map((x) => ({ creativeId: x.creativeId, hookType: x.hookType, hook: x.hook, opening: x.opening, format: x.format, cta: x.cta, reason: x.reason })) };
  }

  // PUBLISH (calendar; providers confirm elsewhere)
  const channels = channelStates(envFlags(env), log);
  const igDone = new Set(igPosted.map((x) => x.reelId));
  const ready = videoCreatives
    .filter((v) => promotable.some((p) => p.id === v.productId))
    .filter((v) => videos.find((x) => x.id === v.videoId)?.audio === "aac")
    .map((v) => ({ ...v, trackingUrl: creativeUrl(v, "instagram", origin) }));
  const prevQueue = arr(d.queue).map((q) => (q.channel === "instagram" && igDone.has(q.videoId) && q.status !== "PUBLISHED"
    ? { ...q, status: "PUBLISHED", providerPostId: igPosted.find((x) => x.reelId === q.videoId)?.mediaId || null, permalink: igPosted.find((x) => x.reelId === q.videoId)?.permalink || null }
    : q));
  const fresh = planCalendar({ ready: ready.filter((v) => !igDone.has(v.videoId)), channels, queue: prevQueue, now });
  const keepSince = now - 7 * 86_400_000;
  const queue = [...prevQueue.filter((q) => q.status === "PUBLISHED" || Date.parse(q.slotAt) >= keepSince), ...fresh].slice(-300);

  // MEASURE: provider numbers (Instagram insights) by hook type
  const igByHook = {};
  for (const x of igPosted) {
    if (!x.insights || !x.hookType) continue;
    const s = (igByHook[x.hookType] ||= { posts: 0, views: 0, reach: 0, interactions: 0 });
    s.posts += 1; s.views += Number(x.insights.views) || 0; s.reach += Number(x.insights.reach) || 0; s.interactions += Number(x.insights.total_interactions) || 0;
  }

  const creator = marketers.find((m) => m?.slug) || null;
  const igConnected = channels.find((x) => x.channel === "instagram")?.state === "CONNECTED";
  // RANK the whole catalog (batched, fingerprinted; unchanged products are reused).
  const rank = rankCatalog({
    products, truthRows: truth.rows, events: clicks, videos, marketers,
    radarMatches: arr(radar.trends).filter((t) => t.relevance === "MATCHED"),
    igPosted, previous: d.scores?.byId || {}, now,
  });
  const state = {
    opportunities: {
      stats: rank.stats,
      trends: rank.trends,
      nextActions: rank.nextActions,
      top: rank.ranked.slice(0, 10).map((r) => ({ productId: r.productId, title: r.title, opportunity: r.opportunity, trend: r.trend.state, reels: r.reels, next: r.next, scores: Object.fromEntries(Object.entries(r.scores).map(([k, v]) => [k, { score: v.score, basis: v.basis, confidence: v.confidence }])) })),
    },
    at: new Date(now).toISOString(),
    counts: truth.counts,
    lifecycle: truth.rows.reduce((o, r) => ({ ...o, [r.lifecycle]: (o[r.lifecycle] || 0) + 1 }), {}),
    products: truth.rows,
    repairQueue: truth.repairQueue,
    creatives,
    creativesTotal: allCreatives.length,
    renderedCreatives: videoCreatives.length,
    learning,
    instagram: { posted: igPosted.length, withInsights: igPosted.filter((x) => x.insights).length, byHookType: igByHook, status: Object.keys(igByHook).length ? "MEASURED" : "INSUFFICIENT_EVIDENCE" },
    channels,
    queue: { total: queue.length, byStatus: queue.reduce((o, q) => ({ ...o, [q.status]: (o[q.status] || 0) + 1 }), {}), next: queue.filter((q) => q.status !== "PUBLISHED").slice(0, 6) },
    trends: { status: radar.status, source: radar.source || TRENDS_URL, observedAt: radar.observedAt || null, total: arr(radar.trends).length, matched: arr(radar.trends).filter((t) => t.relevance === "MATCHED") },
    profile: profileChecklist({ creator, igConnected }),
  };
  await c.kvWrite(KEYS.trends, radar);
  await c.kvWrite(KEYS.queue, queue);
  await c.kvWrite(KEYS.scores, { at: new Date(now).toISOString(), byId: Object.fromEntries(rank.ranked.map((r) => [r.productId, r])) });
  await c.kvWrite(KEYS.state, state);
  const back = await c.kvRead(KEYS.state);
  const verified = back.ok && back.value?.at === state.at;
  return { ok: verified, status: verified ? 200 : 500, proof: verified ? "VERIFIED" : "WRITE_UNVERIFIED", ...summarize(state, { admin: true }) };
}

/** Public-safe summary (no env names, no private analytics, no internal queue ids). */
export function summarize(state, { admin = false } = {}) {
  if (!state) return { status: "NOT_RUN" };
  const out = {
    at: state.at,
    products: state.counts,
    lifecycle: state.lifecycle,
    creatives: { matrix: state.creativesTotal, rendered: state.renderedCreatives },
    learning: { status: state.learning?.status, signals: state.learning?.signals || 0 },
    instagram: { posted: state.instagram?.posted || 0, measured: state.instagram?.withInsights || 0, status: state.instagram?.status },
    channels: arr(state.channels).map((x) => ({ channel: x.channel, state: x.state })),
    queue: { total: state.queue?.total || 0, byStatus: state.queue?.byStatus || {} },
    trends: { status: state.trends?.status, observedAt: state.trends?.observedAt, matched: arr(state.trends?.matched).length },
    catalog: state.opportunities ? { ...state.opportunities.stats, trendLifecycle: state.opportunities.trends, nextActions: state.opportunities.nextActions } : null,
  };
  if (admin) {
    Object.assign(out, {
      repairQueue: state.repairQueue,
      channelsDetail: state.channels,
      nextQueue: state.queue?.next,
      creativesByProduct: state.creatives,
      learningDetail: state.learning,
      instagramByHook: state.instagram?.byHookType,
      trendMatches: state.trends?.matched,
      profile: state.profile,
      productTruth: state.products,
      opportunitiesTop: state.opportunities?.top || [],
    });
  }
  return out;
}

export async function likeloopStatus({ env, fetchImpl, admin = false } = {}) {
  const c = client({ env, fetchImpl });
  const r = await c.kvRead(KEYS.state);
  if (!r.ok) return { ok: false, status: 503, error: "kv_read_failed" };
  return { ok: true, status: 200, ...summarize(r.value, { admin }) };
}
