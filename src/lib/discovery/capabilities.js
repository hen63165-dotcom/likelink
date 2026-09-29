// LikeLink capability registry — what LikeLink can actually do, natively.
//
// A Capability is LikeLink's own description of an operation: why it exists,
// preconditions checked against real state, risk, the permission it needs
// (LAW 06 / 14), who executes it, the expected result, how the result is
// VERIFIED (LAW 01) and its recovery path (LAW 13). `native: true` means
// LikeLink performs it with first-party logic (no AI provider, no SaaS);
// `adapter` names the only external piece when one is irreducible (a social
// API, a payment provider). New capabilities are added with
// registerCapability() — Luna Core does not change (self-extension).
// Only native INTERNAL capabilities with permission "session" run on their own.

export const RISK = Object.freeze({ LOW: "low", MEDIUM: "medium", HIGH: "high" });
export const PERMISSION = Object.freeze({
  SESSION: "session",               // a verified owner session is enough
  OWNER: "owner",                   // the creator does it in the studio
  OWNER_EXPLICIT: "owner_explicit", // explicit per-action approval (money, external posting)
  ADMIN: "admin",                   // platform configuration / secrets
});
export const EXECUTOR = Object.freeze({ INTERNAL: "internal", CLIENT: "client", OWNER: "owner", EXTERNAL: "external" });

const s = (id) => (p) => p.surfaces.find((x) => x.id === id) || {};

const REGISTRY = {
  create_share_asset: {
    he: "יצירת חבילת שיתוף עם לינק מעקב",
    native: true, adapter: null,
    reason: "חבילת שיתוף מוכנה + לינק מעקב הופכים כל שיתוף למדיד",
    risk: RISK.LOW, permission: PERMISSION.SESSION, executor: EXECUTOR.INTERNAL,
    satisfies: ["share_ready", "tracking_ready", "content_ready"],
    preconditions: (p) => [
      { ok: p.isPublic, he: "המוצר ציבורי (מאושר ומשויך ליוצר)" },
      { ok: Boolean(p.title), he: "למוצר יש כותרת" },
    ],
    expected: "discovery:assets:<id> נשמר עם טביעת האצבע הנוכחית של המוצר",
    verification: "reread_asset_fingerprint",
    rollback: "restore_previous_assets",
  },
  verify_product_seo: {
    he: "אימות ה-SEO שעמוד המוצר מגיש",
    native: true, adapter: null,
    reason: "כותרת, תיאור ונתונים מובנים נכונים משפרים גילוי במנועי חיפוש",
    risk: RISK.LOW, permission: PERMISSION.SESSION, executor: EXECUTOR.INTERNAL,
    satisfies: ["seo_complete", "structured_data"],
    preconditions: (p) => [{ ok: p.isPublic, he: "העמוד ציבורי" }],
    expected: "כל בדיקות ה-SEO של העמוד עוברות",
    verification: "recompute_served_seo",
    rollback: null,
  },
  record_passport: {
    he: "רישום מצב הגילוי (Passport) עם היסטוריית ציון",
    native: true, adapter: null,
    reason: "בלי תיעוד אי אפשר ללמוד מה עזר לגילוי",
    risk: RISK.LOW, permission: PERMISSION.SESSION, executor: EXECUTOR.INTERNAL,
    satisfies: ["measured"],
    preconditions: () => [],
    expected: "discovery:passport:<id> מעודכן",
    verification: "reread_snapshot",
    rollback: null,
  },
  fix_product_data: {
    he: "השלמת נתוני המוצר",
    native: true, adapter: null,
    reason: "שדות חסרים חוסמים SEO, נתונים מובנים ו-Merchant",
    risk: RISK.LOW, permission: PERMISSION.OWNER, executor: EXECUTOR.OWNER,
    satisfies: ["page_live", "seo_complete", "structured_data", "tracking_ready"],
    preconditions: () => [],
    expected: "המוצר מכיל כותרת, תיאור, מחיר, תמונה ולינק חנות",
    verification: "recompute_passport",
    rollback: "edit_product_again",
  },
  enable_direct_checkout: {
    he: "מכירה ישירה באתר (לזכאות Google Merchant)",
    native: true, adapter: "payment_provider",
    reason: "Google Merchant מקבל רק מוצרים שנמכרים ישירות באתר",
    risk: RISK.HIGH, permission: PERMISSION.OWNER_EXPLICIT, executor: EXECUTOR.OWNER,
    satisfies: ["merchant_eligible"],
    preconditions: () => [],
    expected: "המוצר עובר את כל חוקי הפיד (merchantStatus.eligible)",
    verification: "merchant_status",
    rollback: "disable_direct_checkout",
  },
  create_collection: {
    he: "שיוך המוצר לקולקציה",
    native: true, adapter: null,
    reason: "קולקציה היא משטח גילוי נוסף שאפשר לשתף",
    risk: RISK.LOW, permission: PERMISSION.OWNER, executor: EXECUTOR.OWNER,
    satisfies: ["collection_member"],
    preconditions: () => [],
    expected: "המוצר מופיע בקולקציה של היוצר",
    verification: "collection_contains_product",
    rollback: "remove_from_collection",
  },
  create_real_video: {
    he: "יצירת סרטון אמיתי בסטודיו הווידאו",
    native: true, adapter: null,
    reason: "סרטון פותח משטחי גילוי של רילס וסטורי",
    risk: RISK.MEDIUM, permission: PERMISSION.OWNER, executor: EXECUTOR.OWNER,
    satisfies: ["media_video"],
    preconditions: (p) => [{ ok: Boolean(p.image), he: "יש תמונת מוצר לבסס עליה את הסרטון" }],
    expected: "קובץ וידאו אמיתי ונגיש (REAL_VIDEO)",
    verification: "media_truth_real_video",
    rollback: "delete_video",
  },
  connect_channel: {
    he: "חיבור ערוץ הפצה חיצוני",
    native: false, adapter: "channel_provider",
    reason: "ערוץ חיצוני מגיע לקהל שלא נמצא באתר",
    risk: RISK.HIGH, permission: PERMISSION.ADMIN, executor: EXECUTOR.EXTERNAL,
    satisfies: ["external_channel_connected"],
    preconditions: () => [],
    expected: "הערוץ מדווח CONNECTED מהשרת",
    verification: "channel_registry_state",
    rollback: "disconnect_channel",
  },
  publish_external: {
    he: "פרסום בערוץ חיצוני מחובר",
    native: false, adapter: "channel_provider",
    reason: "הפצה לקהל חיצוני",
    risk: RISK.HIGH, permission: PERMISSION.OWNER_EXPLICIT, executor: EXECUTOR.EXTERNAL,
    satisfies: ["published_external"],
    preconditions: (p, ctx) => [{ ok: Boolean(ctx.externalConnected), he: "יש ערוץ חיצוני מחובר" }],
    expected: "אישור מהספק (מזהה הודעה) — רק אז 'פורסם'",
    verification: "provider_confirmation",
    rollback: "delete_provider_post",
  },
  manual_share: {
    he: "שיתוף ידני דרך חבילת השיתוף (וואטסאפ / טלגרם / העתקה)",
    native: true, adapter: null,
    reason: "מסלול חלופי כשאין ערוץ חיצוני מחובר — בלי לעצור (LAW 10)",
    risk: RISK.LOW, permission: PERMISSION.OWNER, executor: EXECUTOR.CLIENT,
    satisfies: ["shared_manually"],
    preconditions: (p) => [{ ok: p.isPublic, he: "יש עמוד ציבורי לשתף" }],
    expected: "קליקים דרך לינק המעקב נרשמים",
    verification: "tracked_clicks",
    rollback: null,
  },
  reconcile_subscription: {
    he: "בדיקת מצב המנוי מול PayPal",
    native: true, adapter: "payment_provider",
    reason: "הרשאות בתשלום נפתחות רק ממצב מנוי מאומת בשרת (LAW 05)",
    risk: RISK.LOW, permission: PERMISSION.SESSION, executor: EXECUTOR.CLIENT,
    satisfies: ["entitlement_verified"],
    preconditions: () => [],
    expected: "המסלול נקבע מתוצאת האימות בשרת",
    verification: "entitlement_resolver",
    rollback: null,
  },
  paid_campaign: {
    he: "קמפיין ממומן",
    native: false, adapter: "ads_provider",
    reason: "חשיפה בתשלום",
    risk: RISK.HIGH, permission: PERMISSION.OWNER_EXPLICIT, executor: EXECUTOR.EXTERNAL,
    satisfies: ["paid_reach"],
    preconditions: () => [{ ok: false, he: "אין חשבון מודעות מחובר" }],
    expected: "קמפיין פעיל אצל ספק המודעות, רק באישור הוצאה מפורש",
    verification: "ads_provider_state",
    rollback: "pause_campaign",
  },
};

/** Required-state facts and how each is read from a real passport. */
export const FACTS = Object.freeze({
  page_live: { he: "עמוד מוצר ציבורי", read: (p) => s("product_page")(p).status === "live" },
  seo_complete: { he: "SEO מלא", read: (p) => p.seo.audit.passed === p.seo.audit.total },
  structured_data: { he: "נתונים מובנים", read: (p) => Boolean(p.seo.audit.checks.find((c) => c.id === "structured_data")?.ok) },
  share_ready: { he: "חבילת שיתוף מעודכנת", read: (p) => s("share_asset")(p).status === "ready" },
  tracking_ready: { he: "לינק מעקב", read: (p) => s("tracking")(p).status === "live" },
  content_ready: { he: "טיוטות תוכן", read: (p) => s("share_asset")(p).status === "ready" },
  merchant_eligible: { he: "זכאות Google Merchant", read: (p) => p.merchant.eligible },
  collection_member: { he: "בקולקציה", read: (p) => s("collection")(p).status === "live" },
  media_video: { he: "סרטון אמיתי", read: (p) => p.media.state === "REAL_VIDEO" },
  external_channel_connected: { he: "ערוץ חיצוני מחובר", read: (p) => s("distribution")(p).status === "ready" },
  published_external: { he: "פורסם בערוץ חיצוני (מאומת)", read: (p) => (p.signals.verifiedExternalPublications || 0) > 0 },
  shared_manually: { he: "שותף ידנית", read: (p) => (p.tracking.bySource?.luna_share || 0) > 0 },
  measured: { he: "מצב גילוי מתועד", read: () => false },
});

/** The live capability registry (read-only view). */
export const CAPABILITIES = REGISTRY;

/**
 * Self-extension: add a capability without touching Luna Core. The
 * definition must say how it is verified — a capability without a verifier
 * can never report success (LAW 01).
 */
export function registerCapability(id, def) {
  const required = ["he", "reason", "risk", "permission", "executor", "satisfies", "preconditions", "expected", "verification"];
  const missing = required.filter((k) => def?.[k] === undefined);
  if (missing.length) throw new Error(`capability_incomplete:${id}:${missing.join(",")}`);
  if (REGISTRY[id]) throw new Error(`capability_exists:${id}`);
  REGISTRY[id] = { native: true, adapter: null, rollback: null, ...def };
  return REGISTRY[id];
}

/** Failure classes (self-repair): what kind of problem, and can LikeLink fix it itself. */
export const FAILURE = Object.freeze({
  RETRYABLE: "retryable",           // timeout / transient — safe to retry (idempotent)
  PROVIDER: "provider",             // external provider refused / unavailable
  AUTHORIZATION: "authorization",   // missing permission / session
  CONFIGURATION: "configuration",   // missing secret / channel config (owner action)
  DATA: "data",                     // product data incomplete (owner action)
  SECURITY: "security",             // guard refused (e.g. write after a failed read)
  INTERNAL: "internal",             // our bug — recorded for repair
});

export function classifyFailure(error) {
  const m = String(error?.message || error || "").toLowerCase();
  if (/kv_read_failed|read_failed|write_blocked/.test(m)) return { class: FAILURE.SECURITY, retryable: true, selfRepair: "הקריאה הבאה שתצליח תשחרר את החסימה — ננסה שוב בריצה הבאה" };
  if (/timeout|aborted|econnreset|fetch failed|network|(^|\D)5\d\d(\D|$)/.test(m)) return { class: FAILURE.RETRYABLE, retryable: true, selfRepair: "ניסיון חוזר בריצה הבאה (הפעולה אידמפוטנטית)" };
  if (/unauthor|forbidden|401|403|not_owner|authentication/.test(m)) return { class: FAILURE.AUTHORIZATION, retryable: false, selfRepair: null };
  if (/not_configured|missing_secret|supabase_not_configured/.test(m)) return { class: FAILURE.CONFIGURATION, retryable: false, selfRepair: null };
  if (/missing_|no_title|invalid_/.test(m)) return { class: FAILURE.DATA, retryable: false, selfRepair: null };
  if (/provider|paypal|telegram|webhook/.test(m)) return { class: FAILURE.PROVIDER, retryable: true, selfRepair: "ניסיון חוזר מוגבל בריצה הבאה" };
  return { class: FAILURE.INTERNAL, retryable: false, selfRepair: null };
}

/** Pick the capability that can satisfy a missing fact, given the real passport. */
export function capabilityForFact(fact, p) {
  if (fact === "seo_complete" || fact === "structured_data") {
    const failing = p.seo.audit.checks.filter((c) => !c.ok);
    // Checks that depend on product data can only be fixed by the owner.
    const dataFixable = failing.some((c) => ["description", "title", "structured_data", "open_graph"].includes(c.id));
    return dataFixable ? "fix_product_data" : "verify_product_seo";
  }
  if (fact === "tracking_ready" && !p.tracking.link) return "fix_product_data";
  if (fact === "page_live") return "fix_product_data";
  if (fact === "merchant_eligible") return p.merchant.requiresOwner ? "enable_direct_checkout" : "fix_product_data";
  const hit = Object.entries(REGISTRY).find(([, a]) => a.satisfies.includes(fact));
  return hit ? hit[0] : null;
}
