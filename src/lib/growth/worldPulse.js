// The radar's world pulse (the owner, 2026-11-15: "the radar must spot trends before they become a
// hit anywhere in the world, not only on AliExpress, and then find them on AliExpress"). Free and
// public sources only, each read once a day and only where its robots.txt allows:
//   - Google's autocomplete in four English-speaking markets (US, UK, Canada, Australia) and
//     YouTube's in the US: is the product's English phrase searched there? (levels, never counts);
//   - Google Trends' daily trending searches in the same four countries: a product phrase in today's
//     trends there is already a hype, and a trending term that sells on AliExpress becomes a new
//     concept on the radar (found in the world first, then on AliExpress).
// SPREADING (more markets search it than two to fourteen days ago) is the early worldwide signal.
// Pure: the radar runner (scripts/catalog/trend-radar.mjs) does the reading.

export const WORLD_MARKETS = Object.freeze([
  Object.freeze({ id: "us", gl: "us", he: "ארה״ב" }),
  Object.freeze({ id: "gb", gl: "gb", he: "בריטניה" }),
  Object.freeze({ id: "ca", gl: "ca", he: "קנדה" }),
  Object.freeze({ id: "au", gl: "au", he: "אוסטרליה" }),
  // Where many product trends start: Japan and Korea (cute, beauty, gadgets), and two big European markets.
  Object.freeze({ id: "jp", gl: "jp", he: "יפן" }),
  Object.freeze({ id: "kr", gl: "kr", he: "קוריאה" }),
  Object.freeze({ id: "de", gl: "de", he: "גרמניה" }),
  Object.freeze({ id: "fr", gl: "fr", he: "צרפת" }),
  // China and Korea through their own search engines, in their own language (concept.zh / .ko),
  // read only while each engine's robots.txt allows its suggestion path.
  Object.freeze({ id: "cn", engine: "baidu", he: "סין (באידו)" }),
  Object.freeze({ id: "krn", engine: "naver", he: "קוריאה (נייבר)" }),
]);

export const ENGINES = Object.freeze({
  baidu: Object.freeze({ host: "https://suggestion.baidu.com", path: "/su", url: (q) => `https://suggestion.baidu.com/su?wd=${encodeURIComponent(q)}&action=opensearch&ie=utf-8` }),
  naver: Object.freeze({ host: "https://ac.search.naver.com", path: "/nx/ac", url: (q) => `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(q)}&q_enc=UTF-8&st=100&r_format=json&r_enc=UTF-8&frm=nv&ans=0` }),
});

/** The suggestions in an engine's answer (pure; tested): Baidu's opensearch [q, [..]], Naver's {items: [[[text], ..]]}. Null when not an answer. */
export function parseEngine(engine, text) {
  try {
    const j = JSON.parse(String(text || ""));
    if (engine === "baidu") return Array.isArray(j) && Array.isArray(j[1]) ? j[1].map(String) : null;
    if (engine === "naver") return Array.isArray(j?.items) ? j.items.flat().map((x) => String(Array.isArray(x) ? x[0] : x)) : null;
  } catch { /* not JSON */ }
  return null;
}

/**
 * The social echo (2026-11-15: TikTok, Douyin and Instagram are closed, so the radar reads their buzz
 * where it lands, in the search engines' own public suggestions). When a product goes viral, people
 * search "<product> tiktok" (Google), "<product> 抖音同款" (Baidu: "as on Douyin") or "<product> 틱톡"
 * (Naver), and the engine starts suggesting it. Which networks echo in one day's suggestions (pure).
 * The echo is LATE by nature (the owner: "if it's on TikTok it was already spotted"): it never counts
 * toward an early call. It is the finish line a call is timed against (`beforeBuzz`, `leadOf`).
 */
export const ECHO = Object.freeze({
  tiktok: /tik\s*tok|viral|trending/i,
  amazon: /amazon/i,
  douyin: /抖音|网红|爆款|小红书/,
  korea: /틱톡|유행|인기|릴스/,
});
export function echoOf({ en = [], zh = [], ko = [] } = {}) {
  const has = (list, re) => (Array.isArray(list) ? list : []).some((x) => re.test(String(x)));
  return ["tiktok", "amazon"].filter((k) => has(en, ECHO[k])).concat(has(zh, ECHO.douyin) ? ["douyin"] : [], has(ko, ECHO.korea) ? ["korea"] : []);
}
const ECHO_HE = { tiktok: "טיקטוק/ויראלי (גוגל)", amazon: "אמזון (גוגל)", douyin: "דואין/להיט (באידו, סין)", korea: "טיקטוק/טרנד (נייבר, קוריאה)" };

/** Suggestions that extend the phrase (spaces ignored; CJK-safe), never the echo itself. */
export function cjkExtensions(phrase, suggestions) {
  if (!Array.isArray(suggestions)) return null;
  const q = String(phrase || "").replace(/\s+/g, "");
  if (!q) return null;
  return new Set(suggestions.map((x) => String(x).replace(/\s+/g, "")).filter((x) => x !== q && x.includes(q))).size;
}
export const TRENDS_GEOS = Object.freeze(["US", "GB", "CA", "AU", "JP", "KR", "DE", "FR", "BR", "IN"]);
export const trendsRssUrl = (geo) => `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
const GEO_HE = { US: "ארה״ב", GB: "בריטניה", CA: "קנדה", AU: "אוסטרליה", JP: "יפן", KR: "קוריאה", DE: "גרמניה", FR: "צרפת", BR: "ברזיל", IN: "הודו" };

export const WORLD = Object.freeze({
  keep: 60, // daily readings per concept
  faint: 1, // completions from which a phrase is searched at all
  aware: 3, // …and from which it is common
  spreadFrom: 2, // a reading at least this many days older is compared…
  spreadTo: 14, // …and at most this many
  minItems: 3, // a trending term is a product when this many matching items sell on AliExpress…
  minOrders: 300, // …with at least this many orders between them in 30 days
});

export const WORLD_STATES = Object.freeze({
  VIRAL_NOW: { he: "בטרנדים של גוגל היום", hint: "כבר הייפ בעולם: מופיע היום בחיפושים החמים של גוגל" },
  SPREADING: { he: "מתפשט בעולם", hint: "מתחילים לחפש את זה ביותר מדינות מאשר לפני כמה ימים: סימן מוקדם" },
  EARLY: { he: "מתחילים לחפש בעולם", hint: "מחפשים את זה רק במדינה אחת או שתיים: מוקדם" },
  WIDE: { he: "מחפשים בהרבה מדינות", hint: "כבר מוכר בעולם" },
  NONE: { he: "עוד לא מחפשים בעולם", hint: "אין עדיין השלמות לחיפוש באנגלית" },
  UNVERIFIED: { he: "עוד לא נמדד בעולם", hint: "אין עדיין מדידה" },
});

const level = (n, rules = WORLD) => (Number.isFinite(n) ? (n >= rules.aware ? "AWARE" : n >= rules.faint ? "FAINT" : "NONE") : null);
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** One day's world reading: completions per market (null = no answer), YouTube US, today's trends geos. */
export function worldReading({ by = {}, yt = null, trends = [], echo = [] } = {}, { now = Date.now() } = {}) {
  const out = {};
  for (const m of WORLD_MARKETS) out[m.id] = Number.isFinite(by[m.id]) ? by[m.id] : null;
  return { d: new Date(now).toISOString().slice(0, 10), by: out, yt: Number.isFinite(yt) ? yt : null, trends: (Array.isArray(trends) ? trends : []).filter((g) => TRENDS_GEOS.includes(g)), echo: (Array.isArray(echo) ? echo : []).filter((k) => Object.hasOwn(ECHO, k)) };
}

/** Adds today's reading (one per day; a later one the same day replaces it). */
export function addWorld(history = [], reading, { rules = WORLD } = {}) {
  const prev = (Array.isArray(history) ? history : []).filter((r) => r && r.d && r.d !== reading.d);
  return [...prev, reading].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-rules.keep);
}

/** How many sources show the phrase searched (FAINT or more) in one reading: the four markets + YouTube. */
export function spreadOf(r, { rules = WORLD } = {}) {
  if (!r) return null;
  const levels = [...WORLD_MARKETS.map((m) => level(r.by?.[m.id], rules)), level(r.yt, rules)].filter((l) => l !== null);
  if (!levels.length) return null;
  return { searched: levels.filter((l) => l !== "NONE").length, aware: levels.filter((l) => l === "AWARE").length, answered: levels.length };
}

/** The world state of one concept from its history (pure; tested). */
export function worldPulseOf(history = [], { rules = WORLD } = {}) {
  const rs = (Array.isArray(history) ? history : []).filter((r) => r?.d);
  const now = rs[rs.length - 1];
  const today = spreadOf(now, { rules });
  if (!now || !today) return { state: "UNVERIFIED", he: WORLD_STATES.UNVERIFIED.he, searched: null, of: null, trends: [], evidence: [] };
  const dayMs = 86_400_000;
  const older = [...rs].reverse().find((r) => {
    const gap = (Date.parse(now.d) - Date.parse(r.d)) / dayMs;
    return gap >= rules.spreadFrom && gap <= rules.spreadTo && spreadOf(r, { rules });
  });
  const before = older ? spreadOf(older, { rules }) : null;
  const trends = Array.isArray(now.trends) ? now.trends : [];
  let state;
  if (trends.length) state = "VIRAL_NOW";
  else if (before && today.searched > before.searched) state = "SPREADING";
  else if (today.aware >= 4) state = "WIDE";
  else if (today.searched >= 1) state = "EARLY";
  else state = "NONE";
  const where = WORLD_MARKETS.filter((m) => level(now.by?.[m.id], rules) && level(now.by?.[m.id], rules) !== "NONE").map((m) => m.he);
  if (level(now.yt, rules) && level(now.yt, rules) !== "NONE") where.push("יוטיוב");
  const dm = (d) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`;
  const evidence = [];
  if (trends.length) evidence.push(`בחיפושים החמים של גוגל היום ב${trends.map((g) => GEO_HE[g] || g).join(", ")} (${dm(now.d)}).`);
  evidence.push(where.length ? `מחפשים את זה ב: ${where.join(", ")} (${dm(now.d)}).` : `עוד אין השלמות לחיפוש ב־${WORLD_MARKETS.length} המדינות וביוטיוב (${dm(now.d)}).`);
  if (before && older) evidence.push(`לפני (${dm(older.d)}): ב־${before.searched} מקורות; היום: ב־${today.searched}.`);
  const echo = Array.isArray(now.echo) ? now.echo : [];
  if (echo.length) evidence.push(`באז ברשתות, בהשלמות החיפוש: ${echo.map((k) => ECHO_HE[k]).join(", ")} (${dm(now.d)}).`);
  return { state, he: WORLD_STATES[state].he, searched: today.searched, of: today.answered, trends, echo, evidence };
}

/** The concepts whose English phrase appears in a country's trending searches today (geo → ids). */
export function trendingAbroad(concepts = [], termsByGeo = {}) {
  const out = {};
  for (const [geo, terms] of Object.entries(termsByGeo || {})) {
    const ts = (Array.isArray(terms) ? terms : []).map(norm).filter((t) => t.length >= 4);
    for (const c of Array.isArray(concepts) ? concepts : []) {
      const phrase = norm(c?.en);
      const short = phrase.split(" ").slice(0, 2).join(" ");
      if (!phrase) continue;
      if (ts.some((t) => t.includes(phrase) || (short.length >= 6 && t.includes(short)) || (t.length >= 6 && phrase.includes(t)))) (out[c.id] ||= []).push(geo);
    }
  }
  return out;
}

/**
 * The kinds of things a shopper buys, as words: a trending term must name one to be a product trend
 * (2026-11-15, the first run admitted "ronaldinho", "gta vi" and "actor": people and games sell
 * merch on AliExpress, but they are not a product trend, and a celebrity or game is never ours).
 */
export const PRODUCT_NOUNS = new Set(("squishy toy toys plush doll fidget ring rings earring earrings necklace bracelet anklet watch charm " +
  "bag bags wallet purse backpack tote case cover holder stand mount charger cable lamp light lights led projector speaker earbuds " +
  "headphones mic microphone camera printer fan heater humidifier diffuser bottle cup mug tumbler glass jar box organizer rack shelf " +
  "hanger hook basket bin dispenser brush comb clip clips scrunchie wig mirror towel blanket pillow cushion sheet slippers socks shoes " +
  "sneakers boots dress skirt jacket hoodie pajamas swimsuit leggings hat cap scarf gloves sunglasses glasses mat rug curtain sticker " +
  "stickers puzzle blocks game kit tool tools knife peeler grater chopper blender mixer pan pot spatula sponge cleaner mop broom vacuum " +
  "trimmer shaver massager roller curler straightener dryer iron collar leash feeder litter scratcher perch bed toyset nail lashes " +
  "lipstick gloss serum mask patch tape planner pen pencil notebook keychain figure figurine sticker magnet magnets tiles slime putty")
  .split(/\s+/));

/**
 * Is a trending search term a product people buy? AliExpress's answer for it: at least `minItems`
 * items whose own title holds every word of the term, with `minOrders` orders between them in 30
 * days (pure; tested). Items: [{ title, orders }].
 */
export function productTrend(term, items = [], { rules = WORLD } = {}) {
  const words = norm(term).split(" ").filter((w) => w.length >= 3);
  if (!words.length || words.length > 5) return { ok: false, reason: "words" };
  if (!words.some((w) => PRODUCT_NOUNS.has(w) || PRODUCT_NOUNS.has(w.replace(/e?s$/, "")))) return { ok: false, reason: "not_a_product_word" };
  const match = (Array.isArray(items) ? items : []).filter((x) => { const t = norm(x?.title); return words.every((w) => t.includes(w)); });
  const orders = match.reduce((s, x) => s + (Number(x?.orders) || 0), 0);
  if (match.length < rules.minItems) return { ok: false, reason: "few_items", items: match.length, orders };
  if (orders < rules.minOrders) return { ok: false, reason: "few_orders", items: match.length, orders };
  return { ok: true, items: match.length, orders };
}

/**
 * The early call (the owner, 2026-11-15: "every trend it calls must be a bullseye"). No signal alone
 * calls a trend; independent ones must agree (pure; tested):
 *   world   — searches spread to more countries than days ago, or a country's trending searches;
 *   demand  — AliExpress orders accelerate across most top items (stage EMERGING/RISING);
 *   supply  — sellers rush in: matching listings grew ≥10% between readings ≥2 days apart;
 *   israel  — not searched in Hebrew yet (the head start).
 * CALL (sniper mode) when all four agree and the previous reading already showed three (it held);
 * WATCH otherwise on two. A call is graded publicly after 14 days.
 */
export function earlyCall({ world = null, stage = "UNVERIFIED", listings = [], gap = null, need = 4, before = null } = {}) {
  const rs = (Array.isArray(listings) ? listings : []).filter((r) => Array.isArray(r) && Number.isFinite(Number(r[1])));
  let supply = false;
  if (rs.length >= 2) {
    const [d0, n0] = rs[0];
    const [d1, n1] = rs[rs.length - 1];
    supply = (Date.parse(d1) - Date.parse(d0)) / 86_400_000 >= 2 && n0 > 0 && (n1 - n0) / n0 >= 0.1;
  }
  const signals = {
    world: world?.state === "SPREADING" || world?.state === "VIRAL_NOW",
    demand: stage === "EMERGING" || stage === "RISING",
    supply,
    israel: gap?.state === "GAP",
  };
  const count = Object.values(signals).filter(Boolean).length;
  // Persistence (a fad flashes once; a trend holds): a CALL also needs the previous reading to have
  // shown at least two agreeing signals. Without it, today's three signals are WATCH.
  // Sniper mode (the owner, 2026-11-15: "it must hit"): fewer calls, each one stronger. A call needs
  // all four signals today and three of them in the previous reading; after misses (need 5) the
  // previous reading must also have shown all four. A miss is never hidden: precision comes from the bar.
  const heldMin = need > 4 ? 4 : 3;
  const held = Number(before?.count) >= heldMin;
  const level = count >= Math.min(need, 4) && signals.demand && held ? "CALL" : count >= 2 ? "WATCH" : "NONE";
  // The finish lines are not signals (they come after): they only say what the call is ahead of.
  const crossed = finishLinesOf({ world, gap });
  const aheadOf = FINISH_LINES.filter((k) => !crossed[k]);
  const buzz = Array.isArray(world?.echo) ? world.echo.filter((k) => Object.hasOwn(ECHO, k)) : [];
  return { level, count, signals, held, buzz, aheadOf: level === "CALL" ? aheadOf : [], beforeAll: level === "CALL" && aheadOf.length === FINISH_LINES.length };
}

/**
 * "Before everyone" (the owner, 2026-11-15: "not only TikTok — before everyone"), made checkable.
 * Every early call is timed against four public finish lines, each one a moment when everybody else
 * can see the trend too:
 *   buzz   — the networks talk about it (TikTok/Douyin/Amazon/Korean trend words in the engines' suggestions);
 *   israel — Israelis start searching it in Hebrew (the Israel gap turns ARRIVING/ARRIVED);
 *   trends — it enters Google's daily trending searches in one of the 10 countries;
 *   wide   — it is searched in many countries (the world pulse turns WIDE).
 * A line already crossed when the call is made counts 0 days: never "ahead".
 */
export const FINISH_LINES = Object.freeze(["buzz", "israel", "trends", "wide"]);
export function finishLinesOf({ world = null, gap = null } = {}) {
  return {
    buzz: Array.isArray(world?.echo) && world.echo.length > 0,
    israel: gap?.state === "ARRIVING" || gap?.state === "ARRIVED",
    trends: (Array.isArray(world?.trends) && world.trends.length > 0) || world?.state === "VIRAL_NOW",
    wide: world?.state === "WIDE",
  };
}

/**
 * On each run, every early call gets today's date for each finish line its concept crosses for the
 * first time (pure: returns the updated calls; a date once written is never moved).
 */
export function stampFirsts(calls = [], crossedByConcept = {}, today) {
  return (Array.isArray(calls) ? calls : []).map((c) => {
    if (c?.kind !== "early") return c;
    const crossed = crossedByConcept[c.concept] || {};
    const firsts = { ...(c.firsts || {}) };
    let changed = false;
    for (const k of FINISH_LINES) if (crossed[k] && !firsts[k]) { firsts[k] = today; changed = true; }
    return changed ? { ...c, firsts } : c;
  });
}

/** How far ahead the calls were, per finish line: calls that met it, how many were ahead, the median days (pure). */
export function leadOf(calls = []) {
  const early = (Array.isArray(calls) ? calls : []).filter((c) => c?.kind === "early" && c.at);
  const out = {};
  for (const k of FINISH_LINES) {
    const days = early.filter((c) => c.firsts?.[k]).map((c) => Math.round((Date.parse(c.firsts[k]) - Date.parse(c.at)) / 86_400_000)).filter((n) => Number.isFinite(n) && n >= 0);
    const ahead = days.filter((n) => n > 0).sort((a, b) => a - b);
    out[k] = { met: days.length, ahead: ahead.length, medianDays: ahead.length ? ahead[Math.floor(ahead.length / 2)] : null, waiting: early.length - days.length };
  }
  return out;
}

/**
 * Learns from its misses: once at least `minGraded` early calls are graded, a hit rate under
 * `target`% raises the bar to all four signals (pure; tested). The record stays public either way.
 */
export function signalsNeeded(earlyRecord = {}, { minGraded = 10, target = 80 } = {}) {
  const graded = Number(earlyRecord?.graded) || 0;
  const acc = Number(earlyRecord?.accuracy);
  return graded >= minGraded && Number.isFinite(acc) && acc < target ? 5 : 4;
}

/** The sealed envelope: one fingerprint of every early call opened so far (concept, day, signals). */
export function sealOf(calls = []) {
  return (Array.isArray(calls) ? calls : []).filter((c) => c?.kind === "early").map((c) => `${c.concept}|${c.at}|${(c.signals || []).join(",")}`).sort().join("\n");
}


/**
 * The live scoreboard of an open call (the owner, 2026-11-15: "why only after 14 days?"): measured
 * every day against its sealed base, the same way the final grade is (orders now / base − 1), so
 * anyone watches it move toward the +15% a hit needs. Graded calls carry their final growth instead.
 */
function liveOf(c, latest = {}, today = null) {
  const now = Number(latest?.[c.concept]);
  const progress = !c.result && Number(c.base) > 0 && Number.isFinite(now) ? Math.round((now / c.base - 1) * 1000) / 10 : null;
  const dayN = !c.result && today ? Math.max(0, Math.round((Date.parse(today) - Date.parse(c.at)) / 86_400_000)) : null;
  return { progress, dayN: Number.isFinite(dayN) ? dayN : null };
}

/**
 * The public ledger ("ספר הקביעות"): every early call, newest first, with its sealed day, its grade
 * day, the grade once it exists (HIT/MISS, never edited) and the day each finish line was crossed.
 */
export function ledgerOf(calls = [], { max = 40, latest = {}, today = null } = {}) {
  return (Array.isArray(calls) ? calls : [])
    .filter((c) => c?.kind === "early" && c.concept && c.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(a.concept).localeCompare(String(b.concept)))
    .slice(0, max)
    .map((c) => ({ concept: c.concept, at: c.at, due: c.due || null, result: c.result === "HIT" || c.result === "MISS" ? c.result : null, growth: Number.isFinite(c.growth) ? c.growth : null, ...liveOf(c, latest, today), firsts: Object.fromEntries(FINISH_LINES.filter((k) => c.firsts?.[k]).map((k) => [k, c.firsts[k]])) }));
}

/**
 * Today's verdict ("מה הרדאר קבע היום"): the calls sealed on the board's day, strongest first; on a
 * day with none, says so (the radar never calls without its signals) and points at the newest open call.
 */
export function verdictOf({ ledger = [], concepts = [], day = null } = {}) {
  const byId = new Map((Array.isArray(concepts) ? concepts : []).map((c) => [c.id, c]));
  const today = (Array.isArray(ledger) ? ledger : []).filter((e) => e.at === day && byId.has(e.concept));
  const strength = (e) => byId.get(e.concept)?.early?.count || 0;
  today.sort((a, b) => strength(b) - strength(a));
  const open = (Array.isArray(ledger) ? ledger : []).find((e) => !e.result && e.at !== day && byId.has(e.concept)) || null;
  return { day, calls: today.map((e) => ({ ...e, concept: byId.get(e.concept) })), latestOpen: open ? { ...open, concept: byId.get(open.concept) } : null };
}

/**
 * How sure the radar is, and how often that held (the owner, 2026-11-15: "make it the tool that is
 * right"). Like a weather forecast, the radar states its certainty, and the page proves it: the
 * ordinary stage signals (demand alone) and the sniper calls (all four signals) are graded apart, so
 * anyone sees how much more often a sniper call hit. `record` is trendRadar.trackRecord (injected).
 */
export function calibrationOf(calls = [], record) {
  const list = Array.isArray(calls) ? calls : [];
  const pick = (r) => ({ graded: r.graded, hits: r.hits, accuracy: r.accuracy, pending: r.pending });
  return { signal: pick(record(list.filter((c) => c?.kind !== "early"))), sniper: pick(record(list.filter((c) => c?.kind === "early"))) };
}
