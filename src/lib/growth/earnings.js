// Real purchases and commission from the owner's AliExpress affiliate account
// (aliexpress.affiliate.order.list), summarised for the owner. Pure: no I/O.
//
// The owner, 2026-11-03: "אל תציג קליק כרכישה ואל תציג עמלה משוערת כהכנסה". So
// the buckets stay apart and say what they are:
//   PAID        "Payment Completed": the buyer paid; the store can still
//               cancel or refund it, so its commission is an ESTIMATE.
//   CONFIRMED   "Buyer Confirmed Receipt": the order was received; its
//               commission is still the store's estimate until settlement.
//   SETTLED     the commission AliExpress actually settled, only when the
//               order carries a settled amount; otherwise it is not counted.
// A number the response does not carry is null, never 0 and never guessed.

export const ORDER_STATUSES = Object.freeze({ PAID: "Payment Completed", CONFIRMED: "Buyer Confirmed Receipt" });
export const ORDER_FIELDS = Object.freeze([
  "order_id", "sub_order_id", "order_status", "paid_time", "finished_time", "product_id", "product_title",
  "paid_amount", "estimated_paid_commission", "estimated_finished_commission", "commission_rate",
  "settled_currency", "tracking_id", "effect_detail_status",
]);
export const EARNINGS_KEY = "affiliate:earnings";

/** "yyyy-MM-dd HH:mm:ss" in Pacific time: the order API reads its window there. */
export function pacificTime(ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

const arr = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []);

/** The orders in one order.list response, or { error } when the store refused the call. */
export function ordersOf(json) {
  const resp = json?.aliexpress_affiliate_order_list_response?.resp_result;
  if (!resp) return { error: "no_resp_result", orders: [] };
  if (resp.resp_code !== undefined && Number(resp.resp_code) !== 200) {
    return { error: `resp_${resp.resp_code}:${String(resp.resp_msg || "").slice(0, 60)}`, orders: [] };
  }
  const result = resp.result || {};
  const orders = arr(result.orders?.order ?? result.orders);
  return { orders, total: Number(result.total_record_count ?? result.current_record_count ?? orders.length), pages: Number(result.total_page_no ?? 1) || 1 };
}

/** A money value the order carries ("1.23", 1.23, "1.23 USD"), else null. */
export function money(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * An order.list amount in currency units. The store sends its amounts as whole
 * cents ("1199" is 11.99): the first live sync (2026-11-05) stored 8 paid toy
 * orders as 6100 paid and one squishy toy's commission as 47, i.e. $61.00 and
 * $0.47. A value written with a decimal point ("10.00", "1.5 USD") is already
 * in units and is kept as it is.
 */
export function storeMoney(v) {
  const n = money(v);
  if (n === null) return null;
  return /\./.test(String(v)) ? n : n / 100;
}

const add = (a, b) => (b === null ? a : (a ?? 0) + b);
const round2 = (n) => (n === null ? null : Math.round(n * 100) / 100);

/**
 * The owner's numbers from the orders of each status: counts, the paid
 * amount, the store's estimated commission, the settled commission (only when
 * carried), and per AliExpress item. Orders are deduplicated by sub-order id.
 */
export function summarizeOrders({ paid = [], confirmed = [] } = {}) {
  const seen = new Set();
  const bucket = () => ({ orders: 0, paidAmount: null, estimatedCommission: null, settledCommission: null, currency: null });
  const out = { amounts: "units", paid: bucket(), confirmed: bucket(), items: {} };
  for (const [name, list] of [["confirmed", confirmed], ["paid", paid]]) {
    for (const o of list) {
      const id = String(o?.sub_order_id || o?.order_id || "");
      if (!id || seen.has(id)) continue; // a confirmed order is not counted again as paid
      seen.add(id);
      const b = out[name];
      b.orders += 1;
      b.paidAmount = add(b.paidAmount, storeMoney(o.paid_amount));
      const est = storeMoney(name === "confirmed" ? (o.estimated_finished_commission ?? o.estimated_paid_commission) : o.estimated_paid_commission);
      b.estimatedCommission = add(b.estimatedCommission, est);
      b.settledCommission = add(b.settledCommission, storeMoney(o.settled_commission ?? o.finished_commission));
      b.currency = b.currency || (o.settled_currency ? String(o.settled_currency).slice(0, 8) : null);
      const item = String(o.product_id || "");
      if (item) {
        const it = (out.items[item] ||= { orders: 0, estimatedCommission: null, title: String(o.product_title || "").slice(0, 80) || null });
        it.orders += 1;
        it.estimatedCommission = add(it.estimatedCommission, est);
      }
    }
  }
  for (const b of [out.paid, out.confirmed]) {
    b.paidAmount = round2(b.paidAmount);
    b.estimatedCommission = round2(b.estimatedCommission);
    b.settledCommission = round2(b.settledCommission);
  }
  for (const it of Object.values(out.items)) it.estimatedCommission = round2(it.estimatedCommission);
  return out;
}

/** One Hebrew line per number the owner reads; an estimate is always called one. */
export function earningsLines(e) {
  if (!e) return ["אין עדיין נתוני הזמנות מחשבון השותפים."];
  if (e.state && e.state !== "OK") return [`נתוני ההזמנות לא נקראו: ${e.state}${e.error ? ` (${e.error})` : ""}`];
  const cur = e.paid?.currency || e.confirmed?.currency || "";
  const fmt = (n) => (n === null || n === undefined ? "לא ידוע" : `${n} ${cur}`.trim());
  return [
    `הזמנות ששולמו (עוד לא סופי): ${e.paid.orders} · עמלה משוערת ${fmt(e.paid.estimatedCommission)}`,
    `הזמנות שהתקבלו אצל הקונה: ${e.confirmed.orders} · עמלה משוערת ${fmt(e.confirmed.estimatedCommission)}`,
    `עמלה ששולמה בפועל: ${fmt(e.confirmed.settledCommission ?? null)}`,
  ];
}
