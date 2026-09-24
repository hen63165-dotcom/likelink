import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SITE_EVENT_TYPES, buildSiteEventPayload, groupByCategory, publicUrl, withAttribution } from "../src/lib/acquisition.js";
import { parsePath } from "../src/utils/routing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

test("acquisition event payloads contain truthful attribution and reject unknown events", () => {
  assert.equal(buildSiteEventPayload("share_started", { page: "/p/p1", target: "whatsapp" }).target, "whatsapp");
  assert.equal(buildSiteEventPayload("not_a_real_event", { page: "/p/p1" }), null);
  assert.ok(SITE_EVENT_TYPES.includes("merchant_landing_view"));
  assert.ok(SITE_EVENT_TYPES.includes("merchant_cta_click"));
  assert.equal(publicUrl("/p/p1"), "https://likelink2.vercel.app/p/p1");
  assert.match(withAttribution(publicUrl("/p/p1"), { utm_source: "share", ref: "m1" }), /utm_source=share/);
});

test("discovery groups only real products and never invents categories", () => {
  const groups = groupByCategory([{ id: "p1", category: "Beauty", clicks: 2 }, { id: "p2", category: "Beauty" }, { id: "p3" }]);
  assert.equal(groups.find((g) => g.category === "Beauty").count, 2);
  assert.equal(groups.find((g) => g.category === "Other").count, 1);
});

test("public acquisition routes are represented in the SPA router", () => {
  const app = read("src/App.jsx");
  assert.ok(app.includes('route.type === "landing" ? "home"'), "the root must use the root canonical, not /feed");
  assert.deepEqual(parsePath("/creators"), { type: "creators", category: null });
  assert.deepEqual(parsePath("/creators/Beauty"), { type: "creators", category: "Beauty" });
  assert.deepEqual(parsePath("/merchants"), { type: "merchants", category: null });
  assert.deepEqual(parsePath("/discover/Tech"), { type: "discover", category: "Tech" });
});

test("site events use the existing router and do not add a serverless function", () => {
  const store = read("api/store.mjs");
  assert.ok(store.includes("bodyRc?.siteEvent === true"));
  assert.ok(store.includes('"merchant_landing_view"'));
  assert.ok(store.includes('"share_target"'));
  const count = readdirSync(path.join(ROOT, "api"), { withFileTypes: true }).filter((e) => !e.isDirectory() && /\.(mjs|js)$/.test(e.name)).length;
  assert.ok(count <= 12);
});
