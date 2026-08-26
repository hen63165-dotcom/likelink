// Vercel Serverless Function — AutoPilot 🚀
//
// Likelink's built-in self-publishing automation engine ("Make/Zapier inside
// your studio"). Each creator configures channels + a caption template + a
// posting frequency; a Vercel Cron job hits this function every 30 minutes,
// picks the next product from the creator's pool, generates a polished
// caption (optionally AI-polished via OpenAI) and publishes it to every
// connected channel — fully automatic, no third-party tools needed.
//
// Modes (JSON body):
//   { mode: "get",  marketerId }              → fetch config + recent logs
//   { mode: "save", marketerId, config }      → save/pause/resume automation
//   { mode: "run",  marketerId }              → force-publish one post now
// Cron (GET, x-vercel-cron header or ?secret=): runs ALL due automations.
//
// Storage: Supabase `kv` table under key "marketplace:autopilot" (same store
// the rest of the platform uses).

const KV_KEY = "marketplace:autopilot";
const MAX_LOGS_PER_CREATOR = 40;

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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

// ─── kv storage (same conventions as src/lib/storage.js) ───────────────────

async function kvGet(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await res.json();
    return rows?.[0]?.value ? JSON.parse(rows[0].value) : {};
  } catch {
    return {};
  }
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
  });
  if (!res.ok) throw new Error(`kv_upsert_failed_${res.status}`);
}

// ─── content generation ─────────────────────────────────────────────────────

function renderTemplate(tpl, p, link) {
  const map = {
    "{name}": p.title || p.name || "",
    "{price}": p.price != null ? String(p.price) : "",
    "{category}": p.category || "",
    "{description}": p.description || "",
    "{link}": link,
  };
  let out = String(tpl || "");
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out.trim();
}

const FALLBACK_TEMPLATES_HE = [
  "🔥 {name}\nבמחיר מיוחד: {price} ₪\nלרכישה 👉 {link}",
  "✨ הפינוק הבא שלי עבורך: {name}\nרק {price} ₪ — כמות מוגבלת!\n🛍️ {link}",
  "💥 לא לפספס: {name}\nמומלץ בחום, {price} ₪ בלבד\n👉 {link}",
];

async function aiPolish(text, product) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return text;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "את עוזרת שיווקית של יוצרות תוכן בישראל. שפררי את טקסט הפרסום: עברית קליטה, אנרגטית, עם 2–3 אימוג'ים. אל תמציאה מחירים או פרטים. החזירי רק את הטקסט.",
          },
          { role: "user", content: `מוצר: ${product.title || product.name || ""}\nטיוטה:\n${text}` },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    return out && out.length > 10 ? out : text;
  } catch {
    return text; // silent fallback — automation must never break
  }
}

// ─── channel dispatchers ────────────────────────────────────────────────────

async function sendTelegram(ch, text) {
  const res = await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: ch.chatId, text, disable_web_page_preview: false }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`telegram_${res.status}`);
}

async function sendWebhook(ch, payload) {
  const res = await fetch(ch.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`webhook_${res.status}`);
}

async function sendFacebook(ch, text, link) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(ch.pageId)}/feed`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text, link, access_token: ch.pageToken }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`facebook_${res.status}`);
}

// ─── core runner ────────────────────────────────────────────────────────────

function pickProduct(cfg, pool) {
  const ids = cfg.productIds?.length ? cfg.productIds : pool.map((p) => p.id);
  const items = ids.map((id) => pool.find((p) => p.id === id)).filter(Boolean);
  if (!items.length) return null;
  const idx = Math.abs(Number(cfg.lastRunAt) || 0) % items.length; // round-robin
  return items[idx];
}

async function runOne(store, marketerId, cfg, origin) {
  const marketer = (store.__marketers || []).find((m) => m.id === marketerId);
  const allProducts = store.__products || [];
  const pool = allProducts.filter((p) => p.marketerId === marketerId && p.status === "approved");
  const product = pickProduct(cfg, pool);

  if (!product) {
    cfg.logs = [
      { ts: Date.now(), ok: false, channel: "-", detail: "no products in pool", text: "" },
      ...(cfg.logs || []),
    ].slice(0, MAX_LOGS_PER_CREATOR);
    return { ok: false, error: "no products" };
  }

  const slug = marketer?.slug || marketerId;
  const link = cfg.storeUrl?.trim() || `${origin}/u/${slug}`;
  const tpl =
    cfg.template?.trim() ||
    FALLBACK_TEMPLATES_HE[Math.floor(Date.now() / 60000) % FALLBACK_TEMPLATES_HE.length];
  let text = renderTemplate(tpl, product, link);
  if (cfg.aiPolish) text = await aiPolish(text, product);

  const results = [];
  for (const ch of cfg.channels || []) {
    try {
      if (ch.type === "telegram") await sendTelegram(ch, text);
      else if (ch.type === "webhook")
        await sendWebhook(ch, { text, product, marketerId, link, source: "likelink-autopilot" });
      else if (ch.type === "facebook") await sendFacebook(ch, text, link);
      else results.push({ channel: ch.type, ok: false, detail: "unknown_channel" });
      results.push({ channel: ch.type, ok: true });
    } catch (e) {
      results.push({ channel: ch.type, ok: false, detail: String(e.message || e) });
    }
  }

  const anyOk = results.some((r) => r.ok);
  cfg.lastRunAt = Date.now();
  cfg.nextRunAt = Date.now() + (Number(cfg.intervalMinutes) || 180) * 60000;
  cfg.runCount = (cfg.runCount || 0) + 1;
  cfg.logs = [
    {
      ts: Date.now(),
      ok: anyOk,
      channel: results.map((r) => r.channel).join(","),
      detail: results.map((r) => (r.ok ? "sent" : r.detail)).join(", "),
      text,
      productId: product.id,
    },
    ...(cfg.logs || []),
  ].slice(0, MAX_LOGS_PER_CREATOR);

  return { ok: true, text, results };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return json({ ok: true });

  const h = req.headers;
  const getH = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]);
  const proto = String(getH("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = getH("x-forwarded-host") || getH("host") || "likelink.app";
  const origin = `${proto}://${host}`;

  // ── CRON: publish for every enabled creator whose slot is due ──
  const url = new URL(req.url, origin);
  const isCron =
    req.method === "GET" &&
    (Boolean(getH("x-vercel-cron")) ||
      url.searchParams.get("secret") === (process.env.AUTOPILOT_SECRET || ""));

  if (isCron) {
    if (!SB_URL || !SB_KEY) return json({ ok: false, error: "supabase_not_configured" }, 500);
    const [store, marketersRow, productsRow] = await Promise.all([
      kvGet(KV_KEY),
      kvGet("marketplace:marketers"),
      kvGet("marketplace:products"),
    ]);
    store.__marketers = Array.isArray(marketersRow) ? marketersRow : [];
    store.__products = Array.isArray(productsRow) ? productsRow : [];

    const ran = [];
    for (const [marketerId, cfg] of Object.entries(store)) {
      if (marketerId.startsWith("__")) continue;
      if (!cfg?.enabled) continue;
      if ((cfg.nextRunAt || 0) > Date.now()) continue;
      const r = await runOne(store, marketerId, cfg, origin);
      ran.push({ marketerId, ok: r.ok });
    }
    try {
      await kvSet(KV_KEY, stripRuntime(store));
    } catch { /* best-effort */ }
    return json({ ok: true, ran });
  }

  // ── Studio API ──
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body;
  try {
    body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const { mode, marketerId } = body || {};
  if (!marketerId) return json({ ok: false, error: "missing_marketerId" }, 400);
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "supabase_not_configured" }, 500);

  const store = await kvGet(KV_KEY);

  if (mode === "get") {
    const cfg = store[marketerId] || null;
    return json({ ok: true, config: cfg ? publicCfg(cfg) : null });
  }

  if (mode === "save") {
    const prev = store[marketerId] || {};
    store[marketerId] = sanitizeConfig(prev, body.config || {});
    try {
      await kvSet(KV_KEY, stripRuntime(store));
      return json({ ok: true, config: publicCfg(store[marketerId]) });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  }

  if (mode === "run") {
    const cfg = store[marketerId];
    if (!cfg) return json({ ok: false, error: "not_configured" }, 404);
    const [marketersRow, productsRow] = await Promise.all([
      kvGet("marketplace:marketers"),
      kvGet("marketplace:products"),
    ]);
    store.__marketers = Array.isArray(marketersRow) ? marketersRow : [];
    store.__products = Array.isArray(productsRow) ? productsRow : [];
    const r = await runOne(store, marketerId, cfg, origin);
    try {
      await kvSet(KV_KEY, stripRuntime(store));
    } catch { /* log persistence best-effort */ }
    return json({ ...r, config: publicCfg(cfg) });
  }

  return json({ ok: false, error: "unknown_mode" }, 400);
}

// ─── helpers ────────────────────────────────────────────────────────────────

function sanitizeConfig(prev, c) {
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    enabled: Boolean(c.enabled),
    aiPolish: Boolean(c.aiPolish),
    intervalMinutes: num(c.intervalMinutes, 180),
    template: String(c.template || "").slice(0, 800),
    storeUrl: String(c.storeUrl || "").slice(0, 300),
    productIds: Array.isArray(c.productIds) ? c.productIds.slice(0, 200).map(String) : [],
    channels: (Array.isArray(c.channels) ? c.channels : []).slice(0, 6).map((ch) => ({
      type: String(ch.type || "").slice(0, 20),
      botToken: String(ch.botToken || "").slice(0, 200),
      chatId: String(ch.chatId || "").slice(0, 100),
      url: String(ch.url || "").slice(0, 500),
      pageId: String(ch.pageId || "").slice(0, 100),
      pageToken: String(ch.pageToken || "").slice(0, 300),
    })),
    lastRunAt: prev.lastRunAt || 0,
    nextRunAt: prev.nextRunAt || 0,
    runCount: prev.runCount || 0,
    logs: prev.logs || [],
  };
}

// never leak secrets back to the browser — masked previews only
function publicCfg(cfg) {
  const mask = (s) => (s ? `${String(s).slice(0, 6)}••••` : "");
  return {
    ...cfg,
    channels: (cfg.channels || []).map((ch) => ({
      ...ch,
      botToken: ch.botToken ? mask(ch.botToken) : "",
      pageToken: ch.pageToken ? mask(ch.pageToken) : "",
      url: ch.url ? mask(ch.url) : "",
    })),
  };
}

function stripRuntime(store) {
  const out = {};
  for (const [k, v] of Object.entries(store)) if (!k.startsWith("__")) out[k] = v;
  return out;
}



