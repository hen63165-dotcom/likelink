// 🌍 The world gap (the owner, 2026-11-21: "not only the gap in Israel — the gap against the whole
// world"). The Israel gap asks whether Israelis already search a kind in Hebrew; the world gap asks
// the same of every country the radar can read: is the product's English store phrase already
// completed by Google's public suggestions there, or is it still quiet? Measured, per country, with
// the day of the reading and the number of countries that really answered — never a guess:
//   - the 13 countries the morning run already reads for every watched kind (worldPulse.js markets
//     and the clock's own countries, worldClock.js), plus Israel from the Hebrew consensus;
//   - 38 more countries on every continent (GAP_EXTRA), read only for the kinds that matter that day
//     (the moving ones first, the rest in rotation) and for every new product and new kind the radar
//     is about to show, so a "nobody knows it yet" claim covers the world, not one country.
// A country "searches it" when Google completes the phrase there at least once (the same level the
// world pulse calls FAINT); a buzz word in any country's completions (tiktok, viral, amazon) is the
// world's echo. States: WORLD_QUIET (quiet everywhere measured), FIRST_SIGNS (one or two countries),
// SPREADING (three or more, under half), KNOWN (half or more, or an echo, or Google's trending
// searches), UNMEASURED (too few countries answered). The phrase checked and the countries are
// printed, so anyone can verify them. Suggestion texts are never kept (brand names). Pure.

import { extensions } from "./israelGap.js";

/** The world's regions, as the page names them. */
export const REGIONS = Object.freeze({
  europe: { he: "אירופה", en: "Europe" },
  namerica: { he: "צפון אמריקה", en: "North America" },
  latam: { he: "אמריקה הלטינית", en: "Latin America" },
  asia: { he: "אסיה", en: "Asia" },
  oceania: { he: "אוקיאניה", en: "Oceania" },
  mea: { he: "המזרח התיכון ואפריקה", en: "Middle East & Africa" },
});

/** The countries the morning run already reads for every watched kind (world.json `by` and `x`). */
export const GAP_CORE = Object.freeze([
  { id: "us", he: "ארה״ב", en: "US", region: "namerica" },
  { id: "ca", he: "קנדה", en: "Canada", region: "namerica" },
  { id: "gb", he: "בריטניה", en: "UK", region: "europe" },
  { id: "de", he: "גרמניה", en: "Germany", region: "europe" },
  { id: "fr", he: "צרפת", en: "France", region: "europe" },
  { id: "es", he: "ספרד", en: "Spain", region: "europe" },
  { id: "it", he: "איטליה", en: "Italy", region: "europe" },
  { id: "jp", he: "יפן", en: "Japan", region: "asia" },
  { id: "kr", he: "קוריאה", en: "Korea", region: "asia" },
  { id: "in", he: "הודו", en: "India", region: "asia" },
  { id: "au", he: "אוסטרליה", en: "Australia", region: "oceania" },
  { id: "br", he: "ברזיל", en: "Brazil", region: "latam" },
  { id: "mx", he: "מקסיקו", en: "Mexico", region: "latam" },
].map(Object.freeze));

/** The world gap's own countries: Google's suggestions from each country (gl), the English store words. */
export const GAP_EXTRA = Object.freeze([
  { id: "nl", he: "הולנד", en: "Netherlands", region: "europe" },
  { id: "be", he: "בלגיה", en: "Belgium", region: "europe" },
  { id: "ch", he: "שווייץ", en: "Switzerland", region: "europe" },
  { id: "at", he: "אוסטריה", en: "Austria", region: "europe" },
  { id: "se", he: "שוודיה", en: "Sweden", region: "europe" },
  { id: "no", he: "נורווגיה", en: "Norway", region: "europe" },
  { id: "dk", he: "דנמרק", en: "Denmark", region: "europe" },
  { id: "fi", he: "פינלנד", en: "Finland", region: "europe" },
  { id: "ie", he: "אירלנד", en: "Ireland", region: "europe" },
  { id: "pt", he: "פורטוגל", en: "Portugal", region: "europe" },
  { id: "pl", he: "פולין", en: "Poland", region: "europe" },
  { id: "cz", he: "צ׳כיה", en: "Czechia", region: "europe" },
  { id: "gr", he: "יוון", en: "Greece", region: "europe" },
  { id: "ro", he: "רומניה", en: "Romania", region: "europe" },
  { id: "hu", he: "הונגריה", en: "Hungary", region: "europe" },
  { id: "ua", he: "אוקראינה", en: "Ukraine", region: "europe" },
  { id: "tr", he: "טורקיה", en: "Turkey", region: "mea" },
  { id: "ae", he: "איחוד האמירויות", en: "UAE", region: "mea" },
  { id: "sa", he: "ערב הסעודית", en: "Saudi Arabia", region: "mea" },
  { id: "eg", he: "מצרים", en: "Egypt", region: "mea" },
  { id: "za", he: "דרום אפריקה", en: "South Africa", region: "mea" },
  { id: "ng", he: "ניגריה", en: "Nigeria", region: "mea" },
  { id: "ke", he: "קניה", en: "Kenya", region: "mea" },
  { id: "ma", he: "מרוקו", en: "Morocco", region: "mea" },
  { id: "sg", he: "סינגפור", en: "Singapore", region: "asia" },
  { id: "my", he: "מלזיה", en: "Malaysia", region: "asia" },
  { id: "ph", he: "הפיליפינים", en: "Philippines", region: "asia" },
  { id: "id", he: "אינדונזיה", en: "Indonesia", region: "asia" },
  { id: "th", he: "תאילנד", en: "Thailand", region: "asia" },
  { id: "vn", he: "וייטנאם", en: "Vietnam", region: "asia" },
  { id: "tw", he: "טייוואן", en: "Taiwan", region: "asia" },
  { id: "hk", he: "הונג קונג", en: "Hong Kong", region: "asia" },
  { id: "pk", he: "פקיסטן", en: "Pakistan", region: "asia" },
  { id: "nz", he: "ניו זילנד", en: "New Zealand", region: "oceania" },
  { id: "ar", he: "ארגנטינה", en: "Argentina", region: "latam" },
  { id: "co", he: "קולומביה", en: "Colombia", region: "latam" },
  { id: "cl", he: "צ׳ילה", en: "Chile", region: "latam" },
  { id: "pe", he: "פרו", en: "Peru", region: "latam" },
].map(Object.freeze));

const ISRAEL = Object.freeze({ id: "il", he: "ישראל", en: "Israel", region: "mea" });
/** Every country of the world gap, Israel included. */
export const GAP_COUNTRIES = Object.freeze([...GAP_CORE, ...GAP_EXTRA, ISRAEL]);
export const GAP_IDS = Object.freeze(GAP_COUNTRIES.map((c) => c.id));
const BY_ID = new Map(GAP_COUNTRIES.map((c) => [c.id, c]));

export const GAP = Object.freeze({
  faint: 1, // completions from which a country searches the phrase at all (the world pulse's FAINT)
  minMeasured: 12, // under this many countries answered there is no world state (UNMEASURED)
  spreadFrom: 3, // searched in this many countries or more = spreading
  knownShare: 0.5, // searched in at least half the countries measured = known in the world
  maxConcepts: 24, // watched kinds swept a run: the moving ones first, then the longest unswept
  maxPhrases: 20, // finds checked a run: new products, new kinds, the takeoff, before the first sale, before the noise
  phraseBudgetMs: 300_000, // the finds' own clock: time spent reading them, wherever they come in the run (28.11)
  showDays: 7, // a sweep older than this is never shown
  keepDays: 21, // …and dropped from the state after this
  concurrency: 4,
  budgetMs: 420_000,
  maxFailures: 25, // unusable answers in a row that stop the sweep for the day
});

export const GAP_STATES = Object.freeze({
  WORLD_QUIET: { he: "שקט בכל העולם", en: "Quiet everywhere" },
  FIRST_SIGNS: { he: "סימנים ראשונים בעולם", en: "First signs in the world" },
  SPREADING: { he: "מתפשט בעולם", en: "Spreading in the world" },
  KNOWN: { he: "כבר מוכר בעולם", en: "Already known in the world" },
  UNMEASURED: { he: "עוד נמדד", en: "Being measured" },
});
const ECHO_WORD = /tik\s*tok|viral|trending|amazon/i;
const STATES = new Set(Object.keys(GAP_STATES));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The completions that extend a phrase (never the phrase itself), and whether any is an echo word. */
export function suggestFacts(phrase, suggestions) {
  const n = extensions(phrase, suggestions); // the radar's one way of counting completions (israelGap.js)
  if (n === null) return null;
  const q = String(phrase || "").toLowerCase().replace(/\s+/g, " ").trim();
  const echo = suggestions.some((s) => { const t = String(s).toLowerCase().replace(/\s+/g, " ").trim(); return t !== q && ECHO_WORD.test(t.replace(q, "")); });
  return { n, echo };
}

/**
 * One phrase's (or kind's) world gap from its counts per country (null = no usable answer), Israel's
 * Hebrew presence (true / false / null), the countries whose completions held an echo word, and the
 * countries where Google's trending searches had it today.
 */
export function worldGapOf({ counts = {}, yt = null, israel = null, echo = [], trends = [], d = null } = {}, { rules = GAP } = {}) {
  const per = [];
  // YouTube's suggestions from the same country (the biggest video network, `yt`): searched when
  // Google OR YouTube completes the phrase there; a country with neither answer is not measured.
  const both = (id) => { const xs = [counts?.[id], yt?.[id]].filter((x) => Number.isFinite(x)); return xs.length ? Math.max(...xs) : null; };
  let ytMeasured = 0, ytSearched = 0;
  for (const [id, v] of Object.entries(yt && typeof yt === "object" ? yt : {})) if (BY_ID.has(id) && Number.isFinite(v)) { ytMeasured++; if (v >= rules.faint) ytSearched++; }
  for (const c of GAP_COUNTRIES) {
    const v = c.id === "il" ? (israel === true ? rules.faint : israel === false ? 0 : null) : both(c.id);
    if (!Number.isFinite(v)) continue;
    per.push({ id: c.id, region: c.region, searched: v >= rules.faint });
  }
  const measured = per.length;
  const where = per.filter((p) => p.searched).map((p) => p.id);
  const regions = {};
  for (const p of per) {
    const r = (regions[p.region] ||= { measured: 0, searched: 0 });
    r.measured++;
    if (p.searched) r.searched++;
  }
  const echoIn = [...new Set((Array.isArray(echo) ? echo : []).filter((id) => BY_ID.has(id)))];
  const trendsIn = [...new Set((Array.isArray(trends) ? trends : []).map((g) => String(g).toLowerCase()).filter((id) => BY_ID.has(id)))];
  let state;
  if (measured < rules.minMeasured) state = "UNMEASURED";
  else if (echoIn.length || trendsIn.length || where.length / measured >= rules.knownShare) state = "KNOWN";
  else if (where.length >= rules.spreadFrom) state = "SPREADING";
  else if (where.length) state = "FIRST_SIGNS";
  else state = "WORLD_QUIET";
  const regionsMeasured = Object.keys(regions).length;
  return {
    d: DAY.test(String(d || "")) ? d : null,
    state,
    measured,
    searched: where.length,
    where,
    regions,
    regionsMeasured,
    quietRegions: Object.entries(regions).filter(([, r]) => r.searched === 0).map(([k]) => k),
    echo: echoIn,
    trends: trendsIn,
    before: state === "WORLD_QUIET" || state === "FIRST_SIGNS",
    yt: ytMeasured ? { measured: ytMeasured, searched: ytSearched } : null,
    confidence: measured >= 40 && regionsMeasured >= 6 ? "HIGH" : measured >= 25 && regionsMeasured >= 5 ? "MEDIUM" : "LOW",
  };
}

const names = (ids, lang) => ids.map((id) => BY_ID.get(id)?.[lang] || id).join(lang === "he" ? ", " : ", ");

/** One line, in what-IS words, for a card. */
export function worldGapLine(g, lang = "he") {
  if (!g || !STATES.has(g.state) || g.state === "UNMEASURED") return null;
  const he = lang === "he";
  const quiet = g.measured - g.searched;
  const net = g.yt?.measured ? (he ? " (גוגל ויוטיוב)" : " (Google and YouTube)") : "";
  if (g.state === "WORLD_QUIET") return he ? `שקט בכל ${g.measured} המדינות שנמדדו${net}, ב־${g.regionsMeasured} אזורים בעולם` : `Quiet in all ${g.measured} countries measured${net}, in ${g.regionsMeasured} regions`;
  if (g.state === "FIRST_SIGNS") return he ? `מחפשים רק ב${names(g.where, "he")} · שקט ב־${quiet} מדינות` : `Searched only in ${names(g.where, "en")} · quiet in ${quiet} countries`;
  const echo = g.echo.length ? (he ? ` · באז ב${names(g.echo, "he")}` : ` · buzz in ${names(g.echo, "en")}`) : "";
  const trends = g.trends.length ? (he ? ` · בחיפושים החמים ב${names(g.trends, "he")}` : ` · trending in ${names(g.trends, "en")}`) : "";
  return he ? `מחפשים ב־${g.searched} מתוך ${g.measured} מדינות${echo}${trends}` : `Searched in ${g.searched} of ${g.measured} countries${echo}${trends}`;
}

/** A gap fresh enough to show (a sweep older than `showDays` before `today` is not). */
export function freshGap(g, today, { rules = GAP } = {}) {
  if (!g?.d || !DAY.test(String(today || ""))) return null;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${g.d}T00:00:00Z`)) / 86_400_000;
  return age >= 0 && age <= rules.showDays ? g : null;
}

/**
 * The watched kinds to sweep today: the moving ones first (EMERGING, RISING), then those swept
 * longest ago (never swept first), so every kind gets a world gap within days.
 */
export function gapSweepOrder(concepts = [], state = {}, { rules = GAP } = {}) {
  const moving = (c) => (c.stage === "EMERGING" ? 0 : c.stage === "RISING" ? 1 : 2);
  const last = (c) => state?.[c.id]?.d || "";
  return [...(Array.isArray(concepts) ? concepts : [])]
    .filter((c) => c?.id && /^[\w\s'&.-]{3,80}$/.test(String(c.en || "")))
    .sort((a, b) => moving(a) - moving(b) || (last(a) < last(b) ? -1 : last(a) > last(b) ? 1 : 0) || (a.id < b.id ? -1 : 1))
    .slice(0, rules.maxConcepts);
}

/** The day's summary across every gap measured today. */
export function worldGapSummary(gaps = [], { today = null } = {}) {
  const list = gaps.filter((g) => g && STATES.has(g.state) && (!today || g.d === today));
  const by = Object.fromEntries([...STATES].map((s) => [s, list.filter((g) => g.state === s).length]));
  // Every number here is measured today: the regions and countries that really answered, never the list's size.
  return { countries: GAP_COUNTRIES.length, regions: list.reduce((m, g) => Math.max(m, g.regionsMeasured || 0), 0), measured: list.length, states: by, maxAnswered: list.reduce((m, g) => Math.max(m, g.measured), 0) };
}

/** The browser's copy of a gap: known states, countries and regions only. */
export function cleanWorldGap(g) {
  if (!g || typeof g !== "object" || !STATES.has(g.state)) return null;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 500 ? Math.round(Number(x)) : 0);
  const ids = (xs) => (Array.isArray(xs) ? [...new Set(xs.map(String).filter((id) => BY_ID.has(id)))].slice(0, GAP_COUNTRIES.length) : []);
  const regions = {};
  for (const [k, r] of Object.entries(g.regions && typeof g.regions === "object" ? g.regions : {})) {
    if (Object.hasOwn(REGIONS, k) && r && typeof r === "object") regions[k] = { measured: n(r.measured), searched: Math.min(n(r.searched), n(r.measured)) };
  }
  const measured = n(g.measured);
  const where = ids(g.where);
  return {
    d: DAY.test(String(g.d || "")) ? g.d : null,
    state: g.state,
    measured,
    searched: Math.min(where.length, measured),
    where,
    regions,
    regionsMeasured: Object.keys(regions).length,
    quietRegions: (Array.isArray(g.quietRegions) ? g.quietRegions : []).filter((k) => Object.hasOwn(regions, k) && regions[k].searched === 0),
    echo: ids(g.echo),
    trends: ids(g.trends),
    before: g.state === "WORLD_QUIET" || g.state === "FIRST_SIGNS",
    yt: g.yt && typeof g.yt === "object" ? { measured: n(g.yt.measured), searched: Math.min(n(g.yt.searched), n(g.yt.measured)) } : null,
    confidence: ["HIGH", "MEDIUM", "LOW"].includes(g.confidence) ? g.confidence : "LOW",
  };
}

/** The board's summary as the browser keeps it. */
export function cleanWorldGapSummary(s) {
  if (!s || typeof s !== "object") return null;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 10_000 ? Math.round(Number(x)) : 0);
  const states = {};
  for (const k of STATES) states[k] = n(s.states?.[k]);
  return { countries: n(s.countries), regions: n(s.regions), measured: n(s.measured), states, maxAnswered: n(s.maxAnswered) };
}

export const GAP_COUNTRY = (id) => BY_ID.get(id) || null;
