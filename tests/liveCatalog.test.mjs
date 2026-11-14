// The catalog a build publishes (scripts/catalog/live-catalog.mjs): the shipped
// copy plus every product the live cloud lists, so Google, link previews and
// Pinterest see a page for each listed product, not only the copy's five
// (2026-11-03: ~70 cloud products answered the home page's head, canonical "/").
// And the visit count (src/lib/funnel.js): people, never crawlers.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLiveKeys, mergeCatalog, buildCatalog, LIVE_KEYS } from "../scripts/catalog/live-catalog.mjs";
import { prerender, listedFromSnapshot } from "../scripts/prerender-products.mjs";
import { writePinsFeed } from "../scripts/pins-feed.mjs";
import { BOT_UA, VISIT_FLAG } from "../src/lib/funnel.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const copy = JSON.parse(readFileSync(join(ROOT, "public/snapshot/kv.json"), "utf8"));
const base = copy.keys["marketplace:products"][0];
const cloudOnly = { ...base, id: "ae-1005000000000001", title: "עגילים · חישוק", affiliateUrl: "https://s.click.aliexpress.com/e/_cloudOnly1" };
const sharedA = { ...base, id: "ae-1005000000000002", affiliateUrl: "https://s.click.aliexpress.com/e/_shared" };
const sharedB = { ...base, id: "ae-1005000000000003", affiliateUrl: "https://s.click.aliexpress.com/e/_shared" };
const live = (products, marketers = copy.keys["marketplace:marketers"]) => ({ ok: true, keys: { "marketplace:products": products, "marketplace:marketers": marketers } });

test("the copy wins for its own ids, the cloud only adds, and a failed read is the copy alone", () => {
  const changed = { ...base, title: "changed in the cloud" };
  const { doc, added } = mergeCatalog(copy, live([changed, cloudOnly]));
  assert.equal(added, 1);
  const byId = new Map(doc.keys["marketplace:products"].map((p) => [p.id, p]));
  assert.equal(byId.get(base.id).title, base.title, "the checked copy's record stays");
  assert.ok(byId.has(cloudOnly.id));
  const failed = mergeCatalog(copy, { ok: false, reason: "network" });
  assert.equal(failed.added, 0);
  assert.deepEqual(failed.doc.keys, copy.keys);
});

test("the radar's archive in the cloud decides over the copy (and its restore); nothing else does", () => {
  const copy = { keys: { "marketplace:products": [{ id: "a", status: "approved", title: "A", affiliateUrl: "https://s.click.aliexpress.com/e/_a" }, { id: "b", status: "approved", title: "B" }, { id: "c", status: "approved", title: "C" }] } };
  const cloud = [
    { id: "a", status: "archived", archivedBy: "radar", archivedAt: "2026-11-15T06:00:00.000Z", archivedReason: "ההזמנות יורדות", title: "changed in the cloud" },
    { id: "b", status: "archived", archivedBy: "owner" },
    { id: "c", status: "approved", restoredBy: "radar", restoredAt: "2026-11-16T06:00:00.000Z" },
  ];
  const { doc, archived } = mergeCatalog(copy, live(cloud));
  const [a, b, c] = doc.keys["marketplace:products"];
  assert.equal(a.status, "archived");
  assert.equal(a.archivedBy, "radar");
  assert.equal(a.title, "A", "only the archive fields come from the cloud");
  assert.equal(a.affiliateUrl, "https://s.click.aliexpress.com/e/_a", "the link is kept");
  assert.equal(b.status, "approved", "a person's archive in the cloud is not the radar's: the copy stands");
  assert.equal(c.status, "approved");
  assert.equal(c.restoredBy, "radar");
  assert.equal(archived, 1);
});

test("the live read is the browser's own: anon key, only the allowlisted rows, never throws", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, json: async () => [{ key: "marketplace:products", value: JSON.stringify([cloudOnly]) }, { key: "marketplace:payouts", value: "[]" }, { key: "marketplace:marketers", value: "{broken" }] };
  };
  const r = await loadLiveKeys({ fetchImpl, cloud: { url: "https://x.supabase.co", anonKey: "anon" } });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.keys), ["marketplace:products"], "unknown and broken rows are skipped");
  assert.match(decodeURIComponent(seen[0].url), /\/rest\/v1\/kv\?select=key,value&key=in\.\("marketplace:products","marketplace:marketers"\)/);
  assert.equal(seen[0].init.headers.apikey, "anon");
  assert.deepEqual(LIVE_KEYS, ["marketplace:products", "marketplace:marketers"]);
  assert.deepEqual(await loadLiveKeys({ fetchImpl: async () => ({ ok: false, status: 402 }), cloud: { url: "u", anonKey: "k" } }), { ok: false, reason: "http_402" });
  assert.deepEqual(await loadLiveKeys({ fetchImpl: async () => { throw new TypeError("fetch failed"); }, cloud: { url: "u", anonKey: "k" } }), { ok: false, reason: "network" });
  const built = await buildCatalog(copy, { fetchImpl: async () => { throw new TypeError("x"); }, cloud: { url: "u", anonKey: "k" } });
  assert.equal(built.live, "network");
  assert.equal(built.added, 0);
});

test("every listed cloud product gets its own page and sitemap entry; a shared link never does", () => {
  const dist = mkdtempSync(join(tmpdir(), "ll-live-"));
  writeFileSync(join(dist, "index.html"), readFileSync(join(ROOT, "index.html"), "utf8"));
  writeFileSync(join(dist, "_redirects"), "/*  /index.html  200\n");
  const { doc } = mergeCatalog(copy, live([cloudOnly, sharedA, sharedB]));
  const r = prerender({ dist, catalog: doc, now: new Date("2026-11-03T00:00:00Z") });
  const listed = listedFromSnapshot(doc).products.map((x) => x.product.id);
  assert.ok(listed.includes(cloudOnly.id));
  assert.ok(!listed.includes(sharedA.id) && !listed.includes(sharedB.id), "a link shared by two products is not promotable");
  assert.equal(r.pages, listed.length);
  const page = readFileSync(join(dist, "p", `${cloudOnly.id}.html`), "utf8");
  assert.match(page, new RegExp(`<link rel="canonical" href="https://likelink2\\.vercel\\.app/p/${cloudOnly.id}"`));
  assert.ok(!existsSync(join(dist, "p", `${sharedA.id}.html`)));
  const sitemap = readFileSync(join(dist, "sitemap-static.xml"), "utf8");
  assert.ok(sitemap.includes(`/p/${cloudOnly.id}`));
  assert.match(readFileSync(join(dist, "_redirects"), "utf8"), new RegExp(`/p/${cloudOnly.id}  /p/${cloudOnly.id}\\.html  200`));
});

test("Pinterest pins the cloud's listed products too", () => {
  const dist = mkdtempSync(join(tmpdir(), "ll-pins-"));
  mkdirSync(join(dist, "snapshot"), { recursive: true });
  writeFileSync(join(dist, "snapshot", "kv.json"), JSON.stringify(copy));
  const copyOnly = writePinsFeed({ dist, now: new Date("2026-11-03T00:00:00Z") });
  const withCloud = writePinsFeed({ dist, catalog: mergeCatalog(copy, live([cloudOnly])).doc, now: new Date("2026-11-03T00:00:00Z") });
  assert.ok(withCloud.pins >= copyOnly.pins);
  assert.ok(readFileSync(join(dist, "pins.xml"), "utf8").includes(cloudOnly.id));
});

test("a visit is a person: crawlers and preview bots are not counted, in-app browsers are", () => {
  for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "TelegramBot (like TwitterBot)",
    "Pinterestbot/1.0", "facebookexternalhit/1.1", "Mozilla/5.0 HeadlessChrome/120", "Mozilla/5.0 (compatible; bingbot/2.0)"]) {
    assert.ok(BOT_UA.test(ua), ua);
  }
  for (const ua of ["Mozilla/5.0 (iPhone) Pinterest for iOS/12.0", "Mozilla/5.0 (iPhone) Instagram 300.0", "Mozilla/5.0 (Linux; Android 14) Telegram-Android/10.0",
    "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36", "Mozilla/5.0 (iPhone) FBAN/FBIOS"]) {
    assert.ok(!BOT_UA.test(ua), ua);
  }
  assert.equal(VISIT_FLAG, "ll_visit");
});
