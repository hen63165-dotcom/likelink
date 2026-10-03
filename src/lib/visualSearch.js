// LikeLink visual search — LikeLink-native, in the buyer's browser, no AI
// provider and no upload: the buyer's photo never leaves the device.
//
// A photo is reduced to a signature: a 64-bit difference hash (shape/layout) and
// a 4×4×4 colour histogram (palette). Catalog product photos (loaded through the
// same-origin image proxy /api/og?mode=image) get the same signature, and the
// closest ones are returned. This finds the SAME photo or a visually SIMILAR
// one; it does not "recognise" a product, a brand or a category. Results are
// therefore labelled honestly:
//   very close hash  → "נראה כמו אותה תמונה" (likely the same product photo)
//   otherwise        → "התאמה דומה" (similar look) — never "exact product".
// The pure functions below are tested in tests/visualSearch.test.mjs.

export const SIG_SIZE = 9; // 9×8 grid for the difference hash
export const CLOSE_HASH_DISTANCE = 10; // of 64 bits
export const MIN_SIMILARITY = 0.55;

/** Grayscale 9×8 → 64-bit difference hash (array of 0/1). `gray` is length 72, row-major. */
export function dHash(gray) {
  const bits = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1 : 0);
  return bits;
}

/** RGBA pixels → normalised 64-bin colour histogram (4 levels per channel), ignoring near-white background. */
export function colorHistogram(rgba) {
  const h = new Array(64).fill(0);
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
    if (a < 128 || (r > 238 && g > 238 && b > 238)) continue; // transparent / studio-white backdrop
    h[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)] += 1;
    n += 1;
  }
  return n ? h.map((v) => v / n) : h;
}

export function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d += 1;
  return d;
}

/** Histogram intersection, 0..1. */
export function histogramSimilarity(a, b) {
  let s = 0;
  for (let i = 0; i < 64; i++) s += Math.min(a[i], b[i]);
  return s;
}

/** Compare two signatures → { similarity 0..1, hashDistance, label }. */
export function compareSignatures(q, c) {
  const hashDistance = hamming(q.hash, c.hash);
  const color = histogramSimilarity(q.hist, c.hist);
  const shape = 1 - hashDistance / 64;
  const similarity = 0.55 * color + 0.45 * shape;
  return { similarity, hashDistance, label: hashDistance <= CLOSE_HASH_DISTANCE ? "same_photo" : "similar" };
}

export const MATCH_LABELS = Object.freeze({
  same_photo: { he: "נראה כמו אותה תמונה", en: "Looks like the same photo" },
  similar: { he: "התאמה דומה", en: "Similar match" },
});

/* ------------------------------------------------------------- browser */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Signature of an <img> (browser only). */
export function signatureOf(img) {
  const c = document.createElement("canvas");
  const x = c.getContext("2d", { willReadFrequently: true });
  c.width = 32; c.height = 32;
  x.drawImage(img, 0, 0, 32, 32);
  const hist = colorHistogram(x.getImageData(0, 0, 32, 32).data);
  c.width = SIG_SIZE; c.height = 8;
  x.drawImage(img, 0, 0, SIG_SIZE, 8);
  const d = x.getImageData(0, 0, SIG_SIZE, 8).data;
  const gray = [];
  for (let i = 0; i < d.length; i += 4) gray.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  return { hash: dHash(gray), hist };
}

const cache = new Map();
const proxied = (url) => (/^https?:\/\//i.test(url) && !url.startsWith(window.location.origin) ? `/api/og?mode=image&u=${encodeURIComponent(url)}` : url);

/** Signature of the buyer's file (stays on the device). */
export async function fileSignature(file) {
  const url = URL.createObjectURL(file);
  try { return signatureOf(await loadImage(url)); } finally { URL.revokeObjectURL(url); }
}

/**
 * Rank catalog products by visual similarity to `query` (a signature).
 * @param products  public graph products (media.image)
 * @returns [{ product, similarity, label }] above MIN_SIMILARITY, best first
 */
export async function visualMatches(query, products, { limit = 12, concurrency = 6 } = {}) {
  const list = (products || []).filter((p) => p?.media?.image);
  const out = [];
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const p = list[i++];
      const key = p.media.image;
      try {
        if (!cache.has(key)) cache.set(key, signatureOf(await loadImage(proxied(key))));
        const m = compareSignatures(query, cache.get(key));
        if (m.similarity >= MIN_SIMILARITY) out.push({ product: p, ...m });
      } catch { /* an image that cannot load is simply not compared */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return out.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}
