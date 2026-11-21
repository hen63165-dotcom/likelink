// ⬇️ From the radar's find to a Wix store in one file (the owner, 2026-11-20: "go around Modalyst and
// everyone"). Modalyst (Wix's own supplier marketplace, bought 2021) imports products from its vetted
// suppliers; the radar decides WHICH product and WHEN, so it hands a Wix merchant its finds in Wix's
// own import format: Store Products → More Actions → Import → upload (support.wix.com, "Wix Stores:
// Importing Products to Wix Stores", updated 2026-02-09). No Wix permission, no app install.
//
// Rules of the file, from Wix's own table: every product row needs handleId, fieldType "Product",
// name (≤ 80), price; images are URLs separated by ";" (≤ 15); the columns are Wix's, in Wix's order,
// none added or removed. What we put in it, and why:
//   - visible FALSE: every product is imported hidden, so nothing goes live before the merchant
//     checks it (and orders a sample if she wants).
//   - cost = the store's own ILS "from" price, read that day; price = cost × her markup, rounded
//     up to a whole shekel. Wix shows the numbers in the store's own currency, so the page says so.
//   - name/description = the seller's own words (the store's title); images = the seller's photos.
//   - sku AE-<item id>, so every product can be traced back to the item the radar measured.
// Pure: the page builds the file in the browser from the sanitized board.

export const WIX_COLUMNS = Object.freeze([
  "handleId", "fieldType", "name", "description", "productImageUrl", "collection", "sku", "ribbon", "price", "surcharge",
  "visible", "discountMode", "discountValue", "inventory", "weight", "cost",
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => [`productOptionName${i}`, `productOptionType${i}`, `productOptionDescription${i}`]),
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => [`additionalInfoTitle${i}`, `additionalInfoDescription${i}`]),
  ...[1, 2].flatMap((i) => [`customTextField${i}`, `customTextCharLimit${i}`, `customTextMandatory${i}`]),
]);

export const EXPORT = Object.freeze({ markup: 2, minMarkup: 1, maxMarkup: 10, collection: "Trend Radar", nameMax: 80, descMax: 8000, maxRows: 200 });

const ITEM = /^\d{6,20}$/;
const IMG = /^https:\/\/[a-z0-9.-]*(alicdn\.com|aliexpress-media\.com|aliexpress\.com)\//i;

/** One CSV cell: quoted when it holds a comma, quote or line break; quotes doubled. */
export function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A find the file can carry: a real item id, a title, a store price in shekels. */
export function exportable(f) {
  return Boolean(f && ITEM.test(String(f.id || "")) && String(f.title || "").trim() && Number.isFinite(f.price) && f.price > 0);
}

/** One Wix product row (an object keyed by WIX_COLUMNS) from a radar find. */
export function wixRow(f, { markup = EXPORT.markup, rules = EXPORT } = {}) {
  const m = Math.min(rules.maxMarkup, Math.max(rules.minMarkup, Number(markup) || rules.markup));
  const title = String(f.title).replace(/\s+/g, " ").trim();
  const images = [f.image, ...(Array.isArray(f.images) ? f.images : [])].filter((u) => typeof u === "string" && IMG.test(u));
  const row = Object.fromEntries(WIX_COLUMNS.map((c) => [c, ""]));
  Object.assign(row, {
    handleId: `radar-${f.id}`,
    fieldType: "Product",
    name: title.slice(0, rules.nameMax),
    description: title.slice(0, rules.descMax),
    productImageUrl: [...new Set(images)].slice(0, 15).join(";"),
    collection: rules.collection,
    sku: `AE-${f.id}`.slice(0, 40),
    price: Math.ceil(f.price * m),
    visible: "FALSE",
    cost: Math.round(f.price * 100) / 100,
  });
  return row;
}

/** The whole file: Wix's header, then one product per exportable find (no duplicates). */
export function wixCsv(finds = [], { markup = EXPORT.markup, rules = EXPORT } = {}) {
  const seen = new Set();
  const rows = (Array.isArray(finds) ? finds : []).filter(exportable).filter((f) => !seen.has(f.id) && seen.add(f.id)).slice(0, rules.maxRows).map((f) => wixRow(f, { markup, rules }));
  const lines = [WIX_COLUMNS.join(","), ...rows.map((r) => WIX_COLUMNS.map((c) => csvCell(r[c])).join(","))];
  return { csv: `${lines.join("\r\n")}\r\n`, count: rows.length };
}
