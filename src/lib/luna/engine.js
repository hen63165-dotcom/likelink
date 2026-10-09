// Luna — the explainable intelligence layer.
//
// Every recommendation Luna makes carries the REAL signals behind it:
// photo present, price set, working store link, description, real video,
// real clicks/views from the ledger, recency. Nothing here fabricates sales,
// clicks, followers, trends or publication status — missing data is reported
// as missing ("אין מספיק נתונים"), and suggestions are labelled as suggestions.
//
// Pure functions: the Studio and the public site call them with the data they
// already have (MarketplaceContext); tests call them directly.
import {
  MEDIA_STATE, productMedia, merchantOf, isHttpUrl, activityByProduct, isNewProduct,
  categoryLabel, publicCatalog,
} from "../site/catalog.js";
import { isDirectMerchantProduct, DEFAULT_BASE_URL } from "../googleFeed.js";

const L = (lang, he, en) => (lang === "en" ? en : he);

/** Real signals for one product. */
export function productSignals(product, { clicks = [], videos = [], activity = null, now = Date.now() } = {}) {
  const act = (activity || activityByProduct(clicks)).get(product?.id) || { clicks: 0, views: 0 };
  const media = productMedia(product, videos);
  const desc = String(product?.description || "").trim();
  return {
    hasImage: isHttpUrl(product?.image),
    hasPrice: Number(product?.price) > 0,
    hasStoreLink: isHttpUrl(product?.affiliateUrl),
    hasDescription: desc.length >= 40,
    descriptionLength: desc.length,
    hasCategory: Boolean(product?.category && product.category !== "Other"),
    mediaState: media.state,
    clicks: act.clicks,
    views: act.views,
    isNew: isNewProduct(product, now),
    merchant: merchantOf(product).name,
  };
}

/**
 * Score + human reasons. The score only orders products; the reasons are what
 * the UI shows ("לונה ממליצה… כי…").
 */
export function scoreProduct(product, ctx = {}, lang = "he") {
  const s = productSignals(product, ctx);
  let score = 0;
  const reasons = [];
  if (s.hasImage) { score += 25; reasons.push(L(lang, "יש תמונה תקינה", "it has a valid photo")); }
  if (s.hasPrice) { score += 20; reasons.push(L(lang, "המחיר זמין", "the price is available")); }
  if (s.hasStoreLink) { score += 20; reasons.push(L(lang, s.merchant ? `קישור מסחרי תקין ל-${s.merchant}` : "קישור מסחרי תקין", s.merchant ? `a working store link to ${s.merchant}` : "a working store link")); }
  if (s.hasDescription) { score += 10; reasons.push(L(lang, "יש תיאור מלא", "it has a full description")); }
  if (s.hasCategory) score += 5;
  if (s.mediaState === MEDIA_STATE.REAL_VIDEO) { score += 10; reasons.push(L(lang, "יש סרטון אמיתי", "it has a real video")); }
  const activity = s.clicks + s.views;
  if (activity > 0) {
    score += Math.min(10, Math.round(Math.log2(1 + activity) * 3));
    reasons.push(L(lang, `נמדדו ${s.clicks} קליקים ו-${s.views} צפיות אמיתיים`, `${s.clicks} real clicks and ${s.views} real views were measured`));
  } else {
    reasons.push(L(lang, "אין עדיין נתוני פעילות — הדירוג לפי איכות הדף בלבד", "no activity data yet — ranked on page quality only"));
  }
  if (s.isNew) { score += 5; reasons.push(L(lang, "נוסף לאחרונה", "recently added")); }
  return { product, score, reasons, signals: s };
}

export function rankProducts(products = [], ctx = {}, lang = "he") {
  const activity = activityByProduct(ctx.clicks || []);
  return (Array.isArray(products) ? products : [])
    .map((p) => scoreProduct(p, { ...ctx, activity }, lang))
    .sort((a, b) => b.score - a.score || Number(b.product.createdAt || 0) - Number(a.product.createdAt || 0));
}

/** One sentence the UI can show verbatim. */
export function explainRecommendation(scored, lang = "he") {
  const r = scored?.reasons || [];
  if (!r.length) return "";
  return L(lang, `לונה ממליצה על המוצר הזה כי ${r.join(", ")}.`, `Luna recommends this product because ${r.join(", ")}.`);
}

/** What is missing or weak on a product page — each with the exact fix. */
export function productGaps(product, ctx = {}, lang = "he") {
  const s = productSignals(product, ctx);
  const title = String(product?.title || "").trim();
  const gaps = [];
  if (!s.hasImage) gaps.push({ id: "image", severity: "high", text: L(lang, "חסרה תמונת מוצר תקינה", "Missing a valid product photo"), fix: L(lang, "הוסיפי קישור לתמונה (https) בעריכת המוצר", "Add a https image URL in the product editor") });
  if (!s.hasPrice) gaps.push({ id: "price", severity: "high", text: L(lang, "אין מחיר", "No price"), fix: L(lang, "הזיני מחיר בשקלים", "Enter a price in ILS") });
  if (!s.hasStoreLink) gaps.push({ id: "link", severity: "high", text: L(lang, "אין קישור מסחרי תקין", "No valid store link"), fix: L(lang, "הדביקי את קישור המוצר בחנות (https)", "Paste the product's store link (https)") });
  if (!s.hasDescription) gaps.push({ id: "description", severity: "medium", text: L(lang, s.descriptionLength ? `התיאור קצר (${s.descriptionLength} תווים)` : "אין תיאור", s.descriptionLength ? `Short description (${s.descriptionLength} chars)` : "No description"), fix: L(lang, "כתבי לפחות 80 תווים: חומר, מידות, למי זה מתאים", "Write at least 80 characters: material, size, who it is for") });
  if (title.length < 15) gaps.push({ id: "title-short", severity: "medium", text: L(lang, "הכותרת קצרה מדי לחיפוש", "Title too short for search"), fix: L(lang, "הוסיפי סוג מוצר ומאפיין עיקרי לכותרת", "Add the product type and a key attribute to the title") });
  if (title.length > 150) gaps.push({ id: "title-long", severity: "low", text: L(lang, "הכותרת ארוכה מ-150 תווים", "Title longer than 150 characters"), fix: L(lang, "קצרי ל-70–150 תווים", "Shorten to 70–150 characters") });
  if (!s.hasCategory) gaps.push({ id: "category", severity: "low", text: L(lang, "לא נבחרה קטגוריה", "No category selected"), fix: L(lang, "בחרי קטגוריה כדי שהמוצר יופיע בגילוי", "Pick a category so it appears in discovery") });
  if (s.mediaState !== MEDIA_STATE.REAL_VIDEO) gaps.push({ id: "video", severity: "low", text: L(lang, "אין סרטון אמיתי של המוצר", "No real video of the product"), fix: L(lang, "העלי סרטון קצר (9:16) שצילמת — הוא יופיע ברילס", "Upload a short 9:16 video you filmed — it will appear in Reels") });
  return gaps;
}

/** Products whose pages need work, weakest first. */
export function weakProducts(products = [], ctx = {}, lang = "he") {
  const w = { high: 3, medium: 2, low: 1 };
  return (Array.isArray(products) ? products : [])
    .map((p) => ({ product: p, gaps: productGaps(p, ctx, lang) }))
    .filter((x) => x.gaps.some((g) => g.severity !== "low"))
    .sort((a, b) => b.gaps.reduce((s, g) => s + w[g.severity], 0) - a.gaps.reduce((s, g) => s + w[g.severity], 0));
}

/** Google Merchant (free listings) eligibility — the exact gates of the feed. */
export function merchantEligibility(product, marketers = [], baseUrl = DEFAULT_BASE_URL, lang = "he") {
  const checks = [
    { id: "approved", ok: product?.status === "approved", he: "המוצר מאושר לפרסום", en: "Product is approved", fix: L(lang, "המוצר ממתין לאישור", "The product is awaiting approval") },
    { id: "direct", ok: isDirectMerchantProduct(product, baseUrl), he: "נמכר ישירות ב-LikeLink (תשלום באתר)", en: "Sold directly on LikeLink (on-site checkout)", fix: L(lang, "מוצר שותפים נמכר בחנות אחרת. Google מקבל רק מוצרים שהמוכר עצמו מוכר — לכן מוצרי שותפים לא נכנסים לפיד", "Affiliate products are sold by another store. Google accepts only products the merchant itself sells, so affiliate items are excluded") },
    { id: "owner", ok: Boolean(product?.marketerId && (marketers || []).some((m) => m?.id === product.marketerId)), he: "משויך ליוצרת קיימת", en: "Attributed to an existing creator", fix: L(lang, "שייכי את המוצר לסטודיו קיים", "Attribute the product to an existing studio") },
    { id: "title", ok: String(product?.title || "").trim().length > 0, he: "יש כותרת", en: "Has a title", fix: L(lang, "הוסיפי כותרת", "Add a title") },
    { id: "price", ok: Number(product?.price) > 0, he: "יש מחיר גדול מאפס", en: "Price above zero", fix: L(lang, "הזיני מחיר", "Enter a price") },
    { id: "description", ok: String(product?.description || "").trim().length > 0, he: "יש תיאור", en: "Has a description", fix: L(lang, "הוסיפי תיאור", "Add a description") },
    { id: "image", ok: isHttpUrl(product?.image), he: "יש תמונה בכתובת מלאה", en: "Image with an absolute URL", fix: L(lang, "הוסיפי תמונה בכתובת https", "Add an https image") },
  ];
  return { product, eligible: checks.every((c) => c.ok), checks: checks.map((c) => ({ ...c, label: L(lang, c.he, c.en) })) };
}

/** Best publishing hour from REAL click timestamps — or an honest default. */
export function publishingTiming(clicks = [], { minEvents = 20 } = {}, lang = "he") {
  const ts = (Array.isArray(clicks) ? clicks : []).map((c) => Number(c?.ts)).filter((n) => Number.isFinite(n) && n > 0);
  if (ts.length < minEvents) {
    return {
      enoughData: false,
      events: ts.length,
      hour: 20,
      text: L(lang, `יש רק ${ts.length} אירועים מדודים — לא מספיק כדי לקבוע שעה. ברירת מחדל: 20:00–22:00 (שעות ערב מקובלות, לא נתון שלך).`, `Only ${ts.length} measured events — not enough to pick an hour. Default: 20:00–22:00 (common evening hours, not your data).`),
    };
  }
  const hours = new Array(24).fill(0);
  for (const t of ts) hours[new Date(t).getHours()]++;
  const hour = hours.indexOf(Math.max(...hours));
  return {
    enoughData: true,
    events: ts.length,
    hour,
    text: L(lang, `שעת השיא לפי ${ts.length} אירועים אמיתיים: ${String(hour).padStart(2, "0")}:00`, `Peak hour from ${ts.length} real events: ${String(hour).padStart(2, "0")}:00`),
  };
}

/** Content angle suggestions (labelled as suggestions — not measured data). */
export function contentAngles(product, lang = "he") {
  const cat = product?.category || "Other";
  const price = Number(product?.price) || 0;
  const angles = [
    { id: "use", text: L(lang, "איך זה נראה בשימוש אמיתי — 15 שניות, בלי פילטרים", "What it looks like in real use — 15 seconds, no filters") },
    { id: "detail", text: L(lang, "תקריב על הפרטים: חומר, גימור, גודל ביד", "Close-up on details: material, finish, size in hand") },
  ];
  if (price > 0 && price <= 100) angles.push({ id: "value", text: L(lang, `למה זה שווה ${Math.round(price)} ₪ — מה מקבלים בפועל`, `Why it is worth ₪${Math.round(price)} — what you actually get`) });
  if (["Fashion", "Accessories"].includes(cat)) angles.push({ id: "style", text: L(lang, "3 דרכים לשלב את הפריט בלוק יומיומי", "3 ways to style it for every day") });
  if (cat === "Beauty") angles.push({ id: "routine", text: L(lang, "לפני/אחרי בשגרת הבוקר", "Before/after in the morning routine") });
  if (cat === "Home") angles.push({ id: "space", text: L(lang, "הפינה בבית לפני ואחרי", "The corner at home, before and after") });
  if (cat === "Tech") angles.push({ id: "setup", text: L(lang, "הסטאפ שלי — מה המוצר פותר", "My setup — what the product solves") });
  return angles.map((a) => ({ ...a, kind: "suggestion" }));
}

/** Creators worth featuring — by real public product count and real activity. */
export function recommendCreators(marketers = [], products = [], clicks = [], lang = "he") {
  const pub = publicCatalog(products, marketers);
  const act = activityByProduct(clicks);
  return (Array.isArray(marketers) ? marketers : [])
    .map((m) => {
      const own = pub.filter((p) => p.marketerId === m.id);
      const activity = own.reduce((s, p) => s + ((act.get(p.id)?.clicks || 0) + (act.get(p.id)?.views || 0)), 0);
      return { marketer: m, products: own.length, activity };
    })
    .filter((x) => x.products > 0)
    .sort((a, b) => b.activity - a.activity || b.products - a.products)
    .map((x) => ({
      ...x,
      reason: x.activity > 0
        ? L(lang, `${x.products} מוצרים פעילים ו-${x.activity} אירועי פעילות אמיתיים`, `${x.products} live products and ${x.activity} real activity events`)
        : L(lang, `${x.products} מוצרים פעילים — עדיין בלי נתוני פעילות`, `${x.products} live products — no activity data yet`),
    }));
}

export const CAMPAIGN_CHANNEL = Object.freeze({
  AVAILABLE: "available",
  REQUIRES_CONNECTION: "requires_connection",
  NOT_ELIGIBLE: "not_eligible",
});

/**
 * Luna Campaign — free-first distribution plan for a product, collection or
 * creator page. Channel states are real: a public page and share links are
 * available immediately; Google free listings only when eligible; social only
 * when a provider is really connected. Budget is 0 — organic distribution,
 * never paid ads presented as free.
 */
export function buildLunaCampaign({ kind = "product", product = null, collection = null, creator = null, marketers = [], clicks = [], videos = [], connections = [], origin = DEFAULT_BASE_URL } = {}, lang = "he") {
  const base = String(origin || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const target = kind === "product" ? product : kind === "collection" ? collection : creator;
  if (!target) return null;
  const publicPath = kind === "product"
    ? `/p/${encodeURIComponent(product.id)}`
    : kind === "creator"
      ? `/u/${encodeURIComponent(creator.slug || creator.id)}`
      : `/collections/${encodeURIComponent(collection.id)}`;
  const publicUrl = `${base}${publicPath}`;
  const trackedUrl = kind === "product" && isHttpUrl(product?.affiliateUrl) ? `${base}/r?pid=${encodeURIComponent(product.id)}&src=luna_campaign` : "";
  const media = kind === "product" ? productMedia(product, videos) : null;
  const eligibility = kind === "product" ? merchantEligibility(product, marketers, base, lang) : null;
  const connected = (Array.isArray(connections) ? connections : []).filter((c) => c && c.connected && c.provider && c.provider !== "web");

  const channels = [
    { id: "public_page", label: L(lang, "עמוד ציבורי + חיפוש אורגני", "Public page + organic search"), state: CAMPAIGN_CHANNEL.AVAILABLE, reason: L(lang, "העמוד חי ונכלל במפת האתר", "The page is live and in the sitemap") },
    { id: "share", label: L(lang, "שיתוף ישיר (וואטסאפ, טלגרם, אינסטגרם)", "Direct sharing (WhatsApp, Telegram, Instagram)"), state: CAMPAIGN_CHANNEL.AVAILABLE, reason: L(lang, "קישור מוכן לשיתוף ידני — הפרסום נעשה על ידך", "A ready link for manual sharing — you publish it") },
  ];
  if (kind === "product") {
    channels.push(eligibility.eligible
      ? { id: "google_free_listings", label: L(lang, "Google — רישומים חינמיים", "Google free listings"), state: CAMPAIGN_CHANNEL.AVAILABLE, reason: L(lang, "המוצר עומד בכללי הפיד", "The product meets the feed rules") }
      : { id: "google_free_listings", label: L(lang, "Google — רישומים חינמיים", "Google free listings"), state: CAMPAIGN_CHANNEL.NOT_ELIGIBLE, reason: eligibility.checks.find((c) => !c.ok)?.fix || "" });
  }
  channels.push(connected.length
    ? { id: "connected_social", label: L(lang, "ערוצים מחוברים", "Connected channels"), state: CAMPAIGN_CHANNEL.AVAILABLE, reason: connected.map((c) => c.channelLabel || c.provider).join(", ") }
    : { id: "connected_social", label: L(lang, "רשתות חברתיות (פרסום אוטומטי)", "Social networks (automatic posting)"), state: CAMPAIGN_CHANNEL.REQUIRES_CONNECTION, reason: L(lang, "נדרש חיבור לערוץ", "A channel connection is required") });

  const titleOf = kind === "product" ? product.title : kind === "creator" ? creator.name : collection.title;
  const audience = kind === "product"
    ? L(lang, `מתעניינות ב${categoryLabel(product.category, lang)}${Number(product.price) > 0 ? ` בטווח מחיר של כ-${Math.round(product.price)} ₪` : ""}`, `People interested in ${categoryLabel(product.category, lang)}${Number(product.price) > 0 ? ` around ₪${Math.round(product.price)}` : ""}`)
    : kind === "creator"
      ? L(lang, "הקהל הקיים של היוצרת ומי שמחפשים את הקטגוריות שלה", "The creator's audience and people searching her categories")
      : L(lang, "מי שמחפשים את הנושא של האוסף", "People searching the collection's theme");

  return {
    kind,
    title: titleOf,
    objective: L(lang, kind === "product" ? "להביא תנועה לעמוד המוצר ולקנייה" : kind === "creator" ? "להביא עוקבות לחנות של היוצרת" : "להביא תנועה לאוסף", kind === "product" ? "Drive traffic to the product page and purchase" : kind === "creator" ? "Bring followers to the creator storefront" : "Drive traffic to the collection"),
    audience,
    creative: media
      ? { state: media.state, label: media.state === MEDIA_STATE.REAL_VIDEO ? L(lang, "סרטון אמיתי", "Real video") : media.state === MEDIA_STATE.SYNTHETIC_ANIMATION ? L(lang, "אנימציה מתמונת המוצר", "Animation from the product photo") : media.state === MEDIA_STATE.STATIC_IMAGE ? L(lang, "תמונת מוצר", "Product photo") : L(lang, "אין מדיה — מומלץ להוסיף", "No media — add some") }
      : { state: null, label: L(lang, "עמוד עם תמונות המוצרים", "A page with the product photos") },
    cta: L(lang, kind === "product" ? "לצפייה במוצר" : kind === "creator" ? "לחנות של היוצרת" : "לצפייה באוסף", kind === "product" ? "View the product" : kind === "creator" ? "Visit the storefront" : "View the collection"),
    channels,
    budget: { amount: 0, text: L(lang, "₪0 — הפצה אורגנית בלבד. אין כאן מודעות בתשלום.", "₪0 — organic distribution only. No paid ads here.") },
    tracking: trackedUrl
      ? { available: true, text: L(lang, "מעקב קליקים דרך קישור השותפים של LikeLink", "Click tracking through the LikeLink affiliate link"), url: trackedUrl }
      : { available: false, text: L(lang, "מעקב לפי כניסות לעמוד הציבורי", "Tracked through visits to the public page"), url: "" },
    publicUrl,
    timing: publishingTiming(clicks, {}, lang),
    angles: kind === "product" ? contentAngles(product, lang) : [],
  };
}
