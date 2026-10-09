// Server error codes → clear Hebrew messages for the UI.
//
// API routes answer with machine codes ({ ok:false, error:"invalid_key" }).
// Those codes must never be shown to a creator as-is. Every UI surface that
// reports a failed server call goes through `toHebrewError`, which returns a
// human sentence and falls back to a generic message for unknown codes.

import { CLOUD_PAUSED_HE } from "./catalogSnapshot.js";

const MESSAGES = {
  // Identity / permissions
  authentication_required: "צריך להתחבר לסטודיו כדי לבצע את הפעולה",
  authentication_required_for_verify: "צריך להתחבר לסטודיו כדי לאמת מוצר",
  unauthenticated: "צריך להתחבר לסטודיו כדי לבצע את הפעולה",
  unauthorized: "אין הרשאה לבצע את הפעולה",
  admin_required: "הפעולה זמינה רק למנהלת המערכת",
  owner_required: "אפשר לבצע את הפעולה רק על מוצרים שלך",
  not_owner: "אפשר לבצע את הפעולה רק על מוצרים שלך",
  ownership_mismatch: "המוצר לא שייך לסטודיו שמחובר כרגע",
  identity_mismatch: "החשבון המחובר לא תואם לסטודיו",
  not_authorized_for_marketer: "אין הרשאה לפעול בשם הסטודיו הזה",
  origin_not_allowed: "הבקשה נחסמה מסיבות אבטחה — רענני את העמוד ונסי שוב",
  forbidden_key: "אין הרשאה לשנות את הנתונים האלה",
  server_only_key: "הנתונים האלה מתעדכנים רק על ידי המערכת",

  // Input
  invalid_key: "הבקשה לא תקינה — רענני את העמוד ונסי שוב",
  invalid_json: "הבקשה לא תקינה — רענני את העמוד ונסי שוב",
  bad_json: "הבקשה לא תקינה — רענני את העמוד ונסי שוב",
  bad_request: "הבקשה לא תקינה — רענני את העמוד ונסי שוב",
  missing_fields: "חסרים פרטים — מלאי את כל השדות ונסי שוב",
  invalid_email: "כתובת האימייל לא תקינה",
  invalid_amount: "הסכום לא תקין",
  value_too_large: "הנתונים גדולים מדי לשמירה",
  product_id_required: "יש לבחור מוצר",
  campaign_id_required: "יש לבחור קמפיין",
  marketer_id_required: "צריך להתחבר לסטודיו כדי לבצע את הפעולה",
  missing_marketer_id: "צריך להתחבר לסטודיו כדי לבצע את הפעולה",

  // Not found / state
  product_not_found: "המוצר לא נמצא",
  product_not_approved: "אפשר לפרסם רק מוצר שאושר",
  marketer_not_found: "הסטודיו לא נמצא",
  campaign_not_found: "הקמפיין לא נמצא",
  creative_not_found: "הקריאייטיב לא נמצא",
  publication_not_found: "הפרסום לא נמצא",
  attribution_required: "צריך לשייך את המוצר לסטודיו לפני הפרסום",
  no_external_channel_configured: "אין עדיין ערוץ חיצוני מחובר — חברי ערוץ בהגדרות",

  // Limits / availability
  rate_limited: "יותר מדי בקשות — נסי שוב בעוד דקה",
  rate_limit_exceeded: "יותר מדי בקשות — נסי שוב בעוד דקה",
  method_not_allowed: "הפעולה לא נתמכת",
  supabase_not_configured: "השירות לא זמין כרגע — נסי שוב מאוחר יותר",
  not_configured: "השירות עדיין לא הוגדר במערכת",
  plan_not_configured: "המסלול עדיין לא הוגדר במערכת — פני לתמיכה",
  paypal_not_configured: "תשלומי PayPal עדיין לא הוגדרו במערכת",
  autopilot_not_configured: "AutoPilot עדיין לא הוגדר במערכת",
  ugc_ai_not_configured: "יצירת תמונות AI עדיין לא הוגדרה במערכת",
  store_sign_secret_not_configured: "רישום מכירות עדיין לא הוגדר במערכת",

  // Payments
  capture_failed: "התשלום לא הושלם — לא חויבת",
  invalid_buyer_email: "כתובת האימייל לקבלה לא תקינה",
  product_not_available: "אחד המוצרים בעגלה כבר לא זמין לרכישה — הסירי אותו ונסי שוב",
  currency_unsupported: "אחד המוצרים בעגלה במטבע שלא נתמך בתשלום באתר",
  invalid_quantity: "כמות לא תקינה לאחד המוצרים (עד 10 יחידות למוצר)",
  cart_too_large: "יותר מדי מוצרים בעגלה — חלקי לשתי הזמנות",
  catalog_unavailable: "לא הצלחנו לאמת את המחירים כרגע — לא חויבת, נסי שוב בעוד רגע",
  order_not_found: "ההזמנה לא נמצאה — לא חויבת. נסי להתחיל את התשלום מחדש",
  storage_unavailable: "המערכת לא זמינה לרישום ההזמנה כרגע — לא חויבת, נסי שוב בעוד רגע",
  payment_amount_mismatch: "הסכום שחויב לא תאם להזמנה — ההזמנה נעצרה לבדיקה. פני לתמיכה עם מספר ההזמנה",
  payment_captured_persistence_failed: "התשלום התקבל אבל רישום ההזמנה נכשל — פני לתמיכה עם מספר ההזמנה ונטפל מיד",
  payment_not_completed: "התשלום לא הושלם",
  order_creation_failed: "לא הצלחנו ליצור הזמנה — נסי שוב",
  paypal_order_failed: "לא הצלחנו ליצור הזמנה ב-PayPal — נסי שוב",
  empty_cart: "העגלה ריקה",
  empty_items: "העגלה ריקה",

  // Storage
  storage_failed: "השמירה נכשלה — נסי שוב בעוד רגע",
  ugc_storage_failed: "שמירת הקובץ נכשלה — נסי שוב בעוד רגע",
  internal_server_error: "אירעה שגיאה בשרת — נסי שוב בעוד רגע",

  // Luna discovery
  unknown_command: "לונה לא מכירה את הבקשה הזו",
  no_products: "אין עדיין מוצרים מאושרים בסטודיו שלך",
  unknown_action: "הבקשה לא נתמכת",
  goal_required: "כתבי ללונה מה המטרה",
  nothing_to_rollback: "אין גרסה קודמת לשחזר",
  rollback_write_failed: "השחזור לא נשמר — הגרסה הנוכחית נשארה כמו שהייתה",
  owner_explicit_required: "שליחה דורשת את האישור המפורש שלך — לונה לא שולחת הזמנות בעצמה",

  // Plans, quotas and subscriptions (src/lib/plans.js, src/lib/billing/cancellation.js)
  plan_required: "הפעולה לא כלולה במסלול הנוכחי שלך — אפשר לראות מה כלול בכל מסלול בעמוד המסלולים",
  quota_exceeded: "הגעת למכסה החודשית של המסלול. היא תתאפס בתחילת החודש הבא, ולא ייגבה תשלום נוסף",
  plan_limit_products: "הגעת למספר המוצרים המרבי במסלול. המוצרים הקיימים נשארים, ואפשר לערוך או למחוק אותם",
  legal_acceptance_required: "לפני מעבר לתשלום יש לאשר את תנאי השימוש, מדיניות הפרטיות ומדיניות הביטולים",
  legal_version_outdated: "המסמכים המשפטיים עודכנו — רענני את העמוד ואשרי את הגרסה החדשה",
  active_subscription_exists: "יש לך כבר מנוי פעיל. כדי לעבור מסלול, בטלי קודם את המנוי הנוכחי ואז בחרי מסלול חדש — כך לא תחויבי פעמיים",
  no_active_subscription: "לא נמצא מנוי פעיל לביטול",
  paypal_cancel_failed: "PayPal לא אישר את הביטול כרגע, ולכן המנוי עדיין פעיל. נסי שוב בעוד רגע או בטלי מחשבון ה-PayPal",
  paypal_unreachable: "אין כרגע חיבור ל-PayPal, ולכן המנוי עדיין פעיל. נסי שוב בעוד רגע או בטלי מחשבון ה-PayPal",
  user_session_required: "צריך להתחבר לסטודיו כדי לבצע את הפעולה",
  invalid_unsubscribe_link: "קישור ההסרה לא תקין — אפשר להסיר את ההרשמה מהסטודיו",
  unsubscribe_not_configured: "ההסרה דרך קישור אינה זמינה כרגע — אפשר להסיר את ההרשמה מהסטודיו",

  // External publishing (src/lib/discovery/publishers/*)
  explicit_confirmation_required: "כדי לפרסם צריך לאשר את הפוסט הזה במפורש",
  channel_requires_connection: "הרשת הזו עדיין לא מחוברת — אפשר לפרסם ידנית עם הכיתוב והלינק",
  telegram_not_configured: "בוט הטלגרם לא הוגדר — מגדירים אותו בטייס האוטומטי ← ערוצים ← Telegram",
  telegram_bad_token: "טלגרם דחה את טוקן הבוט — בדקי את הטוקן מ-BotFather ושמרי שוב. הפוסט לא פורסם",
  telegram_chat_not_allowed: "הבוט לא יכול לפרסם בערוץ — ודאי שהוא מנהל בערוץ עם הרשאה לפרסם, ושה-Chat נכון. הפוסט לא פורסם",
  telegram_rate_limited: "טלגרם הגביל זמנית את קצב הפרסום — נסי שוב בעוד דקה. הפוסט לא פורסם",
  telegram_unreachable: "אין כרגע חיבור לטלגרם — הפוסט לא פורסם, נסי שוב בעוד רגע",
  telegram_no_message_id: "טלגרם לא החזיר מזהה פוסט, ולכן הפוסט לא נחשב כמפורסם",
  empty_post: "אין טקסט לפרסום",
  product_photo_required: "ליצירת תמונה צריך תמונה אמיתית של המוצר (מדף המוצר בחנות או צילום שלך), לא תמונת אווירה",
  product_photo_unavailable: "לא הצלחנו לטעון את תמונת המוצר כדי ליצור ממנה תמונה — נסי שוב או החליפי תמונה",
  platform_owner_only: "יצירת תמונות AI זמינה כרגע רק לבעלת הפלטפורמה",
};

const GENERIC = "משהו השתבש — נסי שוב בעוד רגע";

/**
 * Supabase Auth result ({ error, code }) → one clear Hebrew sentence.
 * Raw provider messages ("Invalid login credentials", "Email not confirmed",
 * "Password should be at least 6 characters"…) are never shown as-is.
 */
export function authErrorHe(res, fallback = GENERIC) {
  const code = String(res?.code || "").toLowerCase();
  const msg = String(res?.error || res?.message || "").toLowerCase();
  const has = (...needles) => needles.some((n) => code.includes(n) || msg.includes(n));
  if (has("invalid_credentials", "invalid login credentials", "invalid_grant")) return "האימייל או הסיסמה שגויים";
  if (has("email_not_confirmed", "email not confirmed")) return "צריך לאשר את כתובת האימייל — בדקי את תיבת הדואר (גם בספאם) ואז התחברי";
  if (has("weak_password", "password should be", "password is too weak")) return "הסיסמה חלשה מדי — לפחות 6 תווים, מומלץ לשלב אותיות ומספרים";
  if (has("email_address_invalid", "invalid format", "unable to validate email", "invalid email")) return "כתובת האימייל לא תקינה";
  if (has("user_already_exists", "email_exists", "already registered", "already exists")) return "הכתובת כבר רשומה — עברי ל«כניסה» או השתמשי באיפוס סיסמה";
  if (has("rate_limit", "rate limit", "too many", "over_email_send_rate_limit", "over_request_rate_limit")) return "יותר מדי ניסיונות — נסי שוב בעוד כמה דקות";
  if (has("signup_disabled", "signups not allowed")) return "הרשמה חדשה סגורה כרגע";
  if (has("not configured", "missing .env")) return "שירות ההתחברות לא זמין כרגע — פני לתמיכה";
  // The project is restricted (e.g. a quota): not the visitor's mistake — never "check your password".
  if (has("restricted", "exceed_", "quota")) return CLOUD_PAUSED_HE;
  if (has("failed to fetch", "network", "timeout", "aborted")) return "אין חיבור לשרת — בדקי את החיבור ונסי שוב";
  return fallback;
}

/**
 * @param {unknown} codeOrError  server code, Error, or response body
 * @param {string} [fallback]    message when the code is unknown
 * @returns {string} Hebrew, human-readable message (never a raw code)
 */
export function toHebrewError(codeOrError, fallback = GENERIC) {
  let code = codeOrError;
  if (code && typeof code === "object") code = code.error ?? code.message ?? "";
  code = String(code ?? "").trim();
  if (!code) return fallback;
  if (MESSAGES[code]) return MESSAGES[code];
  // kvReadGuard refused a write because the stored data could not be read.
  if (/^kv_read_failed(:|$)/.test(code)) return "לא הצלחנו לקרוא את הנתונים השמורים — שום דבר לא נמחק, נסי שוב בעוד רגע";
  // Any PayPal provider failure code (paypal_auth_failed, paypal_subscribe_failed_422, …).
  if (/^paypal_/.test(code)) return "PayPal לא זמין כרגע — לא בוצע חיוב. נסי שוב בעוד רגע";
  if (code === "invalid_plan" || code === "invalid_submode") return "המסלול שנבחר לא תקין — רענני את העמוד ונסי שוב";
  if (code === "no_active_subscription") return "אין מנוי פעיל לביטול";
  if (code === "webhook_verification_not_configured") return MESSAGES.not_configured;
  if (/^unsafe_url(:|$)/.test(code)) return "אי אפשר להשתמש בקישור הזה — הדביקי קישור ציבורי לדף המוצר";
  if (/^store_http_(401|403)$/.test(code)) return MESSAGES.authentication_required;
  if (/^(store_)?http_5\d\d$/.test(code)) return MESSAGES.internal_server_error;
  if (/timeout|aborted|failed to fetch|network/i.test(code)) {
    return "אין חיבור לשרת — בדקי את החיבור ונסי שוב";
  }
  // Already a Hebrew sentence (some routes return one) — pass it through.
  if (/[֐-׿]/.test(code)) return code;
  return fallback;
}
