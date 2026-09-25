import { getAiHealth } from "./likelinkIntelligence.js";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Compatibility adapter only.
 * LikeLink Intelligence Core is the default AI and does not require Gemini.
 * Gemini is optional infrastructure, never a prerequisite for core operation.
 */
export function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VEO_API_KEY || "").trim();
}

export function isGeminiConfigured() {
  return Boolean(getGeminiApiKey());
}

export function getGeminiBaseUrl() {
  return String(process.env.GEMINI_API_BASE_URL || DEFAULT_BASE).trim().replace(/\/$/, "");
}

export async function geminiFetch(path, options = {}) {
  const key = getGeminiApiKey();
  if (!key) return { ok:false, configured:false, status:503, payload:{error:{message:"optional_gemini_not_configured"}} };
  const response = await fetch(getGeminiBaseUrl()+"/"+String(path).replace(/^\//,""), {
    ...options,
    headers: { ...(options.headers||{}), "x-goog-api-key": key }
  });
  const payload = await response.json().catch(()=>({}));
  return { ok:response.ok, configured:true, status:response.status, payload, headers:response.headers };
}

export async function getGeminiHealth() {
  const core = getAiHealth();
  if (!isGeminiConfigured()) {
    return { ...core, gemini: { configured:false, status:"OPTIONAL_NOT_CONFIGURED" } };
  }
  const r=await geminiFetch("/models",{method:"GET",signal:AbortSignal.timeout(10000)});
  return {
    ...core,
    gemini: {
      configured:true,
      status:r.ok ? "AVAILABLE" : "UNAVAILABLE",
      providerStatus:r.status,
      reason:r.ok?null:String(r.payload?.error?.message||"optional_gemini_unreachable").slice(0,180)
    }
  };
}
