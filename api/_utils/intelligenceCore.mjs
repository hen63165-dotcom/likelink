import { randomUUID } from "node:crypto";
import { openAIProvider } from "./intelligenceProvider.mjs";
import { intelligenceStore, changeState } from "./intelligenceStore.mjs";
import { creatorContext, validateTask } from "./intelligenceContext.mjs";

export const JOB_STATES = Object.freeze(["queued", "running", "completed", "failed", "retrying", "blocked"]);
const knownErrors = new Set(["BLOCKED_BY_CREDENTIAL", "PROVIDER_FAILED", "INVALID_OUTPUT", "TIMEOUT"]);
const safeError = e => knownErrors.has(e?.code || e?.message) ? (e.code || e.message) : "PROVIDER_FAILED";

// Fixed server policy. No caller-selected URL, model, provider, retries or token limit.
// Quota reserves the maximum two attempts, including failed calls, atomically.
export function createIntelligenceCore({ store = intelligenceStore(), providers = [openAIProvider()],
  emit = event => console.info(JSON.stringify({ event: "cloud.job", ...event })),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now,
} = {}) {
  async function run(owner, input) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(owner || "")) throw new Error("OWNERSHIP_REQUIRED");
    const task = validateTask(input);
    const start = now();
    const job = { jobId: randomUUID(), requestId: randomUUID(), type: task.operation,
      operation: task.operation, owner, status: "queued", createdAt: new Date(start).toISOString(),
      updatedAt: new Date(start).toISOString(), attempt: 0, errorCode: null,
      latency: 0, provider: null, model: null, version: 1 };
    job.workflowId = job.jobId;
    let state = await changeState(store, owner, s => {
      const day = new Date(start).toISOString().slice(0, 10);
      const quota = s.quota?.day === day ? s.quota : { day, reservedAttempts: 0, lastAt: 0 };
      if (quota.reservedAttempts >= 40 || start - quota.lastAt < 10000) throw new Error("RATE_LIMITED");
      s.quota = { day, reservedAttempts: quota.reservedAttempts + 2, lastAt: start };
      s.jobs = [job, ...(s.jobs || [])].slice(0, 30);
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
        job.version++;
        s.jobs = s.jobs.map(j => j.jobId === job.jobId ? { ...job } : j);
        return s;
      });
      // Whitelist only operational metadata: never prompts, results, preferences or provider errors.
      emit({ requestId: job.requestId, jobId: job.jobId, workflowId: job.workflowId,
        owner, operation: job.operation, status, latency: job.latency, provider: job.provider,
        model: job.model, attempt: job.attempt, errorCode: job.errorCode, timestamp: job.updatedAt });
    }
    const media = ["image", "video", "audio", "url"].includes(task.content.kind);
    const candidates = providers.filter(p => p.modalities.includes(task.modality));
    if (media || !candidates.length) {
      await transition("blocked", { errorCode: "CAPABILITY_UNAVAILABLE" });
      return { ok: false, job };
    }
    const available = candidates.filter(p => p.configured);
    if (!available.length) {
      await transition("blocked", { errorCode: "BLOCKED_BY_CREDENTIAL" });
      return { ok: false, job };
    }
    const context = { creator: creatorContext(state.memory), content: task.content };
    let providerIndex = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const provider = available[providerIndex];
      await transition(attempt === 1 ? "running" : "retrying", {
        attempt, provider: provider.id, model: provider.model || null, errorCode: null,
      });
      try {
        const result = await provider.execute({ task: { operation: task.operation, modality: task.modality }, context });
        const text = result?.text?.trim();
        const protectedTokens = task.content.text.match(/https?:\/\/[^\s]+|#[\p{L}\p{N}_]+|\d+(?:[.,]\d+)*/gu) || [];
        if (typeof text !== "string" || text.length < 2 || text.length > 6000 || protectedTokens.some(token => !text.includes(token))) throw new Error("INVALID_OUTPUT");
        await transition("completed", { usage: result.usage || null });
        // Result is returned to the requesting consumer, never persisted in audit/jobs.
        return { ok: true, job, result: { text }, content: { ...task.content, analysisStatus: "TEXT_PROCESSED" } };
      } catch (e) {
        const code = safeError(e);
        if (attempt < 2 && (e.retryable || available.length > providerIndex + 1)) {
          if (available.length > providerIndex + 1) providerIndex++;
          await wait(250);
          continue;
        }
        await transition(code === "BLOCKED_BY_CREDENTIAL" ? "blocked" : "failed", { errorCode: code });
        return { ok: false, job };
      }
    }
  }
  return {
    run,
    // Cloud entry for background engines (Autopilot cron): resolves the studio's
    // verified cloud owner (profiles.marketer_id) and runs the same orchestrator.
    async runForMarketer(marketerId, input) {
      const owner = await store.ownerFor(String(marketerId || ""));
      return run(owner, input);
    },
  };
}
