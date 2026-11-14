// The trend radar's daily reading (src/lib/growth/trendRadar.js + israelGap.js + radarDiscovery.js).
//
//   1. Discovery: AliExpress's hot-products list per category (English titles) → up to 3 new trial
//      concepts a day that several hot items share and the watch list does not cover yet.
//   2. For every concept (the watch list scripts/catalog/radar-concepts.json + the trial concepts):
//      AliExpress, through the owner's affiliate account — the matching listings sorted by recent
//      orders (listings, the top items' orders and prices) and the first item that passes the
//      site's rules (to buy).
//   3. The Israel gap: Google's public autocomplete — Google and YouTube in Israel in Hebrew (the
//      concept's `hq`), Google in the US in English — counted as extensions (never stored as text),
//      LikeLink2's own exits to the store from the radar (public click events, 30 days), and
//      Google Trends' daily Israel feed. robots.txt is read first; a disallowed or failing source is
//      skipped for the day (no reading, never a zero).
//   4. Hot now: every top item's and every site product's 30-day orders kept per item per day
//      (items.json; seeded once from the server's own readings, scripts/catalog/radar-seed/), so a
//      buy pick and each product on the site get their own momentum (radarOpportunity.js).
//   5. The public self-grading calls, the arrival clock, and the board the /radar page reads.
//
//   node scripts/catalog/trend-radar.mjs <state-dir>
//   <state-dir>/readings.json, calls.json, awareness.json, discovered.json, items.json are the history (the
//   "radar" release keeps them); <state-dir>/board.json is the public board.
// Read-only on the store, Google and the site; nothing is posted. env: ALIEXPRESS_APP_KEY /
// APP_SECRET / TRACKING_ID; RADAR_SUGGEST=0 turns the Google reads off, RADAR_DISCOVER=0 discovery.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { aeCall, aeEnv, aeStatus } from "../../api/_utils/aliexpressAffiliate.mjs";
import { RADAR, addReading, buildBoard, pickFrom, readingFrom, signals, stageOf, updateCalls, validConcept } from "../../src/lib/growth/trendRadar.js";
import { SUGGEST_HOST, SUGGEST_PATH, TRENDS_IL_RSS, addAwareness, awarenessReading, extensions, parseSuggest, robotsAllows, suggestUrl, trendingInIsrael } from "../../src/lib/growth/israelGap.js";
import { CATEGORY_KIND, admitDiscovered, discover } from "../../src/lib/growth/radarDiscovery.js";
import { TREND_CATEGORIES } from "../../src/lib/growth/trendBoard.js";
import { parseTrendsRss } from "../../src/lib/growth/likeloop.js";
import { addItemReading, siteHotness } from "../../src/lib/growth/radarOpportunity.js";
import { CLOUD } from "../../src/constants/cloud.js";
import { aliItemId } from "./sync-aliexpress.mjs";

const SEARCH = "aliexpress.affiliate.product.query";
const DETAIL = "aliexpress.affiliate.productdetail.get";
const SEED = "scripts/catalog/radar-seed/momentum-2026-11-13.json";
const HOT = "aliexpress.affiliate.hotproduct.query";
const UA = "LikeLink2-radar/1.0 (+https://likelink2.vercel.app/radar)";
const readJson = (file, fallback) => {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback; } catch { return fallback; }
};
const pause = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** One concept's answer from the store, or why there is none. */
export async function readConcept(c, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const e = aeEnv(env);
  const biz = { keywords: c.en, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE", ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC" };
  const res = await aeCall(SEARCH, biz, { env: e, fetchImpl, now });
  const r = res?.aliexpress_affiliate_product_query_response?.resp_result;
  if (Number(r?.resp_code) !== 200) return { ok: false, reason: `resp ${r?.resp_code ?? "none"} ${String(r?.resp_msg || "").slice(0, 60)}` };
  return { ok: true, result: r.result || {} };
}

/** AliExpress's hot list for one category, in English (discovery reads the store's own words). */
async function hotList(category, { env, fetchImpl, now }) {
  const e = aeEnv(env);
  const biz = { keywords: category.keywords, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC" };
  const res = await aeCall(HOT, biz, { env: e, fetchImpl, now });
  const r = res?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
  if (Number(r?.resp_code) !== 200) throw new Error(`resp ${r?.resp_code ?? "none"}`);
  const raw = r.result?.products?.product;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

/** A public kv row (the browser's own anon read; only allowlisted keys answer). Null on any failure. */
async function publicKey(key, { fetchImpl, env = process.env }) {
  const url = String(CLOUD?.url || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = String(CLOUD?.anonKey || env.VITE_SUPABASE_ANON_KEY || "");
  if (!url || !anon) return null;
  try {
    const res = await fetchImpl(`${url}/rest/v1/kv?select=value&key=eq.${encodeURIComponent(key)}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const rows = await res.json();
    const v = rows?.[0]?.value;
    return typeof v === "string" ? JSON.parse(v) : v ?? null;
  } catch { return null; }
}

/** 30-day orders for up to 20 items at a time (productdetail.get); a failed batch reads nothing. */
async function itemOrders(ids, { env, fetchImpl, now }) {
  const e = aeEnv(env);
  const res = await aeCall(DETAIL, { product_ids: ids.join(","), target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: e.ALIEXPRESS_TRACKING_ID }, { env: e, fetchImpl, now });
  const r = res?.aliexpress_affiliate_productdetail_get_response?.resp_result;
  if (Number(r?.resp_code) !== 200) throw new Error(`resp ${r?.resp_code ?? "none"}`);
  const raw = r.result?.products?.product;
  const out = new Map();
  for (const x of Array.isArray(raw) ? raw : raw ? [raw] : []) {
    const v = Number(x?.lastest_volume);
    if (/^\d{6,20}$/.test(String(x?.product_id || "")) && x?.lastest_volume !== "" && x?.lastest_volume !== null && Number.isFinite(v)) out.set(String(x.product_id), v);
  }
  return out;
}

async function getText(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "*/*" }, redirect: "manual", signal: AbortSignal.timeout(12_000) });
  return { status: res.status, text: await res.text() };
}

/** Counted autocomplete extensions for one phrase (null when the answer is not usable). */
async function suggestCount(phrase, opts, fetchImpl) {
  const got = await getText(suggestUrl(phrase, opts), fetchImpl);
  if (got.status !== 200) return null;
  return extensions(phrase, parseSuggest(got.text));
}

export async function run(dir, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now(), budgetMs = 240_000, suggestBudgetMs = 300_000, politeMs = 350 } = {}) {
  mkdirSync(dir, { recursive: true });
  const { concepts: listed = [] } = readJson("scripts/catalog/radar-concepts.json", {});
  const watch = listed.filter(validConcept);
  const readings = readJson(join(dir, "readings.json"), {});
  const awareness = readJson(join(dir, "awareness.json"), {});
  let discovered = readJson(join(dir, "discovered.json"), []);
  // Item histories: kept per item per day; seeded once from the server's own readings.
  let items = readJson(join(dir, "items.json"), null);
  if (!items) {
    items = {};
    for (const [id, series] of Object.entries(readJson(SEED, {}).items || {})) for (const r of series) items[id] = addItemReading(items[id], r);
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const prevBoard = readJson(join(dir, "board.json"), {});
  const picks = Object.fromEntries((prevBoard.concepts || []).filter((c) => c.pick).map((c) => [c.id, c.pick]));
  const stagesBefore = Object.fromEntries((prevBoard.concepts || []).map((c) => [c.id, c.stage]));
  let calls = readJson(join(dir, "calls.json"), []);
  const log = [];
  const sources = { aliexpress: "REQUIRES_CONNECTION", discovery: "OFF", suggest: "OFF", youtube: "OFF", trendsIL: "OFF", siteVisitors: "OFF", siteProducts: "OFF" };
  const store = aeStatus(env).configured;

  // 1. Discovery.
  if (store && env.RADAR_DISCOVER !== "0") {
    const lists = {};
    const started = Date.now();
    for (const cat of TREND_CATEGORIES.filter((c) => CATEGORY_KIND[c.key])) {
      if (Date.now() - started > 60_000) { log.push(`discovery: budget over at ${cat.key}`); break; }
      try { lists[cat.key] = await hotList(cat, { env, fetchImpl, now }); } catch (err) { log.push(`discovery ${cat.key}: ${String(err?.message || err).slice(0, 80)}`); }
    }
    // A category's own search words are what its hot list was asked for: never a discovery.
    const candidates = discover(lists, [...watch, ...TREND_CATEGORIES.map((c) => ({ id: `category-${c.key}`, en: c.keywords }))]);
    const before = new Set(discovered.map((c) => c.id));
    discovered = admitDiscovered(discovered, candidates, { concepts: watch, stages: stagesBefore, now });
    const added = discovered.filter((c) => !before.has(c.id));
    sources.discovery = Object.keys(lists).length ? "OK" : "FAILED";
    log.push(`discovery: ${Object.keys(lists).length} hot lists · ${candidates.length} candidates · added ${added.map((c) => c.en).join(", ") || "none"} · on trial ${discovered.length}`);
    // Readings of concepts that left the trial are dropped with them.
    for (const id of Object.keys(readings)) if (id.startsWith("auto-") && !discovered.some((c) => c.id === id)) { delete readings[id]; delete awareness[id]; delete picks[id]; }
  }
  const concepts = [...watch, ...discovered.filter(validConcept)];

  // 2. AliExpress readings.
  if (!store) {
    log.push("AliExpress affiliate account not connected here (REQUIRES_CONNECTION): no reading today");
  } else {
    sources.aliexpress = "OK";
    const started = Date.now();
    for (const c of concepts) {
      if (Date.now() - started > budgetMs) { log.push(`${c.id}: budget over, not read today`); continue; }
      try {
        const got = await readConcept(c, { env, fetchImpl, now });
        if (!got.ok) { log.push(`${c.id}: ${got.reason}`); continue; }
        const reading = readingFrom(got.result, { now });
        if (!reading.top.length) { log.push(`${c.id}: no item with orders`); continue; }
        readings[c.id] = addReading(readings[c.id], reading);
        for (const [id, v] of reading.top) items[id] = addItemReading(items[id], [today, v]);
        const pick = pickFrom(got.result, { now });
        if (pick) picks[c.id] = pick; else delete picks[c.id];
        const s = signals(readings[c.id]);
        const stage = stageOf(s);
        calls = updateCalls(calls, c.id, stage, readings[c.id], { now });
        log.push(`${c.id}: ${reading.listings ?? "?"} listings · top orders ${reading.sum} · ${stage}${s.ok ? ` (${s.demandWeek}%/wk over ${s.span}d, breadth ${s.breadth})` : ""}${pick ? "" : " · no pick passes the rules"}`);
      } catch (err) {
        log.push(`${c.id}: ${String(err?.message || err).slice(0, 100)}`);
      }
    }
  }

  // 4 (read first). The site's own products and LikeLink2's visitors (public rows, anon read).
  const catalog = await publicKey("marketplace:products", { fetchImpl, env });
  const siteProducts = (Array.isArray(catalog) ? catalog : [])
    .filter((p) => p?.status === "approved" && !p.archivedAt)
    .map((p) => ({ id: String(p.id || ""), title: String(p.title || ""), kind: String(p.kind || ""), itemId: aliItemId(p) }))
    .filter((p) => p.itemId);
  if (catalog === null) sources.siteProducts = "FAILED";
  else if (store) {
    const missing = [...new Set(siteProducts.map((p) => p.itemId))].filter((id) => !(items[id] || []).some((r) => r[0] === today));
    let read = 0;
    for (let i = 0; i < missing.length; i += 20) {
      try {
        const got = await itemOrders(missing.slice(i, i + 20), { env, fetchImpl, now });
        for (const [id, v] of got) { items[id] = addItemReading(items[id], [today, v]); read++; }
      } catch (err) { log.push(`site items ${i}: ${String(err?.message || err).slice(0, 80)}`); }
    }
    sources.siteProducts = "OK";
    log.push(`site: ${siteProducts.length} listed products with an AliExpress item · ${read} read today`);
  }
  const clicks = await publicKey("marketplace:clicks", { fetchImpl, env });
  const exits = {};
  if (Array.isArray(clicks)) {
    sources.siteVisitors = "OK";
    const since = now - 30 * 86_400_000;
    for (const e of clicks) if (e?.med === "radar" && typeof e.camp === "string" && Number(e.ts) >= since && !e.type) exits[e.camp] = (exits[e.camp] || 0) + 1;
  } else sources.siteVisitors = "FAILED";

  // 3. The Israel gap.
  if (env.RADAR_SUGGEST !== "0") {
    let trendIds = new Set();
    try {
      const robots = await getText(`${new URL(TRENDS_IL_RSS).origin}/robots.txt`, fetchImpl);
      if (robotsAllows(robots.status, robots.text, "/trending/rss")) {
        const rss = await getText(TRENDS_IL_RSS, fetchImpl);
        if (rss.status === 200) {
          trendIds = trendingInIsrael(concepts, parseTrendsRss(rss.text));
          sources.trendsIL = "OK";
        } else sources.trendsIL = `HTTP_${rss.status}`;
      } else sources.trendsIL = "ROBOTS_DISALLOW";
    } catch (err) { sources.trendsIL = "FAILED"; log.push(`google trends IL: ${String(err?.message || err).slice(0, 80)}`); }
    let allowed = false;
    try {
      const robots = await getText(`${SUGGEST_HOST}/robots.txt`, fetchImpl);
      allowed = robotsAllows(robots.status, robots.text, SUGGEST_PATH);
      sources.suggest = allowed ? "OK" : "ROBOTS_DISALLOW";
      sources.youtube = sources.suggest;
    } catch (err) { sources.suggest = "FAILED"; log.push(`autocomplete robots: ${String(err?.message || err).slice(0, 80)}`); }
    if (allowed) {
      const started = Date.now();
      let failures = 0;
      for (const c of concepts) {
        if (Date.now() - started > suggestBudgetMs) { log.push(`${c.id}: search budget over, no Israel reading today`); continue; }
        if (failures >= 8) { sources.suggest = "FAILING"; log.push("autocomplete: 8 failed answers, stopped for today"); break; }
        try {
          const hq = (Array.isArray(c.hq) ? c.hq : []).slice(0, 3);
          const he = [];
          const yt = [];
          for (const q of hq) {
            he.push(await suggestCount(q, { hl: "he", gl: "il" }, fetchImpl)); await pause(politeMs);
            yt.push(await suggestCount(q, { hl: "he", gl: "il", ds: "yt" }, fetchImpl)); await pause(politeMs);
          }
          // The world: the store words; their first two words when the whole phrase is too specific.
          let world = await suggestCount(c.en, { hl: "en", gl: "us" }, fetchImpl); await pause(politeMs);
          const short = c.en.split(/\s+/).slice(0, 2).join(" ");
          if (world === 0 && short !== c.en) { world = await suggestCount(short, { hl: "en", gl: "us" }, fetchImpl); await pause(politeMs); }
          const answered = [...he, ...yt, world].filter((n) => n !== null).length;
          if (!answered) { failures++; log.push(`${c.id}: autocomplete gave no usable answer`); continue; }
          const reading = awarenessReading({ he, yt, hq, world, trend: trendIds.has(c.id), site: sources.siteVisitors === "OK" ? exits[c.id] || 0 : null }, { now });
          awareness[c.id] = addAwareness(awareness[c.id], reading);
          log.push(`${c.id}: Israel google=${reading.il ?? "-"} youtube=${reading.yt ?? "-"}${reading.q ? ` (${reading.q})` : ""} · US ${reading.world ?? "-"}${reading.trend ? " · trending in Israel" : ""}${reading.site ? ` · site exits ${reading.site}` : ""}`);
        } catch (err) {
          failures++;
          log.push(`${c.id}: autocomplete ${String(err?.message || err).slice(0, 80)}`);
        }
      }
    }
  }

  // Items no longer read (not a top item, not on the site) for 45 days are dropped.
  const keepFrom = new Date(now - 45 * 86_400_000).toISOString().slice(0, 10);
  for (const id of Object.keys(items)) if (!(items[id] || []).some((r) => r[0] >= keepFrom)) delete items[id];
  const site = sources.siteProducts === "OK" ? siteHotness(siteProducts, items) : null;
  if (site) log.push(`site hotness: ${JSON.stringify(site.counts)} · hot: ${site.rows.filter((r) => r.state === "HOT").map((r) => `${r.id} ${r.weekPct}%`).join(", ") || "none"}`);
  const board = buildBoard({ concepts, readings, picks, calls, awareness, items, site, now });
  board.sourcesToday = sources;
  writeFileSync(join(dir, "readings.json"), JSON.stringify(readings));
  writeFileSync(join(dir, "calls.json"), JSON.stringify(calls, null, 1));
  writeFileSync(join(dir, "awareness.json"), JSON.stringify(awareness));
  writeFileSync(join(dir, "discovered.json"), JSON.stringify(discovered, null, 1));
  writeFileSync(join(dir, "items.json"), JSON.stringify(items));
  writeFileSync(join(dir, "board.json"), JSON.stringify(board));
  const counts = board.concepts.reduce((m, c) => ((m[c.stage] = (m[c.stage] || 0) + 1), m), {});
  const gapCounts = board.concepts.reduce((m, c) => ((m[c.gap.state] = (m[c.gap.state] || 0) + 1), m), {});
  return { board, log, counts, gapCounts, sources };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const dir = process.argv[2] || "radar-state";
  const { log, counts, gapCounts, sources, board } = await run(dir);
  console.log(log.join("\n"));
  console.log("sources:", JSON.stringify(sources));
  console.log("stages:", JSON.stringify(counts), "· israel:", JSON.stringify(gapCounts), "· record:", JSON.stringify(board.record), "· clock:", JSON.stringify(board.clock));
  console.log("rules:", JSON.stringify(RADAR.pickRules));
}
