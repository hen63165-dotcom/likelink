// A wish list you send to family (/wish?i=a,b,c&n=נועה). The owner,
// 2026-11-06: "something genius that nobody invented". Someone taps ♡ on the
// gifts they want, and the saved page turns them into one link for WhatsApp.
// Whoever opens it sees those gifts with their store buttons. Every list
// reaches the people who buy the gift, so it is the site's own growth loop.
//
// Rules:
//   - nothing is stored on a server: the list is only the ids in the link;
//   - only ids of products the public site lists are shown, and unknown ids
//     are dropped;
//   - the name is optional, short plain text the sender typed (no links);
//   - the page is noindex, because a private list is not a search page.
import { PRODUCTION_ORIGIN } from "../constants/domain.js";

export const WISH_PATH = "/wish";
export const WISH_MAX = 12;
export const NAME_MAX = 20;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** The sender's name as typed: letters, digits, spaces and a few marks only, at most 20 characters. */
export function cleanName(raw = "") {
  return String(raw || "")
    .replace(/[^\p{L}\p{N} .'"׳״-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

/** Product ids for a list: safe, unique, at most WISH_MAX, in the order given. */
export function cleanIds(ids = []) {
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const s = String(id || "");
    if (SAFE_ID.test(s) && !out.includes(s)) out.push(s);
    if (out.length >= WISH_MAX) break;
  }
  return out;
}

/** The link that carries the list. */
export function wishUrl({ ids = [], name = "", origin = PRODUCTION_ORIGIN, source = "" } = {}) {
  const u = new URL(WISH_PATH, String(origin).replace(/\/+$/, "") + "/");
  const list = cleanIds(ids);
  if (list.length) u.searchParams.set("i", list.join(","));
  const n = cleanName(name);
  if (n) u.searchParams.set("n", n);
  if (source) {
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "wishlist");
  }
  return u.toString();
}

/** The list a link carries: { ids, name }. */
export function parseWish(search = "") {
  let params;
  try { params = new URLSearchParams(String(search)); } catch { return { ids: [], name: "" }; }
  return { ids: cleanIds(String(params.get("i") || "").split(",")), name: cleanName(params.get("n") || "") };
}

/** The WhatsApp text that goes with the link. */
export function wishMessage({ name = "", url = "" } = {}) {
  const n = cleanName(name);
  return `${n ? `🎁 הרשימה של ${n} לחנוכה` : "🎁 רשימת המשאלות שלי לחנוכה"}\n${url}`;
}

/** WhatsApp's own share address for the message. */
export const whatsappShare = (text) => `https://wa.me/?text=${encodeURIComponent(String(text || ""))}`;
