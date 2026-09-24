/** Cloud-only UGC generation engine. Server secrets only. */

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MODEL_ROLES = {
  ai_female_model: 'original adult female fashion/lifestyle model',
  ai_female_creator: 'original adult female creator',
  ai_female_influencer: 'original adult female lifestyle creator',
};

export async function generateCloudUgcAsset({ product, characterType = 'ai_female_model', force = false } = {}) {
  if (!product?.id || !product?.title) return { ok: false, error: 'invalid_product' };
  if (product.status !== 'approved') return { ok: false, error: 'product_not_approved' };
  if (!product.marketerId) return { ok: false, error: 'product_owner_missing' };
  if (!process.env.OPENAI_API_KEY) return { ok: false, error: 'ugc_ai_not_configured' };
  if (!SB_URL || !SB_KEY) return { ok: false, error: 'supabase_not_configured' };
  const existing = await kvGet('ugc:assets:' + product.id, []);
  const list = Array.isArray(existing) ? existing : [];
  const recent = list.find((a) => a?.imageUrl && a?.synthetic === true && Number(a.createdAt || 0) > Date.now() - 86400000);
  if (recent && !force) return { ok: true, skipped: 'fresh_asset', asset: recent };
  const role = MODEL_ROLES[characterType] || MODEL_ROLES.ai_female_model;
  const title = String(product.title).slice(0, 180);
  const category = String(product.category || 'general').slice(0, 80);
  const description = String(product.description || '').slice(0, 500);
  const prompt = [
    'Create a photorealistic vertical UGC commerce photograph.',
    'Use an ' + role + '; the person is entirely synthetic and must not resemble any real or famous person.',
    'Show the synthetic adult creator naturally presenting the verified product in a believable everyday setting.',
    'Verified product name: ' + title + '.',
    'Verified category: ' + category + '.',
    description ? 'Verified catalog description: ' + description + '.' : '',
    'Do not invent product features, testimonials, discounts, scarcity, awards, medical claims, or social proof.',
    'Premium social-media composition, natural lighting, realistic anatomy and hands, product clearly visible.',
    'No celebrity likeness, no real-person identity, no text overlay. Portrait 9:16 composition.'
  ].filter(Boolean).join('\n');
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1536', quality: 'high', output_format: 'png' }),
    signal: AbortSignal.timeout(60000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: 'ugc_generation_failed', providerStatus: response.status, detail: String(payload?.error?.message || '').slice(0, 180) };
  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: 'ugc_generation_no_image' };
  const bytes = Buffer.from(b64, 'base64');
  const path = 'ugc/' + product.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.png';
  const bucket = 'product-images';
  const upload = await fetch(SB_URL + '/storage/v1/object/' + bucket + '/' + path, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'image/png', 'x-upsert': 'false', 'cache-control': '31536000' },
    body: bytes,
    signal: AbortSignal.timeout(30000),
  });
  if (!upload.ok) return { ok: false, error: 'ugc_storage_failed', detail: 'storage_' + upload.status };
  const imageUrl = SB_URL + '/storage/v1/object/public/' + bucket + '/' + path;
  const asset = { id: 'ugc_' + product.id + '_' + Date.now(), productId: product.id, marketerId: product.marketerId, characterType, imageUrl, source: 'openai_images', synthetic: true, disclosed: true, createdAt: Date.now() };
  await kvSet('ugc:assets:' + product.id, [asset, ...list].slice(0, 20));
  return { ok: true, asset };
}

async function kvGet(key, fallback = null) {
  if (!SB_URL || !SB_KEY) return fallback;
  try {
    const res = await fetch(SB_URL + '/rest/v1/kv?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return fallback;
    const rows = await res.json();
    if (!rows?.[0]?.value) return fallback;
    let value = JSON.parse(rows[0].value);
    while (typeof value === 'string') { try { value = JSON.parse(value); } catch { break; } }
    return value;
  } catch { return fallback; }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error('supabase_not_configured');
  const res = await fetch(SB_URL + '/rest/v1/kv?on_conflict=key', { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key, value: JSON.stringify(value) }), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('kv_upsert_failed_' + res.status);
}

export default { generateCloudUgcAsset };