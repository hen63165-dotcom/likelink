// Catalog snapshot: when the cloud does not answer, the storefront shows the
// copy shipped in public/snapshot/kv.json instead of an empty site.
// These tests pin what that copy may contain and how it may be used:
//   • only public storefront keys, no personal data (no e-mail / payout fields),
//   • only products the public site would list (approved, own affiliate link),
//   • it is read-only — a key answered from the copy is never written back,
//   • media served by our own cloud is dropped (it is down in the same outage),
//   • the page can say when the copy was taken.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SNAPSHOT_KEYS,
  isCloudMediaUrl,
  resetSnapshotForTests,
  servedFromSnapshot,
  snapshotGet,
  snapshotTakenAt,
  withoutCloudMedia,
} from "../src/lib/catalogSnapshot.js";

const doc = JSON.parse(readFileSync(new URL("../public/snapshot/kv.json", import.meta.url), "utf8"));
const fakeFetch = async () => ({ ok: true, json: async () => doc });

test("snapshot file: public storefront keys only, dated", () => {
  assert.ok(!Number.isNaN(Date.parse(doc.takenAt)), "takenAt must be a date");
  for (const key of Object.keys(doc.keys)) assert.ok(SNAPSHOT_KEYS.includes(key), `${key} is not a public storefront key`);
  assert.ok(Array.isArray(doc.keys["marketplace:products"]) && doc.keys["marketplace:products"].length > 0);
});

test("snapshot file: no personal or payout data", () => {
  const text = JSON.stringify(doc.keys);
  assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "no e-mail addresses");
  for (const m of doc.keys["marketplace:marketers"] || []) {
    for (const f of ["email", "bankDetails", "paypalEmail", "iban", "phone", "payoutEmail", "address"]) {
      assert.equal(m[f], undefined, `creator field ${f} must not be in the public copy`);
    }
  }
});

test("snapshot file: only products the public site lists (approved, own affiliate link)", () => {
  const products = doc.keys["marketplace:products"];
  const links = products.map((p) => String(p.affiliateUrl || ""));
  for (const p of products) {
    assert.equal(p.status, "approved", `${p.id} is not approved`);
    assert.match(String(p.affiliateUrl || ""), /^https:\/\//, `${p.id} has no affiliate link`);
    assert.equal(links.filter((l) => l === p.affiliateUrl).length, 1, `${p.id} shares its link`);
  }
});

test("snapshotGet: only storefront keys, marks them served, reports the copy's time", async () => {
  resetSnapshotForTests();
  assert.equal(snapshotTakenAt(), null, "live until a key is served from the copy");
  assert.equal(await snapshotGet("marketplace:settings", { fetchImpl: fakeFetch }), null);
  assert.equal(await snapshotGet("marketplace:payouts", { fetchImpl: fakeFetch }), null);
  const products = await snapshotGet("marketplace:products", { fetchImpl: fakeFetch });
  assert.equal(products.length, doc.keys["marketplace:products"].length);
  assert.ok(servedFromSnapshot("marketplace:products"));
  assert.ok(!servedFromSnapshot("marketplace:marketers"));
  assert.equal(snapshotTakenAt(), doc.takenAt);
});

test("snapshotGet: a missing or broken snapshot is null, never a crash", async () => {
  resetSnapshotForTests();
  assert.equal(await snapshotGet("marketplace:products", { fetchImpl: async () => ({ ok: false }) }), null);
  resetSnapshotForTests();
  assert.equal(await snapshotGet("marketplace:products", { fetchImpl: async () => { throw new Error("offline"); } }), null);
  resetSnapshotForTests();
  assert.equal(await snapshotGet("marketplace:products", { fetchImpl: async () => ({ ok: true, json: async () => ({ nope: 1 }) }) }), null);
  assert.equal(snapshotTakenAt(), null);
});

test("cloud media is dropped from the copy; store media stays", () => {
  assert.ok(isCloudMediaUrl("https://likelink2.vercel.app/api/og?mode=media&path=ugc/p/x.mp4"));
  assert.ok(isCloudMediaUrl("https://x.supabase.co/storage/v1/object/public/a.mp4"));
  assert.ok(!isCloudMediaUrl("https://ae01.alicdn.com/kf/a.jpg"));
  const [p] = withoutCloudMedia("marketplace:products", [
    { id: "a", image: "https://ae01.alicdn.com/kf/a.jpg", videoUrl: "https://likelink2.vercel.app/api/og?mode=media&path=reels/m/1.mp4", videoPoster: null },
  ]);
  assert.equal(p.image, "https://ae01.alicdn.com/kf/a.jpg");
  assert.equal(p.videoUrl, null);
  const videos = withoutCloudMedia("marketplace:videos", [
    { id: "v1", videoUrl: "https://likelink2.vercel.app/api/og?mode=media&path=ugc/p/x.mp4" },
    { id: "v2", videoUrl: "https://cdn.example.org/v2.mp4" },
  ]);
  assert.deepEqual(videos.map((v) => v.id), ["v2"]);
});

test("storage: a key answered from the copy is never written back", async () => {
  resetSnapshotForTests();
  const { storage } = await import("../src/lib/storage.js");
  await snapshotGet("marketplace:clicks", { fetchImpl: fakeFetch });
  await assert.rejects(() => storage.set("marketplace:clicks", "[]", true), /snapshot_read_only/);
});

test("storage: the live read path falls back to the copy only after a failure", () => {
  const src = readFileSync(new URL("../src/lib/storage.js", import.meta.url), "utf8");
  const get = src.slice(src.indexOf("async get("), src.indexOf("async set("));
  // The live answer is returned as-is; the copy appears only in the failure paths.
  assert.match(get, /return data \? \{ key, value: data\.value, shared: true \} : null;/);
  assert.match(get, /catch \(e\) \{[\s\S]*snapshotFallback\(key\)/);
});
