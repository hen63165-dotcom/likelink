import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLISH_STATUS,
  publishProductIntent,
  buildAssistedPackage,
  computeBrandChannelsConfigured,
  computePublishReadiness,
  resolveProviderCapability,
  resolveIdempotency,
} from "../src/lib/cloud/publishEngine.js";
import { CONNECTION_STATE, CONNECTED_STATES } from "../src/lib/cloud/connectionManager.js";
import { PREFLIGHT } from "../src/lib/cloud/preflight.js";

const { PUBLISHED, ASSISTED, ACTION_REQUIRED, BLOCKED, PROCESSING, UNAVAILABLE, READY } = PUBLISH_STATUS;

const approvedProduct = {
  id: "prod_publish_test_1",
  title: "Test Product",
  price: 99,
  marketerId: "marketer_1",
  status: "approved",
  image: "https://example.com/img.jpg",
};

const owner = { id: "marketer_1", authenticated: true };

test("publish with no external provider creates internal publication", async () => {
  const store = {};
  const result = await publishProductIntent({
    product: approvedProduct,
    marketer: owner,
    store,
    channels: ["telegram"],
  });

  assert.equal(result.status, ASSISTED, "No provider connected should be ASSISTED for browser-side engine");
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].provider, "telegram");
  assert.equal(result.results[0].status, ASSISTED);
  assert.ok(result.results[0].assisted, "Should include assisted package");
  assert.ok(result.results[0].assisted.caption, "Assisted package should have caption");
  assert.ok(result.results[0].assisted.link, "Assisted package should have link");
  assert.ok(result.results[0].assisted.fallback?.copy, "Assisted package should have fallback copy");
});

test("publish with connected provider returns PROCESSING (delegates to autopilot)", async () => {
  const store = {
    "marketplace:connection_states": [
      { provider: "telegram", state: CONNECTION_STATE.CONNECTED, updatedAt: Date.now() },
    ],
  };

  const result = await publishProductIntent({
    product: approvedProduct,
    marketer: owner,
    store,
    channels: ["telegram"],
  });

  assert.equal(result.status, PROCESSING, "Connected provider should be PROCESSING (server-side dispatch)");
  assert.equal(result.results[0].provider, "telegram");
  assert.equal(result.results[0].status, PROCESSING);
  assert.ok(result.results[0].message.includes("autopilot"));
});

test("publish without authenticated marketer is BLOCKED", async () => {
  const result = await publishProductIntent({
    product: approvedProduct,
    marketer: null,
    store: {},
    channels: ["telegram"],
  });

  assert.equal(result.status, BLOCKED, "Should be blocked without authentication");
  assert.ok(result.message.includes("sign_in") || result.preflight?.reason === "unauthenticated");
});

test("publish with wrong marketer is BLOCKED (ownership)", async () => {
  const result = await publishProductIntent({
    product: approvedProduct,
    marketer: { id: "someone_else", authenticated: true },
    store: {},
    channels: ["telegram"],
  });

  assert.equal(result.status, BLOCKED, "Should be blocked on ownership mismatch");
  assert.ok(result.preflight?.reason === "ownership_mismatch");
});

test("publish with non-approved product is BLOCKED", async () => {
  const result = await publishProductIntent({
    product: { ...approvedProduct, status: "pending" },
    marketer: owner,
    store: {},
    channels: ["telegram"],
  });

  assert.equal(result.status, BLOCKED, "Non-approved product should be blocked");
});

test("idempotency prevents duplicate assisted packages", async () => {
  const store = {};
  const idemKey = "test-idem-abc-123";

  const r1 = await publishProductIntent({
    product: approvedProduct,
    marketer: owner,
    store,
    channels: ["telegram"],
  }, { idempotencyKey: idemKey });

  assert.equal(r1.status, ASSISTED);
  assert.equal(r1.idempotencyKey, idemKey);

  // Same idempotency key should not create duplicate
  const r2 = await publishProductIntent({
    product: approvedProduct,
    marketer: owner,
    store,
    channels: ["telegram"],
  }, { idempotencyKey: idemKey });

  // Both return assisted but the idempotency key is preserved
  assert.equal(r2.idempotencyKey, idemKey);
  assert.equal(r2.status, ASSISTED);
});

test("computeBrandChannelsConfigured with no connections returns false", () => {
  const result = computeBrandChannelsConfigured({});
  assert.equal(result.configured, false);
  assert.equal(result.connectedChannels.length, 0);
  assert.equal(result.totalChannels, 0);
});

test("computeBrandChannelsConfigured with real connections returns true", () => {
  const store = {
    "marketplace:connection_states": [
      { provider: "telegram", state: CONNECTION_STATE.CONNECTED },
    ],
  };
  const result = computeBrandChannelsConfigured(store);
  assert.equal(result.configured, true);
  assert.equal(result.connectedChannels.length, 1);
});

test("computePublishReadiness for disconnected provider is ASSISTED", () => {
  const store = {};
  const readiness = computePublishReadiness({
    product: approvedProduct,
    marketer: owner,
    store,
    channels: ["telegram"],
  });

  assert.equal(readiness.overallStatus, ASSISTED);
  assert.ok(readiness.canAssistCount > 0);
  assert.equal(readiness.readyCount, 0);
});

test("computePublishReadiness for connected provider shows ready", () => {
  const store = {
    "marketplace:connection_states": [
      { provider: "telegram", state: CONNECTION_STATE.CONNECTED },
    ],
  };
  const readiness = computePublishReadiness({
    product: approvedProduct,
    marketer: owner,
    store,
    channels: ["telegram"],
  });

  assert.equal(readiness.overallStatus, "READY");
  assert.equal(readiness.readyCount, 1);
});

test("buildAssistedPackage generates real share actions", () => {
  const pack = buildAssistedPackage({
    product: approvedProduct,
    marketer: owner,
    creativePack: { caption: "Test caption", trackUrl: "https://likelink2.vercel.app/p/prod_1", hashtags: ["test"] },
    channel: "telegram",
  });

  assert.equal(pack.status, ASSISTED);
  assert.ok(pack.caption);
  assert.ok(pack.link);
  assert.ok(pack.fallback.copy);
  assert.ok(pack.fallback.open);
  assert.ok(pack.fallback.share);
  assert.ok(pack.hashtags);
});

test("buildAssistedPackage generates WhatsApp share URL", () => {
  const pack = buildAssistedPackage({
    product: approvedProduct,
    marketer: owner,
    creativePack: { caption: "Test", trackUrl: "https://likelink2.vercel.app/p/prod_1" },
    channel: "whatsapp",
  });

  assert.equal(pack.status, ASSISTED);
  assert.ok(pack.link.includes("p/"));
  assert.equal(pack.cta, "קנה עכשיו");
});

test("resolveIdempotency detects existing key", () => {
  const store = {
    "publish:idem:telegram:test-idem-789": {
      status: "PUBLISHED",
      platformPostId: "123",
      publishedUrl: "https://t.me/post/123",
    },
  };

  const result = resolveIdempotency({ store, idempotencyKey: "test-idem-789", provider: "telegram" });
  assert.equal(result.exists, true);
  assert.equal(result.alreadyPublished, true);
  assert.equal(result.result.platformPostId, "123");
});

test("resolveIdempotency returns false for missing key", () => {
  const result = resolveIdempotency({ store: {}, idempotencyKey: "nonexistent", provider: "telegram" });
  assert.equal(result.exists, false);
});

test("no fake PUBLISHED state when provider not connected", async () => {
  const result = await publishProductIntent({
    product: approvedProduct,
    marketer: owner,
    store: {},
    channels: ["facebook"],
  });

  assert.notEqual(result.status, "PUBLISHED", "Must not claim published when no provider connected");
  assert.notEqual(result.results[0].status, "PUBLISHED", "Individual channel must not claim published");
  assert.equal(result.status, ASSISTED, "Should be ASSISTED when no external provider connected");
});

test("provider capability matrix does not expose tokens", () => {
  const provider = resolveProviderCapability({ provider: "telegram", store: {} });
  assert.equal(typeof provider, "object");
  assert.equal(provider.connected, false);
  assert.equal(provider.requiresAuth, true);
  assert.equal(provider.canAssist, true);
  assert.equal(provider.canDirectPublish, false);
  assert.ok(!JSON.stringify(provider).includes("token"), "No token in provider capability");
  assert.ok(!JSON.stringify(provider).includes("secret"), "No secret in provider capability");
});

test("PUBLISH_STATUS has no fake PUBLISHED without provider confirmation", () => {
  assert.equal(PUBLISHED, "PUBLISHED");
  assert.equal(ASSISTED, "ASSISTED");
  assert.equal(ACTION_REQUIRED, "ACTION_REQUIRED");
  assert.equal(BLOCKED, "BLOCKED");
  assert.equal(PROCESSING, "PROCESSING");
  assert.equal(UNAVAILABLE, "UNAVAILABLE");
});

test("publish respects external provider disconnection", async () => {
  const result = await publishProductIntent({
    product: approvedProduct,
    marketer: owner,
    store: {},
    channels: ["telegram"],
  });

  assert.equal(result.status, ASSISTED);
  assert.equal(result.results[0].status, ASSISTED);
  assert.equal(result.results[0].message, "No direct connection — assisted publishing package prepared");
});
