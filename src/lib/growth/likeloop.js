// LikeLoop — LikeLink's commerce growth loop (pure core, isomorphic, no I/O).
//
//   DISCOVER → SELECT → CREATE → PUBLISH → MEASURE → LEARN → IMPROVE → CREATE AGAIN
//
// Everything here is derived from REAL records only:
//   • product truth  — what may be promoted, and the exact data a product lacks
//   • hook engine    — 8 typed Hebrew hooks per product, from its own fields,
//                      questions/scenes only, never a claim we cannot prove
//   • creative matrix — hooks × openings × formats × CTAs, each with a stable
//                      creativeId and its own tracked URL
//   • selection      — explore untried creatives first; exploit only with
//                      evidence (Beta posterior on recorded landings → clicks)
//   • learning       — per creative / hook type from recorded events; below
//                      the evidence threshold the answer is INSUFFICIENT_EVIDENCE
//   • channels       — CONNECTED only with a provider-confirmed post id
//   • calendar       — frequency caps per channel (Instagram ≤ 3/day)
//   • failures       — classified, retried with backoff, dead-lettered
// Nothing here says "viral", "best seller", "everyone", stock or results.
import { isPublicCatalogProduct } from "../cloud/catalog.js";
import { IMAGE_PROVENANCE, imageProvenance, sharedAffiliateLinks } from "../discovery/catalogIntegrity.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === "string" ? v : "");
const cleanTitle = (t) => text(t).replace(/\s+[—-]\s*(עד\s*)?₪\s?[\d,.]+\s*$/u, "").trim();

export function stableId(prefix, parts) {
  let h = 2166136261;
  for (const ch of JSON.stringify(parts)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `${prefix}_${h.toString(36)}`;
}

/* ─────────────────────────────────────────────────────────── product truth */

export const TRUTH = Object.freeze({
  PROMOTABLE: "PROMOTABLE",
  REQUIRES_PRODUCT_DATA: "REQUIRES_PRODUCT_DATA",
  NOT_PUBLIC: "NOT_PUBLIC",
});

export const LIFECYCLE = Object.freeze(["DISCOVERED", "VALIDATED", "CREATIVE_READY", "PUBLISHED", "MEASURED", "LEARNING", "OPTIMIZED", "PAUSED"]);

const MERCHANT_HOSTS = [[/aliexpress|s\.click\.aliexpress/i, "AliExpress"], [/amazon\.|amzn\./i, "Amazon"], [/temu\./i, "Temu"], [/shein\./i, "SHEIN"], [/etsy\./i, "Etsy"], [/ebay\./i, "eBay"]];
function merchantOfUrl(url) {
  for (const [re, name] of MERCHANT_HOSTS) if (re.test(String(url || ""))) return name;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** The repair a missing datum needs, in one Hebrew sentence (shown to the owner). */
const REPAIR_HE = {
  no_affiliate_url: "חסר קישור שותפים לדף המוצר.",
  shared_affiliate_link: "הקישור משותף לכמה מוצרים ומוביל לדף הבית של החנות — צריך קישור שותפים לדף המוצר עצמו.",
  stock_image: "התמונה היא תמונת מאגר — צריך את תמונת המוצר מדף המוצר בחנות.",
  no_image: "אין תמונת מוצר.",
  source_blocked: "החנות חסמה בדיקה אוטומטית (CAPTCHA) — התמונה האמיתית תיבדק שוב בהמשך, או שאפשר להדביק את כתובת התמונה ידנית.",
  not_public: "המוצר לא מאושר/משויך ליוצרת — לא מוצג ולא מקודם.",
};

/**
 * Product truth for one product, given the catalog and the recorded state.
 * `promotable` = may get reels, posts and external distribution.
 */
export function productTruth(p, { products = [], marketers = [], videos = [], clicks = [], resolveState = {}, published = [], origin = PRODUCTION_ORIGIN, shared = sharedAffiliateLinks(products) } = {}) {
  const issues = [];
  if (!isPublicCatalogProduct(p, marketers)) issues.push("not_public");
  const aff = text(p?.affiliateUrl).trim();
  if (!/^https:\/\//i.test(aff)) issues.push("no_affiliate_url");
  else if (shared.has(aff)) issues.push("shared_affiliate_link");
  const prov = imageProvenance(p?.image);
  if (prov === IMAGE_PROVENANCE.STOCK) issues.push(resolveState[p?.id]?.status === "SOURCE_BLOCKED" ? "source_blocked" : "stock_image");
  if (prov === IMAGE_PROVENANCE.NONE) issues.push("no_image");
  const promotable = issues.length === 0;
  const own = arr(videos).filter((v) => /^likelink_/.test(text(v?.source)) && v.productTags?.[0]?.productId === p?.id && v.public !== false);
  const ev = arr(clicks).filter((c) => c?.productId === p?.id);
  const pubs = arr(published).filter((x) => x?.productId === p?.id && x.providerPostId);
  const lifecycle = !promotable ? "DISCOVERED"
    : !own.length ? "VALIDATED"
    : !pubs.length ? "CREATIVE_READY"
    : ev.length === 0 ? "PUBLISHED"
    : ev.length < MIN_EVIDENCE ? "MEASURED"
    : "LEARNING";
  return {
    productId: p?.id,
    title: cleanTitle(p?.title) || text(p?.title),
    productUrl: p?.imageSource?.itemUrl || null, // the store's product page, only when resolved from it
    affiliateUrl: aff || null,
    merchant: merchantOfUrl(aff) || null,
    image: p?.image || null,
    imageSource: prov,
    price: Number(p?.price) > 0 ? { value: Number(p.price), currency: p.currency || "ILS", label: "catalog_price_unverified" } : null,
    availability: "UNVERIFIED",
    disclosure: "#פרסומת · קישור שותפים",
    mediaStatus: own.length ? "SYNTHETIC_ANIMATION" : promotable ? "MISSING_MEDIA" : "BLOCKED",
    reels: own.length,
    publicationStatus: pubs.length ? "PUBLISHED" : promotable && own.length ? "READY_FOR_EXTERNAL_PUBLICATION" : "NOT_READY",
    trackingUrl: promotable ? `${origin}/p/${encodeURIComponent(p.id)}` : null,
    truthStatus: issues.includes("not_public") ? TRUTH.NOT_PUBLIC : promotable ? TRUTH.PROMOTABLE : TRUTH.REQUIRES_PRODUCT_DATA,
    issues,
    repair: issues.map((i) => REPAIR_HE[i]).filter(Boolean),
    lifecycle,
    events: { views: ev.filter((c) => c.type === "view").length, clicks: ev.filter((c) => c.type !== "view").length },
  };
}

export function catalogTruth(ctx = {}) {
  const products = arr(ctx.products);
  const shared = sharedAffiliateLinks(products);
  const rows = products.map((p) => productTruth(p, { ...ctx, products, shared }));
  return {
    rows,
    counts: {
      total: rows.length,
      promotable: rows.filter((r) => r.truthStatus === TRUTH.PROMOTABLE).length,
      requiresData: rows.filter((r) => r.truthStatus === TRUTH.REQUIRES_PRODUCT_DATA).length,
      notPublic: rows.filter((r) => r.truthStatus === TRUTH.NOT_PUBLIC).length,
    },
    repairQueue: rows.filter((r) => r.truthStatus === TRUTH.REQUIRES_PRODUCT_DATA).map((r) => ({ productId: r.productId, title: r.title, issues: r.issues, repair: r.repair })),
  };
}

/* ──────────────────────────────────────────────────────────── hook engine */

export const HOOK_TYPES = Object.freeze(["problem", "curiosity", "before_after", "question", "didnt_know", "gift", "trend", "story"]);

/** Category nouns and the everyday moment each category lives in (scene words, not claims). */
const CATEGORY_WORLD = {
  Accessories: { noun: "תכשיט", moment: "רגע לפני שיוצאים", missing: "הלוק מוכן, אבל משהו חסר", fixed: "פרט אחד, והלוק סגור", gift: "מתנה קטנה שעונדים כל יום" }, // not "on the hand": accessories include earrings and necklaces
  Fashion: { noun: "פריט", moment: "מול הארון בבוקר", missing: "שוב אין מה ללבוש", fixed: "פריט אחד שמסדר את הלוק", gift: "מתנה שלובשים" },
  Beauty: { noun: "מוצר טיפוח", moment: "בשגרת הבוקר", missing: "השגרה עמוסה מדי", fixed: "צעד אחד פשוט יותר", gift: "פינוק קטן למישהי אהובה" },
  Home: { noun: "פריט לבית", moment: "בערב בבית", missing: "הפינה הזאת מבקשת שינוי", fixed: "שינוי קטן בפינה", gift: "מתנה לבית חדש" },
  Tech: { noun: "גאדג'ט", moment: "על השולחן ביום עבודה", missing: "הכבלים והבלגן על השולחן", fixed: "שולחן מסודר יותר", gift: "מתנה לחובבי גאדג'טים" },
  Fitness: { noun: "ציוד אימון", moment: "לפני האימון", missing: "קשה להתחיל להתאמן", fixed: "ציוד אחד שמוכן לאימון", gift: "מתנה למי שמתאמן" },
  Gifts: { noun: "מתנה", moment: "יום לפני האירוע", missing: "אין רעיון למתנה", fixed: "מתנה שמגיעה עם רעיון", gift: "מתנה מוכנה" },
  Travel: { noun: "ציוד לטיסה", moment: "לילה לפני הטיסה", missing: "המזוודה לא נסגרת", fixed: "אריזה מסודרת יותר", gift: "מתנה למי שטס" },
  Kids: { noun: "פריט לילדים", moment: "בבוקר עמוס עם הילדים", missing: "הבוקר יוצא משליטה", fixed: "משהו אחד שמקל על הבוקר", gift: "מתנה לקטנים" },
  Pets: { noun: "פריט לחיית המחמד", moment: "בטיול של הערב", missing: "החבר על ארבע משתעמם", fixed: "משהו חדש לחבר על ארבע", gift: "פינוק לחיית המחמד" },
  Other: { noun: "מוצר", moment: "ביום רגיל", missing: "משהו קטן חסר", fixed: "פתרון קטן ליום רגיל", gift: "רעיון למתנה" },
};
export const worldOf = (category) => CATEGORY_WORLD[category] || CATEGORY_WORLD.Other;

/** Claims the hook engine may never produce (no proof exists for any of them). */
export const HOOK_FORBIDDEN = /(כולם|כולן|ויראלי|נגמר|אחרונ|במלאי|הכי נמכר|רב[ -]?מכר|מובטח|מבצע|רק היום|לקוחות|ביקורות|כוכבים|מיליון|ניסיתי|קניתי|אצלי בבית|הזמנתי)/;

const HE_MONTH_SEASON = ["חורף", "חורף", "אביב", "אביב", "אביב", "קיץ", "קיץ", "קיץ", "סתיו", "סתיו", "סתיו", "חורף"];

/**
 * 8 typed Hebrew hooks from the product's own fields. The trend hook uses a
 * radar trend only when one really matched this product (with its source);
 * otherwise it is a season line (a fact: the current month), labelled so.
 */
export function buildHookSet(p, { now = Date.now(), trend = null } = {}) {
  const w = worldOf(p?.category);
  const title = cleanTitle(p?.title) || text(p?.title);
  const price = Number(p?.price) > 0 ? `₪${Number.isInteger(Number(p.price)) ? Number(p.price) : Number(p.price).toFixed(2)}` : "";
  const season = HE_MONTH_SEASON[new Date(now).getUTCMonth()];
  const hooks = [
    { type: "problem", text: `${w.missing}?` },
    { type: "curiosity", text: price ? `מה מקבלים ב־${price}? תראו עד הסוף` : `מה יש בקופסה הזאת? תראו עד הסוף` },
    { type: "before_after", text: `${w.moment}: לפני ואחרי ${w.noun} אחד` },
    { type: "question", text: `מחפשת ${w.noun} שמתאים ליומיום?` },
    { type: "didnt_know", text: `לא ידעתי שאני צריכה ${w.noun} כזה` },
    { type: "gift", text: `${w.gift}?` },
    trend
      ? { type: "trend", text: `מדברים על ${trend.term} — ומה איתך?`, source: trend.source, observedAt: trend.observedAt }
      : { type: "trend", text: `${w.noun} ל${season} הזה`, source: "calendar_season" },
    { type: "story", text: `${w.missing}. ואז זה.` },
  ];
  return hooks.map((h) => ({ ...h, id: stableId("hk", [p?.id, h.type, h.text]), safe: !HOOK_FORBIDDEN.test(h.text) })).filter((h) => h.safe && h.text.length <= 70);
}

/** The LikeLoop Cinematic story (20 s, 6 beats) for a product — scene text only. */
export function buildStoryBeats(p) {
  const w = worldOf(p?.category);
  const title = cleanTitle(p?.title) || text(p?.title);
  return [
    { from: 0, to: 2, beat: "hook", line: null },
    { from: 2, to: 5, beat: "world", line: w.moment },
    { from: 5, to: 9, beat: "tension", line: `${w.missing}…` },
    { from: 9, to: 13, beat: "change", line: w.fixed },
    { from: 13, to: 16, beat: "hero", line: title },
    { from: 16, to: 20, beat: "cta", line: "לפרטים ב־LikeLink ←" },
  ];
}

/* ──────────────────────────────────────────────────────── creative matrix */

export const OPENINGS = Object.freeze(["question_card", "close_up", "reveal"]);
export const FORMATS = Object.freeze({
  synthetic_ugc: { styles: ["ugc_style", "ai_ugc"], mediaType: "SYNTHETIC_UGC" },
  cinematic: { styles: ["ai_story", "text_hook", "street_story", "likeloop_cinematic", "cinematic3d", "animated_story", "animated_unbox"], mediaType: "CINEMATIC" },
});
export const CTAS = Object.freeze([
  { id: "details", text: "לפרטים ב־LikeLink ←" },
  { id: "see_more", text: "כל הפרטים בקישור ←" },
]);

/** The style a media record stands for → its creative media type (never REAL_UGC for a render). */
export function mediaTypeOf(video) {
  if (!video) return "PRODUCT_ONLY";
  if (!/^likelink_/.test(text(video.source))) return video.licensed || video.uploadedBy ? "REAL_UGC" : "PRODUCT_ONLY";
  return video.style === "ugc_style" ? "SYNTHETIC_UGC" : "CINEMATIC";
}

/** 3 hooks × 3 openings × 2 formats × 2 CTAs = 36 creative specs per product. */
export function buildCreativeMatrix(p, { hooks = buildHookSet(p), pick = ["question", "problem", "story"] } = {}) {
  const chosen = pick.map((t) => hooks.find((h) => h.type === t)).filter(Boolean).slice(0, 3);
  const out = [];
  for (const hook of chosen) for (const opening of OPENINGS) for (const format of Object.keys(FORMATS)) for (const cta of CTAS) {
    out.push({ creativeId: stableId("cr", [p.id, hook.type, opening, format, cta.id]), productId: p.id, hookType: hook.type, hook: hook.text, opening, format, mediaType: FORMATS[format].mediaType, cta: cta.id, ctaText: cta.text });
  }
  return out;
}

/** The tracked URL of one creative on one channel (landing → product page). */
export function creativeUrl(c, channel, origin = PRODUCTION_ORIGIN) {
  const q = new URLSearchParams({ utm_source: channel, utm_medium: channel === "instagram" ? "reel" : "social", utm_campaign: "likeloop", utm_content: c.hookType, cid: c.creativeId });
  return `${origin}/p/${encodeURIComponent(c.productId)}?${q}`;
}

/* ───────────────────────────────────────────────── measurement + learning */

export const MIN_EVIDENCE = 30; // landings before any creative is called better than another

/** Recorded events → per creative and per hook type. Only events that carry a cid count. */
export function learn(events = [], creatives = []) {
  const byCid = new Map(arr(creatives).map((c) => [c.creativeId, c]));
  const stat = () => ({ landings: 0, outbound: 0 });
  const per = {}, hooks = {};
  for (const e of arr(events)) {
    const cid = text(e?.cid);
    if (!cid) continue;
    const c = byCid.get(cid);
    const s = (per[cid] ||= stat());
    const h = c ? (hooks[c.hookType] ||= stat()) : null;
    if (e.type === "view") { s.landings += 1; if (h) h.landings += 1; }
    else { s.outbound += 1; if (h) h.outbound += 1; }
  }
  const rate = (s) => (s.landings >= MIN_EVIDENCE ? s.outbound / s.landings : null);
  const total = Object.values(per).reduce((n, s) => n + s.landings, 0);
  return {
    status: total >= MIN_EVIDENCE ? "LEARNING" : "INSUFFICIENT_EVIDENCE",
    signals: Object.values(per).reduce((n, s) => n + s.landings + s.outbound, 0),
    creatives: Object.fromEntries(Object.entries(per).map(([k, s]) => [k, { ...s, clickRate: rate(s) }])),
    hookTypes: Object.fromEntries(Object.entries(hooks).map(([k, s]) => [k, { ...s, clickRate: rate(s) }])),
    note: "landings = product-page views that arrived with a creative id; outbound = clicks to the store from them. No conversion data is available — none is reported.",
  };
}

/** Deterministic pseudo-random in [0,1) from a seed (so a plan is reproducible). */
function rnd(seed) { let x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }

/**
 * Pick the next creatives to make/publish. Untried creatives first (exploration,
 * spread across hook types); with evidence, a Thompson-style draw on
 * Beta(1 + outbound, 1 + landings − outbound) per creative (exploitation).
 */
export function selectCreatives(matrix = [], learning = { creatives: {} }, { limit = 2, done = new Set(), seed = 1 } = {}) {
  const pool = arr(matrix).filter((c) => !done.has(c.creativeId));
  const tried = pool.filter((c) => learning.creatives?.[c.creativeId]?.landings >= MIN_EVIDENCE);
  const untried = pool.filter((c) => !tried.includes(c));
  const pick = [];
  const seenHooks = new Set();
  for (const c of untried) { if (pick.length >= limit) break; if (!seenHooks.has(c.hookType)) { pick.push({ ...c, reason: "explore" }); seenHooks.add(c.hookType); } }
  if (pick.length < limit && tried.length) {
    const scored = tried.map((c, i) => {
      const s = learning.creatives[c.creativeId];
      const a = 1 + s.outbound, b = 1 + Math.max(0, s.landings - s.outbound);
      return { c, score: (a / (a + b)) + (rnd(seed + i) - 0.5) / Math.sqrt(a + b) };
    }).sort((x, y) => y.score - x.score);
    for (const { c } of scored) { if (pick.length >= limit) break; pick.push({ ...c, reason: "exploit" }); }
  }
  for (const c of untried) { if (pick.length >= limit) break; if (!pick.includes(c)) pick.push({ ...c, reason: "explore" }); }
  return pick.slice(0, limit);
}

/* ─────────────────────────────────────────────── channels + calendar + repair */

/** Channel adapters: CONNECTED only with a provider-confirmed post on record. Env is read as booleans. */
export const CHANNEL_ADAPTERS = Object.freeze([
  { id: "instagram", env: ["IG_USER_ID", "IG_ACCESS_TOKEN"], publisher: "graph_api_reels", dailyCap: 3 },
  { id: "facebook", env: ["FB_PAGE_ID", "FB_PAGE_TOKEN"], publisher: null, dailyCap: 2 },
  { id: "tiktok", env: ["TIKTOK_ACCESS_TOKEN"], publisher: null, dailyCap: 2 },
  { id: "pinterest", env: ["PINTEREST_ACCESS_TOKEN", "PINTEREST_BOARD_ID"], publisher: null, dailyCap: 5 },
  { id: "youtube", env: ["YOUTUBE_REFRESH_TOKEN"], publisher: null, dailyCap: 1 },
  { id: "telegram", env: ["BRAND_TELEGRAM_BOT", "BRAND_TELEGRAM_CHAT"], publisher: "bot_api", dailyCap: 5 },
  { id: "webhook", env: ["BRAND_WEBHOOK_URL"], publisher: "webhook", dailyCap: 10 },
]);

export function channelStates(env = {}, publishLog = []) {
  return CHANNEL_ADAPTERS.map((a) => {
    const configured = a.env.every((k) => Boolean(env[k]));
    const proven = arr(publishLog).some((x) => x?.channel === a.id && x.externalId && /PUBLISHED/.test(text(x.status)));
    const state = configured && a.publisher && proven ? "CONNECTED" : configured && a.publisher ? "CONFIGURED" : configured ? "CONFIGURED_NO_PUBLISHER" : "REQUIRES_CONNECTION";
    return { channel: a.id, state, implemented: Boolean(a.publisher), dailyCap: a.dailyCap, missingEnv: configured ? [] : a.env.filter((k) => !env[k]) };
  });
}

/** Israel-time posting slots (UTC hours) — general defaults until the account's own data exists. */
const SLOTS_UTC = [9, 16, 18]; // 12:00, 19:00, 21:00 Israel (UTC+3 in October)

/**
 * The content calendar: next slots per channel, respecting the daily cap and a
 * minimum spacing, for creatives that are ready. Status READY_FOR_EXTERNAL_PUBLICATION
 * until a provider confirms; nothing here publishes.
 */
export function planCalendar({ ready = [], channels = [], queue = [], now = Date.now(), days = 2 } = {}) {
  const out = [];
  const queued = new Set(arr(queue).map((q) => `${q.channel}:${q.creativeId}`));
  for (const ch of channels) {
    const capPerDay = CHANNEL_ADAPTERS.find((a) => a.id === ch.channel)?.dailyCap || 1;
    let i = 0;
    for (let d = 0; d < days; d++) {
      const day = new Date(now + d * 86_400_000);
      for (const h of SLOTS_UTC.slice(0, capPerDay)) {
        const at = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, 0);
        if (at < now) continue;
        while (i < ready.length && queued.has(`${ch.channel}:${ready[i].creativeId}`)) i++;
        const c = ready[i++];
        if (!c) break;
        out.push({ queueId: stableId("q", [ch.channel, c.creativeId]), channel: ch.channel, creativeId: c.creativeId, productId: c.productId, videoId: c.videoId || null, slotAt: new Date(at).toISOString(), status: ch.state === "CONNECTED" || ch.state === "CONFIGURED" ? "SCHEDULED" : "READY_FOR_EXTERNAL_PUBLICATION", blocker: ch.state === "REQUIRES_CONNECTION" ? `missing:${ch.missingEnv.join("+")}` : ch.implemented ? null : "publisher_not_implemented", attempts: 0 });
      }
    }
  }
  return out;
}

export const FAILURE = Object.freeze(["DATA", "AUTH", "PROVIDER", "MEDIA", "RATE_LIMIT", "SECURITY", "CONFIG", "CODE"]);

/** Classify an error code/message into a failure class + whether a retry is safe. */
export function classifyFailure(error) {
  const e = String(error?.message || error || "").toLowerCase();
  const c = /429|rate|too many|quota|daily_cap/.test(e) ? "RATE_LIMIT"
    : /401|403|token|oauth|permission|unauthori|auth/.test(e) ? "AUTH"
    : /captcha|blocked|source_blocked/.test(e) ? "PROVIDER"
    : /missing|not_configured|requires_connection|misconfigured|env/.test(e) ? "CONFIG"
    : /video|media|mp4|image|readback|sha256|probe/.test(e) ? "MEDIA"
    : /origin_not_allowed|signature|forbidden_claim|security/.test(e) ? "SECURITY"
    : /product|shared|stock|not_public|data|kv_read/.test(e) ? "DATA"
    : /5\d\d|timeout|network|fetch failed|provider|graph/.test(e) ? "PROVIDER"
    : "CODE";
  const retry = ["RATE_LIMIT", "PROVIDER", "MEDIA"].includes(c);
  return { class: c, retry };
}

/** Exponential backoff (minutes) and dead-letter after `max` attempts. */
export function nextAttempt(attempts, now = Date.now(), { baseMin = 30, max = 5 } = {}) {
  if (attempts >= max) return { deadLetter: true, at: null };
  return { deadLetter: false, at: now + baseMin * 60_000 * 2 ** Math.max(0, attempts - 1) };
}

/* ───────────────────────────────────────────────────────────── trend radar */

/**
 * Match real, sourced trend terms to products by shared words (title/tags/
 * category noun). No match → no trend angle. Confidence = share of the term's
 * words found in the product.
 */
export function matchTrends(trends = [], products = []) {
  const words = (s) => text(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  return arr(trends).map((t) => {
    const tw = words(t.term);
    const matches = arr(products).map((p) => {
      const pw = new Set([...words(p.title), ...arr(p.tags).flatMap(words), ...words(worldOf(p.category).noun)]);
      // Hebrew inflects (עגילים / עגילי): a shared 4-letter stem counts as the same word.
      const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));
      const hit = tw.filter((w) => [...pw].some((x) => same(w, x))).length;
      return { productId: p.id, confidence: tw.length ? hit / tw.length : 0 };
    }).filter((m) => m.confidence >= 0.5);
    return { ...t, relevance: matches.length ? "MATCHED" : "NO_PRODUCT_MATCH", products: matches.map((m) => m.productId), confidence: matches.length ? Math.max(...matches.map((m) => m.confidence)) : 0, creativeAngles: matches.length ? [`trend hook: "מדברים על ${t.term}"`] : [] };
  });
}

/** Parse a Google Trends daily RSS (public feed) into sourced trend records. */
export function parseTrendsRss(xml = "", { source = "google_trends_rss_IL", observedAt = new Date().toISOString() } = {}) {
  const items = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return items.map((it) => {
    const term = (/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(it)?.[1] || "").trim();
    const traffic = (/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/.exec(it)?.[1] || "").trim();
    return term ? { term: term.slice(0, 80), traffic: traffic || null, source, observedAt } : null;
  }).filter(Boolean).slice(0, 30);
}

/* ─────────────────────────────────────────────────────────── profile setup */

/** What the Instagram profile needs so "link in bio" leads to the site. Unverifiable items say so. */
export function profileChecklist({ creator, igConnected = false, bioWebsite = null, origin = PRODUCTION_ORIGIN } = {}) {
  const page = creator?.slug ? `${origin}/u/${encodeURIComponent(creator.slug)}` : null;
  const bioLink = page ? `${page}?utm_source=instagram&utm_medium=bio&utm_campaign=likeloop` : null;
  const bioOk = bioWebsite ? String(bioWebsite).startsWith(origin) : null;
  const items = [
    { id: "creator_page", status: page ? "PASS" : "FAIL", value: page },
    { id: "tracking_link", status: bioLink ? "PASS" : "FAIL", value: bioLink },
    { id: "instagram_connection", status: igConnected ? "PASS" : "REQUIRES_CONNECTION" },
    { id: "bio_website", status: bioOk === null ? "UNVERIFIED" : bioOk ? "PASS" : "FAIL", value: bioWebsite, note: "ה-API של אינסטגרם לא מאפשר לערוך ביו — רק לקרוא אותו עם טוקן." },
  ];
  const oneAction = bioOk === true ? null : bioLink ? `באינסטגרם: עריכת פרופיל ← קישורים ← הוסיפי את ${bioLink}` : null;
  return { items, oneAction };
}
