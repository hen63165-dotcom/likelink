// Vercel Serverless Function — Sign Sale 🔏
//
// The "balanced" security path: a creator may still self-report a sale, but the
// sale must first obtain an HMAC signature from THIS server. The signature is
// then passed to /api/store (which validates it) before the sales array is
// written. This keeps the creator's existing UX but prevents:
//   - forging sales directly against Supabase with the public key
//   - absurd amounts (a picker: £1 .. £100,000, commission ≤ amount)
//   - spamming (per-IP + per-creator rate limits)
//   - editing/deleting other people's sales
//
// POST { productId, marketerId, saleAmount, commissionAmount, ts?, id? }
//   → 200 { ok, sig, sigTs } | 4xx with error reasons

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const SIGN_SECRET =
  process.env.STORE_SIGN_SECRET ||
  process.env.ADMIN_SESSION_SECRET ||
  "likelink-store-sign-v1";

const MKTS_KEY = "marketplace:marketers";
const PRODS_KEY = "marketplace:products";
const SETTINGS_KEY = "marketplace:settings";

// Thresholds — hard sanity caps on self-reported sales.
const MIN_SALE = 1; // ₪
const MAX_SALE = 100_000; // ₪ per sale
const MAX_PER_IP_MIN = 15; // signed sales per IP per 60s window

// Per-lambda, in-memory rate map (same cold-start caveat as admin auth — fine
// for a small studio; the real hard limit is the HMAC + server-side policy).
const ipWindow = new Map(); // ip → [ts]

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.json(obj);
}

function getHeader(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || "";
}

async function kvGet(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
    );
    const rows = await res.json();
    return rows?.[0]?.value ? JSON.parse(rows[0].value) : null;
  } catch {
    return null;
  }
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }); return; }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405); return; }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 503); return; }

  let body;
  try {
    body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400);
    return;
  }

  const { productId, marketerId, saleAmount, commissionAmount, ts, id } = body || {};
  const amount = toNum(saleAmount);
  const commission = toNum(commissionAmount);

  // ── Validations (server-side, can't be skipped by the client) ──
  if (!marketerId || !productId) { json(res, { ok: false, error: "missing_fields" }, 400); return; }
  if (Number.isNaN(amount) || amount < MIN_SALE || amount > MAX_SALE) {
    json(res, { ok: false, error: "invalid_amount", min: MIN_SALE, max: MAX_SALE }, 400);
    return;
  }
  if (Number.isNaN(commission) || commission < 0 || commission > amount) {
    json(res, { ok: false, error: "invalid_commission" }, 400);
    return;
  }

  // ── Ownership check: the product must belong to this creator ──
  const [prods, mks, settings] = await Promise.all([kvGet(PRODS_KEY), kvGet(MKTS_KEY), kvGet(SETTINGS_KEY)]);
  const product = Array.isArray(prods) ? prods.find((p) => p && p.id === productId) : null;
  if (!product) { json(res, { ok: false, error: "product_not_found" }, 404); return; }
  if (product.marketerId !== marketerId) {
    json(res, { ok: false, error: "not_owner" }, 403);
    return;
  }
  const marketerExists = Array.isArray(mks) && mks.some((m) => m && m.id === marketerId);
  if (!marketerExists) { json(res, { ok: false, error: "marketer_not_found" }, 404); return; }

  // ── Rate limit (per IP, sliding 60s window) ──
  const ip = String(getHeader(req, "x-forwarded-for")).split(",")[0].trim() || "unknown";
  const now = Date.now();
  const arr = (ipWindow.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= MAX_PER_IP_MIN) {
    json(res, { ok: false, error: "rate_limited" }, 429);
    return;
  }
  arr.push(now);
  ipWindow.set(ip, arr.slice(-MAX_PER_IP_MIN));

  // ── Build the sale exactly like the client will persist it ──
  const finalTs = Number.isFinite(toNum(ts)) ? toNum(ts) : now;
  const finalId = String(id || `${productId}-${finalTs}`);
  const feePct = Number(settings?.platformFeePercent ?? 15);
  const fee = Math.round(commission * (feePct / 100) * 100) / 100;
  const net = Math.round((commission - fee) * 100) / 100;
  const sale = {
    id: finalId,
    productId,
    marketerId,
    saleAmount: Math.round(amount * 100) / 100,
    commissionAmount: Math.round(commission * 100) / 100,
    platformFee: fee,
    marketerNet: net,
    ts: finalTs,
  };

  // ── HMAC over the canonical fields (must match /api/store exactly) ──
  const crypto = await import("crypto");
  const canonical = [
    "marketplace:sales",
    String(sale.marketerId),
    String(sale.productId),
    Number(sale.saleAmount),
    Number(sale.commissionAmount),
    Number(sale.ts),
  ].join("|");
  const sig = crypto.createHmac("sha256", SIGN_SECRET).update(canonical).digest("hex");

  json(res, { ok: true, sig, sigTs: now, sale });
}