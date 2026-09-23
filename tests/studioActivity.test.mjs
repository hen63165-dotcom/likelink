// Studio activity feed: local per-device log of REAL user actions +
// merge with marketplace records. No fabrication — every entry comes
// from an action the code path actually performed.
import test from "node:test";
import assert from "node:assert/strict";

import {
  recordActivity,
  getActivity,
  clearActivity,
  buildActivityFeed,
} from "../src/lib/studioActivity.js";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function withWindowStorage(storage, fn) {
  const prev = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  }
}

test("recordActivity appends real actions and getActivity returns newest-first", () => {
  withWindowStorage(fakeStorage(), () => {
    clearActivity();
    assert.deepEqual(getActivity(), []);
    recordActivity("luna.ask", "ביקשת רעיון מלונה");
    recordActivity("product.view", "צפית במוצר X");
    const feed = getActivity(10);
    assert.equal(feed.length, 2);
    assert.equal(feed[0].type, "product.view");
    assert.equal(feed[1].type, "luna.ask");
    assert.ok(feed[0].ts >= feed[1].ts);
  });
});

test("recordActivity caps the log and ignores missing type", () => {
  withWindowStorage(fakeStorage(), () => {
    clearActivity();
    assert.equal(recordActivity("", "nope"), null);
    for (let i = 0; i < 70; i++) recordActivity("click", `click ${i}`);
    const feed = getActivity(100);
    assert.ok(feed.length <= 60);
    assert.equal(feed[0].label, "click 69");
  });
});

test("buildActivityFeed merges local actions with marketplace records newest-first", () => {
  const feed = buildActivityFeed({
    activity: [{ id: "a1", type: "luna.ask", label: "Luna ask", ts: 300 }],
    clicks: [{ id: "c1", label: "click on Y", ts: 200 }],
    sales: [{ id: "s1", label: "sale!", ts: 400 }],
    notifications: [{ id: "n1", title: "price drop", ts: 100 }],
    limit: 10,
  });
  assert.deepEqual(feed.map((e) => e.id), ["s1", "a1", "c1", "n1"]);
});

test("buildActivityFeed tolerates missing/empty inputs", () => {
  assert.deepEqual(buildActivityFeed(), []);
  assert.deepEqual(buildActivityFeed({ limit: 5 }), []);
});
