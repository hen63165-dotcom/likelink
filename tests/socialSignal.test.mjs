// 🗣️ Bluesky and 📢 Meta's Ad Library (src/lib/growth/socialSignal.js; the owner, 2026-11-21: "surpass
// every company, one by one"): the official, open doors only, counts only, a thin week says nothing,
// a full page is a floor, the moving kinds are listened to first, and the board keeps numbers only.
import test from "node:test";
import assert from "node:assert/strict";
import { SOCIAL, adsPage, adsUrl, bskyPage, bskyUrl, socialKinds, talkOf } from "../src/lib/growth/socialSignal.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { sourceOf } from "../src/lib/growth/runReceipt.js";

const NOW = Date.parse("2026-11-21T12:00:00Z");

test("social: Bluesky's public search for the exact phrase, one week at a time", () => {
  const u = new URL(bskyUrl('lip "oil"', { since: NOW - 7 * 86_400_000, until: NOW }));
  assert.equal(u.origin + u.pathname, "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts");
  assert.equal(u.searchParams.get("q"), '"lip oil"');
  assert.equal(u.searchParams.get("since"), "2026-11-14T12:00:00Z");
  assert.equal(u.searchParams.get("until"), "2026-11-21T12:00:00Z");
  assert.deepEqual(bskyPage({ posts: [{}, {}], cursor: "c2" }), { n: 2, cursor: "c2" });
  assert.equal(bskyPage({ error: "AuthRequired" }), null);
});

test("social: this week against last week; a thin week or a full count says nothing about direction", () => {
  assert.deepEqual(talkOf(30, 20), { week: 30, prev: 20, weekPct: 50, capped: false });
  assert.equal(talkOf(30, 5).weekPct, null);
  const full = talkOf(SOCIAL.pageSize * SOCIAL.maxPages, 40);
  assert.equal(full.capped, true);
  assert.equal(full.weekPct, null);
  assert.equal(talkOf(null, 3), null);
});

test("social: Meta's Ad Library — the EU's ads for a phrase since a day, with the owner's token", () => {
  const u = new URL(adsUrl("cloud night light", { token: "T", since: NOW - 7 * 86_400_000 }));
  assert.equal(u.origin + u.pathname, "https://graph.facebook.com/v21.0/ads_archive");
  assert.equal(u.searchParams.get("search_terms"), "cloud night light");
  assert.equal(u.searchParams.get("ad_delivery_date_min"), "2026-11-14");
  assert.deepEqual(JSON.parse(u.searchParams.get("ad_reached_countries")), SOCIAL.ads.countries);
  assert.deepEqual(adsPage({ data: [{ id: "1" }], paging: { next: "x" } }), { n: 1, more: true });
  assert.equal(adsPage({ error: { message: "x" } }), null);
});

test("social: the moving kinds are listened to first", () => {
  const ks = socialKinds([
    { id: "a", en: "steady thing", stage: "STEADY", alpha: { score: 90 } },
    { id: "b", en: "rising thing", stage: "RISING" },
    { id: "c", en: "new listings", stage: "STEADY", factory: { born: true } },
    { id: "d", en: "emerging thing", stage: "EMERGING" },
    { id: "e", en: "", stage: "EMERGING" },
  ], { max: 3 });
  assert.deepEqual(ks.map((c) => c.id), ["d", "b", "c"]);
});

test("social: the receipt names both doors; the board keeps counts only", () => {
  assert.equal(sourceOf("https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=x"), "bluesky");
  assert.equal(sourceOf("https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=x"), "bluesky");
  assert.equal(sourceOf("https://graph.facebook.com/v21.0/ads_archive?search_terms=x"), "metaAds");
  assert.equal(sourceOf("https://graph.facebook.com/v21.0/123/media"), "instagram");
  const b = sanitizeBoard({ at: "2026-11-21T06:00:00.000Z", record: {}, concepts: [{ id: "lip-oil", he: "שמן שפתיים", en: "lip oil", stage: "STEADY", gap: { state: "ARRIVED" }, social: { bsky: { week: 30, prev: 20, weekPct: 50, capped: false, text: "<b>x</b>" }, ads: { week: 12, more: false } } }] });
  assert.deepEqual(b.concepts[0].social, { bsky: { week: 30, prev: 20, weekPct: 50, capped: false }, ads: { week: 12, more: false } });
});
