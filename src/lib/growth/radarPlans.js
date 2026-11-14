// The radar as its own product (the owner's Master Execution Order, items 5–7): a launch trial the
// owner turns on and sets in the admin panel, and two tiers — Basic and Pro — scaffolded for the
// existing PayPal plans path but NOT for sale (the owner, 2026-11-14: no real charges, no paid
// renewal and no final price shown before she approves the price, the payment provider and the
// subscription terms).
//   • price is null and priceStatus PENDING_OWNER_APPROVAL: no page prints a number;
//   • purchasable false, comingSoon true: the checkout allow-list (plans.js purchasablePlans) never
//     sees them and ensureBillingPlans never provisions them; the only action is the waitlist
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
    features: Object.freeze(["daily_board", "israel_gap", "self_grading", "magic_bridge"]),
  }),
  radar_pro: Object.freeze({
    id: "radar_pro",
    name: { he: "רדאר Pro", en: "Radar Pro" },
    tagline: { he: "לחנויות ויוצרות שמוכרות", en: "For shops and creators who sell" },
    price: null,
    priceStatus: "PENDING_OWNER_APPROVAL",
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

export const RADAR_TRIAL = Object.freeze({ defaultDays: 14, maxDays: 60 });

/** The admin's radarAccess settings, cleaned (marketplace:settings.radarAccess). */
export function cleanRadarAccess(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const days = Math.round(Number(r.trialDays));
  const start = Date.parse(String(r.startedAt || ""));
  return {
    trial: r.trial === true,
    trialDays: Number.isFinite(days) && days >= 1 ? Math.min(days, RADAR_TRIAL.maxDays) : RADAR_TRIAL.defaultDays,
    startedAt: Number.isFinite(start) ? new Date(start).toISOString() : null,
  };
}

/**
 * Who may see the radar now. OPEN: no trial set (free, as today). TRIAL: inside the owner's trial,
 * with the days left. TRIAL_ENDED: past it — the page asks to join the waitlist but stays open,
 * because nothing can be bought yet (`locked` is true only when a radar plan is purchasable).
 */
export function accessOf(settings = {}, { now = Date.now(), plans = RADAR_PLANS } = {}) {
  const a = cleanRadarAccess(settings?.radarAccess);
  const sellable = Object.values(plans).some((p) => p.purchasable && Number(p.price) > 0);
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
