// First-party experiments — measured on real events only; winners are never
// manufactured.
//
// A variant has exposures (how many people saw it), clicks and verified
// conversions. A winner needs: known exposures for every variant, enough
// sample on each side, and a two-proportion z-test below the significance
// level. Anything less is INSUFFICIENT_DATA (or NO_DIFFERENCE), stated
// plainly. Off-platform shares (WhatsApp, Telegram…) have no exposure count
// LikeLink can see — those experiments report clicks and stay
// INSUFFICIENT_DATA until an exposure source exists.

export const EXPERIMENT_STATE = Object.freeze({
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  NO_DIFFERENCE: "NO_DIFFERENCE",
  WINNER: "WINNER",
});

export const EXPERIMENT_LABEL = Object.freeze({
  INSUFFICIENT_DATA: "אין מספיק נתונים",
  NO_DIFFERENCE: "אין הבדל מובהק",
  WINNER: "יש גרסה מנצחת",
});

// Standard normal CDF (Abramowitz–Stegun 7.1.26 erf approximation).
function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * @param {Array<{id, exposures: number|null, clicks: number, conversions?: number}>} variants
 * @param {{ minExposures?: number, minClicks?: number, alpha?: number }} opts
 */
export function evaluateExperiment(variants = [], { minExposures = 100, minClicks = 10, alpha = 0.05 } = {}) {
  const vs = (variants || []).map((v) => ({
    id: String(v.id),
    exposures: Number.isFinite(v.exposures) ? v.exposures : null,
    clicks: Math.max(0, Number(v.clicks) || 0),
    conversions: Math.max(0, Number(v.conversions) || 0),
  }));
  const totalClicks = vs.reduce((s, v) => s + v.clicks, 0);
  const base = { variants: vs, totalClicks, winner: null, pValue: null };
  if (vs.length < 2) return { ...base, state: EXPERIMENT_STATE.INSUFFICIENT_DATA, reason: "צריך לפחות שתי גרסאות" };
  if (vs.some((v) => v.exposures === null)) {
    return { ...base, state: EXPERIMENT_STATE.INSUFFICIENT_DATA, reason: "מספר החשיפות לא ידוע (שיתוף מחוץ לאתר) — לא ניתן לקבוע מנצחת לפי קליקים בלבד" };
  }
  if (vs.some((v) => v.exposures < minExposures) || totalClicks < minClicks) {
    return { ...base, state: EXPERIMENT_STATE.INSUFFICIENT_DATA, reason: `צריך לפחות ${minExposures} חשיפות לכל גרסה ו-${minClicks} קליקים בסך הכול` };
  }
  const ranked = vs.map((v) => ({ ...v, rate: v.clicks / v.exposures })).sort((a, b) => b.rate - a.rate);
  const [a, b] = ranked;
  const pooled = (a.clicks + b.clicks) / (a.exposures + b.exposures);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.exposures + 1 / b.exposures));
  const z = se > 0 ? (a.rate - b.rate) / se : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  if (pValue < alpha) {
    return { ...base, state: EXPERIMENT_STATE.WINNER, winner: a.id, pValue, reason: `גרסה ${a.id} מובילה בשיעור הקלקה (p=${pValue.toFixed(3)})` };
  }
  return { ...base, state: EXPERIMENT_STATE.NO_DIFFERENCE, pValue, reason: `ההבדל לא מובהק (p=${pValue.toFixed(3)})` };
}

/** The share-pack A/B test of one product: real /r clicks per variant source. */
export function shareExperiment(productId, clicks = []) {
  const count = (src) => (clicks || []).filter((c) => c && String(c.productId) === String(productId) && c.type === "outbound_click" && c.source === src).length;
  return evaluateExperiment([
    { id: "a", exposures: null, clicks: count("luna_share_a") },
    { id: "b", exposures: null, clicks: count("luna_share_b") },
  ]);
}
