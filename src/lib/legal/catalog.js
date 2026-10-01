// The legal pack — slugs, titles and the current version of every document.
// Isomorphic (no browser globals): read by the static page generator, the
// footer / checkout links in the app and the acceptance endpoint
// (api/_utils/legalHandler.mjs). The texts live in ./documents.js.
//
// Bump LEGAL_VERSION whenever any user-facing text changes materially: users
// who accepted an older version are asked to accept again before paying.

export const LEGAL_VERSION = "2026-09-30";
export const LEGAL_LAST_UPDATED = "30 בספטמבר 2026";

export const LEGAL_DOCS = Object.freeze([
  { slug: "terms", title: "תנאי שימוש", short: "תנאי שימוש", acceptance: true },
  { slug: "privacy", title: "מדיניות פרטיות", short: "פרטיות", acceptance: true },
  { slug: "cancellation", title: "ביטולים, החזרים וחידוש אוטומטי", short: "ביטולים והחזרים", acceptance: true },
  { slug: "affiliate-disclosure", title: "גילוי נאות ושיווק שותפים", short: "גילוי נאות" },
  { slug: "ip-takedown", title: "קניין רוחני והודעה והסרה", short: "קניין רוחני" },
  { slug: "disclaimer", title: "הגבלת אחריות ואין הבטחת הכנסה", short: "הגבלת אחריות" },
  { slug: "content-license", title: "רישיון לתוכן משתמשים", short: "רישיון תוכן" },
  { slug: "acceptable-use", title: "שימוש הוגן ואיסור העתקה", short: "שימוש הוגן" },
  { slug: "accessibility", title: "הצהרת נגישות", short: "נגישות" },
  { slug: "cookies", title: "עוגיות והסכמה", short: "עוגיות" },
  { slug: "business", title: "פרטי העסק ויצירת קשר", short: "פרטי העסק" },
]);

export const legalPath = (slug) => `/legal/${slug}`;

/** The documents a user accepts at signup and again before a paid plan. */
export const ACCEPTANCE_DOCS = LEGAL_DOCS.filter((d) => d.acceptance).map((d) => d.slug);
