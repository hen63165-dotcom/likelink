// The deals the rules would pick today, per category, as contact sheets for a
// person to look at before the first import (src/lib/growth/deals.js).
//   node scripts/catalog/deals-probe.mjs <dir>
// → <dir>/candidates.json (id, category, short title, ILS price, image) and
//   <dir>/<category>-<n>.jpg (the photos; scripts/catalog/deals-sheet.py puts
//   them on one numbered sheet per category). Prints no credential.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aeCall, aeEnv, aeStatus } from "../../api/_utils/aliexpressAffiliate.mjs";
import { productsOf } from "./trend-finder.mjs";
import { DEAL_CATEGORIES, DEAL_RULES, dealCheck, dealTitle, rankDeals } from "../../src/lib/growth/deals.js";

const dir = process.argv[2] || "deals-preview";
const env = aeEnv(process.env);
if (!aeStatus(env).configured) { console.log("REQUIRES_CONNECTION"); process.exit(0); }
mkdirSync(dir, { recursive: true });
const method = "aliexpress.affiliate.product.query";
const all = [];
// Looks mode (scripts/catalog/looks-probe.json lists watch-list ids): the radar's generic search for each
// look, through the same deal rules (95%, 300 orders, no brand name, no unlisted kind), so a person can
// check the photos for logos before any item is added. The owner, 2026-11-19: the hottest looks of the
// brands everyone wants, without the name.
const looksFile = "scripts/catalog/looks-probe.json";
const lookIds = existsSync(looksFile) ? (JSON.parse(readFileSync(looksFile, "utf8")).ids || []) : [];
const LOOKS = lookIds.length
  ? JSON.parse(readFileSync("scripts/catalog/radar-concepts.json", "utf8")).concepts
    .filter((c) => lookIds.includes(c.id))
    .map((c) => ({ key: c.id, keywords: c.en, maxPrice: 260, kind: c.kind === "makeup" ? "makeup" : "clothing", category: c.kind === "makeup" ? "Beauty" : "Fashion", noun: "" }))
  : null;
// Looks mode reads up to `pages` pages (50 items each): the logo-free items sit below the best sellers.
const LOOKS_CFG = LOOKS ? JSON.parse(readFileSync(looksFile, "utf8")) : {};
const PAGES = LOOKS ? Math.min(5, Math.max(1, Number(LOOKS_CFG.pages) || 1)) : 1;
// Clothing is rated lower everywhere in the store (19.11: 1,500 items read, 18 at 95%): looks mode may set
// its own floor (never under 90%, never under 300 orders), for the sheet a person checks by eye only.
// The site's daily import keeps DEAL_RULES.
const RULES = LOOKS
  ? { ...DEAL_RULES, minPositivePct: Math.max(90, Number(LOOKS_CFG.minPositivePct) || DEAL_RULES.minPositivePct), minOrders: Math.max(300, Number(LOOKS_CFG.minOrders) || DEAL_RULES.minOrders) }
  : DEAL_RULES;
if (LOOKS) console.log(`looks rules: ${RULES.minPositivePct}% and ${RULES.minOrders} orders`);
for (const c of LOOKS || DEAL_CATEGORIES) {
  let list = [];
  for (let page = 1; page <= PAGES; page++) {
    try {
      const got = productsOf(await aeCall(method, {
        keywords: c.keywords, tracking_id: env.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE",
        ship_to_country: "IL", page_size: "50", page_no: String(page), sort: "LAST_VOLUME_DESC",
      }, { env }), method);
      list = list.concat(got);
      if (got.length < 50) break;
    } catch (e) {
      console.log(`${c.key} p${page}: ${String(e?.message || e).slice(0, 120)}`);
      break;
    }
  }
  if (!list.length) continue;
  const passing = rankDeals(list, c, { rules: RULES });
  const picks = passing.slice(0, 8);
  const why = {};
  for (const x of list) { const r = dealCheck(x, c, RULES); if (!r.ok) why[r.reason] = (why[r.reason] || 0) + 1; }
  console.log(`${c.key}: ${list.length} read, ${passing.length} pass the rules; refused: ${JSON.stringify(why)}`);
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
