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

const VAPID_KEY = "marketplace:vapid";
const SUBS_KEY = "marketplace:pushsubs";

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

    webpush.setVapidDetails("mailto:hello@likelink.app", keys.publicKey, keys.privateKey);

    let sent = 0;
    const alive = [];
    for (const subscription of subs[marketerId]) {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return json({ ok: true });

  if (req.method === "GET") {
    const url = new URL(req.url, "https://x");
    if (url.searchParams.get("publicKey")) {
      if (!SB_URL || !SB_KEY) return json({ ok: false, error: "supabase_not_configured" }, 500);
      const keys = await ensureVapidKeys();
      return json({ ok: true, publicKey: keys.publicKey });
    }
    return json({ ok: false, error: "bad_request" }, 400);
  }

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body;
  try {
    body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const { mode, marketerId, subscription } = body || {};
  if (!marketerId || !subscription?.endpoint) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "supabase_not_configured" }, 500);

  if (mode === "subscribe") {
    const subs = await kvGet(SUBS_KEY, {});
    const list = Array.isArray(subs[marketerId]) ? subs[marketerId] : [];
    // dedupe by endpoint
    subs[marketerId] = [...list.filter((s) => s.endpoint !== subscription.endpoint), subscription].slice(-5);
    try {
      await kvSet(SUBS_KEY, subs);
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  }

  return json({ ok: false, error: "unknown_mode" }, 400);
}
