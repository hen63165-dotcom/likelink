// "פרסום לרשתות" (src/lib/growth/shareCenter.js, Studio → ShareCenter.jsx).
//
// 2026-10-18 the owner added her Facebook link in "עיצוב החנות שלי", the
// screen said "6 פורסמו", and nothing reached Facebook: the social links only
// show on the store page, and LikeLink2 cannot post into a personal profile.
// These tests pin the fix:
//   - every product kit opens the network's OWN share window, with the post
//     (the ad disclosure first, the copy rules kept) and a link tagged with
//     that network (utm_source), on the site's own origin;
//   - nothing in the share center or the store screen calls a post published;
//   - AutoPilot's "פרסום עכשיו" says what a channel answered, never a blanket success.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feedEntries, bestFeedReels, productShareKit, storeShareKit, kitIsClean, officialHost, SHARE_NETWORKS, todaysPick } from "../src/lib/growth/shareCenter.js";
import { DROP_AD } from "../src/lib/growth/dailyDrop.js";
import { runOutcome, runAutoPilotNow, getAutoPilotConfig } from "../src/lib/autoPilot.js";
import { PRODUCTION_ORIGIN } from "../src/constants/domain.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const snapshot = JSON.parse(read("public/snapshot/kv.json"));
const val = (k) => { const v = snapshot.keys?.[k]; return typeof v === "string" ? JSON.parse(v) : v; };
const products = val("marketplace:products") || [];
const marketers = val("marketplace:marketers") || [];
const now = Date.UTC(2026, 9, 18, 9);

const feed = [
  { id: "lookbook-p1", style: "seller_lookbook", videoUrl: "https://hen63165-dotcom.github.io/likelink/media/reels/lookbook-p1.mp4", productTags: [{ productId: "p1" }] },
  { id: "luna-p1", style: "luna_talking", videoUrl: "https://hen63165-dotcom.github.io/likelink/media/reels/luna-p1.mp4", productTags: [{ productId: "p1" }] },
  { id: "luna-p2", style: "luna_tip", videoUrl: "https://hen63165-dotcom.github.io/likelink/media/reels/luna-p2.mp4", productTags: [{ productId: "p2" }] },
  { id: "bad", style: "luna_tip", videoUrl: "javascript:alert(1)", productTags: [{ productId: "p3" }] },
];

test("feed records → entries; the best video per product is the seller's before Luna", () => {
  const entries = feedEntries(feed);
  assert.deepEqual(entries.map((e) => `${e.productId}:${e.look}`), ["p1:lookbook", "p1:talking", "p2:still"], "a non-https video is dropped");
  const best = bestFeedReels(entries);
  assert.equal(best.get("p1").look, "lookbook");
  assert.equal(best.get("p2").look, "still");
});

test("every listed product: each network opens its own share window, with the disclosure and a tracked link", () => {
  assert.ok(products.length > 0, "the catalog copy has products");
  for (const p of products) {
    const kit = productShareKit({ product: p, image: p.image, now });
    assert.ok(kitIsClean(kit), `${p.id}: every post carries ${DROP_AD} and passes the copy rules`);
    for (const a of kit.actions) {
      assert.ok(a.text.startsWith(DROP_AD) || a.text.includes(`\n${DROP_AD}`) || a.text.includes(DROP_AD), `${p.id}/${a.id}: disclosure`);
      const link = new URL(a.link);
      assert.equal(link.origin, PRODUCTION_ORIGIN, `${p.id}/${a.id}: the link is the site's own page`);
      assert.equal(link.pathname, `/p/${p.id}`);
      assert.equal(link.searchParams.get("utm_source"), a.id, `${p.id}/${a.id}: the visit is attributed to the network`);
      assert.equal(link.searchParams.get("utm_campaign"), "studio_share_20261018");
      if (a.id === "email") assert.match(a.href, /^mailto:\?/);
      else assert.equal(new URL(a.href).host, officialHost(a.id), `${p.id}/${a.id}: the network's official address`);
      assert.doesNotMatch(a.text, /פורסם|הכי נמכר|ביקורות|כוכבים/, `${p.id}/${a.id}: no claims`);
    }
    // Pinterest needs a real photo; without one the button is not offered.
    const noImage = productShareKit({ product: p, image: "", now });
    assert.ok(!noImage.actions.some((a) => a.id === "pinterest"));
  }
});

test("the post names who made the video; the network ids are the known list", () => {
  const p = products[0];
  const reel = { productId: p.id, look: "lookbook", video: "https://hen63165-dotcom.github.io/likelink/media/reels/x.mp4" };
  const kit = productShareKit({ product: p, reel, image: p.image, now });
  assert.match(kit.video.note, /המוכר/);
  assert.match(kit.actions.find((a) => a.id === "facebook").text, /המוכר/);
  const luna = productShareKit({ product: p, reel: { ...reel, look: "talking" }, image: p.image, now });
  assert.match(luna.actions.find((a) => a.id === "instagram").text, /AI/);
  assert.deepEqual(SHARE_NETWORKS.map((n) => n.id), ["whatsapp", "facebook", "instagram", "tiktok", "telegram", "threads", "pinterest", "x", "email"]);
  // Facebook ignores pre-filled text, Instagram and TikTok have no web share window: copy first.
  for (const id of ["facebook", "instagram", "tiktok"]) assert.equal(SHARE_NETWORKS.find((n) => n.id === id).prefilled, false);
});

test("a store's own title with a price or 'sale' never reaches a post", () => {
  const p = { id: "px", title: "Hot SALE 50% טבעת ₪9.99 הכי טוב", description: "מבצע רק היום", category: "Accessories" };
  const kit = productShareKit({ product: p, image: "https://ae-pic-a1.aliexpress-media.com/kf/x.jpg", now });
  assert.ok(kitIsClean(kit));
  for (const a of kit.actions) assert.doesNotMatch(a.text, /₪|50%|מבצע|רק היום|הכי טוב/);
  // The e-mail subject is the title only when the title passes the same rules.
  const subject = new URL(kit.actions.find((a) => a.id === "email").href).searchParams.get("subject");
  assert.doesNotMatch(subject, /₪|50%|SALE|הכי טוב/);
  assert.equal(subject, kit.hook);
});

test("a very long store title never cuts the disclosure off the Pinterest text", () => {
  const p = { id: "pl", title: "טבעת כסף ".repeat(80), category: "Accessories" };
  const kit = productShareKit({ product: p, image: "https://ae-pic-a1.aliexpress-media.com/kf/x.jpg", now });
  const pin = kit.actions.find((a) => a.id === "pinterest");
  assert.ok(pin.text.length <= 480);
  assert.ok(pin.text.startsWith(DROP_AD));
  assert.ok(new URL(pin.href).searchParams.get("description").startsWith(DROP_AD));
});

test("the plain copy link is its own source, never a network's", () => {
  const p = { id: "p1", title: "טבעת כסף", category: "Accessories" };
  const kit = productShareKit({ product: p, now });
  assert.equal(new URL(kit.link).searchParams.get("utm_source"), "copy");
  assert.equal(new URL(kit.link).pathname, "/p/p1");
  assert.match(readFileSync(new URL("../src/components/studio/ShareCenter.jsx", import.meta.url), "utf8"), /copyText\(kit\.link\)/);
});

test("the store kit: one tagged link per network, bio links that never change", () => {
  const kit = storeShareKit({ marketer: { slug: "alyostyle" }, now });
  for (const a of kit.actions) {
    assert.ok(a.text.includes(DROP_AD));
    assert.equal(new URL(a.link).searchParams.get("utm_source"), a.id);
    assert.equal(new URL(a.link).pathname, "/u/alyostyle");
  }
  const later = storeShareKit({ marketer: { slug: "alyostyle" }, now: now + 7 * 86_400_000 });
  assert.deepEqual(later.bio, kit.bio, "a bio link stays the same every day");
  assert.equal(new URL(kit.bio.instagram).searchParams.get("utm_source"), "instagram_bio");
  assert.equal(storeShareKit({ marketer: {} }), null);
});

test("today's product rotates over products that have a video", () => {
  const ps = [{ id: "p1", title: "טבעת", category: "Accessories" }, { id: "p2", title: "צמיד", category: "Accessories" }, { id: "p9", title: "אין סרטון" }];
  const entries = feedEntries(feed);
  const picks = new Set([0, 1, 2, 3].map((d) => todaysPick({ products: ps, entries, now: now + d * 86_400_000 })?.product?.id));
  assert.deepEqual([...picks].sort(), ["p1", "p2"]);
});

test("AutoPilot 'פרסום עכשיו' says what the channels answered", () => {
  assert.match(runOutcome({ ok: false, results: [] }), /אין ערוץ מחובר/);
  assert.match(runOutcome({ ok: false, error: "no products" }), /אין מוצרים/);
  assert.match(runOutcome({ ok: false, results: [{ channel: "facebook", ok: false, detail: "token expired" }] }), /^לא נשלח\. facebook: token expired/);
  assert.match(runOutcome({ ok: true, results: [{ channel: "telegram", ok: true, providerId: "12" }, { channel: "facebook", ok: false, detail: "x" }] }), /^נשלח ל־telegram · לא נשלח ל־facebook/);
  const ui = read("src/components/sell/AutoPilot.jsx");
  assert.match(ui, /showToast\(runOutcome\(d\)\)/);
  assert.doesNotMatch(ui, /פוסט יצא לדרך/);
});

test("a run whose every channel failed reaches runOutcome as data (HTTP 200), other calls still throw", async () => {
  const realFetch = globalThis.fetch;
  const answer = { ok: false, results: [{ channel: "facebook", ok: false, detail: "token expired" }] };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => answer });
  try {
    const d = await runAutoPilotNow("m1");
    assert.match(runOutcome(d), /^לא נשלח\. facebook: token expired/);
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: "no products" }) });
    assert.match(runOutcome(await runAutoPilotNow("m1")), /אין מוצרים/);
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: "not_allowed" }) });
    await assert.rejects(() => getAutoPilotConfig("m1"), /not_allowed/);
    await assert.rejects(() => runAutoPilotNow("m1"), /not_allowed/);
    globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => answer });
    await assert.rejects(() => runAutoPilotNow("m1"));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Studio: 'פרסום לרשתות' is a core item; the store screen never says a post was published", () => {
  const shell = read("src/components/studio/StudioShell.jsx");
  assert.match(shell, /\{ view: VIEW_IDS\.SHARE, icon: Megaphone, he: "פרסום לרשתות"/);
  const core = shell.slice(shell.indexOf('id: "core"'), shell.indexOf('id: "create"'));
  assert.match(core, /VIEW_IDS\.SHARE/);
  assert.match(shell, /case VIEW_IDS\.SHARE: return <ShareCenter onNavigate=\{navigate\} \/>/);
  const store = read("src/components/studio/StorefrontDesign.jsx");
  assert.doesNotMatch(store, /פורסמו|מוצר פורסם/);
  assert.match(store, /הם לא מפרסמים פוסט ברשת/);
  const center = read("src/components/studio/ShareCenter.jsx");
  // The page explains that LikeLink2 never writes "פורסם" for her; it never shows it as a status.
  assert.doesNotMatch(center, /PUBLISHED|פורסם בהצלחה|פורסם ✅|>\s*פורסם\s*</);
  assert.match(center, /סימנת שפרסמת/);
  assert.match(center, /רק במכשיר הזה/, "the mark is the creator's own, said as such");
  const links = read("src/components/studio/AddProductLink.jsx");
  assert.doesNotMatch(links, /\? "פורסם" : "Published"/);
});
