// The Creative Orchestrator (src/lib/creative/orchestrator.js) and the
// paid-generation lock (src/lib/creative/costGuard.js): a stage is COMPLETED
// only with a real, validated output; every blocker is named; paid methods
// never run; the lock lives on the server and only the exact word opens it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AVAILABILITY, METHODS, STAGES, STATUS, methodAvailability, orchestrate, routeScenes } from "../src/lib/creative/orchestrator.js";
import { PAID_FEATURES, paidGate, paidGenerationEnabled } from "../src/lib/creative/costGuard.js";
import { emptyLedger, markLive, markRendered, markStored, planProduct, reconcile, updateJob } from "../src/lib/creative/engine.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const snap = JSON.parse(read("public/snapshot/kv.json")).keys;
const products = snap["marketplace:products"];
const byId = (id) => products.find((p) => p.id === id);
const CLIPS = new Set(["p-live-04", "p-live-05"]);
const statuses = (r) => Object.fromEntries(r.stages.map((s) => [s.id, s.status]));

function ledgerAt(id, status, { qcPass = true, bytes = 5_902_580 } = {}) {
  const plan = planProduct(byId(id), { products, sellerVideos: CLIPS });
  let ledger = reconcile(emptyLedger(), [plan], { now: 1 }).ledger;
  const jobId = `cj_${plan.key}`;
  if (status === "QUEUED") return ledger;
  ledger = updateJob(ledger, jobId, (j) => markRendered(j, { file: `${id}-lookbook.mp4`, bytes, seconds: 13.15, sha256: "a".repeat(64) }, { pass: qcPass, checks: [{ name: "motion", pass: qcPass }] }, 2));
  if (status === "RENDERED") return ledger;
  ledger = updateJob(ledger, jobId, (j) => markStored(j, { tag: "reels", name: `${id}-lookbook.mp4`, bytes }, 3));
  if (status === "STORED") return ledger;
  return updateJob(ledger, jobId, (j) => markLive(j, { live: true, feedId: `lookbook-${id}`, bytes, checkedAt: 4 }, 4));
}
const feedWith = (id) => ({ reels: [{ id: `lookbook-${id}`, productId: id, video: `lookbook-${id}.mp4`, look: "lookbook", labels: ["#פרסומת · קישור שותפים", "תמונות וסרטון: המוכר"] }] });

test("the six stages, in order, for every product", () => {
  assert.deepEqual(STAGES, ["ProductFacts", "ContentStrategy", "CreativeGeneration", "QualityControl", "ProductPublishing", "PerformanceFeedback"]);
  for (const p of products) assert.deepEqual(orchestrate(p, { products }).stages.map((s) => s.id), STAGES);
});

test("a stage is COMPLETED only with a real output: no ledger → generation PENDING, nothing after it", () => {
  const r = orchestrate(byId("p-live-04"), { products, sellerVideos: CLIPS, ledger: null });
  assert.deepEqual(statuses(r), { ProductFacts: "COMPLETED", ContentStrategy: "COMPLETED", CreativeGeneration: "PENDING", QualityControl: "SKIPPED", ProductPublishing: "SKIPPED", PerformanceFeedback: "SKIPPED" });
  assert.equal(r.stages[2].blocker.code, "ledger_unreadable");
  assert.equal(orchestrate(byId("p-live-04"), { products, sellerVideos: CLIPS, ledger: ledgerAt("p-live-04", "QUEUED") }).stages[2].blocker.code, "awaiting_engine_run");
});

test("the full chain from a LIVE job with its byte proof; performance stays INSUFFICIENT_DATA without real events", () => {
  const ledger = ledgerAt("p-live-04", "LIVE");
  const r = orchestrate(byId("p-live-04"), { products, sellerVideos: CLIPS, ledger, feed: feedWith("p-live-04"), events: [] });
  assert.deepEqual(statuses(r), { ProductFacts: "COMPLETED", ContentStrategy: "COMPLETED", CreativeGeneration: "COMPLETED", QualityControl: "COMPLETED", ProductPublishing: "COMPLETED", PerformanceFeedback: "INSUFFICIENT_DATA" });
  assert.equal(r.completed, 5);
  // A test click (e2e_check) never counts; real attributed events do.
  const events = [{ productId: "p-live-04", camp: "v-lookbook-p-live-04", src: "e2e_check" }, { productId: "p-live-04", camp: "v-lookbook-p-live-04", src: "likelink_creator" }, { productId: "p-live-04", camp: "other" }];
  const perf = orchestrate(byId("p-live-04"), { products, sellerVideos: CLIPS, ledger, feed: feedWith("p-live-04"), events }).stages[5];
  assert.equal(perf.status, "INSUFFICIENT_DATA");
  assert.equal(perf.output.clicks, 1);
  assert.equal(perf.blocker.code, "below_min_evidence");
});

test("publishing: STORED waits for the deploy; LIVE but gone from the feed is FAILED, not completed", () => {
  assert.equal(orchestrate(byId("p-live-04"), { products, sellerVideos: CLIPS, ledger: ledgerAt("p-live-04", "STORED"), feed: { reels: [] } }).stages[4].status, "PENDING");
  const gone = orchestrate(byId("p-live-04"), { products, sellerVideos: CLIPS, ledger: ledgerAt("p-live-04", "LIVE"), feed: { reels: [] } }).stages[4];
  assert.equal(gone.status, "FAILED");
  assert.ok(gone.validation.checks.some((c) => c.name === "still_in_site_feed" && !c.pass));
});

test("a failed QC is FAILED, and nothing downstream is reported done", () => {
  const r = orchestrate(byId("p-live-04"), { products, sellerVideos: CLIPS, ledger: ledgerAt("p-live-04", "RENDERED", { qcPass: false }), feed: feedWith("p-live-04") });
  assert.equal(r.stages[3].status, "FAILED");
  assert.deepEqual([r.stages[4].status, r.stages[5].status], ["SKIPPED", "SKIPPED"]);
});

test("blocked with the exact reason and a truthful fallback: p-live-03 has no worn photo checked", () => {
  const r = orchestrate(byId("p-live-03"), { products, sellerVideos: CLIPS });
  assert.equal(r.stages[1].status, "BLOCKED");
  assert.equal(r.stages[1].blocker.code, "no_worn_photo_checked");
  assert.deepEqual(r.stages[1].fallback, { template: "luna_tip", executor: "luna_reels", character: "luna" });
  const bad = orchestrate({ ...byId("p-live-04"), status: "pending" }, { products });
  assert.equal(bad.stages[0].status, "BLOCKED");
});

test("methods: free ones available or delegated with their executor; product-in-hand never pretended; paid ones locked", () => {
  const a = methodAvailability(byId("p-live-04"), { env: {} });
  const st = Object.fromEntries(a.map((m) => [m.id, m.state]));
  assert.equal(st.photo_motion, AVAILABILITY.AVAILABLE);
  assert.equal(st.seller_footage_cut, AVAILABILITY.AVAILABLE);
  assert.equal(st.luna_presenter, AVAILABILITY.DELEGATED);
  assert.equal(st.product_in_hand_ai, AVAILABILITY.UNAVAILABLE);
  for (const m of a.filter((x) => x.paid)) assert.equal(m.state, AVAILABILITY.PAID_LOCKED);
  assert.equal(a.find((m) => m.id === "heygen_avatar").blocker.code, "paid_generation_disabled");
  assert.equal(methodAvailability(byId("p-live-04"), { env: { PAID_GENERATION: "enabled" } }).find((m) => m.id === "heygen_avatar").blocker.code, "no_adapter", "even unlocked: no adapter, never a fake run");
  assert.equal(Object.fromEntries(methodAvailability(byId("p-live-02")).map((m) => [m.id, m.state])).seller_footage_cut, AVAILABILITY.UNAVAILABLE, "p-live-02's clip shows another item");
  assert.ok(METHODS.every((m) => m.paid || typeof m.check === "function"));
});

test("scene routing never picks an unavailable method and names every rejection", () => {
  const scenes = routeScenes(methodAvailability(byId("p-live-04")));
  const opening = scenes.find((s) => s.scene === "opening");
  assert.equal(opening.chosen, "photo_motion");
  assert.deepEqual(opening.rejected.map((r) => [r.id, r.reason]), [["product_in_hand_ai", "no_verified_free_model"], ["real_ugc", "needs_owner_footage"]]);
  assert.equal(scenes.find((s) => s.scene === "closeup").chosen, "seller_footage_cut");
  assert.equal(routeScenes(methodAvailability(byId("p-live-01"))).find((s) => s.scene === "closeup").chosen, "photo_motion", "no checked clip → the photos");
});

test("the paid lock: only the server's exact PAID_GENERATION=enabled opens it; every paid entry point asks it first", () => {
  for (const v of [undefined, "", "true", "1", "yes", "ENABLED "]) {
    assert.equal(paidGenerationEnabled({ PAID_GENERATION: v }), v === "ENABLED ", String(v));
  }
  assert.deepEqual(paidGate("ugc-model", {}), { allowed: false, status: 403, error: "paid_generation_disabled", feature: "ugc-model", mode: "ZERO_PAID_CREDITS", message: paidGate("ugc-model", {}).message });
  assert.equal(paidGate("made-up", { PAID_GENERATION: "enabled" }).error, "unknown_paid_feature");
  assert.deepEqual(Object.keys(PAID_FEATURES).sort(), ["intelligence:openai", "ugc-model", "viral-reel"]);
  const store = read("api/store.mjs");
  const ugc = store.slice(store.indexOf('get("mode") === "ugc-model"'));
  assert.ok(ugc.indexOf('paidGate("ugc-model", process.env)') > 0 && ugc.indexOf('paidGate("ugc-model", process.env)') < ugc.indexOf("verifyToken"), "the lock comes before auth and any provider call");
  assert.match(read("api/_utils/intelligenceProvider.mjs"), /paidGate\("intelligence:openai", env\)\.allowed/);
  const wf = read(".github/workflows/viral-reel.yml");
  assert.ok(wf.indexOf("Paid generation lock") < wf.indexOf("viral_reel.py"), "the paid workflow stops before the paid script");
  assert.match(wf, /PAID_GENERATION: \$\{\{ vars\.PAID_GENERATION \}\}/, "the switch is a repository setting, never a run input");
  assert.doesNotMatch(read("src/lib/creative/costGuard.js"), /import\.meta\.env|VITE_/, "no browser env can open it");
});
