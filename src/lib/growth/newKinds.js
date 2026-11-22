// New kinds of product, found by meaning (the owner, 2026-11-20: "a lean AI architecture nobody
// thought of, so the radar sees it before everyone"). The fresh pool (freshRisers.js) holds about
// 6,000 of this year's new listings; one new listing growing fast can be luck, and two sellers name
// the same new thing in different words ("ear cuff no piercing", "magnetic clip earring"), so a
// phrase match misses it. Every morning an open sentence model on the runner (all-MiniLM-L6-v2,
// scripts/catalog/radar-embed.mjs; nothing paid, no key) turns each title into a vector, and the
// listings are grouped by meaning. A new kind is a group of at least three different new listings
// whose orders grow together: the MEDIAN weekly growth of its measured members (one viral listing
// cannot fake it), still small (under maxOrders together), not a kind the watch list already names.
// Each kind shown is a call, saved the day it is shown and graded after 14 days in public: HIT when
// the same listings' orders together grew ≥ 50% since. The strongest kinds also join the radar as
// trial concepts (radarDiscovery.js admitDiscovered), so the whole machinery (stages, the Israel
// gap, the world pulse, the sealed early calls) measures them from the next morning.
// Pure: the runner does the reading and the model.
import { hasBrandName, isNotListedKind } from "./deals.js";
import { HOT, itemMomentum } from "./radarOpportunity.js";
import { CATEGORY_KIND, covered, phrasesOf } from "./radarDiscovery.js";
import { BRAIN, kindFeatures } from "./radarBrain.js";
import { growthOverDays, isSeasonal } from "./freshRisers.js";

export const KINDS = Object.freeze({
  model: "Xenova/all-MiniLM-L6-v2",
  sim: 0.8, // cosine similarity of a listing to a kind's centre to join it
  minMembers: 3, // different new listings in a kind
  minMeasured: 3, // members with a week's growth measured
  minMedianWeekPct: 25, // the radar's EMERGING bar, on the median member
  minOrders: 300, // the kind's 30-day orders together
  maxOrders: 25_000, // past that it is no longer new
  show: 8,
  admit: 3, // kinds offered to discovery a day (its own caps still apply)
  gradeDays: 14,
  hitPct: 50,
  // 👁️ The same look (21.11, past Heuritech: it reads what people already post; the radar reads what
  // factories list before anyone wears it). The store photos of the fast new listings, through the
  // lens model (MobileCLIP-S0) on the runner, grouped when they look alike: one design spreading
  // across listings. Same rules and calls as the kinds by meaning.
  // The noise check on the members together (freshRisers.js, 21.11): their summed orders must grow
  // beyond counting noise against a +10% week (p ≤ 1%: many groups are tested every morning).
  noiseNullWeekPct: 10,
  noiseP: 0.01,
  lookSim: 0.9, // cosine of two store photos to count as the same look
  lookMax: 1500, // photos read a run, within 8 minutes (vectors are kept between runs)
  lookMinWeekPct: 10, // only listings already growing are looked at
});

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
const norm = (v) => {
  const n = Math.sqrt(dot(v, v)) || 1;
  return Array.from(v, (x) => x / n);
};

/**
 * Greedy grouping by meaning (deterministic): rows in the given order (strongest first), each joins
 * the first group whose centre is at least `sim` alike, else starts its own. Vectors are normalized
 * here, so any embedding works. Returns groups of row indexes.
 */
export function groupByMeaning(vectors = [], { sim = KINDS.sim } = {}) {
  const groups = [];
  vectors.forEach((raw, i) => {
    if (!raw || !raw.length) return;
    const v = norm(raw);
    let best = null;
    let bestSim = sim;
    for (const g of groups) {
      const s = dot(v, g.centre);
      if (s >= bestSim) { best = g; bestSim = s; }
    }
    if (!best) { groups.push({ members: [i], sum: v.slice(), centre: v.slice() }); return; }
    best.members.push(i);
    for (let k = 0; k < v.length; k++) best.sum[k] += v[k];
    best.centre = norm(best.sum);
  });
  return groups.map((g) => g.members);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/** The kind's name in the store's own words: the two-word phrase most of its members share. */
export function kindLabel(titles = []) {
  const count = new Map();
  for (const t of titles) for (const p of phrasesOf(t)) count.set(p, (count.get(p) || 0) + 1);
  const best = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1))[0];
  return best ? best[0] : null;
}

/**
 * Today's new kinds from the fresh pool, the item histories and one vector per pool listing
 * ({ [id]: number[] }). Strongest first (median growth, then members). Never a brand, an unlisted
 * kind or a kind the watch list (or a trial concept) already names.
 */
export function newKinds(pool = {}, items = {}, vectors = {}, { concepts = [], rules = KINDS } = {}) {
  const rows = Object.values(pool || {})
    .filter((e) => e?.id && Array.isArray(vectors?.[e.id]) && vectors[e.id].length)
    .sort((a, b) => (Number(b.orders) || 0) - (Number(a.orders) || 0) || (a.id < b.id ? -1 : 1));
  const groups = groupByMeaning(rows.map((e) => vectors[e.id]), { sim: rules.sim });
  const out = [];
  for (const g of groups) {
    if (g.length < rules.minMembers) continue;
    const members = g.map((i) => rows[i]);
    const label = kindLabel(members.map((m) => m.title));
    if (!label || hasBrandName(label) || isNotListedKind(label) || covered(label, concepts)) continue;
    if (members.some((m) => hasBrandName(m.title) || isNotListedKind(m.title))) continue;
    // A holiday comes back every year: never a new kind (20.11: "balls tree", Christmas ornaments).
    if (isSeasonal(label) || members.filter((m) => isSeasonal(m.title)).length * 2 >= members.length) continue;
    const moms = members.map((m) => ({ m, mom: itemMomentum(items?.[m.id] || [], { rules: HOT }) }));
    const measured = moms.filter((x) => x.mom.weekPct !== null && Number.isFinite(x.mom.orders));
    if (measured.length < rules.minMeasured) continue;
    const med = Math.round(median(measured.map((x) => x.mom.weekPct)) * 10) / 10;
    const orders = measured.reduce((s, x) => s + x.mom.orders, 0);
    const ordersBefore = measured.reduce((s, x) => s + (Number(x.mom.ordersBefore) || 0), 0);
    if (!(med >= rules.minMedianWeekPct) || orders < rules.minOrders || orders > rules.maxOrders) continue;
    const spans = measured.map((x) => (Date.parse(`${x.mom.to}T00:00:00Z`) - Date.parse(`${x.mom.from}T00:00:00Z`)) / 86_400_000).filter((d) => d > 0);
    const ev = growthOverDays({ before: ordersBefore, after: orders, days: spans.length ? spans.reduce((s, d) => s + d, 0) / spans.length : 0 }, { nullWeekPct: rules.noiseNullWeekPct ?? KINDS.noiseNullWeekPct });
    if (!ev || !(ev.p <= (rules.noiseP ?? KINDS.noiseP))) continue;
    const cats = new Map();
    for (const m of members) cats.set(m.category, (cats.get(m.category) || 0) + 1);
    const category = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const top = [...measured].sort((a, b) => b.mom.orders - a.mom.orders);
    out.push({
      en: label,
      members: members.map((m) => m.id).sort(),
      measured: measured.length,
      medianWeekPct: med,
      orders,
      ordersBefore,
      category,
      kind: CATEGORY_KIND[category] || "",
      first: members.map((m) => m.first).filter(Boolean).sort()[0] || null,
      bases: Object.fromEntries(measured.map((x) => [x.m.id, x.mom.orders]).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
      samples: top.slice(0, 3).map((x) => ({ id: x.m.id, title: x.m.title, image: x.m.image, buy: x.m.link, orders: x.mom.orders, weekPct: x.mom.weekPct })),
    });
  }
  return out.sort((a, b) => b.medianWeekPct - a.medianWeekPct || b.members.length - a.members.length || (a.en < b.en ? -1 : 1));
}

/** Kinds offered to discovery as trial concepts (the same shape discover() returns). */
export const kindCandidates = (kinds = [], { rules = KINDS } = {}) =>
  kinds.slice(0, rules.admit).map((k) => ({ en: k.en, items: k.members.length, orders: k.orders, category: k.category, kind: k.kind, via: k.via === "look" ? "look" : "meaning" }));

/** The pool listings whose photos are worth looking at today: already growing, fastest first. */
export function lookCandidates(pool = {}, items = {}, { rules = KINDS } = {}) {
  return Object.values(pool || {})
    .filter((e) => e?.id && typeof e.image === "string" && e.image)
    .map((e) => ({ e, m: itemMomentum(items?.[e.id] || [], { rules: HOT }) }))
    .filter(({ m }) => m.weekPct !== null && m.weekPct >= rules.lookMinWeekPct && m.orders >= 30)
    .sort((a, b) => b.m.weekPct - a.m.weekPct || (a.e.id < b.e.id ? -1 : 1))
    .slice(0, rules.lookMax)
    .map(({ e }) => e);
}

/** The kinds by look join the kinds by meaning unless they name or hold the same thing (half the members). */
export function mergeLooks(kinds = [], looks = []) {
  const out = kinds.map((k) => ({ ...k, via: k.via || "meaning" }));
  for (const l of looks) {
    const dup = out.some((k) => k.en === l.en || l.members.filter((id) => k.members.includes(id)).length * 2 >= Math.min(k.members.length, l.members.length));
    if (!dup) out.push({ ...l, via: "look" });
  }
  return out.sort((a, b) => b.medianWeekPct - a.medianWeekPct || b.members.length - a.members.length || (a.en < b.en ? -1 : 1));
}

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Today's kinds saved as calls (one open call per name), each with its members and their orders. */
export function recordKinds(calls = [], kinds = [], today, { rules = KINDS } = {}) {
  const list = Array.isArray(calls) ? [...calls] : [];
  for (const k of kinds) {
    if (list.some((c) => c.en === k.en && !c.result)) continue;
    const bases = k.bases && typeof k.bases === "object" ? k.bases : {};
    list.push({ en: k.en, at: today, bases, base: Object.values(bases).reduce((t, x) => t + (Number(x) || 0), 0), due: addDays(today, rules.gradeDays), f: kindFeatures(k), v: BRAIN.version });
  }
  return list.slice(-1000);
}

/**
 * Calls whose day came: the same listings' orders together, read on or after the due day, against
 * their orders the day the kind was shown. HIT at ≥ hitPct, else MISS. A listing not read on or after
 * its day makes the call wait (at most 3 days past due; then it is graded on the listings that were
 * read, each against its own base). Never edited after.
 */
export function gradeKinds(calls = [], items = {}, today, { rules = KINDS } = {}) {
  return (Array.isArray(calls) ? calls : []).map((c) => {
    if (c.result || !(c.due <= today) || !(c.base > 0)) return c;
    const ids = Object.keys(c.bases || {});
    const late = addDays(c.due, 3) <= today;
    let now = 0;
    let then = 0;
    let read = 0;
    for (const id of ids) {
      const r = (items?.[id] || []).filter((x) => x[0] >= c.due).at(0);
      if (r) { now += Number(r[1]) || 0; then += Number(c.bases[id]) || 0; read++; }
    }
    if ((read < ids.length && !late) || !read || !(then > 0)) return c;
    const growth = Math.round(((now - then) / then) * 1000) / 10;
    return { ...c, result: growth >= rules.hitPct ? "HIT" : "MISS", growth, read, gradedAt: today };
  });
}

/** The public record of the kinds' calls. */
export function kindsRecord(calls = []) {
  const list = Array.isArray(calls) ? calls : [];
  const graded = list.filter((c) => c.result);
  const hits = graded.filter((c) => c.result === "HIT").length;
  const pending = list.filter((c) => !c.result);
  return { calls: list.length, graded: graded.length, hits, accuracy: graded.length ? Math.round((hits / graded.length) * 100) : null, pending: pending.length, nextDue: pending.map((c) => c.due).sort()[0] || null };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The kinds' book, one line per call: `name|called on|members|orders then|graded on|grade`, sorted. */
export function kindsSealText(calls = []) {
  return (Array.isArray(calls) ? calls : [])
    .filter((c) => c && /^[a-z0-9' ]{3,60}$/.test(String(c.en || "")) && DAY.test(String(c.at || "")) && DAY.test(String(c.due || "")) && Number(c.base) > 0 && c.bases && typeof c.bases === "object")
    .map((c) => `${c.en}|${c.at}|${Object.keys(c.bases).sort().join("+")}|${Math.round(Number(c.base))}|${c.due}|${c.result === "HIT" || c.result === "MISS" ? c.result : "-"}`)
    .sort()
    .join("\n") || null;
}
