// LikeLink2 Creative Engine — product → video, with no paid credits (pure core, no I/O).
//
//   product → validation → media discovery → rights/source checks →
//   classification → audience → character → script → render → QC →
//   storage → product page → measurement
//
// The runner is scripts/creative/run.mjs on GitHub Actions
// (.github/workflows/creative-engine.yml): ffmpeg + the runner's Chromium
// render, the "reels" release stores, GitHub Pages serves the site's reels
// feed (scripts/reels-feed.mjs), and the job ledger lives on the ops/creative
// branch. Everything here is deterministic: the same inputs give the same
// plan and the same idempotency key, so nothing is rendered twice.
//
// Truth rules (CLAUDE.md, docs/VISION.md): only the product's own media, each
// piece named as whose it is; the seller's models are never named, never
// presented as a creator or a buyer; a virtual character is always labelled;
// no rating, review, sales, stock, discount or result claims; the ad
// disclosure on every frame.
import { isPromotable, IMAGE_PROVENANCE, imageProvenance, sharedAffiliateLinks } from "../discovery/catalogIntegrity.js";
import { HOOK_FORBIDDEN, buildHookSet, nextAttempt, worldOf } from "../growth/likeloop.js";
import { galleryPicks } from "../looks.js";
import { SELLER_REVIEWED, SELLER_SKIP } from "../reelsFeed.js";

export const ENGINE_VERSION = "creative-1";

/* ─────────────────────────────────────────────── zero paid credits mode */

/**
 * Every provider the engine knows, with whether it costs money per use. The
 * engine runs in ZERO_PAID_CREDITS mode unless the owner turns it off
 * (CREATIVE_MODE=PAID_ALLOWED, never set today): a plan that needs a paid
 * provider is refused before anything runs, and the step is replaced by a
 * template or left out.
 */
export const MODES = Object.freeze({ ZERO_PAID_CREDITS: "ZERO_PAID_CREDITS", PAID_ALLOWED: "PAID_ALLOWED" });
export const PROVIDERS = Object.freeze({
  ffmpeg: { paid: false, role: "render", he: "ffmpeg (קוד פתוח) על המחשב של GitHub Actions" },
  chromium: { paid: false, role: "type", he: "Chromium מצייר את הטקסט העברי (RTL)" },
  github_actions: { paid: false, role: "compute", he: "GitHub Actions, מאגר ציבורי" },
  github_releases: { paid: false, role: "storage", he: "קבצי Release ב־GitHub" },
  github_pages: { paid: false, role: "delivery", he: "GitHub Pages מגיש את הסרטונים לאתר" },
  store_media: { paid: false, role: "media", he: "תמונות וסרטון המוכר מעמוד המוצר (דרך ממשק השותפים)" },
  edge_tts: { paid: false, role: "voice", he: "קול לונה (שירות חינמי לא רשמי, במנוע של לונה)" },
  openai_images: { paid: true, role: "image" },
  elevenlabs: { paid: true, role: "voice" },
  replicate_video: { paid: true, role: "video" },
  kling: { paid: true, role: "video" },
  manymotions_ugc: { paid: true, role: "video" },
});

export function engineMode(env = {}) {
  return env.CREATIVE_MODE === MODES.PAID_ALLOWED ? MODES.PAID_ALLOWED : MODES.ZERO_PAID_CREDITS;
}

/** The providers a plan uses, checked against the mode: unknown or paid → refused. */
export function checkProviders(providers = [], mode = MODES.ZERO_PAID_CREDITS) {
  const refused = [];
  for (const id of providers) {
    const p = PROVIDERS[id];
    if (!p) refused.push({ provider: id, reason: "unknown_provider" });
    else if (p.paid && mode === MODES.ZERO_PAID_CREDITS) refused.push({ provider: id, reason: "paid_provider_in_zero_credit_mode" });
  }
  return { ok: refused.length === 0, mode, refused };
}

/* ─────────────────────────────────────────────────── character registry */

const characters = new Map();

/**
 * Register an original presenter. A character needs a stable id, its own
 * visual assets (files in this repository), a personality, a voice setting,
 * the categories it suits, the templates it can appear in and, for a virtual
 * one, the label every video carries. Anything missing → refused.
 */
export function registerCharacter(def = {}) {
  const missing = ["id", "name", "kind", "personality"].filter((k) => !String(def[k] || "").trim());
  if (!Array.isArray(def.assets) || !def.assets.length) missing.push("assets");
  if (!def.voice || typeof def.voice !== "object") missing.push("voice");
  if (!def.suitability || !Object.keys(def.suitability).length) missing.push("suitability");
  if (!Array.isArray(def.templates) || !def.templates.length) missing.push("templates");
  if (def.kind === "virtual" && !(def.disclosure?.he && def.disclosure?.en)) missing.push("disclosure");
  if (missing.length) return { ok: false, missing };
  characters.set(def.id, Object.freeze({ ...def, never: Object.freeze([...CHARACTER_NEVER, ...(def.never || [])]) }));
  return { ok: true, id: def.id };
}

// What no character ever says or implies.
export const CHARACTER_NEVER = Object.freeze(["bought_or_used_the_product", "customer_testimonial", "real_person_claim", "results_promise"]);

export function getCharacter(id) {
  return characters.get(id) || null;
}

export function listCharacters() {
  return [...characters.values()];
}

registerCharacter({
  id: "luna",
  name: "לונה",
  kind: "virtual",
  assets: ["scripts/luna_reels/assets/luna.png"],
  personality: "חמה ועניינית, מסבירה בגובה העיניים מה לבדוק לפני שקונים",
  voice: { engine: "edge_tts", voice: "he-IL-HilaNeural", fallback: "silent" },
  niches: ["טיפים לקנייה", "מידות", "תכשיטים", "מתנות"],
  suitability: { Accessories: 0.9, Fashion: 0.8, Beauty: 0.7, Gifts: 0.8, Home: 0.6, Tech: 0.6, Other: 0.5 },
  templates: ["luna_tip"],
  disclosure: { he: "לונה היא דמות AI מונפשת, לא אדם אמיתי", en: "Luna is an animated AI character, not a real person" },
});

/* ─────────────────────────────────────────────────────────── templates */

/**
 * The video templates. `executor` says who renders it: native = this engine
 * (scripts/creative); luna_reels = the Luna reels workflow (Python), whose
 * reels the site already plays. `presenter: "none"` = no character: the
 * seller's own media carries the video.
 */
export const TEMPLATES = Object.freeze({
  lookbook: {
    executor: "native",
    presenter: "none",
    providers: ["ffmpeg", "chromium", "github_actions", "github_releases", "github_pages", "store_media"],
    he: "לוקבוק: הפריט על הדוגמנית של המוכר, תקריבים מסרטון המוכר, תנועת מצלמה איטית וכותרת סריף",
    minPhotos: 2,
    needsWorn: true,
  },
  luna_tip: {
    executor: "luna_reels",
    presenter: "luna",
    providers: ["github_actions", "github_releases", "github_pages", "edge_tts", "store_media"],
    he: "לונה מסבירה טיפ קנייה, עם תמונת המוצר האמיתית",
  },
});

/* ──────────────────────────────────────────── classification and audience */

const CLASS_WORDS = [
  ["jewelry", /טבעת|צמיד|עגיל|שרשר|תליון|מואסניט|תכשיט|\bring\b|bracelet|earring|necklace|jewel/i],
  ["fashion", /שמלה|חולצה|מכנס|חצאית|מעיל|ז'קט|נעל|תיק|כובע|dress|shirt|pants|skirt|coat|jacket|shoe|bag/i],
  ["beauty", /איפור|שפתון|מסקרה|טיפוח|סרום|קרם|makeup|lipstick|serum|skincare/i],
  ["electronics", /אוזניות|מטען|כבל|רמקול|שעון חכם|גאדג|headphone|charger|cable|speaker|smartwatch|gadget/i],
  ["home", /מטבח|כרית|מנורה|מדף|ארגונית|בית|kitchen|pillow|lamp|shelf|organizer|home/i],
];
const CATEGORY_CLASS = { Accessories: "jewelry", Fashion: "fashion", Beauty: "beauty", Tech: "electronics", Home: "home" };

/** What the product is, from its own title and category only. */
export function classifyProduct(p) {
  const title = String(p?.title || "");
  for (const [cls, re] of CLASS_WORDS) if (re.test(title)) return cls;
  return CATEGORY_CLASS[p?.category] || "other";
}

/**
 * How each class is shown, and to whom the copy speaks (a planning label for
 * captions and hashtags, never a claim about who bought it). Before/after and
 * demonstrations only with real footage of the product doing it.
 */
export const CLASS_DIRECTION = Object.freeze({
  jewelry: { template: "lookbook", fallback: "luna_tip", shots: "תקריבים, הפריט על הדוגמנית, תנועה איטית ואלגנטית", audience: "מחפשות תכשיט לעצמן או מתנה" },
  fashion: { template: "lookbook", fallback: "luna_tip", shots: "צילומי הדוגמנית של המוכר, שילובי לוק", audience: "מחפשות פריט ללוק יומיומי" },
  beauty: { template: "luna_tip", fallback: "luna_tip", shots: "תמונת המוצר עם הסבר של לונה", audience: "מחפשות מוצר לשגרה" },
  electronics: { template: "luna_tip", fallback: "luna_tip", shots: "רק תכונות שכתובות בעמוד המוצר", audience: "מחפשים פתרון לבעיה יומיומית" },
  home: { template: "luna_tip", fallback: "luna_tip", shots: "לפני/אחרי רק עם צילום אמיתי של המוצר", audience: "מחפשים שינוי קטן בבית" },
  other: { template: "luna_tip", fallback: "luna_tip", shots: "תמונת המוצר עם הסבר", audience: "קונים ברשת" },
});

/* ───────────────────────────────────────────── validation, media, rights */

const AE_CDN = /^https:\/\/(ae-pic-a1\.aliexpress-media\.com|ae01\.alicdn\.com)\/kf\/[A-Za-z0-9._-]+$/;

/** The product may get a video: listed, its own store link, a real photo, a title. */
export function validateProduct(p, products = [], shared = sharedAffiliateLinks(products)) {
  const issues = [];
  if (!p?.id) issues.push("no_id");
  if (String(p?.status || "") !== "approved") issues.push("not_approved");
  if (!String(p?.title || "").trim()) issues.push("no_title");
  if (!/^https:\/\//i.test(String(p?.affiliateUrl || ""))) issues.push("no_affiliate_url");
  if (imageProvenance(p?.image) === IMAGE_PROVENANCE.STOCK) issues.push("stock_image");
  if (p?.id && !isPromotable(p, products, shared)) issues.push("not_promotable");
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}

/**
 * The media this product may use, each with its rights basis:
 *   photos — the store gallery read through the official affiliate API
 *            (priceSource aliexpress_api), checked by eye (STORE_GALLERY_PICKS),
 *            AliExpress CDN only;
 *   video  — the seller's own product video from the product page (the
 *            product-video-sources release), only when a person checked that
 *            the listed item is its subject (SELLER_REVIEWED) and it is not
 *            in SELLER_SKIP.
 * @param sellerVideos Set of product ids that have a seller clip on hand
 */
export function discoverMedia(p, { sellerVideos = new Set() } = {}) {
  const rejected = [];
  const viaApi = p?.priceSource === "aliexpress_api";
  const photos = [];
  for (const g of galleryPicks(p)) {
    if (!AE_CDN.test(g.url)) rejected.push({ media: g.url, reason: "not_store_cdn" });
    else if (!viaApi) rejected.push({ media: g.url, reason: "gallery_not_from_affiliate_api" });
    else photos.push({ url: g.url, kind: g.kind, rights: "store_listing_media_via_affiliate_api", label: "תמונת המוכר" });
  }
  let video = null;
  if (sellerVideos.has(p?.id)) {
    if (SELLER_SKIP[p.id]) rejected.push({ media: `seller-video:${p.id}`, reason: "clip_shows_another_item" });
    else if (!SELLER_REVIEWED[p.id]) rejected.push({ media: `seller-video:${p.id}`, reason: "clip_not_checked_by_a_person" });
    else video = { source: "product-video-sources", file: `${p.id}.mp4`, rights: "store_listing_video", reviewed: SELLER_REVIEWED[p.id], label: "סרטון המוכר" };
  }
  return { photos, video, rejected };
}

/* ────────────────────────────────────────────────────────────── script */

export const SCRIPT_FORBIDDEN = /(₪|\d|%|הנחה|מבצע|הכי|הטוב ביותר|מושלם|איכות|יהלום|מובטח|לנצח|לא משחיר|היפואלרגני|אמיתי)/;
const ATTR = "#פרסומת · קישור שותפים";

function shortName(title, max = 40) {
  const t = String(title || "").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, "") || t.slice(0, max - 1)}…`;
}

/** A stable number from a string (rotation without randomness). */
function seedOf(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/**
 * The lookbook's words: an opening line in serif, the product's name, the end
 * card. From the product's own category scene words and title only: no
 * number, price, claim or superlative (SCRIPT_FORBIDDEN, HOOK_FORBIDDEN).
 */
export function buildScript(p, { withVideo = false } = {}) {
  const w = worldOf(p?.category);
  const hooks = buildHookSet(p).filter((h) => ["question", "gift", "problem"].includes(h.type));
  const lines = [{ type: "fixed", text: w.fixed }, ...hooks].filter((h) => h.text && !HOOK_FORBIDDEN.test(h.text) && !SCRIPT_FORBIDDEN.test(h.text));
  const opening = lines[seedOf(p?.id) % Math.max(1, lines.length)] || { type: "fixed", text: w.fixed };
  const media = withVideo ? "תמונות וסרטון: המוכר" : "תמונות: המוכר";
  return {
    opening: { type: opening.type, text: opening.text },
    name: shortName(p?.title),
    end: { line: "לפרטים ולחנות", sub: "הקישור בעמוד המוצר ב־LikeLink2" },
    labels: [ATTR, media],
  };
}

/** The post caption: opening line, the listing's own first sentence, disclosure, whose media. */
export function buildCaption(p, script) {
  const first = (String(p?.description || "").split(/(?<=[.!?])\s/)[0] || "").trim().slice(0, 140);
  return [
    script.opening.text,
    "",
    String(p?.title || "").trim(),
    first,
    "",
    "#פרסומת · קישור שותפים: אם תקנו דרכו ייתכן שתתקבל עמלה, בלי עלות נוספת לכם. המחיר והמלאי הסופיים נקבעים בחנות.",
    `${script.labels[1]}, מעמוד המוצר בחנות. בעריכת LikeLink2.`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/* ──────────────────────────────────────────────────────────────── plan */

/** A 64-bit FNV-1a fingerprint of the inputs (the idempotency key). */
export function fingerprint(parts) {
  let h = 0xcbf29ce484222325n;
  for (const ch of JSON.stringify(parts)) {
    h ^= BigInt(ch.codePointAt(0));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * One product → its video plan, or the reason there is none. A plan names
 * the template, the presenter, the media with their rights, the script, the
 * providers (checked against the mode) and the idempotency key.
 */
export function planProduct(p, { products = [], sellerVideos = new Set(), mode = MODES.ZERO_PAID_CREDITS, shared = sharedAffiliateLinks(products) } = {}) {
  const valid = validateProduct(p, products, shared);
  if (!valid.ok) return { ok: false, productId: p?.id || "", stage: "validation", reason: valid.issues.join(",") };
  const cls = classifyProduct(p);
  const direction = CLASS_DIRECTION[cls];
  const media = discoverMedia(p, { sellerVideos });
  const worn = media.photos.some((x) => x.kind === "worn");
  const t = TEMPLATES[direction.template];
  if (direction.template !== "lookbook" || !worn || media.photos.length < t.minPhotos) {
    // No native template fits: the product stays with the Luna reels engine (its reels already reach the site).
    const fallback = TEMPLATES[direction.fallback];
    return { ok: false, productId: p.id, stage: "media", reason: direction.template !== "lookbook" ? "template_runs_in_luna_reels" : !worn ? "no_worn_photo_checked" : "too_few_checked_photos", class: cls, delegate: { template: direction.fallback, executor: fallback.executor, character: fallback.presenter }, rejected: media.rejected };
  }
  const providers = checkProviders(t.providers, mode);
  if (!providers.ok) return { ok: false, productId: p.id, stage: "zero_credit", reason: providers.refused.map((r) => `${r.provider}:${r.reason}`).join(","), class: cls };
  const withVideo = Boolean(media.video);
  const script = buildScript(p, { withVideo });
  const photos = media.photos.slice(0, 4);
  const look = withVideo ? "lookbook" : "lookbook_photos";
  const inputs = { engine: ENGINE_VERSION, template: "lookbook", productId: p.id, photos: photos.map((x) => x.url), video: withVideo ? media.video.file : "", title: p.title, script };
  return {
    ok: true,
    productId: p.id,
    class: cls,
    audience: direction.audience,
    direction: direction.shots,
    template: "lookbook",
    executor: t.executor,
    character: null,
    presenterNote: "בלי דמות: הדוגמנית בתמונות היא של המוכר, לא מוצגת כיוצרת או כקונה",
    look,
    asset: `${p.id}-lookbook`,
    media: { photos, video: media.video },
    rejected: media.rejected,
    script,
    caption: buildCaption(p, script),
    providers: t.providers,
    mode,
    key: fingerprint(inputs),
  };
}

/* ─────────────────────────────────────────────────────────────── jobs */

export const JOB = Object.freeze({
  QUEUED: "QUEUED", // planned, waiting for the renderer
  RENDERED: "RENDERED", // file made and passed QC, not stored yet
  STORED: "STORED", // attached to the release, size checked
  LIVE: "LIVE", // in the site's reels feed on GitHub Pages, same bytes
  FAILED: "FAILED", // will be retried after nextAttemptAt
  DEAD: "DEAD", // out of attempts: needs a person (or new inputs)
  SUPERSEDED: "SUPERSEDED", // the product's inputs changed; a newer job replaced it
});
export const MAX_ATTEMPTS = 3;
export const MAX_JOBS_PER_RUN = 3;
export const LEDGER_CAP = 200;
const DONE = new Set([JOB.STORED, JOB.LIVE]);

export function emptyLedger() {
  return { engine: ENGINE_VERSION, updatedAt: null, jobs: [] };
}

function newJob(plan, now) {
  return {
    id: `cj_${plan.key}`,
    key: plan.key,
    productId: plan.productId,
    template: plan.template,
    look: plan.look,
    asset: plan.asset,
    status: JOB.QUEUED,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, status: JOB.QUEUED }],
  };
}

function touch(job, status, now, extra = {}) {
  return { ...job, ...extra, status, updatedAt: now, history: [...(job.history || []), { at: now, status, ...(extra.error ? { error: extra.error.message } : {}) }].slice(-12) };
}

/**
 * Bring the ledger up to date with today's plans and pick the jobs to run.
 * Same key already STORED/LIVE → reused (no render). A changed product →
 * a new job; the older one is SUPERSEDED. FAILED → due again only after its
 * backoff; DEAD stays until the inputs change. At most `limit` per run.
 */
export function reconcile(ledger = emptyLedger(), plans = [], { now = Date.now(), limit = MAX_JOBS_PER_RUN, force = false } = {}) {
  const jobs = [...(ledger.jobs || [])];
  const byKey = new Map(jobs.map((j, i) => [j.key, i]));
  const due = [];
  const reused = [];
  const waiting = [];
  for (const plan of plans.filter((x) => x.ok)) {
    let i = byKey.get(plan.key);
    if (i === undefined) {
      for (let k = 0; k < jobs.length; k++) {
        const j = jobs[k];
        if (j.productId === plan.productId && j.template === plan.template && j.status !== JOB.SUPERSEDED) jobs[k] = touch(j, JOB.SUPERSEDED, now, { supersededBy: `cj_${plan.key}` });
      }
      jobs.unshift(newJob(plan, now));
      i = 0;
      byKey.clear();
      jobs.forEach((j, k) => byKey.set(j.key, k));
    }
    const job = jobs[i];
    if (DONE.has(job.status) && !force) reused.push(job.id);
    else if (job.status === JOB.DEAD && !force) waiting.push({ id: job.id, reason: "dead_letter" });
    else if (job.status === JOB.FAILED && !force && Number(job.nextAttemptAt) > now) waiting.push({ id: job.id, reason: "backoff", until: job.nextAttemptAt });
    else if (due.length < limit) due.push(job.id);
    else waiting.push({ id: job.id, reason: "run_limit" });
  }
  return { ledger: { ...ledger, engine: ENGINE_VERSION, updatedAt: now, jobs: jobs.slice(0, LEDGER_CAP) }, due, reused, waiting };
}

export function updateJob(ledger, id, fn) {
  return { ...ledger, jobs: ledger.jobs.map((j) => (j.id === id ? fn(j) : j)) };
}

/** Classify a failure: input problems are not retried; render/network problems are, with backoff. */
export function failureClass(error) {
  const m = String(error?.message || error || "");
  if (/qc_failed|ffmpeg|render|timeout|ETIMEDOUT|ECONNRESET|fetch|5\d\d/i.test(m)) return { class: /qc_failed/.test(m) ? "QC" : "RENDER", retry: true };
  if (/no_media|rights|not_found|404/i.test(m)) return { class: "MEDIA", retry: false };
  return { class: "CODE", retry: true };
}

export function markFailed(job, error, now = Date.now()) {
  const attempts = (job.attempts || 0) + 1;
  const f = failureClass(error);
  const next = nextAttempt(attempts, now, { baseMin: 60, max: MAX_ATTEMPTS });
  const dead = !f.retry || next.deadLetter;
  return touch(job, dead ? JOB.DEAD : JOB.FAILED, now, { attempts, error: { class: f.class, message: String(error?.message || error).slice(0, 300), at: now }, nextAttemptAt: dead ? null : next.at });
}

export function markRendered(job, output, qc, now = Date.now()) {
  return touch(job, JOB.RENDERED, now, { attempts: (job.attempts || 0) + 1, output, qc, error: null, nextAttemptAt: null });
}

export function markStored(job, release, now = Date.now()) {
  return touch(job, JOB.STORED, now, { release });
}

export function markLive(job, proof, now = Date.now()) {
  return touch(job, JOB.LIVE, now, { live: proof });
}

/* ──────────────────────────────────────────────────────────────── QC */

export const QC_LIMITS = Object.freeze({ width: 1080, height: 1920, minSeconds: 8, maxSeconds: 20, minBytes: 300_000, maxBytes: 40_000_000, minLuma: 18, maxLuma: 235, minMotion: 0.4 });

/**
 * Checks on the finished file (ffprobe JSON + signalstats samples): the size
 * and codec Instagram Reels and the site need, an AAC 48 kHz track, a sane
 * length, frames that are neither black nor blown out, and real motion
 * (a still image is not a video).
 * @param probe ffprobe -show_streams -show_format -of json
 * @param stats { luma: number[] (YAVG per sample), motion: number (mean YDIF) }
 */
export function qcVerdict(probe = {}, stats = {}, limits = QC_LIMITS) {
  const v = (probe.streams || []).find((s) => s.codec_type === "video") || {};
  const a = (probe.streams || []).find((s) => s.codec_type === "audio") || {};
  const seconds = Number(probe.format?.duration) || 0;
  const bytes = Number(probe.format?.size) || 0;
  const luma = Array.isArray(stats.luma) ? stats.luma : [];
  const checks = [
    ["video_h264", v.codec_name === "h264"],
    ["size_1080x1920", Number(v.width) === limits.width && Number(v.height) === limits.height],
    ["pix_fmt_yuv420p", v.pix_fmt === "yuv420p"],
    ["audio_aac_48k", a.codec_name === "aac" && Number(a.sample_rate) === 48000],
    ["duration", seconds >= limits.minSeconds && seconds <= limits.maxSeconds],
    ["file_size", bytes >= limits.minBytes && bytes <= limits.maxBytes],
    ["not_black_or_white", luma.length >= 3 && luma.every((y) => y >= limits.minLuma && y <= limits.maxLuma)],
    ["motion", Number(stats.motion) >= limits.minMotion],
  ].map(([name, pass]) => ({ name, pass: Boolean(pass) }));
  return { pass: checks.every((c) => c.pass), checks, seconds: Number(seconds.toFixed(2)), bytes, width: Number(v.width) || 0, height: Number(v.height) || 0 };
}

/* ──────────────────────────────────────────────────────── live proof */

/**
 * The job is LIVE when the site's reels feed (GitHub Pages index.json) lists
 * its video for the product, labelled, and the served file has the stored size.
 */
export function liveProof(feed = {}, job = {}, servedBytes = 0) {
  const entry = (feed.reels || []).find((e) => e?.id === `lookbook-${job.productId}` && e.productId === job.productId);
  if (!entry) return { live: false, reason: "not_in_feed" };
  if (entry.look !== job.look) return { live: false, reason: "look_mismatch" };
  if (!Array.isArray(entry.labels) || !entry.labels.some((l) => /#פרסומת/.test(l))) return { live: false, reason: "no_disclosure_label" };
  if (!(Number(servedBytes) > 0) || Number(servedBytes) !== Number(job.release?.bytes)) return { live: false, reason: "served_size_differs" };
  return { live: true, feedId: entry.id, video: entry.video, bytes: Number(servedBytes) };
}
