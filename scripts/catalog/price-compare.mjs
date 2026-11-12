// Did the price really drop? The store's own ILS "from" price for every product the site lists, as the
// daily catalog sync recorded it (public/snapshot/kv.json in git history), on two dates: before a sale
// and during it. Only products with a store price on both dates count; a product missing on either is
// listed as such, never guessed. Prints the counts and the biggest moves both ways; writes JSON.
//
//   node scripts/catalog/price-compare.mjs <before-ref> <after-ref> [out.json]
//   e.g. node scripts/catalog/price-compare.mjs 9973611 origin/main marketing/1111/compare.json
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const FILE = "public/snapshot/kv.json";

export function productsAt(json) {
  const d = typeof json === "string" ? JSON.parse(json) : json;
  const raw = d?.keys?.["marketplace:products"];
  const list = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(list) ? list : [];
}

const storePrice = (p) => (p && p.priceSource === "aliexpress_api" && Number(p.price) > 0 ? Math.round(Number(p.price) * 100) / 100 : null);

/** Pure: the comparison of two catalog copies. */
export function comparePrices(before = [], after = []) {
  const was = new Map(before.map((p) => [p.id, p]));
  const rows = [];
  const missing = [];
  for (const p of after) {
    const b = was.get(p.id);
    const a0 = storePrice(b), a1 = storePrice(p);
    if (a0 === null || a1 === null) { missing.push({ id: p.id, title: p.title, why: a0 === null ? "no_price_before" : "no_price_after" }); continue; }
    const diff = Math.round((a1 - a0) * 100) / 100;
    rows.push({ id: p.id, title: p.title, before: a0, beforeAt: b.priceCheckedAt || null, after: a1, afterAt: p.priceCheckedAt || null, diff, pct: Math.round((diff / a0) * 1000) / 10 });
  }
  const down = rows.filter((r) => r.diff < 0).sort((x, y) => x.pct - y.pct);
  const up = rows.filter((r) => r.diff > 0).sort((x, y) => y.pct - x.pct);
  const same = rows.filter((r) => r.diff === 0);
  return { counted: rows.length, down, up, same, missing };
}

const at = (ref) => execFileSync("git", ["show", `${ref}:${FILE}`], { maxBuffer: 64 * 1024 * 1024 }).toString();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [beforeRef, afterRef = "HEAD", out] = process.argv.slice(2);
  if (!beforeRef) { console.error("usage: price-compare.mjs <before-ref> <after-ref> [out.json]"); process.exit(2); }
  const r = comparePrices(productsAt(at(beforeRef)), productsAt(at(afterRef)));
  console.log(`counted ${r.counted} · down ${r.down.length} · up ${r.up.length} · same ${r.same.length} · missing ${r.missing.length}`);
  for (const [name, list] of [["down", r.down], ["up", r.up]]) {
    console.log(`-- ${name} (biggest first)`);
    for (const x of list.slice(0, 10)) console.log(`${x.id} ₪${x.before} → ₪${x.after} (${x.pct > 0 ? "+" : ""}${x.pct}%) · ${String(x.title || "").slice(0, 50)}`);
  }
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ beforeRef, afterRef, ...r }, null, 2)); }
}
