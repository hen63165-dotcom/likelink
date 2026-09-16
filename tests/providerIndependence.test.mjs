import test from "node:test";
import assert from "node:assert/strict";
import { createIntelligenceCore } from "../api/_utils/intelligenceCore.mjs";
import { createIntelligenceHandler } from "../api/_utils/intelligenceHandler.mjs";
import { createProviderRegistry, openAIProvider, classifyFailure } from "../api/_utils/intelligenceProvider.mjs";

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

test("registry routes only compatible capabilities and ranks actual providers by cost", () => {
  const a = provider("a"); const b = { ...provider("b"), estimatedCost: 0.002 };
  const r = createProviderRegistry([a, b]);
  assert.equal(r.resolveCapability("text", { execution: true, maxCost: 0.01 }).provider, "b");
  assert.equal(r.resolveCapability("video").status, "CAPABILITY_UNAVAILABLE");
  assert.equal(r.resolveCapability("text", { maxCost: 0 }).usable.length, 0);
  assert.equal(r.health()[0].lastChecked, null);
  assert.equal(r.health()[0].authorized, false);
});

test("handler blocked -> resume preserves original task, IDs, tenant and execution budget", async () => {
  let calls = 0;
  const p = provider("p", async ({ context }) => { calls++; assert.equal(context.content.text, task.content.text); return { text: context.content.text }; });
  p.configured = false;
  const h = harness([p]);
  const blocked = (await h.call({ action: "run", task })).body;
  assert.equal(blocked.job.status, "blocked"); assert.equal(calls, 0);
  assert.equal((await h.call({ action: "resume", jobId: blocked.job.jobId }, "other")).statusCode, 400);
  p.configured = true;
  const attempts = await Promise.all([h.call({ action: "resume", jobId: blocked.job.jobId }), h.call({ action: "resume", jobId: blocked.job.jobId })]);
  const done = attempts.find(r => r.body.ok)?.body;
  assert.ok(done); assert.equal(done.job.jobId, blocked.job.jobId); assert.equal(done.job.workflowId, blocked.job.workflowId);
  assert.equal(calls, 1); assert.equal((await h.store.read("creator")).executionQuota.attempts, 1);
  assert.equal((await h.store.read("creator")).pending[blocked.job.jobId], undefined);
  assert.equal(JSON.stringify(h.events).includes(task.content.text), false);
  assert.equal((await h.call({ action: "resume", jobId: blocked.job.jobId })).statusCode, 400);
});

for (const [status, expected] of [[401, "NOT_AUTHORIZED"], [403, "NOT_AUTHORIZED"], [429, "RATE_LIMITED"], [503, "TEMPORARILY_UNAVAILABLE"]]) {
  test(`real AI adapter classifies HTTP ${status} without exposing provider body`, async () => {
    const p = openAIProvider({ env: { OPENAI_API_KEY: "sentinel-secret" }, fetchFn: async () => ({ ok: false, status, text: async () => "sentinel-secret" }) });
    await assert.rejects(p.execute({ task, context: {} }), e => classifyFailure(e) === expected && !e.message.includes("sentinel-secret"));
  });
}
test("AI missing credential executes no request and platform status degrades", async () => {
  const p = openAIProvider({ env: {}, fetchFn: () => { throw Error("MUST_NOT_FETCH"); } });
  await assert.rejects(p.execute({ task, context: {} }), /BLOCKED_BY_CREDENTIAL/);
  const h = harness([p]);
  assert.equal(h.core.coreStatus().status, "CORE_DEGRADED");
  assert.equal((await h.call({ action: "run", task })).body.job.errorCode, "BLOCKED_BY_CREDENTIAL");
});

test("unauthorized provider blocks without retry; real compatible fallback succeeds", async () => {
  let calls = 0;
  const fail = provider("fail", async () => { calls++; throw Object.assign(Error("NOT_AUTHORIZED"), { httpStatus: 401 }); });
  const h = harness([fail]);
  const r = await h.core.run("creator", task);
  assert.equal(r.job.status, "blocked"); assert.equal(calls, 1);
  const fallback = harness([provider("bad", fail.execute), provider("good")]);
  assert.equal((await fallback.core.run("creator", task)).ok, true);
  assert.ok(fallback.events.some(e => e.status === "fallback"));
});
