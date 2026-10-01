// EVERY PUBLISHING PATH → ONE GATE, ONE LOG, ONE LEDGER
//
// The creator autopilot (14 channel types), brand pulse, distribution
// campaigns, the reel ingest and the Instagram step all write the shared
// publication log through publicationGate: PUBLISHED only with the provider's
// own post id; a "successful" send without one is DELIVERED_UNVERIFIED. The
// creator autopilot never promotes a product that fails catalog integrity.
// The orchestrator's post ledger verifies site-feed posts in the public feed.
import test from "node:test";
import assert from "node:assert/strict";

const SB = "https://sb.test";
process.env.VITE_SUPABASE_URL = SB;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

const kv = new Map();
const calls = [];
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, method: init.method || "GET" });
  if (u.startsWith(`${SB}/rest/v1/kv?key=eq.`)) {
    const key = decodeURIComponent(u.split("key=eq.")[1].split("&")[0]);
    return jsonResponse(200, kv.has(key) ? [{ value: kv.get(key) }] : []);
  }
  if (u.startsWith(`${SB}/rest/v1/kv?on_conflict=key`)) {
    const b = JSON.parse(init.body);
    kv.set(b.key, typeof b.value === "string" ? b.value : JSON.stringify(b.value));
    return jsonResponse(201, {});
  }
  if (u.startsWith("https://api.telegram.org/botBOT/sendMessage")) return jsonResponse(200, { ok: true, result: { message_id: 77 } });
  if (u.startsWith("https://hook.test")) return jsonResponse(200, {}); // delivered, no id
  if (u.startsWith("https://discord.test/hook")) return jsonResponse(200, { id: "1234567890" });
  return jsonResponse(404, {});
};
const read = (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : undefined);

import { publicationGate, withPublications, PUBLISH_LOG_CAP, externalDestinations } from "../src/lib/publishing/adapters.js";
import { buildPostLedger, PUB_STATUS } from "../src/lib/publishing/orchestrator.js";
import { creativeClass, CREATIVE_CLASS } from "../src/lib/media/videoCapability.js";

test("the gate: PUBLISHED only with a provider id; the shared log is newest-first and capped", () => {
  assert.equal(publicationGate("PUBLISHED", "77"), "PUBLISHED");
  assert.equal(publicationGate("PUBLISHED", null), "DELIVERED_UNVERIFIED");
  assert.equal(publicationGate("PUBLISHED_UNVERIFIED", ""), "DELIVERED_UNVERIFIED");
  assert.equal(publicationGate("FAILED", null), "FAILED");
  const old = Array.from({ length: PUBLISH_LOG_CAP }, (_, i) => ({ id: `old${i}` }));
  const rows = withPublications(old, [{ channel: "webhook", status: "PUBLISHED" }]);
  assert.equal(rows.length, PUBLISH_LOG_CAP);
  assert.deepEqual([rows[0].channel, rows[0].status], ["webhook", "DELIVERED_UNVERIFIED"], "newest first, through the gate");
});

test("creator autopilot: only promotable products, provider ids kept, every attempt logged through the gate", async () => {
  kv.clear(); calls.length = 0;
  const { runOne } = await import("../api/autopilot.mjs");
  const products = [
    { id: "s1", title: "סרום", price: 45, marketerId: "m1", status: "approved", image: "https://ae01.alicdn.com/a.jpg", affiliateUrl: "https://best.aliexpress.com" },
    { id: "s2", title: "מעיל", price: 129, marketerId: "m1", status: "approved", image: "https://ae01.alicdn.com/b.jpg", affiliateUrl: "https://best.aliexpress.com" },
    { id: "p-ok", title: "עגילים", price: 47, marketerId: "m1", status: "approved", image: "https://ae01.alicdn.com/c.jpg", affiliateUrl: "https://s.click.aliexpress.com/e/_ok" },
  ];
  const store = { __products: products, __marketers: [{ id: "m1", name: "A", slug: "a" }] };
  const cfg = { channels: [{ type: "telegram", botToken: "BOT", chatId: "@chan" }, { type: "webhook", url: "https://hook.test/x" }, { type: "discord", url: "https://discord.test/hook" }], intervalMinutes: 60 };
  const r = await runOne(store, "m1", cfg, "https://likelink2.vercel.app");
  assert.equal(r.ok, true);
  assert.equal(cfg.history[0].productId, "p-ok", "a product whose link is shared (store home page) is never picked");
  const by = Object.fromEntries(r.results.map((x) => [x.channel, x]));
  assert.deepEqual([by.telegram.providerId, by.telegram.status], ["77", "PUBLISHED"]);
  assert.deepEqual([by.webhook.providerId, by.webhook.status], [null, "DELIVERED_UNVERIFIED"]);
  assert.deepEqual([by.discord.providerId, by.discord.status], ["1234567890", "PUBLISHED"]);
  assert.ok(calls.some((c) => c.url.startsWith("https://discord.test/hook?wait=true")), "Discord is asked for the created message");
  const log = read("publish:log");
  const row = (ch) => log.find((x) => x.channel === ch);
  assert.deepEqual([row("telegram").status, row("telegram").externalId, row("telegram").contentType], ["PUBLISHED", "77", "creator_autopilot"]);
  assert.equal(row("webhook").status, "DELIVERED_UNVERIFIED");
  assert.equal(row("webhook").externalId, null);
  assert.ok(!log.some((x) => x.status === "PUBLISHED" && !x.externalId), "no PUBLISHED row without a provider id");
});

test("brand pulse logs through the same gate (a webhook 200 without an id is not PUBLISHED)", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../api/autopilot.mjs", import.meta.url), "utf8");
  assert.match(src, /externalId = await sendWebhook\(ch, \{ text, source: "likelink-brand-pulse", link \}\)/);
  assert.match(src, /PUBLICATION_STATE\[publicationGate\(entry\.status, entry\.externalId\)\]/);
  assert.equal((src.match(/await sendToChannel\(ch, \{/g) || []).length, 3, "all three creator paths use the one dispatcher");
  assert.doesNotMatch(src, /else if \(ch\.type === "wordpress"\) await sendWordPress/, "no copy of the old channel chain is left");
});

test("distribution campaigns write the shared log (provider id + permalink)", async () => {
  const { publishPlanPost } = await import("../src/lib/discovery/distributionStore.js");
  const store = new Map([["distribution:plans:m1", [{ id: "plan1", productId: "p-ok", media: {}, calendar: [{ postId: "x1", channel: "telegram", caption: "hi", state: "READY" }] }]]]);
  const kvGet = async (k, fb) => (store.has(k) ? structuredClone(store.get(k)) : fb);
  const kvSet = async (k, v) => { store.set(k, structuredClone(v)); };
  const fetchImpl = async (url) => (String(url).includes("api.telegram.org")
    ? jsonResponse(200, { ok: true, result: { message_id: 5, chat: { username: "chan" } } })
    : new Response("<html>t.me post</html>", { status: 200 }));
  const r = await publishPlanPost({ kvGet, kvSet, scopeKey: "m1", planId: "plan1", postId: "x1", creds: { telegram: { botToken: "123456789:AAH-fake_test_token_for_unit_tests_0", chatId: "@chan" } }, fetchImpl });
  assert.equal(r.ok, true);
  const log = store.get("publish:log");
  assert.equal(log[0].contentType, "distribution_post");
  assert.equal(log[0].externalId, "5");
  assert.ok(["PUBLISHED", "PUBLISHED_UNVERIFIED"].includes(log[0].status));
});

test("post ledger: site-feed posts verified in the public feed; nothing promoted to PUBLISHED without an id", () => {
  const log = [
    { contentId: "pulse_34", contentType: "luna_pulse", channel: "web", status: "PUBLISHED", externalId: "bp_1", publishedAt: "2026-10-01T16:20:32Z" },
    { contentId: "pulse_33", contentType: "luna_pulse", channel: "web", status: "PUBLISHED", externalId: "bp_0" },
    { contentId: "pulse_34", contentType: "luna_pulse", channel: "external", status: "REQUIRES_CONNECTION", externalId: null },
    { contentId: "creator_autopilot_m1_p-ok", contentType: "creator_autopilot", channel: "telegram", status: "PUBLISHED", externalId: "77" },
    { contentId: "reel_x", contentType: "native_reel", channel: "web", status: "PUBLISHED", externalId: "bp_9" },
  ];
  const posts = buildPostLedger({ log, feedIds: ["bp_1"] });
  assert.deepEqual(posts.map((p) => p.contentId), ["pulse_34", "pulse_33", "creator_autopilot_m1_p-ok"], "reels are the creative ledger's, not here");
  assert.equal(posts[0].channels.find((c) => c.channel === "web").status, PUB_STATUS.VERIFIED);
  assert.equal(posts[0].channels.find((c) => c.channel === "external").status, "REQUIRES_CONNECTION");
  assert.equal(posts[1].channels[0].status, PUB_STATUS.NOT_IN_PUBLIC_FEED);
  assert.equal(posts[2].channels[0].providerId, "77");
});

test("destinations: every adapter in the code is listed — LikeLoop platform channels + 14 creator channel types", () => {
  const d = externalDestinations({ FB_PAGE_ID: "1", FB_PAGE_TOKEN: "t" }, {});
  const ids = d.map((x) => x.id);
  for (const id of ["instagram", "facebook", "tiktok", "pinterest", "youtube", "telegram_brand", "webhook_brand"]) assert.ok(ids.includes(id), id);
  for (const t of ["telegram", "webhook", "facebook", "discord", "slack", "whatsapp", "instagram", "x", "linkedin", "mastodon", "bluesky", "reddit", "pinterest", "wordpress"]) assert.ok(ids.includes(`creator_${t}`), t);
  assert.equal(d.find((x) => x.id === "facebook").status, "NO_PUBLISHER", "credentials without a publisher are not 'connected'");
  assert.equal(d.find((x) => x.id === "instagram").status, "NEEDS_CONNECTION");
});

test("three creative classes, never confused", () => {
  const render = (style) => ({ videoUrl: "https://x/api/og?mode=media&path=ugc/p/1-a.mp4", videoProvider: "likelink_native_render", synthetic: true, style, videoStatus: "completed" });
  assert.equal(creativeClass(render("ugc_style")), CREATIVE_CLASS.SYNTHETIC_UGC_STYLE);
  for (const s of ["cinematic3d", "likeloop_cinematic", "animated_story", "animated_unbox", "studio"]) assert.equal(creativeClass(render(s)), CREATIVE_CLASS.ANIMATED_PRODUCT_CREATIVE, s);
  assert.equal(creativeClass({ videoUrl: "https://cdn.x/a.mp4", marketerId: "m1", humanFilmed: true }), CREATIVE_CLASS.REAL_UGC);
  assert.equal(creativeClass({ videoUrl: "https://cdn.x/a.mp4", marketerId: "m1" }), CREATIVE_CLASS.REAL_PRODUCT_VIDEO);
  assert.equal(creativeClass({ ...render("ugc_style"), humanFilmed: true }), CREATIVE_CLASS.SYNTHETIC_UGC_STYLE, "a render is never real UGC, whatever the flag says");
  assert.equal(creativeClass({ image: "https://x/a.jpg" }), CREATIVE_CLASS.NO_VIDEO);
});
