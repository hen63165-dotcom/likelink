// Generates the static public pages from their single sources of truth:
//   public/pricing.html      ← src/lib/plans.js (+ billing/cancellation.js)
//   public/legal/*.html      ← src/lib/legal/documents.js   (when present)
//   public/legal.html        ← the legal pack index
// Run: npm run pages:build. tests/plansConsistency.test.mjs and
// tests/legalPack.test.mjs fail when a committed page is stale.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderAllStaticPages } from "../src/lib/staticPages/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = await renderAllStaticPages();
for (const [rel, html] of Object.entries(pages)) {
  const out = path.join(ROOT, "public", rel);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");
  console.log("wrote", path.join("public", rel));
}
