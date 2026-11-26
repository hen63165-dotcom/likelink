// 🏁 Who named it first: the radar or the trend companies (the owner, 26.11, over an outside check that
// asked for "a historical comparison against Exploding Topics, Spate, Trendalytics, FastMoss and
// Kalodata on the same products and dates"). Their dashboards are paid and closed, and Exploding
// Topics' terms forbid using its content commercially, so the radar compares itself only with what the
// trend companies publish for automated readers: their blogs' public RSS feeds, robots.txt read first.
// 26.11's check: Trendalytics (blog.trendalytics.co/rss.xml), FastMoss (/blog/feed) and Jungle Scout
// (/feed/) publish one; Exploding Topics, Spate, Kalodata and Glimpse publish none at the usual
// addresses. Each post keeps only its date, its link and its two-word phrases (never its text). Every
// sealed call's own phrase is then checked against everything they published: AHEAD (they named it
// after the seal), RIVAL_FIRST (on or before), QUIET (not yet). A call sealed before the feeds were
// first read is never counted (their older posts may be out of the feed). Pure: the runner reads.

export const RIVALS = Object.freeze([
  Object.freeze({ id: "trendalytics", name: "Trendalytics", host: "https://blog.trendalytics.co", path: "/rss.xml" }),
  Object.freeze({ id: "fastmoss", name: "FastMoss", host: "https://www.fastmoss.com", path: "/blog/feed" }),
  Object.freeze({ id: "junglescout", name: "Jungle Scout", host: "https://www.junglescout.com", path: "/feed/" }),
]);
export const RIVALS_UNFED = Object.freeze(["Exploding Topics", "Spate", "Kalodata", "Glimpse"]);
export const RIVAL = Object.freeze({ keepDays: 400, maxPairs: 600, maxPosts: 3000 });

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STOP = new Set("the and for with from that this your you are our was were has have not but all can how what why when who new best top more most into than out about will just also its it's".split(" "));
// &amp; is decoded last, so "&amp;lt;" stays the text "&lt;" (never decoded twice).
const unescape = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&#\d+;/g, " ").replace(/&amp;/g, "&");
const textOf = (s) => unescape(s).replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ");
const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).map((w) => w.replace(/^'+|'+$/g, "")).filter((w) => w.length >= 3 && !STOP.has(w));
// Singular: squishies → squishy, boxes → box, slides → slide, dress stays dress.
const one = (w) => (/ies$/.test(w) ? w.replace(/ies$/, "y") : /(?:s|x|z|ch|sh)es$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w);

/** The two-word phrases of a text, each word singular. */
export function pairsOf(text = "", { max = RIVAL.maxPairs } = {}) {
  const w = words(text).map(one);
  const out = new Set();
  for (let i = 0; i + 1 < w.length && out.size < max; i++) if (w[i] !== w[i + 1]) out.add(`${w[i]} ${w[i + 1]}`);
  return [...out];
}

/** A feed's posts: date (YYYY-MM-DD), link and phrases. RSS <item> and Atom <entry>. */
export function parseFeed(xml = "") {
  const posts = [];
  const blocks = String(xml || "").match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g) || [];
  for (const b of blocks) {
    const tag = (t) => (b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`)) || [])[1] || "";
    const link = unescape(tag("link")).trim() || ((b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "");
    const when = Date.parse(unescape(tag("pubDate") || tag("published") || tag("updated") || tag("dc:date")).trim());
    if (!Number.isFinite(when) || !/^https:\/\//.test(link)) continue;
    const text = [tag("title"), tag("description"), tag("summary"), tag("content:encoded"), tag("content")].map(textOf).join(" ");
    posts.push({ d: new Date(when).toISOString().slice(0, 10), u: link.slice(0, 300), p: pairsOf(text) });
  }
  return posts;
}

/** The state after one rival's feed: posts by link, the first day the feed was read, old posts out. */
export function mergeRival(state = {}, rival, posts = [], today) {
  const s = { since: { ...(state.since || {}) }, read: { ...(state.read || {}) }, posts: { ...(state.posts || {}) } };
  if (!DAY.test(String(today || ""))) return s;
  s.since[rival] ||= today;
  s.read[rival] = today;
  for (const p of posts) if (p?.u && DAY.test(String(p.d || ""))) s.posts[`${rival}|${p.u}`] = { r: rival, d: p.d, u: p.u, p: p.p };
  const cut = new Date(Date.parse(`${today}T00:00:00Z`) - RIVAL.keepDays * 86_400_000).toISOString().slice(0, 10);
  const kept = Object.entries(s.posts).filter(([, v]) => v.d >= cut).sort((a, b) => (a[1].d < b[1].d ? 1 : -1)).slice(0, RIVAL.maxPosts);
  s.posts = Object.fromEntries(kept);
  return s;
}

/** The first post of any rival naming the phrase (every two-word part of it, in one post). */
export function firstRivalMention(phrase = "", state = {}) {
  const want = pairsOf(phrase);
  if (!want.length) return null;
  let best = null;
  for (const v of Object.values(state.posts || {})) {
    const has = new Set(v.p || []);
    if (!want.every((x) => has.has(x))) continue;
    if (!best || v.d < best.d) best = { rival: v.r, d: v.d, u: v.u };
  }
  return best;
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** One sealed call against the rivals. BEFORE_TRACKING when it was sealed before every feed was read. */
export function rivalRace(called, phrase, state = {}) {
  const since = Object.values(state.since || {}).sort().pop();
  if (!DAY.test(String(called || "")) || !since) return { state: "UNREAD" };
  const m = firstRivalMention(phrase, state);
  if (m && m.d <= called) return { state: "RIVAL_FIRST", rival: m.rival, d: m.d, u: m.u, days: daysBetween(m.d, called) };
  if (called < since) return { state: "BEFORE_TRACKING" };
  if (m) return { state: "AHEAD", rival: m.rival, d: m.d, u: m.u, days: daysBetween(called, m.d) };
  return { state: "QUIET" };
}

/** The board: per rival the feed's state and posts kept, and the sealed calls against them. */
export function rivalsBoard(entries = [], state = {}, today, { doors = {} } = {}) {
  const all = { calls: 0, compared: 0, ahead: 0, quiet: 0, rivalFirst: 0, before: 0, aheadDays: [] };
  const named = [];
  for (const e of entries) {
    if (!e?.phrase || !e.called) continue;
    all.calls++;
    const r = rivalRace(e.called, e.phrase, state);
    if (r.state === "UNREAD") continue;
    if (r.state === "BEFORE_TRACKING") { all.before++; continue; }
    all.compared++;
    if (r.state === "QUIET") all.quiet++;
    else if (r.state === "AHEAD") { all.ahead++; all.aheadDays.push(r.days); named.push({ book: e.book, phrase: e.phrase, called: e.called, ...r }); } else { all.rivalFirst++; named.push({ book: e.book, phrase: e.phrase, called: e.called, ...r }); }
  }
  const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  const posts = Object.values(state.posts || {});
  return {
    d: today,
    rivals: RIVALS.map((x) => ({ id: x.id, name: x.name, door: doors[x.id] || null, since: state.since?.[x.id] || null, posts: posts.filter((p) => p.r === x.id).length })),
    unfed: [...RIVALS_UNFED],
    all: { calls: all.calls, compared: all.compared, ahead: all.ahead, quiet: all.quiet, rivalFirst: all.rivalFirst, beforeTracking: all.before, medianAheadDays: med(all.aheadDays) },
    named: named.sort((a, b) => (a.called < b.called ? 1 : -1)).slice(0, 20),
  };
}

/** The browser's copy. Behind the lock (`full: false`) the counts only, never a named call's phrase. */
export function cleanRivals(b, { full = true } = {}) {
  if (!b || typeof b !== "object" || !DAY.test(String(b.d || ""))) return null;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 1e6 ? Math.round(Number(x)) : null);
  const d = (x) => (DAY.test(String(x || "")) ? x : null);
  const ids = new Set(RIVALS.map((x) => x.id));
  const a = b.all || {};
  return {
    d: b.d,
    rivals: (Array.isArray(b.rivals) ? b.rivals : []).filter((x) => ids.has(x?.id)).map((x) => ({ id: x.id, name: RIVALS.find((r) => r.id === x.id).name, door: ["OK", "FAILED", "ROBOTS_DISALLOW", "EMPTY"].includes(x.door) ? x.door : null, since: d(x.since), posts: n(x.posts) ?? 0 })),
    unfed: [...RIVALS_UNFED],
    all: { calls: n(a.calls) ?? 0, compared: n(a.compared) ?? 0, ahead: n(a.ahead) ?? 0, quiet: n(a.quiet) ?? 0, rivalFirst: n(a.rivalFirst) ?? 0, beforeTracking: n(a.beforeTracking) ?? 0, medianAheadDays: n(a.medianAheadDays) },
    named: full ? (Array.isArray(b.named) ? b.named : []).filter((x) => ids.has(x?.rival) && /^[a-z0-9' ]{3,80}$/.test(String(x?.phrase || "")) && /^https:\/\//.test(String(x?.u || ""))).slice(0, 20).map((x) => ({ book: ["early", "stages", "fresh", "kinds", "prelaunch"].includes(x.book) ? x.book : null, phrase: x.phrase, called: d(x.called), state: x.state === "AHEAD" ? "AHEAD" : "RIVAL_FIRST", rival: x.rival, d: d(x.d), u: String(x.u).slice(0, 300), days: n(x.days) })) : [],
  };
}
