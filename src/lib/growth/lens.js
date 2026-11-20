// The radar's lens, "Shazam for products" (the owner, 2026-11-20: "כן לשתיהן"): a shopper sees a product
// in a reel and gives the magic button a screenshot. An open AI model (MobileCLIP-S0, Apple's, through
// transformers.js) runs IN THE SHOPPER'S BROWSER: the picture is turned into a vector on her own phone
// and never leaves it. The vector is compared with one text vector per kind the radar measures (the
// watch list and the shop's categories, made once on a runner by scripts/catalog/radar-lens.mjs and
// shipped as public/lens/labels.json). The answer is the kinds it looks like, with how sure the model is;
// the radar's own measurements for that kind come from the board. What is recorded: the kind's id with
// the magic_check funnel step, once per kind per browser session — the crowd sensor counts how many
// different people photograph the same kind this week (crowdSensor.js crowdKinds). Pure here.

export const LENS = Object.freeze({
  model: "Xenova/mobileclip_s0",
  visionDtype: "q8",
  textDtype: "fp32",
  scale: 100, // CLIP's logit scale
  sure: 0.5, // the top kind's share of the model's belief to say "looks like"
  maybe: 0.2, // under this the answer is "unsure"
  labels: "/lens/labels.json",
  lib: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js",
});

const ID = /^[a-z0-9-]{3,48}$/;

/** The kinds the lens knows: every watch-list concept (store words + Hebrew name) and every shop category. */
export function lensLabels(concepts = [], categories = []) {
  const out = [];
  const seen = new Set();
  for (const c of Array.isArray(concepts) ? concepts : []) {
    const en = String(c?.en || "").trim();
    if (!ID.test(String(c?.id || "")) || !en || !c.he || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, he: String(c.he), en, prompt: `a photo of ${en}` });
  }
  for (const k of Array.isArray(categories) ? categories : []) {
    const id = `category-${k?.key}`;
    if (!ID.test(id) || !k.he || !k.keywords || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, he: String(k.he), en: String(k.keywords), prompt: `a photo of ${String(k.keywords).replace(/^women\s+/, "")}` });
  }
  return out;
}

export function unpackVec(s) {
  const bin = typeof atob === "function" ? atob(String(s || "")) : Buffer.from(String(s || ""), "base64").toString("binary");
  const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) { const b = bin.charCodeAt(i); out[i] = (b > 127 ? b - 256 : b) / 127; }
  return out;
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i]; return s; };
const unit = (v) => { const n = Math.sqrt(dot(v, v)) || 1; return v.map((x) => x / n); };

/**
 * The kinds a picture looks like: softmax over CLIP similarities (scale 100), strongest first.
 * `verdict`: SURE (top ≥ sure), MAYBE (top ≥ maybe), UNSURE otherwise — the page says which, never more.
 */
export function rankKinds(imageVec = [], labels = [], { rules = LENS, top = 3 } = {}) {
  const img = unit(Array.from(imageVec || []));
  const rows = (Array.isArray(labels) ? labels : []).filter((l) => ID.test(String(l?.id || "")) && (Array.isArray(l.vec) || typeof l.v === "string"))
    .map((l) => ({ id: l.id, he: l.he, en: l.en, logit: rules.scale * dot(img, unit(Array.isArray(l.vec) ? l.vec : unpackVec(l.v))) }));
  if (!rows.length || !img.length) return { verdict: "UNSURE", kinds: [] };
  const max = Math.max(...rows.map((r) => r.logit));
  const exps = rows.map((r) => Math.exp(r.logit - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const ranked = rows.map((r, i) => ({ id: r.id, he: r.he, en: r.en, p: Math.round((exps[i] / sum) * 1000) / 1000 })).sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : 1)).slice(0, top);
  const verdict = ranked[0].p >= rules.sure ? "SURE" : ranked[0].p >= rules.maybe ? "MAYBE" : "UNSURE";
  return { verdict, kinds: ranked };
}

/** True the first time this browser session reports this kind (then its id is sent once). */
export function firstKindThisSession(kind, store = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
  try {
    if (!store || !ID.test(String(kind || ""))) return false;
    const k = `ll_mk_${kind}`;
    if (store.getItem(k)) return false;
    store.setItem(k, "1");
    return true;
  } catch { return false; }
}
