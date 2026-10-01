// Subscription cancellation terms — ONE pure function used by the cancel API
// (api/store.mjs sub=cancel), the pricing page and the cancellation policy
// (src/lib/legal/documents.js), so the numbers a customer reads are the
// numbers the server applies.
//
// Grounded in the Israeli Consumer Protection Law (sources and the points left
// for the attorney are kept in the owner's private notes, not in this repo):
//   • 14ג — a distance transaction may be cancelled within 14 days; the
//     cancellation fee may not exceed 5% of the price or ₪100, the lower.
//   • 13ד — an ongoing transaction ends within 3 business days of the notice,
//     and nothing may be charged for service after the cancellation date.
//   • 13א — a fixed-term transaction may not continue automatically after its
//     end. The yearly plan is therefore 12 months WITHOUT automatic renewal
//     (PayPal plan total_cycles = 1, api/_utils/paypal.js).
//
// Refunds are never sent automatically: a refund request is recorded for the
// owner, who returns the money through PayPal.
import { getPlanById } from "../plans.js";

export const COOLING_OFF_DAYS = 14;
export const CANCEL_FEE_RATE = 0.05;
export const CANCEL_FEE_CAP_ILS = 100;
export const CANCEL_EFFECT_BUSINESS_DAYS = 3;
export const REFUND_REASON = Object.freeze({ COOLING_OFF: "cooling_off_14d", YEARLY_UNUSED_MONTHS: "yearly_unused_months" });

const DAY = 86400000;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

function addMonthsUtc(ms, months) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.getTime();
}

/** The lawful cancellation fee: 5% of the amount, capped at ₪100. */
export function cancellationFee(amount) {
  return round2(Math.min(Number(amount) * CANCEL_FEE_RATE, CANCEL_FEE_CAP_ILS));
}

/** What the customer paid for the current period, from the published price. */
export function periodPrice(planId, billingPeriod) {
  const p = getPlanById(planId);
  return billingPeriod === "yearly" ? Number(p.priceYearly) || 0 : Number(p.price) || 0;
}

/**
 * @param {object} sub          the subscription record (planId, billingPeriod, startedAt, lastBillingAt, expiresAt)
 * @param {number} now
 * @param {string} paidThrough  PayPal billing_info.next_billing_time, when known
 * @returns {{ accessUntil:string, refund:{amount,fee,reason,currency}|null, withinCoolingOff:boolean }}
 */
export function cancellationTerms({ sub, now = Date.now(), paidThrough = null } = {}) {
  const at = Number(now);
  const yearly = sub?.billingPeriod === "yearly";
  const price = periodPrice(sub?.planId, sub?.billingPeriod);
  const started = Date.parse(sub?.startedAt || sub?.lastBillingAt || "");
  const paid = Boolean(price > 0 && Number.isFinite(started) && sub?.status !== "pending");
  const noRefund = (until) => ({ accessUntil: new Date(until).toISOString(), refund: null, withinCoolingOff: false });
  if (!paid) return noRefund(at); // nothing was charged

  // 14 days from the first payment: full refund minus the lawful fee, access ends now.
  if (at - started <= COOLING_OFF_DAYS * DAY) {
    const fee = cancellationFee(price);
    return {
      accessUntil: new Date(at).toISOString(),
      refund: { amount: round2(price - fee), fee, reason: REFUND_REASON.COOLING_OFF, currency: "ILS" },
      withinCoolingOff: true,
    };
  }

  if (yearly) {
    // Months already started are kept (access to the end of the current month);
    // full months not yet started are refunded.
    let monthsStarted = 1;
    while (monthsStarted < 12 && addMonthsUtc(started, monthsStarted) <= at) monthsStarted++;
    const accessUntil = addMonthsUtc(started, monthsStarted);
    const unused = 12 - monthsStarted;
    const amount = round2((price * unused) / 12);
    return {
      accessUntil: new Date(accessUntil).toISOString(),
      refund: amount > 0 ? { amount, fee: 0, reason: REFUND_REASON.YEARLY_UNUSED_MONTHS, currency: "ILS", unusedMonths: unused } : null,
      withinCoolingOff: false,
    };
  }

  // Monthly after the cooling-off period: no further charges, access until the
  // end of the month already paid for.
  const known = Date.parse(paidThrough || sub?.paidThrough || "");
  const fromRecord = Date.parse(sub?.expiresAt || "");
  const end = Number.isFinite(known) ? known : Number.isFinite(fromRecord) ? fromRecord : addMonthsUtc(Date.parse(sub?.lastBillingAt || "") || started, 1);
  return noRefund(Math.max(end, at));
}
