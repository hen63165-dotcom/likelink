// LikeLink native video capability — the typed chain behind every reel:
//
//   VideoIntent → VideoStoryboard → SceneCompiler → ProviderAdapter
//     → VideoAsset → VideoProof → VideoPublication
//
// The renderer itself is LikeLink's own (Chromium canvas + ffmpeg on the
// GitHub runner, or the Studio's in-browser canvas). No AI vendor is in the
// core: an external video provider can only be added as an adapter through
// registerVideoProvider, which refuses one without credentials and a
// verification method. Everything a render produces is a SYNTHETIC_ANIMATION
// (mediaTruth.js) — never real footage, never human UGC.
//
// Pure and isomorphic. It does not import the pipeline (reelPipeline.js
// imports it), so there is no module cycle.
import { classifyMediaRecord, MEDIA_TRUTH } from "../discovery/mediaTruth.js";

const text = (v) => (typeof v === "string" ? v.trim() : "");
const HTTP = /^https?:\/\//i;

/* ------------------------------------------------------------ providers */

/** Video providers that exist today. Status is reported, never assumed. */
const PROVIDERS = new Map([
  ["likelink_native_render", {
    id: "likelink_native_render",
    kind: "native",
    he: "רינדור LikeLink (קנבס + ffmpeg)",
    executor: ".github/workflows/media-render.yml → scripts/media/render-reels.mjs",
    ingest: "POST /api/store?mode=media-pipeline&op=ingest (AUTOPILOT_SECRET)",
    output: "MP4 H.264 720×1280",
    truth: MEDIA_TRUTH.SYNTHETIC_ANIMATION,
    requiredCredentials: ["AUTOPILOT_SECRET (GitHub Actions secret + Vercel env)"],
    verification: "anon read-back of the stored file (206) + registration read-back",
  }],
  ["likelink_studio_render", {
    id: "likelink_studio_render",
    kind: "native",
    he: "רינדור בסטודיו (קנבס בדפדפן)",
    executor: "Studio → POST /api/store?mode=media-pipeline&op=studio-register",
    ingest: "server copies reels/<studio>/… to ugc/<product>/… and verifies it",
    output: "WebM/MP4 720×1280",
    truth: MEDIA_TRUTH.SYNTHETIC_ANIMATION,
    requiredCredentials: ["a signed-in creator session"],
    verification: "anon read-back of the copied file + registration read-back",
  }],
  ["likelink_studio_reel", {
    id: "likelink_studio_reel",
    kind: "native",
    he: "ריל שנשמר בסטודיו (מצורף למוצר)",
    executor: "Studio save → POST /api/store (marketplace:videos) → reelAttach.js",
    ingest: "attached to the creator's own approved product",
    output: "WebM/MP4",
    truth: MEDIA_TRUTH.SYNTHETIC_ANIMATION,
    requiredCredentials: ["a signed-in creator session"],
    verification: "storage policy serves it only while an approved product references it",
  }],
]);

/**
 * Add an external video provider as an ADAPTER. Refused without the
 * credential names it needs, a way to verify its output and a truth state.
 */
export function registerVideoProvider(adapter = {}) {
  const id = text(adapter.id);
  if (!id || PROVIDERS.has(id)) return { ok: false, error: "bad_or_duplicate_id" };
  if (!Array.isArray(adapter.requiredCredentials) || !adapter.requiredCredentials.length) return { ok: false, error: "required_credentials_missing" };
  if (!text(adapter.verification)) return { ok: false, error: "verification_required" };
  if (!Object.values(MEDIA_TRUTH).includes(adapter.truth)) return { ok: false, error: "truth_state_required" };
  PROVIDERS.set(id, { kind: "external", ...adapter, id });
  return { ok: true, id };
}

export function videoProviders() {
  return [...PROVIDERS.values()].map((p) => ({ ...p }));
}

export function videoProvider(id) {
  const p = PROVIDERS.get(text(id));
  return p ? { ...p } : null;
}

/* -------------------------------------------------- intent → storyboard */

/** What a creative is for, about which product, in which style. */
export function videoIntent({ product, creator = null, style, styleLabel = null, goal = "product_discovery" } = {}) {
  if (!product?.id || !text(style)) return null;
  return {
    productId: String(product.id),
    creatorId: creator?.id ? String(creator.id) : product.marketerId ? String(product.marketerId) : null,
    style,
    styleLabel: styleLabel || null,
    goal,
    // A render is always an animation; the product photo is its only reference.
    truth: MEDIA_TRUTH.SYNTHETIC_ANIMATION,
    productReference: HTTP.test(text(product.image)) ? product.image : "",
    disclosureRequired: true,
  };
}

/**
 * The storyboard: the content the renderer draws, in order, taken from the
 * concept (real product fields only). Only the hook has a fixed duration —
 * no per-scene timing is claimed beyond what the concept defines.
 */
export function videoStoryboard(intent, concept) {
  if (!intent || !concept?.lines) return null;
  const l = concept.lines;
  const scenes = [
    l.hook ? { id: "hook", text: l.hook, durationMs: Number(concept.hookMs) || null } : null,
    { id: "reveal", text: text(l.kicker), image: concept.image || intent.productReference },
    l.title ? { id: "title", text: l.title } : null,
    Array.isArray(l.facts) && l.facts.length ? { id: "facts", text: l.facts.join(" · ") } : null,
    l.cta ? { id: "cta", text: l.cta } : null,
  ].filter(Boolean);
  return {
    intent,
    conceptId: concept.id || `${intent.productId}:${intent.style}`,
    scenes,
    // Shown on every frame, for the whole clip.
    overlay: { id: "disclosure", text: text(concept.disclosure) },
    durationMs: Number(concept.durationMs) || null,
    format: { width: concept.width || null, height: concept.height || null, fps: concept.fps || null },
  };
}

/**
 * SceneCompiler: the render spec the renderer executes. It IS the concept
 * (unchanged fields the renderer reads) plus the intent and storyboard, so
 * what was planned and what was drawn are one record.
 */
export function compileScenes(storyboard, concept) {
  if (!storyboard || !concept) return null;
  return { ...concept, intent: storyboard.intent, storyboard: { scenes: storyboard.scenes, overlay: storyboard.overlay } };
}

/** The creative prompt stored with the asset: the brief the render followed. */
export function creativeBrief(storyboard) {
  if (!storyboard) return null;
  const parts = storyboard.scenes.map((s) => `${s.id}: ${s.text || ""}`.trim()).filter((s) => !/:\s*$/.test(s));
  const label = storyboard.intent.styleLabel?.he || storyboard.intent.style;
  return {
    prompt: [`סגנון: ${label}`, ...parts, `גילוי נאות: ${storyboard.overlay.text}`].join(" | ").slice(0, 600),
    style: storyboard.intent.style,
    productReference: storyboard.intent.productReference,
    conceptId: storyboard.conceptId,
    goal: storyboard.intent.goal,
  };
}

/* --------------------------------------------------------------- truth */

export const UGC_MODE = Object.freeze({
  REAL_UGC: "REAL_UGC",                       // a real person filmed it — only with a real source
  SYNTHETIC_UGC_STYLE: "SYNTHETIC_UGC_STYLE", // computer-made in a creator-video format
  NOT_UGC: "NOT_UGC",
});

export const UGC_MODE_LABEL = Object.freeze({
  REAL_UGC: { he: "UGC אמיתי (צולם על ידי אדם)", en: "Real UGC (filmed by a person)" },
  SYNTHETIC_UGC_STYLE: { he: "בסגנון UGC · ממוחשב, לא אדם אמיתי", en: "UGC-style · computer-made, not a real person" },
  NOT_UGC: { he: "לא UGC", en: "Not UGC" },
});

/**
 * REAL_UGC only for a real video with a real human source (a creator upload
 * that is not a LikeLink render). A render in the UGC format is
 * SYNTHETIC_UGC_STYLE, never real UGC.
 */
export function ugcMode(record = {}) {
  const truth = classifyMediaRecord(record).state;
  if (truth === MEDIA_TRUTH.REAL_VIDEO && record.synthetic !== true && text(record.marketerId) && record.humanFilmed === true) return UGC_MODE.REAL_UGC;
  if (truth === MEDIA_TRUTH.SYNTHETIC_ANIMATION && /ugc/i.test(text(record.style))) return UGC_MODE.SYNTHETIC_UGC_STYLE;
  return UGC_MODE.NOT_UGC;
}

/* --------------------------------------------------------------- asset */

/** The VideoAsset view of a marketplace:videos record (and its product). */
export function videoAsset(video = {}, product = null) {
  const truth = classifyMediaRecord(video).state;
  const productId = text(video.productTags?.[0]?.productId) || text(video.productId) || (product?.id ? String(product.id) : "");
  const provider = text(video.videoProvider) || text(video.source) || "unknown";
  return {
    assetId: String(video.id || ""),
    productId,
    marketerId: text(video.marketerId) || (product?.marketerId ? String(product.marketerId) : ""),
    style: text(video.style),
    styleLabel: video.styleLabel || null,
    creativePrompt: video.creative?.prompt || null,
    productReference: video.creative?.productReference || (HTTP.test(text(product?.image)) ? product.image : ""),
    assetUrl: text(video.videoUrl),
    posterUrl: text(video.poster),
    generationStatus: text(video.videoStatus) === "completed" ? "GENERATED" : text(video.videoStatus).toUpperCase() || "UNKNOWN",
    provider,
    providerKnown: PROVIDERS.has(provider),
    renderer: text(video.renderer) || null,
    createdAt: Number(video.createdAt) || null,
    truth,
    ugcMode: ugcMode({ ...video, marketerId: video.marketerId }),
    disclosed: video.disclosed === true,
    bytes: Number(video.bytes) || null,
    sha256: text(video.sha256) || null,
    durationMs: Number(video.durationMs) || null,
  };
}
