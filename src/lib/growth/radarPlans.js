// The radar as its own product (the owner's Master Execution Order, items 5–7): a launch trial the
// owner turns on and sets in the admin panel, and two tiers — Basic and Pro — scaffolded for the
// existing PayPal plans path but NOT for sale (the owner, 2026-11-14: no real charges, no paid
// renewal and no final price shown before she approves the price, the payment provider and the
// subscription terms).
//   • price is null and priceStatus PENDING_OWNER_APPROVAL until the owner approves RADAR_PRICES in
//     the admin panel (billingOf); before that no page prints a number;
//   • the site's own plans (plans.js: the checkout allow-list, ensureBillingPlans, /pricing) never
//     see them; the radar has its own PayPal plans (paypal.js ensureRadarBillingPlans) and checkout
//     (store.mjs sub=radar-checkout), both refused while billing is off; the waitlist stays
//     (mode=legal action=waitlist, a signed-in user, server-only plans:waitlist);
//   • every feature listed is LIVE today (a test checks each against the code that serves it);
//   • the trial never locks a page while nothing can be bought (accessOf).
// Pure: imported by the browser, the server and the tests.

export const RADAR_PLANS = Object.freeze({
  radar_basic: Object.freeze({
    id: "radar_basic",
    name: { he: "רדאר Basic", en: "Radar Basic" },
    tagline: { he: "הרדאר המלא, כל יום", en: "The full radar, every day" },
    price: null,
    priceStatus: "PENDING_OWNER_APPROVAL",
    purchasable: false,
    comingSoon: true,
    provision: false,
    // Everything the radar page shows today (the owner, 2026-11-15: "your call, make me start earning":
    // one plan at launch, everything that is live).
    features: Object.freeze(["daily_board", "israel_gap", "self_grading", "magic_bridge", "alpha_score", "acceleration", "opportunity_check"]),
  }),
  radar_pro: Object.freeze({
    id: "radar_pro",
    name: { he: "רדאר Pro", en: "Radar Pro" },
    tagline: { he: "לחנויות ויוצרות שמוכרות · בקרוב", en: "For shops and creators who sell · coming later" },
    price: null,
    // Not sold at launch: it opens when the kits show results in numbers (docs/research/radar-pricing.md).
    priceStatus: "NOT_ON_SALE",
    purchasable: false,
    comingSoon: true,
    provision: false,
    features: Object.freeze(["daily_board", "israel_gap", "self_grading", "magic_bridge", "alpha_score", "acceleration", "opportunity_check", "promotion_kits"]),
  }),
});

/** What each feature is, and the code that serves it today (tests/radarPlans.test.mjs checks the files exist). */
export const RADAR_FEATURES = Object.freeze({
  daily_board: { he: "לוח יומי: כ־60 סוגי מוצרים באליאקספרס, קצב ההזמנות, מוכרים חדשים ומחיר", en: "Daily board: about 60 kinds on AliExpress — order speed, new sellers, price", code: "src/lib/growth/trendRadar.js" },
  israel_gap: { he: "פער ישראל: האם כבר מחפשים את זה בעברית (גוגל + יוטיוב), עם רמת ודאות", en: "The Israel gap: is it searched in Hebrew yet (Google + YouTube), with confidence", code: "src/lib/growth/israelGap.js" },
  self_grading: { he: "בדיקה עצמית פומבית: כל סימון נבדק אחרי 14 יום", en: "Public self-grading: every call checked after 14 days", code: "src/lib/growth/trendRadar.js" },
  magic_bridge: { he: "כפתור הקסם מראה את מצב הרדאר של כל פריט שבודקים", en: "The magic button shows the radar's state for any item you check", code: "src/lib/growth/radarBoard.js" },
  alpha_score: { he: "ציון Alpha עם ודאות נפרדת, ורק מרכיבים שנמדדו", en: "Alpha score with separate confidence, measured components only", code: "src/lib/growth/alpha.js" },
  acceleration: { he: "מגן תאוצה: מאיץ, מאט או יורד, מהמדידות עצמן", en: "Acceleration shield: speeding up, slowing or falling, from the readings", code: "src/lib/growth/alpha.js" },
  opportunity_check: { he: "בדיקת הזדמנות ב־12 סעיפים והמלצה אחת לכל פריט", en: "A 12-point opportunity check and one action per item", code: "src/lib/growth/radarOpportunity.js" },
  promotion_kits: { he: "ערכת קידום לכל מוצר חם: Hook, תסריט, כיתוב וקישור מעקב", en: "A promotion kit per hot product: hook, script, caption, tracked link", code: "scripts/marketing/radar-kits.mjs" },
});

export const RADAR_TRIAL = Object.freeze({ defaultDays: 14, minDays: 7, maxDays: 60 });

/**
 * The PROPOSED prices (ILS, the price the customer pays; the owner, 2026-11-14: "calculate a smart,
 * competitive pricing structure … keep live billing gated until I review the numbers"). Nothing
 * here is shown to visitors or sent to PayPal until the owner approves these exact numbers in the
 * admin panel (`marketplace:settings.radarBilling`): a change here needs a new approval.
 * Basis (docs/research/radar-pricing.md): global research tools cost $30–60/month at entry
 * (Exploding Topics $39, Sell The Trend $29.97, Minea $49, Kalodata ≈$60); the radar covers one
 * market (Israel) and its accuracy record is still being built, so it launches far below them.
 * Annual = 10 months for 12 (≈17% off), one 12-month term with no automatic renewal (paypal.js).
 */
export const RADAR_PRICES = Object.freeze({
  // The owner, 2026-11-15 ("לשיקולך — תעשה שאתחיל להרוויח"): one plan at launch, at the site's own
  // Starter price, so a creator decides in a second. Radar Pro has no price: it is not sold yet.
  radar_basic: Object.freeze({ monthly: 29, yearly: 290 }),
});
/** The tiers that can be bought once billing is on (a tier without a price is waitlist only). */
export const RADAR_ON_SALE = Object.freeze(Object.keys(RADAR_PRICES));
export const RADAR_CURRENCY = "ILS";
export const RADAR_PERIODS = Object.freeze(["monthly", "yearly"]);

const samePrices = (a) => Object.keys(RADAR_PRICES).every((id) => RADAR_PERIODS.every((per) => Number(a?.[id]?.[per]) === RADAR_PRICES[id][per]));

/**
 * The owner's billing switch (marketplace:settings.radarBilling: enabled, approvedPrices,
 * approvedAt). ON only when she switched it on AND approved exactly today's RADAR_PRICES.
 */
export function billingOf(settings = {}) {
  const b = settings?.radarBilling && typeof settings.radarBilling === "object" ? settings.radarBilling : {};
  const approved = samePrices(b.approvedPrices) && Number.isFinite(Date.parse(String(b.approvedAt || "")));
  const enabled = b.enabled === true && approved;
  return { enabled, approved, reason: enabled ? null : !approved ? "prices_not_approved" : "billing_switched_off", prices: enabled ? RADAR_PRICES : null, currency: RADAR_CURRENCY };
}

/** The plan + price a checkout may charge, or null while billing is off (the server's own check). */
export function radarCheckoutPlan(planId, period, settings = {}) {
  const id = String(planId || "").toLowerCase();
  const per = period === "yearly" ? "yearly" : period === "monthly" ? "monthly" : null;
  if (!RADAR_PLANS[id] || !RADAR_PRICES[id] || !per || !billingOf(settings).enabled) return null;
  return { plan: RADAR_PLANS[id], period: per, price: RADAR_PRICES[id][per], currency: RADAR_CURRENCY };
}

/** The admin's radarAccess settings, cleaned (marketplace:settings.radarAccess). */
export function cleanRadarAccess(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const days = Math.round(Number(r.trialDays));
  const start = Date.parse(String(r.startedAt || ""));
  return {
    trial: r.trial === true,
    trialDays: Number.isFinite(days) && days >= 1 ? Math.min(Math.max(days, RADAR_TRIAL.minDays), RADAR_TRIAL.maxDays) : RADAR_TRIAL.defaultDays,
    startedAt: Number.isFinite(start) ? new Date(start).toISOString() : null,
  };
}

/**
 * Who may see the radar now. OPEN: no trial set (free, as today). TRIAL: inside the owner's trial,
 * with the days left. TRIAL_ENDED: past it — the page asks to join the waitlist but stays open,
 * because nothing can be bought yet (`locked` is true only when a radar plan is purchasable).
 */
export function accessOf(settings = {}, { now = Date.now(), billing = billingOf(settings) } = {}) {
  const a = cleanRadarAccess(settings?.radarAccess);
  const sellable = billing?.enabled === true;
  if (!a.trial || !a.startedAt) return { state: "OPEN", locked: false, trialDays: a.trialDays };
  const ends = Date.parse(a.startedAt) + a.trialDays * 86_400_000;
  if (now < ends) return { state: "TRIAL", locked: false, trialDays: a.trialDays, endsAt: new Date(ends).toISOString(), daysLeft: Math.max(1, Math.ceil((ends - now) / 86_400_000)) };
  return { state: "TRIAL_ENDED", locked: sellable, trialDays: a.trialDays, endsAt: new Date(ends).toISOString(), daysLeft: 0 };
}

/** The radar tiers the waitlist accepts (mode=legal action=waitlist). */
export function radarWaitlistPlan(planId) {
  const p = RADAR_PLANS[String(planId || "").toLowerCase()];
  return p && p.comingSoon && !p.purchasable ? p : null;
}

/**
 * The radar's guarantee (the owner, 2026-11-15: "כן לערבות"). A sniper call (an early call: all
 * four signals, sealed in Bitcoin) made during a subscriber's paid month and graded MISS gives that
 * subscriber the next month free, paid back as one month's price. At most one month per paid month.
 * Never automatic (CLAUDE.md: refunds go to billing:refund_requests and the owner pays them in
 * PayPal). `live` stays false until the job that writes those requests exists, so the promise is
 * shown only once it can be kept: /radar-pro gets its block (and tests/radarPlans.test.mjs its
 * wording rule) in the same change that wires the claims job.
 */
export const RADAR_GUARANTEE = Object.freeze({
  live: false,
  he: "קביעת צלף שלא פגעה? החודש הבא עלינו.",
  en: "A sniper call that missed? Next month is on us.",
  termsHe: "אם קביעת צלף של הרדאר שנחתמה בחודש מנוי ששילמת עליו מקבלת ❌ בציון של אחרי 14 יום, מחיר חודש אחד חוזר אלייך. לכל היותר חודש אחד לכל חודש ששולם. ההחזר נשלח ב־PayPal תוך 14 יום מהציון.",
});

const addMonths = (t, n) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };

/**
 * Which paid months earned the guarantee (pure): for each active or cancelled-after-paying radar
 * subscription, its monthly windows from activation; a window with at least one sniper call graded
 * MISS earns one month's price (yearly: a twelfth of the year). Returns one claim per window.
 */
export function guaranteeCredits({ subs = [], calls = [], now = Date.now() } = {}) {
  const misses = (Array.isArray(calls) ? calls : []).filter((c) => c?.kind === "early" && c.result === "MISS" && Number.isFinite(Date.parse(c.at)));
  const out = [];
  for (const s of Array.isArray(subs) ? subs : []) {
    const start = Date.parse(s?.activatedAt || "");
    const price = Number(s?.price);
    if (!Number.isFinite(start) || !(price > 0) || !["active", "cancelled"].includes(String(s.status))) continue;
    const months = s.billingPeriod === "yearly" ? 12 : Math.max(1, Math.ceil((Math.min(now, s.paidUntil ? Date.parse(s.paidUntil) : now) - start) / (30 * 86_400_000)));
    const monthly = s.billingPeriod === "yearly" ? Math.round((price / 12) * 100) / 100 : price;
    for (let k = 0; k < months; k++) {
      const from = addMonths(start, k);
      const to = addMonths(start, k + 1);
      if (from > now) break;
      const miss = misses.find((c) => Date.parse(c.at) >= from && Date.parse(c.at) < to);
      if (miss) out.push({ subscriptionId: s.id || s.paypalSubscriptionId || null, month: k + 1, call: { concept: miss.concept, at: miss.at, gradedAt: miss.gradedAt || null }, amount: monthly, currency: s.currency || RADAR_CURRENCY });
    }
  }
  return out;
}
