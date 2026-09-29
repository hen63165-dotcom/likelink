// LUNA SYSTEM CHECK — evidence-backed health of the LikeLink operating system.
//
// Pure evaluation over PROBE RESULTS gathered live by the API (no I/O here).
// Every area gets GREEN / YELLOW / RED — or UNVERIFIED when the server cannot
// observe it (never a decorative green). Every color carries its evidence and,
// when relevant, the exact owner action. LAW 15: production state is observed,
// not assumed from a successful build.

export const COLOR = Object.freeze({ GREEN: "GREEN", YELLOW: "YELLOW", RED: "RED", UNVERIFIED: "UNVERIFIED" });
export const COLOR_LABEL = Object.freeze({ GREEN: "תקין", YELLOW: "חלקי", RED: "תקלה", UNVERIFIED: "לא נבדק מהשרת" });

const HOUR = 3600 * 1000;

function area(id, he, color, evidence, ownerAction = null) {
  return { id, he, color, evidence: [].concat(evidence).filter(Boolean), ownerAction };
}

/**
 * RLS verdict from anon-key probes (key column only). A missing row and a
 * locked row look the same to anon, so "locked" is claimed only when the
 * server-only row really exists AND a public control row is visible (proving
 * the anon key works). Anything else is unverified (null), never a guess.
 */
export function classifyRlsProbe({ privateProbe = {}, controlProbe = {}, privateKeyExists = false } = {}) {
  if (privateProbe.httpOk && privateProbe.rows > 0) return true;
  if (!privateKeyExists) return null;
  const controlOk = controlProbe.httpOk && controlProbe.rows > 0;
  const privateHidden = privateProbe.reached && (privateProbe.httpOk ? privateProbe.rows === 0 : true);
  return controlOk && privateHidden ? false : null;
}

const hasText = (v) => (typeof v === "string" ? v.trim() !== ""
  : v && typeof v === "object" ? Object.values(v).some(hasText) : false);

/** Private fields still carried by the publicly readable marketers row (counts only). */
export function publicPiiCounts(marketers = []) {
  const list = Array.isArray(marketers) ? marketers.filter(Boolean) : [];
  return {
    emails: list.filter((m) => hasText(m.email)).length,
    payment: list.filter((m) => hasText(m.payPalEmail) || hasText(m.bankDetails)).length,
  };
}

/**
 * @param {object} p probe results (see api/_utils/discoveryHandler.mjs → probeSystem)
 * @param {object} opts { audience: "public" | "owner", now }
 */
export function evaluateSystem(p = {}, { audience = "public", now = Date.now() } = {}) {
  const priv = audience === "owner";
  const areas = [];

  // database
  areas.push(p.db?.ok
    ? area("database", "מסד נתונים", p.db.ms > 3000 ? COLOR.YELLOW : COLOR.GREEN, `קריאה אמיתית מ-kv הצליחה ב-${p.db.ms}ms`)
    : area("database", "מסד נתונים", COLOR.RED, `הקריאה נכשלה: ${p.db?.error || "לא ידוע"}`, "לבדוק את חיבור Supabase"));

  // auth
  areas.push(p.auth?.reachable
    ? area("auth", "התחברות", COLOR.GREEN, "שרת ההזדהות (Supabase Auth) ענה לבדיקת הגדרות")
    : area("auth", "התחברות", p.auth?.configured ? COLOR.RED : COLOR.RED, p.auth?.configured ? "שרת ההזדהות לא ענה" : "ההזדהות לא מוגדרת בשרת", "לבדוק את הגדרות Supabase Auth"));

  // payments
  if (!p.payments?.paypalConfigured) {
    areas.push(area("payments", "תשלומים", COLOR.RED, "PayPal לא מוגדר בשרת — אין תשלום אפשרי", priv ? "להגדיר PAYPAL_CLIENT_ID ו-PAYPAL_CLIENT_SECRET" : "להשלים את חיבור PayPal בשרת"));
  } else {
    const ev = ["PayPal מוגדר; מנוי נפתח רק אחרי אימות ACTIVE + custom_id + plan_id מול PayPal"];
    if (priv && Number.isFinite(p.payments.pending)) ev.push(`${p.payments.pending} מנויים ממתינים לאימות · ${p.payments.active} פעילים`);
    areas.push(p.payments.webhookConfigured
      ? area("payments", "תשלומים", COLOR.GREEN, [...ev, "Webhook מאומת חתימה מוגדר"])
      : area("payments", "תשלומים", COLOR.YELLOW, [...ev, "אין אימות Webhook — עדכוני מנוי מגיעים רק מבדיקה יזומה מול PayPal"], priv ? "להגדיר PAYPAL_WEBHOOK_ID" : "להגדיר אימות Webhook של PayPal"));
  }

  // publishing
  const pub = p.publishing || {};
  const pubEv = [`${pub.verified || 0} פרסומים מאומתים (פוסט קיים בפיד הציבורי או מזהה מהספק)`, `${pub.unverified || 0} סומנו כפורסמו בלי הוכחה`];
  if (!pub.externalConnected) pubEv.push("אין ערוץ חיצוני מחובר — פרסום חיצוני לא יסומן 'פורסם'");
  areas.push(area("publishing", "פרסום",
    (pub.unverified || 0) > 0 ? COLOR.YELLOW : pub.verified > 0 ? (pub.externalConnected ? COLOR.GREEN : COLOR.YELLOW) : COLOR.YELLOW,
    pubEv, pub.externalConnected ? null : "לחבר ערוץ חיצוני (Telegram / Webhook) אם רוצים הפצה חיצונית"));

  // merchant
  const m = p.merchant || {};
  areas.push(m.eligible > 0
    ? area("merchant", "Google Merchant", COLOR.YELLOW, [`${m.eligible} מוצרים זכאים לפיד`, "חיבור חשבון Merchant Center לא מאומת מהשרת"], "לחבר את /google-feed.xml ב-Merchant Center")
    : area("merchant", "Google Merchant", COLOR.YELLOW, [`0 מתוך ${m.total || 0} מוצרים זכאים`, m.topReason ? `הסיבה: ${m.topReason}` : null, `מוכנות ממוצעת: ${m.avgReadiness ?? 0}/100`], "להחליט על מכירה ישירה באתר למוצרים מתאימים"));

  // autopilot
  const a = p.autopilot || {};
  const beatAge = a.lastBeatAt ? now - a.lastBeatAt : null;
  const aEv = [
    a.lastBeatAt ? `הפעלה מתוזמנת אחרונה לפני ${Math.round(beatAge / HOUR)} שעות (${a.lastMode || "?"})` : "אין עדות להפעלה מתוזמנת",
    a.lastDailyAt ? `הריצה היומית האחרונה לפני ${Math.round((now - a.lastDailyAt) / HOUR)} שעות` : "הריצה היומית לא רצה מעולם",
    `${a.failed || 0} משימות נכשלו · ${a.overdue || 0} באיחור מתוך ${a.total || 0}`,
    a.cronSecret ? "סוד ה-cron מוגדר" : priv ? "CRON_SECRET חסר — ה-cron של Vercel נדחה; הריצות מגיעות מהגיבוי ב-GitHub" : "ה-cron של Vercel לא מאומת — הריצות מגיעות מהגיבוי ב-GitHub",
  ];
  areas.push(area("autopilot", "טייס אוטומטי",
    (a.failed || 0) > 0 || !a.lastBeatAt || beatAge > 48 * HOUR ? COLOR.RED : (!a.cronSecret || (a.overdue || 0) > 0 || beatAge > 12 * HOUR) ? COLOR.YELLOW : COLOR.GREEN,
    aEv, a.cronSecret ? null : priv ? "להגדיר CRON_SECRET ב-Vercel" : "להשלים את אימות ה-cron בשרת"));

  // UGC / media
  const u = p.ugc || {};
  areas.push(area("ugc", "מדיה ו-UGC", u.realVideos > 0 ? COLOR.GREEN : COLOR.YELLOW,
    [`${u.realVideos || 0} סרטונים אמיתיים`, `${u.syntheticImages || 0} תמונות סינתטיות (מסומנות כסינתטיות)`, `${u.images || 0} תמונות מוצר`],
    u.realVideos > 0 ? null : "ליצור סרטונים אמיתיים בסטודיו הווידאו או לחבר ספק וידאו"));

  // storage
  areas.push(p.storage?.ok
    ? area("storage", "אחסון קבצים", COLOR.GREEN, "הדלי product-images קיים ונגיש לשרת")
    : area("storage", "אחסון קבצים", p.storage?.checked ? COLOR.YELLOW : COLOR.UNVERIFIED, p.storage?.checked ? "הדלי product-images לא נמצא — העלאות נשמרות מקומית בלבד" : "לא נבדק", "ליצור את הדלי product-images ב-Supabase Storage"));

  // tracking
  const t = p.tracking || {};
  areas.push(area("tracking", "מעקב", COLOR.GREEN,
    priv ? [`${t.clicks || 0} קליקים אמיתיים נרשמו`, t.lastClickAt ? `קליק אחרון לפני ${Math.round((now - t.lastClickAt) / HOUR)} שעות` : "עוד לא נרשם קליק"] : ["לינקי מעקב פעילים דרך /r (הקליקים נרשמים בשרת)"]));

  // public pages
  const pp = p.publicPages || {};
  areas.push(pp.publicProducts > 0
    ? area("public_pages", "עמודים ציבוריים", COLOR.GREEN, [`${pp.publicProducts} מוצרים ציבוריים עם עמוד /p/:id ב-sitemap`, pp.seoComplete != null ? `${pp.seoComplete} מהם עם SEO מלא` : null])
    : area("public_pages", "עמודים ציבוריים", COLOR.RED, "אין מוצרים ציבוריים", "לאשר מוצרים ולשייך אותם ליוצר"));

  // studio (UI) — the server cannot observe it
  areas.push(area("studio", "סטודיו", COLOR.UNVERIFIED, "ממשק הסטודיו נבדק בדפדפן, לא מהשרת"));

  // integrations
  const ch = p.channels || [];
  areas.push(area("integrations", "חיבורים", ch.some((c) => c.connected && !["web", "share_links"].includes(c.provider)) ? COLOR.GREEN : COLOR.YELLOW,
    ch.map((c) => `${c.label}: ${c.stateHe}`)));

  // security
  const s = p.security || {};
  const missingSecrets = (s.secretsPresent || 0) < (s.secretsTotal || 0);
  const exposedPayment = (s.publicPaymentDetails || 0) > 0;
  const exposedEmail = (s.publicEmails || 0) > 0;
  // The public view keeps the honest color but never describes the gap itself.
  const sEv = priv ? [
    s.rlsOpen === true ? "מפתח ציבורי (anon) יכול לקרוא מפתחות שרת בלבד בטבלת kv — ה-RLS פתוח" : s.rlsOpen === false ? "מפתח ציבורי לא יכול לקרוא מפתחות שרת בלבד (נבדק מול מפתח קיים + קריאת ביקורת ציבורית)" : "RLS לא אומת — הבדיקה לא הצליחה להבחין בין נעול לחסר",
    exposedPayment ? `${s.publicPaymentDetails} רשומות יוצרים עם פרטי תשלום קריאות במפתח הציבורי (marketplace:marketers)` : null,
    exposedEmail ? `${s.publicEmails} אימיילים של יוצרים קריאים במפתח הציבורי (marketplace:marketers)` : null,
    `${s.secretsPresent || 0}/${s.secretsTotal || 0} סודות שרת מוגדרים`,
    missingSecrets && (s.missing || []).length ? `חסרים (שמות בלבד): ${s.missing.join(", ")}` : null,
  ] : [
    s.rlsOpen === true ? "נמצא פער הרשאות במסד הנתונים שממתין לאישור הבעלים" : s.rlsOpen === false ? "הרשאות מסד הנתונים נעולות" : "הרשאות מסד הנתונים לא אומתו",
    exposedPayment || exposedEmail ? "נמצא פער פרטיות שממתין לתיקון" : null,
    missingSecrets ? "חלק מהגדרות האבטחה בשרת עדיין חסרות" : "הגדרות האבטחה בשרת קיימות",
  ];
  const sActions = [
    s.rlsOpen === true ? (priv ? "לאשר ולהחיל את supabase/migrations/20260928000000_kv_lockdown.sql" : "להחיל את נעילת הרשאות מסד הנתונים שהוכנה") : null,
    exposedPayment || exposedEmail ? (priv ? "להגיש לציבור עותק מסונן של רשומות היוצרים (בלי email / payPalEmail / bankDetails) ולהוציא את marketplace:marketers מרשימת הקריאה הציבורית" : "לתקן את פער הפרטיות") : null,
    missingSecrets ? (priv ? `להגדיר: ${(s.missing || []).join(", ")}` : "להשלים סודות שרת חסרים") : null,
  ].filter(Boolean);
  const sColor = s.rlsOpen === true || exposedPayment ? COLOR.RED
    : missingSecrets || exposedEmail || s.rlsOpen == null ? COLOR.YELLOW : COLOR.GREEN;
  areas.push(area("security", "אבטחה", sColor, sEv, sActions.length ? sActions.join(" · ") : null));

  // deployment
  areas.push(p.deployment?.sha
    ? area("deployment", "פריסה", COLOR.GREEN, `רץ בייצור מ-commit ${String(p.deployment.sha).slice(0, 7)} (${p.deployment.env || "?"})`)
    : area("deployment", "פריסה", COLOR.UNVERIFIED, "מזהה הפריסה לא זמין לשרת"));

  const worst = areas.some((x) => x.color === COLOR.RED) ? COLOR.RED : areas.some((x) => x.color === COLOR.YELLOW) ? COLOR.YELLOW : COLOR.GREEN;
  return { at: now, overall: worst, areas, counts: Object.fromEntries(Object.values(COLOR).map((c) => [c, areas.filter((x) => x.color === c).length])) };
}
