// The trend board and its "add to the site" step (src/lib/growth/trendBoard.js).
//
//   node scripts/catalog/trend-finder.mjs dist
//       Every morning (deploy-frontend.yml): AliExpress's hot products per
//       category, shipped to Israel, in ILS, with the owner's own tracked link
//       → dist/trend-board/index.json + a page at /likelink/trend-board/
//       (noindex; /trends is the public site's own page) where the owner sees
//       them by category, with Google Trends Israel matches.
//
//   node scripts/catalog/trend-finder.mjs --add "1005001234567890, ..."
//       The "Add trend products" workflow: re-reads exactly those items from
//       the API (productdetail.get) and adds them to the catalog copy
//       (public/snapshot/kv.json) as the owner's products, with the store's
//       price, gallery and the seller's own video. Nothing else is added.
//
// Without the ALIEXPRESS_* secrets it writes a page that says so and adds nothing.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { aeCall, aeEnv, aeStatus, toProduct } from "../../api/_utils/aliexpressAffiliate.mjs";
import { aliItemId, applyFacts, resolveFromLink, storeFacts } from "./sync-aliexpress.mjs";
import { readTrends } from "../marketing/daily-drop.mjs";
import { PER_CATEGORY, TREND_CATEGORIES, buildBoard, parseItems } from "../../src/lib/growth/trendBoard.js";
import { DEAL_RULES, dealCategory, guessCategory, rankDeals, toDealProduct } from "../../src/lib/growth/deals.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SNAPSHOT = join(ROOT, "public/snapshot/kv.json");
export const BOARD_DIR = "trend-board";
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// The global AliExpress id of a catalog product (aliexpress.us ids normalised), so an item is never added twice.
const AE_ITEM_ID = (p) => aliItemId(p) || String(p?.id || "").replace(/^ae-/, "");

const HOT = "aliexpress.affiliate.hotproduct.query";
const SEARCH = "aliexpress.affiliate.product.query";

/** The products of one API answer; a provider error inside an HTTP 200 (resp_code ≠ 200) is an error, never an empty list. */
export function productsOf(res, method) {
  const r = res?.[`${method.replace(/\./g, "_")}_response`]?.resp_result;
  if (!r) throw new Error(`aliexpress_no_result:${method}`);
  if (Number(r.resp_code) !== 200) throw new Error(`aliexpress_resp_${r.resp_code}:${String(r.resp_msg || "").slice(0, 80)}`);
  return r.result?.products?.product || [];
}

/** AliExpress's hot products for one category; the plain search sorted by recent sales when the hot list is thin. */
async function hotFor(category, env, now, fetchImpl) {
  const biz = {
    keywords: category.keywords, tracking_id: env.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE",
    ship_to_country: "IL", page_size: "50", sort: "LAST_VOLUME_DESC",
  };
  let list = [];
  let error = null;
  try {
    list = productsOf(await aeCall(HOT, biz, { env, now, fetchImpl }), HOT);
  } catch (e) {
    error = e;
  }
  if (list.length < PER_CATEGORY / 2) {
    try {
      list = list.concat(productsOf(await aeCall(SEARCH, biz, { env, now, fetchImpl }), SEARCH));
    } catch (e) {
      error = error || e;
    }
  }
  // Nothing read and a call failed: the category failed, it is not an empty day.
  if (!list.length && error) throw error;
  return list;
}

/**
 * The board. `budgetMs` bounds the whole run (14 categories × up to 2 calls ×
 * 15 s would otherwise outlast the deploy step): categories left when it runs
 * out are reported, never guessed.
 */
export async function findTrends({ env: rawEnv = process.env, now = Date.now(), trends = null, fetchImpl = globalThis.fetch, snapshot = SNAPSHOT, budgetMs = 150_000 } = {}) {
  const env = aeEnv(rawEnv);
  const st = aeStatus(env);
  const doc = JSON.parse(readFileSync(snapshot, "utf8"));
  const listed = (doc.keys["marketplace:products"] || []).map(AE_ITEM_ID);
  if (!st.configured) return { outcome: "REQUIRES_CONNECTION", missing: st.missing, board: buildBoard({ now, listed }) };
  const results = {};
  const errors = [];
  const started = Date.now();
  for (const c of TREND_CATEGORIES) {
    if (Date.now() - started >= budgetMs) {
      errors.push({ category: c.key, error: "time_budget" });
      continue;
    }
    try {
      // The deals rules (src/lib/growth/deals.js): cheap for the category, 95%+ rated, 300+ orders, no brand names.
      results[c.key] = rankDeals(await hotFor(c, env, now, fetchImpl), dealCategory(c.key));
    } catch (e) {
      errors.push({ category: c.key, error: String(e?.message || e).slice(0, 120) });
    }
  }
  const board = buildBoard({ results, trends: trends ?? (await readTrends()), listed, now });
  const items = board.categories.reduce((n, c) => n + c.items.length, 0);
  // Not one usable item in 14 categories is a provider problem, not a quiet day: keep yesterday's board.
  const outcome = errors.length === TREND_CATEGORIES.length ? "FAILED" : items === 0 ? "EMPTY" : "OK";
  return { outcome, errors, board };
}

function card(item) {
  return `<li class="it">
<img src="${esc(item.image)}" alt="" loading="lazy">
<div class="b"><p class="t">${esc(item.title)}</p>
<p class="p">₪${item.price}${item.originalPrice ? ` <s>₪${item.originalPrice}</s>` : ""} <span class="m">מחיר בחנות, ${esc(item.checkedAt.slice(0, 10))}</span></p>
<p class="m">${item.video ? "יש סרטון של המוכר · " : ""}${item.onSite ? "<b>כבר באתר</b>" : `מספר מוצר: <code dir="ltr">${esc(item.id)}</code> <button class="copy" data-copy="${esc(item.id)}">העתקה</button>`}</p>
<p class="m"><a href="${esc(item.itemUrl)}" target="_blank" rel="noopener">לעמוד המוצר ב-AliExpress</a></p></div></li>`;
}

export function trendsPage(board, { outcome = "OK", missing = [] } = {}) {
  const cats = board.categories.filter((c) => c.items.length);
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>טרנדים מ-AliExpress · LikeLink2</title>
<style>
:root{--bg:#fff;--card:#fff;--sky:#eaf2fb;--ink:#0b0b0c;--mute:#5d5866;--line:#e3e6ec}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--card:#12171e;--sky:#0f1924;--ink:#f3f2f8;--mute:#a7a3b3;--line:#232a33}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,"Heebo","Noto Sans Hebrew",sans-serif}
header{background:var(--sky);padding:28px 16px 22px}header>div,main{max-width:980px;margin:0 auto}main{padding:4px 16px 60px}
h1{font-size:30px;line-height:1.15;margin:6px 0}h2{font-size:21px;margin:22px 0 8px}.note,.m{color:var(--mute);font-size:14px;margin:4px 0}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}nav a{border:1px solid var(--line);border-radius:999px;padding:4px 12px;text-decoration:none;color:inherit;font-size:14px}
ul.g{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.it{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--card)}.it img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.b{padding:10px}.t{margin:0 0 6px;font-size:14.5px;line-height:1.4}.p{margin:0;font-weight:800}.p s{color:var(--mute);font-weight:400}
.hot{display:inline-block;background:#0b0b0c;color:#fff;border-radius:999px;padding:2px 10px;font-size:13px;margin-inline-start:6px}
.copy{background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:2px 10px;font:inherit;font-size:12px;cursor:pointer}
.card{border:1px solid var(--line);border-radius:18px;padding:16px;margin:16px 0}a{color:inherit}
</style></head><body>
<header><div><p class="note">LikeLink2 · ${esc(board.generatedAt.slice(0, 10))}</p><h1>הטרנדים של היום מ-AliExpress</h1>
<p class="note">המוצרים החמים של AliExpress היום, עם משלוח לישראל ומחיר בשקלים, לפי קטגוריות. קטגוריה שמחפשים בגוגל בישראל היום מסומנת ועולה לראש. שום מוצר לא עולה לאתר לפני שאת בוחרת אותו.</p>
<p class="note">מוצגים רק מציאות: מחיר זול לקטגוריה, דירוג חיובי של ${DEAL_RULES.minPositivePct}% ומעלה ו־${DEAL_RULES.minOrders}+ הזמנות לפי AliExpress (המספרים משמשים רק לבחירה ולא מוצגים באתר), ובלי מוצרים שנקראים על שם מותג.</p>
<nav>${cats.map((c) => `<a href="#${esc(c.key)}">${esc(c.he)}</a>`).join("")}</nav>
<p class="note"><a href="../drop/">לדרופ היומי</a> · <a href="../tiktok/">לעמוד הטיקטוק</a></p></div></header>
<main>
${outcome === "REQUIRES_CONNECTION" ? `<p class="card">החיבור ל-AliExpress עוד לא מוגדר (חסר: ${esc(missing.join(", "))}).</p>` : ""}
${outcome === "FAILED" || outcome === "EMPTY" ? `<p class="card">הפעם לא הצלחנו לקרוא מוצרים מ-AliExpress. הלוח יתעדכן בפריסה הבאה.</p>` : ""}
<section class="card"><h2>איך מעלים מוצר לאתר</h2><ol>
<li>מעתיקים את מספרי המוצרים שבחרת (כפתור "העתקה").</li>
<li>ב-GitHub: Actions ← <b>Add trend products</b> ← Run workflow ← מדביקים את המספרים, מופרדים בפסיק (עד 10) ← Run.</li>
<li>אפשר להדביק שם גם קישור שותפים שלך (s.click.aliexpress.com) או קישור לעמוד מוצר ב-AliExpress, ולא רק מספרים. קישור שלך נשמר באתר בדיוק כמו שהדבקת.</li>
<li>המוצרים נקראים שוב מ-AliExpress (מחיר, תמונות, סרטון המוכר והקישור שלך) ועולים לאתר החי (likelink2.vercel.app) תוך כמה דקות, עם שם קצר ונקי ובקטגוריה הנכונה.</li>
</ol></section>
${cats.map((c) => `<h2 id="${esc(c.key)}">${esc(c.he)}${dealCategory(c.key)?.maxPrice ? ` <span class="m">עד ₪${dealCategory(c.key).maxPrice}</span>` : ""}${c.searchedToday.length ? `<span class="hot">מחפשים היום בגוגל: ${esc(c.searchedToday[0].term)}</span>` : ""}</h2>
<ul class="g">${c.items.map(card).join("")}</ul>`).join("\n")}
${cats.length || outcome !== "OK" ? "" : `<p class="card">היום AliExpress לא החזירה מוצרים מתאימים.</p>`}
<p class="note">${esc(board.note)}</p>
</main>
<script>document.addEventListener("click",(e)=>{const b=e.target.closest("[data-copy]");if(!b)return;navigator.clipboard?.writeText(b.dataset.copy);b.textContent="הועתק";});</script>
</body></html>
`;
}

/**
 * Add exactly these items to the catalog copy, re-read from the API.
 * `items`: item numbers, or { id } / { link } from parseItems. A link is the
 * owner's own tracked link: it is resolved to its store item with one request
 * (not followed further) and kept as the product's buy link, exactly as pasted.
 */
export async function addItems(items, { env: rawEnv = process.env, now = Date.now(), write = true, fetchImpl = globalThis.fetch, snapshot = SNAPSHOT } = {}) {
  const env = aeEnv(rawEnv);
  const st = aeStatus(env);
  if (!st.configured) return { outcome: "REQUIRES_CONNECTION", missing: st.missing };
  if (!items.length) return { outcome: "FAILED", error: "no item numbers or links" };
  const doc = JSON.parse(readFileSync(snapshot, "utf8"));
  const list = doc.keys["marketplace:products"] || [];
  const owner = (doc.keys["marketplace:marketers"] || [])[0]?.id;
  if (!owner) return { outcome: "FAILED", error: "no creator in the catalog copy" };
  const report = [];
  const entries = [];
  for (const it of items.map((x) => (typeof x === "string" ? { id: x } : x))) {
    const raw = it.id || (it.link ? await resolveFromLink(it.link, fetchImpl) : "");
    if (!raw) { report.push({ input: it.link || it.id, status: "LINK_NOT_RESOLVED" }); continue; }
    // aliexpress.us ids are the global id + 2^51 (aliItemId).
    entries.push({ id: aliItemId({ aliexpressId: raw }) || raw, link: it.link || "", category: it.category || "" });
  }
  const ids = [...new Set(entries.map((e) => e.id))];
  let found = new Map();
  if (ids.length) {
    const json = await aeCall("aliexpress.affiliate.productdetail.get", {
      product_ids: ids.join(","), target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: env.ALIEXPRESS_TRACKING_ID,
    }, { env, now, fetchImpl });
    const result = json?.aliexpress_affiliate_productdetail_get_response?.resp_result;
    // No envelope at all is a provider failure; a 200 with an empty list is a real "not returned".
    if (!result) return { outcome: "PROVIDER_ERROR", message: "aliexpress_no_result:aliexpress.affiliate.productdetail.get" };
    if (Number(result.resp_code) !== 200) return { outcome: "PROVIDER_ERROR", code: result.resp_code, message: String(result.resp_msg || "").slice(0, 120) };
    found = new Map((result.result?.products?.product || []).map((x) => [String(x.product_id), x]));
  }
  const haveIds = new Set(list.map(AE_ITEM_ID));
  const haveLinks = new Set(list.map((p) => p.affiliateUrl));
  const added = [];
  for (const { id, link, category } of entries) {
    const x = found.get(id);
    if (haveIds.has(id)) { report.push({ id, status: "ALREADY_ON_SITE" }); continue; }
    // The same product the cloud gets (src/lib/growth/deals.js: short title, kind, store facts) when its category is known.
    const cat = x ? dealCategory(category) || guessCategory(x) : null;
    const dealt = cat ? toDealProduct(x, { category: cat, marketerId: owner, now, link }) : null;
    // With her own link the API's promotion_link is not needed (it may be missing or http://).
    const base = dealt || (x ? toProduct(link ? { ...x, promotion_link: link } : x, { marketerId: owner, now }) : null);
    const facts = x ? storeFacts(x, now) : null;
    if (!base || !facts) { report.push({ id, status: x ? "MISSING_REAL_FIELDS" : "NOT_RETURNED" }); continue; }
    const buyLink = link || base.affiliateUrl;
    if (haveLinks.has(buyLink)) { report.push({ id, status: "LINK_ALREADY_USED" }); continue; }
    // The commission rate is the owner's business, not a storefront fact.
    const { commission, ...fields } = dealt || applyFacts(base, facts, { now });
    const p = { ...fields, affiliateUrl: buyLink, aliexpressId: id, importSource: link ? "aliexpress-owner-link" : "aliexpress-trend-board" };
    added.push(p);
    haveIds.add(id);
    haveLinks.add(buyLink);
    report.push({ id, status: "ADDED", product: p.id, price: `₪${p.price}`, video: Boolean(p.videoUrl), link: link ? "owner" : "api" });
  }
  if (write && added.length) {
    doc.keys["marketplace:products"] = [...list, ...added];
    writeFileSync(snapshot, `${JSON.stringify(doc, null, 1)}\n`);
  }
  return { outcome: "OK", written: write && added.length > 0, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === "--add") {
    let r;
    try {
      r = await addItems(parseItems(process.env.TREND_IDS ?? args[1] ?? ""));
    } catch (e) {
      r = { outcome: "FAILED", error: String(e?.message || e).slice(0, 200) };
    }
    console.log(JSON.stringify(r, null, 1));
    if (r.outcome !== "OK") process.exitCode = 1;
  } else {
    const out = join(args[0] || "dist", BOARD_DIR);
    const r = await findTrends().catch((e) => ({ outcome: "FAILED", errors: [String(e?.message || e).slice(0, 200)], board: buildBoard() }));
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "index.json"), `${JSON.stringify({ outcome: r.outcome, ...r.board }, null, 1)}\n`);
    writeFileSync(join(out, "index.html"), trendsPage(r.board, r));
    const n = r.board.categories.reduce((s, c) => s + c.items.length, 0);
    console.log(`trends: ${r.outcome}, ${n} items in ${r.board.categories.filter((c) => c.items.length).length} categories${r.errors?.length ? `, errors: ${JSON.stringify(r.errors).slice(0, 300)}` : ""}`);
    // Not OK → the deploy step keeps the last published board (deploy-frontend.yml).
    if (r.outcome !== "OK") process.exitCode = 1;
  }
}
