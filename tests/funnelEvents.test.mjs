// First-party funnel events: append-only, known types only, attribution fields
// only, never from automated browsers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyStoreWritePolicy } from "../api/_utils/storeWritePolicy.mjs";

const now = Date.now();
const ctx = { now, actorEmail: "", ownedMarketerIds: new Set() };

test("an anonymous visitor can append a known funnel step; extra fields are dropped", () => {
  const stored = JSON.stringify([{ id: "a", type: "studio_cta", ts: now - 1000 }]);
  const next = JSON.stringify([{ id: "b", type: "studio_cta", ts: now, place: "/", src: "instagram", email: "x@y.z", amount: 999 }]);
  const r = applyStoreWritePolicy("marketplace:funnel", stored, next, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.value.length, 2);
  assert.deepEqual(r.value[1], { id: "b", type: "studio_cta", ts: now, place: "/", src: "instagram" });
});

test("unknown types, stale timestamps and history rewrites are refused", () => {
  const stored = JSON.stringify([{ id: "a", type: "studio_cta", ts: now - 1000 }]);
  const r = applyStoreWritePolicy("marketplace:funnel", stored, JSON.stringify([
    { id: "c", type: "purchase", ts: now },
    { id: "d", type: "signup_completed", ts: now - 3 * 86400000 },
  ]), ctx);
  assert.equal(r.value.length, 1, "nothing appended");
  const wipe = applyStoreWritePolicy("marketplace:funnel", stored, JSON.stringify([]), ctx);
  assert.equal(wipe.value.length, 1, "an empty write never erases history");
});

test("the client skips automated browsers and Studio links are instrumented", () => {
  const f = readFileSync("src/lib/funnel.js", "utf8");
  assert.match(f, /navigator\.webdriver === true/);
  const kit = readFileSync("src/components/discover/kit.jsx", "utf8");
  assert.match(kit, /trackFunnel\("studio_cta"/);
  const sell = readFileSync("src/components/sell/SellView.jsx", "utf8");
  assert.match(sell, /trackFunnel\(result\?\.needsConfirmation \? "signup_confirm_sent"/);
});
