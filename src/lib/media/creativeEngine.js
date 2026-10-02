// LikeLink Creative Engine — ONE entry point for every product creative a
// Studio (or LikeLink itself) can order. It does not render anything itself: it
// maps a creative type onto the existing native reel pipeline
// (reelPipeline.js → runner → ingest → verified storage → publication), checks
// which providers REALLY work, and turns the pipeline's records into one job
// shape. Pure and isomorphic (browser + serverless).
//
//   TEXT_HOOK    big Hebrew text over the real product photo          free
//   UGC          creator-style synthetic reel (not a person)          premium
//   AI_3D_STORY  original AI 3D character stills, animated + real photo  premium
//   AI_3D_UGC    original AI 3D "virtual creator" + real photo        premium
//
// Truth rules (tests/creativeEngine.test.mjs):
//   • a job is COMPLETED only with a registered, read-back-verified video record;
//   • AI scenes are STILL IMAGES animated by the renderer — never "AI video";
//   • no voice is claimed: no voice provider is implemented, captions carry the script;
//   • a provider is AVAILABLE only with recorded evidence (a real success), never because code exists;
//   • premium usage is counted only when the asset was stored and verified.
import { REEL_STYLES, AI_IMAGE_PROVIDER, AI_SCENE_STYLES, RENDER_PROVIDER, ON_FRAME_DISCLOSURE, buildReelConcept, hookQuestion } from "./reelPipeline.js";

export const CREATIVE_TYPES = Object.freeze({
  TEXT_HOOK: { style: "text_hook", tier: "free", needs: ["renderer"], aiGenerated: false, he: "הוק טקסט", en: "Text Hook", output: "RENDERED_VIDEO" },
  UGC: { style: "ugc_style", tier: "premium", needs: ["renderer"], aiGenerated: false, he: "UGC סינתטי (לא אדם אמיתי)", en: "Synthetic UGC (not a real person)", output: "RENDERED_VIDEO" },
  AI_3D_STORY: { style: "ai_story", tier: "premium", needs: ["renderer", "image"], aiGenerated: true, he: "סיפור 3D עם דמות AI", en: "3D Story with an AI character", output: "AI_STILLS_ANIMATED" },
  AI_3D_UGC: { style: "ai_ugc", tier: "premium", needs: ["renderer", "image"], aiGenerated: true, he: "יוצרת וירטואלית 3D + המוצר", en: "3D virtual creator + product", output: "AI_STILLS_ANIMATED" },
});
export const CREATIVE_TYPE_IDS = Object.freeze(Object.keys(CREATIVE_TYPES));
/** The plan quota premium creatives count against (src/lib/plans.js feature creative_premium). */
export const PREMIUM_QUOTA_KEY = "premiumCreatives";
export const PLATFORMS = Object.freeze(["instagram_reels", "tiktok", "youtube_shorts", "facebook_reels", "site"]);
export const LANGUAGES = Object.freeze(["he"]);
export const CTA_IDS = Object.freeze(["comment_keyword", "details", "see_more"]);
/** Bounded retries: a request that failed this many renders is FAILED for good (no loop). */
export const MAX_RENDER_ATTEMPTS = 2;
/** A free AI image provider with this many consecutive failures backs off for PROVIDER_BACKOFF_MS. */
export const PROVIDER_FAILURE_LIMIT = 3;
export const PROVIDER_BACKOFF_MS = 12 * 3_600_000;
export const PROVIDER_FRESH_MS = 7 * 86_400_000;
export const KEYS = Object.freeze({ providers: "creative:providers", events: "creative:events" });

export const STATUS = Object.freeze({ AVAILABLE: "AVAILABLE", UNVERIFIED: "UNVERIFIED", NOT_CONFIGURED: "NOT_CONFIGURED", NO_CREDITS: "NO_CREDITS", FAILED: "FAILED", DISABLED: "DISABLED" });

export const typeOfStyle = (style) => CREATIVE_TYPE_IDS.find((t) => CREATIVE_TYPES[t].style === style) || null;

/**
 * Provider registry. `kind` image | video | voice | renderer. Only adapters that
 * exist in code can ever be AVAILABLE; a paid provider without an adapter is
 * DISABLED (adapter_not_implemented) even when its keys are present.
 */
export const PROVIDERS = Object.freeze([
  { id: "likelink_native_render", kind: "renderer", free: true, adapter: true, env: [], he: "מנוע הרינדור של LikeLink (Chromium + ffmpeg בענן)" },
  { id: AI_IMAGE_PROVIDER, kind: "image", free: true, adapter: true, env: [], he: "Pollinations (Flux) — תמונות AI חינמיות" },
  { id: "kling", kind: "video", free: false, adapter: false, env: ["KLING_ACCESS_KEY", "KLING_SECRET_KEY"], he: "Kling — וידאו AI (בתשלום)" },
  { id: "elevenlabs", kind: "voice", free: false, adapter: false, env: ["ELEVENLABS_API_KEY"], he: "ElevenLabs — קריינות (בתשלום)" },
]);

/**
 * Real provider states from evidence only.
 * @param {object} o.env       server env (booleans are derived; values never leave)
 * @param {object} o.health    creative:providers record { [id]: { lastOkAt, lastFailAt, consecutiveFailures, lastError } }
 * @param {Array}  o.videos    marketplace:videos (a recent native render proves the renderer)
 */
export function providerStates({ env = {}, health = {}, videos = [], now = Date.now(), owner = false } = {}) {
  const lastNative = (Array.isArray(videos) ? videos : []).filter((v) => v?.source === RENDER_PROVIDER).map((v) => Date.parse(v.createdAt) || 0).sort((a, b) => b - a)[0] || 0;
  return PROVIDERS.map((p) => {
    const h = (health && health[p.id]) || {};
    const missing = p.env.filter((k) => !String(env[k] || "").trim());
    let status, reason;
    if (p.kind === "renderer") {
      const ok = Math.max(lastNative, Number(h.lastOkAt) || 0);
      status = ok && now - ok < PROVIDER_FRESH_MS ? STATUS.AVAILABLE : STATUS.UNVERIFIED;
      reason = status === STATUS.AVAILABLE ? "recent_verified_render" : "no_recent_render";
    } else if (missing.length) {
      status = STATUS.NOT_CONFIGURED; reason = "credentials_missing";
    } else if (!p.adapter) {
      status = STATUS.DISABLED; reason = "adapter_not_implemented";
    } else if (Number(h.consecutiveFailures) >= PROVIDER_FAILURE_LIMIT && now - (Number(h.lastFailAt) || 0) < PROVIDER_BACKOFF_MS) {
      status = STATUS.FAILED; reason = "backoff_after_failures";
    } else if (h.lastOkAt && now - Number(h.lastOkAt) < PROVIDER_FRESH_MS && !(Number(h.lastFailAt) > Number(h.lastOkAt))) {
      status = STATUS.AVAILABLE; reason = "recent_success";
    } else if (Number(h.lastFailAt) > (Number(h.lastOkAt) || 0)) {
      status = STATUS.FAILED; reason = "last_attempt_failed";
    } else {
      status = STATUS.UNVERIFIED; reason = "no_success_recorded_yet";
    }
    return {
      id: p.id, kind: p.kind, free: p.free, status, reason, he: p.he,
      lastOkAt: h.lastOkAt ? new Date(Number(h.lastOkAt)).toISOString() : (p.kind === "renderer" && lastNative ? new Date(lastNative).toISOString() : null),
      lastFailAt: h.lastFailAt ? new Date(Number(h.lastFailAt)).toISOString() : null,
      // env names and raw provider errors reach the owner/admin only
      ...(owner ? { missingEnv: missing, lastError: h.lastError || null } : {}),
    };
  });
}

const usable = (s) => s === STATUS.AVAILABLE || s === STATUS.UNVERIFIED;

/** What each creative type can do right now, and why not. */
export function creativeCapabilities({ providers = [] } = {}) {
  const byKind = (kind) => providers.filter((p) => p.kind === kind);
  const best = (kind) => byKind(kind).find((p) => p.status === STATUS.AVAILABLE) || byKind(kind).find((p) => usable(p.status)) || null;
  const video = best("video"), voice = best("voice");
  return CREATIVE_TYPE_IDS.map((id) => {
    const t = CREATIVE_TYPES[id];
    const chosen = t.needs.map((k) => ({ kind: k, provider: best(k) }));
    const blocked = chosen.filter((c) => !c.provider).map((c) => ({ kind: c.kind, states: byKind(c.kind).map((p) => ({ id: p.id, status: p.status, reason: p.reason })) }));
    const verified = chosen.every((c) => c.provider?.status === STATUS.AVAILABLE);
    return {
      type: id, style: t.style, tier: t.tier, he: t.he, en: t.en, aiGenerated: t.aiGenerated,
      available: blocked.length === 0,
      verified,
      state: blocked.length ? "UNAVAILABLE" : verified ? "AVAILABLE" : "UNVERIFIED",
      providers: Object.fromEntries(chosen.map((c) => [c.kind, c.provider?.id || null])),
      blocked,
      output: t.output,
      // Honest output description: no AI video, no voice unless a provider truly exists.
      videoGeneration: video?.status === STATUS.AVAILABLE ? "AI_VIDEO" : t.output,
      voice: voice?.status === STATUS.AVAILABLE ? "VOICEOVER" : "CAPTIONS_ONLY",
      talkingHead: id === "UGC" || id === "AI_3D_UGC" ? (video?.status === STATUS.AVAILABLE ? "AVAILABLE" : "REQUIRES_VIDEO_PROVIDER") : "N/A",
    };
  });
}

/** Validate a createCreative() order. Only real fields and fixed choices reach the frames. */
export function validateOrder(input = {}) {
  const fail = (error, status = 400) => ({ ok: false, error, status });
  const creativeType = String(input.creativeType || "").toUpperCase();
  if (!CREATIVE_TYPES[creativeType]) return fail("bad_creative_type");
  const language = String(input.language || "he").toLowerCase();
  if (!LANGUAGES.includes(language)) return fail("unsupported_language", 422);
  const platform = String(input.platform || "instagram_reels");
  if (!PLATFORMS.includes(platform)) return fail("unsupported_platform", 422);
  const cta = String(input.cta || "comment_keyword");
  if (!CTA_IDS.includes(cta)) return fail("cta_not_allowed", 422);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(input.productId || input.product?.id || ""))) return fail("bad_product_id");
  const style = CREATIVE_TYPES[creativeType].style;
  return {
    ok: true,
    order: {
      creativeType, style, language, platform, cta,
      productId: String(input.productId || input.product.id),
      // Duration is fixed per format (pacing is tuned per style); the requested one is reported back.
      durationMs: REEL_STYLES[style].durationMs,
      requestedDurationMs: Number(input.duration) > 0 ? Number(input.duration) * (Number(input.duration) < 300 ? 1000 : 1) : null,
      // A custom offer is never burned in: an offer is shown only from the catalog's own previous price.
      offerFromCatalogOnly: Boolean(input.offer),
    },
  };
}

/**
 * The script the frames really carry (from the same concept the renderer
 * draws), as beats. Beats a style does not render are not listed.
 */
export function creativeScript({ product, creator = null, creativeType }) {
  const t = CREATIVE_TYPES[creativeType];
  if (!t || !product?.id) return null;
  const c = buildReelConcept({ product, creator, style: t.style });
  if (!c) return null;
  const beats = [{ beat: "PRELUDE", text: hookQuestion(product) }];
  const th = c.textHook;
  if (creativeType === "TEXT_HOOK") {
    beats.push({ beat: "HOOK", text: th.hook }, { beat: "PRODUCT", text: th.reveal.join(" · ") }, { beat: "CTA", text: th.cta.join(" ") });
  } else if (creativeType === "UGC") {
    beats.push({ beat: "HOOK", text: c.lines.kicker }, { beat: "PRODUCT", text: c.lines.title }, { beat: "DEMONSTRATION", text: c.lines.facts.join(" · ") }, { beat: "CTA", text: c.lines.cta });
  } else if (creativeType === "AI_3D_STORY") {
    beats.push({ beat: "PROBLEM", text: c.aiStory.scenes[0].caption, visual: "ai_scene_1" }, { beat: "DESIRE", text: c.aiStory.scenes[1].caption, visual: "ai_scene_2" }, { beat: "PRODUCT", text: th.reveal.join(" · "), visual: "real_product_photo" }, { beat: "CTA", text: th.cta.join(" ") });
  } else {
    beats.push({ beat: "HOOK", text: c.aiStory.scenes[0].caption, visual: "ai_creator_1" }, { beat: "PROBLEM_DESIRE", text: c.aiStory.scenes[1].caption, visual: "ai_creator_2" }, { beat: "PRODUCT", text: th.reveal.join(" · "), visual: "real_product_photo" }, { beat: "DEMONSTRATION", text: c.lines.facts.join(" · "), visual: "real_product_photo" }, { beat: "CTA", text: th.cta.join(" ") });
  }
  return {
    style: t.style,
    durationMs: c.durationMs,
    beats: beats.filter((b) => b.text),
    aiPrompts: c.aiStory ? c.aiStory.scenes.map((s) => ({ beat: s.beat, prompt: s.prompt })) : [],
    disclosure: c.disclosure,
    creativeId: c.creative?.creativeId || null,
  };
}

/** The disclosure lines that travel with a creative (on-frame + caption). */
export function creativeDisclosure(creativeType) {
  const t = CREATIVE_TYPES[creativeType];
  const lines = [ON_FRAME_DISCLOSURE.he];
  if (t?.aiGenerated) lines.push(creativeType === "AI_3D_UGC" ? "יוצרת וירטואלית שנוצרה ב-AI · לא אדם אמיתי · המוצר בתמונה אמיתית" : "דמות שנוצרה ב-AI · המוצר בתמונה אמיתית");
  if (creativeType === "UGC") lines.push("UGC סינתטי · ממוחשב, לא אדם אמיתי");
  return lines;
}

/**
 * One job from the pipeline's own records: the request (media:requests) and,
 * when it exists, the registered video (marketplace:videos). Nothing else.
 */
export function jobView({ request, video = null, product = null, creator = null } = {}) {
  if (!request?.id) return null;
  const creativeType = request.creativeType || typeOfStyle(request.style) || null;
  const t = CREATIVE_TYPES[creativeType] || null;
  const done = Boolean(video?.videoUrl && video?.id);
  const status = done ? "COMPLETED" : request.status === "FAILED" ? "FAILED" : request.status === "RENDERED" ? "RENDERED_NOT_FOUND" : "QUEUED";
  return {
    jobId: request.id,
    creativeType,
    style: request.style || null,
    productId: request.productId,
    studioId: request.studioId || product?.marketerId || null,
    status,
    script: product && creativeType ? creativeScript({ product, creator, creativeType }) : null,
    assets: done ? [{ kind: "video", url: video.videoUrl, assetId: video.id }, ...(video.poster ? [{ kind: "poster", url: video.poster }] : [])] : [],
    videoUrl: done ? video.videoUrl : null,
    thumbnailUrl: done ? video.poster || null : null,
    provider: { renderer: "likelink_native_render", image: t?.needs.includes("image") ? AI_IMAGE_PROVIDER : null, video: null, voice: null },
    aiGenerated: Boolean(t?.aiGenerated),
    output: t?.output || null,
    disclosure: creativeType ? creativeDisclosure(creativeType) : [ON_FRAME_DISCLOSURE.he],
    error: status === "FAILED" ? request.lastError || "render_failed" : status === "RENDERED_NOT_FOUND" ? "video_record_missing" : null,
    attempts: Number(request.attempts) || 0,
    premium: Boolean(request.premium),
    quotaCharged: Boolean(request.quotaCharged),
    cost: { amount: 0, currency: "USD", basis: "free_providers_only" },
    createdAt: request.at ? new Date(request.at).toISOString() : null,
    completedAt: request.doneAt ? new Date(request.doneAt).toISOString() : done ? video.createdAt || null : null,
    truth: done ? video.truth || null : null,
  };
}

/** Publish gate: every check must pass, or the creative is not published (Part 17). */
export function publishChecks({ product, video, script }) {
  const checks = {
    product_exists: Boolean(product?.id),
    product_image: /^https?:\/\//i.test(String(product?.image || "")),
    script: Boolean(script?.beats?.length),
    cta: Boolean(script?.beats?.some((b) => b.beat === "CTA")),
    media_exists: Boolean(video?.videoUrl),
    media_verified: video?.truth === "SYNTHETIC_ANIMATION" || video?.truth === "REAL_VIDEO",
    disclosure: Boolean(script?.disclosure),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

/** Bounded health bookkeeping for one provider attempt. */
export function recordProviderResult(health = {}, { provider, ok, error = "", now = Date.now() } = {}) {
  const h = { ...(health[provider] || {}) };
  if (ok) { h.lastOkAt = now; h.consecutiveFailures = 0; }
  else { h.lastFailAt = now; h.consecutiveFailures = (Number(h.consecutiveFailures) || 0) + 1; h.lastError = String(error).slice(0, 160); }
  return { ...health, [provider]: h };
}

/** Real counts per creative type from creative:events + clicks carrying camp=v-<assetId>. */
export function creativeAnalytics({ events = [], clicks = [], studioId = null } = {}) {
  const evs = (Array.isArray(events) ? events : []).filter((e) => !studioId || e?.studioId === studioId);
  const assets = new Map();
  for (const e of evs) if (e?.assetId) assets.set(e.assetId, e.creativeType || null);
  const byType = Object.fromEntries(CREATIVE_TYPE_IDS.map((t) => [t, { queued: 0, completed: 0, failed: 0, published: 0, clicks: 0, renderMs: [] }]));
  for (const e of evs) {
    const row = byType[e?.creativeType];
    if (!row) continue;
    if (e.type === "queued") row.queued += 1;
    if (e.type === "completed") { row.completed += 1; if (e.published) row.published += 1; if (Number(e.renderMs) > 0) row.renderMs.push(Number(e.renderMs)); }
    if (e.type === "failed") row.failed += 1;
  }
  for (const c of Array.isArray(clicks) ? clicks : []) {
    const m = /^v-(.+)$/.exec(String(c?.camp || ""));
    if (m && assets.has(m[1]) && byType[assets.get(m[1])]) byType[assets.get(m[1])].clicks += 1;
  }
  return Object.fromEntries(Object.entries(byType).map(([t, r]) => [t, { queued: r.queued, completed: r.completed, failed: r.failed, published: r.published, clicks: r.clicks, avgRenderMs: r.renderMs.length ? Math.round(r.renderMs.reduce((a, b) => a + b, 0) / r.renderMs.length) : null }]));
}

/** Append one analytics event (newest first, capped). */
export function appendEvent(list, event, cap = 500) {
  return [{ ...event }, ...(Array.isArray(list) ? list : [])].slice(0, cap);
}

export { AI_SCENE_STYLES };
