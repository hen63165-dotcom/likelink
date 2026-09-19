/**
 * LikeLink2 Video Editing Specification 🎬
 * =========================================
 * Generates real edit specifications from existing creative assets.
 *
 * Does NOT perform real video rendering.
 * Produces a truthful edit spec ready for a real renderer/provider.
 *
 * States:
 *   READY — edit spec can be generated
 *   PROCESSING — spec generation in progress
 *   COMPLETED — spec ready
 *   FAILED — spec generation failed
 *   BLOCKED — missing required assets
 *   UNAVAILABLE — no real video provider configured
 *   REAUTH_REQUIRED — provider auth needed
 */

export const EDIT_STATUS = Object.freeze({
  READY: "READY",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  UNAVAILABLE: "UNAVAILABLE",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
});

export const SCENE_TYPES = Object.freeze({
  HOOK: "hook",
  PRODUCT_INTRO: "product_intro",
  DEMO: "demo",
  BENEFIT: "benefit",
  CTA: "cta",
  OUTRO: "outro",
});

export function buildEditSpec({ creative, product, character, videoProvider = null }) {
  if (!creative || !product) return null;

  const hasImages = [product.image, product.image2, product.image3].filter(Boolean).length > 0;
  const hasVideoProvider = Boolean(videoProvider);
  const status = hasVideoProvider ? EDIT_STATUS.READY : EDIT_STATUS.UNAVAILABLE;

  const scenes = [];
  const script = creative.script || {};

  if (script.hook) {
    scenes.push({
      sceneId: `scene_${Date.now()}_hook`,
      type: SCENE_TYPES.HOOK,
      durationMs: 3000,
      startMs: 0,
      endMs: 3000,
      text: script.hook,
      caption: creative.captions?.[creative.language]?.hook || script.hook,
      visual: hasImages ? { type: "product_image", src: product.image } : { type: "text_gradient", text: product.title },
      character: character || null,
      overlay: { text: script.hook, position: "top" },
    });
  }

  if (script.introduction || script.demonstration) {
    scenes.push({
      sceneId: `scene_${Date.now()}_intro`,
      type: SCENE_TYPES.PRODUCT_INTRO,
      durationMs: 4000,
      startMs: 3000,
      endMs: 7000,
      text: script.introduction || script.demonstration,
      caption: creative.captions?.[creative.language]?.description || script.introduction || "",
      visual: hasImages ? { type: "product_image", src: product.image2 || product.image } : { type: "text_gradient", text: product.title },
      character: character || null,
    });
  }

  if (script.benefits) {
    scenes.push({
      sceneId: `scene_${Date.now()}_benefits`,
      type: SCENE_TYPES.BENEFIT,
      durationMs: 3500,
      startMs: 7000,
      endMs: 10500,
      text: script.benefits,
      caption: creative.captions?.[creative.language]?.description || script.benefits,
      visual: hasImages ? { type: "product_image", src: product.image3 || product.image } : { type: "text_gradient", text: product.title },
      character: character || null,
    });
  }

  if (script.cta) {
    scenes.push({
      sceneId: `scene_${Date.now()}_cta`,
      type: SCENE_TYPES.CTA,
      durationMs: 3000,
      startMs: 10500,
      endMs: 13500,
      text: script.cta,
      caption: creative.captions?.[creative.language]?.cta || script.cta,
      visual: { type: "cta_card", text: script.cta, accent: true },
      character: character || null,
      overlay: { text: script.cta, position: "bottom", accent: true },
    });
  }

  const totalDurationMs = scenes.reduce((sum, s) => sum + s.durationMs, 0);

  return {
    editId: `edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status,
    creativeId: creative.creativeId,
    productId: product.id,
    aspectRatio: creative.aspectRatio || "9:16",
    totalDurationMs,
    scenes,
    textOverlays: creative.textOverlays || [],
    captions: creative.captions || {},
    subtitles: creative.subtitles || { he: [], en: [] },
    voiceover: {
      language: creative.language || "he",
      tone: character?.persona || "friendly",
      pacing: "normal",
      script: script,
      status: "VOICEOVER_PROVIDER_REQUIRED",
    },
    thumbnail: {
      direction: creative.thumbnailDirection || "product_hero",
      sceneIndex: 0,
      timeMs: 500,
    },
    metadata: {
      hasVideoProvider,
      provider: videoProvider || null,
      generatedAt: Date.now(),
    },
    blockers: status === EDIT_STATUS.UNAVAILABLE ? ["no_video_provider"] : [],
  };
}

export function mutateEditSpec(spec, mutationType = "scene_order") {
  if (!spec || !spec.scenes?.length) return null;
  const next = { ...spec, editId: `edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, scenes: [...spec.scenes] };

  if (mutationType === "scene_order" && next.scenes.length >= 2) {
    const [first, ...rest] = next.scenes;
    next.scenes = [...rest, first];
    next.scenes.forEach((s, i) => {
      s.startMs = next.scenes.slice(0, i).reduce((sum, ss) => sum + ss.durationMs, 0);
      s.endMs = s.startMs + s.durationMs;
    });
    next.totalDurationMs = next.scenes.reduce((sum, s) => sum + s.durationMs, 0);
  } else if (mutationType === "cta_first") {
    const ctaScene = next.scenes.find((s) => s.type === "cta");
    if (ctaScene) {
      next.scenes = next.scenes.filter((s) => s.type !== "cta");
      next.scenes.unshift(ctaScene);
      next.scenes.forEach((s, i) => {
        s.startMs = next.scenes.slice(0, i).reduce((sum, ss) => sum + ss.durationMs, 0);
        s.endMs = s.startMs + s.durationMs;
      });
      next.totalDurationMs = next.scenes.reduce((sum, s) => sum + s.durationMs, 0);
    }
  } else if (mutationType === "aspect_ratio") {
    next.aspectRatio = spec.aspectRatio === "9:16" ? "1:1" : "9:16";
  }

  return next;
}

export function editSpecSummary(spec, lang = "he") {
  if (!spec) return { he: "אין עריכה", en: "No edit" };
  const parts = [spec.aspectRatio, `${spec.scenes?.length || 0} scenes`, `${Math.round((spec.totalDurationMs || 0) / 1000)}s`];
  return {
    he: parts.join(" · "),
    en: parts.join(" · "),
  };
}
