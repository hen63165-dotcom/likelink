// "טיקטוק של LikeLink2": the daily TikTok engine.
//
// Every morning it plans today's two TikToks from what is real on the site:
// the products, their videos (the seller's footage in LikeLink2's cut, a
// person's own clip, Luna's AI tips) and the guide's checks. Each post gets
// the trendiest formats TikTok runs on (a video reveal, a photo-mode
// checklist carousel, a "yes or no?" question, Luna's tip, a green-screen
// script for the owner), an on-screen hook, a caption that opens with the
// disclosure, 3–5 hashtags, and the exact steps to post it with a trending
// sound from TikTok's own library.
//
// It improves itself from the owner's own results: after a post has run, its
// numbers (views, likes, comments, shares, saves — read in TikTok's
// analytics) are logged through Actions → "TikTok results", and the next
// plans explore the formats that still lack evidence and lean on the format
// that is really doing best (median views, at least MIN_POSTS posts each —
// a correlation, never a promise).
//
// Nothing here posts: TikTok publishes only from the account owner's app (or,
// later, its official Content Posting API with her connected app). A post is
// "published" only when she posts it; this file never says so.
import { HOOK_FORBIDDEN, buildHookSet, matchTrends, worldOf } from "./likeloop.js";
import { DROP_AD, DROP_FORBIDDEN } from "./dailyDrop.js";
import { GUIDE } from "../guide.js";
import { SELLER_SKIP } from "../reelsFeed.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

/** Before any format is called better than another: posts measured per format. */
export const MIN_POSTS = 3;
export const POSTS_PER_DAY = 2;
// TikTok's bio is 80 characters.
export const TIKTOK_BIO_MAX = 80;
// Beyond the drop's rules: TikTok-style bait and claims nobody can back.
export const TIKTOK_FORBIDDEN = /(לייק אם|עקבו כדי|תייגו \d|שתפו עם \d|ויראלי|טרנד מספר|הכי|ניסיתי|קניתי|הזמנתי|אצלי בבית|ממליצה בחום|שינה לי את החיים)/;

/** A line is safe when no rule list matches it. */
export function tiktokSafe(text) {
  const t = String(text ?? "");
  return !HOOK_FORBIDDEN.test(t) && !DROP_FORBIDDEN.test(t) && !TIKTOK_FORBIDDEN.test(t);
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const dayIndex = (now) => Math.floor(now / 86_400_000);
const ymd = (now) => new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
const tagWord = (s) => `#${clean(s).replace(/[^\p{L}\p{N}]+/gu, "")}`;

// Look ranks: a person's own footage, then the seller's, then Luna.
const LOOK_RANK = { real: 4, seller: 3, talking: 2, still: 1 };
const isLuna = (r) => r?.look === "talking" || r?.look === "still";

/**
 * The formats. `needs` says what a post of that format is made from;
 * `owner: true` means the owner films it herself (a script is given).
 */
export const TIKTOK_FORMATS = Object.freeze({
  reveal: {
    he: "חשיפה בווידאו",
    why: "סרטון קצר של המוצר עם משפט פתיחה על המסך, וסאונד טרנדי מהספרייה של טיקטוק.",
    needs: "product_video",
  },
  checklist: {
    he: "קרוסלת תמונות: 3 דברים לבדוק",
    why: "מצב תמונות (Photo Mode) של טיקטוק: 5 שקפים מוכנים, טיפ בכל אחד. פוסט שכדאי לשמור לפני הזמנה.",
    needs: "product_image",
  },
  would_you: {
    he: "כן או לא?",
    why: "סרטון המוצר עם שאלה פשוטה על המסך, שמזמינה לענות בתגובות.",
    needs: "product_video",
  },
  luna_tip: {
    he: "הטיפ של לונה",
    why: "טיפ קצר ושימושי מלונה. לונה היא דמות AI, ומסמנים את זה בטיקטוק.",
    needs: "luna_video",
  },
  green_screen: {
    he: "גרין סקרין: את מול עמוד המוצר",
    why: "את מדברת למצלמה, ועמוד המוצר מאחורייך (אפקט Green Screen של טיקטוק). 5 דקות צילום, עם תסריט מוכן.",
    needs: "product_image",
    owner: true,
  },
});
export const FORMAT_IDS = Object.freeze(Object.keys(TIKTOK_FORMATS));
// The daily slots are made from what is ready; formats the owner films are a bonus card.
export const AUTO_FORMATS = Object.freeze(FORMAT_IDS.filter((f) => !TIKTOK_FORMATS[f].owner));

/** Usable media per product: the best non-Luna video, Luna's tip, a clean image. */
export function mediaByProduct(reels = [], products = [], { imageOf = () => "" } = {}) {
  const out = new Map();
  for (const p of products) out.set(p.id, { product: p, video: null, luna: null, image: imageOf(p) || "" });
  for (const r of Array.isArray(reels) ? reels : []) {
    const row = out.get(r?.productId);
    if (!row || !r?.video) continue;
    if (r.look === "seller" && SELLER_SKIP[String(r.productId)]) continue; // the clip shows another item
    if (isLuna(r)) {
      if (!row.luna || (r.createdAt || 0) > (row.luna.createdAt || 0)) row.luna = r;
    } else if (!row.video || (LOOK_RANK[r.look] || 0) > (LOOK_RANK[row.video.look] || 0)) {
      row.video = r;
    }
  }
  return out;
}

/** Which formats today's catalog can really make. */
export function availableFormats(media) {
  const rows = [...media.values()];
  return FORMAT_IDS.filter((f) => {
    const need = TIKTOK_FORMATS[f].needs;
    if (need === "product_video") return rows.some((r) => r.video);
    if (need === "luna_video") return rows.some((r) => r.luna);
    if (need === "product_image") return rows.some((r) => r.image);
    return false;
  });
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const n0 = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);

/** A post id says its day, slot and format: tt-20261016-1-reveal. */
export const POST_ID = /^tt-(\d{8})-([1-9])-([a-z_]+)$/;
export function postId(now, slot, format) {
  return `tt-${ymd(now)}-${slot}-${format}`;
}
export function formatOfPost(id) {
  const m = POST_ID.exec(String(id || ""));
  return m && TIKTOK_FORMATS[m[3]] ? m[3] : null;
}

/**
 * What the owner's own results say, per format. Below MIN_POSTS a format is
 * INSUFFICIENT_EVIDENCE; a leader is named only when two formats are measured,
 * and it is a correlation over her posts, not a forecast.
 */
export function learnTikTok(results = [], { minPosts = MIN_POSTS } = {}) {
  const latest = new Map(); // the last numbers logged for each post count
  for (const r of Array.isArray(results) ? results : []) {
    const format = formatOfPost(r?.id);
    if (!format) continue;
    latest.set(r.id, { ...r, format });
  }
  const formats = {};
  for (const f of FORMAT_IDS) formats[f] = { format: f, posts: 0, views: [], engagement: [] };
  for (const r of latest.values()) {
    const row = formats[r.format];
    const views = n0(r.views);
    const acts = n0(r.likes) + n0(r.comments) + n0(r.shares) + n0(r.saves);
    row.posts += 1;
    row.views.push(views);
    row.engagement.push(views ? acts / views : 0);
  }
  const table = Object.values(formats).map((r) => ({
    format: r.format,
    posts: r.posts,
    medianViews: median(r.views),
    engagementRate: r.posts ? Math.round((r.engagement.reduce((a, b) => a + b, 0) / r.posts) * 1000) / 10 : 0,
    status: r.posts >= minPosts ? "MEASURED" : "INSUFFICIENT_EVIDENCE",
  }));
  const measured = table.filter((r) => r.status === "MEASURED").sort((a, b) => b.medianViews - a.medianViews || b.engagementRate - a.engagementRate);
  return {
    minPosts,
    posts: latest.size,
    formats: table,
    leader: measured.length >= 2 && measured[0].medianViews > measured[1].medianViews ? measured[0].format : null,
    basis: "owner_logged_tiktok_analytics",
    note: "מתאם מתוך הפוסטים שלך, לא הבטחה לצפיות",
  };
}

/**
 * Today's formats: first the ones still short of evidence (exploring, in a
 * daily rotation), then — once there is a leader — the leader takes one slot
 * every day and the other slot keeps exploring or rotates.
 */
export function selectFormats(learning, available = AUTO_FORMATS, { count = POSTS_PER_DAY, now = Date.now() } = {}) {
  const avail = AUTO_FORMATS.filter((f) => available.includes(f));
  if (!avail.length) return [];
  const rows = new Map((learning?.formats || []).map((r) => [r.format, r]));
  const day = dayIndex(now);
  const rotate = (list) => list.map((_, i) => list[(i + day) % list.length]);
  const unproven = rotate(avail.filter((f) => (rows.get(f)?.status || "INSUFFICIENT_EVIDENCE") !== "MEASURED"));
  const proven = avail.filter((f) => rows.get(f)?.status === "MEASURED").sort((a, b) => (rows.get(b).medianViews || 0) - (rows.get(a).medianViews || 0));
  const picks = [];
  const leader = learning?.leader && avail.includes(learning.leader) ? learning.leader : null;
  if (leader) picks.push(leader);
  for (const f of [...unproven, ...rotate(proven)]) if (!picks.includes(f)) picks.push(f);
  return picks.slice(0, Math.min(count, picks.length));
}

/** Hashtags: 3–5, the matched trend first, the product's world, the brand. */
export function tiktokHashtags(product, trend = null) {
  const niche = {
    Accessories: ["#תכשיטים", "#מתנה", "#אקססוריז"],
    Fashion: ["#אופנה", "#סטייל", "#לוק"],
    Home: ["#לבית", "#עיצובהבית", "#רעיונות"],
    Beauty: ["#ביוטי", "#טיפוח", "#איפור"],
    Kids: ["#ילדים", "#הורות", "#מתנה"],
    Gaming: ["#גיימינג", "#גיימר", "#סטאפ"],
    Tech: ["#גאדג׳טים", "#טכנולוגיה", "#סטאפ"],
  }[product?.category] || ["#מציאות", "#קניותאונליין", "#שווהלבדוק"];
  return [...new Set([trend ? tagWord(trend.term) : null, ...niche, "#LikeLink2"].filter((t) => t && t.length > 2))].slice(0, 5);
}

/** The guide's checks that fit a product, then the ones for any order. */
export function checksFor(product, limit = 3) {
  const text = `${product?.displayTitle || product?.title || ""} ${product?.description || ""}`;
  // A check whose words a post may not use (sale/discount talk) stays in the guide only.
  const ok = (c) => tiktokSafe(c.title.he) && tiktokSafe(c.body.he);
  const fit = GUIDE.checks.filter((c) => c.match && c.match.test(text) && ok(c));
  const general = GUIDE.checks.filter((c) => !c.match && ok(c));
  return [...fit, ...general].slice(0, limit).map((c) => ({ id: c.id, title: c.title.he, body: c.body.he }));
}

export function tiktokLink(path, campaign, origin = PRODUCTION_ORIGIN) {
  const u = new URL(`${origin}${path}`);
  u.searchParams.set("utm_source", "tiktok");
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", campaign);
  return u.href;
}

/** The link in the TikTok bio: the site's video feed, where every video has its product and store link. */
export function bioLink(origin = PRODUCTION_ORIGIN) {
  const u = new URL(`${origin}/reels`);
  u.searchParams.set("utm_source", "tiktok");
  u.searchParams.set("utm_medium", "bio");
  return u.href;
}

/** The account itself: name ideas, bio (≤80), link, photo. The owner opens the account. */
export function accountKit(origin = PRODUCTION_ORIGIN) {
  const bio = "ההמלצות של היוצרים, במקום אחד 🛍️ #פרסומת · קישורי שותפים";
  return {
    usernames: ["likelink2", "likelink2.il", "likelink2_shop", "likelink.il"],
    name: "LikeLink2",
    bio: bio.slice(0, TIKTOK_BIO_MAX),
    link: bioLink(origin),
    photo: "../icons/icon-512.webp",
  };
}

const MEDIA_NOTE = {
  real: "צילום אמיתי של המוצר.",
  seller: "צילום המוצר: המוכר.",
  talking: "לונה היא דמות AI.",
  still: "לונה היא דמות AI.",
};

function hookFor(product, format, { trend, seed, media }) {
  const w = worldOf(product.category);
  const set = buildHookSet(product, { trend: trend ? { term: trend.term, source: trend.source, observedAt: trend.observedAt } : null });
  const pick = (type) => set.find((h) => h.type === type)?.text;
  // Lines a video really backs: what it shows, never a box it doesn't open or a use nobody filmed.
  const options = {
    reveal: [trend ? pick("trend") : null, `ככה נראה ה${w.noun} הזה בווידאו`, `רואים את ה${w.noun} מקרוב לפני שקונים`, pick("problem"), pick("gift")],
    would_you: [`${w.noun} כזה: כן או לא?`, "הייתם לוקחים את זה? כן או לא"],
    checklist: [`3 דברים לבדוק לפני שקונים ${w.noun} באונליין`, "שמרו את זה לפני ההזמנה הבאה"],
    luna_tip: [media?.title, "טיפ קצר לפני שמזמינים"],
    green_screen: [pick("problem"), "מצאתי משהו ששווה לראות מקרוב", pick("gift")],
  }[format] || [`ככה נראה ה${w.noun} בווידאו`];
  const safe = options.filter(Boolean).map(clean).filter((h) => h.length <= 70 && tiktokSafe(h));
  if (format === "luna_tip" && safe[0] === clean(media?.title)) return safe[0]; // the tip's own topic
  return safe.length ? safe[seed % safe.length] : `ככה נראה ה${w.noun} בווידאו`;
}

/** One post of a format for a product, every line checked. */
export function buildTikTokPost({ format, row, slot, now = Date.now(), trend = null, origin = PRODUCTION_ORIGIN }) {
  const product = row.product;
  const id = postId(now, slot, format);
  const seed = dayIndex(now) + slot;
  const media = format === "luna_tip" ? row.luna : ["reveal", "would_you"].includes(format) ? row.video : null;
  const hook = hookFor(product, format, { trend, seed, media });
  const title = clean(product.displayTitle || product.title);
  const tags = tiktokHashtags(product, trend);
  const ai = Boolean(media && isLuna(media));
  const note = media ? MEDIA_NOTE[media.look] || "" : "התמונות: מתוך סרטון המוכר או החנות.";
  const checks = format === "checklist" ? checksFor(product, 3) : [];
  const slides = format === "checklist"
    ? [
        { image: row.image, text: hook },
        ...checks.map((c, i) => ({ image: row.image, text: `${i + 1}. ${c.title}`, sub: c.body })),
        { image: row.image, text: "הקישור לחנות בביו 🔗", sub: title },
      ]
    : [];
  const onScreen = {
    reveal: [hook, title.slice(0, 40)],
    would_you: [hook, "כתבו בתגובות 👇"],
    checklist: slides.map((s) => s.text),
    luna_tip: [hook],
    green_screen: [hook],
  }[format];
  const script = format === "green_screen"
    ? [
        `פתיחה (2 שניות, ישר למצלמה): "${hook}"`,
        `"זה ${title}. מה שאני אוהבת לבדוק לפני שמזמינים:"`,
        ...checksFor(product, 2).map((c) => `"${c.title}. ${c.body.split(/(?<=\.)\s/)[0]}"`),
        `"הקישור לחנות בביו. וזה קישור שותפים."`,
      ]
    : [];
  const caption = [DROP_AD, hook, format === "would_you" ? "כתבו לי בתגובות: כן או לא?" : title, "הקישור בביו 🔗", note, tags.join(" ")].filter(Boolean).join("\n");
  const sound = format === "green_screen" ? "הקול שלך, בלי מוזיקה או עם מוזיקה שקטה מאוד." : "סאונד טרנדי מתוך הספרייה של טיקטוק (לחצו על \"הוספת צליל\"), בעוצמה נמוכה של 10–20%.";
  return {
    id,
    slot,
    format,
    formatName: TIKTOK_FORMATS[format].he,
    why: TIKTOK_FORMATS[format].why,
    owner: Boolean(TIKTOK_FORMATS[format].owner),
    product: { id: product.id, title, link: tiktokLink(`/p/${product.id}`, id, origin) },
    video: media ? { file: media.video, poster: media.poster || "", look: media.look, labels: media.labels || [] } : null,
    slides,
    hook,
    onScreen,
    caption,
    hashtags: tags,
    sound,
    script,
    aiLabel: ai,
    disclosure: true,
    lines: [hook, caption, ...onScreen, ...script, ...slides.flatMap((s) => [s.text, s.sub || ""])],
  };
}

/** Why a format is on today's plan, in the owner's words. */
export const CHOICE_TEXT = Object.freeze({
  exploring: (n) => `בודקים את הפורמט הזה: עוד אין מספיק פוסטים שלו כדי לדעת (צריך ${n}).`,
  leader: () => "הפורמט שהביא אצלך הכי הרבה צפיות עד עכשיו (חציון, מהנתונים שרשמת). מתאם, לא הבטחה.",
  rotation: () => "פורמט שכבר נמדד אצלך. ממשיכים לגוון.",
  bonus: () => "בונוס: פוסט שאת מצלמת בעצמך, עם תסריט מוכן.",
});

/** Post steps in the app, the same for every post (TikTok's own labels in quotes). */
export function postSteps(post) {
  const steps = [
    post.slides.length ? "פותחים טיקטוק ← + ← בוחרים את התמונות לפי הסדר (מצב תמונות)." : post.owner ? "פותחים טיקטוק ← + ← אפקטים ← Green Screen ← בוחרים צילום מסך של עמוד המוצר." : "פותחים טיקטוק ← + ← העלאה ← בוחרים את הסרטון שהורדתם.",
    `מוסיפים ${post.sound}`,
    "מוסיפים את הטקסט שעל המסך (Aa).",
    "מדביקים את הכיתוב.",
    "עוד אפשרויות ← \"גילוי תוכן הפוסט\" ← מפעילים ← \"תוכן ממותג\" (זה קישור שותפים).",
  ];
  if (post.aiLabel) steps.push("עוד אפשרויות ← מפעילים \"תוכן שנוצר ב-AI\" (לונה היא דמות AI).");
  steps.push("מפרסמים, ונשארים לענות לתגובות בשעה הראשונה.");
  return steps;
}

/**
 * Today's TikTok plan: formats chosen by the learning loop, products in a
 * daily rotation (a really matched trend first), every line checked.
 */
export function tiktokDay({ products = [], reels = [], trends = [], results = [], now = Date.now(), imageOf = () => "", origin = PRODUCTION_ORIGIN } = {}) {
  const media = mediaByProduct(reels, products, { imageOf });
  const learning = learnTikTok(results);
  const available = availableFormats(media);
  const formats = selectFormats(learning, available, { now });
  const matched = matchTrends(trends, products).filter((t) => t.relevance === "MATCHED").sort((a, b) => b.confidence - a.confidence)[0] || null;
  const usedProducts = new Set();
  const posts = [];
  // The bonus card: a format the owner films herself, when the catalog allows it.
  if (available.includes("green_screen")) formats.push("green_screen");
  formats.forEach((format, i) => {
    const need = TIKTOK_FORMATS[format].needs;
    const fits = [...media.values()]
      .filter((r) => (need === "product_video" ? r.video : need === "luna_video" ? r.luna : r.image))
      .sort((a, b) => String(a.product.id).localeCompare(String(b.product.id)));
    if (!fits.length) return;
    const trendRow = matched && fits.find((r) => matched.products.includes(r.product.id) && !usedProducts.has(r.product.id));
    const pool = fits.filter((r) => !usedProducts.has(r.product.id));
    const list = pool.length ? pool : fits;
    // Each format walks its own order day by day, so the same video does not come back the next day.
    const row = trendRow || list[(dayIndex(now) + FORMAT_IDS.indexOf(format)) % list.length];
    usedProducts.add(row.product.id);
    const post = buildTikTokPost({ format, row, slot: i + 1, now, trend: trendRow ? matched : null, origin });
    const stat = learning.formats.find((r) => r.format === format);
    const choice = TIKTOK_FORMATS[format].owner ? "bonus" : learning.leader === format ? "leader" : stat?.status === "MEASURED" ? "rotation" : "exploring";
    if (post.lines.every((l) => tiktokSafe(l) || l === DROP_AD)) posts.push({ ...post, choice, steps: postSteps(post) });
  });
  return {
    date: new Date(now).toISOString().slice(0, 10),
    posts,
    learning,
    account: accountKit(origin),
    schedule: ["12:30–13:30", "20:00–21:30"],
    scheduleNote: "שעות להתחיל איתן ולבדוק. אחרי שבועיים, בניתוח הנתונים של טיקטוק (\"מתי העוקבים פעילים\") רואים את השעות שלך ומעדכנים.",
    trend: matched ? { term: matched.term, source: matched.source, observedAt: matched.observedAt } : null,
  };
}

/**
 * The coming week, ready to schedule in TikTok Studio (it schedules up to 10
 * days ahead): the ready-made posts of each day from tomorrow, at the
 * suggested times. Today's trend is today's only; later days use the
 * rotation, and the owner's own-film bonus stays a daily card. Each post keeps
 * its day in its id, so results logged later land on the right post.
 */
export const WEEK_DAYS = 7;
export const SCHEDULE_AT = ["12:45", "20:30"]; // Israel time, inside the suggested windows
export function tiktokWeek(args = {}, { days = WEEK_DAYS } = {}) {
  const now = args.now ?? Date.now();
  return Array.from({ length: days }, (_, i) => {
    const day = tiktokDay({ ...args, trends: [], now: now + (i + 1) * 86_400_000 });
    const posts = day.posts.filter((p) => !TIKTOK_FORMATS[p.format].owner).map((p) => ({ ...p, at: SCHEDULE_AT[(p.slot - 1) % SCHEDULE_AT.length] }));
    return { date: day.date, posts };
  }).filter((d) => d.posts.length);
}

// A post id's day must be a real calendar day, not after today (UTC, with a
// day's slack for Israel time) and not older than the page could have planned
// it: catches a mistyped date without keeping a log of every plan.
export const RESULT_MAX_AGE_DAYS = 120;
function plausibleDay(id, now) {
  const d = POST_ID.exec(id)?.[1] || "";
  const t = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
  if (!Number.isFinite(t) || ymd(t) !== d) return false;
  return t <= now + 86_400_000 && now - t <= RESULT_MAX_AGE_DAYS * 86_400_000;
}

/** One results entry from the Actions form; numbers only, a known post id. */
export function parseResult(input = {}, { now = Date.now() } = {}) {
  const id = String(input.id || "").trim();
  if (!formatOfPost(id) || !plausibleDay(id, now)) return { ok: false, error: "post_id" };
  const nums = {};
  for (const k of ["views", "likes", "comments", "shares", "saves"]) {
    const raw = String(input[k] ?? "0").replace(/[,\s]/g, "");
    if (!/^\d{1,10}$/.test(raw)) return { ok: false, error: k };
    nums[k] = Number(raw);
  }
  return { ok: true, entry: { id, ...nums, loggedAt: new Date(now).toISOString() } };
}
