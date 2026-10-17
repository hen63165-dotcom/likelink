// The paid-generation lock (isomorphic: the API, the runners and the Studio use it).
//
// LikeLink2 runs with no paid AI credits. Every code path that could spend
// money on generation — an image, a video, a voice, a chat completion — asks
// this guard first, on the server, before any credential check or network
// call. It is OFF unless the server's own environment says exactly
// PAID_GENERATION=enabled; nothing a browser sends can turn it on.
export const PAID_FLAG = "PAID_GENERATION";

/** The paid entry points that exist in this repository, so the lock's coverage is checkable. */
export const PAID_FEATURES = Object.freeze({
  "ugc-model": "OpenAI images/edits (api/store.mjs mode=ugc-model)",
  "intelligence:openai": "OpenAI chat completions (api/_utils/intelligenceProvider.mjs)",
  "viral-reel": "ElevenLabs voice + Replicate video (scripts/viral/viral_reel.py, viral-reel.yml)",
});

/** True only when the server's env has PAID_GENERATION=enabled. */
export function paidGenerationEnabled(env = {}) {
  return String(env?.[PAID_FLAG] ?? "").trim().toLowerCase() === "enabled";
}

/**
 * Ask before any paid work. Returns { allowed: true } or the refusal to send
 * (HTTP 403, error paid_generation_disabled) — never a fake result.
 */
export function paidGate(feature, env = {}) {
  if (!PAID_FEATURES[feature]) return { allowed: false, status: 403, error: "unknown_paid_feature", feature };
  if (paidGenerationEnabled(env)) return { allowed: true, feature };
  return {
    allowed: false,
    status: 403,
    error: "paid_generation_disabled",
    feature,
    mode: "ZERO_PAID_CREDITS",
    message: "Paid generation is switched off on this server (no paid AI credits). Free methods only.",
  };
}
