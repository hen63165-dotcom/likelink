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

function json(res, obj, status = 200) {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.json(obj);
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
  (n) => `🔥 הפריט שכולן שואלות עליו: ${n}`,
  (n) => `💜 הממלצת האישית שלי השבוע: ${n}`,
  (n) => `✨ פינוק קטן שעושה את היום: ${n}`,
  (n) => `🎁 רעיון מושלם למתנה — ${n}`,
  (n) => `⭐ הפריט שהכי נמכר אצלי: ${n}`,
  (n) => `🛍️ הלוק שהעלתי וכולן ביקשו: ${n}`,
  (n) => `💥 רגע לפני שהמלאי נגמר: ${n}`,
  (n) => `🌙 סוף שבוע בסטייל — ${n}`,
  (n) => `🤍 קלאסיקה שמתאימה להכל: ${n}`,
  (n) => `📸 חזר למלאי לפי בקשות: ${n}`,
];

// ─── 2026 hook upgrade: curiosity-gap + urgency + social-proof angles ──────
// מבוסס דפוסי שיווק עדכניים: FOMO, סקרנות (curiosity gap), הוכחה חברתית,
// סיפור אישי והזדמנות-לתת. כל הוק נכתב כך שיעבוד בכל רשת — טקסט קצר,
// אימוג'י אחד חזק, והמוצר בסוף.
const ANGLES_2026_HE = [
  (n) => `🤫 שום אחת לא סיפרה לך על זה: ${n}`,
  (n) => `👀 עצרו הכל — זה חזר למלאי: ${n}`,
  (n) => `😭 קיבלתי 14 הודעות על זה ביום אחד: ${n}`,
  (n) => `⚡ יש לי רק 3 — מי מהן תספיק? ${n}`,
  (n) => `🧸 הדבר הכי חמוד שיצא לי להביא: ${n}`,
  (n) => `🫶 הפריט שלקחתי לעצמי אבל משאירה לך: ${n}`,
  (n) => `🔥 נשרף תוך 48 שעות פעם קודמת — חזר: ${n}`,
  (n) => `💬 "מאיפה הבאת את זה?!" — התשובה: ${n}`,
  (n) => `🌱 הבחירה שכולן עוברות אליה השנה: ${n}`,
  (n) => `🎀 לחברה הכי טובה שלך (או לעצמך, אני לא שופטת): ${n}`,
  (n) => `📦 החבילה שתרצי לפתוח שוב ושוב: ${n}`,
  (n) => `🤯 לא תאמיני כמה זה עולה: ${n}`,
];

// סגנון סיפורי "פיקסאר" — מיני-סיפור 3 שורות שמחבר רגשית לפני שמציג מחיר.
// משמש כל 6–7 פוסטים (postCount % 6 === 4) כדי לגוון את הפיד.
const STORY_ARCS_2026_HE = [
  (n, price) => `היא חיפשה משהו שיזכיר לה את הבית.\nמצאה את זה — וכל החברות שאלו איפה.\n${n} · ${price} ₪`,
  (n, price) => `היום זה יום ההולדת של אמא שלי.\nקניתי לה את זה — והיא בכתה (מהטוב).\n${n} · ${price} ₪`,
  (n, price) => `הניחתי את זה על השולחן וזה שינה את הכל.\nהאורחות, האווירה, התמונות.\n${n} · ${price} ₪`,
  (n, price) => `פעם חשבתי שקנייה כזו היא בזבוז.\nאחרי שקיבלתי 12 מחמאות בשבוע — שיניתי דעה.\n${n} · ${price} ₪`,
  (n, price) => `יש פריטים שקונים, ויש פריטים שזוכרים.\nזה מהסוג השני.\n${n} · ${price} ₪`,
  (n, price) => `החברה שלי גנבה לי את זה.\nפעמיים.\nלכן עכשיו יש לי שלושה. ${n} · ${price} ₪`,
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
              "את עוזרת שיווקית של יוצרות תוכן בישראל. שפרי את טקסט הפרסום: עברית קליטה ואנרגטית, 2–3 אימוג'ים, וסיימי בקריאה לפעולה לכניסה לחנות. אל תשני ואל תמחקי קישורים, מחירים והאשטגים קיימים. אל תמציאי מחירים או פרטים. החזירי רק את הטקסט.",
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
      else results.push({ channel: ch.type, ok: false, detail: "unknown_channel" });
      results.push({ channel: ch.type, ok: true });
    } catch (e) {
      results.push({ channel: ch.type, ok: false, detail: String(e.message || e) });
    }
  }

  const anyOk = results.some((r) => r.ok);
  cfg.lastRunAt = Date.now();
  // Smart scheduling: respect the interval but never post at night (IL time).
  cfg.nextRunAt = nextSmartRun(cfg.intervalMinutes);
  cfg.runCount = (cfg.runCount || 0) + 1;
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

  return { ok: true, text, results };
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
const BRAND_PULSE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // פעם ביום

const BRAND_PULSE_STORIES_HE = [
  [
    "🤖 אפס עבודה, חנות מלאה.",
    "מוכרת אחת עלתה ל-Likelink אתמול: הדביקה לינק אחד, בחרה סגנון, ולחצה 'פרסם'.",
    "היום המערכת שלחה לבד את הפוסט לערוצים שלה, תייגה את ההאשטגים הנכונים, וספרה לה את הקליקים.",
    "בלי CapCut. בלי צילומי וידאו. בלי ידע טכני.",
  ].join("\n"),
  [
    "💜 מה הופך חנות סטודיו לחנות 'שרצה לבד'?",
    "ב-Likelink כל מוצר מקבל עמוד ציבורי יפה, כל קליק נספר, כל מכירה מתועדת.",
    "הפרסום יוצא אוטומטית בעברית לכל הרשתות, וירידת מחיר? המערכת מפרסמת עליה ברק.",
    "היצירה עושה את שלה — הפלטפורמה עושה את כל השאר.",
  ].join("\n"),
  [
    "🚀 אזהרה: התחרות בפתיחת סטודיו רק הולכת לגדול.",
    "מי שכבר בתוך Likelink מתעוררת לחנות שיודעת לפרסם, לעקוב ולשלם לבד.",
    "הסטודיו שלך יכול להיות הבא — חמש דקות, לינק אחד, והמכונה עובדת.",
  ].join("\n"),
  [
    "🎬 הייתי בטוחה שצריך שעות וימים ומדריכי עריכה כדי להרים עסק ברשת...",
    "עד שגיליתי שזה רץ לבד 💜",
    "לוחצים כפתור אחד — והמערכת בונה סטורי, מפרסמת לערוצים, סופרת קליקים ומעבירה ל-PayPal.",
    "בלי CapCut. בלי לערוך. בלי לגעת. זה הסרטון שהייתי צריכה לראות לפני שנה.",
  ].join("\n"),
];

async function publishBrandPulse(origin) {
  if (!SB_URL || !SB_KEY) return { ok: false, error: "supabase_not_configured" };
  const store = await kvGet(KV_KEY);
  const meta = store[BRAND_PULSE_KEY] || {};
  if (Date.now() - (meta.ts || 0) < BRAND_PULSE_COOLDOWN_MS) return { ok: false, skipped: "cooldown" };

  const channels = [];
  if (process.env.BRAND_TELEGRAM_BOT && process.env.BRAND_TELEGRAM_CHAT) {
    channels.push({ type: "telegram", botToken: process.env.BRAND_TELEGRAM_BOT, chatId: process.env.BRAND_TELEGRAM_CHAT });
  }
  if (process.env.BRAND_WEBHOOK_URL) {
    channels.push({ type: "webhook", url: process.env.BRAND_WEBHOOK_URL });
  }
  if (!channels.length) return { ok: false, skipped: "no_brand_channels" };

  const story = BRAND_PULSE_STORIES_HE[(meta.run || 0) % BRAND_PULSE_STORIES_HE.length];
  const link = `${origin}/?utm_source=brandpulse&utm_medium=autopilot&utm_campaign=self_marketing`;
  const text = `${story}\n\n💜 פותחים סטודיו חינם · ${link}`;

  const results = [];
  for (const ch of channels) {
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

  const anyOk = results.some((r) => r.ok);
  if (anyOk) {
    try {
      store[BRAND_PULSE_KEY] = { ts: Date.now(), run: (meta.run || 0) + 1 };
      await kvSet(KV_KEY, stripRuntime(store));
    } catch { /* best-effort */ }
  }
  return { ok: anyOk, results };
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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { json(res, { ok: true }); return; }

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

  if (isCron) { const _r = await runDue(origin); json(res, _r); return; }

  // ── Studio API ──
  if (req.method !== "POST") { json(res, { ok: false, error: "method_not_allowed" }, 405); return; }

  let body;
  try {
    body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
  } catch {
    json(res, { ok: false, error: "bad_json" }, 400);
    return;
  }

  const { mode, marketerId } = body || {};

  // Browser tick — any visitor (throttled client-side) nudges due posts out.
  // Needs no secrets and no marketerId: it only publishes what creators
  // already scheduled. Must run BEFORE the marketerId check (tick sends none).
  if (mode === "tick") {
    if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500); return; }
    // One creator per ping: the visiting audience IS the scheduler. Many small,
    // fast invocations (<15s each) drain the queue — no invocation ever gets
    // near the 60s Vercel limit, and a killed tick loses at most one post.
    const _r2 = await runDue(origin, { maxCreators: 1 });
    json(res, _r2);
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
    json(res, { ok: true, events });
    return;
  }

  if (!marketerId) { json(res, { ok: false, error: "missing_marketerId" }, 400); return; }
  if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500); return; }

  const store = await kvGet(KV_KEY);

  if (mode === "get") {
    const cfg = store[marketerId] || null;
    json(res, { ok: true, config: cfg ? publicCfg(cfg) : null });
    return;
  }

  if (mode === "save") {
    const prev = store[marketerId] || {};
    store[marketerId] = sanitizeConfig(prev, body.config || {});
    try {
      await kvSet(KV_KEY, stripRuntime(store));
      json(res, { ok: true, config: publicCfg(store[marketerId]) });
    } catch (e) {
      json(res, { ok: false, error: String(e.message || e) }, 500);
    }
    return;
  }

  if (mode === "run") {
    const cfg = store[marketerId];
    if (!cfg) { json(res, { ok: false, error: "not_configured" }, 404); return; }
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
    json(res, { ...r, config: publicCfg(cfg) });
    return;
  }

  // ── "New product" instant announcement ──
  // Fired automatically right after a product is created/approved. Public yet
  // harmless: it can only announce a REAL approved product to the channels its
  // own creator connected, exactly ONCE (idempotent by product id).
  if (mode === "announce") {
    const { productId } = body || {};
    if (!productId) { json(res, { ok: false, error: "missing_productId" }, 400); return; }
    if (!SB_URL || !SB_KEY) { json(res, { ok: false, error: "supabase_not_configured" }, 500); return; }
    const [store, productsRow, marketersRow] = await Promise.all([
      kvGet(KV_KEY),
      kvGet("marketplace:products"),
      kvGet("marketplace:marketers"),
    ]);
    const productsList = Array.isArray(productsRow) ? productsRow : Object.values(productsRow || {});
    const product = productsList.find((p) => p && p.id === productId);
    if (!product) { json(res, { ok: false, error: "product_not_found" }, 404); return; }
    if (product.status !== "approved") { json(res, { ok: true, skipped: "not_approved" }); return; }
    const cfg = store[product.marketerId];
    if (!cfg?.enabled || !Array.isArray(cfg.channels) || !cfg.channels.length) {
      json(res, { ok: true, skipped: "no_autopilot_channels" });
      return;
    }
    // Idempotency: one launch announcement per product, ever.
    if ((cfg.logs || []).some((l) => l && l.event === "new_product" && l.productId === productId)) {
      json(res, { ok: true, skipped: "already_announced" });
      return;
    }
    store.__marketers = Array.isArray(marketersRow) ? marketersRow : [];
    const r = await announceNewProduct(store, product.marketerId, cfg, product, origin);
    try { await kvSet(KV_KEY, stripRuntime(store)); } catch { /* best-effort */ }
    json(res, { ...r, config: publicCfg(cfg) });
    return;
  }

  json(res, { ok: false, error: "unknown_mode" }, 400);
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




