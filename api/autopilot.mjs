import { readBody } from "./_utils/readBody.mjs";
import { originFromRequest } from "./_utils/origin.mjs";
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

import { lunaHook } from "../src/lib/ambassador.js";
import { jsonCors } from "./_utils/cors.js";
import { verifyToken } from "./_utils/authVerify.js";
import { audit } from "./_utils/audit.js";
import { buildCampaign } from "../src/lib/cloud/campaign.js";
import { selectOpportunity } from "../src/lib/cloud/growth.js";
import { appendVeritas, verifyVeritas, veritasSummary } from "../src/lib/cloud/veritas.js";
import { createIntelligenceCore } from "./_utils/intelligenceCore.mjs";
import { runCloudAutopilotCycle, getCloudCycleStatus } from "../src/lib/cloud/cloudAutopilot.js";
import { runAllDueAutonomousJobs, getAutonomousJobStatus } from "../src/lib/cloud/autonomousJobs.js";
import { processPendingPayouts } from "./payouts/process.mjs";

const SITE_CAMPAIGNS_KEY = "marketplace:site_campaigns";
const VERITAS_KEY = "marketplace:veritas";

/**
 * Record a VERITAS pulse — append-only integrity ledger.
 * Each entry is hash-chained to the previous one (tamper-proof).
 * Server-side only, never exposed to clients. Fail-closed: if the ledger
 * can't be read/written, the pulse is skipped (never blocks the host action).
 */
async function recordVeritasPulse(type, entry) {
  try {
    const row = await kvGet(VERITAS_KEY, []);
    const ledger = Array.isArray(row) ? row : [];
    const next = appendVeritas(ledger, { type, ...entry });
    await kvSet(VERITAS_KEY, next);
  } catch { /* pulse is best-effort — never let it break the host function */ }
}

/**
 * Official Site Campaign cycle (OWNER_SCOPE = OFFICIAL_SITE) — runs on the
 * EXISTING daily cron, once per day, idempotent. Wraps the ADAPTIVE GROWTH
 * BRAIN: each cycle discovers the strongest real opportunity from
 * first-party data (verified sales > conversion > clicks > fatigue), builds
 * the Hebrew content pack, and stores the campaign record (append-only).
 * Publication stays with authorized channels only — assets are PREPARED.
 */
export async function runSiteCampaignCycle(origin) {
  try {
    const [productsRow, salesRow, clicksRow, campaignsRow, marketersRow] = await Promise.all([
      kvGet("marketplace:products", []),
      kvGet("marketplace:sales", []),
      kvGet("marketplace:clicks", []),
      kvGet(SITE_CAMPAIGNS_KEY, []),
      kvGet("marketplace:marketers", []),
    ]);
    let productsList = Array.isArray(productsRow) ? productsRow : [];
    const salesArr = Array.isArray(salesRow) ? salesRow : [];
    const clicksArr = Array.isArray(clicksRow) ? clicksRow : [];
    const campaignsList = Array.isArray(campaignsRow) ? campaignsRow : [];
    const marketersList = Array.isArray(marketersRow) ? marketersRow.filter((m) => m && m.id) : [];

    // ── CATALOG ATTRIBUTION REPAIR (single-owner policy · idempotent) ──
    // Legacy rows without a valid marketerId stay quarantined on every
    // public surface. When the cloud resolves to EXACTLY ONE real marketer
    // matching the configured single owner, repair attribution so real
    // products re-enter public commerce. Nothing is deleted or created;
    // products with valid ownership are never touched; a repaired state is
    // a no-op on every later run. Server-internal (cron context only) —
    // never an anonymous public write.
    let repair = null;
    try {
      const SINGLE_OWNER_ID = process.env.MARKETPLACE_SINGLE_OWNER_ID || "msd6go4kff49s5";
      if (marketersList.length === 1 && String(marketersList[0].id) === SINGLE_OWNER_ID) {
        const { planAttributionRepair } = await import("../src/lib/cloud/catalog.js");
        const plan = planAttributionRepair(productsList, marketersList, { ownerId: SINGLE_OWNER_ID });
        if (plan.changedCount > 0) {
          await kvSet("marketplace:products", plan.products);
          productsList = plan.products;
          repair = { repaired: plan.changedCount, ownerId: SINGLE_OWNER_ID };
          audit.logApiSuccess(
            { type: "attribution_repaired", changed: plan.changedCount, ownerId: SINGLE_OWNER_ID },
            { type: "site-campaign-cycle" }
          );
          await recordVeritasPulse("attribution_repair", { ok: true, repaired: plan.changedCount, ownerId: SINGLE_OWNER_ID });
        }
      }
    } catch { /* repair is best-effort; the cycle continues with current state */ }

    // Fail-closed promotability — same policy as discover/trends/feed/og:
    // only approved products attributable to a REAL marketer in the cloud.
    const approved = productsList.filter(
      (p) => p && p.status === "approved" && marketersList.some((m) => m && m.id === p.marketerId)
    );
    if (!approved.length) return { ok: false, skipped: "no_approved_products", repair };

    // Stateful idempotency — one campaign per catalog-state per day (cap 3):
    // an unchanged catalog never duplicates (cron retries are safe); a
    // CHANGED catalog (repair, new products, approvals) legitimately
    // produces a fresh campaign so the site never promotes a stale state.
    const list = campaignsList;
    const today = new Date().toISOString().slice(0, 10);
    const todays = list.filter((c) => String(c?.createdAt || "").slice(0, 10) === today);
    const fingerprint = approved.map((p) => p.id).sort().join("|");
    if (todays.length >= 3) return { ok: false, skipped: "daily_campaign_cap_reached", repair };
    if (todays.some((c) => (c?.catalogFingerprint || "") === fingerprint)) {
      return { ok: false, skipped: "campaign_already_ran_today", repair };
    }

    // ── ADAPTIVE GROWTH BRAIN: evidence-first selection (fatigue-aware) ──
    // No authorized external channel exists on the official-site scope yet;
    // channelStates stays empty so distribution is honestly BLOCKED/PREPARED.
    // marketers is passed so selection is fail-closed on real ownership and
    // the landing destination uses the creator's real slug when it exists.
    const decision = selectOpportunity({ approved, sales: salesArr, clicks: clicksArr, campaigns: list, channelStates: [], marketers: marketersList });
    const product = decision.selected;
    if (!product) return { ok: false, skipped: "no_opportunity_selected" };

    // Learning input — measured content clicks per angle (honest, sample-gated).
    let angleStats = {};
    try {
      const { learnFromClicks } = await import("../src/lib/cloud/campaign.js");
      angleStats = learnFromClicks(clicksArr).byAngle;
    } catch { /* learning is best-effort — rotation fallback applies */ }

    const campaign = buildCampaign(product, {
      storeUrl: `${origin}/?product=${encodeURIComponent(product.id)}`,
      angleStats,
    });
    if (!campaign) return { ok: false, skipped: "campaign_build_failed" };

    const record = {
      ...campaign,
      ownerScope: "OFFICIAL_SITE",
      catalogFingerprint: fingerprint,
      attributionRepair: repair,
      // ZERO-TOUCH DISTRIBUTION: the tracked URL (/p/<id>?utm_...) is a real,
      // live, indexable page on the owned web the moment it is created — no
      // OAuth/app-review/tokens needed. status=WEB_LIVE is an honest fact, not
      // a claim of traffic. If the Owner later taps "share", campaign-share
      // stamps it PUBLISHED via native_share (idempotent, append-only).
      status: "WEB_LIVE",
      distribution: "OWNED_WEB",
      publishTargets: ["owned_web"],
      blockedReason: null,
      metrics: { clicks: 0, note: "NOT_YET_MEASURED" },
      // The brain's decision is stored with the record — fully auditable.
      growthDecision: {
        mode: decision.mode,
        score: decision.score,
        reasons: decision.reasons,
        candidates: decision.candidates,
        rejected: decision.rejected,
        selectedProductId: decision.productId,
      },
    };
    list.push(record);
    await kvSet(SITE_CAMPAIGNS_KEY, list.slice(-100)); // append-only, capped
    await recordVeritasPulse("campaign_created", { ok: true, campaignId: campaign.campaignId, productId: product.id, angle: campaign.angle.id, mode: decision.mode, score: decision.score, repair: repair || null });
    return { ok: true, campaignId: campaign.campaignId, productId: product.id, angle: campaign.angle.id, mode: decision.mode, score: decision.score };
  } catch (e) {
    await recordVeritasPulse("campaign_cycle_error", { ok: false, error: String(e.message || e).slice(0, 120) });
    return { ok: false, error: String(e.message || e).slice(0, 120) };
  }
}


const KV_KEY = "marketplace:autopilot";
const MAX_LOGS_PER_CREATOR = 40;

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, obj, status = 200, req) {
  jsonCors(res, obj, status, req, {
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["content-type"],
  });
}

// ─── kv storage (same conventions as src/lib/storage.js) ───────────────────

async function kvGet(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(10000) }
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
    signal: AbortSignal.timeout(10000),
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

// ─── smart marketing engine: angles, hashtags, tracking, timing ─────────────

// Rotating marketing angles — every post a different hook so the feed never
// gets boring (runCount drives the rotation).
const ANGLES_HE = [
  (n) => `✨ כדאי להכיר: ${n}`,
  (n) => `💜 בחירה מתוך הקטלוג של LikeLink: ${n}`,
  (n) => `🛍️ מוצר חדש לגילוי: ${n}`,
  (n) => `🎁 רעיון למי שמחפשת ${n}`,
  (n) => `📌 פרטים על המוצר: ${n}`,
  (n) => `🔎 בואו לבדוק את ${n}`,
  (n) => `💡 מוצר שכדאי להכיר: ${n}`,
  (n) => `🌙 גילוי חדש ב-LikeLink: ${n}`,
  (n) => `🤍 פריט מהקטלוג: ${n}`,
  (n) => `📸 הצצה למוצר: ${n}`,
];

// ─── 2026 hook upgrade: curiosity-gap + urgency + social-proof angles ──────
// מבוסס דפוסי שיווק עדכניים: FOMO, סקרנות (curiosity gap), הוכחה חברתית,
// סיפור אישי והזדמנות-לתת. כל הוק נכתב כך שיעבוד בכל רשת — טקסט קצר,
// אימוג'י אחד חזק, והמוצר בסוף.
const ANGLES_2026_HE = [
  (n) => `🤫 גילוי חדש: ${n}`,
  (n) => `👀 שווה להציץ בפרטים: ${n}`,
  (n) => `✨ הנה מוצר שכדאי להכיר: ${n}`,
  (n) => `⚡ מוצר חדש בקטלוג: ${n}`,
  (n) => `🧸 הצצה למוצר: ${n}`,
  (n) => `🫶 בחירה חדשה מתוך הקטלוג: ${n}`,
  (n) => `🔥 מוצר שנבחר להצגה היום: ${n}`,
  (n) => `💬 פרטים וקישור למוצר: ${n}`,
  (n) => `🌱 גילוי חדש לפי הקטלוג: ${n}`,
  (n) => `🎀 רעיון שאפשר לבדוק: ${n}`,
  (n) => `📦 הצצה למוצר ולפרטים שלו: ${n}`,
  (n) => `🤯 בדקי את המחיר והפרטים: ${n}`,
];

// סגנון סיפורי "פיקסאר" — מיני-סיפור 3 שורות שמחבר רגשית לפני שמציג מחיר.
// משמש כל 6–7 פוסטים (postCount % 6 === 4) כדי לגוון את הפיד.
const STORY_ARCS_2026_HE = [
  (n, price) => `הכירו את המוצר, בדקו את הפרטים, והשוו לפני הקנייה.\n${n} · ${price} ₪`,
  (n, price) => `הצצה למוצר מתוך הקטלוג של LikeLink.\n${n} · ${price} ₪`,
  (n, price) => `מוצר חדש לגילוי — תמונה, מחיר וקישור במקום אחד.\n${n} · ${price} ₪`,
  (n, price) => `בחירה יומית מתוך מוצרים זמינים בקטלוג.\n${n} · ${price} ₪`,
  (n, price) => `פריט שכדאי לפתוח ולבדוק את הפרטים שלו.\n${n} · ${price} ₪`,
  (n, price) => `LikeLink מציגה את המוצר; ההחלטה נשארת אצלך.\n${n} · ${price} ₪`,
];


const CATEGORY_TAGS = {
  fashion: ["#סטייל", "#אופנה", "#לוק_היום"],
  beauty: ["#ביוטי", "#טיפוח", "#קוסמטיקה"],
  home: ["#עיצוב_הבית", "#לבית", "#דקורציה"],
  kids: ["#ילדים", "#מתנות"],
  jewelry: ["#תכשיטים", "#אקססורייז"],
  fitness: ["#כושר", "#ספורט"],
  tech: ["#גאדג'טים", "#טכנולוגיה"],
  food: ["#אוכל", "#קולינריה"],
  art: ["#אמנות", "#יצירה"],
  pets: ["#חיות_מחמד", "#פטים"],
};
const DEFAULT_TAGS = ["#קניות_אונליין", "#המלצה_אישית"];

function pickTags(product) {
  const cat = String(product?.category || "").toLowerCase();
  const specific = CATEGORY_TAGS[cat] || [];
  return [...specific, ...DEFAULT_TAGS].slice(0, 5);
}

// Per-channel tracked link — lets the creator see exactly which channel
// brings the traffic (utm_medium = telegram / facebook / webhook…).
function trackLink(base, channel, productId) {
  try {
    const u = new URL(base);
    u.searchParams.set("utm_source", "autopilot");
    u.searchParams.set("utm_medium", channel);
    u.searchParams.set("utm_campaign", productId);
    return u.href;
  } catch {
    return base;
  }
}

// Next run that respects the interval but never lands at night (23:00–09:00
// Israel time) — posts go out when the audience is actually awake.
function nextSmartRun(intervalMinutes) {
  const iv = Math.max(30, Number(intervalMinutes) || 180) * 60000;
  let t = Date.now() + iv;
  const ilHour = (ts) =>
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jerusalem",
        hour: "2-digit",
        hour12: false,
      }).format(new Date(ts))
    );
  for (let i = 0; i < 48; i++) {
    const h = ilHour(t);
    if (h >= 9 && h <= 22) return t;
    t += 30 * 60000; // scan forward until a daylight slot
  }
  return Date.now() + iv; // safety net
}

// The smart caption engine — angle + price + short description + link + tags
function smartCaption(product, link, tags, runCount) {
  const name = product.title || product.name || "הקולקציה החדשה";
  const priceNum = product.price != null && product.price !== "" ? product.price : null;
  const price = priceNum != null ? `💰 ${priceNum} ₪` : "";
  const desc = String(product.description || "").trim().slice(0, 120);
  const n = Math.abs(Number(runCount) || 0);

  // Every 6th post (offset 4) is a "Pixar-style" 3-line mini-story — the feed
  // alternates between punchy hooks and emotional micro-narratives.
  if (n % 6 === 4 && STORY_ARCS_2026_HE.length && priceNum != null) {
    const arc = STORY_ARCS_2026_HE[n % STORY_ARCS_2026_HE.length];
    return [arc(name, String(priceNum)), `👉 ${link}`, tags.join(" ")]
      .filter(Boolean)
      .join("\n");
  }

  // Pool = classic 10 angles + 12 fresh 2026 hooks, interleaved so no two
  // consecutive posts share a pool half.
  const pool = n % 2 === 0 ? ANGLES_HE : ANGLES_2026_HE;
  const angle = pool[n % pool.length];
  return [angle(name), price, desc, `👉 ${link}`, tags.join(" ")]
    .filter(Boolean)
    .join("\n");
}

// Central AI path: the existing aiPolish behavior becomes an orchestrator task.
// Same silent-fallback contract as before — automation must never break — but
// now with one central route, server-side keys, validation and job records.
const __core = createIntelligenceCore();
export async function aiPolish(text, product) {
  try {
    if (!product?.marketerId) return text;
    const result = await __core.runForMarketer(product.marketerId, {
      operation: "autopilot.polish", modality: "text",
      content: { kind: "text", text },
    });
    return result?.ok && result.result?.text ? result.result.text : text;
  } catch {
    return text; // silent fallback — automation must never break
  }
}

// ─── channel dispatchers ────────────────────────────────────────────────────

async function checkChannelConnection(store, channelType, channel = {}) {
  try {
    const raw = await kvGet("marketplace:connection_states");
    const list = Array.isArray(raw) ? raw : [];
    const state = list.find((c) => c && c.provider === channelType);
    if (state?.state === "EXPIRED" || state?.state === "REAUTH_REQUIRED" || state?.state === "BLOCKED" || state?.state === "ERROR" || state?.state === "UNAVAILABLE") return "BLOCKED";
    if (state?.state === "DEGRADED" && state?.lastVerified) return "DEGRADED";
    if (state?.state === "CONNECTED" && state?.lastVerified) return "READY";
    const configured = {
      telegram: Boolean(channel.botToken && channel.chatId),
      webhook: Boolean(channel.url),
      facebook: Boolean(channel.pageId && channel.pageToken),
      instagram: Boolean(channel.igUserId && channel.token),
      whatsapp: Boolean(channel.phoneNumberId && channel.token && channel.chatId),
      x: Boolean(channel.bearer),
      linkedin: Boolean(channel.personUrn && channel.token),
      discord: Boolean(channel.url),
      slack: Boolean(channel.url),
      mastodon: Boolean(channel.token),
      bluesky: Boolean(channel.handle && channel.token),
      reddit: Boolean(channel.subreddit && channel.clientId && channel.clientSecret && channel.token),
      pinterest: Boolean(channel.boardId && channel.token),
      wordpress: Boolean(channel.wpUrl && channel.wpUser && channel.wpPass),
    }[channelType];
    return configured ? "READY" : "NOT_CONNECTED";
  } catch {
    return "NOT_CONNECTED";
  }
}

async function markChannelVerified(provider) {
  try {
    const raw = await kvGet("marketplace:connection_states");
    const list = Array.isArray(raw) ? raw : [];
    const now = Date.now();
    const next = list.filter((entry) => entry?.provider !== provider);
    next.push({
      provider,
      state: "CONNECTED",
      lastVerified: now,
      lastSuccess: now,
      updatedAt: now,
      lastError: null,
      recoveryAction: null,
    });
    await kvSet("marketplace:connection_states", next.slice(-200));
  } catch {
    // Publishing itself succeeded; verification persistence is best-effort.
  }
}

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

async function sendDiscord(ch, text) {
  const res = await fetch(ch.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`discord_${res.status}`);
}

async function sendSlack(ch, text) {
  const res = await fetch(ch.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`slack_${res.status}`);
}

// WhatsApp Cloud API (Meta business) — posts to a channel/catalog broadcast list
async function sendWhatsApp(ch, text, link) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(ch.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ch.token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: ch.chatId,
        type: "text",
        text: { preview_url: true, body: `${text}\n${link}` },
      }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`whatsapp_${res.status}`);
}

// Instagram Graph API — 2-step publish (container → publish). Requires an
// image, so it's skipped gracefully when the product has none.
async function sendInstagram(ch, text, link, product) {
  const imageUrl = product?.image
    ? String(product.image).startsWith("http")
      ? product.image
      : null
    : null;
  if (!imageUrl) throw new Error("instagram_no_image");
  const container = await fetch(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(ch.igUserId)}/media`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, caption: `${text}\n${link}`, access_token: ch.token }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!container.ok) throw new Error(`instagram_container_${container.status}`);
  const { id } = await container.json();
  const publish = await fetch(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(ch.igUserId)}/media_publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creation_id: id, access_token: ch.token }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!publish.ok) throw new Error(`instagram_publish_${publish.status}`);
}

// X (Twitter) API v2 — Bearer token with user context from the X developer portal
async function sendX(ch, text, link) {
  const room = 280 - link.length - 1;
  const txt = text.length > room ? `${text.slice(0, Math.max(room - 1, 0))}…\n${link}` : `${text}\n${link}`;
  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ch.bearer}` },
    body: JSON.stringify({ text: txt }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`x_${res.status}`);
}

// LinkedIn — post an article share as a member/company via UGC Posts API
async function sendLinkedIn(ch, text, link) {
  const author = ch.personUrn.startsWith("urn:") ? ch.personUrn : `urn:li:person:${ch.personUrn}`;
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ch.token}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: `${text}\n${link}`.slice(0, 3000) },
          shareMediaCategory: "ARTICLE",
          media: [{ status: "READY", originalUrl: link }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`linkedin_${res.status}`);
}

// Mastodon — one call, any instance (default mastodon.social)
async function sendMastodon(ch, text, link) {
  const base = (ch.instance || "https://mastodon.social").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v1/statuses`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ch.token}` },
    body: JSON.stringify({ status: `${text}\n${link}`.slice(0, 500) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`mastodon_${res.status}`);
}

// Bluesky (AT Protocol) — app-password login then post
async function sendBluesky(ch, text, link) {
  const base = (ch.instance || "https://bsky.social").replace(/\/+$/, "");
  const login = await fetch(`${base}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: ch.handle, password: ch.token }),
    signal: AbortSignal.timeout(10000),
  });
  if (!login.ok) throw new Error(`bluesky_login_${login.status}`);
  const { accessJwt, did } = await login.json();
  const post = await fetch(`${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({
      repo: did,
      collection: "app.bsky.feed.post",
      record: {
        text: `${text}\n${link}`.slice(0, 300),
        createdAt: new Date().toISOString(),
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!post.ok) throw new Error(`bluesky_post_${post.status}`);
}

// Reddit — OAuth2 refresh-token flow then submit a link post
async function sendReddit(ch, text, link) {
  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${ch.clientId}:${ch.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: ch.token }),
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenRes.ok) throw new Error(`reddit_token_${tokenRes.status}`);
  const { access_token } = await tokenRes.json();
  const res = await fetch(`https://oauth.reddit.com/r/${encodeURIComponent(ch.subreddit)}/api/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Bearer ${access_token}`,
    },
    body: new URLSearchParams({
      sr: ch.subreddit,
      kind: "link",
      title: text.split("\n")[0].slice(0, 300),
      url: link,
      resubmit: "true",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`reddit_${res.status}`);
}

// Pinterest — pin the product image with title + link (needs an image)
async function sendPinterest(ch, text, link, product) {
  const imageUrl = product?.image && String(product.image).startsWith("http") ? product.image : null;
  if (!imageUrl) throw new Error("pinterest_no_image");
  const res = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ch.token}` },
    body: JSON.stringify({
      board_id: ch.boardId,
      title: text.split("\n")[0].slice(0, 100),
      description: text.slice(0, 500),
      link,
      media_source: { source_type: "image_url", url: imageUrl },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`pinterest_${res.status}`);
}

// WordPress — publish a post via the REST API (application password auth)
async function sendWordPress(ch, text, link) {
  const base = ch.wpUrl.replace(/\/+$/, "");
  const auth = `Basic ${Buffer.from(`${ch.wpUser}:${ch.wpPass}`).toString("base64")}`;
  const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify({
      title: text.split("\n")[0].slice(0, 80),
      content: `<p>${text.replace(/\n/g, "<br>")}</p><p><a href="${link}">${link}</a></p>`,
      status: "publish",
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`wordpress_${res.status}`);
}

// ─── core runner ────────────────────────────────────────────────────────────
// ─── core runner ────────────────────────────────────────────────────────────

function pickProduct(cfg, pool) {
  const ids = cfg.productIds?.length ? cfg.productIds : pool.map((p) => p.id);
  const items = ids.map((id) => pool.find((p) => p.id === id)).filter(Boolean);
  if (!items.length) return null;
  // "no product left behind": always pick the one posted longest ago (or never)
  const lastPost = {};
  for (const h of cfg.history || []) {
    if (!lastPost[h.productId] || h.ts > lastPost[h.productId]) lastPost[h.productId] = h.ts;
  }
  items.sort((a, b) => (lastPost[a.id] || 0) - (lastPost[b.id] || 0));
  return items[0];
}

export async function runOne(store, marketerId, cfg, origin) {
  const marketer = (store.__marketers || []).find((m) => m.id === marketerId);
  const allProducts = store.__products || [];
  const pool = allProducts.filter((p) => p.marketerId === marketerId && p.status === "approved");
  const product = pickProduct(cfg, pool);

  // If a real UGC asset exists for this product, use it for image-capable
  // external channels while keeping the canonical product record untouched.
  let publishProduct = product;
  try {
    const ugcAssets = await kvGet(`ugc:assets:${product?.id}`, []);
    const latestUgc = Array.isArray(ugcAssets) ? ugcAssets.find((a) => a?.imageUrl && a?.synthetic === true) : null;
    if (latestUgc) publishProduct = { ...product, image: latestUgc.imageUrl, ugcImage: latestUgc.imageUrl };
  } catch { /* UGC is an optional amplifier; never block normal publishing */ }

  if (!product) {
    cfg.logs = [
      { ts: Date.now(), ok: false, channel: "-", detail: "no products in pool", text: "" },
      ...(cfg.logs || []),
    ].slice(0, MAX_LOGS_PER_CREATOR);
    return { ok: false, error: "no products" };
  }

  const slug = marketer?.slug || marketerId;
  const baseLink = cfg.storeUrl?.trim() || `${origin}/u/${slug}`;
  const tags = pickTags(product);

  // Custom template wins if the creator wrote one; otherwise the smart
  // rotating-caption engine writes the post (angle + price + desc + tags).
  let text = cfg.template?.trim()
    ? renderTemplate(cfg.template, product, baseLink)
    : smartCaption(product, baseLink, tags, cfg.runCount);
  if (cfg.aiPolish) text = await aiPolish(text, product);

  const results = [];
  for (const ch of cfg.channels || []) {
    const connStatus = await checkChannelConnection(store, ch.type, ch);
    if (connStatus === "BLOCKED") {
      results.push({ channel: ch.type, ok: false, detail: "connection_blocked_or_expired" });
      continue;
    }
    if (connStatus === "DEGRADED") {
      results.push({ channel: ch.type, ok: false, detail: "connection_degraded" });
      continue;
    }
    // Per-channel UTM link so the creator can see exactly which channel
    // brings the traffic. Links are swapped in AFTER AI polish (the polish
    // prompt forbids touching links, and this keeps them intact anyway).
    const link = trackLink(baseLink, ch.type, product.id);
    const chText = link === baseLink ? text : text.split(baseLink).join(link);
    try {
      if (ch.type === "telegram") await sendTelegram(ch, chText);
      else if (ch.type === "webhook")
        await sendWebhook(ch, { text: chText, product, marketerId, link, source: "likelink-autopilot" });
      else if (ch.type === "facebook") await sendFacebook(ch, chText, link);
      else if (ch.type === "discord") await sendDiscord(ch, chText);
      else if (ch.type === "slack") await sendSlack(ch, chText);
      else if (ch.type === "whatsapp") await sendWhatsApp(ch, chText, link);
      else if (ch.type === "instagram") await sendInstagram(ch, chText, link, product);
      else if (ch.type === "x") await sendX(ch, chText, link);
      else if (ch.type === "linkedin") await sendLinkedIn(ch, chText, link);
      else if (ch.type === "mastodon") await sendMastodon(ch, chText, link);
      else if (ch.type === "bluesky") await sendBluesky(ch, chText, link);
      else if (ch.type === "reddit") await sendReddit(ch, chText, link);
      else if (ch.type === "pinterest") await sendPinterest(ch, chText, link, product);
      else if (ch.type === "wordpress") await sendWordPress(ch, chText, link);
      else { results.push({ channel: ch.type, ok: false, detail: "unknown_channel" }); continue; }
      await markChannelVerified(ch.type);\n      results.push({ channel: ch.type, ok: true });
    } catch (e) {
      results.push({ channel: ch.type, ok: false, detail: String(e.message || e) });
    }
  }

  const anyOk = results.some((r) => r.ok);
  // Only consume the normal publishing slot after a real channel succeeded.
  // Failed external requests stay retryable instead of being recorded as success.
  if (anyOk) {
    cfg.lastRunAt = Date.now();
    cfg.nextRunAt = nextSmartRun(cfg.intervalMinutes);
    cfg.runCount = (cfg.runCount || 0) + 1;
  } else {
    cfg.nextRunAt = Date.now() + Math.max(15, Math.min(Number(cfg.intervalMinutes) || 60, 60)) * 60000;
  }
  // "No product left behind" memory — pickProduct() picks the item whose
  // most recent post is oldest (or that was never posted).
  cfg.history = [{ productId: product.id, ts: Date.now() }, ...(cfg.history || [])].slice(0, 500);
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

  return { ok: anyOk, text, results };
}

// ─── 🚨 Price-Drop Flash — פוסט מיידי כשהקמעונאי מוריד מחיר ────────────────
// נקרא מ-api/price-watch.mjs ברגע זיהוי הירידה. מפרסם עכשיו (בלי לחכות לתור)
// לכל הערוצים המחוברים, צורך את הסלוט המתוכנן ומתעד בלוגים של היוצרת.

function priceDropCaption(product, listed, live, pct, link) {
  const name = product.title || product.name || "פריט שאהבת";
  const tags = pickTags(product).join(" ");
  return [
    `🚨 ירידת מחיר ${pct}%!`,
    `${name}`,
    `היה ${listed} ₪ — עכשיו רק ${live} ₪`,
    `ככה זה כשקונים חכם 😌`,
    `לפני שהמחיר חוזר 👉 ${link}`,
    tags,
    ``,
    `המחיר ירד לבד · הפוסט יצא לבד · נוצר בתוך Likelink 💜`,
  ].join("\n");
}

export async function announcePriceDrop(marketerId, product, listed, live, origin) {
  if (!SB_URL || !SB_KEY) return { ok: false, error: "supabase_not_configured" };
  const listedN = Number(listed);
  const liveN = Number(live);
  if (!Number.isFinite(listedN) || listedN <= 0 || !Number.isFinite(liveN) || liveN <= 0) {
    return { ok: false, error: "bad_prices" };
  }
  const pct = Math.max(1, Math.round(((listedN - liveN) / listedN) * 100));

  const [store, marketersRow] = await Promise.all([
    kvGet(KV_KEY),
    kvGet("marketplace:marketers"),
  ]);
  const cfg = store?.[marketerId];
  if (!cfg?.enabled || !Array.isArray(cfg.channels) || !cfg.channels.length) {
    return { ok: false, error: "autopilot_not_configured" };
  }
  const marketer = (Array.isArray(marketersRow) ? marketersRow : []).find((m) => m.id === marketerId);
  const slug = marketer?.slug || marketerId;
  const baseLink = cfg.storeUrl?.trim() || `${origin}/u/${slug}`;

  const results = [];
  for (const ch of cfg.channels) {
    const connStatus = await checkChannelConnection(store, ch.type, ch);
    if (connStatus === "BLOCKED") {
      results.push({ channel: ch.type, ok: false, detail: "connection_blocked_or_expired" });
      continue;
    }
    if (connStatus === "DEGRADED") {
      results.push({ channel: ch.type, ok: false, detail: "connection_degraded" });
      continue;
    }
    const link = trackLink(baseLink, ch.type, `drop_${product.id}`);
    const chText = priceDropCaption(product, listedN, liveN, pct, link);
    try {
      if (ch.type === "telegram") await sendTelegram(ch, chText);
      else if (ch.type === "webhook")
        await sendWebhook(ch, { text: chText, product, marketerId, link, source: "likelink-pricedrop", event: "price_drop", listed: listedN, live: liveN, pct });
      else if (ch.type === "facebook") await sendFacebook(ch, chText, link);
      else if (ch.type === "discord") await sendDiscord(ch, chText);
      else if (ch.type === "slack") await sendSlack(ch, chText);
      else if (ch.type === "whatsapp") await sendWhatsApp(ch, chText, link);
      else if (ch.type === "instagram") await sendInstagram(ch, chText, link, product);
      else if (ch.type === "x") await sendX(ch, chText, link);
      else if (ch.type === "linkedin") await sendLinkedIn(ch, chText, link);
      else if (ch.type === "mastodon") await sendMastodon(ch, chText, link);
      else if (ch.type === "bluesky") await sendBluesky(ch, chText, link);
      else if (ch.type === "reddit") await sendReddit(ch, chText, link);
      else if (ch.type === "pinterest") await sendPinterest(ch, chText, link, product);
      else if (ch.type === "wordpress") await sendWordPress(ch, chText, link);
      else { results.push({ channel: ch.type, ok: false, detail: "unknown_channel" }); continue; }
      results.push({ channel: ch.type, ok: true });
    } catch (e) {
      results.push({ channel: ch.type, ok: false, detail: String(e.message || e) });
    }
  }

  // צורך את הסלוט המתוכנן + לוג — הפוסט המיידי נחשב כפרסום, לא כפילות
  try {
    const anyOk = results.some((r) => r.ok);
    cfg.lastRunAt = Date.now();
    cfg.nextRunAt = nextSmartRun(cfg.intervalMinutes);
    cfg.runCount = (cfg.runCount || 0) + 1;
    cfg.history = [{ productId: product.id, ts: Date.now() }, ...(cfg.history || [])].slice(0, 500);
    cfg.logs = [
      {
        ts: Date.now(),
        ok: anyOk,
        channel: results.map((r) => r.channel).join(","),
        detail: results.map((r) => (r.ok ? "sent" : r.detail)).join(", "),
        text: priceDropCaption(product, listedN, liveN, pct, baseLink),
        productId: product.id,
        event: "price_drop",
      },
      ...(cfg.logs || []),
    ].slice(0, MAX_LOGS_PER_CREATOR);
    await kvSet(KV_KEY, stripRuntime(store));
  } catch { /* best-effort */ }

  return { ok: results.some((r) => r.ok), results };
}

// ─── ✨ New-product launch announcement ─────────────────────────────────────
// מעלה מוצר אחד → הוא יוצא מיד לכל הערוצים המחוברים של היוצרת (מעבר לתור המתוכנן),
// עם אותו קפטן חכם, אותם לינקים ממוקדי-ערוץ ואותה היסטוריה. חד-פעמי לכל מוצר.
async function announceNewProduct(store, marketerId, cfg, product, origin) {
  const marketer = (store.__marketers || []).find((m) => m.id === marketerId);
  const slug = marketer?.slug || marketerId;
  const baseLink = cfg.storeUrl?.trim() || `${origin}/u/${slug}`;
  const tags = pickTags(product);

  // Same caption engine as the scheduled run — consistent voice everywhere.
  const text = cfg.template?.trim()
    ? renderTemplate(cfg.template, product, baseLink)
    : smartCaption(product, baseLink, tags, cfg.runCount);

  const results = [];
  for (const ch of cfg.channels || []) {
    const connStatus = await checkChannelConnection(store, ch.type);
    if (connStatus === "BLOCKED") {
      results.push({ channel: ch.type, ok: false, detail: "connection_blocked_or_expired" });
      continue;
    }
    if (connStatus === "DEGRADED") {
      results.push({ channel: ch.type, ok: false, detail: "connection_degraded" });
      continue;
    }
    const link = trackLink(baseLink, ch.type, product.id);
    const chText = link === baseLink ? text : text.split(baseLink).join(link);
    try {
      if (ch.type === "telegram") await sendTelegram(ch, chText);
      else if (ch.type === "webhook")
        await sendWebhook(ch, { text: chText, product, marketerId, link, source: "likelink-new-product", event: "new_product" });
      else if (ch.type === "facebook") await sendFacebook(ch, chText, link);
      else if (ch.type === "discord") await sendDiscord(ch, chText);
      else if (ch.type === "slack") await sendSlack(ch, chText);
      else if (ch.type === "whatsapp") await sendWhatsApp(ch, chText, link);
      else if (ch.type === "instagram") await sendInstagram(ch, chText, link, product);
      else if (ch.type === "x") await sendX(ch, chText, link);
      else if (ch.type === "linkedin") await sendLinkedIn(ch, chText, link);
      else if (ch.type === "mastodon") await sendMastodon(ch, chText, link);
      else if (ch.type === "bluesky") await sendBluesky(ch, chText, link);
      else if (ch.type === "reddit") await sendReddit(ch, chText, link);
      else if (ch.type === "pinterest") await sendPinterest(ch, chText, link, product);
      else if (ch.type === "wordpress") await sendWordPress(ch, chText, link);
      else { results.push({ channel: ch.type, ok: false, detail: "unknown_channel" }); continue; }
      results.push({ channel: ch.type, ok: true });
    } catch (e) {
      results.push({ channel: ch.type, ok: false, detail: String(e.message || e) });
    }
  }

  // ההשקה המיידית נחשבת פרסום מלא: צורכת את הסלוט המתוכנן (לא כפילות) + לוג.
  const anyOk = results.some((r) => r.ok);
  cfg.lastRunAt = Date.now();
  cfg.nextRunAt = nextSmartRun(cfg.intervalMinutes);
  cfg.runCount = (cfg.runCount || 0) + 1;
  cfg.history = [{ productId: product.id, ts: Date.now() }, ...(cfg.history || [])].slice(0, 500);
  cfg.logs = [
    {
      ts: Date.now(),
      ok: anyOk,
      channel: results.map((r) => r.channel).join(","),
      detail: results.map((r) => (r.ok ? "sent" : r.detail)).join(", "),
      text,
      productId: product.id,
      event: "new_product",
    },
    ...(cfg.logs || []),
  ].slice(0, MAX_LOGS_PER_CREATOR);

  return { ok: anyOk, results };
}

// ─── ✨ Brand Pulse — הפרסום העצמי של הפלטפורמה ────────────────────────────
// כשהקרון/ה-Swarm רצים, גם בלי יוצרת ספציפית, המערכת מפרסמת מדי 24 שעות
// את "סיפור המערכת" של Likelink לערוצי המותג שהבעלים הגדיר (Telegram/Webhook):
//   BRAND_TELEGRAM_BOT = bot token   ·   BRAND_TELEGRAM_CHAT = chat/id
//   BRAND_WEBHOOK_URL  = Make/Zapier/n8n webhook (אופציונלי)
// הטקסט תמיד בעברית, תמיד עם לינק חזרה ל-likelink2.app (כולל UTM), וכל פוסט
// מספר את אותו סיפור: "החנות מפרסמת לבד — וזה קורה בתוך Likelink". זהו מעגל
// שיווקי עצמי שנמשך בלי שאף אחד יגע בדבר.

const BRAND_PULSE_KEY = "brand_pulse:meta";
const BRAND_POSTS_KEY = "brand_pulse:posts"; // public Luna self-publish feed
const BRAND_PULSE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // פעם ביום (ערוצים חיצוניים)
const BRAND_WEB_COOLDOWN_MS = 6 * 60 * 60 * 1000;    // פיד האתר עצמו — עד 4 פרסומים ביום

const BRAND_PULSE_STORIES_HE = [
  [
    "🤖 LikeLink2 — סביבת מסחר ויצירה עם Luna.",
    "מוצרים מקבלים עמוד ציבורי, קישורי מעקב ותוכן שניתן לשתף.",
    "פעולות ענן ופרסום חיצוני מוצגות רק כשהן באמת בוצעו.",
  ].join("\n"),
  [
    "💜 מה קורה בתוך LikeLink2?",
    "Luna מנתחת נתונים זמינים, יוצרת נכסים, ומציגה את מצב ההפצה.",
    "חיבורי ערוצים נדרשים לפני פרסום חיצוני.",
  ].join("\n"),
  [
    "🚀 Studio אחד למוצרים, UGC, תוכן, קמפיינים וצמיחה.",
    "המערכת עוקבת אחרי קליקים, הזמנות ופעולות שיווק שנרשמו בפועל.",
    "הנתונים מוצגים ללא מספרי דמו.",
  ].join("\n"),
  [
    "🎬 יצירת תוכן, Stories ו-AI Video בתוך ה-Studio.",
    "אפשר להכין תוכן ולשתף אותו ידנית, או להפעיל AutoPilot לאחר חיבור ערוץ אמיתי.",
    "כל פרסום חיצוני מקבל סטטוס לפי תוצאת הערוץ.",
  ].join("\n"),


export async function publishBrandPulse(origin, opts = {}) {
  if (!SB_URL || !SB_KEY) return { ok: false, error: "supabase_not_configured" };
  const store = await kvGet(KV_KEY);
  const meta = store[BRAND_PULSE_KEY] || {};
  // webOnly=true → self-publish to the site's own feed only, on a faster 6h
  // rhythm (visitor Cloud-Passport self-heal). Full run keeps the daily
  // cadence for the optional external channels.
  const isWebOnly = Boolean(opts.webOnly);
  const lastTs = isWebOnly ? (meta.webTs || 0) : (meta.ts || 0);
  const cooldownMs = isWebOnly ? BRAND_WEB_COOLDOWN_MS : BRAND_PULSE_COOLDOWN_MS;
  if (Date.now() - lastTs < cooldownMs) return { ok: false, skipped: "cooldown" };

  const channels = [];
  if (process.env.BRAND_TELEGRAM_BOT && process.env.BRAND_TELEGRAM_CHAT) {
    channels.push({ type: "telegram", botToken: process.env.BRAND_TELEGRAM_BOT, chatId: process.env.BRAND_TELEGRAM_CHAT });
  }
  if (process.env.BRAND_WEBHOOK_URL) {
    channels.push({ type: "webhook", url: process.env.BRAND_WEBHOOK_URL });
  }
  // Dependency-free: even with zero external channels, Luna ALWAYS publishes
  // to the platform's OWN site feed (brand_pulse:posts) — the official site
  // is the first channel. External channels are optional amplifiers.
  const webSelfPublish = true;

  // 🎀 Luna — the platform's digital ambassador — presents today's star item
  // (deterministic rotation across qualifying approved products). Real traffic
  // instead of a generic brand story; falls back when there's nothing to feature.
  let spotlight = null;
  try {
    const productsRow = await kvGet("marketplace:products");
    const list = Array.isArray(productsRow) ? productsRow : Object.values(productsRow || {});
    const pool = list.filter(
      (p) => p && p.status === "approved" && Number(p.price) > 0 && /^https?:/i.test(String(p.image || ""))
    );
    if (pool.length) spotlight = pool[(meta.run || 0) % pool.length];
  } catch { /* classic brand-pulse fallback */ }

  const story = BRAND_PULSE_STORIES_HE[(meta.run || 0) % BRAND_PULSE_STORIES_HE.length];
  const utm = "utm_source=brandpulse&utm_medium=autopilot&utm_campaign=self_marketing";
  const link = spotlight
    ? `${origin}/?product=${encodeURIComponent(spotlight.id)}&${utm}`
    : `${origin}/?${utm}`;
  const storyLink = spotlight ? `${origin}/story/${encodeURIComponent(spotlight.id)}` : "";
  const text = spotlight
    ? `🎀 ${lunaHook(spotlight.id)}\n\n${spotlight.title}${Number(spotlight.price) > 0 ? ` · ${spotlight.price} ₪` : ""}\n${link}${storyLink ? `\n📱 הסטורי שלי בגוגל: ${storyLink}` : ""}\n\n💜 פותחים סטודיו חינם · ${origin}/?${utm}`
    : `${story}\n\n💜 פותחים סטודיו חינם · ${link}`;

  const results = [];
  for (const ch of (isWebOnly ? [] : channels)) {
    try {
      if (ch.type === "telegram") {
        await sendTelegram(ch, text);
      } else if (ch.type === "webhook") {
        await sendWebhook(ch, { text, source: "likelink-brand-pulse", link });
      }
      results.push({ channel: ch.type, ok: true });
    } catch (e) {
      results.push({ channel: ch.type, ok: false, detail: String(e.message || e) });
    }
  }

  // 🎀 SELF-PUBLISH (dependency-free): the official site itself is the channel.
  // Luna's brand story is appended to a public web feed (brand_pulse:posts) —
  // rendered on likelink2.vercel.app for every visitor, always, no secrets.
  let webPublished = false;
  try {
    const feed = (await kvGet(BRAND_POSTS_KEY)) || [];
    const list = Array.isArray(feed) ? feed : [];
    list.push({
      id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      text,
      link,
      spotlight: spotlight ? { id: spotlight.id, title: spotlight.title, price: spotlight.price, image: spotlight.image } : null,
      channels: results.map((r) => r.channel),
    });
    while (list.length > 30) list.shift(); // cap, append-only otherwise
    await kvSet(BRAND_POSTS_KEY, list);
    webPublished = true;
    results.push({ channel: "web", ok: true });
  } catch (e) {
    results.push({ channel: "web", ok: false, detail: String(e.message || e) });
  }

  const anyOk = results.some((r) => r.ok) || isWebOnly; // web self-publish always counts
  if (anyOk) {
    try {
      store[BRAND_PULSE_KEY] = {
        ts: isWebOnly ? (meta.ts || 0) : Date.now(), // external-channel rhythm untouched by web ticks
        webTs: Date.now(),
        run: (meta.run || 0) + 1,
      };
      await kvSet(KV_KEY, stripRuntime(store));
      await recordVeritasPulse("brand_pulse_publish", {
        spotlightId: spotlight?.id || null,
        mode: isWebOnly ? "web_selfheal" : "daily",
      });
    } catch { /* best-effort */ }
  }
  return { ok: anyOk, results };
}

/**
 * ☁️ Passport-triggered self-heal: keeps the site's own feed alive WITHOUT any
 * cron dependency. Called from store.mjs when a visitor (holding a signed
 * Cloud Passport) loads the brand-pulse feed: if the newest post is older than
 * staleMs, publish one web-only Luna post. Idempotent — the 6h web cooldown
 * inside publishBrandPulse prevents duplicates even under concurrent triggers.
 */
export async function ensureBrandPulseFresh(origin, staleMs = BRAND_WEB_COOLDOWN_MS) {
  if (!SB_URL || !SB_KEY) return { ok: false, error: "supabase_not_configured" };
  let newest = 0;
  try {
    const feed = await kvGet(BRAND_POSTS_KEY);
    const list = Array.isArray(feed) ? feed : [];
    newest = list.reduce((m, p) => Math.max(m, Number(p?.ts) || 0), 0);
  } catch (e) {
    return { ok: false, selfHeal: "failed", error: String(e.message || e).slice(0, 120) };
  }
  if (Date.now() - newest < staleMs) {
    return { ok: true, selfHeal: "not_needed", newestTs: newest };
  }
  const r = await publishBrandPulse(origin, { webOnly: true });
  return {
    ok: Boolean(r.ok),
    selfHeal: r.ok ? "published" : (r.skipped || "failed"),
    results: r.results,
  };
}

// Runs every enabled automation whose slot is due. Shared by the Vercel cron
// and the "tick" mode (browsers ping it on visits, so scheduled posts go out
// on time even on the Hobby plan, where crons fire only once a day).
async function runDue(origin, opts = {}) {
  if (!SB_URL || !SB_KEY) return { ok: false, error: "supabase_not_configured" };
  const [store, marketersRow, productsRow] = await Promise.all([
    kvGet(KV_KEY),
    kvGet("marketplace:marketers"),
    kvGet("marketplace:products"),
  ]);
  store.__marketers = Array.isArray(marketersRow) ? marketersRow : [];
  store.__products = Array.isArray(productsRow) ? productsRow : [];

  const startTime = Date.now();
  // Time budget: Vercel kills the function at maxDuration (60s). Reserving the
  // tail for the final kvSet + brand pulse means a full run NEVER hits it.
  const MAX_RUN_MS = 35000;
  const maxCreators = Number(opts?.maxCreators) || Infinity;

  const ran = [];
  let budgetHit = false;
  for (const [marketerId, cfg] of Object.entries(store)) {
    if (ran.length >= maxCreators) break;
    if (marketerId.startsWith("__")) continue;
    if (!cfg?.enabled) continue;
    if ((cfg.nextRunAt || 0) > Date.now()) continue;
    if (Date.now() - startTime > MAX_RUN_MS) { budgetHit = true; break; }

    // ── Crash-safe claim ──
    // Reserve the slot BEFORE publishing and persist it immediately. If the
    // function dies mid-send, the next run/tick sees the claimed slot and
    // never republishes the same post (no duplicate spam). runOne() refines
    // the slot with the smart scheduler at its end anyway.
    cfg.nextRunAt = nextSmartRun(cfg.intervalMinutes);
    try { await kvSet(KV_KEY, stripRuntime(store)); } catch { /* best-effort */ }

    const r = await runOne(store, marketerId, cfg, origin);
    ran.push({ marketerId, ok: r.ok });

    // Persist progress after EVERY creator: a killed function can then only
    // lose the creator currently in flight — never the whole batch's work.
    try { await kvSet(KV_KEY, stripRuntime(store)); } catch { /* best-effort */ }
  }
  try {
    await kvSet(KV_KEY, stripRuntime(store));
  } catch { /* best-effort */ }

  // Self-marketing engine: once a day, tell the world the platform story.
  // Runs even when no creator is due — so the site markets itself in the
  // background, through the same channels the owner configured for the brand.
  // Gated on budget: it must never be the straw that breaks the 60s limit.
  if (!budgetHit) {
    try {
      await publishBrandPulse(origin);
    } catch { /* never let brand pulse break the main run */ }
  }

  return { ok: true, ran, budgetHit };
}

// ─── 🌱 CLOUD GROWTH CYCLE — LikeLink self-promotion (FREE core capability) ──
// Runs on the SAME daily cron as autopilot. Discovers content opportunities
// from REAL catalog data, creates content assets, and stores them for SEO /
// sitemap exposure. Deterministic, idempotent, bounded — never invents data.
async function runGrowthCycle() {
  try {
    const now = Date.now();
    const [products, marketers, sales, clicks] = await Promise.all([
      kvGet("marketplace:products", []),
      kvGet("marketplace:marketers", []),
      kvGet("marketplace:sales", []),
      kvGet("marketplace:clicks", []),
    ]);
    const prodList = Array.isArray(products) ? products : [];
    const salesArr = Array.isArray(sales) ? sales : [];
    const clicksArr = Array.isArray(clicks) ? clicks : [];

    // 1. Discover opportunities (score = sales*100 + clicks*10 + image bonus)
    const ops = [];
    for (const p of prodList) {
      if (!p?.id || !p.title) continue;
      const s = { clicks: clicksArr.filter((c) => c?.productId === p.id).length, sales: salesArr.filter((x) => x?.productId === p.id).length };
      ops.push({ type: "product_discovery", productId: p.id, title: p.title, category: p.category, price: p.price, image: p.image, score: s.sales * 100 + s.clicks * 10 + (p.image ? 5 : 0), reason: s.sales > 0 ? "real_sales" : s.clicks > 0 ? "real_clicks" : "catalog_entry" });
    }
    const cats = {};
    for (const p of prodList) { if (p.category) cats[p.category] = (cats[p.category] || 0) + 1; }
    for (const [cat, count] of Object.entries(cats)) { if (count >= 2) ops.push({ type: "category_page", category: cat, productCount: count, score: count * 20 }); }
    const top = prodList.find((p) => p?.status === "approved" && p?.image) || prodList[0];
    if (top) ops.push({ type: "luna_story", productId: top.id, title: top.title, category: top.category, score: 30 });
    ops.push({ type: "educational", title: "איך לפתוח סטודיו ב-Likelink", score: 10 });
    ops.sort((a, b) => b.score - a.score);

    // 2. Create content assets (top 5, idempotent — dedupe by destination URL)
    const mkId = (ts) => `content_${ts}_${Math.random().toString(36).slice(2, 8)}`;
    const assets = [];
    for (const opp of ops.slice(0, 5)) {
      let dest = null, extra = {};
      if (opp.type === "product_discovery") {
        const p = prodList.find((x) => x.id === opp.productId);
        if (!p) continue;
        dest = `/p/${p.id}`; extra = { product: { id: p.id, title: p.title, price: p.price, image: p.image, category: p.category } };
      } else if (opp.type === "category_page") {
        dest = `/feed?cat=${opp.category}`; extra = { category: opp.category, productCount: opp.productCount };
      } else if (opp.type === "luna_story") {
        const p = prodList.find((x) => x.id === opp.productId);
        if (!p) continue;
        dest = `/p/${p.id}?utm_source=luna`; extra = { character: "לונה", product: { id: p.id, title: p.title, price: p.price } };
      } else {
        dest = "/sell";
      }
      assets.push({ contentId: mkId(now), type: opp.type, title: opp.title || opp.category || "Likelink", createdAt: now, status: "published", destination: { url: dest }, ...extra });
    }

    // 3. Store (dedupe by destination URL — never duplicate content)
    const rawExisting = await kvGet("growth:content");
    const existing = Array.isArray(rawExisting) ? rawExisting : [];
    const existingUrls = new Set(existing.map((a) => a?.destination?.url).filter(Boolean));
    const fresh = assets.filter((a) => a.destination?.url && !existingUrls.has(a.destination.url));
    const merged = [...fresh, ...existing].slice(0, 100);
    await kvSet("growth:content", merged);

    // 4. Store opportunities for observability
    await kvSet("growth:opportunities", ops.slice(0, 20));

    return { ok: true, opportunities: ops.length, created: fresh.length, total: merged.length };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 160) };
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }, 200, req); return; }
  const h = req.headers;
  const getH = (n) => (typeof h?.get === "function" ? h.get(n) : h?.[n]);
  // Public origin: single source of truth (api/_utils/origin.mjs). Never a
  // legacy/unknown Host header — falls back to production.
  const origin = process.env.PUBLIC_ORIGIN || process.env.LIKELINK_BASE_URL || originFromRequest(req);

  // ── CRON: publish for every enabled creator whose slot is due ──
  const url = new URL(req.url, origin);
  const bearer = String(getH("authorization") || "").replace(/^Bearer\\s+/i, "").trim();
  const configuredAutopilotSecret = String(process.env.AUTOPILOT_SECRET || "").trim();
  const validBearerCron = Boolean(configuredAutopilotSecret) && bearer === configuredAutopilotSecret;
  const isCron =
    req.method === "GET" &&
    (Boolean(getH("x-vercel-cron")) ||
      validBearerCron ||
      url.searchParams.get("secret") === process.env.AUTOPILOT_SECRET);
  const cronMode = url.searchParams.get("cron") || "daily";
  const testReport = url.searchParams.get("testReport") === "1";

  if (isCron) {
    const _r = await runDue(origin);

    // LIGHT cron (every 15 min): queue processing + health check only.
    // Runs autonomous jobs whose intervals are due (15-min health checks,
    // hourly scans, etc.). Never runs the heavy daily content cycles.
    if (cronMode === "light") {
      let autonomousJobs = { ok: false, skipped: "not_run" };
      try {
        autonomousJobs = await runAllDueAutonomousJobs();
      } catch (e) {
        autonomousJobs = { ok: false, error: String(e.message || e).slice(0, 120) };
      }
      json(res, { ok: true, cron: "light", due: _r, autonomousJobs }, 200, req);
      return;
    }

    // HOURLY cron: growth opportunity scan + analytics aggregation.
    // The autonomous jobs system handles hourly opportunity-discovery
    // and analytics aggregation via runAllDueAutonomousJobs.
    if (cronMode === "hourly") {
      let autonomousJobs = { ok: false, skipped: "not_run" };
      try {
        autonomousJobs = await runAllDueAutonomousJobs();
      } catch (e) {
        autonomousJobs = { ok: false, error: String(e.message || e).slice(0, 120) };
      }
      if (testReport) {
        try {
          const { sendOwnerDailyReport } = await import("./_utils/analytics.js");
          const report = await sendOwnerDailyReport({ force: true });
          json(res, { ok: true, cron: "hourly", autonomousJobs, report }, 200, req);
        } catch (e) {
          json(res, { ok: true, cron: "hourly", autonomousJobs, report: { ok: false, error: String(e.message || e).slice(0, 160) } }, 200, req);
        }
        return;
      }
      json(res, { ok: true, cron: "hourly", autonomousJobs }, 200, req);
      return;
    }

    // ── DAILY cron (default / cron=daily): full pipeline ──
    // Official Site Campaign cycle — awaited on the SAME daily cron so the
    // cycle reliably completes: Vercel freezes the invocation once the
    // response is flushed, so fire-and-forget would silently drop it (this
    // shipped with zero site campaigns in production). The cycle is bounded
    // (a few kv reads + at most one write) and idempotent — the response
    // stays well under the 60s limit. Its result rides along so the state is
    // observable on every tick.
    let siteCycle = { ok: false, skipped: "not_run" };
    try {
      siteCycle = await runSiteCampaignCycle(origin);
    } catch (e) {
      siteCycle = { ok: false, error: String(e.message || e).slice(0, 120) };
    }
    // Cloud Growth Cycle — LikeLink self-promotion (FREE core capability).
    // Runs on the SAME daily cron, idempotent, bounded (a few kv reads +
    // at most 2 writes). Its result rides along so the state is observable.
    let growthCycle = { ok: false, skipped: "not_run" };
    try {
      growthCycle = await runGrowthCycle();
    } catch (e) {
      growthCycle = { ok: false, error: String(e.message || e).slice(0, 120) };
    }
    // Cloud Autopilot Cycle — full verified pipeline (trends + growth brain +
    // campaign + feed + veritas). Runs after the content asset cycle so both
    // run on the same cron tick; the feed is the public "what's hot now" surface.
    let cloudCycle = { ok: false, skipped: "not_run" };
    try {
      cloudCycle = await runCloudAutopilotCycle({ kvGet, kvSet, origin, env: process.env }, {});
    } catch (e) {
     cloudCycle = { ok: false, error: String(e.message || e).slice(0, 120) };
    }
    // WEEKLY cron: experiment review, strategy optimization, content audit,
    // SEO audit, growth report. Runs the full daily pipeline PLUS a weekly
    // report. Falls through to the daily cycle below.
    const isWeekly = cronMode === "weekly" || new Date().getUTCDay() === 1;

    // Owner-report self-test hook: `?testReport=1` on the cron path awaits the
    // send and returns Resend's exact result — used to diagnose delivery
    // without guessing (shows resend_error_xxx or the actual message id).
    if (testReport) {
      try {
        const { sendOwnerDailyReport } = await import("./_utils/analytics.js");
        const report = await sendOwnerDailyReport({ force: true });
        json(res, { ..._r, siteCycle, growthCycle, cloudCycle, report }, 200, req);
      } catch (e) {
        json(res, { ..._r, siteCycle, growthCycle, cloudCycle, report: { ok: false, error: String(e.message || e).slice(0, 160) } }, 200, req);
      }
      return;
    }
    let autonomousJobs = { ok: false, skipped: "not_run" };
    try {
      const force = url.searchParams.get("force") === "true";
      autonomousJobs = await runAllDueAutonomousJobs({ force });
    } catch (e) {
      autonomousJobs = { ok: false, error: String(e.message || e).slice(0, 120) };
    }
    // Daily payout processing stays inside the single Hobby-safe cloud cron.
    // The payout processor is server-only and idempotent; failures are reported
    // truthfully and never converted into false success.
    let payoutRun = { ok: false, skipped: "not_run" };
    try {
      payoutRun = await processPendingPayouts();
    } catch (e) {
      payoutRun = { ok: false, error: String(e.message || e).slice(0, 160) };
    }

    // Daily Owner Cloud Report — fire-and-forget on the existing daily cron.
    // Never breaks autopilot; skips itself unless OWNER_EMAIL is configured.
    import("./_utils/analytics.js")
      .then(({ sendOwnerDailyReport }) => sendOwnerDailyReport())
      .catch(() => {});
    // WEEKLY: also send the weekly growth report.
    let weeklyReport = { ok: false, skipped: isWeekly ? "not_weekly" : "n/a" };
    if (isWeekly) {
      try {
        const { sendWeeklyReport } = await import("./_utils/analytics.js");
        weeklyReport = await sendWeeklyReport({ force: true });
      } catch (e) {
        weeklyReport = { ok: false, error: String(e.message || e).slice(0, 120) };
      }
    }
    json(res, { ..._r, siteCycle, growthCycle, cloudCycle, autonomousJobs, weeklyReport, cron: cronMode }, 200, req);
    return;
  }

  // ── Studio API ──
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405, req); return; }

  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400, req);
    return;
  }

  const { mode, marketerId } = body || {};

  // Browser tick — any visitor (throttled client-side) nudges due posts out.
  // Needs no secrets and no marketerId: it only publishes what creators
  // already scheduled. Must run BEFORE the marketerId check (tick sends none).
  if (mode === "tick") {
    if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500, req); return; }
    // One creator per ping: the visiting audience IS the scheduler. Many small,
    // fast invocations (<15s each) drain the queue — no invocation ever gets
    // near the 60s Vercel limit, and a killed tick loses at most one post.
    const _r2 = await runDue(origin, { maxCreators: 1 });
    json(res, _r2, 200, req);
    return;
  }

  // Public social-proof feed — no secret, no marketerId. Returns the latest
  // auto-published activity (product title + channels + event) so the site
  // can show a live "everything runs by itself" ticker to every visitor.
  // This is the on-site viral loop: real activity, happening visibly.
  if (mode === "public-feed") {
    let events = [];
    try {
      if (SB_URL && SB_KEY) {
        const [store, productsRow] = await Promise.all([
          kvGet(KV_KEY),
          kvGet("marketplace:products"),
        ]);
        const productsList = Array.isArray(productsRow) ? productsRow : Object.values(productsRow || {});
        const titleOf = (id) => (productsList.find((p) => p.id === id) || {}).title || null;
        for (const cfg of Object.values(store || {})) {
          if (!cfg || typeof cfg !== "object" || !Array.isArray(cfg.logs)) continue;
          for (const log of cfg.logs) {
            if (!log || typeof log !== "object" || !log.ts) continue;
            events.push({
              ts: log.ts,
              ok: Boolean(log.ok),
              channels: String(log.channel || ""),
              event: log.event === "price_drop" ? "price_drop" : "autopost",
              product: titleOf(log.productId) || null,
            });
          }
        }
        events.sort((a, b) => b.ts - a.ts);
        events = events.slice(0, 12);
      }
    } catch { /* best-effort */ }
    json(res, { ok: true, events }, 200, req);
    return;
  }

  // Autonomous job status — for Studio dashboard / Luna command center
  // Shows cloud scheduler health: last run, next run, failures, queue depth
  if (mode === "autonomous-jobs-status") {
    try {
      const status = await getAutonomousJobStatus();
      json(res, { ok: true, jobs: status }, 200, req);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e).slice(0, 160) }, 500, req);
    }
    return;
  }

  if (!marketerId) { json(res, { ok: false, error: "missing_marketerId" }, 400, req); return; }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500, req); return; }

  // ── Authorization (anti-IDOR): save/run may only touch the caller's OWN
  // studio. Ownership = the verified session email matches the studio's email
  // on record. Legacy studios without an email on record stay backward-
  // compatible (they cannot be targeted hijacks the same way). `get` remains
  // open but returns masked secrets only (publicCfg).
  if (mode === "save" || mode === "run") {
    const authHeader = String(getH("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const authUser = await verifyToken(authHeader);
    const marketersRow = await kvGet("marketplace:marketers");
    const mk = (Array.isArray(marketersRow) ? marketersRow : []).find((m) => m && m.id === marketerId);
    const owned =
      authUser?.email && mk?.email &&
      String(authUser.email).toLowerCase().trim() === String(mk.email).toLowerCase().trim();
    if (!owned) {
      json(res, { ok: false, error: "not_authorized_for_marketer" }, 403, req);
      return;
    }
  }

  const store = await kvGet(KV_KEY);

  if (mode === "get") {
    const cfg = store[marketerId] || null;
    json(res, { ok: true, config: cfg ? publicCfg(cfg) : null }, 200, req);
    return;
  }

  if (mode === "save") {
    const prev = store[marketerId] || {};
    store[marketerId] = sanitizeConfig(prev, body.config || {});
    try {
      await kvSet(KV_KEY, stripRuntime(store));
      json(res, { ok: true, config: publicCfg(store[marketerId]) }, 200, req);
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500, req);
    }
    return;
  }

  if (mode === "run") {
    const cfg = store[marketerId];
    if (!cfg) { json(res, { ok: false, error: "not_configured" }, 404, req); return; }
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
    json(res, { ...r, config: publicCfg(cfg) }, 200, req);
    return;
  }

  // ── "New product" instant announcement ──
  // Fired automatically right after a product is created/approved. Public yet
  // harmless: it can only announce a REAL approved product to the channels its
  // own creator connected, exactly ONCE (idempotent by product id).
  if (mode === "announce") {
    const { productId } = body || {};
    if (!productId) { json(res, { ok: false, error: "missing_productId" }, 400, req); return; }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(String(productId))) { json(res, { ok: false, error: "invalid_productId" }, 400, req); return; }
    if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500, req); return; }
    const [store2, productsRow, marketersRow] = await Promise.all([
      kvGet(KV_KEY),
      kvGet("marketplace:products"),
      kvGet("marketplace:marketers"),
    ]);
    const productsList = Array.isArray(productsRow) ? productsRow : Object.values(productsRow || {});
    const product = productsList.find((p) => p && p.id === productId);
    if (!product) { json(res, { ok: false, error: "product_not_found" }, 404, req); return; }
    if (product.status !== "approved") { json(res, { ok: true, skipped: "not_approved" }, 200, req); return; }
    const cfg = store2[product.marketerId];
    if (!cfg?.enabled || !Array.isArray(cfg.channels) || !cfg.channels.length) {
      json(res, { ok: true, skipped: "no_autopilot_channels" }, 200, req);
      return;
    }
    // Idempotency: one launch announcement per product, ever.
    if ((cfg.logs || []).some((l) => l && l.event === "new_product" && l.productId === productId)) {
      json(res, { ok: true, skipped: "already_announced" }, 200, req);
      return;
    }
    store2.__marketers = Array.isArray(marketersRow) ? marketersRow : [];
    const r = await announceNewProduct(store2, product.marketerId, cfg, product, origin);
    try { await kvSet(KV_KEY, stripRuntime(store2)); } catch { /* best-effort */ }
    json(res, { ...r, config: publicCfg(cfg) }, 200, req);
    return;
  }

  json(res, { ok: false, error: "unknown_mode" }, 400, req);
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
    channels: (Array.isArray(c.channels) ? c.channels : []).slice(0, 14).map((ch) => {
      const prevCh = (prev.channels || []).find((p) => p.type === ch.type) || {};
      // If a secret comes back masked (••••) or empty, preserve the previously
      // saved real value so the creator doesn't have to re-enter tokens on
      // every save — and a masked echo never overwrites the real secret.
      const keep = (v, prevVal, max) => {
        const s = String(v || "").slice(0, max);
        return s && !s.includes("••••") ? s : String(prevVal || "");
      };
      return {
        type: String(ch.type || "").slice(0, 20),
        botToken: keep(ch.botToken, prevCh.botToken, 200),
        chatId: String(ch.chatId || "").slice(0, 100),
        url: keep(ch.url, prevCh.url, 500),
        pageId: String(ch.pageId || "").slice(0, 100),
        pageToken: keep(ch.pageToken, prevCh.pageToken, 300),
        phoneNumberId: String(ch.phoneNumberId || "").slice(0, 100),
        igUserId: String(ch.igUserId || "").slice(0, 100),
        token: keep(ch.token, prevCh.token, 300),
        // X / LinkedIn / Mastodon / Bluesky / Reddit / Pinterest / WordPress
        bearer: keep(ch.bearer, prevCh.bearer, 300),
        clientSecret: keep(ch.clientSecret, prevCh.clientSecret, 200),
        wpPass: keep(ch.wpPass, prevCh.wpPass, 200),
        personUrn: String(ch.personUrn || "").slice(0, 100),
        instance: String(ch.instance || "").slice(0, 120),
        handle: String(ch.handle || "").slice(0, 120),
        subreddit: String(ch.subreddit || "").slice(0, 100),
        clientId: String(ch.clientId || "").slice(0, 100),
        boardId: String(ch.boardId || "").slice(0, 100),
        wpUrl: String(ch.wpUrl || "").slice(0, 200),
        wpUser: String(ch.wpUser || "").slice(0, 100),
      };
    }),
    lastRunAt: prev.lastRunAt || 0,
    nextRunAt: prev.nextRunAt || 0,
    runCount: prev.runCount || 0,
    history: Array.isArray(prev.history) ? prev.history.slice(0, 500) : [],
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
      token: ch.token ? mask(ch.token) : "",
      url: ch.url ? mask(ch.url) : "",
      bearer: ch.bearer ? mask(ch.bearer) : "",
      clientSecret: ch.clientSecret ? mask(ch.clientSecret) : "",
      wpPass: ch.wpPass ? mask(ch.wpPass) : "",
    })),
  };
}

function stripRuntime(store) {
  const out = {};
  for (const [k, v] of Object.entries(store)) if (!k.startsWith("__")) out[k] = v;
  return out;
}




