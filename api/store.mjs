// Vercel Serverless Function — Store API 🔐
//
// THE GATE for every WRITE to the shared kv table from the browser.
// The browser's anon key can still READ the public feed, but all
// inserts/updates/deletes now go through this function using the
// SUPABASE_SERVICE_ROLE_KEY (which bypasses RLS on the server side).
//
// Why this is the "genius" security layer:
//   - A forger can no longer POST straight to Supabase with the anon key
//     to fake a sale, change the platform fee, or wipe listings.
//   - This function enforces: WHO can write, WHAT key, size limits,
//     and keeps sensitive money keys server/admin-only.
//
// API:
//   POST /api/store  { key, value }  → writes one kv row (upsert)
//   POST /api/store  { key }         → (body.action = "delete") deletes a row
//
// Allowed clients:
//   - any signed-in visitor (writes only NON-sensitive keys)
//   - admin token (writes any key)
//
// Sensitive keys (money/config) are ONLY writable with an admin token.

import { jsonCors } from "./_utils/cors";
import { audit } from "./_utils/audit";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Keys that only an admin may write (money/config that must never be forged
// by a browser, even a signed-in creator): settings, payouts.
const SENSITIVE_KEYS = new Set([
  "marketplace:settings".toUpperCase(),
  "marketplace:payouts".toUpperCase(),
]);

// Keys that a creator writes from her own studio browser via a signed path:
// sales self-reports go through /api/sign-sale (threshold + rate-limit + HMAC).
const SIGNED_KEYS = new Set(["marketplace:sales".toUpperCase()]);

const SIGN_SECRET =
  process.env.STORE_SIGN_SECRET ||
  process.env.ADMIN_SESSION_SECRET ||
  "likelink-store-sign-v1";

const MAX_VALUE_BYTES = 4_000_000; // ~4MB safety cap per kv value
const MAX_KEY_LEN = 120;
const SIG_WINDOW_MS = 5 * 60 * 1000; // valid signature window (5 min)

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, {
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["content-type", "authorization"],
  });
}

function getHeader(req, name) {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name) || "";
  return h?.[name] || "";
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
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

async function kvDelete(key) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(
    `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}`,
    {
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok && res.status !== 204) throw new Error(`kv_delete_failed_${res.status}`);
}

// Verify an admin Bearer token (same scheme as /api/admin/auth).
async function isAdminToken(token) {
  if (!token) return false;
  try {
    const res = await fetch("/api/admin/auth", {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return Boolean(res.ok && data.ok);
  } catch {
    return false;
  }
}

// Verify the HMAC signature produced by /api/sign-sale for a sales self-report.
// The client must send { sig, sale }. We re-derive the canonical string the
// SAME way the signer did (key|marketerId|productId|saleAmount|commissionAmount|ts)
// and ensure the signature is fresh (≤ SIG_WINDOW_MS).
async function verifySaleSignature({ key, sale, sig, sigTs }) {
  if (!sale || typeof sale !== "object" || !sig || !sigTs) return false;
  const now = Date.now();
  if (now - Number(sigTs) > SIG_WINDOW_MS || Number(sigTs) > now + 60_000) return false;

  const canonical = [
    key.toLowerCase(),
    String(sale.marketerId || ""),
    String(sale.productId || ""),
    Number(sale.saleAmount || 0),
    Number(sale.commissionAmount || 0),
    Number(sale.ts || 0),
  ].join("|");

  const crypto = await import("crypto");
  const expected = crypto
    .createHmac("sha256", SIGN_SECRET)
    .update(canonical)
    .digest("hex");

  const a = Buffer.from(String(sig), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── sign-sale (merged from the deleted api/sign-sale.mjs to stay under the
// ─── 12-serverless-function Hobby limit). Dispatched by vercel.json rewrite:
// ─── /api/sign-sale → /api/store?mode=sign-sale
const SIGN_MIN_SALE = 1;        // ₪
const SIGN_MAX_SALE = 100000;   // ₪ per sale
const SIGN_MAX_PER_IP_MIN = 15; // signed sales per IP per 60s window
const signWindow = new Map();   // ip → [ts] (per-lambda sliding window)

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

async function signSaleHandler(req, res) {
  let body;
  try {
    body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const { productId, marketerId, saleAmount, commissionAmount, ts, id } = body || {};
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
  const amount = toNum(saleAmount);
  const commission = toNum(commissionAmount);

  if (!marketerId || !productId) { json(res, { ok: false, error: "missing_fields" }, 400, req); return; }
  if (Number.isNaN(amount) || amount < SIGN_MIN_SALE || amount > SIGN_MAX_SALE) {
    json(res, { ok: false, error: "invalid_amount", min: SIGN_MIN_SALE, max: SIGN_MAX_SALE }, 400, req);
    return;
  }
  if (Number.isNaN(commission) || commission < 0 || commission > amount) {
    json(res, { ok: false, error: "invalid_commission" }, 400, req);
    return;
  }

  // Ownership: the product must exist and belong to this creator.
  const [prods, mks, settings] = await Promise.all([
    kvGet("marketplace:products"),
    kvGet("marketplace:marketers"),
    kvGet("marketplace:settings"),
  ]);
  const product = Array.isArray(prods) ? prods.find((p) => p && p.id === productId) : null;
  if (!product) { json(res, { ok: false, error: "product_not_found" }, 404, req); return; }
  if (product.marketerId !== marketerId) { json(res, { ok: false, error: "not_owner" }, 403, req); return; }
  if (!Array.isArray(mks) || !mks.some((m) => m && m.id === marketerId)) {
    json(res, { ok: false, error: "marketer_not_found" }, 404, req);
    return;
  }

  // Rate limit (per IP, sliding 60s window).
  const ip = String(getHeader(req, "x-forwarded-for")).split(",")[0].trim() || "unknown";
  const now = Date.now();
  const win = (signWindow.get(ip) || []).filter((t) => now - t < 60000);
  if (win.length >= SIGN_MAX_PER_IP_MIN) {
    audit.logApiRateLimit({ type: "ip", ip }, { type: "sign-sale" }, { _req: req });
    json(res, { ok: false, error: "rate_limited" }, 429, req);
    return;
  }
  win.push(now);
  signWindow.set(ip, win.slice(-SIGN_MAX_PER_IP_MIN));

  // Build the sale exactly as the client will persist it.
  const finalTs = Number.isFinite(toNum(ts)) ? toNum(ts) : now;
  const feePct = Number(settings?.platformFeePercent ?? 15);
  const fee = Math.round(commission * (feePct / 100) * 100) / 100;
  const sale = {
    id: String(id || `${productId}-${finalTs}`),
    productId,
    marketerId,
    saleAmount: Math.round(amount * 100) / 100,
    commissionAmount: Math.round(commission * 100) / 100,
    platformFee: fee,
    marketerNet: Math.round((commission - fee) * 100) / 100,
    ts: finalTs,
  };

  // HMAC over the SAME canonical string verifySaleSignature() reconstructs.
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

  json(res, { ok: true, sig, sigTs: now, sale }, 200, req);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 503, req); return; }

  // Merged endpoint dispatch (12-function Hobby limit): /api/sign-sale lands
  // here via vercel.json rewrite → /api/store?mode=sign-sale
  if (new URL(req.url, "https://x").searchParams.get("mode") === "sign-sale") {
    return signSaleHandler(req, res);
  }

  let body;
  try {
    body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const { key, value, action, sig, sigTs, sale } = body || {};
  const normalizedKey = String(key || "").toLowerCase().trim();
  if (!normalizedKey || normalizedKey.length > MAX_KEY_LEN) {
    json(res, { ok: false, error: "invalid_key" }, 400, req);
    return;
  }

  const isDelete = action === "delete";
  const keyUpper = normalizedKey.toUpperCase();
  const isSensitive = SENSITIVE_KEYS.has(keyUpper);
  const isSigned = SIGNED_KEYS.has(keyUpper);

  // Sensitive keys (settings / payouts) require an admin token.
  if (isSensitive && !isDelete) {
    const auth = getHeader(req, "authorization");
    const token = String(auth).replace(/^Bearer\s+/i, "");
    const admin = await isAdminToken(token);
    if (!admin) {
      audit.logApiForbidden({ type: "anonymous" }, { type: "key", key: normalizedKey }, { _req: req });
      json(res, { ok: false, error: "admin_required" }, 403, req);
      return;
    }
  }

  // Sales self-reports require a valid server signature (created by /api/sign-sale).
  if (isSigned && !isDelete) {
    const okSig = await verifySaleSignature({ key: normalizedKey, sale, sig, sigTs });
    if (!okSig) {
      audit.logApiForbidden({ type: "unsigned" }, { type: "key", key: normalizedKey }, { _req: req });
      json(res, { ok: false, error: "invalid_signature" }, 403, req);
      return;
    }
    // The signed sale must actually be present in the value being written, so a
    // signature on one sale can't be used to write an arbitrary array.
    const containsSignedSale =
      Array.isArray(value) &&
      sale?.id &&
      value.some((s) => s && s.id === sale.id);
    if (!containsSignedSale) { json(res, { ok: false, error: "signed_sale_missing" }, 403, req); return; }
  }

  try {
    if (isDelete) {
      // Deletes are admin-only (protect the whole marketplace).
      const auth = getHeader(req, "authorization");
      const token = String(auth).replace(/^Bearer\s+/i, "");
      const admin = await isAdminToken(token);
      if (!admin) {
        audit.logApiForbidden({ type: "non-admin" }, { type: "key", key: normalizedKey }, { _req: req });
        json(res, { ok: false, error: "admin_required" }, 403, req);
        return;
      }
      await kvDelete(normalizedKey);
      json(res, { ok: true, key: normalizedKey, deleted: true }, 200, req);
      return;
    }

    // Size cap
    const valueBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (valueBytes > MAX_VALUE_BYTES) {
      json(res, { ok: false, error: "value_too_large" }, 413, req);
      return;
    }

    await kvSet(normalizedKey, value);
    json(res, { ok: true, key: normalizedKey }, 200, req);
  } catch (e) {
    json(res, { ok: false, error: String(e.message || e) }, 500, req);
  }
}
