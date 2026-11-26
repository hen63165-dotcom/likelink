// 🔇 Before the noise (the owner, 26.11: "the radar must hit products that made no noise yet and are
// going to make huge noise… find a way far more genius than YouTube, get around YouTube and TikTok, the
// radar far ahead of them; unify it all into one code"). Noise is what everyone sees: TikTok and Amazon
// in Google's search suggestions, a flood of sellers, a wave of new YouTube videos. Before it, three
// doors that read the market upstream of every feed, each independent of the others:
//   prelaunch — different factories putting the same product up for sale before its first order
//               (AliExpress listings under 10 orders, listingWave.js);
//   shops     — new shops in the world registering a domain in its name (WhoisDS's daily list,
//               shopSignal.js);
//   listings  — this year's new listings whose own orders start to run (the fresh pool, its new kinds
//               by meaning or look, the factories that jump).
// A call is sealed when two different doors name the same product (its two-word name, singular) within
// a week while the downstream is quiet: at most 2,000 AliExpress listings for the name, no
// tiktok/viral/trending/amazon in Google's US suggestions, and (when the owner's YouTube key is read)
// fewer than 50 new videos and a million views in a week. A control is sealed beside it from the
// names only one door named that week (seeded order, the same quiet check), so the record can say
// whether two doors agreeing tells more than one. Every open entry is read again each morning; the
// first day the noise arrives (any of its three lines) is stamped once. HIT = the noise arrived within
// 30 days (with the days the radar was ahead), MISS = it stayed quiet, UNREAD = not read near its
// end (never counted). Never edited. Pure: the runner reads, this module decides.

import { echoOf } from "./worldPulse.js";

export const NOISE = Object.freeze({
  version: 1,
  families: Object.freeze(["prelaunch", "shops", "listings"]),
  windowDays: 7,
  keepDays: 21,
  minStores: 3, // prelaunch: different stores first listing the name this week
  minDomains: 2, // shops: new domains holding the name this week, more than the weeks before
  fastWeekPct: 25, // listings: the listing's (or the kind's median) weekly pace
  minOrders: 30,
  maxOrders: 3000,
  maxSimilar: 2000, // FRESH.maxSimilar: the saturation line
  ytVideos: 50, // YT.buzzVideos
  ytViews: 1_000_000, // YT.buzzViews
  checkPerRun: 10,
  controlPerRun: 3,
  perDay: 3,
  recheckDays: 7, // a name that failed the quiet check is asked again after a week
  dueDays: 30,
  unreadDays: 3,
  readPerRun: 30,
  ytPerRun: 10,
  keepGraded: 200,
  maxPerDoor: 3000, // the strongest names per door kept a day (the new-shop pairs run to thousands)
});

export const NOISE_LINES = Object.freeze(["buzz", "listings", "youtube"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z0-9']{3,24} [a-z0-9']{3,24}$/;
const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d, n) => new Date(ms(d) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };

/** One word, singular: squishies → squishy, boxes → box, slides → slide, glasses → glass, dress stays. */
export function singular(w = "") {
  const x = String(w).toLowerCase();
  if (/ies$/.test(x) && x.length > 4) return x.replace(/ies$/, "y");
  if (/(?:s|x|z|ch|sh)es$/.test(x)) return x.slice(0, -2);
  if (/[^s]s$/.test(x) && x.length > 3) return x.slice(0, -1);
  return x;
}

/** The product's two-word name as every door writes it (lower case, singular), or null. */
export function keyOf(phrase = "") {
  const w = String(phrase || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((x) => x.length >= 3);
  if (w.length !== 2 || w[0] === w[1]) return null;
  const k = `${singular(w[0])} ${singular(w[1])}`;
  return KEY.test(k) ? k : null;
}

/**
 * Today's names per door.
 * prelaunch: the prelaunch state ({ ps: { phrase: { store: firstDay } } });
 * shopWords: the shop-words state ({ days, w: { key: { day: n } } });
 * listings: [{ phrase, weekPct, orders }] from the runner (fast new listings, new kinds, jumping stores).
 */
export function doorSignals({ prelaunch = {}, shopWords = {}, listings = [] } = {}, today, { rules = NOISE, skip = () => false } = {}) {
  const out = { prelaunch: new Map(), shops: new Map(), listings: new Map() };
  if (!DAY.test(String(today || ""))) return out;
  const from = addDays(today, -rules.windowDays);
  const add = (door, phrase, n) => {
    const k = keyOf(phrase);
    if (!k || skip(k) || skip(phrase)) return;
    out[door].set(k, Math.max(out[door].get(k) || 0, n));
  };
  for (const [ph, per] of Object.entries(prelaunch?.ps || {})) {
    const n = Object.values(per || {}).filter((d) => d > from && d <= today).length;
    if (n >= rules.minStores) add("prelaunch", ph, n);
  }
  const days = (Array.isArray(shopWords?.days) ? shopWords.days : []).filter((d) => d <= today);
  const weekDays = days.filter((d) => d > from);
  const beforeDays = days.filter((d) => d <= from);
  for (const [k, per] of Object.entries(shopWords?.w || {})) {
    if (!k.includes(" ")) continue;
    const week = weekDays.reduce((s, d) => s + (per?.[d] || 0), 0);
    if (week < rules.minDomains) continue;
    const before = beforeDays.reduce((s, d) => s + (per?.[d] || 0), 0);
    const expected = beforeDays.length ? before * (weekDays.length / beforeDays.length) : 0;
    if (week > expected) add("shops", k, week);
  }
  for (const l of Array.isArray(listings) ? listings : []) {
    const pace = Number(l?.weekPct);
    const orders = Number(l?.orders);
    if (!Number.isFinite(pace) || pace < rules.fastWeekPct) continue;
    if (Number.isFinite(orders) && (orders < rules.minOrders || orders > rules.maxOrders * 10)) continue;
    add("listings", l.phrase, Math.round(pace));
  }
  for (const door of Object.keys(out)) {
    if (out[door].size > rules.maxPerDoor) out[door] = new Map([...out[door]].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, rules.maxPerDoor));
  }
  return out;
}

/** The kept signals: { sig: { key: { door: { first, last, n } } }, calls, checked }, old names out. */
export function mergeSignals(state = {}, signals = {}, today, { rules = NOISE } = {}) {
  const s = { sig: {}, calls: Array.isArray(state.calls) ? state.calls : [], checked: { ...(state.checked || {}) }, days: [...new Set([...(state.days || []), today])].filter((d) => DAY.test(String(d))).sort().slice(-60) };
  if (!DAY.test(String(today || ""))) return { ...s, sig: { ...(state.sig || {}) } };
  const cut = addDays(today, -rules.keepDays);
  for (const [k, per] of Object.entries(state.sig || {})) {
    const kept = Object.fromEntries(Object.entries(per || {}).filter(([door, v]) => rules.families.includes(door) && v?.last > cut));
    if (Object.keys(kept).length) s.sig[k] = kept;
  }
  for (const door of rules.families) {
    for (const [k, n] of signals[door] instanceof Map ? signals[door] : new Map(Object.entries(signals[door] || {}))) {
      const per = { ...(s.sig[k] || {}) };
      const was = per[door];
      per[door] = { first: was?.first || today, last: today, n };
      s.sig[k] = per;
    }
  }
  for (const [k, d] of Object.entries(s.checked)) if (!(d > cut)) delete s.checked[k];
  return s;
}

const openKeys = (calls = []) => new Set(calls.filter((c) => !c.result).map((c) => c.key));
const doorsOf = (per = {}, today, rules) => Object.entries(per).filter(([, v]) => v?.last > addDays(today, -rules.windowDays)).map(([door]) => door).sort();

/** Names two different doors named this week, strongest first (doors, then the doors' own strength). */
export function candidates(state = {}, today, { rules = NOISE } = {}) {
  const open = openKeys(state.calls);
  const recent = new Set((state.calls || []).filter((c) => c.at > addDays(today, -60)).map((c) => c.key));
  const rows = [];
  for (const [key, per] of Object.entries(state.sig || {})) {
    if (open.has(key) || recent.has(key)) continue;
    if (state.checked?.[key] && state.checked[key] > addDays(today, -rules.recheckDays)) continue;
    const doors = doorsOf(per, today, rules);
    if (doors.length < 2) continue;
    rows.push({ key, doors, n: doors.reduce((s, d) => s + (Number(per[d]?.n) || 0), 0) });
  }
  return rows.sort((a, b) => b.doors.length - a.doors.length || b.n - a.n || (a.key < b.key ? -1 : 1));
}

/** The control's pool: names only one door named this week, in a fixed order seeded by the day. */
export function controlPool(state = {}, today, { rules = NOISE } = {}) {
  const open = openKeys(state.calls);
  const recent = new Set((state.calls || []).filter((c) => c.at > addDays(today, -60)).map((c) => c.key));
  const rows = [];
  for (const [key, per] of Object.entries(state.sig || {})) {
    if (open.has(key) || recent.has(key)) continue;
    if (state.checked?.[key] && state.checked[key] > addDays(today, -rules.recheckDays)) continue;
    const doors = doorsOf(per, today, rules);
    if (doors.length === 1) rows.push({ key, doors, n: Number(per[doors[0]]?.n) || 0 });
  }
  return rows.sort((a, b) => fnv(`noise|${today}|${a.key}`) - fnv(`noise|${today}|${b.key}`) || (a.key < b.key ? -1 : 1));
}

/** Which noise lines a reading crosses. Unread parts are null, never "quiet". */
export function noiseLines({ similar = null, suggestions = null, yt = null } = {}, { rules = NOISE } = {}) {
  const listings = Number.isFinite(similar) ? similar > rules.maxSimilar : null;
  const buzz = Array.isArray(suggestions) ? echoOf({ en: suggestions }).length > 0 : null;
  const youtube = yt && Number.isFinite(yt.videos) && Number.isFinite(yt.views) ? yt.videos >= rules.ytVideos || yt.views >= rules.ytViews : null;
  return { buzz, listings, youtube };
}

/** The quiet check at the call: listings and Google's suggestions read and both quiet; YouTube quiet when read. */
export function quietCheck(reading = {}, { rules = NOISE } = {}) {
  const l = noiseLines(reading, { rules });
  if (l.listings === null || l.buzz === null) return { quiet: false, reason: "NOT_CHECKED", lines: l };
  if (l.listings) return { quiet: false, reason: "SATURATED", lines: l };
  if (l.buzz) return { quiet: false, reason: "BUZZ", lines: l };
  if (l.youtube) return { quiet: false, reason: "YOUTUBE", lines: l };
  return { quiet: true, reason: "QUIET", lines: l };
}

/**
 * New entries from today's checks. checked: [{ key, doors, n, role, similar, yt, check }].
 * Calls (two doors) up to perDay; controls (one door) as many as the calls made today, at least one.
 */
export function recordNoiseCalls(calls = [], checked = [], today, { rules = NOISE } = {}) {
  const out = (Array.isArray(calls) ? calls : []).slice();
  if (!DAY.test(String(today || ""))) return out;
  const open = openKeys(out);
  const madeToday = (role) => out.filter((c) => c.at === today && c.role === role).length;
  const take = (role, cap) => {
    for (const c of checked.filter((x) => x.role === role && x.check?.quiet)) {
      if (madeToday(role) >= cap || open.has(c.key)) continue;
      out.push({ v: rules.version, key: c.key, role, at: today, due: addDays(today, rules.dueDays), doors: c.doors.slice(), n: c.n, similar: c.similar, yt: Number.isFinite(c.yt?.videos) ? c.yt.videos : null, reads: [[today, c.similar, 0, Number.isFinite(c.yt?.videos) ? c.yt.videos : null]], noise: null });
      open.add(c.key);
    }
  };
  take("call", rules.perDay);
  take("control", Math.max(1, madeToday("call")));
  return out;
}

/** The open entries to read again today: oldest first, the ones near their end first among them. */
export function noiseQueue(calls = [], today, { rules = NOISE } = {}) {
  return (Array.isArray(calls) ? calls : [])
    .filter((c) => !c.result && c.at < today && !(c.reads || []).some((r) => r[0] === today))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.key < b.key ? -1 : 1))
    .slice(0, rules.readPerRun);
}

/** Today's readings in; the first day the noise arrives is stamped once; grades given, never edited. */
export function readNoise(calls = [], reads = {}, today, { rules = NOISE } = {}) {
  return (Array.isArray(calls) ? calls : []).map((c0) => {
    if (c0.result) return c0;
    let c = c0;
    const r = reads[c.key];
    if (r && DAY.test(String(today || "")) && !(c.reads || []).some((x) => x[0] === today)) {
      const lines = noiseLines(r, { rules });
      c = { ...c, reads: [...(c.reads || []), [today, Number.isFinite(r.similar) ? r.similar : null, lines.buzz === null ? null : lines.buzz ? 1 : 0, Number.isFinite(r.yt?.videos) ? r.yt.videos : null]].slice(-40) };
      const crossed = NOISE_LINES.filter((k) => lines[k] === true);
      if (!c.noise && crossed.length) c = { ...c, noise: { d: today, lines: crossed } };
    }
    if (c.noise && c.noise.d <= c.due) return { ...c, result: "HIT", graded: c.noise.d, lead: daysBetween(c.at, c.noise.d) };
    if (today >= c.due) {
      const last = (c.reads || []).map((x) => x[0]).sort().pop();
      if (last && last >= addDays(c.due, -rules.unreadDays)) return { ...c, result: "MISS", graded: today };
      if (today > addDays(c.due, rules.unreadDays)) return { ...c, result: "UNREAD", graded: today };
    }
    return c;
  });
}

/** Graded entries beyond the cap leave the state (the sealed book keeps every line). */
export function pruneNoise(calls = [], { rules = NOISE } = {}) {
  const open = calls.filter((c) => !c.result);
  const graded = calls.filter((c) => c.result).sort((a, b) => (a.graded < b.graded ? 1 : -1)).slice(0, rules.keepGraded);
  return [...graded.reverse(), ...open];
}

const med = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

/** The record per role: the calls (two doors) and the control (one door), and the edge once both have 3 grades. */
export function noiseRecord(calls = []) {
  const one = (role) => {
    const xs = calls.filter((c) => c.role === role);
    const graded = xs.filter((c) => c.result === "HIT" || c.result === "MISS");
    const hits = graded.filter((c) => c.result === "HIT");
    return {
      calls: xs.length, graded: graded.length, hits: hits.length, misses: graded.length - hits.length,
      unread: xs.filter((c) => c.result === "UNREAD").length, pending: xs.filter((c) => !c.result).length,
      rate: graded.length ? Math.round((hits.length / graded.length) * 1000) / 10 : null,
      medianLeadDays: med(hits.map((c) => c.lead)),
      nextDue: xs.filter((c) => !c.result).map((c) => c.due).sort()[0] || null,
    };
  };
  const call = one("call");
  const control = one("control");
  return { call, control, edge: call.graded >= 3 && control.graded >= 3 ? Math.round((call.rate - control.rate) * 10) / 10 : null };
}

// One sealed line: `key|role|at|doors|similar|yt|due|result|noiseDay|lines` (empty when not yet known).
const DOOR = "(?:prelaunch|shops|listings)";
const LINE_OF = "(?:buzz|listings|youtube)";
export const NOISE_LINE = `[a-z0-9']{3,24} [a-z0-9']{3,24}\\|(?:call|control)\\|\\d{4}-\\d{2}-\\d{2}\\|${DOOR}(?:\\+${DOOR})*\\|\\d*\\|\\d*\\|\\d{4}-\\d{2}-\\d{2}\\|(?:HIT|MISS|UNREAD)?\\|(?:\\d{4}-\\d{2}-\\d{2})?\\|(?:${LINE_OF}(?:\\+${LINE_OF})*)?`;

/** The sealed book: every entry, the control too, misses included. */
export function noiseSealText(calls = []) {
  const lines = (Array.isArray(calls) ? calls : []).filter((c) => KEY.test(String(c?.key || "")) && DAY.test(String(c?.at || "")))
    .map((c) => [c.key, c.role, c.at, (c.doors || []).join("+"), c.similar ?? "", c.yt ?? "", c.due, c.result || "", c.noise?.d || "", (c.noise?.lines || []).join("+")].join("|"))
    .sort();
  return lines.length ? lines.join("\n") : "";
}

/** The board's copy. */
export function noiseBoard(state = {}, { day, signals = {}, agree = 0, checked = [], seal = null, youtube = null } = {}) {
  const calls = Array.isArray(state.calls) ? state.calls : [];
  const size = (m) => (m instanceof Map ? m.size : Object.keys(m || {}).length);
  const dayN = (c) => Math.max(0, daysBetween(c.at, day)) + 1;
  const reasons = {};
  for (const c of checked) reasons[c.check?.reason || "NOT_CHECKED"] = (reasons[c.check?.reason || "NOT_CHECKED"] || 0) + 1;
  return {
    d: day, v: NOISE.version, days: (state.days || []).length,
    doors: Object.fromEntries(NOISE.families.map((f) => [f, size(signals[f])])),
    agree, checked: checked.length, reasons, youtube,
    record: noiseRecord(calls),
    open: calls.filter((c) => !c.result).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key < b.key ? -1 : 1)).slice(0, 12)
      .map((c) => ({ key: c.key, role: c.role, at: c.at, due: c.due, doors: c.doors, similar: c.similar, now: (c.reads || []).at(-1)?.[1] ?? null, yt: c.yt, dayN: dayN(c) })),
    graded: calls.filter((c) => c.result).sort((a, b) => (a.graded < b.graded ? 1 : -1)).slice(0, 20)
      .map((c) => ({ key: c.key, role: c.role, at: c.at, due: c.due, doors: c.doors, result: c.result, graded: c.graded, lead: c.lead ?? null, lines: c.noise?.lines || [] })),
    ...(seal ? { seal } : {}),
  };
}

/** The browser's copy. Behind the lock (`full: false`) the counts and the record only, never a name. */
export function cleanNoise(b, { full = true } = {}) {
  if (!b || typeof b !== "object" || !DAY.test(String(b.d || ""))) return null;
  const n = (x) => (typeof x === "number" && Number.isFinite(x) && x >= -1e6 && x <= 1e8 ? Math.round(x * 10) / 10 : null);
  const d = (x) => (DAY.test(String(x || "")) ? x : null);
  const doors = (xs) => (Array.isArray(xs) ? xs : []).filter((x) => NOISE.families.includes(x));
  const role = (x) => (x === "control" ? "control" : "call");
  const rec = (r = {}) => ({ calls: n(r.calls) ?? 0, graded: n(r.graded) ?? 0, hits: n(r.hits) ?? 0, misses: n(r.misses) ?? 0, unread: n(r.unread) ?? 0, pending: n(r.pending) ?? 0, rate: n(r.rate), medianLeadDays: n(r.medianLeadDays), nextDue: d(r.nextDue) });
  const reasons = {};
  for (const k of ["QUIET", "SATURATED", "BUZZ", "YOUTUBE", "NOT_CHECKED"]) if (n(b.reasons?.[k])) reasons[k] = n(b.reasons[k]);
  return {
    d: b.d, v: n(b.v), days: n(b.days) ?? 0,
    doors: Object.fromEntries(NOISE.families.map((f) => [f, n(b.doors?.[f]) ?? 0])),
    agree: n(b.agree) ?? 0, checked: n(b.checked) ?? 0, reasons,
    youtube: ["READ", "UNREAD"].includes(b.youtube) ? b.youtube : null,
    record: { call: rec(b.record?.call), control: rec(b.record?.control), edge: n(b.record?.edge) },
    open: full ? (Array.isArray(b.open) ? b.open : []).filter((c) => KEY.test(String(c?.key || "")) && d(c.at)).slice(0, 12)
      .map((c) => ({ key: c.key, role: role(c.role), at: c.at, due: d(c.due), doors: doors(c.doors), similar: n(c.similar), now: n(c.now), yt: n(c.yt), dayN: n(c.dayN) })) : [],
    graded: full ? (Array.isArray(b.graded) ? b.graded : []).filter((c) => KEY.test(String(c?.key || "")) && d(c.at)).slice(0, 20)
      .map((c) => ({ key: c.key, role: role(c.role), at: c.at, due: d(c.due), doors: doors(c.doors), result: ["HIT", "MISS", "UNREAD"].includes(c.result) ? c.result : null, graded: d(c.graded), lead: n(c.lead), lines: (Array.isArray(c.lines) ? c.lines : []).filter((x) => NOISE_LINES.includes(x)) })) : [],
  };
}
