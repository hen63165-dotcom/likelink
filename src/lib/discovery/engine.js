// Luna Autonomous Discovery Engine — pure, isomorphic core.
//
// Turns real marketplace data into: a Discovery Passport per product, an
// explainable Discovery Score, an Opportunity Graph whose every opportunity
// carries WHAT / WHY / EVIDENCE / ACTION / CHANNEL / STATUS / RESULT, a
// truthful channel registry, and command plans for Luna's goals.
//
// Nothing here fabricates traffic, clicks, sales, engagement, trends, media or
// publication status. Missing evidence is reported as missing. The score
// measures discovery COVERAGE/READINESS — it never predicts sales or traffic.
// No I/O: the orchestrator injects data and persists results.
import {
  canonicalProduct, productPageUrl, creatorPageUrl, trackingLink, buildProductSeo, auditSeo,
  merchantStatus, buildContentDrafts, buildShareAsset, buildChannelPayloads, isPublicProduct, ORIGIN,
} from "./surfaces.js";
import { MEDIA_TRUTH, MEDIA_TRUTH_LABEL, productMediaTruth } from "./mediaTruth.js";
import { evidence, TRUTH } from "./truth.js";

// ── Publication proof (LAW 04) ───────────────────────────────────────────
/**
 * A publish-log row is PUBLISHED only with proof:
 *   web       → the post id exists in the public brand feed (verifiable public state)
 *   external  → the provider returned its own message id (provider confirmation)
 * "queued", "requested" or a bare local flag are never proof.
 */
export function verifyPublication(record = {}, { publicFeedIds = null, now = Date.now() } = {}) {
  const status = String(record.status || "");
  const at = Date.parse(record.publishedAt || "") || null;
  if (status !== "PUBLISHED") {
    return { verified: false, claim: status || "UNKNOWN", proof: evidence({ state: TRUTH.UNVERIFIED, source: "publish:log", evidence: `status ${status || "unknown"}` }) };
  }
  if (record.channel === "web") {
    if (!publicFeedIds) return { verified: false, claim: status, proof: evidence({ state: TRUTH.OBSERVED, source: "publish:log", evidence: "נרשם כפורסם, הפיד הציבורי לא נבדק", verifiedAt: at }) };
    const inFeed = Boolean(record.externalId && publicFeedIds.has(String(record.externalId)));
    return inFeed
      ? { verified: true, claim: status, proof: evidence({ state: TRUTH.VERIFIED, source: "brand_pulse:posts", evidence: `הפוסט ${record.externalId} קיים בפיד הציבורי`, verifiedAt: now }) }
      : { verified: false, claim: status, proof: evidence({ state: TRUTH.UNVERIFIED, source: "brand_pulse:posts", evidence: "נרשם כפורסם אבל לא נמצא בפיד הציבורי" }) };
  }
  return record.externalId
    ? { verified: true, claim: status, proof: evidence({ state: TRUTH.VERIFIED, source: `provider:${record.channel}`, evidence: "הספק החזיר מזהה הודעה", verifiedAt: at || now }) }
    : { verified: false, claim: status, proof: evidence({ state: TRUTH.UNVERIFIED, source: `provider:${record.channel}`, evidence: "סומן כפורסם בלי אישור מהספק" }) };
}

export const ENGINE_VERSION = 1;

/** Hebrew counts: "נקודה אחת" / "3 נקודות", "קליק אחד" / "4 קליקים". */
export function heCount(n, one, many) {
  const v = Number(n) || 0;
  return v === 1 ? one : `${v} ${many}`;
}

// ── Channel registry ─────────────────────────────────────────────────────
export const CHANNEL_STATE = Object.freeze({
  CONNECTED: "CONNECTED",
  NOT_CONNECTED: "NOT_CONNECTED",
  REQUIRES_AUTH: "REQUIRES_AUTH",
  REQUIRES_CONFIGURATION: "REQUIRES_CONFIGURATION",
  READY: "READY",
  PUBLISHING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
  RATE_LIMITED: "RATE_LIMITED",
});

export const CHANNEL_STATE_LABEL = Object.freeze({
  CONNECTED: "מחובר",
  NOT_CONNECTED: "לא מחובר",
  REQUIRES_AUTH: "דורש התחברות",
  REQUIRES_CONFIGURATION: "דורש הגדרה",
  READY: "מוכן",
  PUBLISHING: "מפרסם",
  PUBLISHED: "פורסם",
  FAILED: "נכשל",
  RATE_LIMITED: "הוגבל זמנית",
});

function lastBy(rows, pred) {
  return (rows || []).filter(pred).sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))[0] || null;
}

/**
 * Truthful channel registry. `env` carries BOOLEANS only (is a variable set),
 * never secret values. A channel is CONNECTED only on real configuration.
 */
export function buildChannelRegistry({ env = {}, publications = [], merchantEligibleCount = 0 } = {}) {
  const pubFor = (provider) => {
    const last = lastBy(publications, (p) => p?.channel === provider && p?.status === "PUBLISHED");
    const lastErr = lastBy(publications, (p) => p?.channel === provider && p?.error);
    return {
      lastPublication: last ? { at: last.publishedAt || null, contentId: last.contentId || null } : null,
      lastError: lastErr ? { at: lastErr.publishedAt || null, code: String(lastErr.error) } : null,
    };
  };
  const registry = [
    {
      provider: "web", label: "פיד האתר ועמודי המוצר", state: CHANNEL_STATE.CONNECTED, connected: true,
      auth: "not_required", configuration: "configured", capabilities: ["product_pages", "creator_pages", "site_feed", "sitemap", "internal_search"],
      requirement: null, ...pubFor("web"),
    },
    {
      provider: "share_links", label: "שיתוף ידני (וואטסאפ, טלגרם, העתקה)", state: CHANNEL_STATE.READY, connected: true,
      auth: "not_required", configuration: "configured", capabilities: ["manual_share"],
      requirement: null, lastPublication: null, lastError: null,
    },
    {
      provider: "google_merchant", label: "Google Merchant",
      state: merchantEligibleCount > 0 ? CHANNEL_STATE.READY : CHANNEL_STATE.REQUIRES_CONFIGURATION,
      connected: false, auth: "owner_account", configuration: merchantEligibleCount > 0 ? "feed_ready" : "no_eligible_products",
      capabilities: ["product_feed"],
      requirement: merchantEligibleCount > 0
        ? "הפיד מוכן. חיבור חשבון Google Merchant Center מתבצע על ידי הבעלים ולא אומת מכאן."
        : "אין מוצרים זכאים: Google Merchant מקבל רק מוצרים שנמכרים ישירות באתר (לא מוצרי שותפים).",
      ownerAction: merchantEligibleCount > 0 ? "לחבר את /google-feed.xml ב-Google Merchant Center" : "להחליט על מכירה ישירה באתר למוצרים שמתאימים לכך",
      lastPublication: null, lastError: null,
    },
    {
      provider: "telegram", label: "Telegram",
      state: env.telegram ? CHANNEL_STATE.CONNECTED : CHANNEL_STATE.REQUIRES_CONFIGURATION, connected: Boolean(env.telegram),
      auth: env.telegram ? "configured" : "missing", configuration: env.telegram ? "configured" : "missing",
      capabilities: ["broadcast_post"],
      requirement: env.telegram ? null : "ערוץ הטלגרם של LikeLink עדיין לא הוגדר על ידי מנהלת הפלטפורמה",
      ownerAction: env.telegram ? null : "להגדיר BRAND_TELEGRAM_BOT ו-BRAND_TELEGRAM_CHAT ב-Vercel",
      ...pubFor("telegram"),
    },
    {
      provider: "webhook", label: "Webhook",
      state: env.webhook ? CHANNEL_STATE.CONNECTED : CHANNEL_STATE.REQUIRES_CONFIGURATION, connected: Boolean(env.webhook),
      auth: env.webhook ? "configured" : "missing", configuration: env.webhook ? "configured" : "missing",
      capabilities: ["structured_payload"],
      requirement: env.webhook ? null : "חיבור Webhook עדיין לא הוגדר על ידי מנהלת הפלטפורמה",
      ownerAction: env.webhook ? null : "להגדיר BRAND_WEBHOOK_URL ב-Vercel",
      ...pubFor("webhook"),
    },
    {
      provider: "email", label: "דיוור באימייל",
      state: CHANNEL_STATE.REQUIRES_CONFIGURATION, connected: false,
      auth: env.email ? "configured" : "missing", configuration: "no_consented_audience",
      capabilities: ["email"],
      requirement: "אין רשימת נמענים שאישרה קבלת דיוור — שליחה שיווקית לא תתבצע בלי הסכמה",
      lastPublication: null, lastError: null,
    },
    {
      provider: "social_apis", label: "רשתות חברתיות (Instagram / Facebook / TikTok)",
      state: CHANNEL_STATE.NOT_CONNECTED, connected: false, auth: "missing", configuration: "missing",
      capabilities: [], requirement: "אין חיבור API מאושר לרשתות — דורש חיבור חשבון על ידי הבעלים",
      lastPublication: null, lastError: null,
    },
    {
      provider: "ads_apis", label: "פרסום ממומן",
      state: CHANNEL_STATE.NOT_CONNECTED, connected: false, auth: "missing", configuration: "missing",
      capabilities: [], requirement: "הוצאת כסף על פרסום דורשת חשבון מודעות מחובר ואישור בעלים",
      lastPublication: null, lastError: null,
    },
  ];
  return registry;
}

// ── Discovery Passport ───────────────────────────────────────────────────
export const SURFACE_STATUS = Object.freeze({ LIVE: "live", MISSING: "missing", BLOCKED: "blocked", NOT_APPLICABLE: "not_applicable", READY: "ready", STALE: "stale" });

function productSignals(productId, { clicks = [], sales = [], publications = [], publicFeedIds = null }) {
  const mine = (clicks || []).filter((c) => c && String(c.productId) === productId);
  const mySales = (sales || []).filter((s) => s && String(s.productId || s.product) === productId);
  const myPubs = (publications || []).filter((p) => p && String(p.productId) === productId && p.status === "PUBLISHED");
  const proofs = myPubs.map((p) => ({ channel: p.channel, ...verifyPublication(p, { publicFeedIds }) }));
  const lastClick = mine.reduce((m, c) => Math.max(m, Number(c.ts) || 0), 0) || null;
  const bySource = {};
  for (const c of mine) {
    const src = String(c.source || c.src || "unknown");
    bySource[src] = (bySource[src] || 0) + 1;
  }
  return {
    clicks: mine.length,
    lastClickAt: lastClick,
    clicksBySource: bySource,
    sales: mySales.length,
    publications: myPubs.length,
    verifiedPublications: proofs.filter((x) => x.verified).length,
    verifiedExternalPublications: proofs.filter((x) => x.verified && x.channel !== "web").length,
    unverifiedPublished: proofs.filter((x) => !x.verified).length,
    lastPublishedAt: myPubs.reduce((m, p) => Math.max(m, Date.parse(p.publishedAt || 0) || 0), 0) || null,
  };
}

/**
 * Build one product's Discovery Passport from real data.
 * `storedAssets` is the last persisted discovery:assets:<id> (or null).
 */
export function buildPassport({
  product, marketers = [], clicks = [], sales = [], publications = [], ugcAssets = [], collections = [],
  channels = [], duplicateTitle = false, storedAssets = null, previous = null, origin = ORIGIN, now = Date.now(),
  publicFeedIds = null,
} = {}) {
  const marketer = (marketers || []).find((m) => m && m.id === product?.marketerId) || null;
  const c = canonicalProduct(product, marketer, origin);
  const isPublic = isPublicProduct(product, marketers);
  const seo = buildProductSeo(c);
  const seoAudit = auditSeo(c, seo, { duplicateTitle, inSitemap: isPublic });
  const merchant = merchantStatus(product, marketers, origin);
  const media = productMediaTruth(product, ugcAssets);
  const signals = productSignals(c.id, { clicks, sales, publications, publicFeedIds });
  const link = trackingLink(c);
  const inCollection = (collections || []).some((col) => Array.isArray(col?.productIds) && col.productIds.includes(c.id));
  const compare = Number(product?.originalPrice || product?.compareAtPrice || 0);
  const hasDeal = compare > 0 && c.price && compare > c.price;
  // A version the owner restored by hand stays "fresh" until the product changes (LAW 13).
  const sharePinned = Boolean(storedAssets?.share && storedAssets.pinnedFor === c.fingerprint);
  const shareFresh = Boolean(storedAssets && storedAssets.share && (storedAssets.fingerprint === c.fingerprint || sharePinned));
  const externalConnected = (channels || []).filter((ch) => ["telegram", "webhook"].includes(ch.provider) && ch.connected);

  const surfaces = [
    { id: "product_page", he: "עמוד מוצר ציבורי", status: isPublic ? SURFACE_STATUS.LIVE : SURFACE_STATUS.BLOCKED, url: isPublic ? productPageUrl(c) : "", evidence: isPublic ? "מאושר ומשויך ליוצר" : "המוצר לא מאושר או לא משויך ליוצר" },
    { id: "creator_page", he: "עמוד היוצר", status: c.creator?.slug ? SURFACE_STATUS.LIVE : SURFACE_STATUS.MISSING, url: creatorPageUrl(c), evidence: c.creator?.name || "אין יוצר משויך" },
    { id: "sitemap", he: "מפת האתר (sitemap)", status: isPublic ? SURFACE_STATUS.LIVE : SURFACE_STATUS.BLOCKED, url: isPublic ? `${c.origin}/sitemap.xml` : "", evidence: isPublic ? "נכלל אוטומטית" : "רק מוצרים ציבוריים נכללים" },
    { id: "internal_search", he: "חיפוש וגילוי באתר", status: isPublic ? SURFACE_STATUS.LIVE : SURFACE_STATUS.BLOCKED, url: isPublic ? `${c.origin}/feed` : "", evidence: isPublic ? "מופיע בפיד ובחיפוש" : "מוסתר מהפיד" },
    { id: "collection", he: "קולקציה", status: inCollection ? SURFACE_STATUS.LIVE : SURFACE_STATUS.MISSING, url: "", evidence: inCollection ? "משויך לקולקציה" : "לא נמצא בשום קולקציה" },
    { id: "deal", he: "מבצע", status: hasDeal ? SURFACE_STATUS.LIVE : SURFACE_STATUS.NOT_APPLICABLE, url: "", evidence: hasDeal ? `מחיר מקורי ₪${compare}` : "אין מחיר מקורי במוצר — אין מבצע אמיתי להציג" },
    { id: "seo", he: "SEO לעמוד המוצר", status: seoAudit.passed === seoAudit.total ? SURFACE_STATUS.LIVE : SURFACE_STATUS.MISSING, url: productPageUrl(c), evidence: `${seoAudit.passed}/${seoAudit.total} בדיקות עברו` },
    { id: "merchant", he: "Google Merchant", status: merchant.eligible ? SURFACE_STATUS.READY : SURFACE_STATUS.BLOCKED, url: merchant.eligible ? `${c.origin}/google-feed.xml` : "", evidence: merchant.eligible ? "זכאי לפיד" : merchant.reasons[0]?.he || "לא זכאי" },
    { id: "media", he: "מדיה", status: media.state === MEDIA_TRUTH.MISSING_MEDIA ? SURFACE_STATUS.MISSING : SURFACE_STATUS.LIVE, url: media.url, evidence: `${MEDIA_TRUTH_LABEL[media.state].he}${media.synthetic ? " · סינתטית" : ""}` },
    { id: "share_asset", he: "חבילת שיתוף", status: shareFresh ? SURFACE_STATUS.READY : storedAssets ? SURFACE_STATUS.STALE : SURFACE_STATUS.MISSING, url: productPageUrl(c), evidence: sharePinned ? "גרסה קודמת ששוחזרה ידנית" : shareFresh ? "מעודכנת לנתוני המוצר" : storedAssets ? "המוצר השתנה מאז שנוצרה" : "עדיין לא נוצרה" },
    { id: "tracking", he: "לינק מעקב", status: link ? SURFACE_STATUS.LIVE : SURFACE_STATUS.BLOCKED, url: link, evidence: link ? `נרשמו ${heCount(signals.clicks, "קליק אמיתי אחד", "קליקים אמיתיים")}` : "חסר לינק חנות במוצר" },
    { id: "distribution", he: "ערוצי הפצה חיצוניים", status: externalConnected.length ? SURFACE_STATUS.READY : SURFACE_STATUS.BLOCKED, url: "", evidence: externalConnected.length ? externalConnected.map((x) => x.label).join(", ") : "אין ערוץ חיצוני מחובר" },
  ];

  // DiscoverySurface: every surface carries the same machine-readable flags
  // and a truth record (source + evidence + timestamp) — no bare badges.
  const SURFACE_SOURCE = {
    product_page: "marketplace:products", creator_page: "marketplace:marketers", sitemap: "google-feed:sitemap",
    internal_search: "public catalog", collection: "marketplace:collections", deal: "marketplace:products",
    seo: "buildProductSeo (/p/:id)", merchant: "merchantStatus (feed rules)", media: "mediaTruth",
    share_asset: "discovery:assets", tracking: "marketplace:clicks", distribution: "channel registry",
  };
  for (const sf of surfaces) {
    const positive = ["live", "ready"].includes(sf.status);
    sf.flags = {
      available: sf.status !== "not_applicable",
      eligible: sf.status !== "blocked",
      connected: sf.id === "distribution" ? externalConnected.length > 0 : sf.status !== "blocked",
      published: sf.id === "distribution" ? signals.verifiedExternalPublications > 0 : positive,
      verified: positive,
      interactions: sf.id === "tracking" ? signals.clicks : null,
      conversions: sf.id === "tracking" ? signals.sales : null,
      lastChecked: now,
    };
    sf.truth = positive
      ? evidence({ state: TRUTH.OBSERVED, source: SURFACE_SOURCE[sf.id] || "discovery", evidence: sf.evidence, verifiedAt: now, ttlMs: 24 * 3600 * 1000 })
      : evidence({ state: sf.status === "not_applicable" ? TRUTH.MISSING : TRUTH.UNVERIFIED, source: SURFACE_SOURCE[sf.id] || "discovery", evidence: sf.evidence });
  }

  const passport = {
    version: ENGINE_VERSION,
    productId: c.id,
    title: c.title,
    image: c.image,
    creator: c.creator,
    fingerprint: c.fingerprint,
    generatedAt: now,
    isPublic,
    surfaces,
    seo: { served: { title: seo.title, description: seo.description, canonical: seo.canonical }, audit: seoAudit },
    merchant,
    media,
    tracking: { link, clicks: signals.clicks, lastClickAt: signals.lastClickAt, bySource: signals.clicksBySource },
    signals,
  };
  passport.score = discoveryScore(passport, { externalConnected: externalConnected.length });
  if (previous && Number.isFinite(previous.score)) {
    passport.previousScore = previous.score;
    passport.scoreDelta = passport.score.score - previous.score;
  }
  passport.opportunities = productOpportunities(passport, { channels, canonical: c });
  return passport;
}

// ── Discovery Score ──────────────────────────────────────────────────────
// Readiness/coverage only. Weights sum to 100; every point is explained.
export const SCORE_WEIGHTS = Object.freeze({
  public_page: 15, search: 10, creator: 10, seo: 15, merchant: 10, media: 10, sharing: 10, distribution: 10, tracking: 10,
});

export function discoveryScore(p, { externalConnected = 0 } = {}) {
  const s = Object.fromEntries(p.surfaces.map((x) => [x.id, x]));
  const mediaPoints = {
    [MEDIA_TRUTH.REAL_VIDEO]: 10, [MEDIA_TRUTH.RENDER_JOB_ACTIVE]: 6, [MEDIA_TRUTH.SYNTHETIC_ANIMATION]: 5,
    [MEDIA_TRUTH.STATIC_IMAGE]: 5, [MEDIA_TRUTH.MISSING_MEDIA]: 0,
  }[p.media.state];
  const seoRatio = p.seo.audit.total ? p.seo.audit.passed / p.seo.audit.total : 0;
  const components = [
    { id: "public_page", he: "עמוד מוצר ציבורי", max: SCORE_WEIGHTS.public_page, earned: s.product_page.status === "live" ? 15 : 0, evidence: s.product_page.evidence },
    { id: "search", he: "sitemap וחיפוש באתר", max: SCORE_WEIGHTS.search, earned: (s.sitemap.status === "live" ? 5 : 0) + (s.internal_search.status === "live" ? 5 : 0), evidence: s.sitemap.evidence },
    { id: "creator", he: "קשר ליוצר", max: SCORE_WEIGHTS.creator, earned: s.creator_page.status === "live" ? 10 : 0, evidence: s.creator_page.evidence },
    { id: "seo", he: "SEO", max: SCORE_WEIGHTS.seo, earned: Math.round(15 * seoRatio), evidence: s.seo.evidence },
    { id: "merchant", he: "Google Merchant", max: SCORE_WEIGHTS.merchant, earned: p.merchant.eligible ? 10 : 0, evidence: s.merchant.evidence },
    { id: "media", he: "מדיה", max: SCORE_WEIGHTS.media, earned: mediaPoints, evidence: s.media.evidence },
    { id: "sharing", he: "חבילת שיתוף", max: SCORE_WEIGHTS.sharing, earned: s.share_asset.status === "ready" ? 10 : 0, evidence: s.share_asset.evidence },
    { id: "distribution", he: "הפצה חיצונית מחוברת", max: SCORE_WEIGHTS.distribution, earned: externalConnected > 0 ? 10 : 0, evidence: s.distribution.evidence },
    { id: "tracking", he: "מעקב אמיתי", max: SCORE_WEIGHTS.tracking, earned: s.tracking.status === "live" ? 10 : 0, evidence: s.tracking.status === "live" ? "לינק מעקב מחובר" : s.tracking.evidence },
  ].map((x) => ({ ...x, met: x.earned === x.max }));
  const score = components.reduce((sum, x) => sum + x.earned, 0);
  return {
    score,
    max: 100,
    components,
    meaning: "ציון מוכנות וכיסוי לגילוי — לא תחזית מכירות או תנועה",
  };
}

// ── Opportunities ────────────────────────────────────────────────────────
export const SAFETY = Object.freeze({ SAFE: "safe", APPROVAL: "approval", BLOCKED: "blocked" });
export const OPPORTUNITY_STATUS = Object.freeze({
  READY: "ready", EXECUTED: "executed", UP_TO_DATE: "up_to_date", REQUIRES_APPROVAL: "requires_approval", BLOCKED: "blocked",
});

function opp(p, kind, fields) {
  return {
    id: `${p.productId}:${kind}`,
    productId: p.productId,
    productTitle: p.title,
    kind,
    result: null,
    ...fields,
  };
}

function productOpportunities(p, { channels = [] } = {}) {
  const s = Object.fromEntries(p.surfaces.map((x) => [x.id, x]));
  const out = [];
  if (s.share_asset.status !== "ready" && p.isPublic) {
    out.push(opp(p, "share_asset", {
      what: "ליצור חבילת שיתוף: טקסט, לינק מעקב ותצוגת שיתוף",
      why: "בלי חבילת שיתוף מוכנה, כל שיתוף מתחיל מאפס ואין מדידה של המקור",
      evidence: [s.share_asset.evidence, s.tracking.evidence],
      action: "ייצור אוטומטי מנתוני המוצר האמיתיים ושמירה במערכת",
      channel: "share_links", safety: SAFETY.SAFE, status: OPPORTUNITY_STATUS.READY, weight: SCORE_WEIGHTS.sharing,
    }));
  }
  if (p.isPublic) {
    out.push(opp(p, "content_drafts", {
      what: "להכין טיוטות תוכן: הוק, סיפור מוצר, טקסט לרשתות ותיאור SEO",
      why: "תוכן מוכן מקצר את הדרך לפרסום בכל ערוץ",
      evidence: ["נבנה רק מהכותרת, התיאור, המחיר, הקטגוריה והיוצר של המוצר"],
      action: "יצירת טיוטות (מסומנות כטיוטה) ושמירה במערכת",
      channel: "web", safety: SAFETY.SAFE, status: s.share_asset.status === "ready" ? OPPORTUNITY_STATUS.UP_TO_DATE : OPPORTUNITY_STATUS.READY, weight: 5,
    }));
  }
  const failedSeo = p.seo.audit.checks.filter((c) => !c.ok);
  out.push(opp(p, "seo", {
    what: failedSeo.length ? `לתקן SEO: ${failedSeo.map((c) => c.he).join(", ")}` : "SEO של עמוד המוצר תקין",
    why: "עמוד מוצר עם כותרת, תיאור ונתונים מובנים נכונים מתגלה טוב יותר במנועי חיפוש",
    evidence: p.seo.audit.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.he} (${c.evidence})`),
    action: failedSeo.length ? "העמוד נבנה מחדש אוטומטית מנתוני המוצר; שדות חסרים דורשים עדכון במוצר" : "אין צורך בפעולה",
    channel: "web",
    safety: failedSeo.some((c) => ["title", "description"].includes(c.id) && !p.title) ? SAFETY.BLOCKED : SAFETY.SAFE,
    status: failedSeo.length ? OPPORTUNITY_STATUS.READY : OPPORTUNITY_STATUS.UP_TO_DATE, weight: failedSeo.length ? SCORE_WEIGHTS.seo : 0,
  }));
  if (!p.merchant.eligible) {
    out.push(opp(p, "merchant", {
      what: "להכניס את המוצר ל-Google Merchant",
      why: "Google Shopping הוא משטח גילוי מסחרי מרכזי",
      evidence: p.merchant.reasons.map((r) => r.he),
      action: p.merchant.requiresOwner ? "דורש החלטת בעלים: מכירה ישירה באתר (צ'קאאוט באתר) במקום מוצר שותפים" : "יש להשלים את השדות החסרים במוצר",
      channel: "google_merchant", safety: p.merchant.requiresOwner ? SAFETY.APPROVAL : SAFETY.BLOCKED,
      status: p.merchant.requiresOwner ? OPPORTUNITY_STATUS.REQUIRES_APPROVAL : OPPORTUNITY_STATUS.BLOCKED, weight: SCORE_WEIGHTS.merchant,
    }));
  }
  if (s.collection.status !== "live" && p.isPublic) {
    out.push(opp(p, "collection", {
      what: "לשייך את המוצר לקולקציה של היוצר",
      why: "קולקציות יוצרות מסלול גילוי נוסף ועמוד שאפשר לשתף",
      evidence: [s.collection.evidence],
      action: "יצירת קולקציה נעשית על ידי היוצר בסטודיו — לונה לא משנה אוצרות בלי אישור",
      channel: "web", safety: SAFETY.APPROVAL, status: OPPORTUNITY_STATUS.REQUIRES_APPROVAL, weight: 4,
    }));
  }
  if ([MEDIA_TRUTH.STATIC_IMAGE, MEDIA_TRUTH.SYNTHETIC_ANIMATION, MEDIA_TRUTH.MISSING_MEDIA].includes(p.media.state)) {
    out.push(opp(p, "real_video", {
      what: "ליצור סרטון אמיתי למוצר",
      why: "סרטון מגדיל את מגוון המשטחים (רילס, סטורי) שבהם המוצר יכול להופיע",
      evidence: [`מצב המדיה כרגע: ${MEDIA_TRUTH_LABEL[p.media.state].he}${p.media.synthetic ? " (סינתטית)" : ""}`],
      action: "יצירת סרטון אמיתי בסטודיו הווידאו — לא נוצר סרטון מדומה",
      channel: "web", safety: SAFETY.APPROVAL, status: OPPORTUNITY_STATUS.REQUIRES_APPROVAL, weight: 5,
    }));
  }
  for (const ch of channels.filter((x) => ["telegram", "webhook"].includes(x.provider))) {
    out.push(opp(p, `channel_${ch.provider}`, {
      what: `להפיץ את המוצר ב-${ch.label}`,
      why: "ערוץ חיצוני מגיע לקהל שלא נמצא כרגע באתר",
      evidence: [ch.connected ? "הערוץ מחובר בענן" : ch.requirement],
      action: ch.connected ? "פרסום חיצוני דורש אישור בעלים לפני שליחה" : ch.requirement,
      channel: ch.provider,
      safety: ch.connected ? SAFETY.APPROVAL : SAFETY.BLOCKED,
      status: ch.connected ? OPPORTUNITY_STATUS.REQUIRES_APPROVAL : OPPORTUNITY_STATUS.BLOCKED,
      weight: ch.connected ? 6 : 1,
    }));
  }
  if (!s.tracking.url) {
    out.push(opp(p, "tracking", {
      what: "לחבר לינק חנות כדי שאפשר יהיה למדוד קליקים",
      why: "בלי לינק חנות אין לינק מעקב ואין מדידה אמיתית",
      evidence: [s.tracking.evidence], action: "עדכון לינק החנות במוצר (פעולת יוצר)",
      channel: "web", safety: SAFETY.BLOCKED, status: OPPORTUNITY_STATUS.BLOCKED, weight: SCORE_WEIGHTS.tracking,
    }));
  }
  return out;
}

/**
 * Rank opportunities across products from real evidence only. When no product
 * has a real signal, ranking falls back to readiness gaps — and says so.
 */
export function prioritize(passports = [], { now = Date.now() } = {}) {
  const anySignal = passports.some((p) => p.signals.clicks > 0 || p.signals.sales > 0);
  const ranked = [];
  for (const p of passports) {
    for (const o of p.opportunities) {
      if (o.status === OPPORTUNITY_STATUS.UP_TO_DATE) continue;
      const reasons = [`פער של ${heCount(o.weight, "נקודה אחת", "נקודות")} בציון הגילוי`];
      let priority = o.weight;
      if (p.signals.clicks > 0) { priority += 3 + Math.min(p.signals.clicks, 10); reasons.push(`${heCount(p.signals.clicks, "קליק אמיתי אחד", "קליקים אמיתיים")} על המוצר`); }
      if (p.signals.sales > 0) { priority += 5; reasons.push(heCount(p.signals.sales, "מכירה אמיתית אחת", "מכירות אמיתיות")); }
      const fresh = p.signals.lastClickAt && now - p.signals.lastClickAt < 7 * 86400000;
      if (fresh) { priority += 2; reasons.push("פעילות אמיתית בשבוע האחרון"); }
      if (o.safety === SAFETY.SAFE) priority += 2;
      ranked.push({ ...o, priority, priorityReasons: reasons });
    }
  }
  ranked.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return {
    ranked,
    evidence: anySignal ? "sufficient" : "insufficient",
    evidenceNote: anySignal
      ? "הדירוג משלב פערי מוכנות עם קליקים ומכירות אמיתיים"
      : "אין עדיין מספיק נתוני ביצועים אמיתיים — הדירוג מבוסס על פערי מוכנות בלבד",
  };
}

// ── Opportunity Graph ────────────────────────────────────────────────────
export function buildOpportunityGraph(passports = [], channels = []) {
  const nodes = [];
  const edges = [];
  const seen = new Set();
  const node = (id, type, label) => { if (!seen.has(id)) { seen.add(id); nodes.push({ id, type, label }); } };
  for (const ch of channels) node(`channel:${ch.provider}`, "channel", ch.label);
  for (const p of passports) {
    const pid = `product:${p.productId}`;
    node(pid, "product", p.title);
    if (p.creator) { node(`creator:${p.creator.id}`, "creator", p.creator.name); edges.push({ from: pid, to: `creator:${p.creator.id}`, type: "recommended_by" }); }
    for (const s of p.surfaces) {
      if (s.status === "not_applicable") continue;
      const sid = `surface:${p.productId}:${s.id}`;
      node(sid, "surface", s.he);
      edges.push({ from: pid, to: sid, type: s.status });
    }
    if (p.tracking.link) {
      node(`signal:${p.productId}:clicks`, "signal", heCount(p.tracking.clicks, "קליק אחד", "קליקים"));
      edges.push({ from: `signal:${p.productId}:clicks`, to: pid, type: "measures" });
    }
    for (const o of p.opportunities) {
      const oid = `opportunity:${o.id}`;
      node(oid, "opportunity", o.what);
      edges.push({ from: pid, to: oid, type: o.status });
      if (o.channel) edges.push({ from: oid, to: `channel:${o.channel}`, type: "via" });
    }
  }
  return { nodes, edges, counts: { nodes: nodes.length, edges: edges.length } };
}

// ── Luna commands ────────────────────────────────────────────────────────
// Each command: which opportunity kinds it focuses on and which SAFE kinds it
// may execute on its own. Everything else is surfaced, never executed.
export const LUNA_COMMANDS = Object.freeze({
  increase_exposure: { he: "לונה, תגדילי את החשיפה", focus: ["share_asset", "content_drafts", "seo", "merchant", "collection", "channel_telegram", "channel_webhook", "real_video"], execute: ["share_asset", "content_drafts", "seo"] },
  promote_product: { he: "לונה, קדמי את המוצר הזה", requiresProduct: true, focus: ["share_asset", "content_drafts", "channel_telegram", "channel_webhook", "real_video", "collection"], execute: ["share_asset", "content_drafts"] },
  organic_discovery: { he: "לונה, הגדילי גילוי אורגני", focus: ["seo", "merchant", "collection", "content_drafts"], execute: ["seo", "content_drafts"] },
  find_opportunities: { he: "לונה, מצאי לי הזדמנויות", focus: null, execute: [] },
  prepare_distribution: { he: "לונה, הכיני את המוצר להפצה", focus: ["share_asset", "content_drafts", "channel_telegram", "channel_webhook", "merchant"], execute: ["share_asset", "content_drafts"] },
  prepare_campaign: { he: "לונה, הכיני קמפיין", focus: ["content_drafts", "share_asset", "real_video", "channel_telegram", "channel_webhook"], execute: ["content_drafts", "share_asset"], campaign: true },
});

export function planCommand(command, passports, { now = Date.now() } = {}) {
  const def = LUNA_COMMANDS[command];
  if (!def) return { ok: false, error: "unknown_command" };
  const scoped = passports.map((p) => ({
    ...p,
    opportunities: p.opportunities.filter((o) => !def.focus || def.focus.includes(o.kind)),
  }));
  const { ranked, evidence, evidenceNote } = prioritize(scoped, { now });
  const execute = ranked.filter((o) => o.safety === SAFETY.SAFE && def.execute.includes(o.kind) && o.status === OPPORTUNITY_STATUS.READY);
  const approvals = ranked.filter((o) => o.safety === SAFETY.APPROVAL);
  const blocked = ranked.filter((o) => o.safety === SAFETY.BLOCKED);
  const suggestions = ranked.filter((o) => o.safety === SAFETY.SAFE && !execute.includes(o));
  return { ok: true, command, label: def.he, ranked, execute, approvals, blocked, suggestions, evidence, evidenceNote, campaign: Boolean(def.campaign) };
}

/** Assets the safe actions persist for one product (share, drafts, payloads). */
export function buildProductAssets(product, marketers, channels, origin = ORIGIN, now = Date.now()) {
  const marketer = (marketers || []).find((m) => m && m.id === product?.marketerId) || null;
  const c = canonicalProduct(product, marketer, origin);
  const drafts = buildContentDrafts(c);
  const share = buildShareAsset(c, drafts);
  if (share) share.trackingLink = trackingLink(c, "luna_share");
  return {
    productId: c.id,
    fingerprint: c.fingerprint,
    generatedAt: now,
    share,
    drafts,
    seo: buildProductSeo(c),
    payloads: buildChannelPayloads(c, share, channels),
    provenance: { source: "marketplace:products", productId: c.id, fingerprint: c.fingerprint, engineVersion: ENGINE_VERSION },
  };
}
