/** Cloud-only UGC media engine. Server secrets only.
 * Generates an original synthetic creator image and queues a real Sora video
 * from that image. No browser-side secrets, no real-person impersonation,
 * and no fabricated publication/traffic claims.
 */

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
import { geminiFetch, getGeminiApiKey } from "./geminiGateway.js";\nconst GEMINI_KEY = getGeminiApiKey();
const GEMINI_KEY = GEMINI_KEY || process.env.GOOGLE_API_KEY || process.env.VEO_API_KEY || "";
const OPENAI_BASE = "https://api.openai.com/v1";
const CREATIVE_ANGLES = [
  { id: "curiosity", name: "Curiosity reveal", hook: "רגע — למה כולם שמים לב לזה?" },
  { id: "problem-solution", name: "Problem → solution", hook: "אם גם את נתקלת בזה, תראי את זה." },
  { id: "emotional-roi", name: "Emotional ROI", hook: "לפני שקונים, הנה הדבר שבאמת שווה לבדוק." },
  { id: "reality-tea", name: "Reality / honest take", hook: "בלי הייפ — הנה מה שבאמת רואים." },
];
const CREATIVE_STYLES = Object.freeze({
  ugc: {
    id: "ugc",
    label: "UGC / creator",
    prompt: "Authentic handheld creator energy, immediate curiosity, natural product demo, no fake testimonial."
  },
  cinematic3d: {
    id: "cinematic3d",
    label: "Cinematic 3D",
    prompt: "Original family-friendly cinematic 3D animation with expressive stylized characters, premium lighting and playful storytelling. Do not imitate or reference any named studio or copyrighted character."
  },
  product_story: {
    id: "product_story",
    label: "Product story",
    prompt: "Premium product-first micro-story with macro details, satisfying reveal, clear use moment and visual payoff."
  }
});

const MODEL_ROLES = {
  ai_female_model: "original adult female fashion/lifestyle model",
  ai_female_creator: "original adult female creator",
  ai_female_influencer: "original adult female lifestyle creator",
};

function assertServerConfig() {
  if (!process.env.OPENAI_API_KEY) return { ok: false, error: "ugc_ai_not_configured" };
  if (!SB_URL || !SB_KEY) return { ok: false, error: "supabase_not_configured" };
  return { ok: true };
}

function productPrompt(product, characterType, creativeAngle = "") {
  const role = MODEL_ROLES[characterType] || MODEL_ROLES.ai_female_model;
  const title = String(product.title).slice(0, 180);
  const category = String(product.category || "general").slice(0, 80);
  const description = String(product.description || "").slice(0, 500);
  return [
    "Create a photorealistic vertical UGC commerce photograph.",
    "Use an " + role + "; the person is entirely synthetic and must not resemble any real or famous person.",
    "Show the synthetic adult creator naturally presenting the verified product in a believable everyday setting.",
    "Verified product name: " + title + ".",
    "Verified category: " + category + ".",
    description ? "Verified catalog description: " + description + "." : "",
    "Do not invent product features, testimonials, discounts, scarcity, awards, medical claims, or social proof.",
    "Creative direction: " + (creativeAngle || "curiosity reveal") + ".",
    "Build the visual around curiosity, authentic creator energy, and a clear reason to keep watching.",
    "Premium social-media composition, natural lighting, realistic anatomy and hands, product clearly visible.",
    "No celebrity likeness, no real-person identity, no text overlay. Portrait 9:16 composition.",
  ].filter(Boolean).join("\n");
}

export async function generateCloudUgcAsset({ product, characterType = "ai_female_model", creativeAngle = "", force = false } = {}) {
  if (!product?.id || !product?.title) return { ok: false, error: "invalid_product" };
  if (product.status !== "approved") return { ok: false, error: "product_not_approved" };
  if (!product.marketerId) return { ok: false, error: "product_owner_missing" };
  const config = assertServerConfig();
  if (!config.ok) return config;

  const existing = await kvGet("ugc:assets:" + product.id, []);
  const list = Array.isArray(existing) ? existing : [];
  const recent = list.find((a) => a?.imageUrl && a?.synthetic === true && Number(a.createdAt || 0) > Date.now() - 86400000);
  if (recent && !force) return { ok: true, skipped: "fresh_asset", asset: recent };

  const response = await fetch(OPENAI_BASE + "/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + process.env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: productPrompt(product, characterType, creativeAngle),
      size: "1024x1536",
      quality: "high",
      output_format: "png",
    }),
    signal: AbortSignal.timeout(60000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: "ugc_generation_failed", providerStatus: response.status, detail: String(payload?.error?.message || "").slice(0, 180) };
  }

  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "ugc_generation_no_image" };
  const bytes = Buffer.from(b64, "base64");
  const path = "ugc/" + product.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".png";
  const bucket = "product-images";
  const upload = await uploadBytes(bucket, path, bytes, "image/png");
  if (!upload.ok) return upload;

  const imageUrl = publicStorageUrl(bucket, path);
  const asset = {
    id: "ugc_" + product.id + "_" + Date.now(),
    productId: product.id,
    marketerId: product.marketerId,
    characterType,
    creativeAngle: creativeAngle || CREATIVE_ANGLES[0].id,
    imageUrl,
    source: "openai_images",
    synthetic: true,
    disclosed: true,
    videoProvider: null,
    videoJobId: null,
    videoStatus: null,
    videoUrl: null,
    createdAt: Date.now(),
  };
  await kvSet("ugc:assets:" + product.id, [asset, ...list].slice(0, 20));
  return { ok: true, asset };
}

/** Queue a real Google Veo 3.1 image-to-video UGC clip.
 * Gemini credentials stay server-side. The job is asynchronous and persisted
 * in KV so the browser is not the execution layer.
 */
export async function queueCloudUgcVideo({ product, asset, creativeAngle = "", hookText = "", style = "ugc" } = {}) {
  if (!product?.id || !asset?.imageUrl) return { ok: false, error: "ugc_image_required" };
  if (!GEMINI_KEY) {
    return { ok: false, error: "ugc_video_not_configured", nextAction: "configure_gemini_api_key", provider: "google_veo_3_1" };
  }
  if (asset.videoUrl) return { ok: true, skipped: "video_exists", asset };
  if (asset.videoJobId && ["queued", "running", "completed"].includes(String(asset.videoStatus || ""))) {
    return { ok: true, skipped: "video_already_queued", asset };
  }

  const imageResponse = await fetch(asset.imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!imageResponse.ok) return { ok: false, error: "ugc_reference_fetch_failed", providerStatus: imageResponse.status };
  const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
  const mimeType = imageResponse.headers.get("content-type") || "image/png";

  const angle = creativeAngle || asset.creativeAngle || CREATIVE_ANGLES[0].id;\n  const styleMeta = CREATIVE_STYLES[style] || CREATIVE_STYLES.ugc;
  const angleMeta = CREATIVE_ANGLES.find((x) => x.id === angle) || CREATIVE_ANGLES[0];
  const hook = hookText || angleMeta.hook;
  const prompt = [
    "Create an 8-second premium vertical commerce video from the supplied reference image.",
    "Creative angle: " + angleMeta.name + ".",\n    "Creative style: " + styleMeta.label + ". " + styleMeta.prompt,
    "Open with a natural creator-style visual hook in the first 1-2 seconds: " + hook,
    "Use fast, intentional visual pacing with a curiosity beat, product close-up, and a clean payoff.",
    "If spoken audio is generated, keep it natural and concise; never invent product claims or testimonials.",
    "Keep the same original synthetic adult creator and the same verified product identity.",
    "Natural handheld social-video movement, subtle presenter motion, believable product presentation, premium lighting.",
    "Do not invent product features, testimonials, discounts, scarcity, awards, medical claims, or social proof.",
    "No celebrity likeness and no real-person identity. No text overlay.",
    "The output is intended for an organic social post and must remain faithful to the verified catalog product.",
  ].join("\n");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify({
      instances: [{
        prompt,
        image: { inlineData: { mimeType, data: imageBytes.toString("base64") } },
      }],
      parameters: {
        aspectRatio: "9:16",
        resolution: process.env.GEMINI_VIDEO_RESOLUTION || "720p",
      },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.name) {
    return { ok: false, error: "ugc_video_queue_failed", providerStatus: response.status, detail: String(payload?.error?.message || "").slice(0, 180) };
  }

  const updated = {
    ...asset,
    videoProvider: "google_veo_3_1",
    videoJobId: payload.name,
    videoStatus: "queued",
    videoProgress: 0,
    videoQueuedAt: Date.now(),
    videoError: null,
  };
  await replaceAsset(product.id, updated);
  return { ok: true, asset: updated, status: "queued", provider: "google_veo_3_1" };
}

/** Poll a Google Veo long-running operation and persist the finished MP4. */
export async function pollCloudUgcVideo({ productId, videoJobId } = {}) {
  if (!productId || !videoJobId) return { ok: false, error: "missing_video_job" };
  if (!GEMINI_KEY) {
    return { ok: false, error: "ugc_video_not_configured", nextAction: "configure_gemini_api_key", provider: "google_veo_3_1" };
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/" + videoJobId, {
    headers: { "x-goog-api-key": GEMINI_KEY },
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: "ugc_video_status_failed", providerStatus: response.status, detail: String(payload?.error?.message || "").slice(0, 180) };
  }

  const existing = await kvGet("ugc:assets:" + productId, []);
  const list = Array.isArray(existing) ? existing : [];
  const asset = list.find((a) => a?.videoJobId === videoJobId);
  if (!asset) return { ok: false, error: "ugc_asset_not_found" };

  if (!payload.done) {
    const updated = { ...asset, videoStatus: "running", videoProgress: Number(payload?.metadata?.progress || asset.videoProgress || 0) };
    await replaceAsset(productId, updated);
    return { ok: true, status: "running", asset: updated };
  }

  const operationError = payload?.error;
  if (operationError) {
    const updated = { ...asset, videoStatus: "failed", videoError: String(operationError.message || operationError).slice(0, 300) };
    await replaceAsset(productId, updated);
    return { ok: false, error: "ugc_video_generation_failed", detail: updated.videoError, asset: updated };
  }

  const videoUri = payload?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!videoUri) {
    const updated = { ...asset, videoStatus: "failed", videoError: "video_uri_missing" };
    await replaceAsset(productId, updated);
    return { ok: false, error: "video_uri_missing", asset: updated };
  }

  const content = await fetch(videoUri, {
    headers: { "x-goog-api-key": GEMINI_KEY },
    signal: AbortSignal.timeout(60000),
  });
  if (!content.ok) {
    const updated = { ...asset, videoStatus: "failed", videoError: "video_content_download_failed" };
    await replaceAsset(productId, updated);
    return { ok: false, error: "video_content_download_failed", providerStatus: content.status };
  }

  const videoBytes = Buffer.from(await content.arrayBuffer());
  const path = "ugc/" + productId + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".mp4";
  const upload = await uploadBytes("product-images", path, videoBytes, "video/mp4");
  if (!upload.ok) return upload;

  const updated = {
    ...asset,
    videoStatus: "completed",
    videoProgress: 100,
    videoUrl: publicStorageUrl("product-images", path),
    videoCompletedAt: Date.now(),
    videoError: null,
  };
  await replaceAsset(productId, updated);
  return { ok: true, status: "completed", asset: updated };
}

async function replaceAsset(productId, updated) {
  const existing = await kvGet("ugc:assets:" + productId, []);
  const list = Array.isArray(existing) ? existing : [];
  const next = list.map((a) => (a?.id === updated.id ? updated : a));
  if (!next.some((a) => a?.id === updated.id)) next.unshift(updated);
  await kvSet("ugc:assets:" + productId, next.slice(0, 20));
}

async function uploadBytes(bucket, path, bytes, contentType) {
  try {
    const upload = await fetch(SB_URL + "/storage/v1/object/" + bucket + "/" + path, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + SB_KEY,
        "Content-Type": contentType,
        "x-upsert": "false",
        "cache-control": "31536000",
      },
      body: bytes,
      signal: AbortSignal.timeout(60000),
    });
    if (!upload.ok) return { ok: false, error: "ugc_storage_failed", detail: "storage_" + upload.status };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "ugc_storage_error", detail: String(e?.message || e).slice(0, 180) };
  }
}

function publicStorageUrl(bucket, path) {
  return SB_URL + "/storage/v1/object/public/" + bucket + "/" + path;
}

async function kvGet(key, fallback = null) {
  if (!SB_URL || !SB_KEY) return fallback;
  try {
    const res = await fetch(SB_URL + "/rest/v1/kv?key=eq." + encodeURIComponent(key) + "&select=value", {
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return fallback;
    const rows = await res.json();
    if (!rows?.[0]?.value) return fallback;
    let value = JSON.parse(rows[0].value);
    while (typeof value === "string") { try { value = JSON.parse(value); } catch { break; } }
    return value;
  } catch { return fallback; }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(SB_URL + "/rest/v1/kv?on_conflict=key", {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: "Bearer " + SB_KEY,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("kv_upsert_failed_" + res.status);
}

export function buildCreativeMatrix(product) {
  return CREATIVE_ANGLES.flatMap((angle) =>
    Object.keys(CREATIVE_STYLES).map((style) => ({
      productId: product?.id || null,
      angle: angle.id,
      style,
      hook: angle.hook,
      label: CREATIVE_STYLES[style].label,
      status: "READY_TO_GENERATE",
    }))
  );
}

export default { generateCloudUgcAsset, queueCloudUgcVideo, pollCloudUgcVideo, buildCreativeMatrix };
