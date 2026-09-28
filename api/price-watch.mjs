// Vercel Serverless Function — Price Watch 🏷️
//
// The LTK-killer feature: a daily cron that re-checks every approved
// product's live price at the retailer, keeps a price history, and pushes an
// in-app notification to the creator when a price drops (so she can shout
// about it) or rises significantly.
//
// Cron: daily 03:00 UTC via vercel.json. Also runnable manually:
//   GET /api/price-watch  with  Authorization: Bearer PRICE_WATCH_SECRET
//
// Storage: kv "marketplace:pricehistory"  → { [productId]: [{ ts, price }] }
//          kv "marketplace:notifications" → append price-drop notifications

import { originFromRequest } from "./_utils/origin.mjs";
import { noteKvReadFailed, readKvResponse, assertKvWritable } from "../src/lib/cloud/kvReadGuard.js";
import { isAuthorizedCron } from "./_utils/cronAuth.mjs";

const HISTORY_KEY = "marketplace:pricehistory";
const NOTIFS_KEY = "marketplace:notifications";
const ANNOUNCED_KEY = "marketplace:pricedrop_announced"; // { [productId]: livePrice } — anti-spam
const MAX_PRODUCTS_PER_RUN = 50;
const MAX_HISTORY_PER_PRODUCT = 30;
const DROP_ALERT_PERCENT = 5; // alert when live price is ≥5% below seller's listed price


// 🔒 Fail loud: server writes use the SERVICE ROLE key only — no anon fallback.
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function kvGet(key, fallback) {
  // A failed read returns the fallback but marks the key (kvReadGuard) so
  // kvSet refuses to overwrite real data with that fallback.
  if (!SB_URL || !SB_KEY) return fallback;
  let res;
  try {
    res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
  } catch {
    noteKvReadFailed(key);
    return fallback;
  }
  const row = await readKvResponse(key, res);
  return row.found ? row.value : fallback;
}

async function kvSet(key, value) {
  assertKvWritable(key);
  if (!SB_URL || !SB_KEY) throw new Error("misconfigured: service role key missing");
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.json(obj);
}

// ─── price extraction (same logic as api/fetch-product-info.mjs) ────────────

function decodeEntities(s) {
  const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
  return String(s)
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;|&nbsp;/g, (m) => named[m] || m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function getMeta(html, prop) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1]).trim() : null;
}

function findPrice(node) {
  if (!node || typeof node !== "object") return null;
  const t = Array.isArray(node) ? node : [node];
  for (const n of t) {
    if (!n || typeof n !== "object") continue;
    const type = n["@type"];
    if (type === "Product" || type === "Offer") {
      const off = n.offers;
      if (off && typeof off === "object") {
        if (Array.isArray(off) && off[0]) {
          if (off[0].price != null) return off[0].price;
        } else if (off.price != null) return off.price;
      }
      if (n.price != null) return n.price;
      if (n.lowPrice != null) return n.lowPrice;
    }
    for (const v of Object.values(n)) {
      const r = findPrice(v);
      if (r != null) return r;
    }
  }
  return null;
}

function findCurrency(node) {
  if (!node || typeof node !== "object") return null;
  for (const n of Array.isArray(node) ? node : [node]) {
    if (!n || typeof n !== "object") continue;
    if (typeof n.priceCurrency === "string" && n.priceCurrency) return n.priceCurrency;
    for (const v of Object.values(n)) {
      const r = findCurrency(v);
      if (r) return r;
    }
  }
  return null;
}

/** { raw, currency } — currency is null when the page does not declare one. */
export function extractPrice(html) {
  const metaP = getMeta(html, "og:price:amount") || getMeta(html, "product:price:amount");
  if (metaP) {
    const currency = getMeta(html, "og:price:currency") || getMeta(html, "product:price:currency");
    return { raw: metaP, currency: currency || null };
  }
  const ld = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ld) {
    for (const chunk of ld[1].split("</script>")) {
      try {
        const root = JSON.parse(chunk.trim());
        const p = findPrice(root);
        if (p != null) return { raw: String(p), currency: findCurrency(root) };
      } catch { /* malformed JSON-LD */ }
    }
  }
  return null;
}

/**
 * Parse a scraped price string: "1,299.00" → 1299, "1.299,00" → 1299,
 * "249,90" → 249.9, "₪ 1,299" → 1299. Returns null when unparseable.
 */
export function parsePriceNumber(raw) {
  let s = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the right-most separator is the decimal point.
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma !== -1) {
    // Commas only: "1,299" / "12,345,678" are thousands; "249,90" is decimal.
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.split(",").join("") : s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchLivePrice(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 LikelinkBot/1.0",
        "accept-language": "en,he;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const found = extractPrice(html);
    if (!found) return null;
    const price = parsePriceNumber(found.raw);
    return price == null ? null : { price, currency: found.currency ? String(found.currency).toUpperCase() : null };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // Vercel Cron → Bearer CRON_SECRET; GitHub daily workflow → Bearer
  // AUTOPILOT_SECRET (the platform's machine secret); manual → PRICE_WATCH_SECRET.
  const isCron = req.method === "GET" &&
    isAuthorizedCron(req, [process.env.PRICE_WATCH_SECRET, process.env.AUTOPILOT_SECRET]);

  if (!isCron) { json(res, { ok: false, error: "unauthorized" }, 401); return; }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500); return; }

  const [productsRow, history, notifsRow, announcedRow] = await Promise.all([
    kvGet("marketplace:products", []),
    kvGet(HISTORY_KEY, {}),
    kvGet(NOTIFS_KEY, []),
    kvGet(ANNOUNCED_KEY, {}),
  ]);
  // A failed read would reset history/announced and re-announce every drop to
  // creators' channels — stop before doing anything (kvReadGuard).
  try {
    for (const key of ["marketplace:products", HISTORY_KEY, NOTIFS_KEY, ANNOUNCED_KEY]) assertKvWritable(key);
  } catch (e) {
    json(res, { ok: false, error: "storage_read_failed", key: e?.key || null }, 503);
    return;
  }

  const products = Array.isArray(productsRow) ? productsRow : Object.values(productsRow || {});
  const notifications = Array.isArray(notifsRow) ? notifsRow : [];
  const announced = announcedRow && typeof announcedRow === "object" ? announcedRow : {};

  // Public origin: single source of truth (api/_utils/origin.mjs) so flash
  // posts carry correct store links on any deployment.
  const origin = process.env.PUBLIC_ORIGIN || process.env.LIKELINK_BASE_URL || originFromRequest(req);

  const pool = products
    .filter((p) => p?.status === "approved" && /^https?:\/\//i.test(p.affiliateUrl || ""))
    .slice(0, MAX_PRODUCTS_PER_RUN);

  const checked = [];
  let newNotifications = 0;
  let flashPosted = 0; // ⚡ price-drop flash posts actually sent via AutoPilot

  const startTime = Date.now();
  const MAX_RUN_MS = 50000;

  for (const p of pool) {
    if (Date.now() - startTime > MAX_RUN_MS) break;
    const livePrice = await fetchLivePrice(p.affiliateUrl);
    if (livePrice == null) {
      checked.push({ productId: p.id, ok: false });
      continue;
    }
    // A USD retailer price is not comparable with an ILS listing — never
    // report a "drop" across currencies.
    const listedCurrency = String(p.currency || "ILS").toUpperCase();
    if (livePrice.currency && livePrice.currency !== listedCurrency) {
      checked.push({ productId: p.id, ok: false, reason: "currency_mismatch", currency: livePrice.currency });
      continue;
    }
    const live = livePrice.price;

    const entries = history[p.id] || [];
    const last = entries.length ? entries[entries.length - 1].price : p.price;

    history[p.id] = [...entries, { ts: Date.now(), price: live }].slice(-MAX_HISTORY_PER_PRODUCT);

    // price drop vs the seller's listed price → notify the creator
    const listed = Number(p.price);
    if (Number.isFinite(listed) && listed > 0 && live <= listed * (1 - DROP_ALERT_PERCENT / 100)) {
      const pct = Math.round(((listed - live) / listed) * 100);
      // 🚨 Price-Drop Flash — announce each distinct dropped price exactly once
      // (the daily cron re-finds the same drop otherwise → notification spam).
      if (announced[p.id] !== live) {
        announced[p.id] = live;
        notifications.push({
          id: `pricedrop_${p.id}_${Date.now()}`,
          marketerId: p.marketerId,
          type: "price_drop",
          title: `📉 ירידת מחיר ${pct}%`,
          body: `${p.title}: המחיר בחנות ירד ל־${live} ₪ (רשמת ${listed} ₪). כדאי לפרסם עכשיו!`,
          ts: Date.now(),
          read: false,
        });
        newNotifications++;
        // ⚡ Instant AutoPilot post — the flash goes out NOW to every connected
        // channel (not waiting for the creator's next scheduled slot).
        try {
          const { announcePriceDrop } = await import("./autopilot.mjs");
          const flash = await announcePriceDrop(p.marketerId, p, listed, live, origin);
          if (flash?.ok) flashPosted++;
        } catch { /* best-effort — in-app notification already saved */ }
      }
    }

    checked.push({ productId: p.id, ok: true, live, last: last ?? null });
  }

  // The announced map is persisted too — otherwise every nightly run re-finds
  // the same drops and re-posts them to creators' channels.
  await Promise.all([
    kvSet(HISTORY_KEY, history),
    kvSet(NOTIFS_KEY, notifications.slice(-500)),
    kvSet(ANNOUNCED_KEY, announced),
  ]);

  // 📬 Web Push — real phone notification per creator with a price drop
  try {
    const { sendPushToMarketer } = await import("./_utils/pushHandler.mjs");
    // slice(-0) would return EVERY stored notification — only this run's drops.
    const drops = newNotifications > 0 ? notifications.slice(-newNotifications) : [];
    for (const n of drops) {
      if (Date.now() - startTime > MAX_RUN_MS) break;
      if (n.type !== "price_drop") continue;
      await sendPushToMarketer(n.marketerId, {
        title: n.title,
        body: n.body,
        url: "/studio",
        tag: `pricedrop_${n.marketerId}`,
      });
    }
  } catch { /* web-push not installed yet — notifications still saved in-app */ }

  json(res, {
    ok: true,
    checked: checked.length,
    results: checked,
    newNotifications,
    flashPosted,
  });
}

