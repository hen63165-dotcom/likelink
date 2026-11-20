// The crowd sensor (the owner, 2026-11-16: "כן לחיישן של הקהל"). Shoppers bring the reels to us: the
// magic button gets AliExpress links people saw anywhere, so the same item checked this week by
// several different people means it is spreading in Israel right now, before any search shows it.
// What is recorded: the item number, sent once per browser session for each item (src/lib/funnel.js,
// magic_check), and nothing else: no identifier, nothing about the person. The server (api/_utils/radarBoardHandler.mjs op=crowd,
// cron auth) returns only counts per item; the radar run reads the store's own facts for them.
// Pure; tested in tests/crowdSensor.test.mjs.
import { hasBrandName, isNotListedKind } from "./deals.js";
import { isHackTool } from "./brandWaves.js";

export const CROWD = Object.freeze({ days: 7, minPeople: 2, top: 20, show: 8 });

const ITEM = /^\d{6,20}$/;

/** True the first time this browser session checks this item (then the item number is sent once). */
export function firstCheckThisSession(item, store = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
  try {
    if (!store || !ITEM.test(String(item || ""))) return false;
    const k = `ll_mc_${item}`;
    if (store.getItem(k)) return false;
    store.setItem(k, "1");
    return true;
  } catch { return false; }
}

/** Items checked in the magic button in at least minPeople different browser sessions in the last `days`. */
export function crowdOf(funnel = [], { now = Date.now(), rules = CROWD } = {}) {
  const since = now - rules.days * 86_400_000;
  const by = new Map();
  for (const e of Array.isArray(funnel) ? funnel : []) {
    if (e?.type !== "magic_check" || !ITEM.test(String(e.item || "")) || !(Number(e.ts) >= since)) continue;
    const r = by.get(e.item) || { item: e.item, people: 0, checks: 0, first: Number(e.ts), last: Number(e.ts) };
    r.people++; // one event with the item per browser session (firstCheckThisSession)
    r.checks++;
    r.first = Math.min(r.first, Number(e.ts));
    r.last = Math.max(r.last, Number(e.ts));
    by.set(e.item, r);
  }
  return [...by.values()]
    .filter((r) => r.people >= rules.minPeople)
    .map((r) => ({ item: r.item, people: r.people, checks: r.checks, first: new Date(r.first).toISOString().slice(0, 10), last: new Date(r.last).toISOString().slice(0, 10) }))
    .sort((a, b) => b.people - a.people || b.checks - a.checks || (a.last < b.last ? 1 : -1))
    .slice(0, rules.top);
}

/**
 * Kinds photographed in the magic button's lens (lens.js) by at least minPeople different browser
 * sessions in the last `days`: the kind's id only (one event per kind per session), never the picture.
 */
const KIND = /^[a-z0-9-]{3,48}$/;
export function crowdKinds(funnel = [], { now = Date.now(), rules = CROWD } = {}) {
  const since = now - rules.days * 86_400_000;
  const by = new Map();
  for (const e of Array.isArray(funnel) ? funnel : []) {
    if (e?.type !== "magic_check" || !KIND.test(String(e.kind || "")) || !(Number(e.ts) >= since)) continue;
    const r = by.get(e.kind) || { kind: e.kind, people: 0, first: Number(e.ts), last: Number(e.ts) };
    r.people++;
    r.first = Math.min(r.first, Number(e.ts));
    r.last = Math.max(r.last, Number(e.ts));
    by.set(e.kind, r);
  }
  return [...by.values()]
    .filter((r) => r.people >= rules.minPeople)
    .map((r) => ({ kind: r.kind, people: r.people, first: new Date(r.first).toISOString().slice(0, 10), last: new Date(r.last).toISOString().slice(0, 10) }))
    .sort((a, b) => b.people - a.people || (a.last < b.last ? 1 : -1))
    .slice(0, rules.top);
}

const BUY = /^https:\/\/s\.click\.aliexpress\.com\//;
const IMG = /^https:\/\/[^/]*(aliexpress-media\.com|alicdn\.com|aliexpress\.com)\//i;

/**
 * One crowd card from the counts and the store's own answer (productdetail.get). A brand, character
 * or hacking tool is shown without a buy button (why: `blocked`); weapons, vapes, adult items and
 * health claims are not shown at all.
 */
export function crowdCard(c, p, { momentum = null } = {}) {
  const title = String(p?.product_title || "").replace(/\s+/g, " ").trim().slice(0, 140);
  const image = String(p?.product_main_image_url || "");
  if (!c || !ITEM.test(String(c.item || "")) || !title || !IMG.test(image) || isNotListedKind(title)) return null;
  const blocked = hasBrandName(title) ? "BRAND" : isHackTool(title) ? "TOOL" : null;
  const link = String(p?.promotion_link || "");
  const price = Number(p?.target_sale_price ?? p?.sale_price);
  const orders = Number(p?.lastest_volume);
  return {
    id: c.item, title, image, people: c.people, checks: c.checks, first: c.first, last: c.last,
    orders: Number.isFinite(orders) ? orders : null, price: Number.isFinite(price) && price > 0 ? price : null,
    buy: !blocked && BUY.test(link) ? link : null, blocked,
    momentum: momentum && Number.isFinite(momentum.weekPct) ? { weekPct: momentum.weekPct, state: momentum.state || null } : null,
    check: `/magic?u=${encodeURIComponent(`https://www.aliexpress.com/item/${c.item}.html`)}`,
  };
}
