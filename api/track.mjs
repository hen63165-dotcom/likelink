// Vercel Serverless Function — Event Tracking 📊
//
// Server-side measurement layer for the LikeLink acquisition-to-commerce loop.
// Records real events (product views, outbound affiliate clicks, lead captures)
// to the KV store with anonymous Cloud Passport attribution.
//
// POST /api/track  { type, productId, marketerId, ... }
//
// Event types:
//   "product_view"       — a product card/modal was viewed
//   "outbound_click"     — visitor clicked through to the affiliate URL
//   "lead_capture"       — creator/merchant expressed interest (email captured)
//
// All writes go through the same Supabase KV table as the rest of the platform.
// No secrets are required — only the anon key for the public KV table.
// The SUPABASE_SERVICE_ROLE_KEY is used when available (server-to-server).

import { jsonCors } from "./_utils/cors.js";
import { readBody } from "./_utils/readBody.mjs";
import { getOrCreatePassport, recordVisit, rateAllow } from "./_utils/passport.js";

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "content-type": "application/json",
  Prefer: "resolution=merge-duplicates",
};

const EVENTS_KEY = "marketplace:events";
const EVENTS_CAP = 5000;

async function kvGet(key, fallback) {
  if (!SB_URL || !SB_KEY) return fallback;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: SB_HEADERS, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return fallback;
    const rows = await res.json();
    if (!rows?.[0]?.value) return fallback;
    let parsed = JSON.parse(rows[0].value);
    while (typeof parsed === "string" && parsed.length > 0) {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }
    return parsed;
  } catch {
    return fallback;
  }
}

async function kvSet(key, value) {
  if (!SB_URL || !SB_KEY) throw new Error("supabase_not_configured");
  const res = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

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

const VALID_EVENT_TYPES = new Set(["product_view", "outbound_click", "lead_capture"]);

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }

  let body;
  try { body = await readBody(req); } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req); return;
  }

  if (!body || typeof body !== "object") {
    json(res, { ok: false, error: "invalid_body" }, 400, req); return;
  }

  const { type, productId, marketerId, language, ...extra } = body;

  if (!VALID_EVENT_TYPES.has(type)) {
    json(res, { ok: false, error: "invalid_event_type", validTypes: Array.from(VALID_EVENT_TYPES) }, 400, req); return;
  }

  if (!productId) {
    json(res, { ok: false, error: "missing_productId" }, 400, req); return;
  }

  // Rate limit per passport (generous — tracking should never be spammed)
  let passport = null;
  try { passport = getOrCreatePassport(req, res); } catch { /* best-effort */ }
  if (passport && !rateAllow("api-track", passport.hash, 300)) {
    json(res, { ok: false, error: "rate_limited" }, 429, req); return;
  }

  // Record visitor (best-effort, fail-open)
  try {
    if (passport && SB_URL && SB_KEY) {
      await recordVisit(kvGet, kvSet, passport.hash);
    }
  } catch { /* visitor tracking never breaks the event write */ }

  const event = {
    id: `${type}_${productId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    productId: String(productId),
    marketerId: marketerId ? String(marketerId) : null,
    language: language || "he",
    passportHash: passport ? passport.hash : null,
    ts: Date.now(),
    userAgent: getHeader(req, "user-agent") || "",
    ...(Object.keys(extra).length ? { meta: extra } : {}),
  };

  try {
    const existing = await kvGet(EVENTS_KEY, []);
    const events = Array.isArray(existing) ? existing : [];
    events.push(event);
    const capped = events.length > EVENTS_CAP ? events.slice(-Math.floor(EVENTS_CAP * 0.85)) : events;
    await kvSet(EVENTS_KEY, capped);

    json(res, { ok: true, eventId: event.id, type }, 200, req);
  } catch (e) {
    json(res, { ok: false, error: String(e.message || e) }, 500, req);
  }
}

export { handler };
