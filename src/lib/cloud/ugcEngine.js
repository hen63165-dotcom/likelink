/** First-party LikeLink creative engine. Server-side only.
 * Produces an original, disclosed SVG motion creative from verified catalog data.
 * It does not claim MP4/video generation and does not require Gemini/Veo/OpenAI.
 */

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

import { generateFirstPartyCreatorSvg, buildCreativePlan } from "./likelinkIntelligence.js";

function configOk() {
  return Boolean(SB_URL && SB_KEY);
}

async function kvGet(key, fallback = []) {
  if (!configOk()) return fallback;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return fallback;
    const rows = await res.json();
    if (!rows?.[0]?.value) return fallback;
    let value = JSON.parse(rows[0].value);
    while (typeof value === "string") {
      try { value = JSON.parse(value); } catch { break; }
    }
    return value;
  } catch {
    return fallback;
  }
}

async function kvSet(key, value) {
  if (!configOk()) throw new Error("supabase_not_configured");
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

async function uploadBytes(bucket, path, bytes, contentType) {
  if (!configOk()) return { ok: false, error: "supabase_not_configured" };
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "false",
        "cache-control": "31536000",
      },
      body: bytes,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { ok: false, error: `storage_upload_failed_${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

function publicStorageUrl(bucket, path) {
  return `${SB_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export async function generateCloudUgcAsset({
  product,
  characterType = "ai_female_model",
  creativeAngle = "",
  force = false,
  style = "ugc",
} = {}) {
  if (!product?.id || !product?.title) return { ok: false, error: "invalid_product" };
  if (product.status !== "approved") return { ok: false, error: "product_not_approved" };
  if (!product.marketerId) return { ok: false, error: "product_owner_missing" };
  if (!configOk()) return { ok: false, error: "supabase_not_configured" };

  const existing = await kvGet(`ugc:assets:${product.id}`, []);
  const list = Array.isArray(existing) ? existing : [];
  const recent = list.find(
    (a) => a?.imageUrl && a?.synthetic === true && Number(a.createdAt || 0) > Date.now() - 86400000
  );
  if (recent && !force) return { ok: true, skipped: "fresh_asset", asset: recent };

  const plan = buildCreativePlan(product, { trend: creativeAngle });
  const svg = generateFirstPartyCreatorSvg(product, { hook: plan.hook });
  const bytes = Buffer.from(svg, "utf8");
  const path = `ugc/${product.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.svg`;
  const bucket = "product-images";
  const upload = await uploadBytes(bucket, path, bytes, "image/svg+xml");
  if (!upload.ok) return upload;

  const imageUrl = publicStorageUrl(bucket, path);
  const asset = {
    id: `ugc_${product.id}_${Date.now()}`,
    productId: product.id,
    marketerId: product.marketerId,
    characterType,
    creativeAngle: creativeAngle || plan.angle,
    creativeStyle: style,
    imageUrl,
    source: "likelink_intelligence_core",
    synthetic: true,
    disclosed: true,
    videoProvider: "likelink_first_party_motion",
    videoJobId: null,
    videoStatus: "available_as_motion_svg",
    videoUrl: imageUrl,
    createdAt: Date.now(),
    engine: "likelink-intelligence-core",
  };

  await kvSet(`ugc:assets:${product.id}`, [asset, ...list].slice(0, 20));
  return { ok: true, asset };
}

export async function queueCloudUgcVideo({ product, asset } = {}) {
  if (!product?.id || !asset?.imageUrl) return { ok: false, error: "ugc_image_required" };
  if (asset.videoUrl && asset.videoStatus === "available_as_motion_svg") {
    return {
      ok: true,
      status: "available_as_motion_svg",
      provider: "likelink_first_party_motion",
      asset,
    };
  }
  return { ok: false, error: "first_party_motion_missing" };
}

export async function pollCloudUgcVideo({ productId } = {}) {
  if (!productId) return { ok: false, error: "missing_product" };
  return { ok: false, error: "first_party_motion_is_synchronous" };
}
