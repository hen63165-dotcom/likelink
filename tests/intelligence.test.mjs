import test from "node:test";
import assert from "node:assert/strict";
import { createIntelligenceCore } from "../api/_utils/intelligenceCore.mjs";
import { createIntelligenceHandler } from "../api/_utils/intelligenceHandler.mjs";
import { creatorContext, contentContext, validateTask } from "../api/_utils/intelligenceContext.mjs";

// In-memory intelligenceStore — same contract as the Supabase RPC store.
function mockStore() {
  const data = new Map();
  let conflicts = 0;
  return {
    async read(owner) { return data.get(owner) ?? { version: 0, memory: {}, jobs: [], quota: {} }; },
    async write(owner, expected, state) {
      if (conflicts-- > 0) throw new Error("VERSION_CONFLICT");
      const current = data.get(owner);
      if (current && current.version !== expected) throw new Error("VERSION_CONFLICT");
      data.set(owner, state);
      return state;
    },
  };
}
function fakeProvider(id, modalities, behavior) {
  let calls = 0;
  return {
    id, model: `${id}-model`, modalities, configured: true,
    calls: () => calls,
    async execute() { calls++; return behavior(...arguments); },
  };
}
function makeRes() {
  return { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; }, json(b) { this.body = b; return this; } };
}
function makeReq(body, token = "good-session", extra = {}) {
  return { method: "POST", url: "/api/store?mode=intelligence",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body };
}
function harness({ providers, verify = async (t) => (t === "good-session" ? { id: "creator-1" } : null), store = mockStore() } = {}) {
  const events = [];
  const core = createIntelligenceCore({ store, providers,
    emit: (e) => events.push(e), wait: async () => {}, now: (() => { let n = 0; return () => (n += 11000); })() });
  return { handler: createIntelligenceHandler({ verify, store, core }), events, store };
}
const RUN = { action: "run", task: { operation: "luna.suggest", modality: "text", content: { kind: "text", text: "טיוטה 👉 https://x.ly/p1 #קניות 49.90" } } };
test("text task runs through the orchestrator, persists a completed job, and returns the result", async () => {
  const provider = fakeProvider("openai", ["text"], async () => ({ text: "נהדר! 👉 https://x.ly/p1 #קניות 49.90", usage: { inputTokens: 5, outputTokens: 7 } }));
  const { handler, events } = harness({ providers: [provider] });
  const res = makeRes();
  await handler(makeReq(RUN), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.match(res.body.result.text, /נהדר/);
  assert.equal(provider.calls(), 1);
  const inspect = makeRes();
  await handler(makeReq({ action: "inspect" }), inspect);
  const job = inspect.body.jobs[0];
  assert.equal(job.status, "completed");
  assert.equal(job.provider, "openai");
  assert.ok(job.latency >= 0 && job.requestId && job.jobId);
  assert.deepEqual(events.map((e) => e.status), ["queued", "running", "verifying", "completed"]);
  assert.equal(events[0].provider, null);
});


test("unauthenticated request is rejected before any provider or storage access", async () => {
  const provider = fakeProvider("p", ["text"], async () => ({ text: "x" }));
  const { handler } = harness({ providers: [provider] });
  const res = makeRes();
  await handler(makeReq(RUN, "bad-token"), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "UNAUTHENTICATED");
  assert.equal(provider.calls(), 0);
});
test("media and unlinked-URL content is blocked as CAPABILITY_UNAVAILABLE without calling the provider", async () => {
  const provider = fakeProvider("openai", ["text"], async () => ({ text: "nope" }));
  const { handler } = harness({ providers: [provider] });
  for (const content of [{ kind: "video", text: "" }, { kind: "url", text: "", url: "https://example.com/item" }]) {
    const res = makeRes();
    await handler(makeReq({ action: "run", task: { operation: "content.analyze", modality: "vision", content } }), res);
    assert.equal(res.body.job.status, "blocked");
    assert.equal(res.body.job.errorCode, "CAPABILITY_UNAVAILABLE");
    assert.equal(res.body.ok, false);
  }
  assert.equal(provider.calls(), 0);
});

test("missing provider credential is reported as BLOCKED_BY_CREDENTIAL, not as a fake result", async () => {
  const provider = { id: "openai", model: "m", modalities: ["text"], configured: false, execute: async () => ({ text: "x" }) };
  const { handler } = harness({ providers: [provider] });
  const res = makeRes();
  await handler(makeReq(RUN), res);
  assert.equal(res.body.job.status, "blocked");
  assert.equal(res.body.job.errorCode, "BLOCKED_BY_CREDENTIAL");
});

test("provider failure falls back to the next provider and completes", async () => {
  const failing = fakeProvider("a", ["text"], async () => { const e = new Error("PROVIDER_FAILED"); e.retryable = true; throw e; });
  const working = fakeProvider("b", ["text"], async () => ({ text: "תוצאה סופית 👉 https://x.ly/p1 #קניות 49.90" }));
  const { handler, events } = harness({ providers: [failing, working] });
  const res = makeRes();
  await handler(makeReq(RUN), res);
  assert.equal(res.body.ok, true);
  assert.equal(failing.calls(), 1);
  assert.equal(working.calls(), 1);
  assert.equal(res.body.job.attempt, 2);
  assert.equal(res.body.job.provider, "b");
  assert.ok(events.some((e) => e.status === "retrying"));
});

test("output that drops a protected link, hashtag or price is rejected as INVALID_OUTPUT", async () => {
  const provider = fakeProvider("openai", ["text"], async () => ({ text: "טקסט חדש בלי הקישור" }));
  const { handler } = harness({ providers: [provider] });
  const res = makeRes();
  await handler(makeReq(RUN), res);
  assert.equal(res.body.job.status, "failed");
  assert.equal(res.body.job.errorCode, "INVALID_OUTPUT");
  assert.equal(res.body.result, undefined);
});

test("creator memory persists with optimistic concurrency; stale version gets VERSION_CONFLICT", async () => {
  const { handler } = harness({ providers: [] });
  let res = makeRes();
  await handler(makeReq({ action: "memory", version: 0, memory: { brand: "עדינה", tone: "חם", languages: ["he"], successfulPatterns: ["hook קצר"] } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.version, 1);
  res = makeRes();
  await handler(makeReq({ action: "memory", version: 0, memory: { brand: "x" } }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "VERSION_CONFLICT");
  res = makeRes();
  await handler(makeReq({ action: "memory", version: 1, memory: { brand: "עדינה", tone: "חם" } }), res);
  assert.equal(res.body.version, 2);
  res = makeRes();
  await handler(makeReq({ action: "inspect" }), res);
  assert.equal(res.body.memory.brand, "עדינה");
  assert.equal(res.body.memory.source, "creator_supplied");
});

test("client-supplied owner identity is never trusted", async () => {
  const { handler } = harness({ providers: [] });
  const res = makeRes();
  await handler(makeReq({ action: "run", owner: "someone-else", task: RUN.task }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "INVALID_REQUEST");
});

test("quota blocks the 21st same-day run and no provider is called beyond the cap", async () => {
  const provider = fakeProvider("openai", ["text"], async () => ({ text: "תשובה קצרה" }));
  const { handler } = harness({ providers: [provider] });
  let last;
  for (let i = 0; i < 21; i++) {
    const res = makeRes();
    await handler(makeReq(RUN), res);
    last = res;
  }
  assert.equal(last.statusCode, 429);
  assert.equal(last.body.error, "RATE_LIMITED");
});

test("context validation rejects oversized text, unsafe URLs and unknown modalities", () => {
  assert.throws(() => contentContext({ kind: "text", text: "x".repeat(4001) }), /INVALID_CONTENT/);
  assert.throws(() => contentContext({ kind: "url", text: "x", url: "http://insecure.example.com" }), /INVALID_CONTENT/);
  assert.throws(() => contentContext({ kind: "url", text: "x", url: "https://user:pass@example.com" }), /INVALID_CONTENT/);
  assert.throws(() => validateTask({ operation: "luna.suggest", modality: "hologram", content: { kind: "text", text: "x" } }), /INVALID_TASK/);
  assert.throws(() => creatorContext({ brand: "x".repeat(301) }), /INVALID_CONTEXT/);
  assert.doesNotThrow(() => validateTask({ operation: "content.translate", modality: "translation", content: { kind: "text", text: "שלום" } }));
});

