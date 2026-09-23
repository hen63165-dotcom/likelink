/**
 * LikeLink Growth Scheduler — Provider-Neutral Execution Boundary
 * ================================================================
 * Decouples LikeLink's growth intelligence from any specific hosting provider.
 *
 * Architecture:
 *   LikeLink Growth Jobs (business logic)
 *        ↓
 *   Execution Adapter (provider-neutral interface)
 *        ↓
 *   Vercel Cron / future scheduler / manual trigger
 *
 * Jobs are:
 *   - idempotent (safe to re-run)
 *   - retry-safe
 *   - bounded work
 *   - state-tracked (lastRun, nextRun, failure state)
 *   - auditable (Decision Memory)
 *
 * This module runs in BOTH Vercel serverless AND browser contexts.
 */

// Audit logging — simplified for serverless compatibility
const auditLog = (event, actor, target, metadata) => {
  try {
    console.log("[AUDIT]", JSON.stringify({ event, actor, target, ts: new Date().toISOString(), ...metadata }));
  } catch { /* noop */ }
};

// Job registry — all growth jobs register here
const JOB_REGISTRY = new Map();

// Job states
export const JOB_STATE = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
};

/**
 * Register a growth job.
 * @param {string} id - unique job identifier
 * @param {object} config - { fn, intervalMs, description, maxDurationMs }
 */
export function registerJob(id, { fn, intervalMs = 86400000, description = "", maxDurationMs = 30000 }) {
  if (typeof fn !== "function") throw new Error(`Job ${id}: fn must be a function`);
  JOB_REGISTRY.set(id, { id, fn, intervalMs, description, maxDurationMs, createdAt: Date.now() });
  return id;
}

/**
 * Get all registered jobs
 */
export function getJobs() {
  return Array.from(JOB_REGISTRY.values()).map((j) => ({
    id: j.id,
    description: j.description,
    intervalMs: j.intervalMs,
    createdAt: j.createdAt,
  }));
}

/**
 * Execute a single job by id.
 * Pure execution — no provider-specific logic.
 */
export async function executeJob(id, { kvGet, kvSet, skipAudit = false } = {}) {
  const job = JOB_REGISTRY.get(id);
  if (!job) return { ok: false, error: "job_not_found", id };

  const stateKey = `growth:job:${id}`;
  const now = Date.now();

  // Check if already running (idempotency guard)
  try {
    const currentState = (await kvGet(stateKey)) || {};
    if (currentState.state === JOB_STATE.RUNNING && now - (currentState.startedAt || 0) < job.maxDurationMs) {
      return { ok: false, error: "already_running", id, startedAt: currentState.startedAt };
    }
    // Check if already ran within interval (skip if too soon)
    if (currentState.lastRunAt && now - currentState.lastRunAt < job.intervalMs && currentState.state === JOB_STATE.SUCCESS) {
      return { ok: false, error: "too_soon", id, lastRunAt: currentState.lastRunAt, nextRunAt: currentState.lastRunAt + job.intervalMs };
    }
  } catch {
    // State check failed — proceed anyway (fail-open for execution)
  }

  // Mark as running
  const runRecord = {
    id,
    state: JOB_STATE.RUNNING,
    startedAt: now,
    description: job.description,
  };
  try {
    await kvSet(stateKey, runRecord);
  } catch {
    // Non-blocking
  }

  // Execute with timeout
  let result;
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), job.maxDurationMs)
    );
    result = await Promise.race([job.fn({ kvGet, kvSet, now }), timeoutPromise]) || {};
  } catch (e) {
    result = { ok: false, error: String(e.message || e) };
  }

  // Distinguish skipped (ok:false + skipped reason) from failed (ok:false + error)
  const isSkipped = !result.ok && Boolean(result.skipped);

  // Update state — skipped jobs are not failures, they're intentional no-ops
  const finishedAt = Date.now();
  const finalRecord = {
    ...runRecord,
    state: result.ok ? JOB_STATE.SUCCESS : (isSkipped ? JOB_STATE.SKIPPED : JOB_STATE.FAILED),
    finishedAt,
    durationMs: finishedAt - runRecord.startedAt,
    lastRunAt: finishedAt,
    nextRunAt: finishedAt + job.intervalMs,
    result: result.ok ? "success" : (isSkipped ? result.skipped : result.error),
  };
  try {
    await kvSet(stateKey, finalRecord);
  } catch {
    // Non-blocking
  }

  // Audit log
  if (!skipAudit) {
    auditLog(
      result.ok ? "growth.job.success" : (isSkipped ? "growth.job.skipped" : "growth.job.failure"),
      { type: "system", id: "growth-scheduler" },
      { type: "job", id },
      { result: result.ok ? "success" : (isSkipped ? result.skipped : result.error), durationMs: finalRecord.durationMs }
    );
  }

  return { ...result, durationMs: finalRecord.durationMs };
}

/**
 * Run ALL registered jobs that are due.
 */
export async function runDueJobs({ kvGet, kvSet, now = Date.now(), force = false } = {}) {
  const results = [];

  for (const [id, job] of JOB_REGISTRY) {
    try {
      const stateKey = `growth:job:${id}`;
      const state = (await kvGet(stateKey)) || {};
      const isDue = !state.lastRunAt || now - state.lastRunAt >= job.intervalMs;
      const notRunning = state.state !== JOB_STATE.RUNNING || now - (state.startedAt || 0) >= job.maxDurationMs;

      if ((isDue || force) && notRunning) {
        const result = await executeJob(id, { kvGet, kvSet, now });
        results.push({ id, ...result });
      }
    } catch (e) {
      results.push({ id, ok: false, error: String(e.message || e) });
    }
  }
  return results;
}

/**
 * Get job status for dashboard
 */
export async function getJobStatus({ kvGet } = {}) {
  const statuses = [];
  for (const [id] of JOB_REGISTRY) {
    try {
      const stateKey = `growth:job:${id}`;
      const state = (await kvGet(stateKey)) || {};
      statuses.push({
        id,
        state: state.state || JOB_STATE.PENDING,
        lastRunAt: state.lastRunAt || null,
        nextRunAt: state.nextRunAt || null,
        durationMs: state.durationMs || null,
      });
    } catch {
      statuses.push({ id, state: "unknown" });
    }
  }
  return statuses;
}
