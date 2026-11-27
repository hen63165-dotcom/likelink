// 📜 Ten years back, today (the owner, 27.11: "don't wait for days of history; find a way, so there are
// real results from now"). A sealed call can only be graded on its day, so the radar's own record grows
// one morning at a time. What can be checked today is the radar's way of seeing early, on a long public
// history: Wikimedia's own pageview counts for English Wikipedia articles, daily since 1 July 2015 (the
// official, free Pageviews API; wikimedia.org's rules file answers 404, no rule). Anyone can open the
// same numbers on Wikimedia's pageviews tool.
//
// The rule, fixed in this file before any run (never tuned on the results):
//   • a week's views against the article's own usual week (the median of the 52 weeks that end 4 weeks
//     earlier, so the rise itself never raises its own yardstick);
//   • an early alarm (the radar's "starting to run", confirmed over two readings like `heldWeekPct`):
//     this week ≥ 3× the usual, the week before ≥ 2×, at least 500 views a week (a real crowd), and no
//     alarm on that article in the 26 weeks before;
//   • a boom (what everyone sees): a week ≥ 10× the usual that is also the article's highest in 2 years;
//     its peak is the highest week of the 26 that follow.
// What it measures: of the alarms, how many became a boom within 26 weeks (and how much more often than
// a random week of the same articles did), and how many weeks the alarm came before the boom was plain
// and before its peak. A look back on public data (a backtest), never a sealed call. Pure.

export const HISTORY = Object.freeze({
  version: 1,
  from: "20150701",
  baseWeeks: 52,
  gapWeeks: 4,
  alarm: Object.freeze({ ratio: 3, prevRatio: 2, minWeekly: 500, cooldownWeeks: 26 }),
  boom: Object.freeze({ ratio: 10, highWeeks: 104, cooldownWeeks: 52 }),
  horizonWeeks: 26,
});

// The articles, named here before the run: things people buy, wear or make at home, some that had a
// moment and many that are simply always bought. Which of them boomed, and when, comes from the data.
export const ARTICLES = Object.freeze([
  "Fidget_spinner", "Squishmallows", "Labubu", "Tamagotchi", "Air_fryer", "Weighted_blanket", "Ring_light", "Scrunchie",
  "Bucket_hat", "Crocs", "Hydro_Flask", "Dalgona_coffee", "Slime_(toy)", "Bath_bomb", "Self-balancing_scooter", "Gua_sha",
  "Cottagecore", "Mood_ring", "Lava_lamp", "Rubik's_Cube", "Selfie_stick", "Instant_camera", "Pickleball", "Pet_rock",
  "Beanie_Babies", "Fanny_pack", "Platform_shoe", "Mary_Jane_(shoe)", "Cargo_pants", "Leg_warmer", "Balaclava_(clothing)", "Tote_bag",
  "Sourdough", "Air_purifier", "Surgical_mask", "Hand_sanitizer", "Jigsaw_puzzle", "Webcam", "Motorized_scooter", "Smartwatch",
  "LED_strip_light", "Video_projector", "Matcha", "Bubble_tea", "Kombucha", "Charcuterie", "Stress_ball", "Yo-yo",
  "Hula_hoop", "Roller_skates", "Skateboard", "Toaster", "Umbrella", "Pillow", "Sock", "Kettle",
  "Broom", "Bicycle", "Backpack", "Sunglasses", "Watch", "Mug", "Blender", "Hair_dryer",
  "Toothbrush", "Sneakers", "Jeans", "Necklace", "Earring", "Lipstick", "Candle", "Teapot",
  "Frying_pan", "Spoon", "Towel", "Mattress", "Wallet", "Scarf", "Glove", "Boot",
]);

export const pageviewsUrl = (title, end) => `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title)}/daily/${HISTORY.from}00/${end}00`;
export const toolUrl = (title) => `https://pageviews.wmcloud.org/?project=en.wikipedia.org&platform=all-access&agent=user&range=all-time&pages=${encodeURIComponent(title)}`;

const DAYMS = 86_400_000;
const dayOf = (ts) => { const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(ts || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/** Wikimedia's daily items → complete Monday-to-Sunday weeks: [{ w: "yyyy-mm-dd" (Monday), v }]. */
export function weekly(items = []) {
  const byWeek = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const t = dayOf(it?.timestamp);
    const v = Number(it?.views);
    if (!Number.isFinite(t) || !Number.isFinite(v) || v < 0) continue;
    const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAYMS;
    const w = byWeek.get(monday) || { n: 0, v: 0 };
    w.n++; w.v += v;
    byWeek.set(monday, w);
  }
  return [...byWeek.entries()].filter(([, w]) => w.n === 7).sort((a, b) => a[0] - b[0]).map(([m, w]) => ({ w: iso(m), v: w.v }));
}

/** The article's usual week for week i: the median of the 52 weeks ending `gapWeeks` before it. */
export function usualAt(weeks, i, { rules = HISTORY } = {}) {
  const end = i - rules.gapWeeks;
  const start = end - rules.baseWeeks;
  if (start < 0) return null;
  return median(weeks.slice(start, end).map((x) => x.v));
}

/** One article's alarms and booms, each from the weeks up to it only. */
export function scan(weeks = [], { rules = HISTORY } = {}) {
  const alarms = [];
  const booms = [];
  let lastAlarm = -Infinity;
  let lastBoom = -Infinity;
  for (let i = 0; i < weeks.length; i++) {
    const base = usualAt(weeks, i, { rules });
    if (!(base > 0)) continue;
    const v = weeks[i].v;
    const prev = weeks[i - 1]?.v ?? 0;
    if (v >= rules.alarm.ratio * base && prev >= rules.alarm.prevRatio * base && v >= rules.alarm.minWeekly && i - lastAlarm > rules.alarm.cooldownWeeks) {
      alarms.push({ i, w: weeks[i].w, v, base: Math.round(base) });
      lastAlarm = i;
    }
    const high = weeks.slice(Math.max(0, i - rules.boom.highWeeks), i).every((x) => x.v < v);
    if (v >= rules.boom.ratio * base && high && i - lastBoom > rules.boom.cooldownWeeks) {
      let p = i;
      for (let j = i; j < Math.min(weeks.length, i + rules.horizonWeeks); j++) if (weeks[j].v > weeks[p].v) p = j;
      booms.push({ i, w: weeks[i].w, v, base: Math.round(base), peak: weeks[p].w, peakI: p, peakV: weeks[p].v });
      lastBoom = i;
    }
  }
  return { alarms, booms };
}

/** Per alarm: did a boom start within the horizon (from the alarm's own week on), and how many weeks earlier. */
export function gradeAlarms(found, { rules = HISTORY, weeks = [] } = {}) {
  const out = [];
  for (const a of found.alarms) {
    if (a.i + rules.horizonWeeks >= weeks.length) { out.push({ ...a, open: true }); continue; }
    const b = found.booms.find((x) => x.i >= a.i && x.i <= a.i + rules.horizonWeeks);
    out.push(b ? { ...a, hit: true, leadToBoom: b.i - a.i, leadToPeak: b.peakI - a.i, boom: b.w, peak: b.peak } : { ...a, hit: false });
  }
  return out;
}

/** The share of all measurable weeks of these articles that a boom followed within the horizon (a random pick). */
export function baseRate(perArticle, { rules = HISTORY } = {}) {
  let weeks = 0, followed = 0;
  for (const a of perArticle) {
    const n = a.weeks.length;
    for (let i = rules.baseWeeks + rules.gapWeeks; i + rules.horizonWeeks < n; i++) {
      weeks++;
      if (a.found.booms.some((b) => b.i >= i && b.i <= i + rules.horizonWeeks)) followed++;
    }
  }
  return weeks ? { weeks, followed, rate: followed / weeks } : { weeks: 0, followed: 0, rate: null };
}

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/** The whole study from each article's weeks: the totals, the base rate, every alarm and boom (public). */
export function historyStudy(series = {}, today, { rules = HISTORY } = {}) {
  const perArticle = [];
  for (const [title, weeks] of Object.entries(series || {})) {
    if (!Array.isArray(weeks) || weeks.length < rules.baseWeeks + rules.gapWeeks + rules.horizonWeeks) continue;
    const found = scan(weeks, { rules });
    perArticle.push({ title, weeks, found, graded: gradeAlarms(found, { rules, weeks }) });
  }
  const graded = perArticle.flatMap((a) => a.graded.filter((g) => !g.open).map((g) => ({ ...g, title: a.title })));
  const hits = graded.filter((g) => g.hit);
  const booms = perArticle.flatMap((a) => a.found.booms.map((b) => ({ ...b, title: a.title })));
  const caught = booms.filter((b) => perArticle.find((a) => a.title === b.title).found.alarms.some((x) => x.i <= b.i && x.i >= b.i - rules.horizonWeeks));
  const ahead = caught.filter((b) => perArticle.find((a) => a.title === b.title).found.alarms.some((x) => x.i < b.i && x.i >= b.i - rules.horizonWeeks));
  const base = baseRate(perArticle, { rules });
  const precision = graded.length ? hits.length / graded.length : null;
  const mid = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  return {
    v: rules.version,
    at: today,
    from: rules.from,
    rules: { alarm: rules.alarm, boom: rules.boom, horizonWeeks: rules.horizonWeeks, baseWeeks: rules.baseWeeks, gapWeeks: rules.gapWeeks },
    articles: perArticle.length,
    weeks: perArticle.reduce((s, a) => s + a.weeks.length, 0),
    alarms: { graded: graded.length, hits: hits.length, precisionPct: r1(precision * 100), open: perArticle.reduce((s, a) => s + a.graded.filter((g) => g.open).length, 0) },
    baseRatePct: r1((base.rate ?? NaN) * 100),
    lift: precision !== null && base.rate ? r1(precision / base.rate) : null,
    booms: { total: booms.length, caught: caught.length, ahead: ahead.length },
    lead: { toBoomWeeks: mid(hits.map((h) => h.leadToBoom)), toPeakWeeks: mid(hits.map((h) => h.leadToPeak)) },
    list: [
      ...graded.map((g) => ({ title: g.title, alarm: g.w, hit: g.hit, boom: g.boom || null, peak: g.peak || null, leadToBoom: g.leadToBoom ?? null, leadToPeak: g.leadToPeak ?? null })),
    ].sort((a, b) => (a.alarm < b.alarm ? 1 : -1)).slice(0, 200),
    boomsList: booms.map((b) => ({ title: b.title, boom: b.w, peak: b.peak, ratio: r1(b.v / b.base), alarmed: ahead.includes(b) ? "ahead" : caught.includes(b) ? "same_week" : "missed" })).sort((a, b) => (a.boom < b.boom ? 1 : -1)),
  };
}

/** The browser's copy: numbers, ISO weeks and the article titles only. */
export function cleanHistory(h) {
  if (!h || typeof h !== "object" || h.v !== 1) return null;
  const n = (x, max = 1e9) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max ? x : null);
  const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || "")) ? x : null);
  const t = (x) => (typeof x === "string" && /^[\p{L}\p{N}_()'.,-]{1,80}$/u.test(x) ? x : null);
  return {
    at: d(h.at), articles: n(h.articles), weeks: n(h.weeks),
    alarms: { graded: n(h.alarms?.graded) ?? 0, hits: n(h.alarms?.hits) ?? 0, precisionPct: n(h.alarms?.precisionPct, 100), open: n(h.alarms?.open) ?? 0 },
    baseRatePct: n(h.baseRatePct, 100), lift: n(h.lift, 1000),
    booms: { total: n(h.booms?.total) ?? 0, caught: n(h.booms?.caught) ?? 0, ahead: n(h.booms?.ahead) ?? 0 },
    lead: { toBoomWeeks: n(h.lead?.toBoomWeeks, 60), toPeakWeeks: n(h.lead?.toPeakWeeks, 60) },
    list: (Array.isArray(h.list) ? h.list : []).map((x) => ({ title: t(x?.title), alarm: d(x?.alarm), hit: x?.hit === true, boom: d(x?.boom), peak: d(x?.peak), leadToBoom: n(x?.leadToBoom, 60), leadToPeak: n(x?.leadToPeak, 60) })).filter((x) => x.title && x.alarm).slice(0, 200),
    boomsList: (Array.isArray(h.boomsList) ? h.boomsList : []).map((x) => ({ title: t(x?.title), boom: d(x?.boom), peak: d(x?.peak), ratio: n(x?.ratio, 1e6), alarmed: ["ahead", "same_week", "missed"].includes(x?.alarmed) ? x.alarmed : null })).filter((x) => x.title && x.boom).slice(0, 200),
  };
}
