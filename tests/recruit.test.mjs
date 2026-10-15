// Creator recruitment posts (src/lib/growth/recruit.js): every angle says
// only something live today, never income, user counts or "spots left", and
// every link is the site's own /join with its own UTM.
import test from "node:test";
import assert from "node:assert/strict";
import { CREATOR_ANGLES, RECRUIT_FORBIDDEN, recruitSafe, buildCreatorPost } from "../src/lib/growth/recruit.js";
import { PRODUCTION_ORIGIN } from "../src/constants/domain.js";

const DAY = 86_400_000;

test("every angle passes the claim rules", () => {
  assert.ok(CREATOR_ANGLES.length >= 5);
  for (const a of CREATOR_ANGLES) {
    assert.ok(recruitSafe(a.hook), `${a.id}: hook`);
    assert.ok(recruitSafe(a.body), `${a.id}: body`);
    assert.ok(a.hook.length <= 70, `${a.id}: a short hook`);
  }
  assert.equal(new Set(CREATOR_ANGLES.map((a) => a.id)).size, CREATOR_ANGLES.length);
});

test("income promises, user counts and scarcity are refused", () => {
  for (const bad of [
    "תרוויחי מהבית",
    "הכנסה פסיבית מכל פוסט",
    "כבר 500 יוצרות בפנים",
    "נשארו מקומות אחרונים",
    "הצטרפי לאלפי יוצרות",
    "הצלחה מובטחת",
    "120 משתמשים נרשמו השבוע",
  ]) assert.equal(recruitSafe(bad), false, bad);
  assert.ok(RECRUIT_FORBIDDEN.test("מוגבל"));
  assert.ok(recruitSafe("דף יוצרת עם פוסטים שאפשר לקנות מהם, בחינם"));
});

test("one angle a day, rotating; every network gets its own tracked /join link", () => {
  const seen = new Set();
  for (let d = 0; d < CREATOR_ANGLES.length; d++) {
    const post = buildCreatorPost({ now: Date.UTC(2026, 9, 11) + d * DAY });
    assert.equal(post.safe, true);
    seen.add(post.angle);
    assert.match(post.campaign, /^creators_\d{8}_[a-z_]+$/);
    const links = [
      post.posts.instagram.bioLink,
      post.posts.tiktok.bioLink,
      post.posts.whatsapp.text.match(/https:\/\/\S+/)[0],
      post.posts.facebook.text.match(/https:\/\/\S+/)[0],
    ];
    const sources = links.map((l) => {
      const u = new URL(l);
      assert.equal(u.origin, PRODUCTION_ORIGIN);
      assert.equal(u.pathname, "/join");
      assert.equal(u.searchParams.get("utm_medium"), "social");
      assert.equal(u.searchParams.get("utm_campaign"), post.campaign);
      return u.searchParams.get("utm_source");
    });
    assert.deepEqual(sources, ["instagram", "tiktok", "whatsapp", "facebook"]);
    for (const text of [post.posts.instagram.caption, post.posts.tiktok.caption, post.posts.whatsapp.text, post.posts.facebook.text]) {
      assert.match(text, /LikeLink2 הוא המיזם שלי/, "the owner says it is her project");
      assert.ok(recruitSafe(text), text);
      assert.doesNotMatch(text, /likelink\.(com|to)/);
    }
  }
  assert.equal(seen.size, CREATOR_ANGLES.length, "a full cycle uses every angle once");
});

test("the daily drop page carries today's creator post only when it is safe", async () => {
  const { dropPage } = await import("../scripts/marketing/daily-drop.mjs");
  const { buildDrop } = await import("../src/lib/growth/dailyDrop.js");
  const product = { id: "p1", title: "צמיד", link: "https://s.click.aliexpress.com/e/_abc", category: "jewelry" };
  const drop = buildDrop({ product, reel: { id: "r1", productId: "p1", file: "r1.mp4", look: "seller" }, now: 0 });
  const creators = buildCreatorPost({ now: 0 });
  const html = dropPage(drop, { creators });
  assert.match(html, /פוסט גיוס יוצרות להיום/);
  assert.ok(html.includes(creators.posts.instagram.bioLink.replace(/&/g, "&amp;")));
  assert.doesNotMatch(dropPage(drop, { creators: { ...creators, safe: false } }), /פוסט גיוס יוצרות/);
  assert.doesNotMatch(dropPage(drop), /פוסט גיוס יוצרות/);
});

test("/join is a real public page: free plan from plans.js, a mail to the legal contact, no promises", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const { parsePath } = await import("../src/utils/routing.js");
  const { SPA_SECTIONS } = await import("../scripts/rebase-static-pages.mjs");
  const { sectionPages } = await import("../scripts/prerender-products.mjs");
  const { FEATURES } = await import("../src/lib/plans.js");
  const { LEGAL_OWNER_PLACEHOLDERS } = await import("../src/lib/legal/documents.js");
  const { JOIN_PATH, JOIN_SEO, freePlanFeatures, joinMailto } = await import("../src/lib/growth/join.js");

  assert.equal(parsePath(JOIN_PATH).type, "join");
  assert.ok(SPA_SECTIONS.includes("join"));
  assert.ok(JSON.parse(read("vercel.json")).rewrites.some((r) => r.source === JOIN_PATH));
  assert.match(read("src/App.jsx"), /"join"/);
  const page = sectionPages().find((p) => p.path === JOIN_PATH);
  assert.equal(page.canonical, `${PRODUCTION_ORIGIN}${JOIN_PATH}`, "a shared /join link gets its own preview");

  const free = freePlanFeatures();
  assert.ok(free.length > 0);
  for (const f of free) {
    const row = FEATURES.find((x) => x.id === f.id);
    assert.equal(row.status, "live", `${f.id}: only live features are promised`);
    assert.ok(row.plans.free, `${f.id}: really in the free plan`);
  }

  const mail = joinMailto({ source: "instagram", campaign: "creators_20261011_shop_page" });
  assert.ok(mail.startsWith(`mailto:${LEGAL_OWNER_PLACEHOLDERS.email}?`), "the same public address as the legal pack");
  assert.match(decodeURIComponent(mail), /הגעתי מ: instagram \(creators_20261011_shop_page\)/);
  assert.doesNotMatch(decodeURIComponent(joinMailto({ source: "<img src=x onerror=1>" })), /[<>]/, "no markup survives in the mail body");

  const ui = read("src/components/discover/join.jsx");
  for (const text of [JOIN_SEO.title, JOIN_SEO.description, ...ui.match(/"[^"\n]*[א-ת][^"\n]*"/g)]) {
    assert.ok(recruitSafe(text.replace(/^"|"$/g, "")), `/join: ${text}`);
  }
  assert.doesNotMatch(ui + JOIN_SEO.description, /LTK/, "no other company's brand in our marketing copy");
});

test("Google preferred sources: the official deeplink to our own domain, shown only once Google lists the site", async () => {
  const { PREFERRED_SOURCE, preferredSourceLive } = await import("../src/lib/growth/preferredSource.js");
  assert.equal(PREFERRED_SOURCE.url, "https://www.google.com/preferences/source?q=likelink2.vercel.app");
  assert.equal(preferredSourceLive({ listedSince: null }), false, "no link to an empty search");
  assert.equal(preferredSourceLive({ listedSince: "2026-10-20" }), true);
  const { readFileSync } = await import("node:fs");
  const shell = readFileSync(new URL("../src/components/discover/PublicShell.jsx", import.meta.url), "utf8");
  assert.match(shell, /\{preferredSourceLive\(\) \? \(/);
  assert.doesNotMatch(shell, /news\.google\.com\/swg/, "no third-party script on our pages");
});

test("every indexable page lets Google show a large image (Discover)", async () => {
  const { INDEX_ROBOTS, isIndexable } = await import("../src/constants/seo.js");
  const { buildProductSeo } = await import("../src/lib/discovery/surfaces.js");
  assert.match(INDEX_ROBOTS, /max-image-preview:large/);
  assert.ok(isIndexable(INDEX_ROBOTS) && isIndexable("index,follow") && !isIndexable("noindex,follow"));
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/lib/seo.js", "src/components/discover/PublicSite.jsx", "scripts/prerender-products.mjs", "src/lib/discovery/surfaces.js", "api/og.mjs"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /"index,follow"/, `${f}: uses INDEX_ROBOTS`);
  }
  assert.equal(typeof buildProductSeo, "function");
});
