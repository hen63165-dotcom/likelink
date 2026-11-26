// 🧭 The path every trend walks (the owner, 22.11: "not only the squishy; check how every product that
// became a trend started, and build the radar's code on that general principle, so it always upgrades").
// The cases studied (docs/research/trend-origins.md) walk the same five steps, years or weeks apart:
//   1. ORIGIN     — the product already exists and sells small, in one place (Labubu: a 2015 picture-book
//                   character in China; the Stanley Quencher: a 2016 tumbler that flopped; Fix's Dubai bar:
//                   2021, "barely one bar a week"; COSRX's snail essence: 2014 in Korea; the squishy: Chinese
//                   factories), and its orders start to grow.
//   2. COMMUNITY  — a small group adopts it and shows it, in its own language (The Buy Guide's bloggers,
//                   Thailand's influencers, a YouTube toy channel, haul bloggers, Korean creators).
//   3. CROSSING   — it jumps to another country or language (Lisa → Southeast Asia → the West; a Dubai
//                   TikTok → the world; Korea → US TikTok and Amazon).
//   4. RUSH       — sellers and factories follow: new listings, new shops, knock-offs (Lidl's Dubai bar
//                   within weeks; spinner factories that made phone accessories; Labubu counterfeits).
//   5. MASS       — everyone: best-seller lists, the news, trending searches, Wikipedia, trade reports.
// The radar measures each step with its own instruments, stamps the first day each is lit (never moved),
// and is right when it speaks between 2 and 3: after the community, before the crossing and the rush.
// It learns, from every kind it watches walk the path, how many days pass from each step to MASS and how
// often a step was followed by MASS — observed transitions only (a step already lit at the first reading
// is never a start), so every morning's numbers are the radar's own, and they grow with every trend.

export const PATH_STEPS = Object.freeze(["origin", "community", "crossing", "rush", "mass"]);
export const PATH_HE = Object.freeze({
  origin: "מקור: נמכר בקטן, וההזמנות מתחילות לעלות",
  community: "קהילה: הראשונים מראים אותו, בשפה שלהם",
  crossing: "חציה: מתחיל במדינה או בשפה נוספת",
  rush: "המירוץ: מוכרים, חנויות ומפעלים מצטרפים",
  mass: "כולם: מחפשים, כותבים ומדברים עליו בכל מקום",
});
export const PATH_RULES = Object.freeze({ rushWeekPct: 15, minLearn: 3, keepDays: 400 });

const has = (x) => x !== null && x !== undefined;

/** Which steps a kind's measurements light today (true / false / null = unmeasured). */
export function pathStepsOf(c = {}, { rules = PATH_RULES } = {}) {
  const stage = c.stage;
  const wg = c.worldGap?.state;
  const pulse = c.world?.state;
  const asiaStates = Object.values(c.asia?.regions || {}).map((r) => r?.state);
  const demandUp = stage === "EMERGING" || stage === "RISING";
  const origin = has(stage) && stage !== "UNVERIFIED" ? (demandUp || c.factory?.born === true) : null;
  const via = c.why?.via || c.via;
  const community = (via === "haul" || via === "asia" || via === "shops") || c.social?.talk?.rising === true || asiaStates.includes("FIRST_SIGNS")
    ? true : (has(c.social?.talk) || asiaStates.length ? false : null);
  const crossing = wg === "FIRST_SIGNS" || wg === "SPREADING" || pulse === "EARLY" || pulse === "SPREADING" || asiaStates.includes("SEARCHED")
    ? true : (has(wg) || has(pulse) ? false : null);
  const listingsUp = Number.isFinite(c.factory?.weekPct) && c.factory.weekPct >= rules.rushWeekPct;
  const adsUp = Number.isFinite(c.social?.ads?.week) && c.social.ads.week >= 10;
  const rush = listingsUp || c.shops?.rising === true || adsUp ? true : (has(c.factory) || has(c.shops) ? false : null);
  const trends = Array.isArray(c.world?.trends) && c.world.trends.length > 0;
  const mass = wg === "KNOWN" || pulse === "WIDE" || pulse === "VIRAL_NOW" || trends || c.gap?.state === "ARRIVED" || stage === "PEAK"
    ? true : (has(wg) || has(pulse) || has(c.gap?.state) ? false : null);
  return { origin, community, crossing, rush, mass };
}

/** Where the kind stands: the furthest lit step, and whether the radar is still before everyone. */
export function positionOf(steps = {}) {
  const lit = PATH_STEPS.filter((k) => steps[k] === true);
  if (!lit.length) return { at: null, before: false };
  const at = lit[lit.length - 1];
  return { at, before: !steps.rush && !steps.mass && (steps.origin === true || steps.community === true) };
}

/**
 * The kept history (kind → { seen: first reading day, steps: { step: first day lit } }): a step lit today
 * is stamped once and never moved. `seen` is the first day the kind was read, so a step lit on that day
 * is "already there", never an observed start.
 */
export function mergePath(state = {}, concepts = [], day, { rules = PATH_RULES } = {}) {
  const out = {};
  const oldest = new Date(Date.parse(`${day}T00:00:00Z`) - rules.keepDays * 86_400_000).toISOString().slice(0, 10);
  for (const [id, h] of Object.entries(state || {})) if (h?.last >= oldest) out[id] = h;
  for (const c of Array.isArray(concepts) ? concepts : []) {
    if (!c?.id) continue;
    const steps = pathStepsOf(c, { rules });
    const h = out[c.id] ? { ...out[c.id], steps: { ...(out[c.id].steps || {}) } } : { seen: day, steps: {} };
    for (const k of PATH_STEPS) if (steps[k] === true && !h.steps[k]) h.steps[k] = day;
    h.last = day;
    out[c.id] = h;
  }
  return out;
}

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * What the radar learned from the paths it watched: per step, how many kinds were seen starting it (after
 * their first reading), how many of those reached MASS later, and the median days in between. A number
 * shows from `minLearn` observed transitions; below it the step says how many it has.
 */
export function learnPath(state = {}, { rules = PATH_RULES } = {}) {
  const learned = {};
  for (const k of PATH_STEPS.filter((s) => s !== "mass")) {
    let started = 0, reached = 0;
    const leads = [];
    for (const h of Object.values(state || {})) {
      const s = h?.steps?.[k];
      if (!s || s <= h.seen) continue; // already lit at the first reading: no observed start
      started++;
      const m = h.steps.mass;
      if (m && m > s) { reached++; leads.push(daysBetween(s, m)); }
    }
    learned[k] = { started, reached, ready: reached >= rules.minLearn, medianDays: reached >= rules.minLearn ? median(leads) : null, rate: started >= rules.minLearn ? Math.round((reached / started) * 100) : null };
  }
  const kinds = Object.keys(state || {}).length;
  const observed = Object.values(state || {}).filter((h) => h?.steps?.mass && h.steps.mass > h.seen).length;
  return { kinds, observedMass: observed, steps: learned };
}

/** The board's summary: how many kinds stand at each step today, how many are still before everyone. */
export function pathBoard(concepts = [], state = {}, { rules = PATH_RULES } = {}) {
  const at = Object.fromEntries(PATH_STEPS.map((k) => [k, 0]));
  let before = 0;
  for (const c of Array.isArray(concepts) ? concepts : []) {
    const p = c?.path;
    if (!p?.at) continue;
    at[p.at]++;
    if (p.before) before++;
  }
  return { at, before, learned: learnPath(state, { rules }) };
}

/** A card's path (the steps lit today with their first day). */
export function pathCard(c, history) {
  const steps = pathStepsOf(c);
  const pos = positionOf(steps);
  const first = history?.steps || {};
  return { at: pos.at, before: pos.before, steps: Object.fromEntries(PATH_STEPS.map((k) => [k, steps[k] === true ? first[k] || null : steps[k] === false ? false : null])) };
}

/** The browser's copies. */
export function cleanPathCard(p) {
  if (!p || typeof p !== "object") return null;
  const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? d : null);
  const steps = {};
  for (const k of PATH_STEPS) steps[k] = p.steps?.[k] === false ? false : day(p.steps?.[k]);
  return { at: PATH_STEPS.includes(p.at) ? p.at : null, before: p.before === true, steps };
}

export function cleanPathBoard(b) {
  if (!b || typeof b !== "object") return null;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 1e6 ? Math.round(Number(x)) : null);
  const steps = {};
  for (const k of PATH_STEPS.filter((s) => s !== "mass")) {
    const s = b.learned?.steps?.[k] || {};
    steps[k] = { started: n(s.started) ?? 0, reached: n(s.reached) ?? 0, ready: s.ready === true, medianDays: n(s.medianDays), rate: n(s.rate) };
  }
  return { at: Object.fromEntries(PATH_STEPS.map((k) => [k, n(b.at?.[k]) ?? 0])), before: n(b.before) ?? 0, learned: { kinds: n(b.learned?.kinds) ?? 0, observedMass: n(b.learned?.observedMass) ?? 0, steps } };
}
