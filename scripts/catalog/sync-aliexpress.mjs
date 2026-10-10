// Catalog sync from the owner's AliExpress affiliate account (official API).
//
// Runs on GitHub Actions (.github/workflows/catalog-sync.yml), free, no cloud:
// for every product in the catalog copy the site ships (public/snapshot/kv.json)
// it asks aliexpress.affiliate.productdetail.get — in shekels, shipping to
// Israel — and writes back only what the store itself reports:
//   price          the store's sale price in ILS (the cheapest option: "from")
//   originalPrice  the store's list price, only when it is higher (a real deal)
//   priceSource / priceCheckedAt   where and when the price was read
//   images         the store's own gallery; the card photo becomes the gallery
//                  photo with the least text on it (seller banners like "free
//                  ring over 200$" are not our offer), when OCR is available
//   videoUrl       the seller's own product video, when the store has one
//                  (a real product video, labelled "צילום המוצר: המוכר")
// Nothing is invented: a product the API does not return keeps its old data
// and is reported. The store's own sales/rating numbers are not copied.
//
//   node scripts/catalog/sync-aliexpress.mjs            # report only
//   node scripts/catalog/sync-aliexpress.mjs --write    # update the copy
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { aeCall, aeStatus } from "../../api/_utils/aliexpressAffiliate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SNAPSHOT = join(ROOT, "public/snapshot/kv.json");
// aliexpress.us item ids are the global id + 2^51 (e.g. 3256804734954745 ↔ 1005004921269497).
const US_OFFSET = 2n ** 51n;
const https = (u) => String(u || "").trim().replace(/^http:\/\//, "https://").replace(/^\/\//, "https://");

/** The global AliExpress product id a catalog product points at, or "". */
export function aliItemId(p = {}) {
  const fromUrl = String(p.imageSource?.itemUrl || p.sourceUrl || "").match(/\/item\/(\d{10,20})\.html/);
  const raw = String(p.aliexpressId || p.imageSource?.itemId || (fromUrl ? fromUrl[1] : "") || "");
  if (!/^\d{10,20}$/.test(raw)) return "";
  const n = BigInt(raw);
  return String(n >= US_OFFSET + 1000000000000000n ? n - US_OFFSET : n);
}

/** One API product → the fields LikeLink may write (null when the price is not real). */
export function storeFacts(x = {}, now = Date.now()) {
  const price = Number(x.target_sale_price);
  const currency = String(x.target_sale_price_currency || "");
  if (!(price > 0) || currency !== "ILS") return null;
  const original = Number(x.target_original_price);
  const gallery = [x.product_main_image_url, ...(Array.isArray(x.product_small_image_urls?.string) ? x.product_small_image_urls.string : [])]
    .map(https).filter((u, i, a) => /^https:\/\/\S+$/.test(u) && a.indexOf(u) === i).slice(0, 8);
  const video = https(x.product_video_url);
  return {
    price: Math.round(price * 100) / 100,
    currency: "ILS",
    originalPrice: original > price ? Math.round(original * 100) / 100 : undefined,
    priceFrom: true,
    priceSource: "aliexpress_api",
    priceCheckedAt: new Date(now).toISOString(),
    images: gallery,
    sellerVideo: /^https:\/\/\S+\.mp4(\?|$)/i.test(video) ? video : "",
  };
}

/** Apply store facts to a catalog product; the photo changes only to a cleaner gallery photo. */
export function applyFacts(p, facts, { cleanest = "", now = Date.now() } = {}) {
  if (!facts) return p;
  const next = { ...p, price: facts.price, currency: facts.currency, priceFrom: facts.priceFrom, priceSource: facts.priceSource, priceCheckedAt: facts.priceCheckedAt, images: facts.images, updatedAt: now };
  if (facts.originalPrice) next.originalPrice = facts.originalPrice;
  else delete next.originalPrice;
  if (cleanest && cleanest !== p.image && facts.images.includes(cleanest)) {
    next.image = cleanest;
    next.imageSource = { ...(p.imageSource || {}), via: "aliexpress_api_gallery", chosenBy: "least_text", provenance: "merchant_photo", previous: p.image, resolvedAt: facts.priceCheckedAt };
  }
  if (facts.sellerVideo) {
    next.videoUrl = facts.sellerVideo;
    next.videoProvider = "aliexpress_seller";
    next.videoStatus = "completed";
    next.videoSynthetic = false;
    next.videoStyle = "";
    next.videoPoster = next.image;
  }
  return next;
}

/** Text on an image, by OCR (tesseract), or null when OCR is not installed. */
function textAmount(url, dir) {
  try {
    const file = join(dir, `${Math.random().toString(36).slice(2)}.img`);
    execFileSync("curl", ["-sSL", "--max-time", "20", "-o", file, url]);
    const out = execFileSync("tesseract", [file, "-", "--psm", "11"], { stdio: ["ignore", "pipe", "ignore"], timeout: 60000 }).toString();
    return out.replace(/[^A-Za-z0-9֐-׿]/g, "").length;
  } catch {
    return null;
  }
}

function cleanestPhoto(images, current) {
  const dir = mkdtempSync(join(tmpdir(), "ae-ocr-"));
  try {
    const scored = images.map((u) => ({ u, t: textAmount(u, dir) })).filter((x) => x.t !== null);
    if (!scored.length) return "";
    scored.sort((a, b) => a.t - b.t);
    const cur = scored.find((x) => x.u === current);
    // Switch only when the current photo carries clearly more text than the best one.
    return !cur || cur.t - scored[0].t >= 12 ? scored[0].u : "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function resolveFromLink(link) {
  try {
    const res = await fetch(link, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    const where = res.headers.get("location") || (await res.text()).slice(0, 4000);
    const m = String(where).match(/\/item\/(\d{10,20})\.html/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

export async function sync({ env = process.env, write = false, now = Date.now() } = {}) {
  const st = aeStatus(env);
  if (!st.configured) return { outcome: "REQUIRES_CONNECTION", missing: st.missing };
  const doc = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const products = doc.keys["marketplace:products"];
  const ids = new Map();
  for (const p of products) {
    const id = aliItemId(p) || (await resolveFromLink(p.affiliateUrl));
    if (id) ids.set(p.id, id);
  }
  const json = await aeCall("aliexpress.affiliate.productdetail.get", {
    product_ids: [...new Set(ids.values())].join(","), target_currency: "ILS", target_language: "HE", country: "IL", tracking_id: env.ALIEXPRESS_TRACKING_ID,
  }, { env, now });
  const result = json?.aliexpress_affiliate_productdetail_get_response?.resp_result;
  if (result && Number(result.resp_code) !== 200) return { outcome: "PROVIDER_ERROR", code: result.resp_code, message: String(result.resp_msg || "").slice(0, 120) };
  const found = new Map((result?.result?.products?.product || []).map((x) => [String(x.product_id), x]));
  const report = [];
  doc.keys["marketplace:products"] = products.map((p) => {
    const facts = storeFacts(found.get(ids.get(p.id) || ""), now);
    if (!facts) {
      report.push({ id: p.id, item: ids.get(p.id) || null, status: "NOT_RETURNED" });
      return p;
    }
    const cleanest = cleanestPhoto(facts.images, p.image);
    const next = applyFacts(p, facts, { cleanest, now });
    report.push({ id: p.id, item: ids.get(p.id), status: "UPDATED", price: `₪${Number(p.price)} → ₪${next.price}`, original: next.originalPrice || null, photo: next.image !== p.image ? "cleaner gallery photo" : "kept", video: Boolean(facts.sellerVideo) });
    return next;
  });
  if (write && report.some((r) => r.status === "UPDATED")) {
    writeFileSync(SNAPSHOT, `${JSON.stringify(doc, null, 1)}\n`);
  }
  return { outcome: "OK", written: write, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await sync({ write: process.argv.includes("--write") }).catch((e) => ({ outcome: "FAILED", error: String(e?.message || e).slice(0, 200) }));
  console.log(JSON.stringify(r, null, 1));
  if (r.outcome === "REQUIRES_CONNECTION") console.log(`::notice::AliExpress API not connected: add the repository secrets ${r.missing.join(", ")} (Settings → Secrets and variables → Actions).`);
  if (r.outcome === "FAILED" || r.outcome === "PROVIDER_ERROR") process.exitCode = 1;
}
