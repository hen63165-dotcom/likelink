// The radar's sentence model (src/lib/growth/newKinds.js): an open model (all-MiniLM-L6-v2, Apache-2.0,
// through transformers.js on the runner's CPU) turns each new listing's title into a vector. Nothing
// paid and no key: the package is installed on the radar runner only (trend-radar.yml) and never ships
// to the site; the model comes from Hugging Face's public hub. Vectors are kept between runs (int8,
// base64) so each morning only the listings new to the pool are embedded.
import { KINDS } from "../../src/lib/growth/newKinds.js";
import { LENS } from "../../src/lib/growth/lens.js";

export function packVector(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  const b = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) b[i] = Math.max(-127, Math.min(127, Math.round((v[i] / n) * 127)));
  return Buffer.from(b.buffer).toString("base64");
}
export function unpackVector(s) {
  const b = Buffer.from(String(s || ""), "base64");
  return Array.from(new Int8Array(b.buffer, b.byteOffset, b.length), (x) => x / 127);
}

/** The model as a function: titles → normalized vectors. */
export async function loadModel(model = KINDS.model) {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  const extract = await pipeline("feature-extraction", model, { dtype: "q8" });
  return async (texts) => (await extract(texts, { pooling: "mean", normalize: true })).tolist();
}

/**
 * One vector per pool listing: kept ones reused (same model), new titles embedded in batches.
 * Returns { vectors: { id: number[] }, cache, embedded }. The cache keeps only listings still in the pool.
 */
export async function poolVectors(pool = {}, cache = {}, { load = loadModel, batch = 64, model = KINDS.model, budgetMs = 600_000 } = {}) {
  const kept = cache?.model === model && cache.vecs && typeof cache.vecs === "object" ? cache.vecs : {};
  const entries = Object.values(pool || {}).filter((e) => e?.id && e.title);
  const vecs = {};
  const todo = [];
  for (const e of entries) (kept[e.id] ? (vecs[e.id] = kept[e.id]) : todo.push(e));
  let embedded = 0;
  if (todo.length) {
    const embed = await load(model);
    const started = Date.now();
    for (let i = 0; i < todo.length; i += batch) {
      if (Date.now() - started > budgetMs) break; // the rest waits for tomorrow's run
      const part = todo.slice(i, i + batch);
      const out = await embed(part.map((e) => e.title));
      part.forEach((e, k) => { if (Array.isArray(out[k]) && out[k].length) { vecs[e.id] = packVector(out[k]); embedded++; } });
    }
  }
  const vectors = Object.fromEntries(Object.entries(vecs).map(([id, s]) => [id, unpackVector(s)]));
  return { vectors, cache: { model, vecs }, embedded };
}

// 👁️ The store photos (newKinds.js lookCandidates): the lens model (MobileCLIP-S0, Apple's open model,
// the same one /magic runs in the browser) on the runner's CPU. Each photo is fetched through the run's
// metered fetch at the store CDN's 350×350 size; vectors are kept between runs like the titles'.
export const thumbUrl = (url) => (/\.(jpe?g|png|webp)$/i.test(String(url)) && !/_\d+x\d+\.\w+$/.test(String(url)) ? `${url}_350x350.jpg` : String(url));

export async function loadVision(model = LENS.model, { fetchImpl = globalThis.fetch, dtype = LENS.visionDtype } = {}) {
  const { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  const processor = await AutoProcessor.from_pretrained(model);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(model, { dtype });
  return async (url) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok || !/^image\//.test(res.headers.get("content-type") || "")) throw new Error(`photo ${res.status}`);
    const image = await RawImage.fromBlob(await res.blob());
    const { image_embeds } = await vision(await processor(image));
    return Array.from(image_embeds.data);
  };
}

/** One vector per candidate's photo: kept ones reused, new ones embedded within the budget. */
export async function poolImageVectors(entries = [], cache = {}, { load = loadVision, fetchImpl = globalThis.fetch, model = LENS.model, max = KINDS.lookMax, budgetMs = 240_000, poolIds = null } = {}) {
  const kept = cache?.model === model && cache.vecs && typeof cache.vecs === "object" ? cache.vecs : {};
  const vecs = {};
  const todo = [];
  for (const e of entries) (kept[e.id] ? (vecs[e.id] = kept[e.id]) : todo.push(e));
  let embedded = 0;
  let failed = 0;
  if (todo.length) {
    const embed = await load(model, { fetchImpl });
    const started = Date.now();
    for (const e of todo.slice(0, max)) {
      if (Date.now() - started > budgetMs) break; // the rest waits for tomorrow's run
      try {
        const v = await embed(thumbUrl(e.image));
        if (Array.isArray(v) && v.length) { vecs[e.id] = packVector(v); embedded++; }
      } catch { failed++; }
    }
  }
  // Keep yesterday's vectors of listings still in the pool, so a listing that slows and speeds up again is not re-read.
  const keep = poolIds ? Object.fromEntries(Object.entries(kept).filter(([id]) => poolIds.has(id))) : {};
  const all = { ...keep, ...vecs };
  const vectors = Object.fromEntries(Object.entries(vecs).map(([id, s]) => [id, unpackVector(s)]));
  return { vectors, cache: { model, vecs: all }, embedded, failed };
}
