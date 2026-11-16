// Waves the radar sees but never sells (the owner, 2026-11-16, over a viral reel of a Flipper-style
// gadget: "imitations and blocked things are what the market runs on — find the genius, legally").
// AliExpress's own hot lists are full of items named after a brand, a character or a hacking tool
// that LikeLink2 never promotes; discovery used to drop them silently. Now the radar measures them
// as a wave: how many hot items carry the name and their 30-day orders, how many listings carry it
// today (and the weekly change), whether Google's US suggestions already add "tiktok"/"viral", how
// many short YouTube videos were published on it this week (the official Data API), and, with the
// owner's Instagram connection, how many posts its hashtag got in the last 24 hours (Instagram's own
// Hashtag Search API). The copy never gets a buy button: the card says why it is not promoted, and
// the legal alternative is an item that answers the same need without the name (no brand, no
// character, no hacking tool) and passes the bar every pick passes. Measured only, never a forecast.
// Pure: the runner (scripts/catalog/trend-radar.mjs) does the reading.
import { brandWord, hasBrandName, isNotListedKind } from "./deals.js";
import { phrasesOf } from "./radarDiscovery.js";

export const WAVES = Object.freeze({ minItems: 3, minOrders: 1000, read: 12, show: 8, keepDays: 30, ytPerDay: 5, igPerDay: 4, altMinOrders: 300, altMinRate: 95 });

// Search areas the hot lists are read in besides the shop's categories (gadgets were missing).
export const WAVE_AREAS = Object.freeze([
  Object.freeze({ key: "gadgets", he: "גאדג׳טים", keywords: "smart gadgets electronic" }),
  Object.freeze({ key: "handheld", he: "גאדג׳טים", keywords: "handheld electronic gadget screen" }),
]);

// Tools sold to copy cards, remotes and signals: never promoted, but their waves are measured.
const HACK_TOOL = /\bflipper\b|\b(?:rfid|nfc|ic|id)\s*(?:card\s*)?(?:copier|cloner|duplicator)\b|\bcard\s*(?:copier|cloner)\b|\bjammer\b|\bdeauth(?:er)?\b|\bhack(?:ing|er)?\s*(?:tool|device|gadget)\b|\bpentest/i;
export const isHackTool = (title = "") => HACK_TOOL.test(String(title || ""));
const hackWord = (title = "") => {
  const m = String(title || "").match(HACK_TOOL);
  return m ? m[0].toLowerCase().replace(/\s+/g, " ").trim() : null;
};

export const REASON_HE = Object.freeze({
  BRAND: "שם של מותג או דמות: באליאקספרס זה חיקוי או בלי רישיון",
  TOOL: "כלי להעתקת כרטיסים ושלטים",
});

/** The wave a store title belongs to ({ token, reason }), or null. Weapons, vapes, adult items and health claims are never a wave. */
export function waveOf(title = "") {
  const t = String(title || "");
  if (!t || isNotListedKind(t)) return null;
  const tool = hackWord(t);
  if (tool) return { token: tool, reason: "TOOL" };
  const brand = brandWord(t);
  return brand ? { token: brand, reason: "BRAND" } : null;
}

/** The need behind a wave: the top item's own words without the name (its first two-word phrase), or null. */
export function needOf(title = "", token = "") {
  const words = String(token || "").toLowerCase().split(/\s+/).filter(Boolean);
  const clean = String(title || "").split(/\s+/).filter((w) => !words.includes(w.toLowerCase().replace(/[^a-z0-9]/g, ""))).join(" ");
  const p = [...phrasesOf(clean)].find((x) => !waveOf(x) && !isHackTool(x));
  return p || null;
}

/** Today's waves from the hot lists (the same answers discovery reads), biggest first. */
export function collectWaves(lists = {}, { rules = WAVES } = {}) {
  const by = new Map();
  for (const [category, list] of Object.entries(lists || {})) {
    for (const x of Array.isArray(list) ? list : []) {
      const id = String(x?.product_id || "");
      const title = String(x?.product_title || "").replace(/\s+/g, " ").trim();
      const orders = Number(x?.lastest_volume);
      if (!/^\d{6,20}$/.test(id) || !title || !Number.isFinite(orders)) continue;
      const w = waveOf(title);
      if (!w) continue;
      const f = by.get(w.token) || { ...w, ids: new Set(), orders: 0, cats: new Map(), top: { title, orders: -1 } };
      if (f.ids.has(id)) continue;
      f.ids.add(id);
      f.orders += orders;
      f.cats.set(category, (f.cats.get(category) || 0) + 1);
      if (orders > f.top.orders) f.top = { title, orders };
      by.set(w.token, f);
    }
  }
  return [...by.values()]
    .filter((f) => f.ids.size >= rules.minItems && f.orders >= rules.minOrders)
    .map((f) => ({ token: f.token, reason: f.reason, items: f.ids.size, orders: f.orders, category: [...f.cats.entries()].sort((a, b) => b[1] - a[1])[0][0], need: needOf(f.top.title, f.token) }))
    .sort((a, b) => b.orders - a.orders || (a.token < b.token ? -1 : 1));
}

/** A wave's history after today's reading ([day, items, orders, listings]): one per day, the last keepDays. */
export function addWaveReading(hist = [], reading, { rules = WAVES } = {}) {
  const rows = (Array.isArray(hist) ? hist : []).filter((r) => Array.isArray(r) && r[0] !== reading[0]);
  rows.push(reading);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const cutoff = new Date(Date.parse(`${reading[0]}T00:00:00Z`) - rules.keepDays * 86_400_000).toISOString().slice(0, 10);
  return rows.filter((r) => r[0] >= cutoff);
}

/** The weekly change (%) of one column between the newest reading and the oldest one 2–14 days before it, or null. */
export function weekChange(hist = [], col) {
  const rows = (Array.isArray(hist) ? hist : []).filter((r) => Number.isFinite(r?.[col]));
  const last = rows.at(-1);
  if (!last) return null;
  const t = Date.parse(last[0]);
  const base = rows.find((r) => {
    const d = (t - Date.parse(r[0])) / 86_400_000;
    return d >= 2 && d <= 14;
  });
  if (!base || !(base[col] > 0)) return null;
  const days = (t - Date.parse(base[0])) / 86_400_000;
  return Math.round((last[col] / base[col] - 1) * (7 / days) * 1000) / 10;
}

const BUY = /^https:\/\/s\.click\.aliexpress\.com\//;
const IMG = /^https:\/\/[^/]*(aliexpress-media\.com|alicdn\.com|aliexpress\.com)\//i;

/** The legal alternative: the first store answer without the name that passes the bar every pick passes. */
export function altPick(products = [], { rules = WAVES } = {}) {
  for (const p of Array.isArray(products) ? products : []) {
    const id = String(p?.product_id || "");
    const title = String(p?.product_title || "").replace(/\s+/g, " ").trim();
    const link = String(p?.promotion_link || "");
    const image = String(p?.product_main_image_url || "");
    const orders = Number(p?.lastest_volume);
    const rate = parseFloat(String(p?.evaluate_rate ?? "").replace("%", ""));
    const price = Number(p?.target_sale_price ?? p?.sale_price);
    if (!/^\d{6,20}$/.test(id) || !title || !BUY.test(link) || !IMG.test(image)) continue;
    if (waveOf(title) || hasBrandName(title) || isNotListedKind(title) || isHackTool(title)) continue;
    if (!(orders >= rules.altMinOrders) || !(rate >= rules.altMinRate) || !(price > 0)) continue;
    return { id, title: title.slice(0, 140), image, buy: link, price };
  }
  return null;
}

// Instagram's own Hashtag Search API (the owner's business account; IG_USER_ID + IG_ACCESS_TOKEN).
const GRAPH = "https://graph.facebook.com/v21.0";
export const igTag = (token = "") => String(token || "").toLowerCase().replace(/[^a-z0-9]/g, "") || null;
export const igSearchUrl = (tag, { userId, token }) => `${GRAPH}/ig_hashtag_search?${new URLSearchParams({ user_id: String(userId || ""), q: String(tag || ""), access_token: String(token || "") })}`;
export const igRecentUrl = (hashtagId, { userId, token }) => `${GRAPH}/${encodeURIComponent(String(hashtagId || ""))}/recent_media?${new URLSearchParams({ user_id: String(userId || ""), fields: "media_type,like_count,comments_count,timestamp", limit: "50", access_token: String(token || "") })}`;
/** Posts on the hashtag in the last 24 hours, from Instagram's own answer (null when not usable). */
export function igSignal(answer, { now = Date.now() } = {}) {
  if (!answer || !Array.isArray(answer.data)) return null;
  const day = answer.data.filter((m) => now - Date.parse(m?.timestamp) <= 86_400_000);
  const sum = (k) => day.reduce((s, m) => s + (Number(m?.[k]) || 0), 0);
  return { posts: day.length, videos: day.filter((m) => m?.media_type === "VIDEO").length, likes: sum("like_count"), comments: sum("comments_count"), capped: answer.data.length >= 50 };
}

/** The card the page shows (never a buy button for the copy). */
export function waveCard(w, { hist = [], firstSeen = null, buzz = null, yt = null, ig = null, alt = null } = {}) {
  const last = (Array.isArray(hist) ? hist : []).at(-1) || [];
  return {
    token: w.token, reason: w.reason, reasonHe: REASON_HE[w.reason] || "", items: w.items, orders: w.orders, category: w.category, firstSeen,
    listings: Number.isFinite(last[3]) ? last[3] : null, listingsWeekPct: weekChange(hist, 3), ordersWeekPct: weekChange(hist, 2),
    buzz: Array.isArray(buzz) ? buzz.slice(0, 4) : null, yt: yt || null, ig: ig || null, alt: alt || null,
  };
}
