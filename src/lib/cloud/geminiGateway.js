const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

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
  if (!key) return { ok:false, configured:false, status:503, payload:{error:{message:"gemini_api_key_missing"}} };
  const response = await fetch(getGeminiBaseUrl()+"/"+String(path).replace(/^\//,""), {
    ...options,
    headers: { ...(options.headers||{}), "x-goog-api-key": key }
  });
  const payload = await response.json().catch(()=>({}));
  return { ok:response.ok, configured:true, status:response.status, payload, headers:response.headers };
}

export async function getGeminiHealth() {
  if (!isGeminiConfigured()) return {ok:false,configured:false,provider:"google_gemini",videoProvider:"google_veo_3_1",reason:"gemini_api_key_missing"};
  const r=await geminiFetch("/models",{method:"GET",signal:AbortSignal.timeout(10000)});
  return {ok:r.ok,configured:true,provider:"google_gemini",videoProvider:"google_veo_3_1",providerStatus:r.status,reason:r.ok?null:String(r.payload?.error?.message||"gemini_provider_unreachable").slice(0,180)};
}
