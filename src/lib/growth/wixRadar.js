// The radar inside a Wix store's dashboard (the owner, 2026-11-20: "כן לאפליקציה"). A Wix app's
// dashboard page is an https page that Wix shows in an iframe (a self-managed dashboard page
// extension); Wix adds `locale` (and the signed `instance`, unused here) to its address. This is the
// page's whole logic, pure: the same sanitized public board the /radar page reads (radarBoard.js
// sanitizeBoard), seen by a store owner — today's call or "עוד שקט", the new products starting to
// run, the kinds of the categories the store sells, the public record and the day's seal. Nothing is
// written anywhere; the store's own data is never read (no Wix permission is asked for).
// Wording follows the site's rules: what IS, measured numbers with their dates, never a promise.

export const WIX_RADAR = Object.freeze({
  path: "/wix/radar",
  // The only pages allowed to show it in a frame: Wix's own dashboard hosts (vercel.json).
  frameAncestors: ["https://manage.wix.com", "https://*.wix.com"],
  radarUrl: "https://likelink2.vercel.app/radar?utm_source=wix&utm_medium=dashboard",
  rows: 30,
});

/** Wix sends the dashboard's language as `locale` ("he", "en", "he-IL"…). Hebrew or English. */
export function wixLang(search = "") {
  let locale = "";
  try { locale = new URLSearchParams(search).get("locale") || ""; } catch { locale = ""; }
  return /^he\b/i.test(locale.trim()) ? "he" : "en";
}

export const KIND_LABELS = Object.freeze({
  style: { he: "סגנונות אופנה", en: "Fashion styles" },
  clothing: { he: "בגדים", en: "Clothing" },
  bags: { he: "תיקים", en: "Bags" },
  earrings: { he: "עגילים", en: "Earrings" },
  necklaces: { he: "שרשראות", en: "Necklaces" },
  bracelets: { he: "צמידים", en: "Bracelets" },
  rings: { he: "טבעות", en: "Rings" },
  watches: { he: "שעונים", en: "Watches" },
  hair: { he: "שיער", en: "Hair" },
  makeup: { he: "איפור וטיפוח", en: "Makeup & beauty" },
  home: { he: "בית", en: "Home" },
  kitchen: { he: "מטבח", en: "Kitchen" },
  kids: { he: "ילדים", en: "Kids" },
  gadgets: { he: "גאדג׳טים", en: "Gadgets" },
  fitness: { he: "כושר", en: "Fitness" },
  pets: { he: "חיות מחמד", en: "Pets" },
  car: { he: "רכב", en: "Car" },
});

export const STAGE_LABELS = Object.freeze({
  EMERGING: { he: "מתחיל לעלות", en: "Emerging" },
  RISING: { he: "עולה", en: "Rising" },
  PEAK: { he: "בשיא", en: "At its peak" },
  STEADY: { he: "יציב", en: "Steady" },
  COOLING: { he: "מתקרר", en: "Cooling" },
  UNVERIFIED: { he: "בשלב המדידה", en: "Being measured" },
});
const STAGE_ORDER = ["EMERGING", "RISING", "PEAK", "STEADY", "COOLING", "UNVERIFIED"];

export const WORLD_LABELS = Object.freeze({
  VIRAL_NOW: { he: "בטרנדים של גוגל היום", en: "In Google's trending searches today" },
  SPREADING: { he: "מתפשט בעולם", en: "Spreading to more countries" },
  EARLY: { he: "מתחילים לחפש בעולם", en: "Searched in one or two countries" },
  WIDE: { he: "מחפשים בהרבה מדינות", en: "Searched in many countries" },
  NONE: { he: "עוד שקט בעולם", en: "Quiet in searches abroad" },
  UNVERIFIED: { he: "בשלב המדידה", en: "Being measured" },
});

export const SIGNAL_LABELS = Object.freeze({
  world: { he: "חיפושים בעולם", en: "searches abroad" },
  demand: { he: "ביקוש", en: "demand" },
  supply: { he: "מוכרים חדשים", en: "new sellers" },
  israel: { he: "ישראל", en: "Israel" },
});

const label = (map, key, lang) => (map[key] ? map[key][lang] : key);
export const kindLabel = (kind, lang = "en") => label(KIND_LABELS, kind, lang) || kind;
export const stageLabel = (stage, lang = "en") => label(STAGE_LABELS, stage, lang);
export const conceptName = (c, lang = "en") => (lang === "he" ? c?.he : c?.en) || c?.en || c?.he || c?.id || "";

/** The AliExpress page of an item (never a tracked link: this page earns nothing and says so by being plain). */
export const itemPage = (id) => (/^\d{6,20}$/.test(String(id || "")) ? `https://www.aliexpress.com/item/${id}.html` : null);

const boardDay = (board) => String(board?.at || "").slice(0, 10);

/** The kinds of product on the board, with how many concepts each has, biggest first. */
export function kindsOf(board) {
  const count = new Map();
  for (const c of board?.concepts || []) if (c?.kind) count.set(c.kind, (count.get(c.kind) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([kind, n]) => ({ kind, n }));
}

/**
 * The concepts of the chosen kinds (all when none is chosen): moving stages first, then the fastest
 * weekly change in orders. Every number is the board's own measurement with its dates.
 */
export function rowsFor(board, kinds = [], { limit = WIX_RADAR.rows } = {}) {
  const want = new Set((kinds || []).filter(Boolean));
  const rows = (board?.concepts || [])
    .filter((c) => c && (!want.size || want.has(c.kind)))
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      he: c.he,
      en: c.en,
      stage: STAGE_ORDER.includes(c.stage) ? c.stage : "UNVERIFIED",
      orders: c.today?.orders ?? null,
      ordersWeekPct: c.accel && Number.isFinite(c.accel.weekPct) ? c.accel.weekPct : null,
      ordersFrom: c.accel?.from || null,
      ordersTo: c.accel?.to || null,
      sellersWeekPct: c.factory && Number.isFinite(c.factory.weekPct) ? c.factory.weekPct : null,
      sellers: c.today?.listings ?? null,
      world: c.world?.state && WORLD_LABELS[c.world.state] ? c.world.state : null,
      measured: c.measured || null,
    }));
  rows.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || (b.ordersWeekPct ?? -1e9) - (a.ordersWeekPct ?? -1e9) || (a.id < b.id ? -1 : 1));
  return { total: rows.length, rows: rows.slice(0, limit) };
}

/**
 * Today's verdict: the early calls sealed on the board's day, the concepts on the brink (3 of the 4
 * signals today, the missing one named) and, on a quiet day, nothing else.
 */
export function verdictOf(board) {
  const d = boardDay(board);
  const byId = new Map((board?.concepts || []).map((c) => [c.id, c]));
  const calls = (board?.early?.ledger || [])
    .filter((e) => e.at === d && !e.result)
    .map((e) => ({ id: e.concept, concept: byId.get(e.concept) || { id: e.concept }, at: e.at, due: e.due }));
  const brink = (board?.concepts || [])
    .filter((c) => c?.early && c.early.level !== "CALL" && c.early.count === 3)
    .map((c) => ({ id: c.id, concept: c, missing: Object.keys(SIGNAL_LABELS).filter((k) => c.early.signals?.[k] !== true) }))
    .slice(0, 5);
  return { day: d, calls, brink, quiet: !calls.length };
}

/** New products starting to run (freshRisers.js), with the plain item page instead of a store button. */
export function freshOf(board) {
  return (board?.fresh?.risers || []).map((r) => ({
    id: r.id, title: r.title, image: r.image, page: itemPage(r.id),
    orders: r.orders, ordersBefore: r.ordersBefore, from: r.from, to: r.to, weekPct: r.weekPct,
    similar: r.known?.similar ?? null, sure: r.sure ?? null,
    // ⏳ The window clock (radarWindow.js): shown only once it gives a calibrated chance.
    window: r.window?.state === "READY" ? { h: r.window.h, p: r.window.p, line: r.window.line } : null,
  })).filter((r) => r.page);
}

/** New kinds found by meaning (newKinds.js), each with up to 3 of its listings. */
export function newKindsOf(board) {
  return (board?.kinds?.list || []).map((k) => ({
    en: k.en, members: k.members, medianWeekPct: k.medianWeekPct, orders: k.orders, similar: k.known?.similar ?? null,
    samples: (k.samples || []).map((s) => ({ id: s.id, title: s.title, image: s.image, page: itemPage(s.id) })).filter((s) => s.page),
  }));
}

const rec = (r) => ({ calls: r?.calls ?? 0, graded: r?.graded ?? 0, hits: r?.hits ?? 0, accuracy: r?.accuracy ?? null, nextDue: r?.nextDue || null });

/** The public record, book by book: what was called, what was graded, what hit. */
export function recordOf(board) {
  const books = [
    { id: "early", ...rec(board?.early?.record) },
    { id: "stages", ...rec(board?.record) },
    { id: "fresh", ...rec(board?.fresh?.record) },
    { id: "kinds", ...rec(board?.kinds?.record) },
  ];
  const graded = books.reduce((s, b) => s + b.graded, 0);
  const due = books.map((b) => b.nextDue).filter(Boolean).sort()[0] || null;
  return { books, graded, hits: books.reduce((s, b) => s + b.hits, 0), calls: books.reduce((s, b) => s + b.calls, 0), nextDue: due };
}

/** The day's seal: the ledger root (one SHA-256 over every book) and the days already inside Bitcoin. */
export function proofOf(board) {
  const l = board?.ledger;
  const anchors = board?.anchors?.list || [];
  return {
    root: l?.sha256 ? { d: l.d, sha256: l.sha256, books: l.text ? l.text.split("\n").map((x) => x.split("=")[0]) : [] } : null,
    anchored: anchors[0] ? { d: anchors[0].d, height: anchors[0].height, block: anchors[0].block } : null,
    pending: board?.anchors?.pending ?? 0,
  };
}

/** "+12%" / "−4%" / "0%" in either language (the sign is never left to guess). */
export function pct(n) {
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n);
  return r > 0 ? `+${r}%` : r < 0 ? `−${Math.abs(r)}%` : "0%";
}

/** "d.m" for Hebrew, "Mon d" for English, from yyyy-mm-dd. */
export function shortDay(d, lang = "en") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
  if (!m) return "";
  if (lang === "he") return `${Number(m[3])}.${Number(m[2])}`;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1]} ${Number(m[3])}`;
}

/** Hours and minutes until the next reading, from the board's own schedule (worldPulse.nextReadingAt). */
export function untilText(ms, lang = "en") {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return lang === "he" ? `${h}:${String(m).padStart(2, "0")} שעות` : `${h}h ${m}m`;
}
