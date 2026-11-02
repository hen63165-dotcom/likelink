import test from "node:test";
import assert from "node:assert/strict";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalSessionStorage = globalThis.sessionStorage;
const storage = new Map();
globalThis.sessionStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); },
};
globalThis.document = { referrer: "" };

const { landingAttribution } = await import("../src/lib/attribution.js");

test("landingAttribution keeps creator referral separate from traffic source", () => {
  storage.clear();
  globalThis.window = { location: { search: "?ref=creator-slug&utm_source=instagram" } };
  const first = landingAttribution();
  assert.equal(first.src, "instagram");
  assert.equal(first.referralCreatorId, "creator-slug");

  globalThis.window = { location: { search: "?utm_campaign=spring" } };
  const later = landingAttribution();
  assert.equal(later.camp, "spring");
  assert.equal(later.referralCreatorId, "creator-slug");
});

test("landingAttribution accepts affiliate_id and clips it", () => {
  storage.clear();
  globalThis.window = { location: { search: `?affiliate_id=${"a".repeat(150)}` } };
  assert.equal(landingAttribution().referralCreatorId.length, 120);
});

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage = originalSessionStorage;
});
