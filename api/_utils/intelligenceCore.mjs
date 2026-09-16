import { randomUUID } from "node:crypto";
import { openAIProvider, paypalPaymentsProvider,
  createProviderRegistry, classifyFailure } from "./intelligenceProvider.mjs";
import { intelligenceStore, changeState } from "./intelligenceStore.mjs";
import { creatorContext, validateTask } from "./intelligenceContext.mjs";

export const JOB_STATES = Object.freeze(["queued", "running", "retrying", "fallback", "verifying", "completed", "failed", "blocked"]);
const knownErrors = new Set(["BLOCKED_BY_CREDENTIAL", "PROVIDER_FAILED", "INVALID_OUTPUT", "TIMEOUT", "CAPABILITY_UNAVAILABLE", "RATE_LIMITED", "NOT_AUTHORIZED"]);
const safeError = e => knownErrors.has(e?.code || e?.message) ? (e.code || e.message) : "PROVIDER_FAILED";

// operation → capability. A capability is never faked by another one: a text
// model can never satisfy a video requirement (no cross-capability fallback).
export const OPERATION_CAPABILITY = Object.freeze({
  "luna.suggest": "text", "autopilot.polish": "text",
  "content.analyze": "text", "content.translate": "translation",
  "payment.create": "payments", "payment.capture": "payments", "payment.refund": "payments",
});

// Fixed server policy. No caller-selected URL, model, provider, retries or cost.
export function createIntelligenceCore({ store = intelligenceStore(),
  providers = [openAIProvider(), paypalPaymentsProvider()],
  emit = event => console.info(JSON.stringify({ event: "cloud.job", ...event })),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now,
} = {}) {
  const registry = createProviderRegistry(providers, { now });
  const resolveCapability = registry.resolveCapability;
  async function run(owner, input, resumeId = null) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(owner || "")) throw new Error("OWNERSHIP_REQUIRED");
    const capability = OPERATION_CAPABILITY[String(input?.operation)];
    if (!capability) throw new Error("INVALID_TASK");
    const task = validateTask(input);
    const start = now();
    let job = { jobId: randomUUID(), requestId: randomUUID(), type: task.operation,
      operation: task.operation, capability, owner, status: "queued", createdAt: new Date(start).toISOString(),
      updatedAt: new Date(start).toISOString(), attempt: 0, errorCode: null,
      latency: 0, provider: null, model: null, version: 1,
      startedAt: null, completedAt: null, expiresAt: start + 86400000, nextAttemptAt: null };
    job.workflowId = job.jobId;
    let state = await changeState(store, owner, s => {
      s.pending ||= {};
      // Expired private payloads are erased on every mutation; metadata remains.
      for (const j of s.jobs || []) if (j.expiresAt <= start) delete s.pending[j.jobId];
      if (resumeId) {
        const old = s.jobs.find(j => j.jobId === resumeId && j.owner === owner);
        if (!old || !["blocked", "retrying"].includes(old.status) || old.expiresAt <= start ||
          old.attempt >= 4 || !s.pending[resumeId] || old.nextAttemptAt > start) throw new Error("JOB_NOT_RESUMABLE");
        job = { ...old, status: "queued", version: old.version + 1, updatedAt: new Date(start).toISOString() };
        s.jobs = s.jobs.map(j => j.jobId === resumeId ? job : j);
        return s;
      }
      const day = new Date(start).toISOString().slice(0, 10);
      const quota = s.quota?.day === day ? s.quota : { day, reservedAttempts: 0, lastAt: 0 };
      if (quota.reservedAttempts >= 40 || start - quota.lastAt < 10000) throw new Error("RATE_LIMITED");
      s.quota = { ...quota, day, reservedAttempts: quota.reservedAttempts + 2, lastAt: start };
      // Never evict unfinished work. Terminal metadata is bounded separately.
      const active = (s.jobs || []).filter(j => !["completed", "failed"].includes(j.status) && j.expiresAt > start);
      if (active.length >= 10) throw new Error("RATE_LIMITED");
      s.jobs = [job, ...active, ...(s.jobs || []).filter(j => !active.includes(j)).slice(0, 19)];
      s.pending[job.jobId] = { task, creator: creatorContext(s.memory) };
      if (Buffer.byteLength(JSON.stringify(s), "utf8") > 180000) throw new Error("RATE_LIMITED");
      return s;
    });
    // Observability: the queued event is emitted from the persisted initial state.
    emit({ requestId: job.requestId, jobId: job.jobId, workflowId: job.workflowId,
      owner, operation: job.operation, status: "queued", latency: 0, provider: null,
      model: null, attempt: 0, errorCode: null, timestamp: job.updatedAt });
    async function transition(status, patch = {}) {
      Object.assign(job, patch, { status, updatedAt: new Date(now()).toISOString(), latency: now() - start });
      state = await changeState(store, owner, s => {
        const previous = s.jobs.find(j => j.jobId === job.jobId);
        if (!previous || previous.version !== job.version) throw new Error("VERSION_CONFLICT");
        s.jobs = s.jobs.map(j => j.jobId === job.jobId ? { ...job, version: job.version + 1 } : j);
        if (["completed", "failed"].includes(status)) delete s.pending?.[job.jobId];
        return s;
      });
      job = state.jobs.find(j => j.jobId === job.jobId);
      // Whitelist only operational metadata: never prompts, results, preferences or provider errors.
      emit({ requestId: job.requestId, jobId: job.jobId, workflowId: job.workflowId,
        owner, operation: job.operation, status, latency: job.latency, provider: job.provider,
        model: job.model, attempt: job.attempt, errorCode: job.errorCode, timestamp: job.updatedAt });
    }
    const media = ["image", "video", "audio", "url"].includes(task.content.kind);
    const plan = resolveCapability(task.modality, { execution: true });
    if (media || !plan.usable.length || task.modality !== capability) {
      const code = plan.status === "NOT_CONFIGURED" ? "BLOCKED_BY_CREDENTIAL"
        : plan.status === "NOT_AUTHORIZED" ? "NOT_AUTHORIZED"
        : plan.retryable ? plan.status : "CAPABILITY_UNAVAILABLE";
      await transition("blocked", { errorCode: media ? "CAPABILITY_UNAVAILABLE" : code });
      return { ok: false, job };
    }
    const context = { creator: state.pending[job.jobId].creator, content: task.content };
    const available = plan.usable.map(id => registry.providersFor(capability).find(p => p.id === id));
    let providerIndex = 0;
    for (let localAttempt = 1; localAttempt <= 2 && job.attempt < 4; localAttempt++) {
      const provider = available[providerIndex];
      // Reserve each actual execution atomically, also across resume/cold starts.
      await changeState(store, owner, s => {
        const day = new Date(now()).toISOString().slice(0, 10);
        const q = s.executionQuota?.day === day ? s.executionQuota : { day, attempts: 0, estimatedCost: 0 };
        const cost = provider.estimatedCost ?? 0.01;
        if (cost > 0.02 || q.attempts >= 40 || q.estimatedCost + cost > 0.40) throw new Error("RATE_LIMITED");
        s.executionQuota = { day, attempts: q.attempts + 1, estimatedCost: q.estimatedCost + cost };
        return s;
      });
      await transition(localAttempt === 1 ? "running" : "retrying", {
        attempt: job.attempt + 1, provider: provider.id, model: provider.model || null,
        startedAt: job.startedAt || new Date(now()).toISOString(), errorCode: null,
      });
      const executionStart = now();
      let result, text, error;
      try {
        result = await provider.execute({ task: { operation: task.operation, modality: task.modality }, context });
        text = typeof result?.text === "string" ? result.text.trim() : "";
        const protectedTokens = task.content.text.match(/https?:\/\/[^\s]+|#[\p{L}\p{N}_]+|\d+(?:[.,]\d+)*/gu) || [];
        if (text.length < 2 || text.length > 6000 || protectedTokens.some(token => !text.includes(token))) throw new Error("INVALID_OUTPUT");
      } catch (e) { error = e; }
      registry.record(provider, error, now() - executionStart);
      await transition("verifying");
      if (!error) {
        const usage = { inputTokens: 0, outputTokens: 0 };
        for (const k of Object.keys(usage)) {
          const n = result.usage?.[k];
          usage[k] = Number.isSafeInteger(n) && n >= 0 ? n : 0;
        }
        await transition("completed", { usage, completedAt: new Date(now()).toISOString() });
        return { ok: true, job, result: { text } };
      }
      const status = classifyFailure(error);
      const code = status === "NOT_CONFIGURED" ? "BLOCKED_BY_CREDENTIAL"
        : status === "NOT_AUTHORIZED" ? "NOT_AUTHORIZED" : safeError(error);
      if (localAttempt < 2 && job.attempt < 4 && available[providerIndex + 1]) {
        providerIndex++;
        await transition("fallback", { errorCode: code });
        continue;
      }
      const retryable = ["TEMPORARILY_UNAVAILABLE", "RATE_LIMITED"].includes(status);
      if (retryable && localAttempt < 2 && job.attempt < 4) { await wait(500); continue; }
      await transition(retryable && job.attempt < 4 ? "retrying"
        : ["NOT_CONFIGURED", "NOT_AUTHORIZED"].includes(status) ? "blocked" : "failed", {
        errorCode: code, nextAttemptAt: retryable && job.attempt < 4 ? now() + 60000 * job.attempt : null,
      });
      return { ok: false, job };
    }
  }
  return {
    run, resolveCapability,
    health: () => registry.health(),
    coreStatus: () => {
      const health = registry.health();
      // This is provider readiness, not proof that every platform dependency is up.
      // Missing providers degrade only their capabilities; storage is checked by handler.
      return { status: health.length && health.every(h => h.healthy && h.configured) ? "CORE_READY" : "CORE_DEGRADED", health };
    },
    // Resume a blocked/retrying job with its ORIGINAL task — same jobId and
    // workflowId, no duplicate workflow. Payments can never auto-resume.
    async resume(owner, jobId) {
      const state = await store.read(owner);
      const job = (state.jobs || []).find(j => j.jobId === jobId);
      if (!job || job.owner !== owner || !["blocked", "retrying"].includes(job.status) || job.capability === "payments") {
        throw new Error("JOB_NOT_RESUMABLE");
      }
      return run(owner, state.pending?.[jobId]?.task, jobId);
    },
    // Cloud entry for background engines (Autopilot cron): resolves the studio's
    // verified cloud owner (profiles.marketer_id) and runs the same orchestrator.
    async runForMarketer(marketerId, input) {
      const owner = await store.ownerFor(String(marketerId || ""));
      return run(owner, input);
    },
  };
}
