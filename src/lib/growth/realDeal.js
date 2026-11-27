// 🏷️ המבצע האמיתי (the owner, 2026-11-16: "תחשוב ותבצע" — everyone needs it now, they can't do
// without it). Black Friday is 27.11.2026; a global study (Israel Hayom, 11.2025) found 84% of
// shoppers believe prices are raised before a sale, and nobody hands them proof. The radar already
// asks AliExpress's official affiliate API about thousands of items every morning (in shekels, ship to
// Israel); from today it keeps each item's "from" price per day, seals every day's list in Bitcoin
// (OpenTimestamps: nobody, not even LikeLink2, can change a past price afterwards), and the magic button
// answers for any checked item whether a "sale" is really below the price it usually had, or only back
// to normal after a raise (the Which? method: the price history before the sale). Recorded prices only,
// never a guess; an item with too short a history says since when it is tracked. Pure; the radar run
// records (scripts/catalog/trend-radar.mjs), the deploy publishes (scripts/catalog/price-ledger.mjs).

/** Where the deploy publishes the ledger (GitHub Pages sends Access-Control-Allow-Origin: *). */
export const PRICES_HOME = "https://hen63165-dotcom.github.io/likelink/radar/prices";

export const PRICE = Object.freeze({
  keep: 90, // daily prices kept per item
  minReadings: 3, // earlier readings needed before any verdict…
  minSpanDays: 5, // …spanning at least this many days
  recentDays: 14, // the "recent high" window (a raise before the sale)
  belowPct: 5, // this far under the usual price is a real deal
  fromHighPct: 13, // this far under the recent high reads as a "sale" to a shopper
  higherPct: 5,
});

const DAY = 86_400_000;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const round2 = (n) => Math.round(n * 100) / 100;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : round2((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};
export const dm = (d) => (typeof d === "string" && d.length >= 10 ? `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}` : "");
export const shekel = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

/** Adds one day's price to an item's series (one per day; the latest the same day wins). */
export function addPrice(series = [], [d, p] = [], { rules = PRICE } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d)) || !Number.isFinite(p) || p <= 0) return Array.isArray(series) ? series : [];
  const prev = (Array.isArray(series) ? series : []).filter((r) => Array.isArray(r) && r[0] !== d);
  return [...prev, [d, round2(p)]].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-rules.keep);
}

/**
 * Records every shekel "from" price in one AliExpress answer (pure on the ledger it is given): any
 * `*_response.resp_result.result.products.product` list, items with `target_sale_price_currency` ILS.
 */
export function sniffPrices(answer, today, ledger) {
  if (!answer || typeof answer !== "object" || !ledger) return 0;
  let n = 0;
  for (const v of Object.values(answer)) {
    const raw = v?.resp_result?.result?.products?.product;
    for (const x of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const id = String(x?.product_id || "");
      const p = String(x?.target_sale_price_currency || "") === "ILS" ? Number(x.target_sale_price) : NaN;
      if (!/^\d{6,20}$/.test(id) || !(p > 0)) continue;
      ledger[id] = addPrice(ledger[id], [today, p]);
      n += 1;
    }
  }
  return n;
}

/** The sealed text of one day (pure): every item priced that day, "id|price", sorted. */
export function dayText(ledger = {}, d) {
  const lines = [];
  for (const [id, s] of Object.entries(ledger || {})) {
    const r = (Array.isArray(s) ? s : []).find((x) => x[0] === d);
    if (r) lines.push(`${id}|${r[1]}`);
  }
  return lines.sort().join("\n");
}

/** Which public shard holds an item (pure): its last two digits. */
export const priceShard = (id) => String(id || "").slice(-2).padStart(2, "0");

/** The ledger split into the 100 public shards (pure). */
export function shardsOf(ledger = {}) {
  const out = {};
  for (const [id, s] of Object.entries(ledger || {})) (out[priceShard(id)] ||= {})[id] = s;
  return out;
}

/**
 * The verdict for a price now against the item's recorded history before today (pure; tested):
 *   REAL_LOW  — under the usual price and the lowest recorded: a real deal;
 *   LOWER     — under the usual price by at least `belowPct`: a real deal;
 *   RAISED    — far under the recent high but not under the usual price, and the record shows the price at
 *               today's level BEFORE it went up (`from`): the "sale" only undoes a raise the radar saw;
 *   DROPPED   — far under the recent high but not under the usual price, and the high opens the record: the
 *               radar saw the price fall (`fell`) and stay (`steady` readings), and what came before its
 *               record is outside it. Never called a raise (27.11: 170 of 26.11's 205 "raised" were these —
 *               items that fell when the sale began on 20.11, after only four recorded days at the old price);
 *   HIGHER    — above the usual price;
 *   SAME      — like the usual price;
 *   SHORT     — tracked, but too little history yet (says since when);
 *   UNTRACKED — no recorded price.
 */
export function dealVerdict(series = [], { price = null, today = null } = {}, { rules = PRICE } = {}) {
  const all = (Array.isArray(series) ? series : []).filter((r) => Array.isArray(r) && Number.isFinite(r[1]) && r[1] > 0);
  if (!all.length) return { state: "UNTRACKED" };
  const day = today || all.at(-1)[0];
  const now = Number.isFinite(price) && price > 0 ? price : all.at(-1)[0] === day ? all.at(-1)[1] : null;
  const hist = all.filter((r) => r[0] < day);
  const since = all[0][0];
  if (!now || hist.length < rules.minReadings || days(hist[0][0], day) < rules.minSpanDays) return { state: "SHORT", since, readings: all.length };
  const usual = median(hist.map((r) => r[1]));
  const low = Math.min(...hist.map((r) => r[1]));
  const recent = hist.filter((r) => days(r[0], day) <= rules.recentDays);
  const high = recent.reduce((m, r) => (r[1] > m[1] ? r : m), recent[0] || hist.at(-1));
  const vsUsual = Math.round((now / usual - 1) * 100);
  const base = { now: round2(now), usual, low, since, high: high ? { d: high[0], p: high[1] } : null, vsUsual, readings: hist.length };
  if (now <= usual * (1 - rules.belowPct / 100)) return { state: now <= low ? "REAL_LOW" : "LOWER", ...base };
  if (high && high[1] >= now * (1 + rules.fromHighPct / 100)) {
    // A raise undone needs a recorded price at (or about) today's level before the high.
    const from = hist.filter((r) => r[0] < high[0] && r[1] <= now * (1 + rules.belowPct / 100)).at(-1);
    if (from) return { state: "RAISED", ...base, from: { d: from[0], p: from[1] } };
    // Otherwise the radar saw a drop: the first day of today's level, counted back from today.
    const after = [...hist.filter((r) => r[0] > high[0]), [day, round2(now)]];
    let i = after.length - 1;
    while (i > 0 && Math.abs(after[i - 1][1] / now - 1) <= rules.belowPct / 100) i -= 1;
    return { state: "DROPPED", ...base, fell: after[i][0], steady: after.length - i };
  }
  if (now >= usual * (1 + rules.higherPct / 100)) return { state: "HIGHER", ...base };
  return { state: "SAME", ...base };
}

/** The verdict in words (pure): what IS, with the recorded numbers and dates. */
export function dealLines(v) {
  const s = v?.state;
  if (s === "REAL_LOW") return { tone: "good", title: "✅ מבצע אמיתי", text: `₪${shekel(v.now)} הוא המחיר הכי נמוך שהרדאר רשם מאז ${dm(v.since)}. המחיר הרגיל שרשמנו: ₪${shekel(v.usual)} (${v.vsUsual}%).` };
  if (s === "LOWER") return { tone: "good", title: "✅ מבצע אמיתי", text: `₪${shekel(v.now)} נמוך ב־${Math.abs(v.vsUsual)}% מהמחיר הרגיל שהרדאר רשם מאז ${dm(v.since)} (₪${shekel(v.usual)}).` };
  if (s === "RAISED") return { tone: "warn", title: "⚠️ הנחה אחרי העלאה", text: `ב־${dm(v.from.d)} הרדאר רשם ₪${shekel(v.from.p)}. ב־${dm(v.high.d)} המחיר עלה ל־₪${shekel(v.high.p)}. עכשיו ₪${shekel(v.now)}: „ההנחה” מחזירה אותו למחיר של לפני ההעלאה.` };
  if (s === "DROPPED") return { tone: "info", title: `📉 ירד ב־${dm(v.fell)} ונשאר`, text: `ב־${dm(v.high.d)} הרדאר רשם ₪${shekel(v.high.p)}. מ־${dm(v.fell)} המחיר בערך ₪${shekel(v.now)} (${v.steady} בקרים ברצף). הרישום של הרדאר מתחיל ב־${dm(v.since)}, ולכן על מה שהיה לפני כן הוא נמנע מלקבוע.` };
  if (s === "HIGHER") return { tone: "warn", title: "📈 גבוה מהרגיל", text: `₪${shekel(v.now)} גבוה ב־${v.vsUsual}% מהמחיר הרגיל שהרדאר רשם מאז ${dm(v.since)} (₪${shekel(v.usual)}). אפשר לחכות.` };
  if (s === "SAME") return { tone: "info", title: "המחיר הרגיל", text: `₪${shekel(v.now)}, כמו המחיר שהרדאר רושם מאז ${dm(v.since)} (₪${shekel(v.usual)}).` };
  if (s === "SHORT") return { tone: "info", title: "⏳ במעקב", text: `הרדאר רושם את המחיר של המוצר הזה כל בוקר מ־${dm(v.since)}. עוד כמה ימים תהיה כאן היסטוריה מלאה.` };
  return { tone: "info", title: "🏷️ המבצע האמיתי", text: "המחיר של מוצר נכנס למעקב יומי ברגע ששני אנשים שונים בודקים אותו כאן. מאותו בוקר הרדאר רושם אותו כל יום, וכל יום נחתם בביטקוין." };
}

/** A line to send a friend (pure; empty when there is nothing measured to say). */
export function dealShareText(v, title = "") {
  const name = String(title || "").slice(0, 50);
  if (v?.state === "REAL_LOW" || v?.state === "LOWER") return `🏷️ בדקתי ברדאר של LikeLink2${name ? ` את ${name}` : ""}: מבצע אמיתי, ₪${shekel(v.now)} מול ₪${shekel(v.usual)} במחיר הרגיל שנרשם מאז ${dm(v.since)}. המחירים חתומים בביטקוין.`;
  if (v?.state === "RAISED") return `🏷️ בדקתי ברדאר של LikeLink2${name ? ` את ${name}` : ""}: ב־${dm(v.from.d)} ₪${shekel(v.from.p)}, ב־${dm(v.high.d)} המחיר עלה ל־₪${shekel(v.high.p)}, וה"הנחה" מחזירה אותו ל־₪${shekel(v.now)}. המחירים חתומים בביטקוין.`;
  if (v?.state === "DROPPED") return `🏷️ בדקתי ברדאר של LikeLink2${name ? ` את ${name}` : ""}: המחיר הזה (₪${shekel(v.now)}) כבר כאן מ־${dm(v.fell)}, ${v.steady} בקרים ברצף. המחירים חתומים בביטקוין.`;
  return "";
}

/**
 * The public tally of one day (pure): items whose price today is far under their recent high (what a
 * shopper sees as a sale), split into real deals (under the usual price), raises the radar saw undone
 * (`raised`), and drops the radar saw begin that have since held (`dropped`, never counted as a raise).
 */
export function honestTally(ledger = {}, d, { rules = PRICE } = {}) {
  let sales = 0, real = 0, raised = 0, dropped = 0;
  for (const s of Object.values(ledger || {})) {
    const today = (Array.isArray(s) ? s : []).find((r) => r[0] === d);
    if (!today) continue;
    const v = dealVerdict(s, { price: today[1], today: d }, { rules });
    if (!v.high || !(v.high.p >= today[1] * (1 + rules.fromHighPct / 100))) continue;
    sales += 1;
    if (v.state === "REAL_LOW" || v.state === "LOWER") real += 1;
    else if (v.state === "RAISED") raised += 1;
    else if (v.state === "DROPPED") dropped += 1;
  }
  return { d, sales, real, raised, dropped };
}
