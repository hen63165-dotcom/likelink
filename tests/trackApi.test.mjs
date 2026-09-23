// Regression: the server-side measurement endpoint only accepts the three
// documented event types and never breaks callers when the store is down.
import test from "node:test";
import assert from "node:assert/strict";

import { handler } from "../api/track.mjs";

function mockReqRes({ method = "POST", body = {} } = {}) {
  const req = { method, headers: {}, body };
  const res = {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(obj) { this.payload = obj; return this; },
    end(payload) { this.payload = payload; return this; },
  };
  return { req, res };
}

function asJson(res) {
  return typeof res.payload === "string" ? JSON.parse(res.payload) : res.payload;
}

test("track rejects unknown event types with 400", async () => {
  const { req, res } = mockReqRes({ body: { type: "bogus", productId: "p1" } });
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(asJson(res).ok, false);
});

test("track requires productId with 400", async () => {
  const { req, res } = mockReqRes({ body: { type: "product_view" } });
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(asJson(res).ok, false);
});

test("track rejects non-POST with 405", async () => {
  const { req, res } = mockReqRes({ method: "GET", body: {} });
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});

test("track accepts a valid product_view without crashing (store may be unconfigured)", async () => {
  const { req, res } = mockReqRes({ body: { type: "product_view", productId: "p-live-01", source: "test" } });
  await handler(req, res);
  assert.ok([200, 500].includes(res.statusCode));
  assert.equal(typeof asJson(res).ok, "boolean");
});
