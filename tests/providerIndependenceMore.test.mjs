import test from "node:test";
import assert from "node:assert/strict";
import { createIntelligenceCore } from "../api/_utils/intelligenceCore.mjs";
import { createIntelligenceHandler } from "../api/_utils/intelligenceHandler.mjs";
const task = { operation: "luna.suggest", modality: "text", content: { kind: "text", text: "Original 49 https://example.com/item #brand" } };
function harness(providers) {
  const rows = new Map(); let clock = 1000000;
  const store = {
    async read(owner) { return structuredClone(rows.get(owner) || { version: 0, memory: {}, jobs: [], quota: {} }); },
    async write(owner, version, state) {
      if ((rows.get(owner)?.version || 0) !== version) throw new Error("VERSION_CONFLICT");
      rows.set(owner, structuredClone(state)); return structuredClone(state);
    },
  };
  const events = [];
  const core = createIntelligenceCore({ store, providers, emit: e => events.push(e), now: () => clock, wait: async ms => { clock += ms; } });
  const handler = createIntelligenceHandler({ core, store, verify: async id => ({ id }) });
  async function call(body, owner = "creator") {
    const res = { setHeader() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; } };
    await handler({ method: "POST", headers: { authorization: `Bearer ${owner}` }, body }, res);
    return res;
  }
  return { core, store, events, call, advance: () => { clock += 300000; } };
}
const provider = (id, behavior) => ({ id, modalities: ["text"], configured: true, estimatedCost: 0.01,
  execute: behavior || (async ({ context }) => ({ text: context.content.text })) });


test("timeout queues bounded retry, recovers original job and never loops forever", async () => {
  let fail = true; let calls = 0;
  const p = provider("p", async ({ context }) => { calls++; if (fail) throw Object.assign(Error("TIMEOUT"), { name: "TimeoutError" }); return { text: context.content.text }; });
  const h = harness([p]);
  const r = await h.core.run("creator", task);
  assert.equal(r.job.status, "retrying"); assert.equal(calls, 2);
  await assert.rejects(h.core.resume("creator", r.job.jobId), /JOB_NOT_RESUMABLE/);
  fail = false; h.advance();
  const done = await h.core.resume("creator", r.job.jobId);
  assert.equal(done.job.jobId, r.job.jobId); assert.equal(done.job.status, "completed");
  assert.equal(calls, 3);
  const broken = harness([provider("timeout", async () => { throw Error("TIMEOUT"); })]);
  const queued = await broken.core.run("creator", task); broken.advance();
  const exhausted = await broken.core.resume("creator", queued.job.jobId);
  assert.equal(exhausted.job.status, "failed"); assert.equal(exhausted.job.attempt, 4);
  await assert.rejects(broken.core.resume("creator", queued.job.jobId), /JOB_NOT_RESUMABLE/);
});

test("invalid output fails verification and arbitrary usage/payload never enters jobs", async () => {
  const h = harness([provider("invalid", async () => ({ text: 42, usage: { secret: "sentinel" } }))]);
  const r = await h.core.run("creator", task);
  assert.equal(r.job.status, "failed"); assert.equal(r.job.errorCode, "INVALID_OUTPUT");
  assert.equal(r.result, undefined);
  assert.equal(JSON.stringify(await h.store.read("creator")).includes("sentinel"), false);
});

test("execution quota blocks provider invocation", async () => {
  let calls = 0;
  const h = harness([provider("p", async () => { calls++; return { text: task.content.text }; })]);
  await h.store.write("creator", 0, { version: 1, memory: {}, jobs: [], quota: {}, executionQuota: { day: "1970-01-01", attempts: 40, estimatedCost: 0.4 } });
  const r = await h.call({ action: "run", task });
  assert.equal(r.statusCode, 429); assert.equal(calls, 0);
});

test("status firewall returns no raw credential or input; media/payment tasks never execute as text", async () => {
  const p = provider("p"); p.apiKey = "sentinel-secret";
  const h = harness([p]);
  const status = await h.call({ action: "status" });
  assert.equal(JSON.stringify(status.body).includes("sentinel-secret"), false);
  assert.equal((await h.call({ action: "run", task: { ...task, operation: "payment.capture" } })).statusCode, 400);
  const media = await h.call({ action: "run", task: { ...task, modality: "video" } });
  assert.equal(media.body.job.errorCode, "CAPABILITY_UNAVAILABLE");
});

test("existing store entry point remains Node safe and requires auth before storage", async () => {
  const { default: handler } = await import("../api/store.mjs");
  const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(b) { this.body = b; } };
  await handler({ method: "POST", url: "/api/store?mode=intelligence", headers: {}, body: { action: "status" } }, res);
  assert.equal(res.code, 401); assert.equal(res.body.error, "UNAUTHENTICATED");
});
