// The deals the rules would pick today, per category, as contact sheets for a
// person to look at before the first import (src/lib/growth/deals.js).
//   node scripts/catalog/deals-probe.mjs <dir>
// → <dir>/candidates.json (id, category, short title, ILS price, image) and
//   <dir>/<category>-<n>.jpg (the photos; scripts/catalog/deals-sheet.py puts
//   them on one numbered sheet per category). Prints no credential.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aeCall, aeEnv, aeStatus } from "../../api/_utils/aliexpressAffiliate.mjs";
import { productsOf } from "./trend-finder.mjs";
import { DEAL_CATEGORIES, dealTitle, rankDeals } from "../../src/lib/growth/deals.js";

const dir = process.argv[2] || "deals-preview";
const env = aeEnv(process.env);
if (!aeStatus(env).configured) { console.log("REQUIRES_CONNECTION"); process.exit(0); }
mkdirSync(dir, { recursive: true });
const method = "aliexpress.affiliate.product.query";
const all = [];
for (const c of DEAL_CATEGORIES) {
  let list = [];
  try {
    list = productsOf(await aeCall(method, {
      keywords: c.keywords, tracking_id: env.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE",
      ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC",
    }, { env }), method);
  } catch (e) {
    console.log(`${c.key}: ${String(e?.message || e).slice(0, 120)}`);
    continue;
  }
  const picks = rankDeals(list, c).slice(0, 8);
  console.log(`${c.key}: ${list.length} read, ${rankDeals(list, c).length} pass the rules`);
  picks.forEach((x, i) => {
    const img = String(x.product_main_image_url || "").replace(/^\/\//, "https://");
    const file = join(dir, `${c.key}-${i + 1}.jpg`);
    try {
      execFileSync("curl", ["-sSL", "--max-time", "20", "-o", file, img]);
    } catch { /* a photo that does not download is left out */ }
    all.push({ n: i + 1, category: c.key, id: String(x.product_id), title: dealTitle(x, c), price: Number(x.target_sale_price), was: Number(x.target_original_price) || null, image: img, file: `${c.key}-${i + 1}.jpg`, storeTitle: String(x.product_title || "").slice(0, 120) });
  });
}
writeFileSync(join(dir, "candidates.json"), JSON.stringify(all, null, 1));
console.log(JSON.stringify(all.map(({ image, storeTitle, ...r }) => r)));
