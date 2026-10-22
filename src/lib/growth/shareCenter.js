// "פרסום לרשתות" (Studio → ShareCenter.jsx): every product the creator shows
// in her store, ready to post on each network in one tap.
//
// LikeLink2 cannot post into a person's own profile: Facebook stopped letting
// apps post to personal profiles in 2018, and Instagram and TikTok publish only
// through reviewed business apps. So each button opens the network's own share
// window with the post and a tracked link (utm_source = the network), and the
// creator presses "post" there. Nothing here is called published: a post is
// the creator's own mark ("סימנת שפרסמת") until a network returns its id.
//
// The words come from the daily drop (buildDrop): hooks from the product's own
// fields, the ad disclosure first, the video labelled by who made it. No
// prices, urgency, sales or reviews.
import { buildDrop, dropHooks, pickProduct, safeCopy, trackedLink, DROP_AD } from "./dailyDrop.js";
import { FEED_LOOKS } from "../reelsFeed.js";
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";

const LOOK_OF_STYLE = Object.freeze(Object.fromEntries(Object.entries(FEED_LOOKS).map(([look, row]) => [row.style, look])));
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const enc = encodeURIComponent;
const httpsUrl = (s) => /^https:\/\//i.test(String(s || ""));

/**
 * The reels feed as loadReelsFeed returns it (marketplace:videos-shaped) →
 * the feed entries the daily drop reads ({ productId, look, video, poster }).
 */
export function feedEntries(videos = []) {
  const out = [];
  for (const v of Array.isArray(videos) ? videos : []) {
    const productId = v?.productTags?.[0]?.productId;
    const look = LOOK_OF_STYLE[v?.style];
    if (!productId || !look || !httpsUrl(v?.videoUrl)) continue;
    out.push({ id: v.id, productId, look, video: v.videoUrl, poster: httpsUrl(v.poster) ? v.poster : "", createdAt: Number(v.createdAt) || 0 });
  }
  return out;
}

/** The best video per product (real footage, then the seller's, then Luna). */
export function bestFeedReels(entries = []) {
  const best = new Map();
  for (const e of entries) {
    const rank = FEED_LOOKS[e.look]?.rank || 0;
    const cur = best.get(e.productId);
    if (!cur || rank > (FEED_LOOKS[cur.look]?.rank || 0)) best.set(e.productId, e);
  }
  return best;
}

/**
 * Networks, in the order a creator in Israel reaches people. `prefilled` means
 * the network's share window opens with the post already in it; otherwise the
 * text is copied first and pasted there (Facebook ignores pre-filled text;
 * Instagram and TikTok have no web share window, the video is posted from the app).
 */
export const SHARE_NETWORKS = Object.freeze([
  { id: "whatsapp", he: "וואטסאפ", prefilled: true },
  { id: "facebook", he: "פייסבוק", prefilled: false },
  { id: "instagram", he: "אינסטגרם", prefilled: false, video: true },
  { id: "tiktok", he: "טיקטוק", prefilled: false, video: true },
  { id: "telegram", he: "טלגרם", prefilled: true },
  { id: "threads", he: "Threads", prefilled: true },
  { id: "pinterest", he: "פינטרסט", prefilled: true },
  { id: "x", he: "X", prefilled: true },
  { id: "email", he: "מייל", prefilled: true },
]);

const OFFICIAL_HOSTS = Object.freeze({
  whatsapp: "wa.me", facebook: "www.facebook.com", instagram: "www.instagram.com", tiktok: "www.tiktok.com",
  telegram: "t.me", threads: "www.threads.net", pinterest: "www.pinterest.com", x: "twitter.com",
});
export function officialHost(network) {
  return OFFICIAL_HOSTS[network] || "";
}

/**
 * One product's kit: for every network the text, the tracked link and the URL
 * that opens the network's own share window. `image` is the product's own
 * photo (Pinterest needs one); `reel` its best video from the feed, if any.
 */
export function productShareKit({ product, reel = null, image = "", now = Date.now(), origin = PRODUCTION_ORIGIN } = {}) {
  if (!product?.id) return null;
  const day = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const campaign = `studio_share_${day}`;
  // A different checked hook per product and per day, so a feed of posts
  // never opens five times with the same line.
  const hooks = dropHooks(product, { reel });
  const seed = [...String(product.id)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) + Math.floor(now / 86_400_000);
  const drop = buildDrop({ product, reel, now, origin, campaign, hook: hooks.length ? hooks[seed % hooks.length] : "" });
  const title = clean(product.displayTitle || product.title);
  const hook = drop.posts.instagram.onScreen[0] || title;
  const page = `/p/${product.id}`;
  const link = (net) => trackedLink(page, net, campaign, origin);
  const short = [DROP_AD, hook, title].join("\n");
  const posts = drop.posts;
  const written = {
    whatsapp: posts.whatsapp.text,
    facebook: posts.facebook.text,
    instagram: posts.instagram.caption,
    tiktok: posts.tiktok.caption,
    telegram: short,
    threads: `${short}\n${link("threads")}`,
    pinterest: `${hook} · ${title} · ${DROP_AD}`.slice(0, 480),
    x: `${DROP_AD}\n${hook}`,
    email: `${short}\n\n${link("email")}`,
  };
  // A store's own title or description can carry a claim the copy rules keep
  // out (a price, "sale", "best"…): then the post is the disclosure, the hook
  // and the link only.
  const texts = Object.fromEntries(Object.entries(written).map(([net, t]) => [net, safeCopy(t) ? t : [DROP_AD, hook, net === "x" || net === "pinterest" ? "" : link(net)].filter(Boolean).join("\n")]));
  const open = {
    whatsapp: `https://wa.me/?text=${enc(texts.whatsapp)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(link("facebook"))}`,
    instagram: "https://www.instagram.com/",
    tiktok: "https://www.tiktok.com/upload",
    telegram: `https://t.me/share/url?url=${enc(link("telegram"))}&text=${enc(texts.telegram)}`,
    threads: `https://www.threads.net/intent/post?text=${enc(texts.threads)}`,
    pinterest: httpsUrl(image) ? `https://www.pinterest.com/pin/create/button/?url=${enc(link("pinterest"))}&media=${enc(image)}&description=${enc(texts.pinterest)}` : "",
    x: `https://twitter.com/intent/tweet?text=${enc(texts.x)}&url=${enc(link("x"))}`,
    email: `mailto:?subject=${enc(safeCopy(title) ? title : hook)}&body=${enc(texts.email)}`,
  };
  const actions = SHARE_NETWORKS.filter((n) => open[n.id]).map((n) => ({ ...n, text: texts[n.id], link: link(n.id), href: open[n.id] }));
  return {
    productId: product.id,
    title,
    hook,
    campaign,
    video: reel ? { url: reel.video, poster: reel.poster || "", look: reel.look, note: FEED_LOOKS[reel.look]?.note || "" } : null,
    actions,
    // The plain "copy link" is its own source, so a pasted copy is never
    // counted as WhatsApp (or any network) traffic.
    link: link("copy"),
  };
}

/** The whole store, one link for every network (the creator's own page). */
export function storeShareKit({ marketer, now = Date.now(), origin = PRODUCTION_ORIGIN } = {}) {
  if (!marketer?.slug) return null;
  const day = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const campaign = `studio_store_${day}`;
  const page = `/u/${marketer.slug}`;
  const link = (net) => trackedLink(page, net, campaign, origin);
  const line = `ההמלצות שלי במקום אחד, כל מוצר עם סרטון וקישור ישיר לחנות 🛍️`;
  const text = (net) => [DROP_AD, line, link(net)].join("\n");
  const actions = [
    { id: "whatsapp", he: "וואטסאפ", prefilled: true, text: text("whatsapp"), link: link("whatsapp"), href: `https://wa.me/?text=${enc(text("whatsapp"))}` },
    { id: "facebook", he: "פייסבוק", prefilled: false, text: text("facebook"), link: link("facebook"), href: `https://www.facebook.com/sharer/sharer.php?u=${enc(link("facebook"))}` },
    { id: "telegram", he: "טלגרם", prefilled: true, text: [DROP_AD, line].join("\n"), link: link("telegram"), href: `https://t.me/share/url?url=${enc(link("telegram"))}&text=${enc([DROP_AD, line].join("\n"))}` },
    { id: "threads", he: "Threads", prefilled: true, text: text("threads"), link: link("threads"), href: `https://www.threads.net/intent/post?text=${enc(text("threads"))}` },
    { id: "x", he: "X", prefilled: true, text: [DROP_AD, line].join("\n"), link: link("x"), href: `https://twitter.com/intent/tweet?text=${enc([DROP_AD, line].join("\n"))}&url=${enc(link("x"))}` },
  ];
  // The bio link: one per network and never dated (it stays in the profile), so
  // the store's visits show where they came from.
  const bioLink = (net) => trackedLink(page, `${net}_bio`, "bio", origin);
  const bio = { instagram: bioLink("instagram"), tiktok: bioLink("tiktok"), facebook: bioLink("facebook") };
  return { link: link("copy"), line, actions, bio, campaign };
}

/**
 * Today's product for the top of the page: a daily rotation over the
 * creator's products that have a video (the daily drop's own rule, without
 * trends: the Studio does not read Google Trends).
 */
export function todaysPick({ products = [], entries = [], now = Date.now() } = {}) {
  return pickProduct({ products, reels: entries, now });
}

/** Every text this module writes passes the copy rules and carries the disclosure. */
export function kitIsClean(kit) {
  return Boolean(kit) && kit.actions.every((a) => a.text.includes(DROP_AD) && safeCopy(a.text));
}
