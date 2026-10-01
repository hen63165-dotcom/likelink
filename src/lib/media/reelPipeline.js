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
import { classifyMediaRecord, MEDIA_TRUTH } from "../discovery/mediaTruth.js";
import { categoryName, formatPrice, merchantOf } from "../publicDiscovery.js";

export const RENDER_PROVIDER = "likelink_native_render";
export const RENDERER_VERSION = "reel-canvas-v1";
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
});
export const STYLE_ORDER = Object.freeze(["cinematic3d", "ugc_style", "animated_story"]);

/** Burned into every frame and repeated in the metadata. */
export const ON_FRAME_DISCLOSURE = Object.freeze({
  he: "אנימציה ממוחשבת · לא צולם",
  en: "Computer animation · not filmed",
});

const HTTP = /^https?:\/\/\S+$/i;
const text = (v) => (typeof v === "string" ? v : "");
const cleanTitle = (t) => text(t).replace(/\s+[—-]\s*(עד\s*)?₪\s?[\d,.]+\s*$/u, "").trim();

/** The reel concept: everything the renderer draws, derived from real fields only. */
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
  const hooks = {
    cinematic3d: category ? `${category} · בחירה מהקטלוג` : "בחירה מהקטלוג",
    ugc_style: "גילוי של היום 👀",
    animated_story: "לונה מציגה",
  };
  return {
    id: `${product.id}:${style}`,
    productId: product.id,
    style,
    styleLabel: { he: REEL_STYLES[style].he, en: REEL_STYLES[style].en },
    durationMs: REEL_STYLES[style].durationMs,
    fps: REEL_FPS,
    width: REEL_WIDTH,
    height: REEL_HEIGHT,
    image: HTTP.test(text(product.image)) ? product.image : "",
    lines: { hook: hooks[style], title, facts, cta: "לפרטים ולקנייה ב־LikeLink", brand: "LikeLink2" },
    disclosure: ON_FRAME_DISCLOSURE.he,
    accent: /^#[0-9a-f]{6}$/i.test(text(creator?.color)) ? creator.color : "#d22f5d",
  };
}

/** Native reels already registered for each product, by style. */
export function registeredStyles(videos = []) {
  const map = new Map();
  for (const v of Array.isArray(videos) ? videos : []) {
    if (v?.source !== RENDER_PROVIDER || !REEL_STYLES[v.style]) continue;
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
  const eligible = (Array.isArray(products) ? products : [])
    .filter((p) => isPublicCatalogProduct(p, [...creators.values()]) && HTTP.test(text(p.image)))
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
    const concept = buildReelConcept({ product: p, creator: creators.get(p.marketerId), style });
    if (concept?.image) plan.push({ productId: p.id, style, reason: have.size ? "missing_style" : "no_reel_yet", concept });
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
  if (!REEL_STYLES[body.style]) return fail("bad_style");
  if (text(body.renderer) !== RENDERER_VERSION) return fail("unknown_renderer");
  const probe = body.probe || {};
  const duration = Number(probe.durationMs);
  if (!(duration >= 3000 && duration <= 30000)) return fail("bad_duration");
  if (Number(probe.width) !== REEL_WIDTH || Number(probe.height) !== REEL_HEIGHT) return fail("bad_dimensions");
  if (!/^[a-f0-9]{64}$/.test(text(body.sha256))) return fail("bad_sha256");
  if (!text(body.video) || !text(body.poster)) return fail("missing_media");
  return { ok: true };
}

/** The asset record (ugc:assets:<id>) and the public reel record (marketplace:videos). */
export function buildReelRecords({ product, style, videoUrl, posterUrl, bytes, sha256, probe, now = Date.now() }) {
  const id = `reel_${product.id}_${style}_${now}`;
  const styleLabel = { he: REEL_STYLES[style].he, en: REEL_STYLES[style].en };
  const base = {
    source: RENDER_PROVIDER,
    videoProvider: RENDER_PROVIDER,
    renderer: RENDERER_VERSION,
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
