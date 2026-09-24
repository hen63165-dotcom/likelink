/** Cloud-only UGC media engine. Server secrets only.
 * Generates an original synthetic creator image and queues a real Sora video
 * from that image. No browser-side secrets, no real-person impersonation,
 * and no fabricated publication/traffic claims.
 */

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_BASE = "https://api.openai.com/v1";
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

function productPrompt(product, characterType) {
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
    "Premium social-media composition, natural lighting, realistic anatomy and hands, product clearly visible.",
    "No celebrity likeness, no real-person identity, no text overlay. Portrait 9:16 composition.",
  ].filter(Boolean).join("\n");
}

export async function generateCloudUgcAsset({ product, characterType = "ai_female_model", force = false } = {}) {
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
      prompt: productPrompt(product, characterType),
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

/** Queue a real Sora UGC clip using the generated model image as reference. */
export async function queueCloudUgcVideo({ product, asset } = {}) {
  if (!product?.id || !asset?.imageUrl) return { ok: false, error: "ugc_image_required" };
  const config = assertServerConfig();
  if (!config.ok) return config;

  if (asset.videoUrl) return { ok: true, skipped: "video_exists", asset };
  if (asset.videoJobId && ["queued", "in_progress", "completed"].includes(String(asset.videoStatus || ""))) {
    return { ok: true, skipped: "video_already_queued", asset };
  }

  const imageResponse = await fetch(asset.imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!imageResponse.ok) return { ok: false, error: "ugc_reference_fetch_failed", providerStatus: imageResponse.status };
  const imageBytes = await imageResponse.arrayBuffer();

  const form = new FormData();
  form.append("model", process.env.OPENAI_VIDEO_MODEL || "sora-2");
  form.append(
    "prompt",
    [
      "Create a polished 9:16 UGC commerce video featuring the same synthetic adult creator and the verified product shown in the reference image.",
      "Natural handheld social-video feel, subtle movement, believable product presentation, premium lighting.",
      "Do not add invented claims, reviews, discounts, scarcity, medical claims, logos, or fake social proof.",
      "The person is synthetic and not a real or famous person. Keep the product identity consistent with the reference.",
      "No text overlay. Make the clip suitable for an organic social post.",
    ].join("\n")
  );
  form.append("seconds", process.env.OPENAI_VIDEO_SECONDS || "8");
  form.append("size", process.env.OPENAI_VIDEO_SIZE || "720x1280");
  form.append("input_reference", new Blob([imageBytes], { type: imageResponse.headers.get("content-type") || "image/png" }), "ugc-reference.png");

  const response = await fetch(OPENAI_BASE + "/videos", {
    method: "POST",
    headers: { authorization: "Bearer " + process.env.OPENAI_API_KEY },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: "ugc_video_queue_failed", providerStatus: response.status, detail: String(payload?.error?.message || "").slice(0, 180) };
  }

  const updated = { ...asset, videoProvider: "openai_sora", videoJobId: payload.id || null, videoStatus: payload.status || "queued", videoQueuedAt: Date.now() };
  await replaceAsset(product.id, updated);
  return { ok: true, asset: updated, status: payload.status || "queued" };
}

/** Poll a Sora job and persist the finished MP4 to Supabase Storage. */
export async function pollCloudUgcVideo({ productId, videoJobId } = {}) {
  if (!productId || !videoJobId) return { ok: false, error: "missing_video_job" };
  const config = assertServerConfig();
  if (!config.ok) return config;

  const response = await fetch(OPENAI_BASE + "/videos/" + encodeURIComponent(videoJobId), {
    headers: { authorization: "Bearer " + process.env.OPENAI_API_KEY },
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

  const status = String(payload.status || "unknown");
  if (status !== "completed") {
    const updated = { ...asset, videoStatus: status, videoProgress: Number(payload.progress || 0), videoError: payload.error || null };
    await replaceAsset(productId, updated);
    return { ok: true, status, asset: updated };
  }

  const content = await fetch(OPENAI_BASE + "/videos/" + encodeURIComponent(videoJobId) + "/content", {
    headers: { authorization: "Bearer " + process.env.OPENAI_API_KEY },
    signal: AbortSignal.timeout(60000),
  });
  if (!content.ok) {
    const updated = { ...asset, videoStatus: "completed", videoError: "video_content_download_failed" };
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

export default { generateCloudUgcAsset, queueCloudUgcVideo, pollCloudUgcVideo };
