#!/usr/bin/env node
// The store photos of every listed product, for choosing pictures by eye
// (the owner, 2026-11-05: "add more products from Ali" to the 11.11 post).
// The session that picks them has no route to the store's image CDN, so the
// runner downloads them: the product's own `image` and the first gallery
// images, store CDN only (the same rule as catalogPrices.js), written to OUT
// as <id>/<n>.<ext> plus index.json (id, title, kind, the photo files).
// Read-only: the catalog is the public anon read (live-catalog.mjs), filtered
// by buildPublicGraph like the site; nothing is written to the cloud and no
// store page or affiliate link is opened (an image request counts no click).
//   OUT=dir [PER=3] node scripts/catalog/photos.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./live-catalog.mjs";
import { listedFromSnapshot } from "../prerender-products.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const STORE_IMAGE = /^https:\/\/([a-z0-9-]+\.)*(aliexpress-media\.com|alicdn\.com)\/[^\s"'<>]+$/i;

/** The store photos to fetch for one product: its image first, then the gallery, de-duplicated, store CDN only. */
export function photoUrls(product, per = 3) {
  const all = [product?.image, ...(Array.isArray(product?.images) ? product.images : [])]
    .map((u) => String(u || "").trim()).filter((u) => STORE_IMAGE.test(u));
  return [...new Set(all)].slice(0, per);
}

async function main() {
  const out = process.env.OUT || "photos";
  const per = Math.max(1, Math.min(6, Number(process.env.PER) || 3));
  const copy = JSON.parse(readFileSync(join(ROOT, "public/snapshot/kv.json"), "utf8"));
  const built = await buildCatalog(copy);
  const { products } = listedFromSnapshot(built.doc);
  const index = [];
  for (const { product } of products) {
    const files = [];
    for (const [n, url] of photoUrls(product, per).entries()) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const type = res.headers.get("content-type") || "";
        if (!res.ok || !type.startsWith("image/")) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 4096) continue;
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        mkdirSync(join(out, product.id), { recursive: true });
        writeFileSync(join(out, product.id, `${n}.${ext}`), buf);
        files.push({ file: `${product.id}/${n}.${ext}`, url });
      } catch { /* a photo that does not answer is skipped */ }
    }
    index.push({ id: product.id, title: product.displayTitle || product.title, kind: product.kind || null, files });
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.json"), JSON.stringify({ live: built.live, products: index }, null, 1));
  console.log(`photos: ${index.length} products, ${index.reduce((s, p) => s + p.files.length, 0)} photos (live catalog: ${built.live})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
