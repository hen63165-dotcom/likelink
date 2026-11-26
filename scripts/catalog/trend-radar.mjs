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
import { aeBanSeconds, aeCall as aeCallRaw, aeEnv, aeStatus } from "../../api/_utils/aliexpressAffiliate.mjs";
import { dayText, sniffPrices } from "../../src/lib/growth/realDeal.js";
import { addHealth, hasList, healthOf, keep, measuredStates, meterFetch, newMeter, newTally, receiptOf, receiptText, tallyUnit, worldState } from "../../src/lib/growth/runReceipt.js";
import { SOCIAL, adsPage, adsUrl, bskyPage, bskyUrl, socialKinds, talkOf } from "../../src/lib/growth/socialSignal.js";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { HAULS, haulOnStore, haulRisers, haulSearchUrl, haulVideos, mergeHauls } from "../../src/lib/growth/haulSignal.js";
import { SHOPS, SHOP_WORDS, mergeShopWords, mergeShops, nrdUrl, productVocab, risingShopWords, shopsOf, shopsToday, wordsToday } from "../../src/lib/growth/shopSignal.js";
import { NEWS, mergeNews, newsBoard, newsQueue, newsUrl, parseTimeline } from "../../src/lib/growth/newsSignal.js";
import { TRADE, latestPeriod, parseComext, probeUrl, tradeJumps, tradeUrl, windowsOf } from "../../src/lib/growth/tradeSignal.js";
const SHOPS_BACK = 8; // daily lists read in one run when the state misses days
import { factoryJumps } from "../../src/lib/growth/factorySignal.js";
import { WIKI, acceptTitle, attentionOf, candidateTitles, directTitles, entityUrl, hebrewTitleOf, historyOf, summaryOf, summaryUrl, viewsTotal, viewsUrl, wikiCard, wikiSummary } from "../../src/lib/growth/wikiSignal.js";

// An error's short code for the receipt (resp_<code>, http_<status>, err_<code>, timeout, error).
const codeOf = (x) => {
  const t = String(x?.message || x || "");
  let m;
  if ((m = t.match(/resp (\w+)/))) return `resp_${m[1]}`;
  if ((m = t.match(/aliexpress_provider_http_(\d+)/))) return `http_${m[1]}`;
  if ((m = t.match(/aliexpress_provider_([A-Za-z0-9_.]+)/))) return `err_${m[1].slice(0, 30)}`;
  if (/timeout|abort/i.test(t) || /Timeout|Abort/.test(String(x?.name || ""))) return "timeout";
  return "error";
};

// 🏷️ המבצע האמיתי (realDeal.js): every AliExpress answer this run reads also leaves each item's
// shekel "from" price for today in the price ledger (prices.json), sealed per day below.
const PRICE_SINK = { ledger: null, today: null };
async function aeCall(method, biz, opts) {
  // The store's short frequency ban ("this ban will last N seconds", up to 10): waited out and asked
  // again, up to twice more (the client itself asks once more after a ban of up to 2 s), so a busy
  // second never stops a category or a kind for the day.
  let res;
  for (let attempt = 0; ; attempt++) {
    try { res = await aeCallRaw(method, biz, opts); break; } catch (err) {
      const ban = aeBanSeconds(err);
      if (ban === null || ban < 1 || ban > 10 || attempt >= 2) throw err; // only a ban that names its seconds
      await new Promise((ok) => setTimeout(ok, Math.max(1, ban) * 1000 + 500));
    }
  }
  if (PRICE_SINK.ledger) { try { sniffPrices(res, PRICE_SINK.today, PRICE_SINK.ledger); } catch { /* a price is never worth a failed run */ } }
  return res;
}
import { RADAR, addReading, buildBoard, pickFrom, readingFrom, signals, stageOf, updateCalls, validConcept } from "../../src/lib/growth/trendRadar.js";
import { SUGGEST_HOST, SUGGEST_PATH, TRENDS_IL_RSS, addAwareness, awarenessReading, extensions, parseSuggest, robotsAllows, suggestUrl, trendingInIsrael } from "../../src/lib/growth/israelGap.js";
import { CATEGORY_KIND, admitDiscovered, discover } from "../../src/lib/growth/radarDiscovery.js";
import { KINDS, gradeKinds, kindCandidates, kindsRecord, kindsSealText, lookCandidates, mergeLooks, newKinds, recordKinds } from "../../src/lib/growth/newKinds.js";
import { poolImageVectors, poolVectors } from "./radar-embed.mjs";
import { brainText, freshFeatures, kindFeatures, learn, likeThis, matchesPattern, sureState } from "../../src/lib/growth/radarBrain.js";
import { PROMISE, addIssued, calibrate, cardRange, gradePromises, issuePromises, newPromiseState, promiseBoard, promiseSealText, samplePool } from "../../src/lib/growth/radarPromise.js";
import { TREND_CATEGORIES } from "../../src/lib/growth/trendBoard.js";
import { buildHookSet, parseTrendsRss } from "../../src/lib/growth/likeloop.js";
import { enrich } from "../../src/lib/growth/radarIntel.js";
import { PRODUCTION_ORIGIN } from "../../src/constants/domain.js";
import { HOT as HOT_RULES, addItemReading, itemMomentum, siteHotness } from "../../src/lib/growth/radarOpportunity.js";
import { CLOUD } from "../../src/constants/cloud.js";
import { aliItemId } from "./sync-aliexpress.mjs";
import { ENGINES, TRENDS_GEOS, WORLD_MARKETS, addWorld, cjkExtensions, calibrationOf, earlyCall, echoOf, factoryOf, finishLinesOf, leadOf, ledgerOf, parseEngine, productTrend, sealOf, signalsNeeded, stampFirsts, trendingAbroad, trendsRssUrl, worldPulseOf, worldReading } from "../../src/lib/growth/worldPulse.js";
import { trackRecord } from "../../src/lib/growth/trendRadar.js";
import { OTS_CALENDARS, fromBase64, hexBytes, otsProof, toBase64 } from "../../src/lib/growth/radarSeal.js";
import { anchorProof, anchorsBoard } from "../../src/lib/growth/otsUpgrade.js";
import { freshSealText, ledgerText, stagesSealText } from "../../src/lib/growth/radarLedger.js";
import { drawLuck, gradeLuck, luckBoard, luckSealText, luckSeed, recordLuck } from "../../src/lib/growth/radarLuck.js";
import { mergePath, pathBoard, pathCard } from "../../src/lib/growth/trendPath.js";
import { baselineBoard, baselineOpenIds, baselinePool, baselineSealText, baselineSeedText, gradeBaseline, rebuildDays, recordBaseline } from "../../src/lib/growth/radarBaseline.js";
import { createHash, randomBytes } from "node:crypto";
import { cancelNotFresh, challengeBoard, challengeSealText, gradeChallenge, openChallenge, pickFreshOptions, shouldOpen } from "../../src/lib/growth/radarChallenge.js";
import { CLOCK_EXTRA, clockOf, globeBoard, gradeNextCalls, lagTable, nextCallsSealText, recordNextCalls } from "../../src/lib/growth/worldClock.js";
import { GAP, GAP_CORE, GAP_COUNTRIES, GAP_EXTRA, freshGap, gapSweepOrder, suggestFacts, worldGapOf, worldGapSummary } from "../../src/lib/growth/worldGap.js";
import { gradeSupplyCalls, recordSupplyCalls, supplyBoard, supplyCallRecord, supplyGapOf, supplySealText } from "../../src/lib/growth/supplyGap.js";
import { hasBrandName, isNotListedKind } from "../../src/lib/growth/deals.js";
import { YT, ytIdsOf, ytSearchUrl, ytSignal, ytVideosUrl, ytViewsOf } from "../../src/lib/growth/youtubeSignal.js";
import { CROWD, crowdCard } from "../../src/lib/growth/crowdSensor.js";
import { CATEGORY_GET, WORLD, categoriesOf, needsRefresh, rotation, worldSlice } from "../../src/lib/growth/worldCategories.js";
import { WAVES, WAVE_AREAS, addWaveReading, altPick, collectWaves, igRecentUrl, igSearchUrl, igSignal, igTag, waveCard } from "../../src/lib/growth/brandWaves.js";
import { pinterestTerms, pinterestTrendsUrl } from "../../src/lib/growth/pinterestTrends.js";
import { byCategory, exitSignal } from "../../src/lib/growth/radarCore.js";
import { WINDOW, addReading as addWindowReading, addWindows, calibrateWindow, cardWindow, conceptKey, gradeWindows, issueWindows, newWindowState, phraseKey, phraseOfKey, readQueue, seriesOf, windowBoard, windowSealText } from "../../src/lib/growth/radarWindow.js";
import { findResults } from "../../src/lib/growth/findOnAli.js";
import { kindListings, radarPool } from "../../src/lib/growth/channelEngine.js";
import { FASHION_AREAS, FRESH, freshBar, freshEntry, freshKeywords, freshPhrase, freshQueries, freshRecord, freshRisers, gradeFresh, isSeasonal, distinctPhrase, phraseCounts, mergeFreshPool, recordFresh, unknownCheck } from "../../src/lib/growth/freshRisers.js";

const SEARCH = "aliexpress.affiliate.product.query";
const DETAIL = "aliexpress.affiliate.productdetail.get";
const SEED = "scripts/catalog/radar-seed/momentum-2026-11-13.json";
const HOT = "aliexpress.affiliate.hotproduct.query";
const UA = "LikeLink2-radar/1.0 (+https://likelink2.vercel.app/radar)";
const readJson = (file, fallback) => {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback; } catch { return fallback; }
};
const pause = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
/** Runs async tasks with at most `n` at a time (in order of start; each result at its own index). */
async function runPool(tasks, n) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, tasks.length)) }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));
  return out;
}

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
    const id = String(x?.product_id || "");
    if (!/^\d{6,20}$/.test(id)) continue;
    const v = Number(x?.lastest_volume);
    const rate = parseFloat(String(x?.commission_rate ?? "").replace("%", ""));
    const pos = parseFloat(String(x?.evaluate_rate ?? "").replace("%", ""));
    out.set(id, {
      orders: x?.lastest_volume !== "" && x?.lastest_volume !== null && Number.isFinite(v) ? v : null,
      // Booleans only: the rates choose, they are never kept or shown.
      ships: true, // asked with country IL: the store returned it for Israel
      commission: Number.isFinite(rate) ? rate > 0 : null,
      satisfied: Number.isFinite(pos) ? pos >= 95 : null,
    });
  }
  return out;
}

async function getText(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "*/*" }, redirect: "manual", signal: AbortSignal.timeout(12_000) });
  return { status: res.status, text: await res.text() };
}

/**
 * A robots.txt answer, following up to five redirects within the same site, as the robots standard
 * asks (RFC 9309, 2.3.1.2). 22.11: wikimedia.org's rules file answers 302 → www.wikimedia.org, which
 * has none (404: no rule), and the radar read that redirect as a failed door.
 */
async function getRobots(url, fetchImpl, { timeoutMs = 12_000 } = {}) {
  const site = (h) => h.split(".").slice(-2).join(".");
  let u = url;
  for (let hop = 0; hop <= 5; hop++) {
    const res = await fetchImpl(u, { headers: { "user-agent": UA, accept: "*/*" }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    const loc = res.status >= 300 && res.status < 400 ? res.headers?.get?.("location") : null;
    if (!loc) return { status: res.status, text: await res.text() };
    const next = new URL(loc, u);
    if (next.protocol !== "https:" || site(next.hostname) !== site(new URL(u).hostname)) return { status: res.status, text: "" };
    u = next.href;
  }
  return { status: 310, text: "" };
}

/** One phrase's suggestions as text (null when the answer is not usable). */
async function suggestList(phrase, opts, fetchImpl) {
  const got = await getText(suggestUrl(phrase, opts), fetchImpl);
  return got.status === 200 ? parseSuggest(got.text) : null;
}

/** Counted autocomplete extensions for one phrase (null when the answer is not usable). */
async function suggestCount(phrase, opts, fetchImpl) {
  const got = await getText(suggestUrl(phrase, opts), fetchImpl);
  if (got.status !== 200) return null;
  return extensions(phrase, parseSuggest(got.text));
}

export async function run(dir, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now(), budgetMs = 240_000, suggestBudgetMs = 1_200_000, politeMs = 300 } = {}) {
  mkdirSync(dir, { recursive: true });
  // 🧾 The run receipt (runReceipt.js): every request of this run goes through one metered fetch, so a
  // source is "read" only when its host really answered, and the page shows those counts, not claims.
  const meter = newMeter();
  const runStarted = Date.now();
  // The run's own clock (26.11: a branch run read for 30 minutes and was stopped before it saved
  // anything). Past the deadline, the optional readings are skipped and named as skipped, so the day's
  // readings, calls and seals are always saved.
  const deadline = runStarted + (Number(env.RADAR_DEADLINE_MIN) || 38) * 60_000;
  const late = (key, needMs) => {
    const left = deadline - Date.now();
    if (left >= needMs) return false;
    sources[key] = "SKIPPED";
    log.push(`${key}: skipped, the run's time (${Math.max(0, Math.round(left / 1000))} s left of the deadline)`);
    return true;
  };
  fetchImpl = meterFetch(fetchImpl, meter);
  const { concepts: listed = [] } = readJson("scripts/catalog/radar-concepts.json", {});
  const watch = listed.filter(validConcept);
  const readings = readJson(join(dir, "readings.json"), {});
  const awareness = readJson(join(dir, "awareness.json"), {});
  const worldMap = readJson(join(dir, "world.json"), {});
  let discovered = readJson(join(dir, "discovered.json"), []);
  // Item histories: kept per item per day; seeded once from the server's own readings.
  const facts = {}; // today's store facts per site item (booleans + orders; not kept between runs)
  let items = readJson(join(dir, "items.json"), null);
  if (!items) {
    items = {};
    for (const [id, series] of Object.entries(readJson(SEED, {}).items || {})) for (const r of series) items[id] = addItemReading(items[id], r);
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const prices = env.RADAR_PRICES === "0" ? null : readJson(join(dir, "prices.json"), {});
  PRICE_SINK.ledger = prices;
  PRICE_SINK.today = today;
  const prevBoard = readJson(join(dir, "board.json"), {});
  // One book sealed: SHA-256 of its exact text, sent to the OpenTimestamps calendars only when it
  // changed (an unchanged book keeps its day and proofs). Only the 32-byte hash leaves the runner.
  const sealBook = async ({ text, count }, prev, name) => {
    const seal = { d: today, sha256: createHash("sha256").update(text).digest("hex"), count, text: text.length <= 30_000 ? text : null, ots: [] };
    if (prev?.sha256 === seal.sha256 && Array.isArray(prev.ots) && prev.ots.length) return { ...seal, d: prev.d || seal.d, ots: prev.ots };
    if (env.RADAR_OTS === "0") return seal;
    for (const cal of OTS_CALENDARS) {
      try {
        const res = await fetchImpl(`${cal}/digest`, { method: "POST", headers: { Accept: "application/vnd.opentimestamps.v1", "Content-Type": "application/x-www-form-urlencoded" }, body: hexBytes(seal.sha256), signal: AbortSignal.timeout(20_000) });
        const proof = res.ok ? otsProof(seal.sha256, new Uint8Array(await res.arrayBuffer())) : null;
        if (proof) seal.ots.push({ cal: new URL(cal).host, b64: toBase64(proof) });
        else log.push(`${name} seal: ${new URL(cal).host} answered ${res.status}`);
      } catch (e) { log.push(`${name} seal: ${new URL(cal).host} ${e?.name || "error"}`); }
    }
    return seal;
  };
  const picks = Object.fromEntries((prevBoard.concepts || []).filter((c) => c.pick).map((c) => [c.id, c.pick]));
  const stagesBefore = Object.fromEntries((prevBoard.concepts || []).map((c) => [c.id, c.stage]));
  let calls = readJson(join(dir, "calls.json"), []);
  const log = [];
  // The four stages of every scan, counted apart per kind of unit (runReceipt.js tallyUnit): asked,
  // scanned (a valid answer), with data, kept after the radar's own checks; every failure named.
  const scan = { concepts: newTally(), fresh: newTally(), world: newTally(), siteItems: newTally() };
  const sources = { aliexpress: "REQUIRES_CONNECTION", discovery: "OFF", suggest: "OFF", youtube: "OFF", trendsIL: "OFF", trendsWorld: "OFF", worldSearch: "OFF", trendsDiscovery: "OFF", siteVisitors: "OFF", siteProducts: "OFF", fresh: "OFF" };
  const store = aeStatus(env).configured;

  // 0. The world first: Google Trends' daily trending searches in four English-speaking countries
  // (read once each, only while trends.google.com's robots.txt allows it).
  const abroadTerms = {};
  if (env.RADAR_SUGGEST !== "0") {
    try {
      const robots = await getText("https://trends.google.com/robots.txt", fetchImpl);
      if (robotsAllows(robots.status, robots.text, "/trending/rss")) {
        for (const geo of TRENDS_GEOS) {
          try {
            const rss = await getText(trendsRssUrl(geo), fetchImpl);
            if (rss.status === 200) { abroadTerms[geo] = parseTrendsRss(rss.text).map((t) => (typeof t === "string" ? t : t?.term)).filter(Boolean).slice(0, 40); keep(meter, "trendsWorld", abroadTerms[geo].length); }
          } catch (err) { log.push(`google trends ${geo}: ${String(err?.message || err).slice(0, 60)}`); }
          await pause(politeMs);
        }
        sources.trendsWorld = Object.values(abroadTerms).some((t) => t.length) ? "OK" : Object.keys(abroadTerms).length ? "EMPTY" : "FAILED";
      } else sources.trendsWorld = "ROBOTS_DISALLOW";
    } catch (err) { sources.trendsWorld = "FAILED"; log.push(`google trends robots: ${String(err?.message || err).slice(0, 60)}`); }
    log.push(`google trends abroad: ${Object.entries(abroadTerms).map(([g, t]) => `${g} ${t.length}`).join(", ") || "none"}`);
  }
  // Pinterest's own growing keywords in fashion and beauty (pinterestTrends.js, the official API
  // with the owner's app token): they join the terms from abroad. The token is never logged.
  // Kept apart from abroadTerms: those are Google's trending searches, the "trends" finish line.
  let pinTerms = [];
  sources.pinterest = env.PINTEREST_TOKEN ? "NOT_ASKED" : "REQUIRES_CONNECTION";
  if (env.PINTEREST_TOKEN && env.RADAR_PINTEREST !== "0") {
    try {
      const res = await fetchImpl(pinterestTrendsUrl(), { headers: { authorization: `Bearer ${String(env.PINTEREST_TOKEN).trim()}`, accept: "application/json" } });
      if (res.ok) {
        const terms = pinterestTerms(await res.json());
        pinTerms = terms.map((t) => t.term);
        sources.pinterest = terms.length ? "OK" : "EMPTY";
        keep(meter, "pinterest", terms.length);
        log.push(`pinterest trends: ${terms.length} growing fashion and beauty keywords`);
      } else { sources.pinterest = `HTTP_${res.status}`; log.push(`pinterest trends: HTTP ${res.status}`); }
    } catch (err) { sources.pinterest = "FAILED"; log.push(`pinterest trends: ${String(err?.message || err).slice(0, 60)}`); }
  }

  // 1. Discovery.
  let waveLists = null;
  if (store && env.RADAR_DISCOVER !== "0") {
    const lists = {};
    const started = Date.now();
    for (const cat of TREND_CATEGORIES.filter((c) => CATEGORY_KIND[c.key])) {
      if (Date.now() - started > 60_000) { log.push(`discovery: budget over at ${cat.key}`); break; }
      try { lists[cat.key] = await hotList(cat, { env, fetchImpl, now }); } catch (err) { log.push(`discovery ${cat.key}: ${String(err?.message || err).slice(0, 80)}`); }
    }
    // A category's own search words are what its hot list was asked for: never a discovery.
    const candidates = discover(lists, [...watch, ...TREND_CATEGORIES.map((c) => ({ id: `category-${c.key}`, en: c.keywords }))]);
    // The waves (brandWaves.js) read the same hot lists plus the gadget areas the shop has no category for.
    waveLists = { ...lists };
    if (env.RADAR_WAVES !== "0") {
      for (const area of WAVE_AREAS) {
        try { waveLists[area.key] = await hotList(area, { env, fetchImpl, now }); } catch (err) { log.push(`waves ${area.key}: ${String(err?.message || err).slice(0, 60)}`); }
      }
    }
    const before = new Set(discovered.map((c) => c.id));
    discovered = admitDiscovered(discovered, candidates, { concepts: watch, stages: stagesBefore, now });
    const added = discovered.filter((c) => !before.has(c.id));
    sources.discovery = Object.values(lists).some((l) => l.length) ? "OK" : Object.keys(lists).length ? "EMPTY" : "FAILED";
    log.push(`discovery: ${Object.keys(lists).length} hot lists · ${candidates.length} candidates · added ${added.map((c) => c.en).join(", ") || "none"} · on trial ${discovered.length}`);
    // Found in the world first, then on AliExpress: a term trending today in a country's Google
    // searches joins the radar when AliExpress sells it (productTrend: matching items and orders).
    // Pinterest's growing fashion keywords first (the styles), then Google's trending searches.
    const seenTerm = new Set();
    const terms = [["pinterest", pinTerms], ...Object.entries(abroadTerms)].flatMap(([geo, ts]) => ts.map((t) => [String(t).toLowerCase().trim(), geo])).filter(([t]) => !seenTerm.has(t) && seenTerm.add(t))
      .filter(([t]) => t.length >= 4 && !hasBrandName(t) && !isNotListedKind(t)).slice(0, 60);
    if (terms.length) {
      const e = aeEnv(env);
      const tCands = [];
      const tStarted = Date.now();
      for (const [term, geo] of terms) {
        if (Date.now() - tStarted > 90_000) { log.push("trends discovery: budget over"); break; }
        try {
          const res = await aeCall(SEARCH, { keywords: term, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "20", sort: "LAST_VOLUME_DESC" }, { env: e, fetchImpl, now });
          const r = res?.aliexpress_affiliate_product_query_response?.resp_result;
          if (Number(r?.resp_code) !== 200) continue;
          const raw = r.result?.products?.product;
          const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => ({ title: x.product_title, orders: Number(x.lastest_volume) || 0 }));
          const verdict = productTrend(term, list);
          if (verdict.ok) tCands.push({ en: term, kind: "", items: verdict.items, orders: verdict.orders, category: geo === "pinterest" ? "pinterest-trends" : `google-trends-${geo}` });
        } catch (err) { log.push(`trends discovery ${term}: ${String(err?.message || err).slice(0, 60)}`); }
      }
      const tBefore = new Set(discovered.map((c) => c.id));
      discovered = admitDiscovered(discovered, tCands, { concepts: watch, stages: stagesBefore, now });
      const tAdded = discovered.filter((c) => !tBefore.has(c.id));
      sources.trendsDiscovery = "OK";
      log.push(`trends discovery: ${terms.length} trending terms abroad · ${tCands.length} sell on AliExpress · added ${tAdded.map((c) => c.en).join(", ") || "none"}`);
    }
    // 🎥 The first creators (haulSignal.js; the owner, 22.11: "the way the squishy was found, for every
    // product"): the newest haul and "finds" videos on YouTube (official Data API, her free key), the
    // product phrases more channels started to show this week, sold on AliExpress → trial concepts, so
    // the stages, the world gap and the sealed calls measure them from tomorrow. RADAR_HAULS=0 turns it off.
    if (env.RADAR_HAULS !== "0") {
      if (!env.YOUTUBE_API_KEY) sources.hauls = "REQUIRES_CONNECTION";
      else {
        let haulState = readJson(join(dir, "hauls.json"), {});
        let videos = 0, asked = 0, answered = 0;
        const channels = new Set();
        for (const [q, short] of [...HAULS.queries.map((x) => [x, false]), ...HAULS.shortQueries.map((x) => [x, true])]) {
          asked++;
          try {
            const res = await fetchImpl(haulSearchUrl(q, { key: env.YOUTUBE_API_KEY, now, short }), { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
            const list = res.ok ? haulVideos(await res.json().catch(() => null)) : null;
            if (!list) continue;
            answered++;
            videos += list.length;
            for (const v of list) channels.add(v.channel);
            haulState = mergeHauls(haulState, list, today);
          } catch { /* the meter counts the failure */ }
        }
        writeFileSync(join(dir, "hauls.json"), JSON.stringify(haulState));
        const risers = haulRisers(haulState, today, { concepts: [...watch, ...discovered] }).slice(0, HAULS.perDay);
        const hCands = [];
        const he = aeEnv(env);
        for (const r of risers) {
          try {
            const res = await aeCall(SEARCH, { keywords: r.phrase, tracking_id: he.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "20", sort: "LAST_VOLUME_DESC" }, { env: he, fetchImpl, now });
            const rr = res?.aliexpress_affiliate_product_query_response?.resp_result;
            if (Number(rr?.resp_code) !== 200) continue;
            const raw = rr.result?.products?.product;
            const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => ({ title: x.product_title, orders: Number(x.lastest_volume) || 0 }));
            const v = haulOnStore(r.phrase, list);
            if (v.ok) hCands.push({ en: r.phrase, kind: "", items: v.items, orders: v.orders, category: "hauls", via: "haul" });
          } catch (err) { log.push(`hauls ${r.phrase}: ${String(err?.message || err).slice(0, 60)}`); }
        }
        const hBefore = new Set(discovered.map((c) => c.id));
        discovered = admitDiscovered(discovered, hCands, { concepts: watch, stages: stagesBefore, now });
        const hAdded = discovered.filter((c) => !hBefore.has(c.id));
        if (answered) keep(meter, "youtubeApi", videos);
        sources.hauls = answered ? "OK" : "FAILED";
        log.push(`hauls: ${answered}/${asked} searches · ${videos} videos from ${channels.size} channels · rising ${risers.map((r) => `${r.phrase} ${r.before}→${r.channels}`).join(", ") || "none"} · sold on AliExpress ${hCands.length} · added ${hAdded.map((c) => c.en).join(", ") || "none"}`);
      }
    }
    // Readings of concepts that left the trial are dropped with them.
    for (const id of Object.keys(readings)) if (id.startsWith("auto-") && !discovered.some((c) => c.id === id)) { delete readings[id]; delete awareness[id]; delete picks[id]; }
  }
  // 1c. New kinds by meaning (newKinds.js): an open sentence model on this runner groups the fresh
  // pool's new listings (read on earlier mornings) by meaning; a group of ≥ 3 new listings whose
  // median orders grow ≥ 25% a week is a new kind. The strongest join as trial concepts, so the
  // whole radar measures them from today. RADAR_KINDS=0 turns it off; a missing model skips it.
  let kindsToday = [];
  let kindVectors = 0;
  sources.kinds = "OFF";
  if (env.RADAR_KINDS !== "0") {
    const poolBefore = readJson(join(dir, "fresh.json"), {});
    try {
      const { vectors, cache, embedded } = await poolVectors(poolBefore, readJson(join(dir, "embeds.json"), {}));
      writeFileSync(join(dir, "embeds.json"), JSON.stringify(cache));
      kindVectors = Object.keys(vectors).length;
      kindsToday = newKinds(poolBefore, items, vectors, { concepts: watch });
      sources.kinds = "OK";
      log.push(`kinds by meaning: ${embedded} new titles embedded · ${kindVectors} listings · ${kindsToday.length} candidate kinds (${kindsToday.slice(0, 5).map((k) => `${k.en} ×${k.members.length} +${k.medianWeekPct}%`).join(", ") || "none"})`);
    } catch (err) { sources.kinds = "FAILED"; log.push(`kinds by meaning: ${String(err?.message || err).slice(0, 120)}`); }
    // 👁️ The same look: the photos of the fast new listings, grouped when they look alike (newKinds.js
    // lookCandidates / mergeLooks, the lens model on this runner). RADAR_LOOKS=0 turns it off.
    sources.looks = "OFF";
    if (env.RADAR_LOOKS !== "0" && sources.kinds === "OK") {
      try {
        const cands = lookCandidates(poolBefore, items);
        const { vectors, cache, embedded, failed } = await poolImageVectors(cands, readJson(join(dir, "look-embeds.json"), {}), { fetchImpl, poolIds: new Set(Object.keys(poolBefore)) });
        writeFileSync(join(dir, "look-embeds.json"), JSON.stringify(cache));
        const sub = Object.fromEntries(cands.filter((e) => vectors[e.id]).map((e) => [e.id, e]));
        const looks = newKinds(sub, items, vectors, { concepts: watch, rules: { ...KINDS, sim: KINDS.lookSim } });
        const before = kindsToday.length;
        kindsToday = mergeLooks(kindsToday, looks);
        sources.looks = Object.keys(vectors).length ? "OK" : "FAILED";
        log.push(`kinds by look: ${cands.length} fast listings · ${embedded} photos read today (${failed} failed) · ${Object.keys(vectors).length} with a vector · ${looks.length} look groups · ${kindsToday.length - before} new after merging (${looks.slice(0, 5).map((k) => `${k.en} ×${k.members.length} +${k.medianWeekPct}%`).join(", ") || "none"})`);
      } catch (err) { sources.looks = "FAILED"; log.push(`kinds by look: ${String(err?.message || err).slice(0, 120)}`); }
    }
  }
  const concepts = [...watch, ...discovered.filter(validConcept)];
  const listingsByKind = {};

  // 2. AliExpress readings.
  if (!store) {
    log.push("AliExpress affiliate account not connected here (REQUIRES_CONNECTION): no reading today");
  } else {
    const started = Date.now();
    for (const c of concepts) {
      if (Date.now() - started > budgetMs) { log.push(`${c.id}: budget over, not read today`); tallyUnit(scan.concepts, { id: c.id, code: "budget_over" }); continue; }
      try {
        const got = await readConcept(c, { env, fetchImpl, now });
        if (!got.ok) {
          log.push(`${c.id}: ${got.reason}`);
          tallyUnit(scan.concepts, { id: c.id, code: codeOf(got.reason), scanned: /^resp 405/.test(got.reason) });
          // A trial concept the store sells nothing under (two empty answers in a row) leaves the radar.
          if (c.auto && /^resp 405/.test(got.reason)) c.empty = (Number(c.empty) || 0) + 1;
          continue;
        }
        if (c.auto && c.empty) delete c.empty;
        const reading = readingFrom(got.result, { now });
        if (!reading.top.length) { log.push(`${c.id}: no item with orders`); tallyUnit(scan.concepts, { id: c.id, scanned: true, withData: hasList(got.result) }); continue; }
        tallyUnit(scan.concepts, { id: c.id, scanned: true, withData: true, kept: reading.top.length });
        readings[c.id] = addReading(readings[c.id], reading);
        for (const [id, v] of reading.top) items[id] = addItemReading(items[id], [today, v]);
        const pick = pickFrom(got.result, { now, concept: c });
        if (pick) picks[c.id] = pick; else delete picks[c.id];
        // 📣 The channels' pool (channelEngine.js): every seller of this kind that passes the site's
        // rules and names the kind, kept for today's comparison (several sellers per kind).
        try {
          const raw = got.result?.products?.product;
          const passing = findResults(Array.isArray(raw) ? raw : raw ? [raw] : [], { rules: { ...RADAR.pickRules, max: 20 }, now }).items;
          const ls = kindListings(got.result, passing, c);
          if (ls.length) listingsByKind[c.id] = ls;
        } catch { /* the pool is never worth a failed reading */ }
        const s = signals(readings[c.id]);
        const stage = stageOf(s);
        calls = updateCalls(calls, c.id, stage, readings[c.id], { now });
        log.push(`${c.id}: ${reading.listings ?? "?"} listings · top orders ${reading.sum} · ${stage}${s.ok ? ` (${s.demandWeek}%/wk over ${s.span}d, breadth ${s.breadth})` : ""}${pick ? "" : " · no pick passes the rules"}`);
      } catch (err) {
        log.push(`${c.id}: ${String(err?.message || err).slice(0, 100)}`);
        tallyUnit(scan.concepts, { id: c.id, code: codeOf(err) });
      }
    }
    // OK only when kinds were really read and kept; the meter checks it again before the page.
    sources.aliexpress = scan.concepts.kept ? "OK" : scan.concepts.scanned ? "EMPTY" : "FAILED";
    log.push(`aliexpress kinds: ${scan.concepts.kept} kept of ${scan.concepts.asked} asked (${scan.concepts.scanned} answered, ${scan.concepts.withData} with items)`);
  }

  // 4 (read first). The site's own products and LikeLink2's visitors (public rows, anon read).
  const catalog = await publicKey("marketplace:products", { fetchImpl, env });
  // Listed products, and the ones the radar archived (so they come back when they qualify again).
  const siteProducts = (Array.isArray(catalog) ? catalog : [])
    .filter((p) => (p?.status === "approved" && !p.archivedAt) || (p?.status === "archived" && p.archivedBy === "radar"))
    .map((p) => ({
      id: String(p.id || ""), title: String(p.title || ""), kind: String(p.kind || ""), category: String(p.category || ""), itemId: aliItemId(p),
      image: typeof p.image === "string" ? p.image : "", price: Number(p.price) || null, priceSource: String(p.priceSource || ""),
      affiliateUrl: String(p.affiliateUrl || ""), videoUrl: typeof p.videoUrl === "string" ? p.videoUrl : "", sellerVideo: typeof p.sellerVideo === "string" ? p.sellerVideo : "",
      images: Array.isArray(p.images) ? p.images.filter((u) => typeof u === "string").slice(0, 8) : [], status: String(p.status || ""), archivedBy: p.archivedBy || null, marketerId: String(p.marketerId || ""),
    }))
    .filter((p) => p.itemId);
  if (catalog === null) sources.siteProducts = "FAILED";
  else if (store) {
    // Every site item, every day: its 30-day orders and the store's facts for the 8 criteria.
    const ids = [...new Set(siteProducts.map((p) => p.itemId))];
    let read = 0;
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      try {
        const got = await itemOrders(batch, { env, fetchImpl, now });
        for (const [id, f] of got) {
          if (Number.isFinite(f.orders)) items[id] = addItemReading(items[id], [today, f.orders]);
          facts[id] = { d: today, ...f };
          read++;
        }
        // Each item of the batch: answered by the store with its orders (kept), without them, or absent.
        for (const id of batch) tallyUnit(scan.siteItems, { id, scanned: true, withData: got.has(id), kept: Number.isFinite(got.get(id)?.orders) ? 1 : 0 });
      } catch (err) {
        log.push(`site items ${i}: ${String(err?.message || err).slice(0, 80)}`);
        for (const id of batch) tallyUnit(scan.siteItems, { id, code: codeOf(err) });
      }
    }
    keep(meter, "site", siteProducts.length);
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
          const ilTerms = parseTrendsRss(rss.text);
          trendIds = trendingInIsrael(concepts, ilTerms);
          keep(meter, "trendsIL", ilTerms.length);
          sources.trendsIL = ilTerms.length ? "OK" : "EMPTY";
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
    const abroadIds = trendingAbroad(concepts, abroadTerms);
    // Each engine's own rules first: a disallow (or no answer) leaves that country out today.
    const engineOk = {};
    for (const [name, e] of Object.entries(ENGINES)) {
      try {
        const robots = await getText(`${e.host}/robots.txt`, fetchImpl);
        engineOk[name] = robotsAllows(robots.status, robots.text, e.path);
      } catch { engineOk[name] = false; }
      sources[`engine_${name}`] = engineOk[name] ? "OK" : "ROBOTS_DISALLOW_OR_FAILED";
    }
    log.push(`engines: ${JSON.stringify(engineOk)}`);
    if (allowed) {
      sources.worldSearch = "OK";
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
          // The world pulse: the same English phrase in three more markets and on YouTube (US).
          const by = { us: world };
          for (const m of WORLD_MARKETS.filter((x) => x.id !== "us" && !x.engine)) { by[m.id] = await suggestCount(c.en, { hl: "en", gl: m.gl }, fetchImpl); await pause(politeMs); }
          // China (Baidu) and Korea (Naver), in their own language, only where their robots.txt allows.
          const echoLists = { en: [], zh: [], ko: [] };
          for (const m of WORLD_MARKETS.filter((x) => x.engine && engineOk[x.engine])) {
            const q = m.engine === "baidu" ? c.zh : c.ko;
            if (!q) continue;
            try {
              const got = await getText(ENGINES[m.engine].url(q), fetchImpl);
              const list = got.status === 200 ? parseEngine(m.engine, got.text) : null;
              by[m.id] = list ? cjkExtensions(q, list) : null;
              if (list) { echoLists[m.engine === "baidu" ? "zh" : "ko"] = list; keep(meter, `engine_${m.engine}`); }
            } catch { by[m.id] = null; }
            await pause(politeMs);
          }
          // The global clock's own countries (worldClock.js): the same English store words, each in the
          // country's own interface language, kept apart from the world pulse. RADAR_CLOCK=0 turns it off.
          const x = {};
          if (env.RADAR_CLOCK !== "0") for (const m of CLOCK_EXTRA) { x[m.id] = await suggestCount(c.en, { hl: m.hl, gl: m.gl }, fetchImpl); await pause(politeMs); }
          const ytWorld = await suggestCount(c.en, { hl: "en", gl: "us", ds: "yt" }, fetchImpl); await pause(politeMs);
          // The social echo (late: the finish line a call is timed against): the US suggestions as text.
          echoLists.en = (await suggestList(c.en, { hl: "en", gl: "us" }, fetchImpl)) || [];
          await pause(politeMs);
          // Kept measurements per source (a valid answer, even with no suggestion, is a measurement: 0).
          keep(meter, "suggest", he.filter((v) => v !== null).length);
          keep(meter, "youtube", yt.filter((v) => v !== null).length + (ytWorld !== null ? 1 : 0));
          keep(meter, "worldSearch", [...Object.entries(by).filter(([id]) => !WORLD_MARKETS.find((m) => m.id === id)?.engine).map(([, v]) => v), ...Object.values(x)].filter((v) => v !== null && v !== undefined).length);
          worldMap[c.id] = addWorld(worldMap[c.id], worldReading({ by, yt: ytWorld, trends: abroadIds[c.id] || [], echo: echoOf(echoLists), x: env.RADAR_CLOCK !== "0" ? x : null }, { now }));
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

  // New listings that start to run (freshRisers.js): per category, the listings sellers title as
  // this year's new items, sorted by recent orders. Their 30-day orders join the item histories, so
  // a small new listing whose orders grow fast shows up as a fresh riser after a few readings.
  let freshPool = readJson(join(dir, "fresh.json"), {});
  if (store && env.RADAR_FRESH !== "0") {
    const started = Date.now();
    const entries = [];
    const areas = [...TREND_CATEGORIES, ...WAVE_AREAS, ...FASHION_AREAS];
    for (const [ai, cat] of areas.entries()) {
      if (Date.now() - started > 100_000) {
        log.push(`fresh: budget over at ${cat.key}`);
        for (const rest of areas.slice(ai)) tallyUnit(scan.fresh, { id: rest.key, code: "budget_over" });
        break;
      }
      try {
        const e = aeEnv(env);
        // The full words first; an empty answer (resp 405) tries the shorter searches (freshQueries).
        let r = null;
        let tried = 0;
        for (const q of freshQueries(cat, now)) {
          tried++;
          const biz = { keywords: q, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC" };
          const res = await aeCall(SEARCH, biz, { env: e, fetchImpl, now });
          r = res?.aliexpress_affiliate_product_query_response?.resp_result;
          if (Number(r?.resp_code) === 200 || Number(r?.resp_code) !== 405) break;
        }
        if (Number(r?.resp_code) !== 200) {
          log.push(`fresh ${cat.key}: resp ${r?.resp_code ?? "none"} after ${tried} searches`);
          tallyUnit(scan.fresh, { id: cat.key, scanned: Number(r?.resp_code) === 405, code: `resp_${r?.resp_code ?? "none"}` });
          continue;
        }
        if (tried > 1) log.push(`fresh ${cat.key}: found with search ${tried}`);
        const raw = r.result?.products?.product;
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        let kept = 0;
        for (const p of list) {
          const entry = freshEntry(p, { category: cat.key, today });
          if (!entry) continue;
          entries.push(entry);
          items[entry.id] = addItemReading(items[entry.id], [today, entry.orders]);
          kept++;
        }
        tallyUnit(scan.fresh, { id: cat.key, scanned: true, withData: list.length > 0, kept });
      } catch (err) { log.push(`fresh ${cat.key}: ${String(err?.message || err).slice(0, 60)}`); tallyUnit(scan.fresh, { id: cat.key, code: codeOf(err) }); }
      await pause(politeMs);
    }
    // Every category in the world (worldCategories.js): AliExpress's whole category tree, a slice a
    // day in rotation. Each category's new listings of the year join the fresh pool; its hot list
    // joins the waves.
    if (env.RADAR_WORLD !== "0") {
      const e = aeEnv(env);
      let world = readJson(join(dir, "world-categories.json"), {});
      if (needsRefresh(world, today)) {
        try {
          const list = categoriesOf(await aeCall(CATEGORY_GET, {}, { env: e, fetchImpl, now }));
          if (list?.length) world = { at: today, list, cursor: Number(world.cursor) || 0 };
        } catch (err) { log.push(`world categories: ${String(err?.message || err).slice(0, 60)}`); }
      }
      const rot = worldSlice(world.list || [], world.cursor);
      const wStarted = Date.now();
      let restRead = 0; // asked, for the rotation's cursor
      let restAnswered = 0; // answered, for today's real pace
      let worldByCategory = 0; // categories read by the category alone (no listing titled new this year)
      let hotFromList = 0; // categories whose hot list was empty, measured by their best sellers instead
      for (const [ci, cat] of rot.slice.entries()) {
        const isRest = !rot.slice.slice(0, rot.fashion).includes(cat);
        if (Date.now() - wStarted > WORLD.budgetMs) {
          log.push(`world: budget over at ${cat.id}`);
          for (const c of rot.slice.slice(ci)) tallyUnit(scan.world, { id: c.id, name: c.name, code: "budget_over" });
          break;
        }
        let stop = false;
        let thrown = false;
        let byCategory = null; // the category's own listings, when its "<year> new" search found none
        try {
          const ask = (keywords) => aeCall(SEARCH, { category_ids: cat.id, ...(keywords ? { keywords } : {}), tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC" }, { env: e, fetchImpl, now });
          let r = (await ask(`${new Date(now).getUTCFullYear()} new`))?.aliexpress_affiliate_product_query_response?.resp_result;
          // An empty answer (405: no listing titled new this year) asks the category alone: its listings
          // join the pool too, and only one the radar saw from under 100 orders is ever called new.
          if (Number(r?.resp_code) === 405) {
            await pause(politeMs);
            const r2 = (await ask(null))?.aliexpress_affiliate_product_query_response?.resp_result;
            if (Number(r2?.resp_code) === 200 || Number(r2?.resp_code) === 405) { r = r2; byCategory = true; worldByCategory++; }
          }
          const code = Number(r?.resp_code);
          const raw = code === 200 ? r.result?.products?.product : null;
          const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
          if (byCategory) byCategory = list;
          // Scanned only on a valid answer: 200 (with or without listings) or 405 (none); any other
          // code is a failed scan, named on the page with its code.
          const scanned = code === 200 || code === 405;
          if (!scanned) log.push(`world ${cat.id}: resp ${r?.resp_code ?? "none"}`);
          let kept = 0;
          for (const p of list) {
            const entry = freshEntry(p, { category: `world-${cat.id}`, today });
            if (!entry) continue;
            entries.push(entry);
            items[entry.id] = addItemReading(items[entry.id], [today, entry.orders]);
            kept++;
          }
          tallyUnit(scan.world, { id: cat.id, name: cat.name, scanned, withData: list.length > 0, kept, code: `resp_${r?.resp_code ?? "none"}` });
          if (scanned && isRest) restAnswered++;
        } catch (err) {
          thrown = true;
          const msg = String(err?.message || err);
          log.push(`world ${cat.id}: ${msg.slice(0, 60)}`);
          tallyUnit(scan.world, { id: cat.id, name: cat.name, code: codeOf(err) });
          // The store's own limit: stop for today, the cursor keeps the place.
          if (/limit|frequen|flow control|isv\.|throttl/i.test(msg)) {
            log.push("world: the store's limit reached, the rest tomorrow");
            for (const c of rot.slice.slice(ci + 1)) tallyUnit(scan.world, { id: c.id, name: c.name, code: "store_limit" });
            stop = true;
          }
        }
        // The cursor moves past what was asked without an exception (as before), so a thrown one is asked again.
        if (isRest && !thrown) restRead++;
        if (stop) break;
        // The category's hot list feeds the waves; its own failure never marks the scan above as failed.
        if (waveLists) {
          try {
            const hot = await aeCall(HOT, { category_ids: cat.id, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC" }, { env: e, fetchImpl, now });
            const hr = hot?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
            const hraw = Number(hr?.resp_code) === 200 ? hr.result?.products?.product : null;
            let hlist = Array.isArray(hraw) ? hraw : hraw ? [hraw] : [];
            // An empty hot list: the category's best sellers by recent orders (the same store numbers).
            if (!hlist.length && Number(hr?.resp_code) === 405) {
              if (Array.isArray(byCategory)) hlist = byCategory;
              else {
                await pause(politeMs);
                const br = (await aeCall(SEARCH, { category_ids: cat.id, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC" }, { env: e, fetchImpl, now }))?.aliexpress_affiliate_product_query_response?.resp_result;
                const braw = Number(br?.resp_code) === 200 ? br.result?.products?.product : null;
                hlist = Array.isArray(braw) ? braw : braw ? [braw] : [];
              }
              if (hlist.length) hotFromList++;
            }
            waveLists[`world-${cat.id}`] = hlist;
          } catch (err) { log.push(`world hot ${cat.id}: ${String(err?.message || err).slice(0, 60)}`); }
        }
        await pause(politeMs);
      }
      if (world.list?.length) {
        const done = rotation(rot.restList, world.cursor, restRead);
        world.cursor = done.next;
        writeFileSync(join(dir, "world-categories.json"), JSON.stringify(world));
      }
      // A full round in days at the pace the store really answered today (null when none answered).
      const restTotal = Math.max(0, rot.total - rot.fashion);
      const roundDays = restAnswered ? Math.ceil(restTotal / restAnswered) : null;
      const w = scan.world;
      sources.world = rot.total ? { categories: rot.total, asked: w.asked, readToday: w.scanned, withItems: w.withData, verified: w.kept, empty: w.scanned - w.withData, failed: w.asked - w.scanned, fashionDaily: rot.fashion, fullRoundDays: roundDays } : "FAILED";
      log.push(`world: ${w.asked} categories asked · ${w.scanned} scanned · ${w.withData} with listings · ${w.kept} kept · ${w.asked - w.scanned} failed (${rot.fashion} fashion every day) · ${worldByCategory} read by the category alone · ${hotFromList} hot lists from the best sellers · ${rot.total} in the tree · at today's pace a full round every ${roundDays ?? "?"} days`);
    }
    freshPool = mergeFreshPool(freshPool, entries, { today });
    // OK only with listings that passed the radar's checks (freshEntry); explicit EMPTY / FAILED otherwise.
    sources.fresh = entries.length ? "OK" : scan.fresh.scanned + scan.world.scanned ? "EMPTY" : "FAILED";
    log.push(`fresh: ${entries.length} new listings read today · pool ${Object.keys(freshPool).length}`);
  }

  // Items no longer read (not a top item, not on the site) for 45 days are dropped.
  const keepFrom = new Date(now - 45 * 86_400_000).toISOString().slice(0, 10);
  for (const id of Object.keys(items)) if (!(items[id] || []).some((r) => r[0] >= keepFrom)) delete items[id];
  const site = sources.siteProducts === "OK" ? siteHotness(siteProducts, items) : null;
  if (site) log.push(`site hotness: ${JSON.stringify(site.counts)} · hot: ${site.rows.filter((r) => r.state === "HOT").map((r) => `${r.id} ${r.weekPct}%`).join(", ") || "none"}`);
  // The one intelligence object (alpha.js): acceleration shield, Alpha score, lifecycle, the
  // catalog check of every site product (a proposal) and the content briefs (drafts).
  const intel = enrich(buildBoard({ concepts, readings, picks, calls, awareness, items, site, now }), {
    concepts, readings, items, facts, siteProducts: sources.siteProducts === "OK" ? siteProducts : [], events: Array.isArray(clicks) ? clicks : [],
    hooksFor: (p) => buildHookSet(p, { now }).filter((h) => !/₪/.test(h.text)), origin: PRODUCTION_ORIGIN, now,
  });
  const board = intel.board;
  board.sourcesToday = sources;
  // The store words, before the Wikipedia and Bluesky doors below need them (the early-call loop sets
  // them again later; on 21.11 the first real run asked Bluesky about 0 kinds for want of them).
  const enOf = new Map(concepts.map((x) => [x.id, x.en || ""]));
  for (const c of Array.isArray(board.concepts) ? board.concepts : []) if (!c.en) c.en = enOf.get(c.id) || "";
  // When the daily reading really ran (GitHub starts scheduled runs late, 17–20.11: about 9 hours after
  // the 05:37 cron): a scheduled run records its own time, any other run keeps the last one. The page
  // counts down from it, never from the cron.
  board.lastDaily = env.GITHUB_EVENT_NAME === "schedule" ? new Date(now).toISOString() : (typeof prevBoard.lastDaily === "string" ? prevBoard.lastDaily : null);
  board.world = sources.world && typeof sources.world === "object" ? sources.world : null;
  // 📚 Wikipedia attention (wikiSignal.js): every watched kind that has its own article, in English and
  // in Hebrew: this week against last week, the last 30 days, and the history by month since 2016,
  // from Wikimedia's free official Pageviews API. robots.txt first for every host; RADAR_WIKI=0 off.
  if (env.RADAR_WIKI !== "0" && Array.isArray(board.concepts) && board.concepts.length && !late("wikipedia", 150_000)) {
    const wikiState = readJson(join(dir, "wiki.json"), {});
    const getJson = async (url) => {
      const res = await fetchImpl(url, { headers: { "user-agent": WIKI.ua, accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
      return { status: res.status, json: res.ok ? await res.json().catch(() => null) : null };
    };
    const doors = {};
    for (const [k, d] of Object.entries({ summary: WIKI.summary, views: WIKI.views, data: WIKI.data })) {
      try {
        const r = await getRobots(`${d.host}/robots.txt`, fetchImpl);
        doors[k] = r.status === 200 || r.status === 404 || r.status === 410 ? robotsAllows(r.status, r.text, d.path) : "failed";
      } catch { doors[k] = "failed"; }
    }
    const ageDays = (d) => (d ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000 : Infinity);
    let lookups = 0, failed = 0;
    const from = new Date(now - 60 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(now - 86_400_000).toISOString().slice(0, 10);
    if (doors.summary === true) {
      for (const c of board.concepts) {
        if (!c.en || ageDays(wikiState[c.id]?.at) < WIKI.resolveEveryDays) continue;
        if (lookups >= WIKI.maxLookups) break;
        let found = null;
        for (const title of candidateTitles(c.en)) {
          lookups++;
          try {
            const r = await getJson(summaryUrl(title));
            const s = r.status === 200 ? summaryOf(r.json) : null;
            if (s && acceptTitle(c.en, title, s.title)) { found = s; break; }
            if (r.status >= 500 || r.status === 429) failed++;
          } catch { failed++; }
          await pause(politeMs);
        }
        let he = null;
        if (found?.q && doors.data === true) {
          try { const r = await getJson(entityUrl(found.q)); he = r.status === 200 ? hebrewTitleOf(r.json, found.q) : null; } catch { failed++; }
          await pause(politeMs);
        }
        wikiState[c.id] = { at: today, en: found?.title || null, q: found?.q || null, he };
      }
    } else if (doors.views === true) {
      // The lookup's door is closed (en.wikipedia.org disallows /api/): the kind's own full phrase is
      // read straight from the Pageviews API on wikimedia.org (directTitles; the title with the most
      // readers wins, none means no article), and its Hebrew name likewise from he.wikipedia.
      for (const c of board.concepts) {
        if (!c.en || ageDays(wikiState[c.id]?.at) < WIKI.resolveEveryDays) continue;
        if (lookups >= WIKI.maxLookups) break;
        let best = null;
        for (const title of directTitles(c.en)) {
          lookups++;
          try {
            const r = await getJson(viewsUrl("en.wikipedia", title, { from, to }));
            const n = r.status === 200 ? viewsTotal(r.json) : 0;
            if (n > (best?.n || 0)) best = { title, n };
            if (r.status >= 500 || r.status === 429) failed++;
          } catch { failed++; }
          await pause(politeMs);
        }
        let he = null;
        if (best && c.he) {
          lookups++;
          try { const r = await getJson(viewsUrl("he.wikipedia", c.he, { from, to })); he = r.status === 200 && viewsTotal(r.json) > 0 ? c.he : null; } catch { failed++; }
          await pause(politeMs);
        }
        wikiState[c.id] = { at: today, en: best?.title || null, q: null, he, via: "views" };
      }
    }
    const cards = [];
    if (doors.views === true) {
      const lastMonth = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      for (const c of board.concepts) {
        const st = wikiState[c.id];
        if (!st?.en) continue;
        try {
          const a = attentionOf((await getJson(viewsUrl("en.wikipedia", st.en, { from, to }))).json);
          await pause(politeMs);
          const ah = st.he ? attentionOf((await getJson(viewsUrl("he.wikipedia", st.he, { from, to }))).json) : null;
          if (ageDays(st.hAt) >= WIKI.historyEveryDays) {
            const h = historyOf((await getJson(viewsUrl("en.wikipedia", st.en, { from: WIKI.since, to: lastMonth, granularity: "monthly" }))).json);
            if (h) { st.h = h; st.hAt = today; }
          }
          if (a) { keep(meter, "wikipedia"); c.wiki = wikiCard({ en: st.en, he: st.he, a, ah, h: st.h || null }); cards.push(c.wiki); }
        } catch { failed++; }
        await pause(politeMs);
      }
    }
    writeFileSync(join(dir, "wiki.json"), JSON.stringify(wikiState));
    board.wiki = { ...wikiSummary(cards), doors };
    // A door the site's own rules close is CLOSED, never FAILED (21.11: en.wikipedia.org's robots.txt
    // disallows /api/ for every automatic reader, so the radar reads none of it).
    // 22.11: the lookup's closed door no longer closes the source; only the Pageviews door decides.
    sources.wikipedia = doors.views === false ? "ROBOTS_DISALLOW" : doors.views === "failed" ? "FAILED" : cards.length ? "OK" : "FAILED";
    log.push(`wikipedia: robots ${JSON.stringify(doors)} · ${lookups} lookups · ${Object.values(wikiState).filter((s) => s?.en).length} kinds with an article · ${cards.length} read today (${cards.filter((c) => c.he).length} with Hebrew) · ${board.wiki.rising} rising · ${failed} failed · ${cards.filter((c) => c.rising).slice(0, 6).map((c) => `${c.en} +${c.a.weekPct}%`).join(", ") || "none rising"}`);
  }
  // 🗣️ Bluesky's open network and 📢 Meta's Ad Library (socialSignal.js): how many posts name a moving
  // kind this week against the week before, and how many ads for it started in the EU this week (only
  // with the owner's own token). robots.txt first; counts only. RADAR_SOCIAL=0 turns both off.
  if (env.RADAR_SOCIAL !== "0" && Array.isArray(board.concepts) && board.concepts.length && !late("bluesky", 180_000)) {
    const kinds = socialKinds(board.concepts);
    const getJson = async (url) => {
      const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
      return { status: res.status, json: res.ok ? await res.json().catch(() => null) : null };
    };
    let bskyDoor = "failed";
    try { const r = await getRobots(`${SOCIAL.bsky.host}/robots.txt`, fetchImpl); bskyDoor = r.status === 200 || r.status === 404 || r.status === 410 ? robotsAllows(r.status, r.text, SOCIAL.bsky.path) : "failed"; } catch { /* failed */ }
    let heard = 0, bskyFailed = 0;
    const weekMs = 7 * 86_400_000;
    const count = async (phrase, since, until) => {
      let n = 0, cursor = null;
      for (let page = 0; page < SOCIAL.maxPages; page++) {
        const r = await getJson(bskyUrl(phrase, { since, until, cursor }));
        const got = r.status === 200 ? bskyPage(r.json) : null;
        if (!got) return null;
        n += got.n;
        cursor = got.cursor;
        await pause(politeMs);
        if (!cursor || got.n < SOCIAL.pageSize) break;
      }
      return n;
    };
    if (bskyDoor === true) {
      for (const c of kinds) {
        try {
          const week = await count(c.en, now - weekMs, now);
          const prev = week === null ? null : await count(c.en, now - 2 * weekMs, now - weekMs);
          const talk = talkOf(week, prev);
          if (talk) { c.social = { ...(c.social || {}), bsky: talk }; heard++; keep(meter, "bluesky"); } else bskyFailed++;
        } catch { bskyFailed++; }
      }
    }
    sources.bluesky = bskyDoor === "failed" ? "FAILED" : bskyDoor !== true ? "ROBOTS_DISALLOW" : heard ? "OK" : "FAILED";
    log.push(`bluesky: robots ${bskyDoor} · ${kinds.length} moving kinds · ${heard} counted · ${bskyFailed} failed · ${kinds.filter((c) => c.social?.bsky).slice(0, 6).map((c) => `${c.en} ${c.social.bsky.prev}→${c.social.bsky.week}${c.social.bsky.capped ? "+" : ""}`).join(", ") || "none"}`);
    // 📢 Meta's Ad Library: only with the owner's own token (never logged).
    const token = String(env.META_ADLIB_TOKEN || "").trim();
    if (!token) sources.metaAds = "REQUIRES_CONNECTION";
    else {
      let ads = 0, adsFailed = 0;
      for (const c of kinds) {
        try {
          const r = await getJson(adsUrl(c.en, { token, since: now - weekMs }));
          const got = r.status === 200 ? adsPage(r.json) : null;
          if (got) { c.social = { ...(c.social || {}), ads: { week: got.n, more: got.more } }; ads++; keep(meter, "metaAds"); } else adsFailed++;
        } catch { adsFailed++; }
        await pause(politeMs);
      }
      sources.metaAds = ads ? "OK" : "FAILED";
      log.push(`meta ad library: ${ads} kinds counted · ${adsFailed} failed`);
    }
  }
  // 🏪 The shops opening (shopSignal.js; the owner, 22.11: "for every door that closes, ten open"): the
  // free public list of every domain registered in the world each day (WhoisDS; reuse allowed, also
  // commercial; robots.txt read first), counted per watched kind by its own names, and (🔤, no list)
  // by the product words the new shops are named after. Days missing from the state are read back
  // (up to SHOPS_BACK), so the week-against-week comparison starts as soon as the lists exist.
  if (env.RADAR_SHOPS !== "0" && Array.isArray(board.concepts) && board.concepts.length && !late("shops", 180_000)) {
    const dayBack = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
    const yesterday = dayBack(1);
    const kinds = board.concepts.filter((c) => c.id && c.en);
    let shopState = readJson(join(dir, "shops.json"), {});
    let wordState = readJson(join(dir, "shop-words.json"), { days: [], w: {} });
    const vocab = productVocab(Object.values(freshPool || {}).map((e) => e?.title));
    let door = "failed";
    const readDays = [];
    let domainsYesterday = 0;
    try {
      const r = await getRobots("https://www.whoisds.com/robots.txt", fetchImpl);
      door = r.status === 200 || r.status === 404 || r.status === 410 ? robotsAllows(r.status, r.text, "/whois-database/") : "failed";
    } catch { /* counted by the meter */ }
    if (door === true) {
      const have = new Set(wordState.days || []);
      const want = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(dayBack).filter((d, i) => i === 0 || !have.has(d)).slice(0, SHOPS_BACK);
      for (const d of want) {
        try {
          const res = await fetchImpl(nrdUrl(d), { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
          if (!res.ok) continue;
          const tmp = join(tmpdir(), `nrd-${d}.zip`);
          writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
          const domains = execFileSync("unzip", ["-p", tmp], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
          if (domains.length < 1000) continue; // a short or empty file is no reading of the day
          readDays.push(d);
          if (d === yesterday) domainsYesterday = domains.length;
          keep(meter, "shops", domains.length);
          shopState = mergeShops(shopState, shopsToday(domains, kinds), d, kinds.map((c) => c.id));
          if (vocab.size) wordState = mergeShopWords(wordState, wordsToday(domains, vocab), d);
        } catch { /* counted by the meter; a failed day is no zero */ }
      }
    }
    if (readDays.length) {
      writeFileSync(join(dir, "shops.json"), JSON.stringify(shopState));
      writeFileSync(join(dir, "shop-words.json"), JSON.stringify(wordState));
      const last = readDays.slice().sort().pop();
      for (const c of kinds) { const s = shopsOf(shopState[c.id], last); if (s) c.shops = s; }
      const rising = kinds.filter((c) => c.shops?.rising).sort((a, b) => b.shops.week - a.shops.week);
      board.shops = { day: last, domains: domainsYesterday, kinds: kinds.length, withShops: kinds.filter((c) => c.shops?.week > 0).length, rising: rising.length, top: rising.slice(0, SHOPS.top).map((c) => c.id) };
      sources.shops = "OK";
      log.push(`shops: ${readDays.length} daily lists read (${readDays.join(", ")}) · ${domainsYesterday} domains registered on ${yesterday} · ${board.shops.withShops} kinds with new shops this week · rising ${rising.slice(0, 6).map((c) => `${c.id} ${c.shops.prev}→${c.shops.week}`).join(", ") || "none"}`);
      // 🔤 The names the new shops pick (no list): a rising word or pair, a product sellers bet on.
      const known = [...watch, ...discovered].map((c) => String(c.en || "").toLowerCase());
      const skip = (k) => isSeasonal(k) || hasBrandName(k) || isNotListedKind(k) || known.some((en) => en.includes(k));
      const words = risingShopWords(wordState, last, { skip });
      const sCands = [];
      if (!words.measuring) {
        const he = aeEnv(env);
        for (const r of words.rising.filter((x) => x.pair).slice(0, SHOP_WORDS.admit)) {
          try {
            const res = await aeCall(SEARCH, { keywords: r.key, tracking_id: he.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "20", sort: "LAST_VOLUME_DESC" }, { env: he, fetchImpl, now });
            const rr = res?.aliexpress_affiliate_product_query_response?.resp_result;
            if (Number(rr?.resp_code) !== 200) continue;
            const raw = rr.result?.products?.product;
            const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => ({ title: x.product_title, orders: Number(x.lastest_volume) || 0 }));
            const v = haulOnStore(r.key, list);
            if (v.ok) { sCands.push({ en: r.key, kind: "", items: v.items, orders: v.orders, category: "shops", via: "shops" }); r.added = true; }
          } catch (err) { log.push(`shop words ${r.key}: ${String(err?.message || err).slice(0, 60)}`); }
        }
        if (sCands.length) {
          const sBefore = new Set(discovered.map((c) => c.id));
          discovered = admitDiscovered(discovered, sCands, { concepts: watch, stages: stagesBefore, now });
          for (const r of words.rising) if (r.added && !discovered.some((c) => c.en === r.key && !sBefore.has(c.id))) r.added = discovered.some((c) => c.en === r.key);
        }
      }
      board.shopWords = { day: last, days: words.days, vocab: vocab.size, measuring: words.measuring, rising: words.rising };
      log.push(`shop words: ${vocab.size} product words · ${words.days} days of lists · ${words.measuring ? `measuring (a week against the weeks before needs ${SHOP_WORDS.minDays} days)` : `rising ${words.rising.map((r) => `${r.key} ${r.before}→${r.week} (×${r.times})`).join(", ") || "none"} · joined the radar ${words.rising.filter((r) => r.added).map((r) => r.key).join(", ") || "none"}`}`);
    } else {
      sources.shops = door === true || door === "failed" ? "FAILED" : "ROBOTS_DISALLOW";
      log.push(`shops: no list read (${sources.shops})`);
    }
  }

  // 🚢 The factories' shipments (tradeSignal.js; the owner, 22.11: "the biggest factories, where it all
  // starts, not only AliExpress, with no connection"): Eurostat's open customs records, every product
  // line the EU imports from each partner, the last three months against the same three a year earlier.
  // Monthly data: the run asks a small probe for the newest month and the update stamp, and downloads
  // the partners again only when Eurostat published something new.
  if (env.RADAR_TRADE !== "0" && !late("trade", 180_000)) {
    let trade = readJson(join(dir, "trade.json"), null);
    let door = "failed";
    try {
      const r = await getRobots(`${TRADE.host}/robots.txt`, fetchImpl);
      door = r.status === 200 || r.status === 404 || r.status === 410 ? robotsAllows(r.status, r.text, TRADE.path) : "failed";
    } catch { /* counted by the meter */ }
    if (door === true) {
      let probe = null;
      try {
        const res = await fetchImpl(probeUrl(today.slice(0, 7)), { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
        if (res.ok) probe = await res.json();
      } catch { /* counted */ }
      const latest = probe ? latestPeriod(probe) : null;
      const updated = typeof probe?.updated === "string" ? probe.updated : null;
      if (latest && (!trade || trade.latest !== latest || trade.updated !== updated || (trade.partners || []).length < TRADE.partners.length)) {
        const partners = [];
        for (const id of TRADE.partners) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const res = await fetchImpl(tradeUrl(id, latest), { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(180_000) });
              if (res.status === 413) { await new Promise((ok) => setTimeout(ok, 30_000)); continue; } // Eurostat prepares a big answer and asks to come back
              if (!res.ok) break;
              const jumps = tradeJumps(parseComext(await res.json()), latest);
              if (jumps) { partners.push({ id, ...jumps }); keep(meter, "trade", jumps.measured); }
              break;
            } catch { break; }
          }
        }
        if (partners.length) trade = { latest, updated, read: today, months: windowsOf(latest).now, partners };
      }
      if (trade && trade.latest) {
        writeFileSync(join(dir, "trade.json"), JSON.stringify(trade));
        board.trade = trade;
        sources.trade = "OK";
        if (trade.read !== today) keep(meter, "trade", 1); // reused: Eurostat published nothing newer (the probe answered)
        log.push(`trade: EU customs, ${(trade.months || []).join(",")} against a year earlier (Eurostat updated ${trade.updated}, read ${trade.read}) · ${trade.partners.map((p) => `${p.id} ${p.measured} lines, ${p.jumping} doubled (renamed ${p.renamed}, price only ${p.priceOnly})`).join(" · ")} · top ${trade.partners.flatMap((p) => p.top.slice(0, 2).map((r) => `${p.id} ${r.code} +${r.valuePct}%`)).join(", ")}`);
      } else {
        sources.trade = "FAILED";
        log.push(`trade: no customs answer (probe ${probe ? "read, no month" : "failed"})`);
      }
    } else {
      sources.trade = door === "failed" ? "FAILED" : "ROBOTS_DISALLOW";
      log.push(`trade: door ${sources.trade}`);
    }
  }

  // 🌍 The world gap (worldGap.js; the owner, 21.11: "not only the gap in Israel, the gap against the
  // whole world"): Google's public suggestions for the English store words from every country of
  // GAP_COUNTRIES. The watched kinds keep today's 13 countries from the morning reading and get the
  // other 38 here (the moving ones first, the rest in rotation); every new product and new kind about to
  // be shown is read from all of them below (`phraseGap`). robots.txt was read before the first
  // suggestion (sources.suggest). Counts only: no suggestion text is kept. RADAR_GAP=0 turns it off.
  const gapState = readJson(join(dir, "world-gap.json"), {});
  for (const k of ["concepts", "phrases"]) {
    gapState[k] = Object.fromEntries(Object.entries(gapState[k] && typeof gapState[k] === "object" ? gapState[k] : {})
      .filter(([, v]) => v?.d && (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${v.d}T00:00:00Z`)) / 86_400_000 <= GAP.keepDays));
  }
  const gapOn = env.RADAR_GAP !== "0" && sources.suggest === "OK" && !late("worldGap", 8 * 60_000);
  const gapRun = { started: Date.now(), asked: 0, answered: 0, failRun: 0, stopped: false, concepts: 0, phrases: 0 };
  // `withYt`: YouTube's own suggestions from each country too (ds=yt; the radar's finds).
  const sweepCountries = async (phrase, ids, { withYt = false } = {}) => {
    const counts = {};
    const yt = {};
    const echo = [];
    const jobs = ids.flatMap((id) => (withYt ? [[id, false], [id, true]] : [[id, false]]));
    await runPool(jobs.map(([id, isYt]) => async () => {
      if (gapRun.stopped || Date.now() - gapRun.started > GAP.budgetMs) { gapRun.stopped = true; return; }
      gapRun.asked++;
      let facts = null;
      try { facts = suggestFacts(phrase, await suggestList(phrase, isYt ? { hl: "en", gl: id, ds: "yt" } : { hl: "en", gl: id }, fetchImpl)); } catch { facts = null; }
      if (facts) { gapRun.answered++; gapRun.failRun = 0; (isYt ? yt : counts)[id] = facts.n; if (facts.echo && !echo.includes(id)) echo.push(id); }
      else if (++gapRun.failRun >= GAP.maxFailures) gapRun.stopped = true;
      await pause(Math.round(politeMs / 2));
    }), GAP.concurrency);
    if (Object.keys(counts).length) keep(meter, "worldSearch", Object.keys(counts).length);
    if (Object.keys(yt).length) keep(meter, "youtube", Object.keys(yt).length);
    return { counts, yt, echo };
  };
  const israelOf = (gap) => (["ARRIVING", "ARRIVED"].includes(gap?.state) ? true : ["GAP", "QUIET"].includes(gap?.state) ? false : null);
  if (gapOn && Array.isArray(board.concepts)) {
    const extraIds = GAP_EXTRA.map((c) => c.id);
    for (const c of gapSweepOrder(board.concepts, gapState.concepts)) {
      if (gapRun.stopped) break;
      const latest = (worldMap[c.id] || []).at(-1);
      const fresh = latest?.d === today ? latest : null;
      // Today's 13 countries from the morning reading (the clock's own five are kept apart in `x`).
      const core = {};
      for (const x of GAP_CORE) { const v = x.id in (fresh?.x || {}) ? fresh.x[x.id] : fresh?.by?.[x.id]; if (Number.isFinite(v)) core[x.id] = v; }
      const ask = [...GAP_CORE.map((x) => x.id).filter((id) => !(id in core)), ...extraIds];
      const got = await sweepCountries(c.en, ask);
      const usEcho = (fresh?.echo || []).some((k) => k === "tiktok" || k === "amazon") ? ["us"] : [];
      const g = worldGapOf({ counts: { ...core, ...got.counts }, israel: israelOf(c.gap), echo: [...got.echo, ...usEcho], trends: fresh?.trends || [], d: today });
      if (g.state !== "UNMEASURED") { gapState.concepts[c.id] = g; gapRun.concepts++; }
    }
  }
  for (const c of Array.isArray(board.concepts) ? board.concepts : []) { const g = freshGap(gapState.concepts[c.id], today); if (g) c.worldGap = g; }
  // A new product or new kind about to be shown: every country of the world gap (Israel's Hebrew
  // searches need Hebrew words, which a new listing has none of: Israel stays unmeasured for it).
  const phraseGap = async (phrase) => {
    const key = String(phrase || "").toLowerCase().trim();
    if (!gapOn || !key) return null;
    if (gapState.phrases[key]?.d === today) return gapState.phrases[key];
    if (gapRun.stopped || gapRun.phrases >= GAP.maxPhrases) return null;
    gapRun.phrases++;
    const got = await sweepCountries(phrase, GAP_COUNTRIES.filter((x) => x.id !== "il").map((x) => x.id), { withYt: true });
    const g = worldGapOf({ counts: got.counts, yt: got.yt, echo: got.echo, d: today });
    if (g.state === "UNMEASURED") return null;
    gapState.phrases[key] = g;
    return g;
  };

  // 📣 One pool for Telegram and Instagram (channelEngine.js radarPool): the listings HOT on their own
  // measured momentum (≥ +10% a week, ≥ 300 orders), per kind, with how many sellers were compared.
  if (env.RADAR_POOL !== "0") {
    board.pool = radarPool(listingsByKind, (id) => itemMomentum(items[id] || [], { rules: HOT_RULES }), board.concepts, { now });
    log.push(`channel pool: ${board.pool.list.length} hot listings from ${Object.keys(listingsByKind).length} kinds read · ${board.pool.list.slice(0, 6).map((r) => `${r.kind}/${r.id} +${r.weekPct}% (${r.compared} sellers)`).join(", ") || "none"}`);
  }
  // Every candidate must also be unknown (few sellers, no buzz abroad) before it is shown.
  const freshRules = freshBar(freshRecord(readJson(join(dir, "fresh-calls.json"), [])));
  board.fresh = freshRisers(freshPool, items, { rules: { ...freshRules, show: FRESH.checkUpTo } });
  // 🏭 The factories that jump (factorySignal.js): the stores whose new listings run together.
  board.factories = factoryJumps(freshPool, items);
  log.push(`factories: ${board.factories.withShop} new listings carry their store's id · ${board.factories.factories} stores · ${board.factories.jumping} jumping${board.factories.withShop ? "" : " (the store sent no store ids)"} · ${board.factories.top.slice(0, 5).map((r) => `store ${r.shop}: ${r.listings} listings, median +${r.medianWeekPct}%/wk, ${r.ordersBefore}→${r.orders} orders`).join(" | ") || "none"}`);
  board.fresh.strict = freshRules.strict;
  {
    const n = board.fresh.noise || {};
    log.push(`fresh noise check: ${n.tested ?? 0} small listings tested, ${n.fast ?? 0} looked fast, ${n.real ?? 0} beat counting noise (false discoveries held at ${Math.round((n.fdr ?? 0) * 100)}%), ${board.fresh.risers.length} candidates`);
  }
  // ⏳ Every listing count read for a phrase today (new products and new kinds, shown or not): the
  // window clock's data (radarWindow.js).
  const phraseReads = {};
  {
    const checked = [];
    const counts = {};
    let ytSearches = 0;
    sources.youtubeApi = env.YOUTUBE_API_KEY ? "NOT_ASKED" : "REQUIRES_CONNECTION";
    const poolDf = phraseCounts(Object.values(freshPool || {}).map((e) => e?.title));
    for (const r of board.fresh.risers) {
      const phrase = distinctPhrase(r.title, poolDf);
      let similar = null;
      let suggestions = null;
      if (phrase && store) {
        try {
          const e = aeEnv(env);
          const res = await aeCall(SEARCH, { keywords: phrase, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "1" }, { env: e, fetchImpl, now });
          const rr = res?.aliexpress_affiliate_product_query_response?.resp_result;
          if (Number(rr?.resp_code) === 200) similar = Number(rr.result?.total_record_count);
        } catch { /* not read → not shown */ }
      }
      if (phrase && sources.suggest === "OK") {
        try { suggestions = await suggestList(phrase, { hl: "en", gl: "us" }, fetchImpl); } catch { suggestions = null; }
        await pause(politeMs);
      }
      if (phrase && Number.isFinite(similar)) phraseReads[phrase] = similar;
      const known = unknownCheck({ phrase, similar, suggestions });
      // YouTube (official Data API, the owner's own key): already many new videos or views = BUZZ.
      let yt = null;
      if (known.unknown && env.YOUTUBE_API_KEY && ytSearches < YT.maxSearches) {
        ytSearches++;
        try {
          const search = await (await fetchImpl(ytSearchUrl(phrase, { key: env.YOUTUBE_API_KEY, now }), { signal: AbortSignal.timeout(15_000) })).json();
          const ids = ytIdsOf(search);
          const views = ids === null ? null : ids.length ? ytViewsOf(await (await fetchImpl(ytVideosUrl(ids, { key: env.YOUTUBE_API_KEY }), { signal: AbortSignal.timeout(15_000) })).json()) : 0;
          yt = ytSignal({ videos: ids === null ? null : ids.length, views });
          if (yt) keep(meter, "youtubeApi");
        } catch { yt = null; }
        sources.youtubeApi = yt ? "OK" : sources.youtubeApi === "OK" ? "OK" : "FAILED";
      }
      if (known.unknown && yt?.level === "BUZZ") { counts.BUZZ_YT = (counts.BUZZ_YT || 0) + 1; continue; }
      // 🌍 Already searched in half the world's countries, or a buzz word in any of them: known, hidden.
      const world = known.unknown ? await phraseGap(phrase) : null;
      if (world?.state === "KNOWN") { counts.KNOWN_WORLD = (counts.KNOWN_WORLD || 0) + 1; continue; }
      counts[known.reason] = (counts[known.reason] || 0) + 1;
      if (known.unknown) checked.push({ ...r, known: { phrase: known.phrase, similar: known.similar, yt, world } });
    }
    board.fresh.risers = checked.slice(0, FRESH.show);
    log.push(`fresh unknown check: ${JSON.stringify(counts)}`);
  }
  // Waves the radar measures but never sells (brandWaves.js): a brand, character or hacking-tool name
  // on many hot items. Each card: the store's own counts, the listings' weekly change, Google's US
  // suggestions, short YouTube videos this week, Instagram's hashtag (official API, the owner's
  // connection), and the legal alternative. The copy never gets a buy button.
  if (store && waveLists && env.RADAR_WAVES !== "0") {
    const waveState = readJson(join(dir, "waves.json"), {});
    const cards = [];
    const ig = { userId: env.IG_USER_ID, token: env.IG_ACCESS_TOKEN };
    sources.waves = "OK";
    sources.instagram = ig.userId && ig.token ? "NOT_ASKED" : "REQUIRES_CONNECTION";
    let ytN = 0;
    let igN = 0;
    const e = aeEnv(env);
    for (const w of collectWaves(waveLists).slice(0, WAVES.read)) {
      const st = waveState[w.token] && typeof waveState[w.token] === "object" ? waveState[w.token] : { first: today, hist: [] };
      let listings = null;
      try {
        const res = await aeCall(SEARCH, { keywords: w.token, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "1" }, { env: e, fetchImpl, now });
        const rr = res?.aliexpress_affiliate_product_query_response?.resp_result;
        if (Number(rr?.resp_code) === 200 && Number.isFinite(Number(rr.result?.total_record_count))) listings = Number(rr.result.total_record_count);
      } catch { /* not read today */ }
      st.hist = addWaveReading(st.hist, [today, w.items, w.orders, listings]);
      st.seen = today;
      waveState[w.token] = st;
      let buzz = null;
      if (sources.suggest === "OK") {
        try { const s = await suggestList(w.token, { hl: "en", gl: "us" }, fetchImpl); buzz = Array.isArray(s) ? echoOf({ en: s }) : null; } catch { buzz = null; }
        await pause(politeMs);
      }
      let yt = null;
      if (env.YOUTUBE_API_KEY && ytN < WAVES.ytPerDay) {
        ytN++;
        try {
          const search = await (await fetchImpl(ytSearchUrl(w.token, { key: env.YOUTUBE_API_KEY, now, short: true }), { signal: AbortSignal.timeout(15_000) })).json();
          const ids = ytIdsOf(search);
          const views = ids === null ? null : ids.length ? ytViewsOf(await (await fetchImpl(ytVideosUrl(ids, { key: env.YOUTUBE_API_KEY }), { signal: AbortSignal.timeout(15_000) })).json()) : 0;
          yt = ytSignal({ videos: ids === null ? null : ids.length, views });
        } catch { yt = null; }
      }
      let igs = null;
      const tag = igTag(w.token);
      if (sources.instagram !== "REQUIRES_CONNECTION" && tag && igN < WAVES.igPerDay) {
        igN++;
        try {
          const found = await (await fetchImpl(igSearchUrl(tag, ig), { signal: AbortSignal.timeout(15_000) })).json();
          const hid = found?.data?.[0]?.id;
          igs = hid ? igSignal(await (await fetchImpl(igRecentUrl(hid, ig), { signal: AbortSignal.timeout(15_000) })).json(), { now }) : null;
          if (!igs && found?.error?.code) log.push(`instagram hashtag: error ${Number(found.error.code)}`);
        } catch { igs = null; } // never logs the request: it carries the token
        if (igs) keep(meter, "instagram");
        sources.instagram = igs ? "OK" : sources.instagram === "OK" ? "OK" : "FAILED";
      }
      let alt = null;
      if (w.need) {
        try {
          const res = await aeCall(SEARCH, { keywords: w.need, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE", ship_to_country: "IL", page_size: "30", sort: "LAST_VOLUME_DESC" }, { env: e, fetchImpl, now });
          const rr = res?.aliexpress_affiliate_product_query_response?.resp_result;
          const raw = Number(rr?.resp_code) === 200 ? rr.result?.products?.product : null;
          alt = altPick(Array.isArray(raw) ? raw : raw ? [raw] : []);
        } catch { alt = null; }
        // The legal look-alike's own orders join the item histories, so its pace is measured like any
        // listing (the channel engine posts it only with a measured growth that beats the noise).
        if (alt && Number.isFinite(alt.orders)) {
          items[alt.id] = addItemReading(items[alt.id], [today, alt.orders]);
          const m = itemMomentum(items[alt.id], { rules: HOT_RULES });
          alt = { ...alt, state: m.state, weekPct: Number.isFinite(m.weekPct) ? m.weekPct : null, ordersBefore: m.ordersBefore ?? null, from: m.from || null, to: m.to || today };
        }
      }
      cards.push(waveCard(w, { hist: st.hist, firstSeen: st.first, buzz, yt, ig: igs, alt }));
      await pause(politeMs);
    }
    const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - WAVES.keepDays * 86_400_000).toISOString().slice(0, 10);
    for (const [k, v] of Object.entries(waveState)) if (!v?.seen || v.seen < cutoff) delete waveState[k];
    writeFileSync(join(dir, "waves.json"), JSON.stringify(waveState));
    board.waves = { at: today, list: cards.slice(0, WAVES.show) };
    log.push(`waves: ${cards.map((c) => `${c.token} (${c.items} items, ${c.orders} orders${c.alt ? ", alt" : ""})`).join(", ") || "none today"} · youtube ${ytN} · instagram ${sources.instagram}`);
  }
  // The crowd sensor (crowdSensor.js): items checked in the magic button by different people this
  // week (counts only, from the server), with the store's own facts; their orders join the histories.
  if (store && env.AUTOPILOT_SECRET && env.RADAR_CROWD !== "0") {
    try {
      const res = await fetchImpl(env.CROWD_ENDPOINT || "https://vjitiuirqfysexsxdxqx.supabase.co/functions/v1/api/store?mode=radar-board&op=crowd", { headers: { authorization: `Bearer ${env.AUTOPILOT_SECRET}`, origin: "https://likelink2.vercel.app" }, signal: AbortSignal.timeout(30_000) });
      const body = await res.json().catch(() => null);
      const counts = Array.isArray(body?.crowd) ? body.crowd : null;
      if (!counts) throw new Error(`crowd ${res.status}`);
      const cards = [];
      if (counts.length) {
        const e = aeEnv(env);
        const out = await aeCall(DETAIL, { product_ids: counts.slice(0, CROWD.top).map((c) => c.item).join(","), target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: e.ALIEXPRESS_TRACKING_ID }, { env: e, fetchImpl, now });
        const r = out?.aliexpress_affiliate_productdetail_get_response?.resp_result;
        const raw = Number(r?.resp_code) === 200 ? r.result?.products?.product : null;
        const byId = new Map((Array.isArray(raw) ? raw : raw ? [raw] : []).map((p) => [String(p?.product_id || ""), p]));
        for (const c of counts) {
          const p = byId.get(c.item);
          if (!p) continue;
          const v = Number(p.lastest_volume);
          if (Number.isFinite(v)) items[c.item] = addItemReading(items[c.item], [today, v]);
          const card = crowdCard(c, p, { momentum: itemMomentum(items[c.item] || [], { rules: HOT_RULES }) });
          if (card) cards.push(card);
        }
      }
      // What people photographed in the lens this week (kinds only): named by the watch list or the shop's categories.
      const kindName = new Map([...watch.map((c) => [c.id, c.he]), ...TREND_CATEGORIES.map((c) => [`category-${c.key}`, c.he])]);
      const photographed = (Array.isArray(body?.kinds) ? body.kinds : []).filter((k) => kindName.has(k?.kind)).slice(0, CROWD.show).map((k) => ({ id: k.kind, he: kindName.get(k.kind), people: k.people, first: k.first, last: k.last }));
      board.crowd = { at: today, days: CROWD.days, list: cards.slice(0, CROWD.show), kinds: photographed };
      sources.crowd = "OK";
      log.push(`crowd: ${counts.length} items checked by ${CROWD.minPeople}+ people this week · shown ${board.crowd.list.length} · kinds photographed ${photographed.length}`);
    } catch (err) { sources.crowd = "FAILED"; log.push(`crowd: ${String(err?.message || err).slice(0, 60)}`); }
  } else sources.crowd = env.AUTOPILOT_SECRET ? "OFF" : "REQUIRES_CONNECTION";
  // Every open call is read again by its own item number until it is graded — the radar's new products
  // and the yardsticks' picks alike (radarBaseline.js) — so no call waits ungraded because the store's
  // searches stopped returning its listing. The store's own 30-day orders only.
  let baseState = readJson(join(dir, "baseline.json"), { naive: [], random: [] });
  if (store) {
    const openFresh = readJson(join(dir, "fresh-calls.json"), []).filter((c) => !c.result && /^\d{6,20}$/.test(String(c.id))).map((c) => String(c.id));
    const ids = [...new Set([...openFresh, ...baselineOpenIds(baseState)])].filter((id) => (items[id] || []).at(-1)?.[0] !== today).slice(0, 240);
    let read = 0;
    for (let i = 0; i < ids.length; i += 20) {
      try {
        const got = await itemOrders(ids.slice(i, i + 20), { env, fetchImpl, now });
        for (const [id, f] of got) if (Number.isFinite(f.orders)) { items[id] = addItemReading(items[id], [today, f.orders]); read++; }
      } catch (err) { log.push(`open calls ${i}: ${String(err?.message || err).slice(0, 80)}`); }
    }
    keep(meter, "aliexpress", read);
    log.push(`open calls read again by item: ${read} of ${ids.length} without a reading today`);
  }
  // Every riser shown is a public call, graded after 14 days (HIT: orders +50% since), never edited.
  let freshCalls = gradeFresh(readJson(join(dir, "fresh-calls.json"), []), items, today);
  freshCalls = recordFresh(freshCalls, board.fresh.risers, today);
  // Each card says when it was sealed and when it is graded (the call's own dates).
  for (const r of board.fresh.risers) { const c = freshCalls.find((x) => x.id === r.id && !x.result); if (c) { r.called = c.at; r.due = c.due; } }
  board.fresh.record = freshRecord(freshCalls);
  board.fresh.byCategory = byCategory(freshCalls).slice(0, 30);
  board.fresh.recent = freshCalls.filter((c) => c.result).slice(-12).reverse().map((c) => ({ id: c.id, title: c.title, at: c.at, result: c.result, growth: c.growth }));
  writeFileSync(join(dir, "fresh-calls.json"), JSON.stringify(freshCalls));
  log.push(`fresh risers: ${board.fresh.risers.map((r) => `${r.id} +${r.weekPct}% (first read ${r.age?.firstOrders} on ${r.age?.firstDay})`).join(", ") || "none yet"} (tracking ${board.fresh.tracking}) · holiday listings set apart: ${board.fresh.seasonal?.n ?? 0} · already selling at the first reading, not new: ${board.fresh.established?.n ?? 0}${board.fresh.established?.top?.length ? ` (${board.fresh.established.top.map((r) => `${r.id} +${r.weekPct}% from ${r.firstOrders}`).join(", ")})` : ""}`);
  // Every new product the radar ever showed, misses included, sealed in Bitcoin (radarLedger.js):
  // the one book of calls that was not sealed before 17.11.
  const freshText = freshSealText(freshCalls);
  if (freshText) board.fresh.seal = await sealBook({ text: freshText, count: freshText.split("\n").length }, prevBoard.fresh?.seal, "fresh");
  // The kinds found by meaning: each shown kind is a call, graded after 14 days and sealed as its own book.
  if (sources.kinds === "OK" || readJson(join(dir, "kinds-calls.json"), []).length) {
    // Only what nobody heard of yet (the same unknownCheck as the new products): few listings for the
    // kind's name on AliExpress and no tiktok/viral/amazon in Google's US suggestions. A seasonal kind
    // (20.11: "balls tree", Christmas ornaments) has thousands of listings and stays out. A check that
    // could not be read hides the kind. The kinds that pass join the radar as trial concepts (read from
    // the next morning).
    const shownKinds = [];
    const kindCounts = {};
    for (const k of kindsToday.slice(0, KINDS.show * 2)) {
      if (shownKinds.length >= KINDS.show) break;
      let similar = null;
      let suggestions = null;
      if (store) {
        try {
          const e = aeEnv(env);
          const res = await aeCall(SEARCH, { keywords: k.en, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "1" }, { env: e, fetchImpl, now });
          const rr = res?.aliexpress_affiliate_product_query_response?.resp_result;
          if (Number(rr?.resp_code) === 200) similar = Number(rr.result?.total_record_count);
        } catch { /* not read → not shown */ }
      }
      if (sources.suggest === "OK") {
        try { suggestions = await suggestList(k.en, { hl: "en", gl: "us" }, fetchImpl); } catch { suggestions = null; }
        await pause(politeMs);
      }
      if (Number.isFinite(similar)) phraseReads[k.en] = similar;
      const known = unknownCheck({ phrase: k.en, similar, suggestions });
      const world = known.unknown ? await phraseGap(k.en) : null;
      if (world?.state === "KNOWN") { kindCounts.KNOWN_WORLD = (kindCounts.KNOWN_WORLD || 0) + 1; continue; }
      kindCounts[known.reason] = (kindCounts[known.reason] || 0) + 1;
      if (known.unknown) shownKinds.push({ ...k, known: { similar: known.similar, world } });
    }
    log.push(`kinds unknown check: ${JSON.stringify(kindCounts)}`);
    if (shownKinds.length) {
      const kBefore = new Set(discovered.map((c) => c.id));
      discovered = admitDiscovered(discovered, kindCandidates(shownKinds), { concepts: watch, stages: stagesBefore, now });
      log.push(`kinds joined as trial concepts: ${discovered.filter((c) => !kBefore.has(c.id)).map((c) => c.en).join(", ") || "none (trial list full or already tracked)"}`);
    }
    let kindCalls = gradeKinds(readJson(join(dir, "kinds-calls.json"), []), items, today);
    kindCalls = recordKinds(kindCalls, shownKinds, today);
    for (const k of shownKinds) { const c = kindCalls.find((x) => x.en === k.en && !x.result); if (c) { k.called = c.at; k.due = c.due; } }
    writeFileSync(join(dir, "kinds-calls.json"), JSON.stringify(kindCalls));
    board.kinds = {
      model: KINDS.model, tracked: kindVectors, list: shownKinds.map(({ bases, ...k }) => k), record: kindsRecord(kindCalls),
      recent: kindCalls.filter((c) => c.result).slice(-12).reverse().map((c) => ({ en: c.en, at: c.at, members: Object.keys(c.bases || {}).length, result: c.result, growth: c.growth })),
    };
    const kindsText = kindsSealText(kindCalls);
    if (kindsText) board.kinds.seal = await sealBook({ text: kindsText, count: kindsText.split("\n").length }, prevBoard.kinds?.seal, "kinds");
    log.push(`kinds: ${shownKinds.length} shown · record ${JSON.stringify(board.kinds.record)}`);
  }
  // 🌍 The world gap's state and the day's summary.
  writeFileSync(join(dir, "world-gap.json"), JSON.stringify(gapState));
  {
    const todays = [...(board.concepts || []).map((c) => c.worldGap), ...(board.fresh?.risers || []).map((r) => r.known?.world), ...(board.kinds?.list || []).map((k) => k.known?.world)].filter((g) => g?.d === today);
    board.worldGap = worldGapSummary(todays, { today });
    sources.worldGap = !gapOn ? (env.RADAR_GAP === "0" ? "OFF" : "NOT_ASKED") : todays.length ? "OK" : "FAILED";
    log.push(`world gap: ${GAP_COUNTRIES.length} countries · ${gapRun.concepts} watched kinds + ${gapRun.phrases} new phrases measured · ${gapRun.answered}/${gapRun.asked} answers${gapRun.stopped ? " · stopped (budget or failures)" : ""} · states ${JSON.stringify(board.worldGap.states)} · ${(board.concepts || []).filter((c) => c.worldGap?.d === today && c.worldGap.before).slice(0, 6).map((c) => `${c.id} ${c.worldGap.searched}/${c.worldGap.measured}`).join(", ") || "none before the world"}`);
  }
  // 🧠 The brain (radarBrain.js): what the radar learned from every graded call that recorded its
  // signals the day it was made; for today's risers and kinds, the record of past calls like them.
  // History only, never a forecast; the bar stays as it is. Sealed every day as the book "brain".
  {
    const kindsAll = readJson(join(dir, "kinds-calls.json"), []);
    const brain = learn({ fresh: freshCalls, kinds: kindsAll }, { today });
    for (const r of board.fresh.risers) { const l = likeThis(freshFeatures(r), brain.books.fresh, freshCalls, { book: "fresh", today }); if (l) r.learned = l; }
    for (const k of board.kinds?.list || []) { const l = likeThis(kindFeatures(k), brain.books.kinds, kindsAll, { book: "kinds", today }); if (l) k.learned = l; }
    // 🎯 The sure voice: a pattern frozen the day it is chosen, certified only by calls made after it.
    brain.sure = {
      fresh: sureState(prevBoard.brain?.sure?.fresh, freshCalls, "fresh", { today }),
      kinds: sureState(prevBoard.brain?.sure?.kinds, kindsAll, "kinds", { today }),
    };
    for (const r of board.fresh.risers) if (matchesPattern(freshFeatures(r), brain.sure.fresh, "fresh")) r.sure = brain.sure.fresh.level;
    for (const k of board.kinds?.list || []) if (matchesPattern(kindFeatures(k), brain.sure.kinds, "kinds")) k.sure = brain.sure.kinds.level;
    if (brain.books.fresh.ready) board.fresh.risers.sort((a, b) => (b.sure ?? 0) - (a.sure ?? 0) || (b.learned?.rate ?? -1) - (a.learned?.rate ?? -1) || b.weekPct - a.weekPct);
    board.brain = brain;
    const text = brainText(brain);
    if (text) board.brain.seal = await sealBook({ text, count: text.split("\n").length }, prevBoard.brain?.seal, "brain");
    log.push(`brain v${brain.version}: new products ${brain.books.fresh.graded} graded, ${brain.books.fresh.waiting} waiting · kinds ${brain.books.kinds.graded} graded, ${brain.books.kinds.waiting} waiting · learned ${brain.ready ? "yes" : "not yet"} · sure voice ${["fresh", "kinds"].map((b) => `${b} ${brain.sure[b].key || "none"} ${brain.sure[b].live.hits}/${brain.sure[b].live.n}${brain.sure[b].level ? ` ≥${brain.sure[b].level}%` : ""}`).join(", ")}`);
  }
  // 📐 The proven range (radarPromise.js): a model learned this morning from the radar's own item
  // histories, split conformal widths per size band, and the adaptive level (ACI) moved by every graded
  // range. Ranges for the new products shown and a fixed daily sample of measured items, at 3, 7 and 14
  // days, 80% and 90%; every range issued today is sealed as the book "promise"; every range is graded
  // on its day (HELD inside, never edited) and the coverage record is printed as it is.
  if (env.RADAR_PROMISE !== "0") {
    try {
      const g = gradePromises(readJson(join(dir, "promise.json"), null) || newPromiseState(), items, today);
      const calib = calibrate(items, today, { alphas: g.state.alphas });
      const shown = board.fresh.risers.map((r) => r.id);
      const ids = [...new Set([...shown, ...samplePool(items, today, PROMISE.sample, shown)])];
      const issued = issuePromises(items, ids, today, calib);
      const state = addIssued(g.state, issued);
      writeFileSync(join(dir, "promise.json"), JSON.stringify(state));
      for (const r of board.fresh.risers) { const c = cardRange(items, r.id, today, calib); if (c) r.promise = c; }
      board.promise = promiseBoard(state, calib, issued, today);
      const text = promiseSealText(issued);
      if (text) board.promise.seal = await sealBook({ text, count: text.split("\n").length }, prevBoard.promise?.seal, "promise");
      sources.promise = "OK";
      log.push(`promise: ${PROMISE.horizons.map((h) => `${h}d ${calib[h].state === "READY" ? `ready (${calib[h].n} examples, α90 ${calib[h].q[90].alpha})` : `calibrating ${calib[h].n}/${PROMISE.minCalib}`}`).join(" · ")} · issued ${issued.length} · graded ${g.graded} · set aside ${g.setAside} · coverage ${board.promise.coverage.filter((c) => c.n).map((c) => `${c.h}d@${c.level}: ${c.held}/${c.n}`).join(", ") || "first grades pending"}`);
    } catch (err) { sources.promise = "FAILED"; log.push(`promise: ${String(err?.message || err).slice(0, 80)}`); }
  }
  // ⏳ The window clock (radarWindow.js; the owner, 20.11: "if there are still gaps, rise above
  // everyone"; the tenth check found saturation scores and rules of thumb, and no tool that says how
  // long a product's window stays open): for every find under the radar's own saturation line (2,000
  // matching listings), the calibrated chance the listings are at or above it in 3, 7 and 14 days,
  // from the promise engine's model on the listing counts the radar reads every day (the watch list's
  // concepts and the phrases of the new products and kinds). Sealed as the book "window", graded on
  // its day like a weather forecast (Brier, base rate, skill, said vs happened), never edited.
  let windowCtx = null;
  if (env.RADAR_WINDOW !== "0") {
    try {
      const wfile = join(dir, "window.json");
      const saved = readJson(wfile, null);
      let hist = saved?.hist && typeof saved.hist === "object" ? saved.hist : {};
      // First run: the phrases the new products had on the day they were called (fresh-calls.json f.similar).
      if (!saved) for (const c of freshCalls) { const k = phraseKey(freshPhrase(c.title)); if (k && Number.isFinite(c.f?.similar) && c.at < today) hist = addWindowReading(hist, k, c.at, c.f.similar); }
      const shownKeys = new Set([...(board.fresh.risers || []).map((r) => phraseKey(r.known?.phrase)), ...(board.kinds?.list || []).map((k) => phraseKey(k.en))].filter(Boolean));
      for (const [phrase, n] of Object.entries(phraseReads)) { const k = phraseKey(phrase); if (k) hist = addWindowReading(hist, k, today, n, { shown: shownKeys.has(k) }); }
      // The phrases shown in the last 16 days and those with a chance due: read again (one search each).
      let reread = 0;
      if (store) {
        const e = aeEnv(env);
        for (const k of readQueue(hist, saved?.state, today).slice(0, WINDOW.reads)) {
          try {
            const res = await aeCall(SEARCH, { keywords: phraseOfKey(k), tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "EN", ship_to_country: "IL", page_size: "1" }, { env: e, fetchImpl, now });
            const rr = res?.aliexpress_affiliate_product_query_response?.resp_result;
            if (Number(rr?.resp_code) === 200 && Number.isFinite(Number(rr.result?.total_record_count))) { hist = addWindowReading(hist, k, today, Number(rr.result.total_record_count)); reread++; }
          } catch { /* not read today: its chance waits, then is set aside */ }
        }
      }
      const series = seriesOf({ readings, hist });
      const g = gradeWindows(saved?.state || newWindowState(), series, today);
      const calib = calibrateWindow(series, today);
      windowCtx = { series, calib };
      const keys = [
        ...(board.concepts || []).filter((c) => Number.isFinite(c.today?.listings) && c.today.listings < WINDOW.line).map((c) => conceptKey(c.id)),
        ...Object.entries(hist).filter(([, v]) => v.shown && v.shown >= new Date(Date.parse(today) - WINDOW.trackDays * 86_400_000).toISOString().slice(0, 10)).map(([k]) => k),
      ].filter(Boolean);
      const issued = issueWindows(series, keys, today, calib);
      const state = addWindows(g.state, issued);
      writeFileSync(wfile, JSON.stringify({ hist, state }));
      for (const r of board.fresh.risers || []) { const w = cardWindow(series, phraseKey(r.known?.phrase), today, calib); if (w) r.window = w; }
      for (const k of board.kinds?.list || []) { const w = cardWindow(series, phraseKey(k.en), today, calib); if (w) k.window = w; }
      board.window = windowBoard(state, calib, issued, today);
      const text = windowSealText(issued);
      if (text) board.window.seal = await sealBook({ text, count: text.split("\n").length }, prevBoard.window?.seal, "window");
      sources.window = "OK";
      log.push(`window: ${Object.keys(phraseReads).length} phrases read with the checks, ${reread} read again · ${WINDOW.horizons.map((h) => `${h}d ${board.window.horizons.find((x) => x.h === h).state === "READY" ? `ready (${calib[h].n} examples, ${board.window.horizons.find((x) => x.h === h).small} small)` : `calibrating ${calib[h].n}/${WINDOW.minCalib}, small ${board.window.horizons.find((x) => x.h === h).small}/${WINDOW.minGroup}`}`).join(" · ")} · issued ${issued.length} · graded ${g.graded} · set aside ${g.setAside}`);
    } catch (err) { sources.window = "FAILED"; log.push(`window: ${String(err?.message || err).slice(0, 80)}`); }
  }
  // 🚪 The exit signal (radarCore.js exitSignal; the owner, 20.11: "go around Modalyst and everyone"):
  // every earlier find still in its 14 days, read again today: its orders since the sealed base, its
  // own weekly pace and its window, and one state — still running, slowing, or time to exit.
  {
    const ITEM_ID = /^\d{6,20}$/;
    const dayN = (a) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
    board.fresh.watch = freshCalls
      .filter((c) => !c.result && c.at < today && ITEM_ID.test(String(c.id)) && c.base > 0)
      .slice(-20).reverse()
      .map((c) => {
        const series = items[c.id] || [];
        const last = series.at(-1);
        const momentum = itemMomentum(series, { rules: HOT_RULES });
        const window = windowCtx ? cardWindow(windowCtx.series, phraseKey(freshPhrase(c.title)), today, windowCtx.calib) : null;
        const exit = exitSignal({ momentum, window });
        const pool = freshPool[c.id] || {};
        return {
          id: String(c.id), title: c.title, image: pool.image || null, buy: pool.link || null, price: Number.isFinite(pool.price) ? pool.price : null,
          called: c.at, due: c.due, dayN: dayN(c.at), base: c.base, orders: last ? last[1] : null, on: last ? last[0] : null,
          progress: last ? Math.round(((last[1] - c.base) / c.base) * 1000) / 10 : null,
          weekPct: Number.isFinite(momentum.weekPct) ? momentum.weekPct : null, window, exit: exit.state, why: exit.why,
          category: pool.category || null,
        };
      });
    log.push(`exit signal: ${board.fresh.watch.length} earlier finds · ${JSON.stringify(board.fresh.watch.reduce((t, w) => ({ ...t, [w.exit]: (t[w.exit] || 0) + 1 }), {}))}`);
  }
  // The early calls' own public record, and the bar it sets (signalsNeeded: misses raise it).
  const earlyRecordBefore = trackRecord(calls.filter((x) => x.kind === "early"));
  const need = signalsNeeded(earlyRecordBefore);
  for (const c of board.concepts || []) {
    c.world = worldPulseOf(worldMap[c.id] || []);
    c.early = earlyCall({ world: c.world, stage: c.stage, listings: c.listings, gap: c.gap, need, before: (prevBoard.concepts || []).find((x) => x.id === c.id)?.early, ads: c.social?.ads });
    // A call is saved the day it is made (graded by updateCalls after 14 days like every call).
    const latest = (readings[c.id] || []).at(-1);
    // Only an open EARLY call blocks a new one: a rising concept nearly always has an open stage call
    // (updateCalls), and that must never stop the stronger early call from being sealed.
    if (c.early.level === "CALL" && latest?.sum > 0 && !calls.some((x) => x.concept === c.id && x.kind === "early" && !x.result)) {
      calls.push({ concept: c.id, kind: "early", stage: c.stage, at: today, base: latest.sum, due: new Date(Date.parse(today) + 14 * 86_400_000).toISOString().slice(0, 10), signals: Object.entries(c.early.signals).filter(([, v]) => v).map(([k]) => k) });
      log.push(`EARLY CALL ${c.id}: ${c.early.count}/4 signals`);
    }
    c.en = (concepts.find((x) => x.id === c.id) || {}).en || ""; // the store words, for the find-it-everywhere links
    c.factory = factoryOf(c.listings); // the factory signal: sellers rushing in before buyers
    c.supply = supplyGapOf({ series: c.series, listings: c.listings }); // 🏭 sellers against demand (supplyGap.js)
  }
  board.supply = supplyBoard(board.concepts);
  // 🧭 The path every trend walks (trendPath.js; the owner, 22.11: "check how every product that became
  // a trend started"): where each kind stands today — origin, community, crossing, rush, everyone — with
  // the first day each step was lit (never moved), and what the radar learned from the kinds it watched
  // walk it, observed transitions only (a step already lit at the first reading is never a start).
  if (env.RADAR_PATH !== "0") {
    const via = new Map(concepts.map((x) => [x.id, x.why?.via || null]));
    const withVia = (board.concepts || []).map((c) => ({ ...c, via: via.get(c.id) || null }));
    const pathState = mergePath(readJson(join(dir, "path.json"), {}), withVia, today);
    for (const [i, c] of (board.concepts || []).entries()) c.path = pathCard(withVia[i], pathState[c.id]);
    writeFileSync(join(dir, "path.json"), JSON.stringify(pathState));
    board.path = pathBoard(board.concepts || [], pathState);
    const l = board.path.learned;
    log.push(`path: ${Object.entries(board.path.at).map(([k, n]) => `${k} ${n}`).join(" · ")} · before everyone ${board.path.before} · ${l.kinds} kinds watched, ${l.observedMass} seen reach everyone · ${Object.entries(l.steps).map(([k, v]) => `${k} ${v.reached}/${v.started}${v.ready ? ` (median ${v.medianDays} d)` : ""}`).join(", ")}`);
  }
  // 📦 "Room to make it", sealed and checked (supplyGap.js): every UNDERSUPPLIED kind is a call that
  // sellers will follow, graded after 14 days by its own listings; the BALANCED kinds are the control.
  {
    const latest = {};
    for (const c of board.concepts || []) {
      const l = (Array.isArray(c.listings) ? c.listings : []).filter((r) => Array.isArray(r) && Number.isFinite(Number(r[1]))).at(-1);
      if (l) latest[c.id] = [l[0], Number(l[1])];
    }
    let supplyCalls = gradeSupplyCalls(readJson(join(dir, "supply-calls.json"), []), latest, today);
    supplyCalls = recordSupplyCalls(supplyCalls, board.concepts, today);
    writeFileSync(join(dir, "supply-calls.json"), JSON.stringify(supplyCalls));
    board.supply.record = supplyCallRecord(supplyCalls);
    const supplyText = supplySealText(supplyCalls);
    if (supplyText) board.supply.seal = await sealBook({ text: supplyText, count: supplyText.split("\n").length }, prevBoard.supply?.seal, "supply");
    const r = board.supply.record;
    log.push(`supply calls: ${r.calls} "room to make it" calls · ${r.graded} graded · ${r.followed} followed by new sellers (+${r.followPct}% listings in ${r.gradeDays} days) · control ${r.control.followed}/${r.control.graded} · edge ${r.edge ?? "-"} · next ${r.nextDue || "-"}`);
  }
  log.push(`supply: ${board.supply.measured} kinds measured · ${board.supply.under} under-supplied (demand outruns sellers) · ${board.supply.over} over-supplied · ${board.supply.top.map((id) => { const c = board.concepts.find((x) => x.id === id); return `${id} orders ${c.supply.demandWeekPct}% vs listings ${c.supply.supplyWeekPct}%`; }).join(", ") || "none"}`);
  // "Before everyone", timed: the first day a called concept crosses each public finish line (the
  // networks' buzz, Hebrew searches in Israel, Google's trending searches, many countries) is stamped
  // on its call, so the page can say how many days the call came first.
  calls = stampFirsts(calls, Object.fromEntries((board.concepts || []).map((c) => [c.id, finishLinesOf({ world: c.world, gap: c.gap, ads: c.social?.ads })])), today);
  if (sources.siteProducts === "OK") log.push(`catalog check: ${JSON.stringify(intel.audit.counts)} · kits ready ${intel.briefs.ready}, halted ${intel.briefs.halted} · decisions ${intel.decisions.length}`);
  writeFileSync(join(dir, "readings.json"), JSON.stringify(readings));
  // The sealed envelope: today's fingerprint of every early call so far (calls.json is public on the
  // release, so anyone can recompute it and see that a call was made before the trend).
  const sealText = sealOf(calls);
  const seal = sealText ? { d: today, sha256: createHash("sha256").update(sealText).digest("hex"), count: calls.filter((x) => x.kind === "early").length, text: sealText.length <= 30_000 ? sealText : null, ots: [] } : null;
  // Anchored in Bitcoin (radarSeal.js): only the 32-byte hash goes to the public OpenTimestamps
  // calendars, and only when it changed (an unchanged seal keeps the proofs it already has).
  const prevSeal = prevBoard.early?.seal;
  if (seal && prevSeal?.sha256 === seal.sha256 && Array.isArray(prevSeal.ots) && prevSeal.ots.length) seal.ots = prevSeal.ots, seal.d = prevSeal.d || seal.d;
  else if (seal && env.RADAR_OTS !== "0") {
    for (const cal of OTS_CALENDARS) {
      try {
        const res = await fetchImpl(`${cal}/digest`, { method: "POST", headers: { Accept: "application/vnd.opentimestamps.v1", "Content-Type": "application/x-www-form-urlencoded" }, body: hexBytes(seal.sha256), signal: AbortSignal.timeout(20_000) });
        const proof = res.ok ? otsProof(seal.sha256, new Uint8Array(await res.arrayBuffer())) : null;
        if (proof) seal.ots.push({ cal: new URL(cal).host, b64: toBase64(proof) });
        else log.push(`seal: ${new URL(cal).host} answered ${res.status}`);
      } catch (e) { log.push(`seal: ${new URL(cal).host} ${e?.name || "error"}`); }
    }
    log.push(`seal ${seal.sha256.slice(0, 12)}: ${seal.ots.length}/${OTS_CALENDARS.length} OpenTimestamps proofs`);
  }
  board.early = { need, record: trackRecord(calls.filter((x) => x.kind === "early")), lead: leadOf(calls), ledger: ledgerOf(calls, { latest: Object.fromEntries(Object.entries(readings).map(([id, rs]) => [id, (rs || []).at(-1)?.sum])), today }), calibration: calibrationOf(calls, trackRecord), seal };
  // The global clock (worldClock.js): each concept's arrival day per country, the national lag table,
  // and the sealed "next country" calls (made only once the table has measured lags; graded after 14 days).
  if (env.RADAR_CLOCK !== "0") {
    const clocks = {};
    for (const c of concepts) clocks[c.id] = clockOf(worldMap[c.id] || [], awareness[c.id] || []);
    let nextCalls = gradeNextCalls(readJson(join(dir, "globe-calls.json"), []), clocks, today);
    nextCalls = recordNextCalls(nextCalls, clocks, lagTable(clocks), today);
    writeFileSync(join(dir, "globe-calls.json"), JSON.stringify(nextCalls, null, 1));
    board.globe = globeBoard({ clocks, concepts: concepts.map((c) => ({ id: c.id, he: c.he, en: c.en, zh: c.zh, ko: c.ko, q: (Array.isArray(c.hq) ? c.hq[0] : "") || "" })), calls: nextCalls, today });
    const gText = nextCallsSealText(nextCalls);
    const prevG = prevBoard.globe?.seal;
    if (gText) {
      const gs = { d: today, sha256: createHash("sha256").update(gText).digest("hex"), count: nextCalls.length, text: gText.length <= 30_000 ? gText : null, ots: [] };
      if (prevG?.sha256 === gs.sha256 && Array.isArray(prevG.ots) && prevG.ots.length) gs.ots = prevG.ots, gs.d = prevG.d || gs.d;
      else if (env.RADAR_OTS !== "0") {
        for (const cal of OTS_CALENDARS) {
          try {
            const res = await fetchImpl(`${cal}/digest`, { method: "POST", headers: { Accept: "application/vnd.opentimestamps.v1", "Content-Type": "application/x-www-form-urlencoded" }, body: hexBytes(gs.sha256), signal: AbortSignal.timeout(20_000) });
            const proof = res.ok ? otsProof(gs.sha256, new Uint8Array(await res.arrayBuffer())) : null;
            if (proof) gs.ots.push({ cal: new URL(cal).host, b64: toBase64(proof) });
          } catch { /* the next run tries again */ }
        }
      }
      board.globe.seal = gs;
    }
    const il = board.globe.israel;
    log.push(`globe: ${board.globe.observed} arrivals observed · Israel after the US: ${il.medianDays ?? "-"} days (${il.n} pairs) · next-country calls open ${board.globe.calls.open.length}, graded ${board.globe.calls.graded}`);
  }
  // 🔮 The weekly challenge (radarChallenge.js): four of the radar's own discoveries (fresh risers that
  // passed the unknown check), the radar's choice sealed (only the hash of a salted text is public until
  // grading), graded after 14 days by each item's own orders. RADAR_CHALLENGE=0 turns it off.
  if (env.RADAR_CHALLENGE !== "0") {
    const latest = {
      ...Object.fromEntries(Object.entries(readings).map(([id, rs]) => [id, (rs || []).at(-1)?.sum])),
      ...Object.fromEntries(Object.entries(items || {}).map(([id, rs]) => [id, (Array.isArray(rs) ? rs : []).at(-1)?.[1]])),
    };
    let chs = cancelNotFresh(readJson(join(dir, "challenge.json"), []), today).map((c) => gradeChallenge(c, latest, today));
    if (shouldOpen(chs, today)) {
      const picked = pickFreshOptions(board.fresh?.risers || []);
      if (picked) {
        chs.push(openChallenge(picked, today, randomBytes(16).toString("hex")));
        log.push(`challenge opened: ${picked.options.map((o) => o.concept).join(", ")}`);
      } else log.push(`challenge: ${board.fresh?.risers?.length || 0} of 4 discoveries today, opens on the day the radar finds 4`);
    }
    const seals = readJson(join(dir, "challenge-seals.json"), {});
    for (const c of chs) {
      const sha = createHash("sha256").update(challengeSealText(c)).digest("hex");
      const s0 = seals[c.id]?.sha256 === sha ? seals[c.id] : { d: c.at, sha256: sha, ots: [] };
      if (!s0.ots.length && !c.result && env.RADAR_OTS !== "0") {
        for (const cal of OTS_CALENDARS) {
          try {
            const res = await fetchImpl(`${cal}/digest`, { method: "POST", headers: { Accept: "application/vnd.opentimestamps.v1", "Content-Type": "application/x-www-form-urlencoded" }, body: hexBytes(sha), signal: AbortSignal.timeout(20_000) });
            const proof = res.ok ? otsProof(sha, new Uint8Array(await res.arrayBuffer())) : null;
            if (proof) s0.ots.push({ cal: new URL(cal).host, b64: toBase64(proof) });
          } catch { /* the next run tries again */ }
        }
      }
      seals[c.id] = s0;
    }
    writeFileSync(join(dir, "challenge.json"), JSON.stringify(chs, null, 1));
    writeFileSync(join(dir, "challenge-seals.json"), JSON.stringify(seals));
    board.challenge = challengeBoard(chs, latest, today, seals);
    log.push(`challenge: open ${board.challenge.open?.id || "-"} · graded ${board.challenge.record.graded} (radar hits ${board.challenge.record.radarHits})`);
  }
  // 🏷️ The price ledger: today's prices sealed (SHA-256 of dayText → the OpenTimestamps calendars),
  // so the price before a sale is provable later. The ledger and its seals become public in pack().
  if (prices) {
    PRICE_SINK.ledger = null;
    const priceSeals = readJson(join(dir, "price-seals.json"), {});
    const text = dayText(prices, today);
    if (text) {
      const sha = createHash("sha256").update(text).digest("hex");
      const s0 = priceSeals[today]?.sha256 === sha ? priceSeals[today] : { sha256: sha, n: text.split("\n").length, ots: [] };
      if (!s0.ots.length && env.RADAR_OTS !== "0") {
        for (const cal of OTS_CALENDARS) {
          try {
            const res = await fetchImpl(`${cal}/digest`, { method: "POST", headers: { Accept: "application/vnd.opentimestamps.v1", "Content-Type": "application/x-www-form-urlencoded" }, body: hexBytes(sha), signal: AbortSignal.timeout(20_000) });
            const proof = res.ok ? otsProof(sha, new Uint8Array(await res.arrayBuffer())) : null;
            if (proof) s0.ots.push({ cal: new URL(cal).host, b64: toBase64(proof) });
          } catch { /* the next run of the same day tries again */ }
        }
      }
      priceSeals[today] = s0;
    }
    for (const d of Object.keys(priceSeals).sort().slice(0, -90)) delete priceSeals[d];
    writeFileSync(join(dir, "prices.json"), JSON.stringify(prices));
    writeFileSync(join(dir, "price-seals.json"), JSON.stringify(priceSeals));
    log.push(`prices: ${Object.keys(prices).length} items in the ledger · today ${text ? text.split("\n").length : 0} priced${priceSeals[today] ? ` · sealed ${priceSeals[today].sha256.slice(0, 12)} (${priceSeals[today].ots.length} proofs)` : ""}`);
  }
  writeFileSync(join(dir, "calls.json"), JSON.stringify(calls, null, 1));
  writeFileSync(join(dir, "awareness.json"), JSON.stringify(awareness));
  writeFileSync(join(dir, "world.json"), JSON.stringify(worldMap));
  writeFileSync(join(dir, "discovered.json"), JSON.stringify(discovered, null, 1));
  writeFileSync(join(dir, "items.json"), JSON.stringify(items));
  writeFileSync(join(dir, "fresh.json"), JSON.stringify(freshPool));
  writeFileSync(join(dir, "catalog.json"), JSON.stringify(intel.audit, null, 1));
  writeFileSync(join(dir, "briefs.json"), JSON.stringify(intel.briefs, null, 1));
  writeFileSync(join(dir, "catalog-decisions.json"), JSON.stringify(intel.decisions, null, 1));
  // The root of the complete ledger (radarLedger.js): one line per sealed book — early calls, every
  // new product shown, the next-country calls, today's prices — and one Bitcoin seal over all of it.
  // 🎲 The radar vs luck (radarLuck.js): one kind drawn at random each day from the kinds read today,
  // seeded by the hash of today's sealed store prices (nobody chooses them), graded by the same rule
  // as the radar's calls, in its own sealed book. A day without sealed prices has no draw.
  {
    const priceSha = prices ? readJson(join(dir, "price-seals.json"), {})[today]?.sha256 : null;
    let luck = gradeLuck(readJson(join(dir, "luck.json"), []), readings);
    luck = recordLuck(luck, drawLuck(readings, today, luckSeed(today, priceSha)), today);
    writeFileSync(join(dir, "luck.json"), JSON.stringify(luck, null, 1));
    board.luck = luckBoard(luck, calls, today);
    const luckText = luckSealText(luck);
    if (luckText) board.luck.seal = await sealBook({ text: luckText, count: luckText.split("\n").length }, prevBoard.luck?.seal, "luck");
    const v = board.luck.versus;
    log.push(`luck: today ${board.luck.today ? `${board.luck.today.concept} (1 of ${board.luck.today.pool})` : "no draw (no sealed prices)"} · luck ${v.luck.hits}/${v.luck.graded} · radar ${v.radar.hits}/${v.radar.graded}${v.edge !== null ? ` · edge ${v.edge} pts` : ""}`);
  }
  // 📏 The radar vs the simple ranking and chance (radarBaseline.js; the owner, 26.11, over an outside
  // check: "proof the forecasts beat a random choice or a simple ranking by order growth"): every day,
  // from the radar's own pool of small listings, the 3 growing fastest with none of its checks and 3
  // drawn by the hash of today's sealed prices, graded by the new products' own rule, in their own book.
  if (env.RADAR_BASELINE !== "0") {
    const seals = readJson(join(dir, "price-seals.json"), {});
    const seedOf = (d) => { const t = baselineSeedText(d, seals[d]?.sha256); return t ? createHash("sha256").update(t).digest("hex") : null; };
    baseState = gradeBaseline(baseState, items, today);
    const rebuilt = rebuildDays(baseState, freshCalls, today);
    for (const d of rebuilt) baseState = recordBaseline(baseState, { day: d, pool: baselinePool(freshPool, items, d), seed: seedOf(d), rebuilt: today });
    const pool = baselinePool(freshPool, items, today);
    baseState = recordBaseline(baseState, { day: today, pool, seed: seedOf(today) });
    writeFileSync(join(dir, "baseline.json"), JSON.stringify(baseState));
    board.baseline = baselineBoard(baseState, freshCalls, today);
    const baseText = baselineSealText(baseState);
    if (baseText) board.baseline.seal = await sealBook({ text: baseText, count: baseText.split("\n").length }, prevBoard.baseline?.seal, "baseline");
    const v = board.baseline.versus;
    const ids = (list) => list.map((x) => `${x.id} +${x.weekPct}%`).join(", ") || "none";
    log.push(`baseline: pool ${pool.length} today · simple ranking ${ids(board.baseline.today.naive)} · chance ${board.baseline.today.random.length ? ids(board.baseline.today.random) : "no draw (no sealed prices)"} · rebuilt ${rebuilt.map((d) => `${d} (${baseState.naive.filter((x) => x.at === d).length}+${baseState.random.filter((x) => x.at === d).length})`).join(", ") || "none"} · radar ${v.radar.hits}/${v.radar.graded} · ranking ${v.naive.hits}/${v.naive.graded} · chance ${v.random.hits}/${v.random.graded} · overlap ${v.overlap}${v.edgeNaive !== null ? ` · edge over the ranking ${v.edgeNaive} pts` : ""}${v.edgeRandom !== null ? ` · edge over chance ${v.edgeRandom} pts` : ""}`);
  }
  // Every ordinary stage call too (EMERGING / RISING), misses included: its own book, sealed when it changes.
  const stagesText = stagesSealText(calls);
  if (stagesText) board.stagesSeal = await sealBook({ text: stagesText, count: stagesText.split("\n").length }, prevBoard.stagesSeal, "stages");
  // 📰 Who said it first: the radar or the world's news (newsSignal.js; the owner, 26.11): every sealed
  // call's own phrase against GDELT's open news timeline (no key; robots.txt read first; one request
  // every 5.5 s). The first day the news named it is stamped once; counts per book go on the board.
  if (env.RADAR_NEWS !== "0" && !late("news", 200_000)) {
    const byId = new Map([...watch, ...discovered].map((c) => [c.id, c]));
    const entries = [
      ...calls.map((c) => ({ book: c.kind === "early" ? "early" : "stages", phrase: String(byId.get(c.concept)?.en || "").toLowerCase(), called: c.at })),
      ...freshCalls.map((c) => ({ book: "fresh", phrase: freshPhrase(c.title || ""), called: c.at })),
      ...readJson(join(dir, "kinds-calls.json"), []).map((k) => ({ book: "kinds", phrase: String(k.en || "").toLowerCase(), called: k.at })),
    ].filter((e) => e.phrase && e.called);
    let newsState = readJson(join(dir, "news.json"), {});
    let door = "failed";
    // GDELT's server is slow from some runners (26.11: the 12-second robots read failed with a network
    // error while it answered 404, no rule, elsewhere): a longer wait and one more try.
    for (let attempt = 0; attempt < 2 && door === "failed"; attempt++) {
      try {
        const r = await getRobots(`${NEWS.host}/robots.txt`, fetchImpl, { timeoutMs: 40_000 });
        door = r.status === 200 || r.status === 404 || r.status === 410 ? robotsAllows(r.status, r.text, NEWS.path) : "failed";
      } catch { /* counted by the meter */ }
    }
    let asked = 0, read = 0, failed = 0;
    if (door === true) {
      for (const phrase of newsQueue(entries, newsState, today)) {
        asked++;
        for (let attempt = 0; attempt < 2; attempt++) {
          await new Promise((ok) => setTimeout(ok, NEWS.politeMs));
          try {
            const res = await fetchImpl(newsUrl(phrase), { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(40_000) });
            if (res.status === 429) continue; // asked too soon: wait and ask once more
            if (!res.ok) { failed++; break; }
            const timeline = parseTimeline(JSON.parse(await res.text()));
            if (!timeline) { failed++; break; }
            newsState = mergeNews(newsState, phrase, timeline, today);
            read++;
            keep(meter, "news");
            break;
          } catch { failed++; break; }
        }
      }
      writeFileSync(join(dir, "news.json"), JSON.stringify(newsState));
      board.news = newsBoard(entries, newsState, today);
      sources.news = read || Object.keys(newsState).length ? "OK" : "FAILED";
      const a = board.news.all;
      log.push(`news: ${asked} phrases asked · ${read} read · ${failed} failed · calls ${a.calls}: read ${a.read}, quiet ${a.quiet}, the radar first ${a.ahead}${a.medianAheadDays !== null ? ` (median ${a.medianAheadDays} days ahead)` : ""}, the news first ${a.newsFirst}`);
    } else {
      sources.news = door === "failed" ? "FAILED" : "ROBOTS_DISALLOW";
      log.push(`news: door ${sources.news}`);
    }
  }
  // 🧾 The receipt, taken here (every reading and every book's seal are in it; the root's own seal and
  // the Bitcoin check come after). The page's source states are the run's claims checked against it,
  // the exact text is printed in the public GitHub log and sealed as the book "run".
  {
    // The fourth stage for AliExpress: the distinct items whose reading of today passed the checks and was kept.
    keep(meter, "aliexpress", Object.values(items).filter((series) => (series || []).some((r) => r[0] === today)).length);
    const receipt = receiptOf(meter, { env, started: runStarted, finished: Date.now() });
    board.sourcesToday = measuredStates(sources, receipt);
    // Only a state the receipt really changed is named (21.11: the world's added state field was named as
    // "no real answer" in the log, though all 120 categories answered).
    const changed = Object.keys(sources).filter((k) => typeof sources[k] === "string" && sources[k] !== board.sourcesToday[k]);
    if (changed.length) log.push(`receipt: no real answer for ${changed.map((k) => `${k} (${sources[k]} → ${board.sourcesToday[k]})`).join(", ")}`);
    if (board.sourcesToday.world && typeof board.sourcesToday.world === "object") board.sourcesToday.world = { ...board.sourcesToday.world, state: worldState(board.sourcesToday.world) };
    board.world = board.sourcesToday.world && typeof board.sourcesToday.world === "object" ? board.sourcesToday.world : board.world;
    board.scan = scan;

    const text = receiptText(receipt);
    board.receipt = { ...receipt, seal: text ? await sealBook({ text, count: text.split("\n").length }, null, "run") : null };
    // 📒 The source health registry: this run's receipt joins the last runs' (receipts.json, encrypted state).
    const healthHist = addHealth(readJson(join(dir, "receipts.json"), []), receipt, board.sourcesToday);
    writeFileSync(join(dir, "receipts.json"), JSON.stringify(healthHist));
    board.sourceHealth = healthOf(healthHist, { now });
    log.push(`receipt (sha256 ${board.receipt.seal?.sha256?.slice(0, 12) || "-"}):\n${text}`);
  }
  const rootText = ledgerText({ run: board.receipt?.seal?.sha256, early: board.early?.seal?.sha256, stages: board.stagesSeal?.sha256, luck: board.luck?.seal?.sha256, baseline: board.baseline?.seal?.sha256, fresh: board.fresh?.seal?.sha256, kinds: board.kinds?.seal?.sha256, supply: board.supply?.seal?.sha256, brain: board.brain?.seal?.sha256, promise: board.promise?.seal?.sha256, window: board.window?.seal?.sha256, globe: board.globe?.seal?.sha256, prices: prices ? readJson(join(dir, "price-seals.json"), {})[today]?.sha256 : null });
  if (rootText) {
    board.ledger = await sealBook({ text: rootText, count: rootText.split("\n").length }, prevBoard.ledger, "ledger");
    log.push(`ledger root ${board.ledger.sha256.slice(0, 12)}: ${rootText.split("\n").map((l) => l.split("=")[0]).join(", ")} · ${board.ledger.ots.length}/${OTS_CALENDARS.length} proofs`);
  }
  // ⛓️ From sealed to anchored (otsUpgrade.js; the owner, 20.11): every day's ledger root keeps its
  // proofs in roots.json; each run asks the calendars for the rest of the path of the days not yet
  // anchored (a day's own root reaches Bitcoin within hours, so from the next run), then checks the
  // Merkle root the path arrives at against the block's own at a public explorer. Only a match is
  // shown: "the ledger of <day> is inside Bitcoin block #N", with the complete proof to download.
  {
    const roots = readJson(join(dir, "roots.json"), {});
    if (board.ledger?.sha256 && board.ledger.ots?.length && !roots[board.ledger.d]) roots[board.ledger.d] = { sha256: board.ledger.sha256, ots: board.ledger.ots };
    const sha256 = (b) => new Uint8Array(createHash("sha256").update(b).digest());
    let asked = 0, anchored = 0;
    for (const d of Object.keys(roots).sort()) {
      const r = roots[d];
      if (r.anchor || d >= today || asked >= 7 || env.RADAR_OTS === "0") continue;
      asked++;
      for (const o of r.ots || []) {
        const out = await anchorProof(fromBase64(o.b64), { sha256, fetchImpl, toBase64 });
        r.lastTry = { d: today, state: out.state };
        if (out.state === "ANCHORED") { r.anchor = { height: out.height, block: out.block, time: out.time, cal: o.cal, b64: out.b64 }; anchored++; break; }
      }
    }
    for (const d of Object.keys(roots).sort().slice(0, -120)) delete roots[d];
    writeFileSync(join(dir, "roots.json"), JSON.stringify(roots));
    board.anchors = anchorsBoard(roots);
    const last = board.anchors.list[0];
    log.push(`anchors: ${board.anchors.list.length} days inside Bitcoin${last ? ` (latest ${last.d} in block ${last.height})` : ""} · ${anchored} new today · ${board.anchors.pending} waiting${asked ? ` · asked ${asked}` : ""}`);
  }
  writeFileSync(join(dir, "board.json"), JSON.stringify(board));
  const counts = board.concepts.reduce((m, c) => ((m[c.stage] = (m[c.stage] || 0) + 1), m), {});
  const gapCounts = board.concepts.reduce((m, c) => ((m[c.gap.state] = (m[c.gap.state] || 0) + 1), m), {});
  return { board, log, counts, gapCounts, sources, audit: intel.audit, briefs: intel.briefs };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const dir = process.argv[2] || "radar-state";
  const { log, counts, gapCounts, sources, board } = await run(dir);
  console.log(log.join("\n"));
  console.log("sources (as the run claimed):", JSON.stringify(sources));
  console.log("sources (checked against the receipt):", JSON.stringify(board.sourcesToday));
  console.log("scan:", JSON.stringify(Object.fromEntries(Object.entries(board.scan || {}).map(([k, t]) => [k, { asked: t.asked, scanned: t.scanned, withData: t.withData, kept: t.kept, failed: t.failed.length, empty: (t.empty || []).length }]))));
  console.log("stages:", JSON.stringify(counts), "· israel:", JSON.stringify(gapCounts), "· record:", JSON.stringify(board.record), "· clock:", JSON.stringify(board.clock));
  console.log("rules:", JSON.stringify(RADAR.pickRules));
}
