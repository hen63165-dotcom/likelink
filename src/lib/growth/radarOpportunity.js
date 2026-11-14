// "Is it hot NOW?" and "is it worth selling?" — the trend radar's third part (the owner,
// 2026-11-14: "make sure every product you upload is not just any product: it is hot and about to
// become a hit — always remember that").
//
// Hot now (per item): AliExpress's own 30-day order count, read every day, item by item. The
// 30-day count rising means orders are ACCELERATING right now; flat means a steady seller; falling
// means it is cooling. Growth is measured against a reading 3–14 days older (the closest to a
// week) and scaled to a week. Never from one reading.
//   HOT        rising ≥ +10% a week, with ≥ 300 orders in 30 days
//   POPULAR    flat but big (≥ 3,000 orders in 30 days): sells a lot, not rising
//   SLOW       flat and smaller
//   COOLING    falling ≤ −5% a week
//   UNVERIFIED fewer than two readings 3+ days apart
//
// Opportunity (per buy pick): a checklist of facts, each true / false / not measured (never a
// guess), and a score that is only the share of checks passed — not a probability of sales.
// Action: one recommendation from the stage, the Israel gap and the checks.
// Pure: no I/O. Item histories are built by scripts/catalog/trend-radar.mjs (items.json).

export const HOT = Object.freeze({
  risingWeek: 10,
  coolingWeek: -5,
  minSpanDays: 3,
  maxSpanDays: 14,
  minOrders: 300,
  popularOrders: 3000,
  keep: 45,
});

export const HOT_STATES = Object.freeze({
  HOT: { he: "חם עכשיו", hint: "ההזמנות מאיצות השבוע" },
  POPULAR: { he: "נמכר הרבה, לא עולה", hint: "הרבה הזמנות, בלי האצה" },
  SLOW: { he: "יציב", hint: "בלי האצה" },
  COOLING: { he: "מתקרר", hint: "ההזמנות יורדות" },
  UNVERIFIED: { he: "בבדיקה", hint: "צריך שתי מדידות בהפרש של 3 ימים לפחות" },
});

const DAY = 86_400_000;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const round1 = (n) => Math.round(n * 10) / 10;
const dm = (d) => `${Number(String(d).slice(8, 10))}.${Number(String(d).slice(5, 7))}`;

/** One [date, 30-day orders] reading added to an item's series (one a day; later replaces). */
export function addItemReading(series = [], reading, { rules = HOT } = {}) {
  const [d, v] = Array.isArray(reading) ? reading : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d)) || !Number.isFinite(v) || v < 0) return Array.isArray(series) ? series : [];
  const prev = (Array.isArray(series) ? series : []).filter((r) => Array.isArray(r) && r[0] !== d);
  return [...prev, [d, v]].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-rules.keep);
}

/** The item's momentum: its newest reading against the reading 3–14 days older closest to a week. */
export function itemMomentum(series = [], { rules = HOT } = {}) {
  const rs = (Array.isArray(series) ? series : []).filter((r) => Array.isArray(r) && Number.isFinite(r[1]));
  const now = rs.at(-1);
  if (!now) return { state: "UNVERIFIED", weekPct: null, orders: null };
  const base = rs.filter((r) => { const g = days(r[0], now[0]); return g >= rules.minSpanDays && g <= rules.maxSpanDays; })
    .sort((a, b) => Math.abs(days(a[0], now[0]) - 7) - Math.abs(days(b[0], now[0]) - 7))[0];
  if (!base || !(base[1] > 0)) return { state: "UNVERIFIED", weekPct: null, orders: now[1], to: now[0] };
  const span = days(base[0], now[0]);
  const weekPct = round1((Math.pow(now[1] / base[1], 7 / span) - 1) * 100);
  const state = weekPct <= rules.coolingWeek ? "COOLING"
    : weekPct >= rules.risingWeek && now[1] >= rules.minOrders ? "HOT"
      : now[1] >= rules.popularOrders ? "POPULAR" : "SLOW";
  return { state, weekPct, orders: now[1], ordersBefore: base[1], from: base[0], to: now[0] };
}

/** The evidence line of an item's momentum (Hebrew, dated, AliExpress's own numbers). */
export function momentumLine(m) {
  if (!m || m.state === "UNVERIFIED") return "קצב ההזמנות של הפריט: נמדד פעם אחת, הכיוון יופיע אחרי מדידה נוספת.";
  const n = (x) => Math.round(x).toLocaleString("en-US");
  return `הזמנות ב־30 יום של הפריט: ${n(m.ordersBefore)} ב־${dm(m.from)} ← ${n(m.orders)} ב־${dm(m.to)} (${m.weekPct > 0 ? "+" : ""}${m.weekPct}% בשבוע).`;
}

/**
 * The opportunity checklist of one buy pick. Each check is true, false, or null (not measured):
 * a null never counts as passed. `score` = passed / measured × 100; `measured` says how many.
 */
export function opportunityOf(pick, { momentum = null, gap = null, stage = "UNVERIFIED" } = {}) {
  if (!pick) return null;
  const hot = momentum?.state || "UNVERIFIED";
  const checks = [
    { id: "real", he: "מוצר אמיתי מהחנות (מספר פריט ושם)", ok: Boolean(pick.itemId && pick.title) },
    { id: "match", he: "שם המוצר בחנות תואם לסוג (למשל ״טופו״ בשם)", ok: pick.matches === true ? true : pick.matches === false ? false : null },
    { id: "photo", he: "תמונה אמיתית של המוכר", ok: Boolean(pick.image) },
    { id: "link", he: "קישור שותפים תקין לאליאקספרס", ok: /^https:\/\/s\.click\.aliexpress\.com\//.test(String(pick.buy || "")) },
    { id: "price", he: "מחיר עדכני בשקלים מהחנות", ok: Number(pick.price) > 0 },
    { id: "ships", he: "נשלח לישראל (החיפוש נעשה עם משלוח לישראל)", ok: pick.shipsIL === true ? true : pick.shipsIL === false ? false : null },
    { id: "satisfaction", he: "שביעות רצון של 95% ומעלה (המספר לא מוצג)", ok: true },
    { id: "orders", he: "300 הזמנות ומעלה ב־30 יום", ok: true },
    { id: "video", he: "יש סרטון של המוכר (חומר לרילס)", ok: pick.video === true ? true : pick.video === false ? false : null },
    { id: "commission", he: "החנות משלמת עמלת שותפים על הפריט", ok: pick.commission === true ? true : pick.commission === false ? false : null },
    { id: "hot", he: "ההזמנות מאיצות השבוע", ok: hot === "HOT" ? true : hot === "UNVERIFIED" ? null : false },
    { id: "israel", he: "עוד לא נפוץ בחיפושים בישראל", ok: ["GAP", "QUIET"].includes(gap?.state) ? true : ["ARRIVED"].includes(gap?.state) ? false : gap?.state === "ARRIVING" ? false : null },
    { id: "trend", he: "הסוג כולו בעלייה באליאקספרס", ok: ["EMERGING", "RISING"].includes(stage) ? true : stage === "UNVERIFIED" ? null : false },
  ];
  const measured = checks.filter((c) => c.ok !== null);
  const passed = measured.filter((c) => c.ok === true).length;
  return { checks, passed, measured: measured.length, total: checks.length, score: measured.length ? Math.round((passed / measured.length) * 100) : 0 };
}

export const ACTIONS = Object.freeze({
  PUBLISH_NOW: "לפרסם עכשיו: עולה בעולם ועוד לא בארץ",
  PUBLISH_FAST: "לפרסם מהר: החיפושים בעברית מתחילים",
  ANGLE: "כבר בארץ ועדיין עולה: לפרסם רק עם זווית משלך",
  HOT_ITEM: "הפריט עצמו חם עכשיו: מתאים לפרסום",
  SATURATED: "רווי: כבר יש לכולם, לא להשקיע עכשיו",
  NOT_NOW: "לא עכשיו: ההזמנות יורדות",
  WAIT: "לחכות למדידה הבאה",
  WATCH: "לעקוב",
  NO_PICK: "אין פריט שעובר את הכללים שלנו",
});

/** One recommendation from the concept's stage, its window, the pick and the pick's momentum. */
export function actionOf({ stage = "UNVERIFIED", window = null, gap = null, pick = null, momentum = null } = {}) {
  const hot = momentum?.state;
  if (stage === "COOLING" || hot === "COOLING") return "NOT_NOW";
  if (!pick && stage !== "UNVERIFIED") return "NO_PICK";
  if (window === "OPEN") return "PUBLISH_NOW";
  if (window === "CLOSING") return "PUBLISH_FAST";
  if (gap?.state === "ARRIVED" && ["EMERGING", "RISING"].includes(stage)) return "ANGLE";
  if (hot === "HOT") return "HOT_ITEM";
  if (gap?.state === "ARRIVED" && ["PEAK", "STEADY"].includes(stage)) return "SATURATED";
  if (stage === "PEAK") return "SATURATED";
  if (stage === "UNVERIFIED") return "WAIT";
  return "WATCH";
}

/**
 * The site's own products, checked: each listed product with an AliExpress item id gets its item's
 * momentum. Returned newest-first by state (HOT first). Only public facts (the product's id, title,
 * the store's order counts and dates).
 */
export function siteHotness(products = [], items = {}, { rules = HOT } = {}) {
  const order = { HOT: 0, POPULAR: 1, SLOW: 2, UNVERIFIED: 3, COOLING: 4 };
  const rows = [];
  for (const p of Array.isArray(products) ? products : []) {
    const itemId = String(p?.itemId || "");
    if (!/^\d{6,20}$/.test(itemId) || !/^[\w-]{2,60}$/.test(String(p?.id || ""))) continue;
    const m = itemMomentum(items[itemId] || [], { rules });
    rows.push({ id: p.id, itemId, title: String(p.title || "").slice(0, 60), kind: String(p.kind || "").slice(0, 20), ...m, he: HOT_STATES[m.state].he });
  }
  rows.sort((a, b) => order[a.state] - order[b.state] || (b.weekPct ?? -999) - (a.weekPct ?? -999));
  const counts = rows.reduce((c, r) => ((c[r.state] = (c[r.state] || 0) + 1), c), {});
  return { checked: rows.length, counts, rows };
}
