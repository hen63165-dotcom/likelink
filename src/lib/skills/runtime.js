// LikeLink's own Skills runtime.
//
// A skill is a small deterministic unit: a declared purpose, an input check,
// the permissions it needs, a timeout and bounded retries. A workflow runs
// approved skills in order, records each stage's real status, resumes after a
// failure without redoing finished stages (same input → same key), and never
// marks a stage done that did not finish: the stages after a failed or
// blocked one are SKIPPED, with the reason.
//
// Nothing here touches the network or an AI model; a skill gets what it may
// use through `ctx` (e.g. ctx.fetch), and only if its permissions are granted.
// Pure and isomorphic: the build (scripts/skills/run.mjs), GitHub Actions and
// tests run the same code.

export const STATUS = Object.freeze({ OK: "ok", WARN: "warn", FAILED: "failed", BLOCKED: "blocked", SKIPPED: "skipped" });
const DONE = new Set([STATUS.OK, STATUS.WARN]);
const registry = new Map();

/** Stable short key of any JSON value (key order does not matter). */
export function fingerprint(value) {
  const norm = (v) => (Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v);
  const s = JSON.stringify(norm(value)) ?? "";
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}-${s.length.toString(36)}`;
}

const retryableDefault = (e) => e?.name === "TimeoutError" || /timeout|network|fetch failed|ECONNRESET|ETIMEDOUT|\b(429|502|503|504)\b/i.test(String(e?.message || e));

export function defineSkill(spec) {
  const { name, purpose, permissions, run } = spec || {};
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(String(name || ""))) throw new Error("skill_name_invalid");
  if (!purpose || !Array.isArray(permissions) || typeof run !== "function") throw new Error(`skill_spec_incomplete:${name}`);
  if (registry.has(name)) throw new Error(`skill_exists:${name}`);
  const skill = Object.freeze({ version: 1, timeoutMs: 10_000, retries: 0, retryable: retryableDefault, validate: () => [], ...spec });
  registry.set(name, skill);
  return skill;
}

export function listSkills() {
  return [...registry.values()].map(({ name, version, purpose, permissions, timeoutMs, retries }) => ({ name, version, purpose, permissions, timeoutMs, retries }));
}

function timeout(promise, ms, label) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error(`${label}_timeout`), { name: "TimeoutError" })), ms); })]).finally(() => clearTimeout(t));
}

/** Runs one skill; always resolves with a record (never throws). */
export async function runSkill(name, input, ctx = {}) {
  const now = ctx.now || (() => Date.now());
  const sleep = ctx.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const t0 = now();
  const base = { skill: name, inputKey: fingerprint(input ?? null), startedAt: new Date(t0).toISOString() };
  const finish = (rec) => ({ ...base, version: registry.get(name)?.version || 0, attempts: 0, processed: 0, errors: [], ...rec, errorCount: (rec.errors || []).length, finishedAt: new Date(now()).toISOString(), ms: now() - t0 });
  const skill = registry.get(name);
  if (!skill) return finish({ status: STATUS.FAILED, errors: [{ code: "unknown_skill" }] });
  const problems = skill.validate(input) || [];
  if (problems.length) return finish({ status: STATUS.FAILED, errors: problems.map((p) => ({ code: "invalid_input", detail: String(p) })) });
  const missing = skill.permissions.filter((p) => !(ctx.grants || []).includes(p));
  if (missing.length) return finish({ status: STATUS.BLOCKED, blockedBy: missing.map((p) => `permission:${p}`).join(","), errors: [] });
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      const out = (await timeout(Promise.resolve().then(() => skill.run(input, ctx)), skill.timeoutMs, name)) || {};
      return finish({ status: out.status || STATUS.OK, attempts, processed: out.processed || 0, errors: (out.errors || []).slice(0, 50), blockedBy: out.blockedBy || "", output: out.output ?? null });
    } catch (e) {
      if (attempts <= skill.retries && skill.retryable(e)) {
        await sleep(Math.min(250 * 2 ** (attempts - 1), 4_000));
        continue;
      }
      return finish({ status: STATUS.FAILED, attempts, errors: [{ code: e?.name === "TimeoutError" ? "timeout" : "exception", detail: String(e?.message || e).slice(0, 200) }] });
    }
  }
}

/**
 * Runs `steps` ([{ skill, input?: (acc) => value, optional?: true }]) in order.
 * `previous` (an earlier record of this workflow) lets a run resume: a stage
 * that finished with the same input is reused, not run again.
 */
export async function runWorkflow({ name, steps, input = null, previous = null, ctx = {} }) {
  const startedAt = new Date((ctx.now || Date.now)()).toISOString();
  const acc = { input };
  const stages = [];
  let stop = null;
  for (const step of steps) {
    if (stop) {
      stages.push({ skill: step.skill, status: STATUS.SKIPPED, reason: stop, errors: [], errorCount: 0, processed: 0 });
      continue;
    }
    const stepInput = step.input ? step.input(acc) : input;
    const key = fingerprint(stepInput ?? null);
    const reused = previous?.stages?.find((s) => s.skill === step.skill && s.inputKey === key && DONE.has(s.status));
    const rec = reused ? { ...reused, resumed: true } : await runSkill(step.skill, stepInput, ctx);
    stages.push(rec);
    acc[step.skill] = rec.output;
    if (!DONE.has(rec.status) && !step.optional) stop = `after ${step.skill}: ${rec.status}`;
  }
  const has = (s) => stages.some((x) => x.status === s);
  const status = has(STATUS.FAILED) ? STATUS.FAILED : has(STATUS.BLOCKED) ? STATUS.BLOCKED : has(STATUS.WARN) ? STATUS.WARN : STATUS.OK;
  return { workflow: name, status, startedAt, finishedAt: new Date((ctx.now || Date.now)()).toISOString(), stages };
}

/** Test hook. */
export function resetSkillsForTests() {
  registry.clear();
}
