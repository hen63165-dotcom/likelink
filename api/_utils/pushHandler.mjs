import { readBody } from "./readBody.mjs";
// Vercel Serverless Function — Web Push 📬
//
// Zero-config push infrastructure:
//   • VAPID keypair is auto-generated on first call and persisted in the
//     shared kv store — no manual key ceremony needed.
//   • Subscriptions are stored per creator under "marketplace:pushsubs".
//
// GET  /api/push?publicKey=1            → { publicKey }
// POST /api/push { mode:"subscribe",    → saves the subscription
//                  marketerId, subscription }
//
// Used by src/lib/pwa.js (subscribeToPush) and consumed by the cron jobs
// (price-watch) so creators get real phone notifications when prices drop.

import webpush from "web-push";
import { originFromRequest } from "./origin.mjs";

const VAPID_KEY = "marketplace:vapid";
const SUBS_KEY = "marketplace:pushsubs";

import { isApprovedOrigin } from "./cors.js";
import { verifyToken } from "./authVerify.js";
import { noteKvReadFailed, readKvResponse, assertKvWritable } from "../../src/lib/cloud/kvReadGuard.js";

// 🔒 Fail loud: server writes use the SERVICE ROLE key only. Never fall back
// to the anon key — the guards below return 500 when it is missing.
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

export async function ensureVapidKeys() {
  let keys = await kvGet(VAPID_KEY, null);
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys();
    await kvSet(VAPID_KEY, keys);
  }
  return keys;
}

export async function sendPushToMarketer(marketerId, payload) {
  try {
    const [keys, subs] = await Promise.all([ensureVapidKeys(), kvGet(SUBS_KEY, {})]);
    if (!keys?.publicKey || !subs[marketerId]?.length) return 0;

    // VAPID subject must be a mailto: or https: URL we actually control.
    // Env override first, then the canonical production origin (never a
    // domain the project does not own).
    const subject = process.env.VAPID_SUBJECT || originFromRequest();
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

    let sent = 0;
    const alive = [];
    for (const subscription of subs[marketerId]) {
      try {
        await Promise.race([
          webpush.sendNotification(subscription, JSON.stringify(payload)),
          new Promise((_, reject) => setTimeout(() => reject(new Error("push_timeout")), 10000)),
        ]);
        alive.push(subscription);
        sent++;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) continue; // expired — drop it
        alive.push(subscription); // transient failure — keep for retry
      }
    }
    subs[marketerId] = alive;
    await kvSet(SUBS_KEY, subs);
    return sent;
  } catch {
    return 0; // push must never break a cron run
  }
}

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.json(obj);
}

export default async function handler(req, res) {
  // 🔒 CORS: no wildcard. Echo back ONLY a validated approved origin
  // (same-origin requests need no ACAO header at all).
  const corsOrigin = String(req.headers?.origin || "");
  if (isApprovedOrigin(corsOrigin)) res.setHeader("access-control-allow-origin", corsOrigin);

  if (req.method === "OPTIONS") { json(res, { ok: true }); return; }

  if (req.method === "GET") {
    const url = new URL(req.url, "https://x");
    if (url.searchParams.get("publicKey")) {
      if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500); return; }
      // A failed read never regenerates the VAPID pair (kvReadGuard refuses the
      // write) — that would silently break every existing subscription.
      try {
        const keys = await ensureVapidKeys();
        json(res, { ok: true, publicKey: keys.publicKey });
      } catch {
        json(res, { ok: false, error: "push_unavailable" }, 503);
      }
      return;
    }
    json(res, { ok: false, error: "bad_request" }, 400);
    return;
  }

  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405); return; }

  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400);
    return;
  }

  const { mode, marketerId, subscription } = body || {};
  if (!marketerId || !subscription?.endpoint) {
    json(res, { ok: false, error: "missing_fields" }, 400);
    return;
  }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500); return; }

  if (mode === "subscribe") {
    // Only the signed-in owner of the studio may register devices for it —
    // otherwise anyone could push a creator's real phones out of the list.
    const token = String(req.headers?.authorization || req.headers?.Authorization || "").replace(/^Bearer\s+/i, "").trim();
    const actor = token ? await verifyToken(token) : null;
    if (!actor?.email) { json(res, { ok: false, error: "authentication_required" }, 401); return; }
    const marketers = await kvGet("marketplace:marketers", []);
    const owner = (Array.isArray(marketers) ? marketers : []).find((m) => m && String(m.id) === String(marketerId));
    if (!owner || String(owner.email || "").trim().toLowerCase() !== String(actor.email).trim().toLowerCase()) {
      json(res, { ok: false, error: "not_owner" }, 403);
      return;
    }
    const subs = await kvGet(SUBS_KEY, {});
    const list = Array.isArray(subs[marketerId]) ? subs[marketerId] : [];
    subs[marketerId] = [...list.filter((s) => s.endpoint !== subscription.endpoint), subscription].slice(-5);
    try {
      await kvSet(SUBS_KEY, subs);
      json(res, { ok: true });
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500);
    }
    return;
  }

  json(res, { ok: false, error: "unknown_mode" }, 400);
}
