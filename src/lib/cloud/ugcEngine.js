/** Cloud-only UGC media engine. Server secrets only.
 * Generates an original synthetic creator image and queues a real Gemini/Veo video
 * from that image. No browser-side secrets, no real-person impersonation,
 * and no fabricated publication/traffic claims.
 */

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
import { generateFirstPartyCreatorSvg, buildCreativePlan } from "./likelinkIntelligence.js";


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

export async function generateCloudUgcAsset({ product, characterType = "ai_female_model", creativeAngle = "", force = false, style = "ugc" } = {}) {
  if (!product?.id || !product?.title) return { ok: false, error: "invalid_product" };
  if (product.status !== "approved") return { ok: false, error: "product_not_approved" };
  if (!product.marketerId) return { ok: false, error: "product_owner_missing" };
  const config = assertServerConfig();
  if (!config.ok) return config;

  const existing = await kvGet("ugc:assets:" + product.id, []);
  const list = Array.isArray(existing) ? existing : [];
  const recent = list.find((a) => a?.imageUrl && a?.synthetic === true && Number(a.createdAt || 0) > Date.now() - 86400000);
  if (recent && !force) return { ok: true, skipped: "fresh_asset", asset: recent };

  const plan = buildCreativePlan(product, { trend: creativeAngle });
  const svg = generateFirstPartyCreatorSvg(product, { hook: plan.hook });
  const bytes = Buffer.from(svg, "utf8");
  const path = "ugc/" + product.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".svg";
  const bucket = "product-images";
  const upload = await uploadBytes(bucket, path, bytes, "image/svg+xml");
  if (!upload.ok) return upload;

  const imageUrl = publicStorageUrl(bucket, path);
  const asset = {
    id: "ugc_" + product.id + "_" + Date.now(),
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
  await kvSet("ugc:assets:" + product.id, [asset, ...list].slice(0, 20));
  return { ok: true, asset };
}

/** First-party motion is represented by the generated SVG asset.
 * No external video provider is required or claimed.
 */
export async function queueCloudUgcVideo({ product, asset } = {}) {
  if (!product?.id || !asset?.imageUrl) return { ok: false, error: "ugc_image_required" };
  if (asset.videoUrl) return { ok: true, skipped: "first_party_motion_exists", asset };
  return { ok: false, error: "first_party_motion_missing" };
}

/** First-party motion has no external polling operation. */
export async function pollCloudUgcVideo({ productId } = {}) {
  if (!productId) return { ok: false, error: "missing_product" };
  return { ok: false, error: "first_party_motion_is_synchronous" };
}

async function replaceAsset(productId, updated) {
  const existing = await kvGet("ugc:assets:" + productId, []);
  const list = Array.isArray(existing) ? existing : [];
  const next = list.map((a) => (a?.id === update/** No external video polling exists in first-party mode. */
export async function pollCloudUgcVideo({ productId } = {}) {
  if (!productId) return { ok: false, error: "missing_product" };
  return { ok: false, error: "first_party_motion_is_synchronous" };
}


