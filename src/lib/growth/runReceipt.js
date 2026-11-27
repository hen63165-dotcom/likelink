// 🧾 The run receipt (the owner, 2026-11-21: "the transparency area must show real data from actual
// runs, never numbers the system shows by itself when the scan did not happen").
//
// Trend tools say what they track ("over a million trends", "hundreds of millions of items") and
// nobody can check it. The radar shows what it really asked this morning, and three witnesses hold it:
//   1. The meter. Every request the run sends goes through ONE wrapper around fetch, which counts what
//      came back: answered with data / answered empty / refused / failed. A source is "read" only when
//      the meter saw a real answer from its host, so no code path can mark a source read without one
//      (the audit of 21.11 found three that did: AliExpress was "OK" once the keys existed, Google's
//      search "OK" from its robots.txt, and a world category "read" even when the store answered an
//      error).
//   2. GitHub. The run's id, the exact commit that ran and the link to its public log, where the same
//      receipt is printed line by line by GitHub's own runner, with GitHub's own timestamps.
//   3. Bitcoin. The receipt's exact text is a book of the daily sealed root (book "run"), so the
//      numbers cannot be changed after the morning they were read.
// Pure (it imports only the world gap's country names): the runner meters and builds it, the board
// keeps it, the page shows it.

import { GAP_EXTRA } from "./worldGap.js";

export const RECEIPT = Object.freeze({ v: 1, repo: "hen63165-dotcom/likelink", server: "https://github.com" });

/** Every place the run asks, by host: the public source keys the page already names. */
export const METERED = Object.freeze([
  "aliexpress", "suggest", "youtube", "worldSearch", "trendsIL", "trendsWorld", "youtubeApi", "pinterest", "instagram",
  "engine_baidu", "engine_naver", "wikipedia", "bluesky", "metaAds", "shops", "trade", "tradeUs", "news", "site", "seal", "bitcoin", "rules", "other",
]);
export const OUTCOMES = Object.freeze(["answered", "empty", "refused", "failed"]);
export const AE_METHODS = Object.freeze(["product.query", "hotproduct.query", "productdetail.get", "category.get", "order.list", "link.generate"]);

// The countries Google's suggestions are asked from (gl), named for the page.
export const COUNTRY_NAMES = Object.freeze({
  il: ["ישראל", "Israel"], us: ["ארה״ב", "US"], gb: ["בריטניה", "UK"], ca: ["קנדה", "Canada"], au: ["אוסטרליה", "Australia"],
  de: ["גרמניה", "Germany"], fr: ["צרפת", "France"], jp: ["יפן", "Japan"], kr: ["קוריאה", "Korea"], in: ["הודו", "India"],
  es: ["ספרד", "Spain"], it: ["איטליה", "Italy"], br: ["ברזיל", "Brazil"], mx: ["מקסיקו", "Mexico"], cn: ["סין", "China"],
  // The world gap's own countries (worldGap.js).
  ...Object.fromEntries(GAP_EXTRA.map((c) => [c.id, [c.he, c.en]])),
});

/** The source a request belongs to, from its address alone (null for no address). */
export function sourceOf(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (u.pathname === "/robots.txt") return "rules";
  if (host === "api-sg.aliexpress.com") return "aliexpress";
  if (host === "suggestqueries.google.com") return u.searchParams.get("ds") === "yt" ? "youtube" : String(u.searchParams.get("gl") || "").toLowerCase() === "il" ? "suggest" : "worldSearch";
  if (host === "trends.google.com") return String(u.searchParams.get("geo") || "").toUpperCase() === "IL" ? "trendsIL" : "trendsWorld";
  if (host === "www.googleapis.com" && u.pathname.startsWith("/youtube/")) return "youtubeApi";
  if (host === "api.pinterest.com") return "pinterest";
  if (host === "graph.facebook.com") return u.pathname.includes("/ads_archive") ? "metaAds" : "instagram";
  if (host === "api.bsky.app" || host === "public.api.bsky.app") return "bluesky";
  if (host === "www.whoisds.com") return "shops";
  if (host === "ec.europa.eu" && u.pathname.startsWith("/eurostat/")) return "trade";
  if (host === "api.census.gov" && u.pathname.startsWith("/data/timeseries/intltrade/")) return "tradeUs";
  if (host === "api.gdeltproject.org") return "news";
  if (host === "suggestion.baidu.com") return "engine_baidu";
  if (host === "ac.search.naver.com") return "engine_naver";
  if (host.endsWith(".supabase.co") || host === "likelink2.vercel.app") return "site";
  if (host.endsWith(".opentimestamps.org")) return "seal";
  if (host === "mempool.space") return "bitcoin";
  if (host === "wikimedia.org" || host.endsWith(".wikipedia.org") || host === "www.wikidata.org") return "wikipedia";
  return "other";
}

/** What an AliExpress answer really said: the store answers HTTP 200 for its own errors too. */
export function aeOutcome(json) {
  return aeAnswer(json).outcome;
}

/** Some non-empty list anywhere in a parsed answer (to depth 5). */
export function hasList(v, depth = 0) {
  if (Array.isArray(v)) return v.length > 0;
  if (!v || typeof v !== "object" || depth > 5) return false;
  return Object.values(v).some((x) => hasList(x, depth + 1));
}
const anyArray = (v, depth = 0) => Array.isArray(v) || (Boolean(v) && typeof v === "object" && depth <= 5 && Object.values(v).some((x) => anyArray(x, depth + 1)));
/** Whether a parsed JSON answer carries data: its lists decide; an answer with no list, its fields. */
export function hasData(j) {
  if (anyArray(j)) return hasList(j);
  return Boolean(j) && typeof j === "object" && Object.values(j).some((x) => x !== null && x !== "" && x !== undefined && x !== false);
}

/**
 * An AliExpress answer, read the store's way: HTTP 200 carries its own errors. 200 with listings →
 * answered; 200 without any, or 405 → empty; any other code or an error_response → refused, with
 * its code (resp_<code> / err_<code>) so the page names the error.
 */
export function aeAnswer(json) {
  if (!json || typeof json !== "object") return { outcome: "failed", code: "bad_body" };
  if (json.error_response) return { outcome: "refused", code: `err_${String(json.error_response.code || "unknown").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 30)}` };
  const key = Object.keys(json).find((k) => k.endsWith("_response"));
  const r = key ? json[key]?.resp_result : null;
  const code = Number(r?.resp_code);
  if (code === 200) return hasList(r?.result) ? { outcome: "answered", code: null } : { outcome: "empty", code: "no_items" };
  if (code === 405) return { outcome: "empty", code: "resp_405" };
  return { outcome: "refused", code: Number.isFinite(code) ? `resp_${code}` : "no_result" };
}

/**
 * Every other host's answer, from its own body: a suggestion list, an RSS feed, a JSON answer. An
 * answer the radar cannot read is a failure (bad_body), never a success.
 */
export function bodyAnswer(key, text) {
  const t = String(text ?? "");
  if (key === "suggest" || key === "worldSearch" || key === "youtube") {
    try { const j = JSON.parse(t); return Array.isArray(j) && Array.isArray(j[1]) ? { outcome: j[1].length ? "answered" : "empty", code: j[1].length ? null : "no_suggestions" } : { outcome: "failed", code: "bad_body" }; } catch { return { outcome: "failed", code: "bad_body" }; }
  }
  if (key === "trendsIL" || key === "trendsWorld") return /<item[\s>]/.test(t) ? { outcome: "answered", code: null } : /<rss|<channel/.test(t) ? { outcome: "empty", code: "no_items" } : { outcome: "failed", code: "bad_body" };
  if (key === "engine_baidu" || key === "engine_naver") return t.trim() ? { outcome: "answered", code: null } : { outcome: "empty", code: "empty_body" };
  if (key === "rules") return { outcome: "answered", code: null };
  if (key === "seal" || key === "bitcoin") return { outcome: "answered", code: null };
  // A web page where data was asked is a refusal (27.11: api.census.gov's "Missing Key" page came with 200).
  if (/^\s*<(?:!doctype\s+html|html)[\s>]/i.test(t)) return { outcome: "refused", code: /<title>\s*(?:Missing|Invalid) Key/i.test(t) ? "missing_key" : "html_page" };
  try { const j = JSON.parse(t); return hasData(j) ? { outcome: "answered", code: null } : { outcome: "empty", code: "no_rows" }; } catch { return t.trim() ? { outcome: "answered", code: null } : { outcome: "empty", code: "empty_body" }; }
}

/** An HTTP status → outcome for every other host (2xx answered, 3xx/4xx refused, 5xx failed). */
export const httpOutcome = (status) => (status >= 200 && status < 300 ? "answered" : status >= 300 && status < 500 ? "refused" : "failed");

export const newMeter = () => ({ counts: {} });
const CODE = /^[a-z0-9_.-]{2,40}$/i;

/** Counts one request's outcome (with the AliExpress method, the Google country and the error's code). */
export function note(meter, key, outcome, { method = null, country = null, code = null } = {}) {
  if (!meter || !METERED.includes(key) || !OUTCOMES.includes(outcome)) return;
  const c = (meter.counts[key] ||= { asked: 0, answered: 0, empty: 0, refused: 0, failed: 0 });
  c.asked++;
  c[outcome]++;
  if (outcome !== "answered" && code && CODE.test(code)) {
    const codes = (c.codes ||= {});
    if (Object.hasOwn(codes, code) || Object.keys(codes).length < 12) codes[code] = (codes[code] || 0) + 1;
  }
  if (method && AE_METHODS.includes(method)) {
    const m = ((c.methods ||= {})[method] ||= { asked: 0, answered: 0, empty: 0, refused: 0, failed: 0 });
    m.asked++;
    m[outcome]++;
  }
  if (country && /^[a-z]{2}$/.test(country) && outcome === "answered") (c.countries ||= new Set()).add(country);
}

/**
 * The fourth stage: how many units of a source's data passed the radar's own checks and were kept in
 * its history (items, readings, terms). Reported by the run where it keeps them; a source never
 * reported has no kept count (null), never a guessed one.
 */
export function keep(meter, key, n = 1) {
  if (!meter || !METERED.includes(key) || !Number.isFinite(n) || n < 0) return;
  const c = (meter.counts[key] ||= { asked: 0, answered: 0, empty: 0, refused: 0, failed: 0 });
  c.kept = (c.kept || 0) + Math.round(n);
}

const aeMethodOf = (body) => {
  try { return String(new URLSearchParams(String(body || "")).get("method") || "").replace(/^aliexpress\.affiliate\./, "") || null; } catch { return null; }
};

/**
 * fetch, metered: the same answer goes back to the caller, unchanged; the meter only reads a copy
 * (an AliExpress body is read from a clone to see the store's own result code).
 */
export function meterFetch(fetchImpl, meter) {
  return async (url, init) => {
    const href = typeof url === "string" ? url : url?.url || String(url);
    const key = sourceOf(href);
    const method = key === "aliexpress" ? aeMethodOf(init?.body) : null;
    let country = null;
    if (key === "suggest" || key === "worldSearch" || key === "youtube") { try { country = String(new URL(href).searchParams.get("gl") || "").toLowerCase() || null; } catch { /* none */ } }
    let res;
    try { res = await fetchImpl(url, init); } catch (err) {
      note(meter, key, "failed", { method, country, code: /timeout|abort/i.test(String(err?.name || err?.message || "")) ? "timeout" : "network" });
      throw err;
    }
    const status = Number(res?.status) || 0;
    let outcome = httpOutcome(status);
    let code = outcome === "answered" ? null : `http_${status || "none"}`;
    if (key === "rules" && status === 404) { outcome = "empty"; code = "no_rules_file"; }
    // Wikimedia's Pageviews answers 404 for a title with no article (or no views): a valid answer, "none".
    if (key === "wikipedia" && status === 404 && /\/metrics\/pageviews\/per-article\//.test(href)) { outcome = "empty"; code = "no_article"; }
    // A 2xx is a success only when its body says so: read from a copy, the caller gets the original.
    if (outcome === "answered" && key !== "seal" && key !== "bitcoin" && key !== "rules") {
      if (typeof res.clone === "function") {
        try {
          const text = await res.clone().text();
          ({ outcome, code } = key === "aliexpress" ? (() => { try { return aeAnswer(JSON.parse(text)); } catch { return { outcome: "failed", code: "bad_body" }; } })() : bodyAnswer(key, text));
        } catch { outcome = "failed"; code = "bad_body"; }
      } else { outcome = "failed"; code = "unread_body"; }
    }
    note(meter, key, outcome, { method, country, code });
    return res;
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const RUN_URL = /^https:\/\/github\.com\/hen63165-dotcom\/likelink\/actions\/runs\/\d{1,20}$/;

/** The run as GitHub names it (only for this public repository; a local run has none). */
export function runOf(env = {}) {
  const id = String(env.GITHUB_RUN_ID || "");
  if (!/^\d{1,20}$/.test(id) || env.GITHUB_REPOSITORY !== RECEIPT.repo || (env.GITHUB_SERVER_URL || RECEIPT.server) !== RECEIPT.server) return null;
  const sha = /^[0-9a-f]{40}$/.test(String(env.GITHUB_SHA || "")) ? env.GITHUB_SHA : null;
  return {
    id, attempt: /^\d{1,3}$/.test(String(env.GITHUB_RUN_ATTEMPT || "")) ? String(env.GITHUB_RUN_ATTEMPT) : "1",
    event: /^[a-z_]{2,30}$/.test(String(env.GITHUB_EVENT_NAME || "")) ? env.GITHUB_EVENT_NAME : null,
    sha, url: `${RECEIPT.server}/${RECEIPT.repo}/actions/runs/${id}`,
  };
}

const cleanCounts = (c = {}) => Object.fromEntries(["asked", ...OUTCOMES].map((k) => [k, Number.isInteger(c?.[k]) && c[k] >= 0 ? c[k] : 0]));
const cleanCodes = (codes) => {
  if (!codes || typeof codes !== "object") return null;
  const out = Object.fromEntries(Object.entries(codes).filter(([k, v]) => CODE.test(k) && Number.isInteger(v) && v > 0).slice(0, 12));
  return Object.keys(out).length ? out : null;
};
const withExtras = (row, c) => {
  if (Number.isInteger(c?.kept) && c.kept >= 0) row.kept = c.kept;
  const codes = cleanCodes(c?.codes);
  if (codes) row.codes = codes;
  return row;
};

/** The receipt: when the run asked, who ran it, and every source's counted answers. */
export function receiptOf(meter, { env = {}, started, finished } = {}) {
  const sources = {};
  for (const key of METERED) {
    const c = meter?.counts?.[key];
    if (!c || !c.asked) continue;
    const row = withExtras(cleanCounts(c), c);
    if (c.methods) row.methods = Object.fromEntries(AE_METHODS.filter((m) => c.methods[m]).map((m) => [m, cleanCounts(c.methods[m])]));
    if (c.countries?.size) row.countries = [...c.countries].sort();
    sources[key] = row;
  }
  const iso = (t) => (Number.isFinite(t) ? new Date(t).toISOString() : null);
  return { v: RECEIPT.v, started: iso(started), finished: iso(finished), run: runOf(env), sources };
}

/** Totals over the data sources (the seal, Bitcoin and robots.txt are checks, counted apart). */
export function receiptTotals(receipt) {
  const t = { asked: 0, answered: 0, empty: 0, refused: 0, failed: 0 };
  for (const [k, c] of Object.entries(receipt?.sources || {})) {
    if (k === "seal" || k === "bitcoin" || k === "rules") continue;
    for (const f of Object.keys(t)) t[f] += Number(c?.[f]) || 0;
  }
  return t;
}

/**
 * The receipt's exact text (the one sealed in Bitcoin and printed in the public log): one line for
 * the run, one per source (asked|answered with data|answered empty|refused|no answer|kept after the
 * radar's checks, "-" when the run keeps no count for it), one per AliExpress method, the countries
 * that answered and the error codes.
 */
export function receiptText(receipt) {
  if (!receipt?.started) return null;
  const r = receipt.run;
  const lines = [`run|${r ? `${r.id}|${r.attempt}|${r.sha || "-"}|${r.event || "-"}` : "local|-|-|-"}|${receipt.started}|${receipt.finished || "-"}`];
  for (const key of METERED) {
    const c = receipt.sources?.[key];
    if (!c) continue;
    lines.push(`${key}|${c.asked}|${c.answered}|${c.empty}|${c.refused}|${c.failed}|${Number.isInteger(c.kept) ? c.kept : "-"}`);
    for (const m of AE_METHODS) if (c.methods?.[m]) { const x = c.methods[m]; lines.push(`${key}.${m}|${x.asked}|${x.answered}|${x.empty}|${x.refused}|${x.failed}`); }
    if (c.countries?.length) lines.push(`${key}.countries|${c.countries.join(",")}`);
    if (c.codes) lines.push(`${key}.codes|${Object.entries(c.codes).map(([k, v]) => `${k}:${v}`).join(",")}`);
  }
  return lines.join("\n");
}

// The run's own source states, each tied to the host whose answers it rests on.
const RESTS_ON = Object.freeze({
  aliexpress: "aliexpress", world: "aliexpress", fresh: "aliexpress", discovery: "aliexpress", waves: "aliexpress",
  suggest: "suggest", youtube: "youtube", worldSearch: "worldSearch", trendsIL: "trendsIL", trendsWorld: "trendsWorld", trendsDiscovery: "trendsWorld",
  youtubeApi: "youtubeApi", pinterest: "pinterest", instagram: "instagram", engine_baidu: "engine_baidu", engine_naver: "engine_naver",
  siteVisitors: "site", siteProducts: "site", crowd: "site", wikipedia: "wikipedia", bluesky: "bluesky", metaAds: "metaAds",
  worldGap: "worldSearch", hauls: "youtubeApi", shops: "shops", trade: "trade", tradeUs: "tradeUs", news: "news", asia: "worldSearch",
});

/**
 * The run's claimed states, checked against the meter: a source said "OK" whose host gave no real
 * answer this run becomes FAILED (asked, nothing came back) or NOT_ASKED (never asked). The radar's
 * own computations (kinds, promise, window) rest on no host and keep their state.
 */
export function measuredStates(claimed = {}, receipt = {}) {
  const out = {};
  for (const [k, v] of Object.entries(claimed && typeof claimed === "object" ? claimed : {})) {
    const host = RESTS_ON[k];
    const c = host ? receipt?.sources?.[host] : null;
    if (k === "world") { out[k] = v; continue; } // its own four counts decide (worldState)
    if (!host || v !== "OK") { out[k] = v; continue; }
    out[k] = stateOf(c, { own: OWN_KEEP.has(k) });
  }
  return out;
}

// The rows whose kept count is their own (an area sharing the AliExpress host keeps its own state).
const OWN_KEEP = new Set(["aliexpress", "suggest", "youtube", "worldSearch", "trendsIL", "trendsWorld", "youtubeApi", "pinterest", "instagram", "engine_baidu", "engine_naver", "wikipedia", "bluesky", "metaAds"]);

/**
 * One source's state from its counts, the four stages apart: never asked → NOT_ASKED; asked, no
 * valid answer → FAILED; valid answers, all empty → EMPTY; data arrived but none passed the radar's
 * checks → UNUSABLE; data kept → OK. Without a kept count, data that arrived is enough.
 */
export function stateOf(c, { own = true } = {}) {
  if (!c || !c.asked) return own && c?.kept > 0 ? "OK" : "NOT_ASKED";
  const valid = (c.answered || 0) + (c.empty || 0);
  if (!valid) return "FAILED";
  if (!c.answered) return own && c.kept > 0 ? "OK" : "EMPTY";
  if (own && Number.isInteger(c.kept) && c.kept === 0) return "UNUSABLE";
  return "OK";
}

/** The world categories' state from their own four counts (asked, scanned, with listings, kept). */
export function worldState(w) {
  if (!w || typeof w !== "object" || !Number.isFinite(w.asked)) return w && typeof w === "object" && w.readToday > 0 ? "OK" : "FAILED";
  if (!w.asked) return "NOT_ASKED";
  if (!w.readToday) return "FAILED";
  if (!w.withItems) return "EMPTY";
  if (Number.isFinite(w.verified) && !w.verified) return "UNUSABLE";
  return "OK";
}

/**
 * One kind of unit a run scans (watch-list kinds, new-product areas, world categories, site items):
 * the four stages counted apart, and every failed unit named with its code.
 */
export const newTally = () => ({ asked: 0, scanned: 0, withData: 0, kept: 0, failed: [], empty: [] });
export function tallyUnit(t, { id, name = null, scanned = false, withData = false, kept = 0, code = null } = {}) {
  if (!t) return;
  const unit = { id: String(id ?? "").slice(0, 40), ...(name ? { name: String(name).slice(0, 60) } : {}) };
  t.asked++;
  if (scanned) t.scanned++;
  else { t.failedCount = (t.failedCount || 0) + 1; if (t.failed.length < 40) t.failed.push({ ...unit, code: CODE.test(String(code || "")) ? code : "unknown" }); }
  if (scanned && withData) t.withData++;
  else if (scanned) { t.emptyCount = (t.emptyCount || 0) + 1; if ((t.empty ||= []).length < 40) t.empty.push(unit); }
  if (scanned && withData && kept > 0) t.kept++;
}
export const SCAN_UNITS = Object.freeze(["concepts", "fresh", "world", "siteItems"]);
export function cleanScan(doc) {
  if (!doc || typeof doc !== "object") return null;
  const n = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
  const out = {};
  for (const k of SCAN_UNITS) {
    const t = doc[k];
    if (!t || typeof t !== "object" || !Number.isInteger(t.asked)) continue;
    out[k] = {
      asked: n(t.asked), scanned: Math.min(n(t.scanned), n(t.asked)), withData: Math.min(n(t.withData), n(t.scanned)), kept: Math.min(n(t.kept), n(t.withData)),
      failed: (Array.isArray(t.failed) ? t.failed : []).slice(0, 40).map((f) => ({ id: String(f?.id ?? "").replace(/[<>"]/g, "").slice(0, 40), ...(f?.name ? { name: String(f.name).replace(/[<>"]/g, "").slice(0, 60) } : {}), code: CODE.test(String(f?.code || "")) ? f.code : "unknown" })),
      empty: (Array.isArray(t.empty) ? t.empty : []).slice(0, 40).map((f) => ({ id: String(f?.id ?? "").replace(/[<>"]/g, "").slice(0, 40), ...(f?.name ? { name: String(f.name).replace(/[<>"]/g, "").slice(0, 60) } : {}) })),
    };
  }
  return Object.keys(out).length ? out : null;
}

/** The receipt as the board keeps it: only known keys, whole counts, a strict run link. */
export function cleanReceipt(doc) {
  if (!doc || typeof doc !== "object" || !ISO.test(String(doc.started || ""))) return null;
  const sources = {};
  for (const key of METERED) {
    const c = doc.sources?.[key];
    if (!c || typeof c !== "object") continue;
    const row = withExtras(cleanCounts(c), c);
    if (!row.asked && !row.kept) continue;
    if (c.methods && typeof c.methods === "object") {
      const m = Object.fromEntries(AE_METHODS.filter((x) => c.methods[x]).map((x) => [x, cleanCounts(c.methods[x])]));
      if (Object.keys(m).length) row.methods = m;
    }
    if (Array.isArray(c.countries)) { const cs = c.countries.filter((x) => Object.hasOwn(COUNTRY_NAMES, x)).slice(0, 60); if (cs.length) row.countries = cs; }
    sources[key] = row;
  }
  const r = doc.run && typeof doc.run === "object" && RUN_URL.test(String(doc.run.url || "")) && /^\d{1,20}$/.test(String(doc.run.id || "")) ? {
    id: String(doc.run.id), attempt: /^\d{1,3}$/.test(String(doc.run.attempt || "")) ? String(doc.run.attempt) : "1",
    event: /^[a-z_]{2,30}$/.test(String(doc.run.event || "")) ? doc.run.event : null,
    sha: /^[0-9a-f]{40}$/.test(String(doc.run.sha || "")) ? doc.run.sha : null, url: doc.run.url,
  } : null;
  const seal = doc.seal && /^[0-9a-f]{64}$/.test(String(doc.seal.sha256 || "")) && /^\d{4}-\d{2}-\d{2}$/.test(String(doc.seal.d || "")) ? {
    d: doc.seal.d, sha256: doc.seal.sha256, count: Number.isInteger(doc.seal.count) ? doc.seal.count : null,
    text: typeof doc.seal.text === "string" && doc.seal.text.length <= 8000 && /^run\|/.test(doc.seal.text) && !/[<>]/.test(doc.seal.text) ? doc.seal.text : null,
    ots: (Array.isArray(doc.seal.ots) ? doc.seal.ots : []).filter((o) => /^[a-z0-9.-]{3,60}$/.test(String(o?.cal || "")) && typeof o?.b64 === "string" && /^[A-Za-z0-9+/=]{20,20000}$/.test(o.b64)).slice(0, 2).map((o) => ({ cal: o.cal, b64: o.b64 })),
  } : null;
  return { v: 1, started: doc.started, finished: ISO.test(String(doc.finished || "")) ? doc.finished : null, run: r, sources, ...(seal ? { seal } : {}) };
}

/** The countries whose Google suggestions really answered in this run (Israel, YouTube included). */
export function searchCountries(receipt) {
  const all = new Set();
  for (const k of ["suggest", "worldSearch", "youtube"]) for (const c of receipt?.sources?.[k]?.countries || []) all.add(c);
  return [...all].sort();
}

/** The Israel day (YYYY-MM-DD) of a moment: the page says "today" only for today's run. */
export function israelDay(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
/** HH:MM in Israel. */
export function israelTime(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/**
 * 📒 The source health registry (the owner's mission, 21.11, phase 4: "for every source: the last scan
 * attempt, the last valid data, records kept, success rate, errors and blocks, update frequency, data
 * quality, reliability"). Built only from the receipts of real runs, kept in receipts.json (the radar's
 * encrypted state, last HEALTH.keep runs). A source never asked has no row; nothing is filled in.
 *
 * What each source measures, kept apart (phase 4: "searches, views, engagement, demand, sales and sales
 * estimates are never the same metric"): every row names its own measure.
 */
export const HEALTH = Object.freeze({ keep: 30, recent: 7, high: 0.9, medium: 0.6 });
export const MEASURES = Object.freeze({
  aliexpress: { he: "הזמנות ב־30 יום כפי שהחנות מדווחת, מספר מודעות, מחיר", en: "30-day orders as the store reports them, listing counts, price" },
  suggest: { he: "השלמות חיפוש (עניין בחיפוש, בלי נפח)", en: "Search suggestions (search interest, never volume)" },
  youtube: { he: "השלמות חיפוש ביוטיוב", en: "YouTube search suggestions" },
  worldSearch: { he: "השלמות חיפוש במדינות אחרות", en: "Search suggestions abroad" },
  trendsIL: { he: "חיפושים חמים ביום (גוגל)", en: "Daily trending searches (Google)" },
  trendsWorld: { he: "חיפושים חמים ביום (גוגל)", en: "Daily trending searches (Google)" },
  youtubeApi: { he: "מספר סרטונים חדשים וצפיות בהם", en: "New videos and their views" },
  pinterest: { he: "מילים שצומחות בפינטרסט", en: "Growing keywords on Pinterest" },
  instagram: { he: "מספר פוסטים בהאשטג", en: "Posts under a hashtag" },
  engine_baidu: { he: "השלמות חיפוש", en: "Search suggestions" },
  engine_naver: { he: "השלמות חיפוש", en: "Search suggestions" },
  site: { he: "המוצרים והקליקים של LikeLink2 עצמו", en: "LikeLink2's own products and clicks" },
  wikipedia: { he: "קוראים בוויקיפדיה ביום, באנגלית ובעברית, מאז 2016", en: "Daily Wikipedia readers, English and Hebrew, since 2016" },
  bluesky: { he: "פוסטים שמזכירים את הסוג השבוע (רשת פתוחה)", en: "Posts naming the kind this week (an open network)" },
  metaAds: { he: "מודעות שהתחילו השבוע באירופה (ספריית הפרסומות של מטא)", en: "Ads started this week in the EU (Meta Ad Library)" },
});

const DAY = 86_400_000;
const ISO_T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** One run's receipt into the history (newest last, at most HEALTH.keep runs, one entry per run start). */
export function addHealth(history = [], receipt = null, states = {}, { rules = HEALTH } = {}) {
  const list = (Array.isArray(history) ? history : []).filter((h) => ISO_T.test(String(h?.at || "")));
  if (!receipt?.started || !ISO_T.test(receipt.started)) return list.slice(-rules.keep);
  const sources = {};
  for (const [k, c] of Object.entries(receipt.sources || {})) {
    if (!METERED.includes(k) || ["seal", "bitcoin", "rules", "other"].includes(k)) continue;
    sources[k] = { ...cleanCounts(c), ...(Number.isInteger(c.kept) ? { kept: c.kept } : {}), ...(c.codes ? { codes: cleanCodes(c.codes) || undefined } : {}) };
  }
  const entry = { at: receipt.started, run: receipt.run?.id || null, sources, states: Object.fromEntries(Object.entries(states || {}).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v.slice(0, 40)])) };
  return [...list.filter((h) => h.at !== entry.at), entry].sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-rules.keep);
}

/**
 * Each source over the kept runs: when it was last asked, when it last gave valid data, how much it
 * kept last time, its share of valid answers, its errors by code, how often it ran in the last week,
 * and a reliability level from those numbers only (HIGH ≥ 90% valid and data in every recent run it
 * was asked; MEDIUM ≥ 60%; LOW below; MEASURING with fewer than 3 runs).
 */
export function healthOf(history = [], { now = Date.now(), rules = HEALTH } = {}) {
  const list = (Array.isArray(history) ? history : []).filter((h) => ISO_T.test(String(h?.at || "")));
  const keys = [...new Set(list.flatMap((h) => Object.keys(h.sources || {})))];
  const out = {};
  for (const k of keys) {
    const runs = list.filter((h) => h.sources?.[k]?.asked);
    if (!runs.length) continue;
    const sum = (f) => runs.reduce((s, h) => s + (Number(h.sources[k][f]) || 0), 0);
    const asked = sum("asked");
    const valid = sum("answered") + sum("empty");
    const withData = runs.filter((h) => h.sources[k].answered > 0 || h.sources[k].kept > 0);
    const last = runs[runs.length - 1];
    const codes = {};
    for (const h of runs) for (const [c, n] of Object.entries(h.sources[k].codes || {})) codes[c] = (codes[c] || 0) + n;
    const recent = runs.filter((h) => Date.parse(h.at) >= now - rules.recent * DAY);
    const rate = asked ? valid / asked : 0;
    const level = runs.length < 3 ? "MEASURING" : rate >= rules.high && withData.length === runs.length ? "HIGH" : rate >= rules.medium ? "MEDIUM" : "LOW";
    out[k] = {
      runs: runs.length, lastAsked: last.at, lastValid: withData.length ? withData[withData.length - 1].at : null,
      keptLast: Number.isInteger(last.sources[k].kept) ? last.sources[k].kept : null, answeredLast: last.sources[k].answered,
      validRate: Math.round(rate * 1000) / 10, errors: Object.fromEntries(Object.entries(codes).sort((a, b) => b[1] - a[1]).slice(0, 6)),
      runsLastWeek: recent.length, level,
    };
  }
  return { runs: list.length, from: list[0]?.at || null, to: list[list.length - 1]?.at || null, sources: out };
}

/** The health registry as the board keeps it (known sources, whole numbers, ISO times). */
export function cleanHealth(doc) {
  if (!doc || typeof doc !== "object" || !doc.sources || typeof doc.sources !== "object") return null;
  const n = (x) => (Number.isFinite(x) && x >= 0 ? x : null);
  const t = (x) => (ISO_T.test(String(x || "")) ? x : null);
  const sources = {};
  for (const [k, v] of Object.entries(doc.sources)) {
    if (!METERED.includes(k) || !v || typeof v !== "object") continue;
    sources[k] = {
      runs: n(v.runs) ?? 0, lastAsked: t(v.lastAsked), lastValid: t(v.lastValid), keptLast: n(v.keptLast), answeredLast: n(v.answeredLast),
      validRate: n(v.validRate) !== null && v.validRate <= 100 ? v.validRate : null,
      errors: cleanCodes(v.errors) || {}, runsLastWeek: n(v.runsLastWeek) ?? 0,
      level: ["HIGH", "MEDIUM", "LOW", "MEASURING"].includes(v.level) ? v.level : "MEASURING",
    };
  }
  return { runs: n(doc.runs) ?? 0, from: t(doc.from), to: t(doc.to), sources };
}
