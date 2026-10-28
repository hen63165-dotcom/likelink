/**
 * Animated character reels from the Studio — the 3D studio, from a button.
 *
 * The owner, 2026-10-28: build it into the site, so a creator gets a reel at
 * @ravitrecommends' level by pressing a button, without anyone running it by
 * hand. Pure core, shared by the Studio ("פרסום לרשתות") and the runner
 * (scripts/media/studio3d/queue.mjs, Actions → "3D studio", hourly):
 *
 *   the creator presses "סרטון אנימציה עם דמות" and picks a presenter → her
 *   own product record carries `reelRequest` (an owner-writable field: no new
 *   API, the store's write policy is unchanged) → the hourly run reads the
 *   cloud's products (public read), takes the oldest open request
 *   (animatedQueue) → autoplan.py writes the story for the product's kind →
 *   draw (3 takes) → pick (the same adult woman) → animate → reel → the
 *   "studio3d" release + its state → GitHub Pages (media/studio3d/index.json)
 *   → the Studio shows the reel under the product, to watch and post.
 *
 * Nothing is posted anywhere and the public site is unchanged: the reel waits
 * in the creator's own Studio. Every reel is labelled AI on every frame and
 * shows the product only in the seller's real photo.
 */

import { isPromotable, sharedAffiliateLinks } from "../discovery/catalogIntegrity.js";

/** The cast (scripts/media/ai-image/cast.json; a test keeps the two equal). */
export const PRESENTERS = Object.freeze([
  Object.freeze({ id: "shira", he: "שירה" }),
  Object.freeze({ id: "noa", he: "נועה" }),
  Object.freeze({ id: "maya", he: "מאיה" }),
  Object.freeze({ id: "tal", he: "טל" }),
  Object.freeze({ id: "yael", he: "יעל" }),
]);

export const ANIMATED_STATUS = Object.freeze({ READY: "READY", FAILED: "FAILED", UNSUPPORTED: "UNSUPPORTED" });

/** The kinds the 3D studio has a story for (autoplan.py STORIES, same words and order). */
export const ANIMATED_KINDS = Object.freeze([
  ["earrings", /עגיל|earring|ear stud|hoop/i],
  ["bracelet", /צמיד|שרשרת יד|bracelet|bangle/i],
  ["ring", /טבעת|\bring\b/i],
  ["necklace", /שרשרת|תליון|necklace|pendant|choker/i],
]);

/** A failed reel is tried again after this long, up to MAX_ATTEMPTS for one request. */
export const RETRY_AFTER_MS = 3 * 3600_000;
export const MAX_ATTEMPTS = 2;
/** About how long one reel takes on the free runners (draw, pick, animate, reel). */
export const TYPICAL_MINUTES = 120;

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const PRESENTER_IDS = new Set(PRESENTERS.map((p) => p.id));

export function animatedKind(product = {}) {
  const text = ["kind", "title", "storeTitle", "category"].map((k) => String(product?.[k] || "")).join(" ").toLowerCase();
  const hit = ANIMATED_KINDS.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
}

/** A request as the Studio writes it on her own product. */
export function makeRequest(presenter, now = Date.now()) {
  if (!PRESENTER_IDS.has(presenter)) throw new Error("unknown_presenter");
  return { kind: "studio3d", presenter, at: new Date(now).toISOString() };
}

/** The product's request, or null when it has none (or a malformed one). */
export function requestOf(product = {}) {
  const r = product?.reelRequest;
  if (!r || r.kind !== "studio3d" || !PRESENTER_IDS.has(r.presenter) || !Number.isFinite(Date.parse(r.at))) return null;
  return { presenter: r.presenter, at: new Date(Date.parse(r.at)).toISOString() };
}

/**
 * The requests to make now, oldest first: an approved, promotable product of a
 * kind with a story, whose request this state has not answered yet; a failed
 * one waits RETRY_AFTER_MS and stops after MAX_ATTEMPTS. A new request (a new
 * "at") always counts as new: pressing the button again makes a new reel.
 */
export function animatedQueue(products = [], { state = {}, now = Date.now(), limit = 1 } = {}) {
  const all = Array.isArray(products) ? products : [];
  const shared = sharedAffiliateLinks(all);
  const done = state?.reels || {};
  return all
    .filter((p) => p && ID.test(String(p.id)) && ID.test(String(p.marketerId || "")) && p.status === "approved" && requestOf(p))
    .filter((p) => isPromotable(p, all, shared) && animatedKind(p))
    .filter((p) => {
      const s = done[p.id];
      const req = requestOf(p);
      if (!s || s.requestAt !== req.at) return true;
      if (s.status !== ANIMATED_STATUS.FAILED) return false;
      return (s.attempts || 0) < MAX_ATTEMPTS && now - Date.parse(s.at || 0) >= RETRY_AFTER_MS;
    })
    .sort((a, b) => Date.parse(requestOf(a).at) - Date.parse(requestOf(b).at))
    .slice(0, limit)
    .map((p) => ({ productId: String(p.id), marketerId: String(p.marketerId), presenter: requestOf(p).presenter, requestAt: requestOf(p).at, kind: animatedKind(p) }));
}

/** One request's outcome merged into the state (attempts count failures of the same request). */
export function recordAnimated(state = {}, job, outcome, now = Date.now()) {
  const reels = { ...(state.reels || {}) };
  const prev = reels[job.productId];
  const same = prev && prev.requestAt === job.requestAt;
  const failed = outcome.status === ANIMATED_STATUS.FAILED;
  reels[job.productId] = {
    productId: job.productId,
    marketerId: String(job.marketerId || ""),
    presenter: job.presenter,
    requestAt: job.requestAt,
    status: outcome.status,
    reason: outcome.reason ? String(outcome.reason).slice(0, 160) : undefined,
    video: outcome.video || undefined,
    poster: outcome.poster || undefined,
    caption: outcome.caption ? String(outcome.caption).slice(0, 2200) : undefined,
    seconds: Number.isFinite(outcome.seconds) ? Math.round(outcome.seconds * 10) / 10 : undefined,
    attempts: failed ? (same ? (prev.attempts || 0) : 0) + 1 : 0,
    at: new Date(now).toISOString(),
  };
  return { ...state, at: new Date(now).toISOString(), reels };
}

const FILE = /^[a-z0-9][a-z0-9-]{0,80}\.mp4$/;
const POSTER = /^[a-z0-9][a-z0-9-]{0,80}-preview\.jpg$/;

/** What GitHub Pages serves to the Studio: status, file names, caption. */
export function animatedPublicIndex(state = {}) {
  const reels = Object.values(state?.reels || {})
    .filter((r) => r && ID.test(String(r.productId)) && ANIMATED_STATUS[r.status])
    .map((r) => ({
      productId: r.productId,
      marketerId: ID.test(String(r.marketerId || "")) ? r.marketerId : "",
      presenter: PRESENTER_IDS.has(r.presenter) ? r.presenter : "",
      requestAt: String(r.requestAt || ""),
      status: r.status,
      ...(r.status === ANIMATED_STATUS.READY && FILE.test(String(r.video)) ? {
        video: r.video,
        ...(POSTER.test(String(r.poster || "")) ? { poster: r.poster } : {}),
        caption: String(r.caption || "").slice(0, 2200),
        ...(Number.isFinite(r.seconds) ? { seconds: r.seconds } : {}),
      } : {}),
      ...(r.status === ANIMATED_STATUS.FAILED ? { attempts: r.attempts || 1 } : {}),
      at: String(r.at || ""),
    }));
  return { at: String(state?.at || ""), reels };
}

export const ANIMATED_HOME = "https://hen63165-dotcom.github.io/likelink/media/studio3d/index.json";

/** The site's own address first (Netlify proxies /media/studio3d/*), then GitHub Pages. */
export function animatedUrls(base = "", origin = typeof location !== "undefined" ? location.origin : "") {
  const own = origin ? `${origin}${base}/media/studio3d/index.json` : "";
  return [...new Set([own, ANIMATED_HOME].filter(Boolean))];
}

/** index.json → Map(productId → entry) with absolute media URLs; unsafe names are dropped. */
export function animatedByProduct(doc, home = ANIMATED_HOME) {
  const out = new Map();
  for (const r of Array.isArray(doc?.reels) ? doc.reels : []) {
    if (!r || !ID.test(String(r.productId)) || !ANIMATED_STATUS[r.status]) continue;
    const entry = { productId: r.productId, marketerId: String(r.marketerId || ""), presenter: String(r.presenter || ""), requestAt: String(r.requestAt || ""), status: r.status, at: String(r.at || "") };
    if (r.status === ANIMATED_STATUS.READY && FILE.test(String(r.video))) {
      entry.video = new URL(r.video, home).href;
      if (POSTER.test(String(r.poster || ""))) entry.poster = new URL(r.poster, home).href;
      entry.caption = String(r.caption || "").slice(0, 2200);
      if (Number.isFinite(r.seconds)) entry.seconds = r.seconds;
    } else if (r.status === ANIMATED_STATUS.READY) {
      entry.status = ANIMATED_STATUS.FAILED; // "ready" without a file is not ready
    }
    if (Number.isFinite(r.attempts)) entry.attempts = r.attempts;
    out.set(entry.productId, entry);
  }
  return out;
}

export async function loadAnimated(fetchImpl = typeof fetch === "function" ? fetch : null, urls = animatedUrls()) {
  if (!fetchImpl) return new Map();
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const doc = await res.json();
      if (Array.isArray(doc?.reels)) return animatedByProduct(doc);
    } catch { /* the SPA fallback page, or offline: try the next address */ }
  }
  return new Map();
}

const nameOf = (id) => PRESENTERS.find((p) => p.id === id)?.he || "";

/** Where the product's animated reel stands, in Hebrew, from its request and the index entry. */
export function animatedState(product, entry) {
  const req = requestOf(product);
  if (!animatedKind(product)) return { state: "unsupported", he: "סרטון אנימציה עם דמות זמין כרגע לעגילים, טבעות, צמידים ושרשראות" };
  if (req && (!entry || entry.requestAt !== req.at)) {
    return { state: "queued", he: `בהכנה עם ${nameOf(req.presenter)}: הסרטון נוצר בענן ומופיע כאן בדרך כלל תוך כשעתיים. אפשר לסגור את הדף` };
  }
  if (entry?.status === ANIMATED_STATUS.READY && entry.video) return { state: "ready", he: `הסרטון עם ${nameOf(entry.presenter)} מוכן: צפי בו לפני שאת מפרסמת` };
  if (entry?.status === ANIMATED_STATUS.FAILED) {
    return (entry.attempts || 1) < MAX_ATTEMPTS
      ? { state: "retry", he: "הסרטון לא הצליח בפעם הזאת. ננסה שוב אוטומטית בשעות הקרובות" }
      : { state: "failed", he: "הסרטון לא הצליח גם בניסיון החוזר. אפשר ללחוץ שוב כדי ליצור חדש" };
  }
  if (entry?.status === ANIMATED_STATUS.UNSUPPORTED) return { state: "unsupported", he: "למוצר הזה עוד אין סיפור מוכן בסטודיו" };
  return { state: "none", he: "סרטון אנימציה עם דמות שמדברת, כתוביות וקול, ותמונת המוכר של המוצר" };
}
