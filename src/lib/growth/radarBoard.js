// What the browser does with the radar's board.json (the /radar page and the magic button). The
// board is fetched from another host (GitHub Pages, proxied), so it is treated as untrusted input:
// sanitizeBoard keeps only known fields of known shapes — a store button only to the owner's own
// tracked AliExpress links, a picture only over https from AliExpress's own image hosts, the check
// button only into /magic, text capped — and drops anything else. radarForItem is the magic button's
// bridge: where a checked item sits on the radar. Tiny and import-light: both pages bundle it.
import { WORLD_STATES } from "./worldPulse.js";
import { CONFIDENCE, GAP_STATES, WINDOWS, normalize } from "./israelGap.js";
import { ACTIONS, HOT_STATES } from "./radarOpportunity.js";
import { ACCEL, LIFECYCLE } from "./alpha.js";
import { CLOCK_COUNTRIES, CLOCK_IDS } from "./worldClock.js";

const STAGE_KEYS = new Set(["EMERGING", "RISING", "STEADY", "PEAK", "COOLING", "UNVERIFIED"]);
const SIZES = new Set(["SMALL", "MID", "BIG"]);
const LEVELS = new Set(["NONE", "FAINT", "AWARE"]);
const HOTS = new Set(Object.keys(HOT_STATES));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const ITEM = /^\d{6,20}$/;
const BUY = /^https:\/\/s\.click\.aliexpress\.com\/[A-Za-z0-9_\-/.?=&%]+$/;
const IMG_HOST = /(^|\.)(aliexpress-media\.com|alicdn\.com|aliexpress\.com)$/i;

const str = (v, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : "");
const FINISH = ["buzz", "israel", "trends", "wide"];
const OTS_HOSTS = ["a.pool.opentimestamps.org", "b.pool.opentimestamps.org"];
/** A sealed book (radarLedger.js): its day, hash, line count, text when it fits and matches, and up to two proofs. */
const cleanBook = (s, textRe) => (s && typeof s === "object" && /^[0-9a-f]{64}$/.test(String(s.sha256 || "")) ? {
  d: day(s.d),
  sha256: s.sha256,
  count: num(s.count) ?? 0,
  text: typeof s.text === "string" && s.text.length <= 30_000 && textRe.test(s.text) ? s.text : null,
  ots: (Array.isArray(s.ots) ? s.ots : []).filter((o) => OTS_HOSTS.includes(o?.cal) && /^[A-Za-z0-9+/]+=*$/.test(String(o?.b64 || "")) && String(o.b64).length <= 14_000).slice(0, 2).map((o) => ({ cal: o.cal, b64: o.b64 })),
} : null);
const FRESH_BOOK = /^(\d{6,20}\|\d{4}-\d{2}-\d{2}\|\d+\|\d{4}-\d{2}-\d{2}\|(?:HIT|MISS|-))(\n\d{6,20}\|\d{4}-\d{2}-\d{2}\|\d+\|\d{4}-\d{2}-\d{2}\|(?:HIT|MISS|-))*$/;
// Only verified anchors: a 64-hex root and block hash, a block height, the complete proof as base64.
const cleanAnchors = (a) => (a && typeof a === "object" ? {
  list: (Array.isArray(a.list) ? a.list : []).slice(0, 10)
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x?.d || "")) && /^[0-9a-f]{64}$/.test(String(x?.sha256 || "")) && /^[0-9a-f]{64}$/.test(String(x?.block || "")) && Number.isInteger(x?.height) && x.height > 0 && x.height < 10_000_000)
    .map((x) => ({ d: x.d, sha256: x.sha256, height: x.height, block: x.block, time: Number.isFinite(x.time) && x.time > 1_200_000_000 ? x.time : null, b64: /^[A-Za-z0-9+/]+=*$/.test(String(x.b64 || "")) && String(x.b64).length <= 20_000 ? x.b64 : null })),
  pending: Number.isInteger(a.pending) && a.pending >= 0 ? a.pending : 0,
  since: /^\d{4}-\d{2}-\d{2}$/.test(String(a.since || "")) ? a.since : null,
} : null);
const LEDGER_ROOT = /^(early|stages|luck|fresh|globe|prices)=[0-9a-f]{64}(\n(early|stages|luck|fresh|globe|prices)=[0-9a-f]{64})*$/;
const LUCK_LINE = "[a-z0-9][a-z0-9-]{0,79}\\|\\d{4}-\\d{2}-\\d{2}\\|\\d+\\|\\d{4}-\\d{2}-\\d{2}\\|(?:HIT|MISS|-)\\|[0-9a-f]{64}";
const LUCK_BOOK = new RegExp(`^${LUCK_LINE}(\\n${LUCK_LINE})*$`);
const STAGE_LINE = "[a-z0-9][a-z0-9-]{0,79}\\|\\d{4}-\\d{2}-\\d{2}\\|(?:EMERGING|RISING)\\|\\d+\\|\\d{4}-\\d{2}-\\d{2}\\|(?:HIT|MISS|-)";
const STAGES_BOOK = new RegExp(`^${STAGE_LINE}(\\n${STAGE_LINE})*$`);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const day = (v) => (typeof v === "string" && DAY.test(v) ? v : null);
const lines = (list, max = 8) => (Array.isArray(list) ? list : []).slice(0, max).map((e) => ({ k: str(e?.k, 20), text: str(e?.text, 300) })).filter((e) => e.text);
const series = (list) => (Array.isArray(list) ? list : []).slice(-60).filter((p) => Array.isArray(p) && day(p[0])).map((p) => [p[0], num(p[1])]);

/** An image only over https from AliExpress's own image hosts. */
export function radarImage(src) {
  try {
    const u = new URL(String(src || ""));
    return u.protocol === "https:" && IMG_HOST.test(u.hostname) ? u.href : null;
  } catch { return null; }
}

function cleanPick(p) {
  if (!p || typeof p !== "object") return null;
  const buy = typeof p.buy === "string" && BUY.test(p.buy) ? p.buy : null;
  if (!buy) return null; // no store button without the owner's own tracked link
  const check = typeof p.check === "string" && /^\/magic\?u=[A-Za-z0-9%._\-]+$/.test(p.check) ? p.check : null;
  const price = num(p.price);
  const m = p.momentum && HOTS.has(p.momentum.state) ? { state: p.momentum.state, he: HOT_STATES[p.momentum.state].he, weekPct: num(p.momentum.weekPct), line: str(p.momentum.line, 200) } : null;
  return { itemId: ITEM.test(String(p.itemId || "")) ? String(p.itemId) : null, title: str(p.title, 140), image: radarImage(p.image), price: price !== null && price > 0 ? price : null, checkedAt: str(p.checkedAt, 30), buy, check, momentum: m };
}

const strs = (list, n = 6, max = 240) => (Array.isArray(list) ? list : []).slice(0, n).map((x) => str(x, max)).filter(Boolean);
function cleanAccel(a) {
  if (!a || typeof a !== "object" || !Object.hasOwn(ACCEL, a.cls)) return null;
  return { cls: a.cls, he: ACCEL[a.cls].he, weekPct: num(a.weekPct), earlierWeek: num(a.earlierWeek), recentWeek: num(a.recentWeek), consistency: num(a.consistency), readings: num(a.readings), from: day(a.from), to: day(a.to), basis: a.basis === "pick" ? "pick" : a.basis === "concept" ? "concept" : null };
}
function cleanAlpha(a) {
  if (!a || typeof a !== "object") return null;
  const comp = (c) => (c && typeof c === "object" ? (c.missing ? { missing: str(c.missing, 160) } : { score: num(c.score), confidence: num(c.confidence), evidence: str(c.evidence, 240) }) : null);
  const score = num(a.score);
  return {
    version: str(a.version, 20), score: score === null ? null : Math.max(0, Math.min(100, Math.round(score))), confidence: num(a.confidence), confidenceHe: str(a.confidenceHe, 30),
    coverage: /^[0-3]\/3$/.test(String(a.coverage || "")) ? a.coverage : null, verified: a.verified === true,
    components: { global: comp(a.components?.global), israel: comp(a.components?.israel), private: comp(a.components?.private) },
  };
}
function cleanExplain(e) {
  if (!e || typeof e !== "object") return null;
  return { why: strs(e.why), now: strs(e.now), risks: strs(e.risks), missing: strs(e.missing), angle: str(e.angle, 200), positioning: str(e.positioning, 120), audience: e.audience && typeof e.audience === "object" ? { text: str(e.audience.text, 160), basis: str(e.audience.basis, 80) } : null };
}

function cleanOpportunity(o) {
  if (!o || typeof o !== "object" || !Array.isArray(o.checks)) return null;
  const checks = o.checks.slice(0, 16).map((c) => ({ id: str(c?.id, 20), he: str(c?.he, 90), ok: c?.ok === true ? true : c?.ok === false ? false : null })).filter((c) => c.id && c.he);
  const measured = checks.filter((c) => c.ok !== null);
  return { checks, passed: measured.filter((c) => c.ok).length, measured: measured.length, score: measured.length ? Math.round((measured.filter((c) => c.ok).length / measured.length) * 100) : 0 };
}

const cleanSiteRow = (r) => (r && /^[\w-]{2,60}$/.test(String(r.id || "")) && HOTS.has(r.state)
  ? { id: r.id, title: str(r.title, 60), state: r.state, he: HOT_STATES[r.state].he, weekPct: num(r.weekPct), orders: num(r.orders), ordersBefore: num(r.ordersBefore), from: day(r.from), to: day(r.to) }
  : null);

function cleanRow(c) {
  if (!c || typeof c !== "object" || !ID.test(String(c.id || ""))) return null;
  const stage = STAGE_KEYS.has(c.stage) ? c.stage : "UNVERIFIED";
  const gapState = c.gap && Object.hasOwn(GAP_STATES, c.gap.state) ? c.gap.state : "UNKNOWN";
  const window = Object.hasOwn(WINDOWS, c.window) ? c.window : null;
  const today = c.today && typeof c.today === "object" ? { orders: num(c.today.orders), listings: num(c.today.listings), price: num(c.today.price) } : null;
  return {
    id: c.id,
    he: str(c.he, 80) || c.id,
    en: /^[\w\s'&.-]{2,80}$/.test(String(c.en || "")) ? String(c.en) : "",
    kind: str(c.kind, 20),
    auto: c.auto === true,
    found: day(c.found),
    stage,
    stageHe: str(c.stageHe, 40),
    score: Math.max(0, Math.min(100, num(c.score) ?? 0)),
    evidence: lines(c.evidence),
    series: series(c.series),
    listings: series(c.listings),
    since: day(c.since),
    measured: day(c.measured),
    today,
    size: SIZES.has(c.size) ? c.size : null,
    gap: { state: gapState, he: str(c.gap?.he, 40) || GAP_STATES[gapState].he, confidence: Object.hasOwn(CONFIDENCE, c.gap?.confidence) ? c.gap.confidence : null, confidenceHe: Object.hasOwn(CONFIDENCE, c.gap?.confidence) ? CONFIDENCE[c.gap.confidence].he : null, il: LEVELS.has(c.gap?.il) ? c.gap.il : null, yt: LEVELS.has(c.gap?.yt) ? c.gap.yt : null, world: LEVELS.has(c.gap?.world) ? c.gap.world : null, arrivedOn: day(c.gap?.arrivedOn), evidence: lines(c.gap?.evidence, 7) },
    window,
    windowHe: window ? WINDOWS[window].he : null,
    items: (Array.isArray(c.items) ? c.items : []).filter((x) => typeof x === "string" && ITEM.test(x)).slice(0, 20),
    match: (Array.isArray(c.match) ? c.match : []).map((m) => str(m, 60)).filter(Boolean).slice(0, 4),
    hot: Object.fromEntries(Object.entries(c.hot && typeof c.hot === "object" ? c.hot : {}).filter(([id, v]) => ITEM.test(id) && Array.isArray(v) && HOTS.has(v[0])).slice(0, 20).map(([id, v]) => [id, [v[0], num(v[1])]])),
    world: c.world && Object.hasOwn(WORLD_STATES, c.world.state) ? { state: c.world.state, he: WORLD_STATES[c.world.state].he, searched: num(c.world.searched), of: num(c.world.of), trends: (Array.isArray(c.world.trends) ? c.world.trends : []).filter((g) => /^[A-Z]{2}$/.test(g)).slice(0, 4), evidence: (Array.isArray(c.world.evidence) ? c.world.evidence : []).map((x) => str(x, 160)).filter(Boolean).slice(0, 4) } : null,
    factory: c.factory && typeof c.factory === "object" && num(c.factory.weekPct) !== null ? { weekPct: num(c.factory.weekPct), from: num(c.factory.from), to: num(c.factory.to), days: num(c.factory.days), born: c.factory.born === true } : null,
    early: c.early && ["CALL", "WATCH", "NONE"].includes(c.early.level) ? { level: c.early.level, count: num(c.early.count), signals: Object.fromEntries(["world", "demand", "supply", "israel"].map((k) => [k, c.early.signals?.[k] === true])), buzz: (Array.isArray(c.early.buzz) ? c.early.buzz : []).filter((k) => ["tiktok", "amazon", "douyin", "korea"].includes(k)), aheadOf: (Array.isArray(c.early.aheadOf) ? c.early.aheadOf : []).filter((k) => FINISH.includes(k)), beforeAll: c.early.beforeAll === true } : null,
    pick: cleanPick(c.pick),
    opportunity: cleanOpportunity(c.opportunity),
    action: Object.hasOwn(ACTIONS, c.action) ? c.action : null,
    actionHe: Object.hasOwn(ACTIONS, c.action) ? ACTIONS[c.action] : null,
    accel: cleanAccel(c.accel),
    lifecycle: Object.hasOwn(LIFECYCLE, c.lifecycle) ? c.lifecycle : null,
    lifecycleHe: Object.hasOwn(LIFECYCLE, c.lifecycle) ? LIFECYCLE[c.lifecycle].he : null,
    alpha: cleanAlpha(c.alpha),
    explain: cleanExplain(c.explain),
  };
}

/** The board as the pages may use it, or null when it is not a radar board. */
export function sanitizeBoard(doc) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.concepts) || typeof doc.at !== "string" || !doc.record || typeof doc.record !== "object") return null;
  const r = doc.record;
  const recent = (Array.isArray(r.recent) ? r.recent : []).slice(0, 12).map((x) => ({ concept: str(x?.concept, 45), result: x?.result === "HIT" ? "HIT" : "MISS", at: day(x?.at), gradedAt: day(x?.gradedAt), growth: num(x?.growth) }));
  const clock = doc.clock && typeof doc.clock === "object" ? { observed: Math.max(0, num(doc.clock.observed) ?? 0), typicalDays: num(doc.clock.typicalDays) } : { observed: 0, typicalDays: null };
  return {
    v: num(doc.v) ?? 1,
    at: str(doc.at, 30),
    early: doc.early && typeof doc.early === "object" ? { need: doc.early.need === 5 ? 5 : 4, open: num(doc.early.open), record: { graded: num(doc.early.record?.graded) ?? 0, hits: num(doc.early.record?.hits) ?? 0, accuracy: num(doc.early.record?.accuracy), pending: num(doc.early.record?.pending) ?? 0, calls: num(doc.early.record?.calls) ?? 0 }, lead: doc.early.lead && typeof doc.early.lead === "object" ? Object.fromEntries(FINISH.map((k) => { const l = doc.early.lead[k] || {}; return [k, { met: num(l.met) ?? 0, ahead: num(l.ahead) ?? 0, medianDays: num(l.medianDays), waiting: num(l.waiting) ?? 0 }]; })) : null, calibration: doc.early.calibration && typeof doc.early.calibration === "object" ? Object.fromEntries(["signal", "sniper"].map((k) => { const r = doc.early.calibration[k] || {}; return [k, { graded: num(r.graded) ?? 0, hits: num(r.hits) ?? 0, accuracy: num(r.accuracy), pending: num(r.pending) ?? 0 }]; })) : null, ledger: (Array.isArray(doc.early.ledger) ? doc.early.ledger : []).slice(0, 40).filter((e) => ID.test(String(e?.concept || ""))).map((e) => ({ concept: e.concept, at: day(e.at), due: day(e.due), result: e.result === "HIT" || e.result === "MISS" ? e.result : null, growth: num(e.growth), progress: num(e.progress), dayN: num(e.dayN), firsts: Object.fromEntries(FINISH.filter((k) => day(e.firsts?.[k])).map((k) => [k, day(e.firsts[k])])) })).filter((e) => e.at), seal: doc.early.seal && /^[0-9a-f]{64}$/.test(String(doc.early.seal.sha256 || "")) ? { d: day(doc.early.seal.d), sha256: doc.early.seal.sha256, count: num(doc.early.seal.count) ?? 0, text: typeof doc.early.seal.text === "string" && doc.early.seal.text.length <= 30_000 && /^[a-z0-9|,\n-]*$/.test(doc.early.seal.text) ? doc.early.seal.text : null, ots: (Array.isArray(doc.early.seal.ots) ? doc.early.seal.ots : []).filter((o) => OTS_HOSTS.includes(o?.cal) && /^[A-Za-z0-9+/]+=*$/.test(String(o?.b64 || "")) && String(o.b64).length <= 14_000).slice(0, 2).map((o) => ({ cal: o.cal, b64: o.b64 })) } : null } : null,
    concepts: doc.concepts.slice(0, 200).map(cleanRow).filter(Boolean),
    record: { calls: num(r.calls) ?? 0, graded: num(r.graded) ?? 0, hits: num(r.hits) ?? 0, accuracy: num(r.accuracy), pending: num(r.pending) ?? 0, nextDue: day(r.nextDue), recent },
    clock,
    site: doc.site && typeof doc.site === "object" ? {
      checked: Math.max(0, num(doc.site.checked) ?? 0),
      counts: Object.fromEntries(Object.entries(doc.site.counts || {}).filter(([k, v]) => HOTS.has(k) && Number.isFinite(v))),
      hot: (Array.isArray(doc.site.hot) ? doc.site.hot : []).slice(0, 24).map(cleanSiteRow).filter((r) => r && r.state === "HOT"),
      cooling: (Array.isArray(doc.site.cooling) ? doc.site.cooling : []).slice(0, 24).map(cleanSiteRow).filter((r) => r && r.state === "COOLING"),
      keep: (Array.isArray(doc.site.keep) ? doc.site.keep : []).slice(0, 24).filter((r) => r && /^[\w-]{2,60}$/.test(String(r.id || ""))).map((r) => ({ id: r.id, title: str(r.title, 60), accel: cleanAccel(r.accel), lifecycle: Object.hasOwn(LIFECYCLE, r.lifecycle) ? r.lifecycle : null, lifecycleHe: Object.hasOwn(LIFECYCLE, r.lifecycle) ? LIFECYCLE[r.lifecycle].he : null, alpha: num(r.alpha), confidence: num(r.confidence), israelHe: str(r.israel?.he, 40) })),
    } : null,
    rules: { hitPct: num(doc.rules?.hitPct) ?? 15, gradeDays: num(doc.rules?.gradeDays) ?? 14 },
    fresh: cleanFresh(doc.fresh),
    // The complete ledger's root (radarLedger.js): one Bitcoin seal over every book of calls.
    ledger: cleanBook(doc.ledger, LEDGER_ROOT),
    // ⛓️ The days whose ledger root is verified inside a Bitcoin block (otsUpgrade.js anchorsBoard).
    anchors: cleanAnchors(doc.anchors),
    // The stage calls' book (radarLedger.js stagesSealText): names open calls, so the lock keeps it out of teaserBoard.
    stagesSeal: cleanBook(doc.stagesSeal, STAGES_BOOK),
    // The radar vs luck (radarLuck.js): a random kind drawn each day, graded by the same rule.
    luck: cleanLuck(doc.luck),
    waves: cleanWaves(doc.waves),
    crowd: cleanCrowd(doc.crowd),
    // Every category in the world (worldCategories.js): how much of AliExpress's tree the radar reads.
    world: doc.world && num(doc.world.categories) !== null ? { categories: num(doc.world.categories), readToday: num(doc.world.readToday) ?? 0, fullRoundDays: num(doc.world.fullRoundDays), ...(num(doc.world.fashionDaily) ? { fashionDaily: num(doc.world.fashionDaily) } : {}) } : null,
    globe: cleanGlobe(doc.globe),
    challenge: cleanChallenge(doc.challenge),
  };
}

/** 🔮 The weekly challenge (radarChallenge.js): the open one never carries the radar's choice or the salt. */
function cleanChallenge(c) {
  if (!c || typeof c !== "object") return null;
  const seal = (s) => (s && /^[0-9a-f]{64}$/.test(String(s.sha256 || "")) ? { d: day(s.d), sha256: s.sha256, ots: (Array.isArray(s.ots) ? s.ots : []).filter((o) => OTS_HOSTS.includes(o?.cal) && /^[A-Za-z0-9+/]+=*$/.test(String(o?.b64 || "")) && String(o.b64).length <= 14_000).slice(0, 2).map((o) => ({ cal: o.cal, b64: o.b64 })) } : null);
  const opt = (o) => (ID.test(String(o?.concept || "")) && str(o.label, 30) ? { concept: o.concept, label: str(o.label, 30) } : null);
  const o = c.open && typeof c.open === "object" && /^ch-\d{4}-\d{2}-\d{2}$/.test(String(c.open.id || "")) ? c.open : null;
  return {
    open: o ? {
      id: o.id, at: day(o.at), due: day(o.due), dayN: num(o.dayN) ?? 0, source: o.source === "fresh" ? "fresh" : "concepts",
      options: (Array.isArray(o.options) ? o.options : []).slice(0, 4).map((x) => { const v = opt(x); return v ? { ...v, image: radarImage(x.image) } : null; }).filter(Boolean),
      progress: (Array.isArray(o.progress) ? o.progress : []).slice(0, 4).filter((p) => ID.test(String(p?.concept || ""))).map((p) => ({ concept: p.concept, pct: num(p.pct) })),
      seal: seal(o.seal),
    } : null,
    recent: (Array.isArray(c.recent) ? c.recent : []).slice(0, 6).filter((r) => /^ch-\d{4}-\d{2}-\d{2}$/.test(String(r?.id || "")) && (r.result === "HIT" || r.result === "MISS" || r.result === "CANCELLED")).map((r) => ({
      id: r.id, at: day(r.at), due: day(r.due), gradedAt: day(r.gradedAt), result: r.result,
      radar: ID.test(String(r.radar || "")) ? r.radar : null, radarLabel: str(r.radarLabel, 30),
      winners: (Array.isArray(r.winners) ? r.winners : []).filter((w) => ID.test(String(w))).slice(0, 4), winnerLabels: strs(r.winnerLabels, 4, 30),
      options: (Array.isArray(r.options) ? r.options : []).slice(0, 4).map((x) => { const v = opt(x); return v ? { ...v, growth: num(x.growth) } : null; }).filter(Boolean),
      text: typeof r.text === "string" && /^ch-[0-9-]+\|[0-9-]+\|[a-z0-9,-]+\|radar=[a-z0-9-]+\|salt=[0-9a-f]{32}$/.test(r.text) ? r.text : null,
      seal: seal(r.seal),
    })),
    record: { graded: num(c.record?.graded) ?? 0, radarHits: num(c.record?.radarHits) ?? 0 },
  };
}

/** The global clock (worldClock.js): known countries only, measured days only, calls by concept id. */
const CLOCK_STATUS = new Set(["ARRIVED", "PRESENT", "QUIET", "UNMEASURED"]);
const COUNTRY = new Set(CLOCK_IDS);
function cleanLuck(l) {
  if (!l || typeof l !== "object") return null;
  const cid = (v) => (typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(v) ? v : null);
  const side = (x) => ({ graded: num(x?.graded) ?? 0, hits: num(x?.hits) ?? 0, rate: num(x?.rate) });
  const t = l.today && cid(l.today.concept) && /^[0-9a-f]{64}$/.test(String(l.today.seed || "")) ? { concept: l.today.concept, at: day(l.today.at), base: num(l.today.base), due: day(l.today.due), seed: l.today.seed, pool: num(l.today.pool) } : null;
  return {
    today: t,
    versus: { radar: side(l.versus?.radar), luck: side(l.versus?.luck), edge: num(l.versus?.edge) },
    draws: num(l.draws) ?? 0,
    nextDue: day(l.nextDue),
    recent: (Array.isArray(l.recent) ? l.recent : []).slice(0, 12).filter((x) => cid(x?.concept) && (x.result === "HIT" || x.result === "MISS")).map((x) => ({ concept: x.concept, at: day(x.at), result: x.result, growth: num(x.growth) })),
    seal: cleanBook(l.seal, LUCK_BOOK),
  };
}

function cleanGlobe(g) {
  if (!g || typeof g !== "object" || !Array.isArray(g.waves)) return null;
  const call = (c) => (ID.test(String(c?.concept || "")) && COUNTRY.has(c?.country) && day(c?.at) ? { concept: c.concept, country: c.country, at: c.at, due: day(c.due), result: c.result === "HIT" || c.result === "MISS" ? c.result : null, arrivedOn: day(c.arrivedOn) } : null);
  const cl = g.calls && typeof g.calls === "object" ? g.calls : {};
  const seal = g.seal && /^[0-9a-f]{64}$/.test(String(g.seal.sha256 || "")) ? { d: day(g.seal.d), sha256: g.seal.sha256, count: num(g.seal.count) ?? 0, text: typeof g.seal.text === "string" && g.seal.text.length <= 30_000 && /^[a-z0-9|\n-]*$/.test(g.seal.text) ? g.seal.text : null, ots: (Array.isArray(g.seal.ots) ? g.seal.ots : []).filter((o) => OTS_HOSTS.includes(o?.cal) && /^[A-Za-z0-9+/]+=*$/.test(String(o?.b64 || "")) && String(o.b64).length <= 14_000).slice(0, 2).map((o) => ({ cal: o.cal, b64: o.b64 })) } : null;
  return {
    at: day(g.at),
    countries: CLOCK_COUNTRIES.map(({ id, he, flag, lang }) => ({ id, he, flag, lang })),
    base: "us",
    minPairs: num(g.minPairs) ?? 3,
    table: (Array.isArray(g.table) ? g.table : []).filter((r) => COUNTRY.has(r?.id)).map((r) => ({ id: r.id, n: num(r.n) ?? 0, medianDays: num(r.medianDays) })),
    israel: { n: num(g.israel?.n) ?? 0, medianDays: num(g.israel?.medianDays), pairs: (Array.isArray(g.israel?.pairs) ? g.israel.pairs : []).slice(0, 5).filter((x) => ID.test(String(x?.concept || "")) && day(x?.base) && day(x?.on)).map((x) => ({ concept: x.concept, base: x.base, on: x.on, days: num(x.days) })) },
    observed: num(g.observed) ?? 0,
    waves: g.waves.slice(0, 12).map((w) => (ID.test(String(w?.id || "")) && Array.isArray(w.countries) ? {
      id: w.id, he: str(w.he, 60), en: str(w.en, 60), q: str(w.q, 60), zh: str(w.zh, 40), ko: str(w.ko, 40),
      reached: num(w.reached) ?? 0, measured: num(w.measured) ?? 0, arrivals: num(w.arrivals) ?? 0, israelAfterUs: num(w.israelAfterUs),
      countries: w.countries.filter((c) => COUNTRY.has(c?.id) && CLOCK_STATUS.has(c?.status)).map((c) => ({ id: c.id, status: c.status, on: c.status === "ARRIVED" ? day(c.on) : null })),
    } : null)).filter(Boolean),
    calls: { open: (Array.isArray(cl.open) ? cl.open : []).slice(0, 12).map(call).filter(Boolean), recent: (Array.isArray(cl.recent) ? cl.recent : []).slice(0, 12).map(call).filter(Boolean), graded: num(cl.graded) ?? 0, hits: num(cl.hits) ?? 0 },
    seal,
  };
}

/** The crowd sensor (crowdSensor.js): counts per item only; a buy button only when the item passed. */
function cleanCrowd(c) {
  if (!c || typeof c !== "object") return null;
  const list = (Array.isArray(c.list) ? c.list : []).slice(0, 8).map((x) => {
    const image = radarImage(x?.image);
    if (!ITEM.test(String(x?.id || "")) || !image || num(x.people) === null || x.people < 2) return null;
    const buy = !x.blocked && typeof x.buy === "string" && BUY.test(x.buy) ? x.buy : null;
    return { id: String(x.id), title: str(x.title, 140), image, people: num(x.people), checks: num(x.checks), first: day(x.first), last: day(x.last), orders: num(x.orders), price: num(x.price), buy, blocked: ["BRAND", "TOOL"].includes(x.blocked) ? x.blocked : null, momentum: x.momentum && num(x.momentum.weekPct) !== null ? { weekPct: num(x.momentum.weekPct) } : null, check: `/magic?u=${encodeURIComponent(`https://www.aliexpress.com/item/${x.id}.html`)}` };
  }).filter(Boolean);
  return { at: day(c.at), days: num(c.days) ?? 7, list };
}

/** Waves the radar measures but never sells (brandWaves.js): counts only; a buy button only for the legal alternative. */
function cleanWaves(w) {
  if (!w || typeof w !== "object") return null;
  const list = (Array.isArray(w.list) ? w.list : []).slice(0, 8).map((c) => {
    if (!c || !["BRAND", "TOOL"].includes(c.reason) || num(c.items) === null || num(c.orders) === null) return null;
    const a = c.alt && typeof c.alt === "object" ? c.alt : null;
    const alt = a && ITEM.test(String(a.id || "")) && typeof a.buy === "string" && BUY.test(a.buy) && radarImage(a.image) ? { id: String(a.id), title: str(a.title, 140), image: radarImage(a.image), buy: a.buy, price: num(a.price), check: `/magic?u=${encodeURIComponent(`https://www.aliexpress.com/item/${a.id}.html`)}` } : null;
    const yt = c.yt && num(c.yt.videos) !== null ? { videos: num(c.yt.videos), views: num(c.yt.views), days: num(c.yt.days) ?? 7 } : null;
    const ig = c.ig && num(c.ig.posts) !== null ? { posts: num(c.ig.posts), videos: num(c.ig.videos), likes: num(c.ig.likes), comments: num(c.ig.comments), capped: c.ig.capped === true } : null;
    return { token: str(c.token, 40), reason: c.reason, reasonHe: str(c.reasonHe, 80), items: num(c.items), orders: num(c.orders), firstSeen: day(c.firstSeen), listings: num(c.listings), listingsWeekPct: num(c.listingsWeekPct), ordersWeekPct: num(c.ordersWeekPct), buzz: Array.isArray(c.buzz) ? strs(c.buzz, 4, 20) : null, yt, ig, alt };
  }).filter((c) => c && c.token);
  return { at: day(w.at), list };
}

/** New listings that start to run (freshRisers.js): the store's own words, numbers and photo only. */
function cleanFresh(f) {
  if (!f || typeof f !== "object") return null;
  const risers = (Array.isArray(f.risers) ? f.risers : []).slice(0, 12).map((r) => {
    const buy = typeof r?.buy === "string" && BUY.test(r.buy) ? r.buy : null;
    const image = radarImage(r?.image);
    if (!ITEM.test(String(r?.id || "")) || !buy || !image || num(r.weekPct) === null || num(r.orders) === null) return null;
    const check = typeof r.check === "string" && /^\/magic\?u=[A-Za-z0-9%._\-]+$/.test(r.check) ? r.check : null;
    // Shown only with its "nobody has heard of it yet" check (freshRisers.unknownCheck).
    if (!r.known || num(r.known.similar) === null) return null;
    return { id: String(r.id), title: str(r.title, 140), image, buy, check, price: num(r.price), category: str(r.category, 20), orders: num(r.orders), ordersBefore: num(r.ordersBefore), from: day(r.from), to: day(r.to), first: day(r.first), weekPct: num(r.weekPct), known: { phrase: str(r.known.phrase, 60), similar: num(r.known.similar), yt: r.known.yt && ["NONE", "EARLY"].includes(r.known.yt.level) && num(r.known.yt.videos) !== null ? { level: r.known.yt.level, videos: num(r.known.yt.videos), views: num(r.known.yt.views), days: num(r.known.yt.days) ?? 7 } : null } };
  }).filter(Boolean);
  const rec = f.record && typeof f.record === "object" ? f.record : {};
  const recent = (Array.isArray(f.recent) ? f.recent : []).slice(0, 12).filter((c) => ITEM.test(String(c?.id || "")) && (c.result === "HIT" || c.result === "MISS")).map((c) => ({ id: String(c.id), title: str(c.title, 80), at: day(c.at), result: c.result, growth: num(c.growth) }));
  return { tracking: Math.max(0, num(f.tracking) ?? 0), since: day(f.since), risers, seal: cleanBook(f.seal, FRESH_BOOK), record: { calls: num(rec.calls) ?? 0, graded: num(rec.graded) ?? 0, hits: num(rec.hits) ?? 0, accuracy: num(rec.accuracy), pending: num(rec.pending) ?? 0, nextDue: day(rec.nextDue) }, recent };
}

/**
 * The magic button's bridge: where a checked AliExpress item sits on the radar. An exact match is
 * the item being one of a concept's top items today; otherwise a concept whose Hebrew search words
 * appear in the item's store title ("looks like"). Null when the radar knows nothing about it.
 */
export function radarForItem(board, { itemId = "", title = "" } = {}) {
  const rows = Array.isArray(board?.concepts) ? board.concepts : [];
  const id = String(itemId || "").replace(/^ae-/, "");
  const pick = (c, match) => ({
    id: c.id, he: c.he, stage: c.stage, stageHe: c.stageHe, window: c.window || null, windowHe: c.windowHe || null,
    gap: c.gap?.state || "UNKNOWN", gapHe: c.gap?.he || "", confidenceHe: c.gap?.confidenceHe || null, measured: c.measured || null, auto: !!c.auto, match,
    action: c.action || null, actionHe: c.actionHe || null,
    // The checked item's own momentum when it is one of the concept's top items, or its buy pick.
    item: (match === "item" && c.hot?.[id]) ? { state: c.hot[id][0], he: HOT_STATES[c.hot[id][0]]?.he || "", weekPct: c.hot[id][1] } : null,
    isPick: Boolean(c.pick?.itemId && c.pick.itemId === id),
    // The same intelligence object as the radar's card (never recalculated here).
    alpha: c.alpha ? { score: c.alpha.score, confidence: c.alpha.confidence, confidenceHe: c.alpha.confidenceHe, verified: c.alpha.verified, coverage: c.alpha.coverage } : null,
    lifecycleHe: c.lifecycleHe || null,
    accelHe: c.accel?.he || null,
    why: c.explain?.why?.[0] || null,
    risk: c.explain?.risks?.[0] || null,
    opportunity: c.pick?.itemId && c.pick.itemId === id ? c.opportunity || null : null,
  });
  if (ITEM.test(id)) {
    const exact = rows.find((c) => Array.isArray(c.items) && c.items.includes(id));
    if (exact) return pick(exact, "item");
  }
  const t = normalize(title);
  if (t.length < 4) return null;
  let best = null;
  for (const c of rows) {
    for (const m of Array.isArray(c.match) ? c.match : []) {
      const p = normalize(m);
      if (p.length >= 4 && t.includes(p) && (!best || p.length > best.len)) best = { c, len: p.length };
    }
  }
  return best ? pick(best.c, "title") : null;
}

/** The checked item as one of the site's own products (from the board's site check), or null. */
export function siteHotFor(board, itemId = "") {
  const id = `ae-${String(itemId || "").replace(/^ae-/, "")}`;
  const rows = [...(board?.site?.hot || []), ...(board?.site?.cooling || [])];
  return rows.find((r) => r.id === id) || null;
}
