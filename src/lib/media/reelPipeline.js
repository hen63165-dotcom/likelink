// LikeLink native reel pipeline — the pure, isomorphic core.
//
//   product → creative concept → rendered vertical reel → verified asset →
//   registered public reel → internal publication → proof → measurement.
//
// Who does what:
//   • this module        decides WHAT to render (plan), describes it (concept),
//                        validates what comes back (ingest) and builds records.
//   • scripts/media/     renders the concept into a real H.264 MP4 (Chromium
//                        canvas frames → ffmpeg). Runs on the GitHub Actions
//                        runner (.github/workflows/media-render.yml) because a
//                        Vercel function cannot render video.
//   • api/_utils/mediaPipelineHandler.mjs  stores, verifies, registers and
//                        publishes — and records proof only from read-backs.
//
// Truth rules (pinned by tests/reelPipeline.test.mjs):
//   • every render is SYNTHETIC_ANIMATION: synthetic, disclosed, provider
//     "likelink_native_render" — never REAL_VIDEO, never UGC by a person;
//   • "UGC-style" is a presentation style with an on-frame disclosure, not a
//     claim that a human filmed it; "animated story" is an original visual
//     style — no third-party characters, studios or brands are named;
//   • on-screen text comes only from real product fields (title, catalog
//     price, merchant, category, the attributed creator) — no invented
//     discounts, shipping promises, stock or urgency;
//   • a plan never repeats a (product, style) that is already registered.

import { isPublicCatalogProduct } from "../cloud/catalog.js";
import { isPromotable, isRealProductPhoto, sharedAffiliateLinks } from "../discovery/catalogIntegrity.js";
import { videoIntent, videoStoryboard, compileScenes, creativeBrief } from "./videoCapability.js";
import { classifyMediaRecord, MEDIA_TRUTH } from "../discovery/mediaTruth.js";
import { categoryName, formatPrice, merchantOf } from "../publicDiscovery.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import { buildHookSet, buildStoryBeats, CTAS, FORMATS, stableId } from "../growth/likeloop.js";

export const RENDER_PROVIDER = "likelink_native_render";
/** A clip a creator rendered in the Studio (in-browser canvas engine), registered by the server. */
export const STUDIO_PROVIDER = "likelink_studio_render";
export const RENDERER_VERSION = "reel-canvas-v2";
/** v1 = no hook prelude, no audio track; v2 = 1.5 s question hook + AAC track (Instagram requires audio). */
export const ACCEPTED_RENDERERS = Object.freeze(["reel-canvas-v1", "reel-canvas-v2"]);
/** The question-hook prelude every v2 reel opens with (the product is not shown in it). */
export const HOOK_PRELUDE_MS = 1500;
export const REEL_WIDTH = 720;
export const REEL_HEIGHT = 1280;
export const REEL_FPS = 30;
export const MAX_REEL_BYTES = 2_600_000; // video + poster stay under the 4.5 MB function body after base64
export const MAX_POSTER_BYTES = 250_000;

export const REEL_STYLES = Object.freeze({
  cinematic3d: {
    he: "אנימציה תלת־ממדית מסוגננת",
    en: "Stylized 3D-look animation",
    durationMs: 9000,
  },
  ugc_style: {
    he: "בסגנון UGC · ממוחשב, לא צילום של אדם",
    en: "UGC-style · computer-made, not filmed by a person",
    durationMs: 9000,
  },
  animated_story: {
    he: "סיפור מוצר מונפש",
    en: "Animated product story",
    durationMs: 10000,
  },
  likeloop_cinematic: {
    he: "LikeLoop Cinematic · סרט אנימציה קצר, ממוחשב",
    en: "LikeLoop Cinematic · short computer-animated film",
    durationMs: 18500,
  },
  animated_unbox: {
    he: "אנבוקסינג מונפש · אנימציה ממוחשבת",
    en: "Animated unboxing · computer animation",
    durationMs: 9500,
  },
  // Not planned by the runner — the creator renders it in the Studio.
  studio: {
    he: "קליפ מהסטודיו · אנימציה ממוחשבת",
    en: "Studio clip · computer animation",
    durationMs: 0,
  },
});
export const STYLE_ORDER = Object.freeze(["likeloop_cinematic", "ugc_style", "cinematic3d", "animated_story", "animated_unbox"]);

/** Each style opens with a different hook type, so the catalog explores hooks (LikeLoop learns from them). */
export const STYLE_CREATIVE = Object.freeze({
  likeloop_cinematic: { hookType: "before_after", opening: "question_card", format: "cinematic", cta: "details" },
  ugc_style: { hookType: "didnt_know", opening: "close_up", format: "synthetic_ugc", cta: "details" },
  cinematic3d: { hookType: "curiosity", opening: "reveal", format: "cinematic", cta: "see_more" },
  animated_story: { hookType: "question", opening: "question_card", format: "cinematic", cta: "details" },
  animated_unbox: { hookType: "gift", opening: "reveal", format: "cinematic", cta: "see_more" },
});

/** Burned into every frame and repeated in the metadata. */
export const ON_FRAME_DISCLOSURE = Object.freeze({
  he: "אנימציה ממוחשבת · לא צולם",
  en: "Computer animation · not filmed",
});

const HTTP = /^https?:\/\/\S+$/i;
const text = (v) => (typeof v === "string" ? v : "");
const cleanTitle = (t) => text(t).replace(/\s+[—-]\s*(עד\s*)?₪\s?[\d,.]+\s*$/u, "").trim();

/**
 * Question hooks for the first 1.5 s (2026 short-form practice: a specific
 * question, product not revealed yet). Questions only — never a claim about
 * sales, stock, popularity or results we cannot prove.
 */
export const HOOK_QUESTIONS = Object.freeze({
  Beauty: ["עוד מחפשת משהו שבאמת נכנס לשגרה?", "מה חסר לך בשגרת הטיפוח?"],
  Fashion: ["מה לובשים השבוע? 👀", "מחפשת פריט אחד שמשדרג הכל?"],
  Accessories: ["פרט קטן שמשנה את כל הלוק?", "מחפשת מתנה קטנה עם נוכחות?"],
  Home: ["מה הבית שלך צריך עכשיו?", "פינה אחת בבית שמבקשת שדרוג?"],
  Tech: ["מה עוד חסר על השולחן שלך?", "מחפשים גאדג'ט שימושי ליומיום?"],
  Fitness: ["מתחילים להתאמן השבוע?", "מה מחזיק אותך באימון?"],
  Gifts: ["מחפשים מתנה ואין רעיון?", "מתנה שלא תשכב במגירה?"],
  Travel: ["אורזים לטיסה הבאה?", "מה תמיד שוכחים לארוז?"],
  Kids: ["מה הקטנים יאהבו השבוע?", "מחפשים משהו שימושי לילדים?"],
  Pets: ["מה החבר על ארבע צריך?", "מחפשים פינוק לכלב או לחתול?"],
  Other: ["מה שווה לראות היום?", "מחפשים רעיון טוב לקנייה הבאה?"],
});
const seedOf = (s) => [...String(s)].reduce((a, ch) => (a * 31 + ch.codePointAt(0)) >>> 0, 7);

/** Deterministic per product: the same product always opens with the same question. */
export function hookQuestion(product) {
  const bank = HOOK_QUESTIONS[product?.category] || HOOK_QUESTIONS.Other;
  return bank[seedOf(product?.id || "") % bank.length];
}

/** The reel concept: everything the renderer draws, derived from real fields only. */
/** The creative a (product, style) render stands for: hook, opening, format, CTA, stable id. */
export function creativeFor(product, style, { now = Date.now() } = {}) {
  const spec = STYLE_CREATIVE[style];
  if (!spec || !product?.id) return null;
  const hooks = buildHookSet(product, { now });
  const hook = hooks.find((h) => h.type === spec.hookType) || hooks.find((h) => h.type === "question");
  const cta = CTAS.find((c) => c.id === spec.cta) || CTAS[0];
  return {
    creativeId: stableId("cr", [product.id, hook?.type, spec.opening, spec.format, cta.id, style]),
    hookType: hook?.type || "question",
    hook: hook?.text || hookQuestion(product),
    opening: spec.opening,
    format: spec.format,
    mediaType: FORMATS[spec.format].mediaType,
    cta: cta.id,
    ctaText: cta.text,
  };
}

export function buildReelConcept({ product, creator, style }) {
  if (!product?.id || !REEL_STYLES[style]) return null;
  const title = cleanTitle(product.title) || text(product.title);
  const price = formatPrice(product.price, "he");
  const merchant = merchantOf(product);
  const creatorName = text(creator?.name);
  const category = product.category ? categoryName(product.category, "he") : "";
  const facts = [
    price ? `${price} · מחיר קטלוג` : "",
    merchant ? `נמכר ב־${merchant}` : "",
    creatorName ? `נבחר על ידי ${creatorName}` : "",
  ].filter(Boolean);
  const kickers = {
    cinematic3d: category ? `${category} · בחירה מהקטלוג` : "בחירה מהקטלוג",
    ugc_style: "גילוי של היום 👀",
    animated_story: "לונה מציגה",
    animated_unbox: "מה יש בקופסה?",
    likeloop_cinematic: category || "LikeLoop",
  };
  return {
    id: `${product.id}:${style}`,
    productId: product.id,
    style,
    styleLabel: { he: REEL_STYLES[style].he, en: REEL_STYLES[style].en },
    durationMs: REEL_STYLES[style].durationMs + HOOK_PRELUDE_MS,
    fps: REEL_FPS,
    width: REEL_WIDTH,
    height: REEL_HEIGHT,
    image: HTTP.test(text(product.image)) ? product.image : "",
    hookMs: HOOK_PRELUDE_MS,
    creative: creativeFor(product, style),
    story: style === "likeloop_cinematic" ? buildStoryBeats(product) : null,
    lines: { hook: creativeFor(product, style)?.hook || hookQuestion(product), kicker: kickers[style], title, facts, cta: creativeFor(product, style)?.ctaText || "לפרטים ב־LikeLink ←", brand: "LikeLink2" },
    disclosure: ON_FRAME_DISCLOSURE.he,
    accent: /^#[0-9a-f]{6}$/i.test(text(creator?.color)) ? creator.color : "#d22f5d",
  };
}

/** Native reels already registered for each product, by style. */
export function registeredStyles(videos = []) {
  const map = new Map();
  for (const v of Array.isArray(videos) ? videos : []) {
    if (v?.source !== RENDER_PROVIDER || !STYLE_ORDER.includes(v.style)) continue;
    for (const t of Array.isArray(v.productTags) ? v.productTags : []) {
      if (!t?.productId) continue;
      if (!map.has(t.productId)) map.set(t.productId, new Set());
      map.get(t.productId).add(v.style);
    }
  }
  return map;
}

/**
 * Post-publication activity per style: views/clicks recorded on a product
 * AFTER its reel of that style went live. Correlation, labelled as such —
 * it is a selection signal, never shown as a reel's performance.
 */
export function styleLearning({ videos = [], clicks = [] } = {}) {
  const out = Object.fromEntries(STYLE_ORDER.map((s) => [s, { reels: 0, views: 0, clicks: 0 }]));
  for (const v of Array.isArray(videos) ? videos : []) {
    if (v?.source !== RENDER_PROVIDER || !out[v.style]) continue;
    out[v.style].reels += 1;
    const pid = v.productTags?.[0]?.productId;
    const since = Number(v.createdAt) || 0;
    for (const c of Array.isArray(clicks) ? clicks : []) {
      if (c?.productId !== pid || !(Number(c.ts) >= since)) continue;
      if (c.type === "view") out[v.style].views += 1;
      else out[v.style].clicks += 1;
    }
  }
  return out;
}

const MIN_VIEWS_TO_LEARN = 20;

/** Style order for a product: missing styles first; learned order only with enough evidence. */
function styleOrder(learning, rotate = 0) {
  const enough = STYLE_ORDER.every((s) => (learning?.[s]?.views || 0) >= MIN_VIEWS_TO_LEARN);
  if (enough) {
    const rate = (s) => learning[s].clicks / Math.max(1, learning[s].views);
    return [...STYLE_ORDER].sort((a, b) => rate(b) - rate(a));
  }
  const r = ((rotate % STYLE_ORDER.length) + STYLE_ORDER.length) % STYLE_ORDER.length;
  return [...STYLE_ORDER.slice(r), ...STYLE_ORDER.slice(0, r)];
}

/**
 * DISCOVER → SELECT OPPORTUNITY → CREATE CREATIVE.
 * Products with no native reel come first (by recorded attention, then
 * newest); each gets the next style it does not have yet.
 */
export function planRenders({ products = [], marketers = [], videos = [], clicks = [], limit = 3, now = Date.now() } = {}) {
  const creators = new Map((Array.isArray(marketers) ? marketers : []).filter((m) => m?.id).map((m) => [m.id, m]));
  const done = registeredStyles(videos);
  const learning = styleLearning({ videos, clicks });
  const since = now - 14 * 86_400_000;
  const attention = new Map();
  for (const c of Array.isArray(clicks) ? clicks : []) {
    if (c?.productId && Number(c.ts) >= since) attention.set(c.productId, (attention.get(c.productId) || 0) + 1);
  }
  const all = Array.isArray(products) ? products : [];
  const shared = sharedAffiliateLinks(all);
  const eligible = all
    // A reel shows THE product: a real product photo only (never a stock image),
    // and never a product whose affiliate link is shared by other products
    // (it opens the store's home page) — catalogIntegrity.js.
    .filter((p) => isPublicCatalogProduct(p, [...creators.values()]) && HTTP.test(text(p.image)) && isRealProductPhoto(p.image) && isPromotable(p, all, shared))
    .map((p, i) => ({ p, i, have: done.get(p.id) || new Set() }))
    .filter((x) => x.have.size < STYLE_ORDER.length)
    .sort(
      (a, b) =>
        a.have.size - b.have.size ||
        (attention.get(b.p.id) || 0) - (attention.get(a.p.id) || 0) ||
        (Number(b.p.createdAt) || 0) - (Number(a.p.createdAt) || 0)
    );
  const plan = [];
  for (const { p, i, have } of eligible) {
    if (plan.length >= limit) break;
    const style = styleOrder(learning, i).find((s) => !have.has(s));
    // VideoIntent → VideoStoryboard → SceneCompiler (videoCapability.js): the
    // renderer executes the compiled spec; the brief is stored with the asset.
    const creator = creators.get(p.marketerId);
    const concept = buildReelConcept({ product: p, creator, style });
    const storyboard = videoStoryboard(videoIntent({ product: p, creator, style, styleLabel: concept?.styleLabel }), concept);
    const spec = compileScenes(storyboard, concept);
    if (spec?.image) plan.push({ productId: p.id, style, reason: have.size ? "missing_style" : "no_reel_yet", concept: spec, creative: creativeBrief(storyboard) });
  }
  return { plan, learning };
}

/** Magic-byte check: the bytes really are an MP4 / WebM / JPEG. */
export function sniffMedia(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4";
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return "";
}

/** Validate a renderer upload before anything is stored. */
export function validateIngest(body = {}) {
  const fail = (error) => ({ ok: false, error });
  if (!body || typeof body !== "object") return fail("bad_body");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(text(body.productId))) return fail("bad_product_id");
  if (!STYLE_ORDER.includes(body.style)) return fail("bad_style");
  if (!ACCEPTED_RENDERERS.includes(text(body.renderer))) return fail("unknown_renderer");
  if (text(body.renderer) === "reel-canvas-v2" && text(body.probe?.audio) !== "aac") return fail("missing_audio_track");
  const probe = body.probe || {};
  const duration = Number(probe.durationMs);
  if (!(duration >= 3000 && duration <= 30000)) return fail("bad_duration");
  if (Number(probe.width) !== REEL_WIDTH || Number(probe.height) !== REEL_HEIGHT) return fail("bad_dimensions");
  if (!/^[a-f0-9]{64}$/.test(text(body.sha256))) return fail("bad_sha256");
  if (!text(body.video) || !text(body.poster)) return fail("missing_media");
  return { ok: true };
}

/** The asset record (ugc:assets:<id>) and the public reel record (marketplace:videos). */
/**
 * The creative brief a render followed (style, prompt, product reference) —
 * rebuilt from the same real fields the concept used. A Studio clip is the
 * creator's own browser render, so its brief says exactly that.
 */
export function reelCreative({ product, creator = null, style }) {
  if (!product?.id) return null;
  if (style === "studio") {
    return { prompt: "קליפ שהיוצר/ת רינדר/ה בסטודיו (קנבס בדפדפן) מתמונת המוצר", style, productReference: HTTP.test(text(product.image)) ? product.image : "", conceptId: `${product.id}:studio`, goal: "product_discovery" };
  }
  const concept = buildReelConcept({ product, creator, style });
  return creativeBrief(videoStoryboard(videoIntent({ product, creator, style, styleLabel: concept?.styleLabel }), concept));
}

export function buildReelRecords({ product, style, videoUrl, posterUrl, bytes, sha256, probe, now = Date.now(), provider = RENDER_PROVIDER, renderer = RENDERER_VERSION, creative = null }) {
  const id = `reel_${product.id}_${style}_${now}`;
  const styleLabel = { he: REEL_STYLES[style].he, en: REEL_STYLES[style].en };
  // LikeLoop creative (id, hook, CTA) — recomputed here from the product, never taken
  // from the uploader — merged with the creative brief (style, prompt, product reference).
  const loop = STYLE_CREATIVE[style] ? creativeFor(product, style, { now }) : null;
  const merged = creative || loop ? { ...(creative || {}), ...(loop || {}) } : null;
  const base = {
    mediaType: style === "ugc_style" ? "SYNTHETIC_UGC" : "CINEMATIC",
    source: provider,
    videoProvider: provider,
    renderer: text(renderer).slice(0, 40) || RENDERER_VERSION,
    audio: probe?.audio === "aac" ? "aac" : "none",
    synthetic: true,
    disclosed: true,
    disclosure: ON_FRAME_DISCLOSURE,
    style,
    styleLabel,
    videoUrl,
    poster: posterUrl,
    videoStatus: "completed",
    bytes,
    sha256,
    durationMs: Number(probe?.durationMs) || 0,
    width: REEL_WIDTH,
    height: REEL_HEIGHT,
    createdAt: now,
    // Style, prompt, product reference and generation status of this asset.
    ...(merged ? { creative: { ...merged, generationStatus: "GENERATED", provider } } : {}),
  };
  const truth = classifyMediaRecord(base).state;
  return {
    truth,
    asset: { id, productId: product.id, marketerId: product.marketerId, imageUrl: product.image, ...base, truth },
    video: {
      id,
      marketerId: product.marketerId,
      productTags: [{ productId: product.id }],
      title: cleanTitle(product.title) || text(product.title),
      ...base,
      truth,
      views: 0,
      clicks: 0,
    },
  };
}

/** A render is only acceptable as a synthetic animation — anything else is a bug. */
export function assertSyntheticTruth(truth) {
  return truth === MEDIA_TRUTH.SYNTHETIC_ANIMATION;
}

/* ------------------------------------------------------------------ social */

/** Hashtags per category: a few specific tags beat a wall of generic ones (Instagram caps at 5 in 2026). */
const CATEGORY_TAGS = Object.freeze({
  Beauty: ["טיפוח", "ביוטי", "המלצות_טיפוח"],
  Fashion: ["אופנה", "סטייל", "לוק_יומי"],
  Accessories: ["אקססוריז", "תכשיטים", "סטייל"],
  Home: ["עיצוב_הבית", "בית", "מציאות_לבית"],
  Tech: ["גאדג'טים", "טכנולוגיה", "המלצות_טק"],
  Fitness: ["כושר", "אימון", "ספורט"],
  Gifts: ["רעיון_למתנה", "מתנות", "מתנה"],
  Travel: ["טיולים", "ציוד_לטיסה", "נסיעות"],
  Kids: ["ילדים", "הורות", "לקטנים"],
  Pets: ["חיות_מחמד", "כלבים", "חתולים"],
  Other: ["מציאות", "המלצות", "קניות_אונליין"],
});
export const SOCIAL_NETWORKS = Object.freeze(["instagram", "tiktok", "youtube", "facebook", "telegram", "whatsapp", "x", "pinterest"]);
/** Paid-partnership disclosure (Israeli consumer-protection / platform rules) + the animation disclosure. */
export const SOCIAL_DISCLOSURE_HE = "#פרסומת · קישור שותפים";
export const SOCIAL_ANIMATION_NOTE_HE = "🎬 הסרטון: אנימציה ממוחשבת, לא צולם";

/** A network-tagged product link (UTM), on the canonical public origin only. */
export function socialLink(productId, network, style = "", origin = PRODUCTION_ORIGIN) {
  const q = new URLSearchParams({ utm_source: network, utm_medium: "social", utm_campaign: "luna_reel" });
  if (style) q.set("utm_content", style);
  return `${origin}/p/${encodeURIComponent(productId)}?${q}`;
}

/**
 * Ready-to-post Hebrew copy for every network, from real product fields only.
 * Structure follows current short-form practice: question hook first line,
 * one concrete line about the product, the real catalog price, a single CTA,
 * a few specific hashtags, and both disclosures. No invented claims.
 */
export function buildSocialPack({ product, creator, style = "", origin = PRODUCTION_ORIGIN, hook: hookOverride = "" } = {}) {
  if (!product?.id) return null;
  const title = cleanTitle(product.title) || text(product.title);
  const hook = text(hookOverride) || hookQuestion(product);
  const price = formatPrice(product.price, "he");
  const merchant = merchantOf(product);
  const by = text(creator?.name);
  const tags = [...(CATEGORY_TAGS[product.category] || CATEGORY_TAGS.Other), "לייקלינק"].slice(0, 4).map((t) => `#${t}`);
  const facts = [price ? `💸 ${price} (מחיר קטלוג${merchant ? ` ב־${merchant}` : ""})` : merchant ? `🛍️ נמכר ב־${merchant}` : "", by ? `✨ נבחר על ידי ${by}` : ""].filter(Boolean);
  const link = (n) => socialLink(product.id, n, style, origin);
  const body = [hook, "", `👈 ${title}`, ...facts].join("\n");
  const out = {
    instagram: { caption: [body, "", "🔗 הקישור בביו · או חפשו ב־LikeLink2", "", SOCIAL_ANIMATION_NOTE_HE, SOCIAL_DISCLOSURE_HE, "", tags.join(" ")].join("\n"), link: link("instagram"), hashtags: tags },
    tiktok: { caption: [hook, `👈 ${title}`, price ? `💸 ${price}` : "", "🔗 קישור בביו", SOCIAL_DISCLOSURE_HE, tags.slice(0, 4).join(" ")].filter(Boolean).join("\n"), link: link("tiktok"), hashtags: tags },
    youtube: { title: `${hook} ${title}`.slice(0, 95) + " #Shorts", description: [body, "", `לפרטים: ${link("youtube")}`, "", SOCIAL_ANIMATION_NOTE_HE, SOCIAL_DISCLOSURE_HE].join("\n"), link: link("youtube") },
    facebook: { caption: [body, "", `לפרטים ולקנייה: ${link("facebook")}`, "", SOCIAL_ANIMATION_NOTE_HE, SOCIAL_DISCLOSURE_HE].join("\n"), link: link("facebook") },
    telegram: { caption: [`<b>${hook}</b>`, `${title}`, ...facts, "", link("telegram"), "", SOCIAL_DISCLOSURE_HE].join("\n"), link: link("telegram") },
    whatsapp: { caption: [`*${hook}*`, title, ...facts, "", link("whatsapp"), SOCIAL_DISCLOSURE_HE].join("\n"), link: link("whatsapp") },
    x: { caption: `${hook} ${title}${price ? ` · ${price}` : ""}\n${link("x")}\n${SOCIAL_DISCLOSURE_HE}`, link: link("x") },
    pinterest: { title: title.slice(0, 100), description: [hook, ...facts, SOCIAL_DISCLOSURE_HE].join(" · ").slice(0, 500), link: link("pinterest") },
  };
  out.instagram.caption = out.instagram.caption.slice(0, 2200);
  return { productId: product.id, style, hook, networks: out };
}
