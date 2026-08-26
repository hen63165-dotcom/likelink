// Vercel Serverless Function — Price Watch 🏷️
//
// The LTK-killer feature: a daily cron that re-checks every approved
// product's live price at the retailer, keeps a price history, and pushes an
// in-app notification to the creator when a price drops (so she can shout
// about it) or rises significantly.
//
// Cron: daily 03:00 UTC via vercel.json. Also runnable manually:
//   GET /api/price-watch?secret=PRICE_WATCH_SECRET
//
// Storage: kv "marketplace:pricehistory"  → { [productId]: [{ ts, price }] }
//          kv "marketplace:notifications" → append price-drop notifications

const HISTORY_KEY = "marketplace:pricehistory";
const NOTIFS_KEY = "marketplace:notifications";
const MAX_PRODUCTS_PER_RUN = 50;
const MAX_HISTORY_PER_PRODUCT = 30;
const DROP_ALERT_PERCENT = 5; // alert when live price is ≥5% below seller's listed price

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function kvGet(key, fallback) {
  if (!SB_URL || !SB_KEY) return fallback;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await res.json();
    return rows?.[0]?.value ? JSON.parse(rows[0].value) : fallback;
  } catch {
    return fallback;
  }
}

async function kvSet(key, value) {
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
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

function extractPrice(html) {
  const metaP = getMeta(html, "og:price:amount") || getMeta(html, "product:price:amount");
  if (metaP) return metaP;
  const ld = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ld) {
    for (const chunk of ld[1].split("</script>")) {
      try {
        const root = JSON.parse(chunk.trim());
        const p = findPrice(root);
        if (p != null) return String(p);
      } catch { /* malformed JSON-LD */ }
    }
  }
  return null;
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
    const raw = extractPrice(html);
    if (raw == null) return null;
    const n = parseFloat(String(raw).replace(/[^\d.,]/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export default async function handler(req) {
  const h = req.headers;
  const getH = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]);
  const url = new URL(req.url, "https://x");
  const isCron =
    req.method === "GET" &&
    (Boolean(getH("x-vercel-cron")) ||
      url.searchParams.get("secret") === (process.env.PRICE_WATCH_SECRET || ""));

  if (!isCron) return json({ ok: false, error: "unauthorized" }, 401);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "supabase_not_configured" }, 500);

  const [productsRow, history, notifsRow] = await Promise.all([
    kvGet("marketplace:products", []),
    kvGet(HISTORY_KEY, {}),
    kvGet(NOTIFS_KEY, []),
  ]);
  const products = Array.isArray(productsRow) ? productsRow : Object.values(productsRow || {});
  const notifications = Array.isArray(notifsRow) ? notifsRow : [];

  const pool = products
    .filter((p) => p?.status === "approved" && /^https?:\/\//i.test(p.affiliateUrl || ""))
    .slice(0, MAX_PRODUCTS_PER_RUN);

  const checked = [];
  let newNotifications = 0;

  for (const p of pool) {
    const live = await fetchLivePrice(p.affiliateUrl);
    if (live == null) {
      checked.push({ productId: p.id, ok: false });
      continue;
    }

    const entries = history[p.id] || [];
    const last = entries.length ? entries[entries.length - 1].price : p.price;

    history[p.id] = [...entries, { ts: Date.now(), price: live }].slice(-MAX_HISTORY_PER_PRODUCT);

    // price drop vs the seller's listed price → notify the creator
    const listed = Number(p.price);
    if (Number.isFinite(listed) && listed > 0 && live <= listed * (1 - DROP_ALERT_PERCENT / 100)) {
      const pct = Math.round(((listed - live) / listed) * 100);
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
    }

    checked.push({ productId: p.id, ok: true, live, last: last ?? null });
  }

  await Promise.all([kvSet(HISTORY_KEY, history), kvSet(NOTIFS_KEY, notifications.slice(-500))]);

  // 📬 Web Push — real phone notification per creator with a price drop
  try {
    const { sendPushToMarketer } = await import("./push.mjs");
    const drops = notifications.slice(-newNotifications);
    for (const n of drops) {
      if (n.type !== "price_drop") continue;
      await sendPushToMarketer(n.marketerId, {
        title: n.title,
        body: n.body,
        url: "/studio",
        tag: `pricedrop_${n.marketerId}`,
      });
    }
  } catch { /* web-push not installed yet — notifications still saved in-app */ }

  return json({ ok: true, checked: checked.length, results: checked, newNotifications });
}

