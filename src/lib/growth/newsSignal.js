// 📰 Who said it first: the radar or the world's news (the owner, 26.11, after an outside check:
// "accuracy in spotting trends and getting ahead of the competitors are not proven yet — take every
// sealed call, compare it with what happened and check whether the radar came before the others").
// The trade reports named the squishy years after the factories sold it; the radar's claim is to be
// before them. GDELT (the open Global Database of Events, Language and Tone) reads news sites in 65
// languages every 15 minutes and its DOC 2.0 API gives, free and with no key, how many articles a day
// name a phrase over the last three months (robots.txt: none, a 404; one request every 5 seconds).
// For every sealed call — stages, before-everyone, new products, new kinds — the radar asks for its own
// phrase and stamps the first day the news named it at least `minPerDay` times: after the seal (the
// radar was ahead, by so many days), on or before it (the news was first), or not yet (still quiet).
// A day is stamped once and never moved. Measured only, never a forecast. Pure: the runner asks.

export const NEWS = Object.freeze({
  host: "https://api.gdeltproject.org",
  path: "/api/v2/doc/doc",
  minPerDay: 3, // articles in one day: a phrase in the news, not a stray mention
  perRun: 24, // phrases asked per run (open calls first, then the longest unread)
  politeMs: 5500, // GDELT asks for one request every 5 seconds
  backoffMs: 15_000, // after a 429: 15 s, then 30 s (the runners share addresses with other users)
  budgetMs: 240_000, // the door's whole time in one run
  refreshDays: 2,
  keepDays: 150,
  timespan: "3m",
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function newsUrl(phrase, { rules = NEWS } = {}) {
  const q = `"${String(phrase || "").replace(/["]/g, "").trim()}"`;
  return `${rules.host}${rules.path}?query=${encodeURIComponent(q)}&mode=timelinevolraw&format=json&timespan=${rules.timespan}`;
}

/** GDELT's timeline answer → [{ d, n }] per day, or null when it is no timeline. */
export function parseTimeline(json) {
  const series = Array.isArray(json?.timeline) ? json.timeline : null;
  if (!series) return null;
  const s = series.find((x) => /count/i.test(String(x?.series || ""))) || series[0];
  if (!s || !Array.isArray(s.data)) return series.length ? null : [];
  const out = [];
  for (const p of s.data) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(p?.date || ""));
    const n = Number(p?.value);
    if (m && Number.isFinite(n) && n >= 0) out.push({ d: `${m[1]}-${m[2]}-${m[3]}`, n });
  }
  return out;
}

/** The first day the news named it at least minPerDay times (null: still quiet in the window). */
export function firstNews(timeline = [], { rules = NEWS } = {}) {
  const hit = (Array.isArray(timeline) ? timeline : []).filter((p) => DAY.test(p.d) && p.n >= rules.minPerDay).sort((a, b) => (a.d < b.d ? -1 : 1))[0];
  return hit ? hit.d : null;
}

/** The kept state: phrase → { read, first, since, total }; a first day is stamped once and never moved. */
export function mergeNews(state = {}, phrase, timeline, today, { rules = NEWS } = {}) {
  const out = { ...(state && typeof state === "object" ? state : {}) };
  const prev = out[phrase] || {};
  const first = prev.first || firstNews(timeline, { rules });
  const since = prev.since || (timeline?.[0]?.d ?? today);
  out[phrase] = { read: today, first: first || null, since, total: (timeline || []).reduce((s, p) => s + p.n, 0) };
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - rules.keepDays * 86_400_000).toISOString().slice(0, 10);
  for (const [k, v] of Object.entries(out)) if (!v?.read || v.read < oldest) delete out[k];
  return out;
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** One call against the news: AHEAD (the news named it after the seal), NEWS_FIRST, QUIET or UNREAD. */
export function newsRace(called, rec) {
  if (!DAY.test(String(called || "")) || !rec?.read) return { state: "UNREAD" };
  if (!rec.first) return { state: "QUIET", since: called, checked: rec.read };
  return rec.first > called ? { state: "AHEAD", days: daysBetween(called, rec.first), first: rec.first } : { state: "NEWS_FIRST", days: daysBetween(rec.first, called), first: rec.first };
}

/** Which phrases to ask this run: the calls' phrases, unread or stale first, at most perRun. */
export function newsQueue(entries = [], state = {}, today, { rules = NEWS } = {}) {
  const stale = (p) => { const r = state?.[p]; return !r?.read ? -1e9 : r.first ? 1e9 : -daysBetween(r.read, today); };
  const phrases = [...new Set(entries.map((e) => e.phrase).filter((p) => p && p.length >= 4))];
  return phrases.filter((p) => !state?.[p]?.read || (!state[p].first && daysBetween(state[p].read, today) >= rules.refreshDays)).sort((a, b) => stale(a) - stale(b)).slice(0, rules.perRun);
}

/** The board's summary per book: calls, read, quiet, ahead (median days), news first. Counts only. */
export function newsBoard(entries = [], state = {}, today, { rules = NEWS } = {}) {
  const books = {};
  const all = { calls: 0, read: 0, quiet: 0, ahead: 0, newsFirst: 0, aheadDays: [] };
  for (const e of entries) {
    const b = (books[e.book] ||= { calls: 0, read: 0, quiet: 0, ahead: 0, newsFirst: 0, aheadDays: [] });
    const r = newsRace(e.called, state?.[e.phrase]);
    for (const t of [b, all]) {
      t.calls++;
      if (r.state === "UNREAD") continue;
      t.read++;
      if (r.state === "QUIET") t.quiet++;
      else if (r.state === "AHEAD") { t.ahead++; t.aheadDays.push(r.days); } else t.newsFirst++;
    }
  }
  const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  const fin = (t) => ({ calls: t.calls, read: t.read, quiet: t.quiet, ahead: t.ahead, newsFirst: t.newsFirst, medianAheadDays: med(t.aheadDays) });
  return { d: today, minPerDay: rules.minPerDay, books: Object.fromEntries(Object.entries(books).map(([k, v]) => [k, fin(v)])), all: fin(all) };
}

/** The browser's copy (sanitizeBoard): counts only. */
export function cleanNews(b) {
  if (!b || typeof b !== "object" || !DAY.test(String(b.d || ""))) return null;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 1e6 ? Math.round(Number(x)) : null);
  const row = (t) => ({ calls: n(t?.calls) ?? 0, read: n(t?.read) ?? 0, quiet: n(t?.quiet) ?? 0, ahead: n(t?.ahead) ?? 0, newsFirst: n(t?.newsFirst) ?? 0, medianAheadDays: n(t?.medianAheadDays) });
  const books = {};
  for (const k of ["stages", "early", "fresh", "kinds"]) if (b.books?.[k]) books[k] = row(b.books[k]);
  return { d: b.d, minPerDay: n(b.minPerDay) ?? NEWS.minPerDay, books, all: row(b.all) };
}
