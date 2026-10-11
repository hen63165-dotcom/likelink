// Operations: the browser stops hammering a cloud that refuses (402) or does
// not answer, never fakes a write, never loads forever; public visits skip the
// Studio-only reads; every build says which commit it is; the ops doctor
// (scripts/ops/doctor.mjs) tells code defects from provider limits and
// missing credentials, on the real catalog copy.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloudFailureKind, createBreaker, dedupe, RESTRICTED_TTL_MS, studioDataWanted, withTimeout } from "../src/lib/cloudBreaker.js";
import { toHebrewError } from "../src/lib/errorMessages.js";
import { CLOUD_PAUSED_HE, isCloudUnavailable } from "../src/lib/catalogSnapshot.js";
import { checkFeedDoc, checkSnapshot, classifyCloud, compareRevision, KIND, ROUTES, runDoctor } from "../scripts/ops/doctor.mjs";
import { versionInfo } from "../scripts/write-version.mjs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const SUPABASE_402 = "Service for this project is restricted due to the following violations: exceed_cached_egress_quota. The project owner must upgrade their plan";

test("cloud failures are told apart: the provider refusing vs the network vs anything else", () => {
  assert.equal(cloudFailureKind({ message: SUPABASE_402 }), "restricted");
  assert.equal(cloudFailureKind(new Error("store_http_402")), "restricted");
  assert.equal(cloudFailureKind(new TypeError("Failed to fetch")), "unreachable");
  assert.equal(cloudFailureKind(Object.assign(new Error("kv_read_timeout"), { name: "TimeoutError" })), "unreachable");
  assert.equal(cloudFailureKind({ message: "permission denied for table kv", code: "42501" }), "", "an access rule is not an outage");
});

test("the breaker opens once per outage, survives a reload in the same tab and closes by itself", () => {
  let t = 1_000;
  const saved = new Map();
  const store = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) };
  const b = createBreaker({ now: () => t, store });
  assert.equal(b.isOpen(), false);
  assert.equal(b.trip("restricted", SUPABASE_402), true, "first trip: log once");
  assert.equal(b.trip("restricted"), false, "later trips: no new log line");
  assert.equal(b.status().state, "restricted");
  assert.equal(createBreaker({ now: () => t, store }).isOpen(), true, "a reload in the same tab remembers");
  t += RESTRICTED_TTL_MS + 1;
  assert.equal(b.isOpen(), false, "it tries the cloud again after the TTL");
  assert.equal(createBreaker({ now: () => t, store }).isOpen(), false, "an expired record is ignored");
});

test("concurrent reads of one key share one request; a stalled read times out", async () => {
  const inflight = new Map();
  let calls = 0;
  const slow = () => new Promise((res) => setTimeout(() => res(++calls), 20));
  const [a, b] = await Promise.all([dedupe(inflight, "k", slow), dedupe(inflight, "k", slow)]);
  assert.deepEqual([a, b, calls], [1, 1, 1]);
  assert.equal(await dedupe(inflight, "k", slow), 2, "a settled request is not reused");
  await assert.rejects(withTimeout(new Promise(() => {}), 20, "kv_read"), (e) => e.name === "TimeoutError" && e.message === "kv_read_timeout");
  assert.equal(await withTimeout(Promise.resolve("ok"), 1000), "ok");
});

test("storage: no request while the cloud is known down, writes fail honestly, reads are bounded", () => {
  const s = read("src/lib/storage.js");
  assert.match(s, /if \(breaker\.isOpen\(\)\) return snapshotFallback\(key\);/);
  assert.match(s, /return dedupe\(inflight, key,/);
  assert.match(s, /withTimeout\(supabase\.from\("kv"\)[^;]*READ_TIMEOUT_MS/);
  assert.match(s, /if \(breaker\.status\(\)\.state === "restricted"\) throw new Error\("cloud_restricted"\);/, "never a false success");
  assert.equal(toHebrewError(new Error("cloud_restricted")), CLOUD_PAUSED_HE, "the visitor reads why, in Hebrew");
  assert.equal(toHebrewError(new Error("store_http_402")), CLOUD_PAUSED_HE, "a save the cloud refused says so, never 'something went wrong'");
  assert.equal(isCloudUnavailable(new Error("store_http_402")), true);
  assert.equal(isCloudUnavailable(new Error("store_http_4021x")), false);
});

test("a shopper's visit skips the Studio-only reads; the Studio and the admin still get them", () => {
  assert.equal(studioDataWanted("/"), false);
  assert.equal(studioDataWanted("/p/p-live-05"), false);
  assert.equal(studioDataWanted("/studio"), true);
  assert.equal(studioDataWanted("/admin/payouts"), true);
  assert.equal(studioDataWanted("/", true), true, "a device with a studio session");
  assert.equal(studioDataWanted("/", false, true), true, "an unlocked admin");
  const ctx = read("src/context/MarketplaceContext.jsx");
  assert.match(ctx, /wantStudio \? getJSON\(K\.payouts, true, \[\]\) : \[\]/);
  assert.match(ctx, /if \(sessionMarketerId\) loadStudioData\(\);/, "a login brings them in");
  assert.match(ctx, /withTimeout\(resolveCurrentMarketer\(safeMarketers\), 12_000, "identity"\)/, "the session lookup cannot keep the site loading forever");
  assert.match(read("src/components/admin/AdminView.jsx"), /loadStudioData\?\.\(\)/);
});

test("every build says which commit it is", () => {
  assert.deepEqual({ ...versionInfo({ NETLIFY: "true", COMMIT_REF: "53E10A7AB", HEAD: "claude/x" }, new Date(0)), builtAt: "" }, { commit: "53e10a7ab", branch: "claude/x", host: "netlify", builtAt: "" });
  assert.equal(versionInfo({ GITHUB_ACTIONS: "true", GITHUB_SHA: "abc1234def" }).host, "github-actions");
  assert.equal(versionInfo({ COMMIT_REF: "not a sha; rm -rf" }).commit, "");
  assert.match(JSON.parse(read("package.json")).scripts.postbuild, /node scripts\/write-version\.mjs/);
});

test("doctor: a 402 is the provider's limit, not a code defect; other answers are classified too", () => {
  const limit = classifyCloud(402, JSON.stringify({ message: SUPABASE_402 }), "database");
  assert.equal(limit.kind, KIND.PROVIDER_LIMIT);
  assert.match(limit.detail, /exceed_cached_egress_quota/);
  assert.equal(classifyCloud(200).kind, KIND.OK);
  assert.equal(classifyCloud(401).kind, KIND.OK, "RLS refusing anon is the security model working");
  assert.equal(classifyCloud(503).kind, KIND.PROVIDER_LIMIT);
  assert.equal(classifyCloud(404).kind, KIND.APP_DEFECT);
});

test("doctor: the real catalog copy has its own store link per product and no unverified price", () => {
  const doc = JSON.parse(read("public/snapshot/kv.json"));
  const res = checkSnapshot(doc, Date.parse(doc.takenAt) + 2 * 86_400_000);
  const by = (name) => res.find((x) => x.name === name);
  assert.equal(by("catalog copy fresh").kind, KIND.OK);
  assert.equal(by("every product has its own store link").kind, KIND.OK);
  assert.equal(res.some((x) => x.kind === KIND.APP_DEFECT), false);
  assert.equal(by("store prices").kind, KIND.MISSING_CREDENTIAL, "no API price yet: the owner's credential, not a defect");
  assert.match(by("store prices").action, /ALIEXPRESS_APP_KEY/);
  const bad = checkSnapshot({ takenAt: new Date(0).toISOString(), keys: { "marketplace:products": [
    { id: "a", affiliateUrl: "https://s.click.aliexpress.com/e/_x", price: 99 },
    { id: "b", affiliateUrl: "https://s.click.aliexpress.com/e/_x" },
    { id: "c", affiliateUrl: "https://example.com/x" },
  ] } }, Date.now());
  assert.equal(bad.find((x) => x.name === "catalog copy fresh").kind, KIND.EXTERNAL_ACTION);
  assert.match(bad.find((x) => x.name === "every product has its own store link").detail, /not a store link: c .*shared: b/);
  assert.equal(bad.find((x) => x.name === "no unverified price is shown as a price").kind, KIND.APP_DEFECT);
  assert.equal(checkFeedDoc({ reels: [{ id: "seller-p-live-02", productId: "p-live-02", look: "seller" }] })[0].kind, KIND.APP_DEFECT);
});

test("doctor: live revision vs main", () => {
  assert.equal(compareRevision("", "abc").kind, KIND.NOT_TESTED);
  assert.equal(compareRevision("abc1234", "abc1234").kind, KIND.OK);
  assert.equal(compareRevision("abc1234", "def5678", true).kind, KIND.OK, "a preview built from the same tree");
  const behind = compareRevision("abc1234", "def5678", false);
  assert.equal(behind.kind, KIND.EXTERNAL_ACTION);
  assert.match(behind.action, /serve-current-build/);
});

test("doctor: one pass over a site whose cloud is restricted finds no code defect; a broken reel is one", async () => {
  const doc = JSON.parse(read("public/snapshot/kv.json"));
  const feed = { reels: [{ id: "seller-p-live-05", productId: "p-live-05", look: "seller", video: "seller-p-live-05.mp4", poster: "seller-p-live-05-cover.jpg" }] };
  const asked = [];
  const site = (broken) => async (url, init) => {
    asked.push([url, init?.headers?.Range || ""]);
    const u = new URL(url);
    const reply = (status, type, body) => ({ status, headers: { get: () => type }, text: async () => (typeof body === "string" ? body : JSON.stringify(body)), json: async () => body });
    if (u.hostname === "db.example") return reply(402, "application/json", { message: SUPABASE_402 });
    if (u.pathname === "/api/autopilot") return reply(402, "application/json", { message: SUPABASE_402 });
    if (u.pathname === "/version.json") return reply(200, "application/json", { commit: "abc1234" });
    if (u.pathname === "/snapshot/kv.json") return reply(200, "application/json", doc);
    if (u.pathname === "/media/reels/index.json") return reply(200, "application/json", feed);
    if (u.pathname.endsWith(".mp4")) return broken ? reply(404, "text/html", "") : reply(206, "video/mp4", "");
    if (u.pathname.endsWith(".jpg")) return reply(206, "image/jpeg", "");
    return reply(200, "text/html", '<div id="root"></div>');
  };
  const git = (args) => (args[0] === "rev-parse" ? "abc1234" : null);
  const ok = await runDoctor({ origin: "https://site.example", supabaseUrl: "https://db.example", anonKey: "anon", fetchImpl: site(false), git, now: Date.parse(doc.takenAt) });
  assert.deepEqual(ok.filter((x) => x.kind === KIND.APP_DEFECT), []);
  assert.equal(ok.filter((x) => x.kind === KIND.PROVIDER_LIMIT).length, 3, "database, sign-in and the site API");
  assert.match(ok.find((x) => x.name === "sign-up / login (auth)").detail, /Studio sign-up and login cannot work/);
  assert.equal(ok.filter((x) => x.area === "routes" && x.kind === KIND.OK).length, ROUTES.length);
  assert.ok(asked.filter(([u]) => /\.(mp4|jpg)$/.test(u)).every(([, range]) => range === "bytes=0-1023"), "media: first KB only");
  assert.ok(!JSON.stringify(ok).includes("anon\""), "no key value in the report");
  // A host with no API answers /api with its SPA page: that is not the API working.
  const spa = async (url, init) => (new URL(url).pathname === "/api/autopilot" ? { status: 200, headers: { get: () => "text/html" }, text: async () => "<html>", json: async () => null } : site(false)(url, init));
  const noApi = await runDoctor({ origin: "https://site.example", fetchImpl: spa, git, now: Date.parse(doc.takenAt) });
  assert.equal(noApi.find((x) => x.name === "site API (/api)").kind, KIND.NOT_TESTED);
  const broken = await runDoctor({ origin: "https://site.example", fetchImpl: site(true), git: null, now: Date.parse(doc.takenAt) });
  assert.equal(broken.find((x) => x.name === "every reel and cover plays").kind, KIND.APP_DEFECT);
  assert.equal(broken.find((x) => x.name === "live revision").kind, KIND.NOT_TESTED, "no checkout: main unknown");
});
