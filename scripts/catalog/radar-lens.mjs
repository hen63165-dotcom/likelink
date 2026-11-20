// The lens's labels (src/lib/growth/lens.js): one text vector per kind the radar measures, made with
// MobileCLIP-S0's text model on a runner (transformers.js, no key) and written as labels.json for the
// site (public/lens/labels.json). Then a check that the browser half works: the vision model reads a
// few real store photos of known kinds and the top answers are printed with the model file's size.
//   node scripts/catalog/radar-lens.mjs <out dir>
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TREND_CATEGORIES } from "../../src/lib/growth/trendBoard.js";
import { LENS, lensLabels, rankKinds } from "../../src/lib/growth/lens.js";

const out = process.argv[2] || "lens-out";
mkdirSync(out, { recursive: true });
const { concepts = [] } = JSON.parse(readFileSync("scripts/catalog/radar-concepts.json", "utf8"));
const labels = lensLabels(concepts, TREND_CATEGORIES);
const { AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } = await import("@huggingface/transformers");
env.allowLocalModels = false;

const pack = (v) => {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  const b = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) b[i] = Math.max(-127, Math.min(127, Math.round((v[i] / n) * 127)));
  return Buffer.from(b.buffer).toString("base64");
};

const tokenizer = await AutoTokenizer.from_pretrained(LENS.model);
const textModel = await CLIPTextModelWithProjection.from_pretrained(LENS.model, { dtype: LENS.textDtype });
const rows = [];
for (let i = 0; i < labels.length; i += 32) {
  const part = labels.slice(i, i + 32);
  const inputs = tokenizer(part.map((l) => l.prompt), { padding: "max_length", truncation: true });
  const { text_embeds } = await textModel(inputs);
  const vecs = text_embeds.normalize().tolist();
  part.forEach((l, k) => rows.push({ id: l.id, he: l.he, en: l.en, v: pack(vecs[k]) }));
}
const doc = { model: LENS.model, dims: rows[0] ? Buffer.from(rows[0].v, "base64").length : 0, at: new Date().toISOString().slice(0, 10), labels: rows };
writeFileSync(join(out, "labels.json"), JSON.stringify(doc));
console.log(`labels: ${rows.length} kinds · ${doc.dims} dims · ${Math.round(JSON.stringify(doc).length / 1024)} KB`);

// The browser half, checked here on real store photos of known kinds (from the catalog copy), for each
// vision precision asked (LENS_DTYPES, default the one the site uses): the answers and the file's size.
const processor = await AutoProcessor.from_pretrained(LENS.model);
const kv = JSON.parse(readFileSync("public/snapshot/kv.json", "utf8"));
const samples = (kv.keys["marketplace:products"] || []).filter((p) => /^https:\/\//.test(String(p.image || ""))).slice(0, 16);
const images = [];
for (const p of samples) { try { images.push({ p, image: await RawImage.read(p.image) }); } catch (e) { console.log(`${p.id}: ${String(e?.message || e).slice(0, 80)}`); } }
let ok = 0;
for (const dtype of String(process.env.LENS_DTYPES || LENS.visionDtype).split(",")) {
  const vision = await CLIPVisionModelWithProjection.from_pretrained(LENS.model, { dtype });
  console.log(`--- vision ${dtype}`);
  for (const { p, image } of images) {
    const { image_embeds } = await vision(await processor(image));
    const r = rankKinds(image_embeds.normalize().tolist()[0], rows);
    ok++;
    console.log(`${dtype} ${p.id} [${p.kind || p.category || "?"}] ${String(p.title || "").slice(0, 40)} → ${r.verdict} ${r.kinds.map((k) => `${k.id} ${Math.round(k.p * 100)}%`).join(", ")}`);
  }
}
const files = [];
const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) (f.isDirectory() ? walk(join(d, f.name)) : files.push(join(d, f.name))); };
try { walk(env.cacheDir); } catch { /* no cache dir */ }
for (const f of files.filter((f) => /\.onnx$/.test(f))) console.log(`model file ${f.replace(env.cacheDir, "")}: ${(statSync(f).size / 1e6).toFixed(1)} MB`);
console.log(`vision check: ${ok} answers on ${images.length} photos`);
