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
// Pure and import-free: the runner meters and builds it, the board keeps it, the page shows it.

export const RECEIPT = Object.freeze({ v: 1, repo: "hen63165-dotcom/likelink", server: "https://github.com" });

/** Every place the run asks, by host: the public source keys the page already names. */
export const METERED = Object.freeze([
  "aliexpress", "suggest", "youtube", "worldSearch", "trendsIL", "trendsWorld", "youtubeApi", "pinterest", "instagram",
  "engine_baidu", "engine_naver", "site", "seal", "bitcoin", "rules", "other",
]);
export const OUTCOMES = Object.freeze(["answered", "empty", "refused", "failed"]);
export const AE_METHODS = Object.freeze(["product.query", "hotproduct.query", "productdetail.get", "category.get", "order.list", "link.generate"]);

// The countries Google's suggestions are asked from (gl), named for the page.
export const COUNTRY_NAMES = Object.freeze({
  il: ["ישראל", "Israel"], us: ["ארה״ב", "US"], gb: ["בריטניה", "UK"], ca: ["קנדה", "Canada"], au: ["אוסטרליה", "Australia"],
  de: ["גרמניה", "Germany"], fr: ["צרפת", "France"], jp: ["יפן", "Japan"], kr: ["קוריאה", "Korea"], in: ["הודו", "India"],
  es: ["ספרד", "Spain"], it: ["איטליה", "Italy"], br: ["ברזיל", "Brazil"], mx: ["מקסיקו", "Mexico"], cn: ["סין", "China"],
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
  if (host === "graph.facebook.com") return "instagram";
  if (host === "suggestion.baidu.com") return "engine_baidu";
  if (host === "ac.search.naver.com") return "engine_naver";
  if (host.endsWith(".supabase.co") || host === "likelink2.vercel.app") return "site";
  if (host.endsWith(".opentimestamps.org")) return "seal";
  if (host === "mempool.space") return "bitcoin";
  return "other";
}

/** What an AliExpress answer really said: the store answers HTTP 200 for its own errors too. */
export function aeOutcome(json) {
  if (!json || typeof json !== "object") return "failed";
  if (json.error_response) return "refused";
  const key = Object.keys(json).find((k) => k.endsWith("_response"));
  const r = key ? json[key]?.resp_result : null;
  const code = Number(r?.resp_code);
  if (code === 200) return "answered";
  if (code === 405) return "empty";
  return "refused";
}

/** An HTTP status → outcome for every other host (2xx answered, 3xx/4xx refused, 5xx failed). */
export const httpOutcome = (status) => (status >= 200 && status < 300 ? "answered" : status >= 300 && status < 500 ? "refused" : "failed");

export const newMeter = () => ({ counts: {} });

/** Counts one request's outcome (with the AliExpress method and the Google country when known). */
export function note(meter, key, outcome, { method = null, country = null } = {}) {
  if (!meter || !METERED.includes(key) || !OUTCOMES.includes(outcome)) return;
  const c = (meter.counts[key] ||= { asked: 0, answered: 0, empty: 0, refused: 0, failed: 0 });
  c.asked++;
  c[outcome]++;
  if (method && AE_METHODS.includes(method)) {
    const m = ((c.methods ||= {})[method] ||= { asked: 0, answered: 0, empty: 0, refused: 0, failed: 0 });
    m.asked++;
    m[outcome]++;
  }
  if (country && /^[a-z]{2}$/.test(country) && outcome === "answered") (c.countries ||= new Set()).add(country);
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
    try { res = await fetchImpl(url, init); } catch (err) { note(meter, key, "failed", { method, country }); throw err; }
    let outcome = httpOutcome(Number(res?.status) || 0);
    if (key === "aliexpress" && outcome === "answered") {
      if (typeof res.clone === "function") { try { outcome = aeOutcome(JSON.parse(await res.clone().text())); } catch { outcome = "failed"; } }
    }
    note(meter, key, outcome, { method, country });
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

/** The receipt: when the run asked, who ran it, and every source's counted answers. */
export function receiptOf(meter, { env = {}, started, finished } = {}) {
  const sources = {};
  for (const key of METERED) {
    const c = meter?.counts?.[key];
    if (!c || !c.asked) continue;
    const row = cleanCounts(c);
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
 * the run, one per source, one per AliExpress method, one with the countries that answered.
 */
export function receiptText(receipt) {
  if (!receipt?.started) return null;
  const r = receipt.run;
  const lines = [`run|${r ? `${r.id}|${r.attempt}|${r.sha || "-"}|${r.event || "-"}` : "local|-|-|-"}|${receipt.started}|${receipt.finished || "-"}`];
  for (const key of METERED) {
    const c = receipt.sources?.[key];
    if (!c) continue;
    lines.push(`${key}|${c.asked}|${c.answered}|${c.empty}|${c.refused}|${c.failed}`);
    for (const m of AE_METHODS) if (c.methods?.[m]) { const x = c.methods[m]; lines.push(`${key}.${m}|${x.asked}|${x.answered}|${x.empty}|${x.refused}|${x.failed}`); }
    if (c.countries?.length) lines.push(`${key}.countries|${c.countries.join(",")}`);
  }
  return lines.join("\n");
}

// The run's own source states, each tied to the host whose answers it rests on.
const RESTS_ON = Object.freeze({
  aliexpress: "aliexpress", world: "aliexpress", fresh: "aliexpress", discovery: "aliexpress", waves: "aliexpress",
  suggest: "suggest", youtube: "youtube", worldSearch: "worldSearch", trendsIL: "trendsIL", trendsWorld: "trendsWorld", trendsDiscovery: "trendsWorld",
  youtubeApi: "youtubeApi", pinterest: "pinterest", instagram: "instagram", engine_baidu: "engine_baidu", engine_naver: "engine_naver",
  siteVisitors: "site", siteProducts: "site", crowd: "site",
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
    const ok = k === "world" ? v && typeof v === "object" && v.readToday > 0 : v === "OK";
    if (!host || !ok) { out[k] = v; continue; }
    out[k] = c?.answered ? v : c?.asked ? "FAILED" : "NOT_ASKED";
  }
  return out;
}

/** The receipt as the board keeps it: only known keys, whole counts, a strict run link. */
export function cleanReceipt(doc) {
  if (!doc || typeof doc !== "object" || !ISO.test(String(doc.started || ""))) return null;
  const sources = {};
  for (const key of METERED) {
    const c = doc.sources?.[key];
    if (!c || typeof c !== "object") continue;
    const row = cleanCounts(c);
    if (!row.asked) continue;
    if (c.methods && typeof c.methods === "object") {
      const m = Object.fromEntries(AE_METHODS.filter((x) => c.methods[x]).map((x) => [x, cleanCounts(c.methods[x])]));
      if (Object.keys(m).length) row.methods = m;
    }
    if (Array.isArray(c.countries)) { const cs = c.countries.filter((x) => Object.hasOwn(COUNTRY_NAMES, x)).slice(0, 20); if (cs.length) row.countries = cs; }
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
