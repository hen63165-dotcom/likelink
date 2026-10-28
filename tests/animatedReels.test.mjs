// Animated character reels from the Studio (src/lib/growth/animatedReels.js).
// The owner, 2026-10-28: "build it into the site", a reel at
// @ravitrecommends' level from a button, made in the cloud. These tests pin
// the queue (oldest request first, a new press is a new reel, bounded
// retries), what reaches GitHub Pages (no links), the Studio's honest lines,
// and the wiring (the request is an owner-writable product field; the hourly
// run records every outcome; the site serves media/studio3d).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANIMATED_KINDS, ANIMATED_STATUS as S, MAX_ATTEMPTS, PRESENTERS, RETRY_AFTER_MS,
  animatedByProduct, animatedKind, animatedPublicIndex, animatedQueue, animatedState, makeRequest, recordAnimated, requestOf,
} from "../src/lib/growth/animatedReels.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const T0 = Date.parse("2026-10-28T10:00:00Z");
const product = (id, over = {}) => ({
  id, marketerId: "m1", status: "approved", title: "עגילי חישוק כסופים", image: `https://ae01.alicdn.com/kf/${id}.jpg`,
  affiliateUrl: `https://s.click.aliexpress.com/e/_${id}`, ...over,
});

test("the cast on the site is the cast the studio draws", () => {
  const cast = JSON.parse(read("scripts/media/ai-image/cast.json")).characters.map((c) => ({ id: c.id, he: c.name }));
  assert.deepEqual([...PRESENTERS].map((p) => ({ ...p })).sort((a, b) => a.id.localeCompare(b.id)), cast.sort((a, b) => a.id.localeCompare(b.id)));
});

test("the kinds with a story are autoplan's, in its order", () => {
  const py = read("scripts/media/studio3d/autoplan.py");
  for (const [kind, re] of ANIMATED_KINDS) {
    const m = py.match(new RegExp(`"${kind}": \\{\\s*"words": r"([^"]+)"`));
    assert.ok(m, kind);
    assert.equal(re.source, m[1], kind);
  }
  assert.match(py, /for kind in \("earrings", "bracelet", "ring", "necklace"\)/);
  assert.deepEqual(ANIMATED_KINDS.map(([k]) => k), ["earrings", "bracelet", "ring", "necklace"]);
  assert.equal(animatedKind({ title: "שרשרת יד עם תליונים" }), "bracelet");
  assert.equal(animatedKind({ title: "כרית לכלב" }), null);
});

test("a request names a presenter from the cast and a time; anything else is no request", () => {
  const r = makeRequest("noa", T0);
  assert.deepEqual(requestOf({ reelRequest: r }), { presenter: "noa", at: "2026-10-28T10:00:00.000Z" });
  assert.throws(() => makeRequest("ravit"));
  for (const bad of [null, {}, { kind: "x", presenter: "noa", at: r.at }, { kind: "studio3d", presenter: "x", at: r.at }, { kind: "studio3d", presenter: "noa", at: "soon" }]) {
    assert.equal(requestOf({ reelRequest: bad }), null);
  }
});

test("the queue: the oldest open request, of an approved promotable product of a kind with a story", () => {
  const products = [
    product("a", { reelRequest: makeRequest("shira", T0 + 2000) }),
    product("b", { reelRequest: makeRequest("noa", T0 + 1000) }),
    product("c", { reelRequest: makeRequest("maya", T0), status: "draft" }),
    product("d", { reelRequest: makeRequest("tal", T0), title: "כרית לכלב" }),
    product("e", { reelRequest: makeRequest("yael", T0), affiliateUrl: "https://s.click.aliexpress.com/e/_shared" }),
    product("f", { affiliateUrl: "https://s.click.aliexpress.com/e/_shared" }),
    product("g"),
  ];
  const [job] = animatedQueue(products, { now: T0 + 5000 });
  assert.deepEqual(job, { productId: "b", marketerId: "m1", presenter: "noa", requestAt: new Date(T0 + 1000).toISOString(), kind: "earrings" });
  assert.equal(animatedQueue(products, { now: T0 + 5000, limit: 9 }).length, 2, "drafts, unsupported kinds and shared links wait");
});

test("an answered request is done; pressing again is a new reel; a failure retries a bounded number of times", () => {
  const p = product("a", { reelRequest: makeRequest("shira", T0) });
  const job = animatedQueue([p], { now: T0 })[0];
  const ready = recordAnimated({}, job, { status: S.READY, video: "studio-a-shira.mp4" }, T0 + 1);
  assert.equal(animatedQueue([p], { state: ready, now: T0 + 2 }).length, 0);
  const again = { ...p, reelRequest: makeRequest("noa", T0 + 10) };
  assert.equal(animatedQueue([again], { state: ready, now: T0 + 20 }).length, 1, "a new press makes a new reel");

  let state = recordAnimated({}, job, { status: S.FAILED, reason: "reel failure" }, T0);
  assert.equal(animatedQueue([p], { state, now: T0 + 60_000 }).length, 0, "a failure waits");
  assert.equal(animatedQueue([p], { state, now: T0 + RETRY_AFTER_MS }).length, 1);
  for (let i = 1; i < MAX_ATTEMPTS; i++) state = recordAnimated(state, job, { status: S.FAILED }, T0);
  assert.equal(state.reels.a.attempts, MAX_ATTEMPTS);
  assert.equal(animatedQueue([p], { state, now: T0 + 10 * RETRY_AFTER_MS }).length, 0, "and stops");
});

test("GitHub Pages gets status, file names and the caption — never a link — and 'ready' needs a file", () => {
  const p = product("a", { reelRequest: makeRequest("shira", T0) });
  const job = animatedQueue([p], { now: T0 })[0];
  const state = recordAnimated({}, job, { status: S.READY, video: "studio-a-shira.mp4", poster: "studio-a-shira-preview.jpg", caption: "#פרסומת · קישור שותפים\nעגילים", seconds: 24.36 }, T0);
  const index = animatedPublicIndex(state);
  assert.doesNotMatch(JSON.stringify(index), /aliexpress|s\.click/);
  const map = animatedByProduct(index, "https://x.test/likelink/media/studio3d/index.json");
  assert.equal(map.get("a").video, "https://x.test/likelink/media/studio3d/studio-a-shira.mp4");
  assert.equal(map.get("a").seconds, 24.4);
  const forged = animatedByProduct({ reels: [{ productId: "a", status: "READY", video: "../../evil.mp4" }] });
  assert.equal(forged.get("a").status, S.FAILED);
  assert.equal(forged.get("a").video, undefined);
});

test("the Studio's line says only what is true", () => {
  const p = product("a", { reelRequest: makeRequest("shira", T0) });
  assert.equal(animatedState(product("x"), null).state, "none");
  assert.equal(animatedState(product("x", { title: "כרית לכלב" }), null).state, "unsupported");
  assert.equal(animatedState(p, null).state, "queued");
  const ready = { status: S.READY, video: "https://x/v.mp4", presenter: "shira", requestAt: new Date(T0).toISOString() };
  assert.equal(animatedState(p, ready).state, "ready");
  assert.match(animatedState(p, ready).he, /שירה/);
  assert.equal(animatedState({ ...p, reelRequest: makeRequest("noa", T0 + 1) }, ready).state, "queued", "a newer press is in the making");
  assert.equal(animatedState(p, { status: S.FAILED, attempts: 1, requestAt: ready.requestAt }).state, "retry");
  assert.equal(animatedState(p, { status: S.FAILED, attempts: MAX_ATTEMPTS, requestAt: ready.requestAt }).state, "failed");
});

test("wiring: an owner-writable request, the hourly queue, every outcome recorded, the site serves it", () => {
  const share = read("src/components/studio/ShareCenter.jsx");
  assert.match(share, /reelRequest = makeRequest\(presenter\)/);
  assert.match(share, /p\.marketerId === marketer\?\.id \? \{ \.\.\.p, reelRequest \}/, "only her own product");
  const policy = read("api/_utils/storeWritePolicy.mjs");
  assert.doesNotMatch(policy.match(/PROTECTED_PRODUCT_FIELDS = \[[\s\S]*?\];/)[0], /reelRequest/, "the owner may write it");
  const wf = read(".github/workflows/studio3d.yml");
  assert.match(wf, /schedule:\s*\n\s*- cron:/);
  assert.match(wf, /queue\.mjs next/);
  assert.match(wf, /queue\.mjs record READY/);
  assert.match(wf, /queue\.mjs record FAILED/);
  assert.match(wf, /Commit the pictures and clips for review\n\s*if: github\.ref_name != 'main'/, "a Studio run never commits pictures to main");
  assert.match(read(".github/workflows/deploy-frontend.yml"), /queue\.mjs feed dist/);
  assert.match(read("public/_redirects"), /^\/media\/studio3d\/\*\s+https:\/\/hen63165-dotcom\.github\.io\/likelink\/media\/studio3d\/:splat\s+200$/m);
});
