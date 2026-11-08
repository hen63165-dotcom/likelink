// Search AliExpress for one kind of item the owner saw working elsewhere (2026-11-08: an
// automatic ironing/drying mannequin) and lay the candidates out for a person to choose by eye.
// Read-only: it adds nothing to the site. The store's own numbers choose (FIND_RULES: rating,
// recent orders, both present; no brand name, no unlisted kind; an ILS price); they are printed
// in the run log for the choice only, never stored on a product or shown to anyone.
//
//   node scripts/catalog/ali-search.mjs <query.json> <out-dir>
//   query.json: { "name": "iron", "keywords": ["inflatable clothes dryer ironing", ...], "max": 12 }
//   env: ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET / ALIEXPRESS_TRACKING_ID (repository secrets)
// Output: <out>/<name>.json (id, title, ILS price, photos, video, store page) and <name>-sheet.jpg.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { aeCall, aeEnv } from "../../api/_utils/aliexpressAffiliate.mjs";
import { FIND_RULES } from "../../src/lib/growth/findOnAli.js";
import { hasBrandName, isNotListedKind } from "../../src/lib/growth/deals.js";

const SEARCH = "aliexpress.affiliate.product.query";
const pct = (v) => Number(String(v ?? "").replace("%", ""));

/** One store item → a candidate, or the reason it is left out (pure). */
export function candidate(x) {
  const title = String(x?.product_title || "").replace(/\s+/g, " ").trim();
  const id = String(x?.product_id || "");
  const price = String(x?.target_sale_price_currency || "") === "ILS" ? Number(x?.target_sale_price) : NaN;
  const rating = pct(x?.evaluate_rate), orders = Number(x?.lastest_volume);
  if (!/^\d{6,20}$/.test(id) || !title) return { ok: false, reason: "no_id" };
  if (!(price >= FIND_RULES.minPrice)) return { ok: false, reason: "no_ils_price" };
  if (!(rating >= FIND_RULES.minPositivePct) || !(orders >= FIND_RULES.minOrders)) return { ok: false, reason: "numbers" };
  if (hasBrandName(title)) return { ok: false, reason: "brand" };
  if (isNotListedKind(title)) return { ok: false, reason: "not_listed_kind" };
  const https = (v) => String(v || "").trim().replace(/^\/\//, "https://").replace(/^http:\/\//, "https://");
  const photos = [x.product_main_image_url, ...(Array.isArray(x.product_small_image_urls?.string) ? x.product_small_image_urls.string : [])]
    .map(https).filter((v, i, a) => /^https:\/\/\S+$/.test(v) && a.indexOf(v) === i).slice(0, 6);
  if (!photos.length) return { ok: false, reason: "no_photo" };
  return {
    ok: true,
    item: { id, title, price: Math.round(price * 100) / 100, photos, video: https(x.product_video_url) || null, page: `https://www.aliexpress.com/item/${id}.html` },
    choose: { rating, orders },
  };
}

export async function search(query, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const e = aeEnv(env);
  const seen = new Map();
  const log = [];
  for (const keywords of query.keywords || []) {
    for (const sort of ["LAST_VOLUME_DESC", "SALE_PRICE_ASC"]) {
      const biz = { keywords, tracking_id: e.ALIEXPRESS_TRACKING_ID, target_currency: "ILS", target_language: "HE", ship_to_country: "IL", page_size: "50", sort };
      try {
        const res = await aeCall(SEARCH, biz, { env: e, fetchImpl, now });
        const r = res?.aliexpress_affiliate_product_query_response?.resp_result;
        if (Number(r?.resp_code) !== 200) { log.push(`${keywords} [${sort}]: resp ${r?.resp_code} ${String(r?.resp_msg || "").slice(0, 60)}`); continue; }
        const list = r.result?.products?.product || [];
        let kept = 0;
        for (const x of list) {
          const c = candidate(x);
          if (c.ok && !seen.has(c.item.id)) { seen.set(c.item.id, c); kept += 1; }
          // Why the others were left out, for the person choosing (the numbers stay in this log).
          if (!c.ok && c.reason !== "no_id") log.push(`   – ${c.reason}: ${x.product_id} ₪${x.target_sale_price ?? "?"} ${x.target_sale_price_currency ?? ""} · orders ${x.lastest_volume ?? "?"} · ${x.evaluate_rate ?? "?"} · ${String(x.product_title || "").slice(0, 70)}`);
        }
        log.push(`${keywords} [${sort}]: ${list.length} read, ${kept} new candidates`);
      } catch (err) {
        log.push(`${keywords} [${sort}]: ${String(err?.message || err).slice(0, 100)}`);
      }
    }
  }
  // Named items (query.ids): read each one's own store page data, to see all its photos.
  for (const id of query.ids || []) {
    try {
      const res = await aeCall("aliexpress.affiliate.productdetail.get", { product_ids: String(id), target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: e.ALIEXPRESS_TRACKING_ID }, { env: e, fetchImpl, now });
      const x = res?.aliexpress_affiliate_productdetail_get_response?.resp_result?.result?.products?.product?.[0];
      const c = x ? candidate(x) : { ok: false, reason: "not_returned" };
      if (c.ok) { c.choose.orders = Number.MAX_SAFE_INTEGER - (query.ids.indexOf(id)); seen.set(c.item.id, c); }
      log.push(`id ${id}: ${c.ok ? "ok" : c.reason}`);
    } catch (err) { log.push(`id ${id}: ${String(err?.message || err).slice(0, 100)}`); }
  }
  // Recent orders first: the store's own measure of what people really buy.
  const all = [...seen.values()].sort((a, b) => b.choose.orders - a.choose.orders).slice(0, Number(query.max) || 12);
  return { all, log };
}

async function sheet(items, file, work) {
  mkdirSync(work, { recursive: true });
  const tiles = [];
  if (items.full) return fullSheet(items, file, work);
  for (const [i, c] of items.entries()) {
    const src = join(work, `${i}.jpg`);
    try {
      const res = await fetch(c.item.photos[0], { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      writeFileSync(src, Buffer.from(await res.arrayBuffer()));
      const tile = join(work, `t${i}.jpg`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", `scale=360:360:force_original_aspect_ratio=decrease,pad=360:400:(ow-iw)/2:0:white,drawtext=text='${i + 1}':x=10:y=365:fontsize=28:fontcolor=black`, tile]);
      tiles.push(tile);
    } catch { /* a photo that does not load is left out of the sheet */ }
  }
  if (!tiles.length) return false;
  if (tiles.length === 1) { execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tiles[0], "-q:v", "3", file]); return true; }
  const cols = Math.min(4, tiles.length);
  const rows = Math.ceil(tiles.length / cols);
  const layout = tiles.map((_, i) => `${(i % cols) * 360}_${Math.floor(i / cols) * 400}`).join("|");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...tiles.flatMap((t) => ["-i", t]), "-filter_complex", `xstack=inputs=${tiles.length}:layout=${layout}:fill=white`, "-frames:v", "1", "-q:v", "3", file]);
  return rows > 0;
}

/** Every photo of every item, one row per item, numbered "item.photo", for choosing a reel's shots by eye. */
async function fullSheet(items, file, work) {
  const rows = [];
  for (const [i, c] of items.entries()) {
    const tiles = [];
    for (const [k, url] of c.item.photos.entries()) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) continue;
        const src = join(work, `${i}-${k}.jpg`), tile = join(work, `t${i}-${k}.jpg`);
        writeFileSync(src, Buffer.from(await res.arrayBuffer()));
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", `scale=360:360:force_original_aspect_ratio=decrease,pad=360:400:(ow-iw)/2:0:white,drawtext=text='${i + 1}.${k + 1}':x=10:y=365:fontsize=28:fontcolor=black`, tile]);
        tiles.push(tile);
      } catch { /* left out */ }
    }
    if (!tiles.length) continue;
    const row = join(work, `row${i}.jpg`);
    if (tiles.length === 1) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tiles[0], row]);
    else execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...tiles.flatMap((t) => ["-i", t]), "-filter_complex", `hstack=inputs=${tiles.length}`, row]);
    rows.push(row);
  }
  if (!rows.length) return false;
  if (rows.length === 1) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", rows[0], "-q:v", "3", file]);
  else execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...rows.flatMap((r) => ["-i", r]), "-filter_complex", `${rows.map((_, i) => `[${i}:v]pad=2160:400:0:0:white[r${i}]`).join(";")};${rows.map((_, i) => `[r${i}]`).join("")}vstack=inputs=${rows.length}`, "-q:v", "3", file]);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [queryFile, out = "search-out"] = process.argv.slice(2);
  const query = JSON.parse(readFileSync(queryFile, "utf8"));
  mkdirSync(out, { recursive: true });
  const { all, log } = await search(query);
  for (const line of log) console.log(line);
  all.forEach((c, i) => console.log(`${i + 1}. ${c.item.id} ₪${c.item.price} · orders ${c.choose.orders} · ${c.choose.rating}% · video ${c.item.video ? "yes" : "no"} · ${c.item.title.slice(0, 90)}`));
  writeFileSync(join(out, `${query.name}.json`), JSON.stringify(all.map((c, i) => ({ n: i + 1, ...c.item })), null, 2));
  if (all.length) await sheet(Object.assign(all, { full: Boolean(query.full) }), join(out, `${query.name}-sheet.jpg`), join(out, "work"));
  if (!all.length) { console.error("no candidate passed the rules"); process.exit(1); }
}
