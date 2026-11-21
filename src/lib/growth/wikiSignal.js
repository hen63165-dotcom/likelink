// 📚 Wikipedia attention (the owner, 2026-11-21: "surpass every company you showed me, one by one").
// WGSN's edge is years of history; Similarweb's and Spate's is attention measured at scale. Wikimedia
// publishes, for free and for anyone, how many people read every Wikipedia article each day since
// July 2015 (the official Pageviews REST API). For every kind the radar watches that has its own
// article, the radar reads that attention in English and in Hebrew: this week against last week, the
// last 30 days, and the whole history since 2016 by month. Anyone can check the same numbers on
// Wikimedia's own pageviews tool, so this history is public evidence, not a vendor's claim.
//
// Rules: robots.txt is read first for every host (a disallow skips that door); a kind is matched to an
// article only when the article really names it (acceptTitle: the full phrase as Wikipedia resolves
// it, or a part whose words are all the kind's own and at least two of them); a week under
// minWeekViews says nothing about direction (null); nothing is guessed. Pure: the runner reads.

export const WIKI = Object.freeze({
  ua: "LikeLink2-radar/1.0 (+https://likelink2.vercel.app/radar)",
  summary: { host: "https://en.wikipedia.org", path: "/api/rest_v1/page/summary/" },
  views: { host: "https://wikimedia.org", path: "/api/rest_v1/metrics/pageviews/per-article/" },
  data: { host: "https://www.wikidata.org", path: "/wiki/Special:EntityData/" },
  resolveEveryDays: 30, // a kind's article is looked up again after a month
  historyEveryDays: 7, // the monthly history is read again after a week
  minWeekViews: 70, // a week with fewer readers than this says nothing about direction
  risingWeekPct: 25,
  maxLookups: 60, // article lookups a run (the rest wait for tomorrow)
  since: "2016-01-01",
});

const GENERIC = new Set(["for", "with", "and", "the", "a", "of", "in", "on", "to", "women", "woman", "womens", "men", "mens", "kids", "kid", "baby", "new", "mini", "set", "style", "cute", "small", "large", "big"]);
const stem = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s) => String(s || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map(stem);
const distinct = (s) => words(s).filter((w) => !GENERIC.has(w));
const same = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a)));
const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The article titles tried for a kind, in order: the full phrase, then its first and last two words. */
export function candidateTitles(en = "") {
  const w = String(en || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!w.length) return [];
  const out = [w.join(" ")];
  if (w.length >= 3) out.push(w.slice(0, 2).join(" "), w.slice(-2).join(" "));
  return [...new Set(out)].filter((t) => t.length >= 4).map(capital);
}

/**
 * Whether the article Wikipedia resolved really names the kind. The full phrase may resolve to any
 * title (Wikipedia's own editors made that redirect); a part of it only to a title whose distinctive
 * words are all the kind's own, at least two of them ("Quiet luxury" for "quiet luxury tote" yes;
 * "Squishy" for "butter stick squishy" or "Capybara" for "capybara squishy" no).
 */
export function acceptTitle(en = "", asked = "", resolved = "") {
  if (!resolved) return false;
  if (asked.trim().toLowerCase() === String(en).trim().toLowerCase()) return true;
  const kind = distinct(en);
  const title = distinct(resolved);
  if (title.length < 2) return false;
  return title.every((t) => kind.some((k) => same(t, k)));
}

const titlePath = (title) => encodeURIComponent(String(title).replace(/ /g, "_"));
const ymd = (iso) => String(iso).slice(0, 10).replace(/-/g, "");

export const summaryUrl = (title) => `${WIKI.summary.host}${WIKI.summary.path}${titlePath(title)}?redirect=true`;
export const entityUrl = (q) => `${WIKI.data.host}${WIKI.data.path}${encodeURIComponent(q)}.json`;
/** Daily (or monthly) readers of one article; `project` is en.wikipedia / he.wikipedia. */
export function viewsUrl(project, title, { from, to, granularity = "daily" }) {
  const end = granularity === "monthly" ? `${ymd(to).slice(0, 6)}0100` : `${ymd(to)}00`;
  return `${WIKI.views.host}${WIKI.views.path}${project}/all-access/user/${titlePath(title)}/${granularity}/${ymd(from)}00/${end}`;
}

/** The resolved article from a page-summary answer, or null (missing, disambiguation, other wiki). */
export function summaryOf(json) {
  if (!json || typeof json !== "object" || json.type === "disambiguation" || json.type === "no-extract") return null;
  const title = typeof json.titles?.normalized === "string" ? json.titles.normalized : typeof json.title === "string" ? json.title : null;
  if (!title || title.length > 120) return null;
  const q = typeof json.wikibase_item === "string" && /^Q\d{1,12}$/.test(json.wikibase_item) ? json.wikibase_item : null;
  return { title, q };
}

/** The Hebrew article's title from a Wikidata entity answer, or null. */
export function hebrewTitleOf(json, q) {
  const t = json?.entities?.[q]?.sitelinks?.hewiki?.title;
  return typeof t === "string" && t.length <= 120 ? t : null;
}

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const round1 = (x) => Math.round(x * 10) / 10;
const rows = (json) => (Array.isArray(json?.items) ? json.items : [])
  .map((i) => [String(i?.timestamp || "").slice(0, 8), Number(i?.views)])
  .filter(([d, n]) => /^\d{8}$/.test(d) && Number.isFinite(n) && n >= 0)
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const isoOf = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/**
 * Attention from a daily answer: the last 7 days against the 7 before, and the last 30. A day the
 * article had no readers is missing from Wikimedia's answer, so missing days count as 0 inside the
 * span. null under two weeks of data.
 */
export function attentionOf(json) {
  const r = rows(json);
  if (r.length < 7) return null;
  const last = r.at(-1)[0];
  const byDay = new Map(r);
  const day = (k) => { const t = new Date(Date.parse(`${isoOf(last)}T00:00:00Z`) - k * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""); return byDay.get(t) || 0; };
  const span = (a, b) => sum(Array.from({ length: b - a }, (_, i) => day(a + i)));
  const last7 = span(0, 7), prev7 = span(7, 14), last30 = span(0, 30);
  const weekPct = prev7 >= WIKI.minWeekViews ? round1((last7 / prev7 - 1) * 100) : null;
  return { last7, prev7, last30, weekPct, to: isoOf(last) };
}

/** The history from a monthly answer: since when, the busiest month, and this month a year ago. */
export function historyOf(json) {
  const r = rows(json);
  if (r.length < 3) return null;
  const peak = r.reduce((m, x) => (x[1] > m[1] ? x : m), r[0]);
  const lastFull = r.at(-1);
  const yearAgo = r.find((x) => x[0].slice(0, 6) === `${Number(lastFull[0].slice(0, 4)) - 1}${lastFull[0].slice(4, 6)}`);
  return {
    since: isoOf(r[0][0]).slice(0, 7),
    peak: { month: isoOf(peak[0]).slice(0, 7), views: peak[1] },
    month: { month: isoOf(lastFull[0]).slice(0, 7), views: lastFull[1] },
    yoyPct: yearAgo && yearAgo[1] >= 100 ? round1((lastFull[1] / yearAgo[1] - 1) * 100) : null,
    months: r.length,
  };
}

/** One kind's card: the article(s), this week's attention in English and Hebrew, the history. */
export function wikiCard({ en = null, he = null, a = null, ah = null, h = null } = {}) {
  if (!en) return null;
  const rising = a?.weekPct !== null && a?.weekPct !== undefined && a.weekPct >= WIKI.risingWeekPct;
  return { en, he, a, ah, h, rising };
}

/** The day's summary across every kind with an article. */
export function wikiSummary(cards = []) {
  const list = cards.filter(Boolean);
  return {
    articles: list.length,
    hebrew: list.filter((c) => c.he).length,
    rising: list.filter((c) => c.rising).length,
    since: list.map((c) => c.h?.since).filter(Boolean).sort()[0] || null,
  };
}
