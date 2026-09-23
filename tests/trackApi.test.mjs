// Regression: the tracking beacons the feed fires must target the EXISTING
// serverless mode router (/api/store?mode=record-click) — never a new function.
// The Vercel Hobby plan allows a maximum of 12 Serverless Functions per
// deployment; adding a 13th file under /api made the production build fail
// with status "Error". These tests fail the build if a 13th function appears
// or if the client stops sending the documented event types.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const TRACK_TYPES = ["product_view", "outbound_click", "lead_capture"];

function listApiFunctions(dir = path.join(ROOT, "api")) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "_utils") continue; // shared helpers, not a function
      out.push(...listApiFunctions(full));
    } else if (/\.(mjs|js)$/.test(entry)) {
      out.push(path.relative(ROOT, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

test("the deployment stays within the 12-function serverless limit", () => {
  const fns = listApiFunctions();
  assert.ok(
    fns.length <= 12,
    `Vercel Hobby allows at most 12 Serverless Functions; found ${fns.length}: ${fns.join(", ")}`
  );
  assert.ok(
    !fns.includes("api/track.mjs"),
    "api/track.mjs must not exist — tracking lives in the existing api/store mode router"
  );
});

test("api/store implements the tracking event types without counting views as clicks", () => {
  const store = read("api/store.mjs");
  assert.ok(store.includes('"record-click"'), "store must serve mode=record-click");
  for (const t of TRACK_TYPES) {
    assert.ok(store.includes(t), `store tracking must support event type ${t}`);
  }
  assert.ok(
    /const isClick = type !== "product_view"/.test(store),
    "views must be excluded from the click counter"
  );
  assert.ok(
    store.includes("marketplace:events"),
    "views/leads must be stored in the lightweight events log"
  );
});

test("client beacons post to the store mode router with a valid event type", () => {
  const helpers = read("src/utils/helpers.js");
  assert.ok(helpers.includes("/api/store?mode=record-click"), "beacons must target the store mode router");
  for (const t of ["product_view", "outbound_click"]) {
    assert.ok(helpers.includes(`type: "${t}"`), `helpers must send event type ${t}`);
  }
});

