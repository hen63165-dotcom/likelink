// Truthful status contract: the UI may only show what the cloud really reports.
//
// These tests lock in the rules that prevent "green light" lies:
//   • the scheduler is ACTIVE only when real jobs exist and none failed
//   • missing persistence is REQUIRES_CONNECTION, an empty queue is WAITING,
//     an unreachable scheduler is OFFLINE
//   • a content item is only PUBLISHED when every channel accepted it — one
//     failed channel makes the whole content FAILED, and an unconfigured
//     channel is REQUIRES_CONNECTION (never a silent success)
//   • the server must build the state from the queue (no hardcoded "ACTIVE")
//     and must persist a real publication log with provider ids + retry
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  PLATFORM_STATE,
  PUBLICATION_STATE,
  LUNA_STATE,
  deriveSchedulerState,
  deriveLunaStatus,
  lunaToPlatformState,
  heartbeatFresh,
  getBrowserHeartbeat,
  recordLunaHeartbeat,
  schedulerReasonFor,
  summarizeJobs,
  summarizePublications,
  publicationsByContent,
  isRetryableChannel,
  channelLabel,
} from "../src/lib/cloud/lunaStatus.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Normalize line endings: this repo is checked out with CRLF on Windows, and
// the source-scanning assertions below must behave identically everywhere.
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

test("scheduler state is derived only from real cloud answers", () => {
  // No persistence credentials → nothing can run, whatever else says.
  assert.equal(deriveSchedulerState({ cloudConfigured: false, jobs: [{ state: "success" }] }), PLATFORM_STATE.REQUIRES_CONNECTION);
  // Reachable and connected but the queue is empty → honest WAITING.
  assert.equal(deriveSchedulerState({ cloudConfigured: true, jobs: [] }), PLATFORM_STATE.WAITING);
  // A failed job is never shown as healthy.
  assert.equal(deriveSchedulerState({ cloudConfigured: true, jobs: [{ state: "success" }, { state: "failed" }] }), PLATFORM_STATE.FAILED);
  // Real registered jobs, none failed → ACTIVE (the only case allowed to be green).
  assert.equal(deriveSchedulerState({ cloudConfigured: true, jobs: [{ state: "success" }, { state: "pending" }] }), PLATFORM_STATE.ACTIVE);
});

test("luna lifecycle distinguishes never-run / running / overdue / stale / unreachable", () => {
  const NOW = Date.now();
  const fresh = NOW - 60_000;
  const old = NOW - 3 * 24 * 3600_000;
  // No answer at all → UNREACHABLE (the card renders OFFLINE, never ACTIVE).
  assert.equal(deriveLunaStatus({ ok: false }), LUNA_STATE.UNREACHABLE);
  assert.equal(lunaToPlatformState(LUNA_STATE.UNREACHABLE), PLATFORM_STATE.OFFLINE);
  // An exception behind a 200 → ERROR, never ACTIVE.
  assert.equal(deriveLunaStatus({ ok: true, error: true }), LUNA_STATE.ERROR);
  // Nothing ever ran anywhere: empty queue, cron never fired, no tab work.
  assert.equal(
    deriveLunaStatus({ ok: true, jobs: [], cron: { everRun: false, stale: true, lastBeatAt: null }, heartbeatAt: null, now: NOW }),
    LUNA_STATE.NEVER_RUN
  );
  // A job running right now → RUNNING (maps to the green coarse badge).
  assert.equal(
    deriveLunaStatus({ ok: true, jobs: [{ state: "running", lastRunAt: fresh }], cron: { everRun: true, stale: false, lastBeatAt: fresh }, heartbeatAt: fresh, now: NOW }),
    LUNA_STATE.RUNNING
  );
  assert.equal(lunaToPlatformState(LUNA_STATE.RUNNING), PLATFORM_STATE.ACTIVE);
  // A due job (nextRunAt passed) counts as running work, not idle.
  assert.equal(
    deriveLunaStatus({ ok: true, jobs: [{ state: "success", lastRunAt: fresh, nextRunAt: NOW - 1000 }], cron: { everRun: true, stale: false, lastBeatAt: fresh }, now: NOW }),
    LUNA_STATE.RUNNING
  );
  // Known cadence that stopped firing → OVERDUE.
  assert.equal(
    deriveLunaStatus({ ok: true, jobs: [{ state: "success", lastRunAt: old }], cron: { everRun: true, stale: true, lastBeatAt: old }, heartbeatAt: null, now: NOW }),
    LUNA_STATE.OVERDUE
  );
  // Fresh evidence → ACTIVE; a heartbeat alone without cloud evidence is NOT enough.
  assert.equal(
    deriveLunaStatus({ ok: true, jobs: [{ state: "success", lastRunAt: fresh }], cron: { everRun: true, stale: false, lastBeatAt: fresh }, heartbeatAt: null, now: NOW }),
    LUNA_STATE.ACTIVE
  );
  assert.equal(
    deriveLunaStatus({ ok: true, jobs: [], cron: { everRun: true, stale: false, lastBeatAt: fresh }, heartbeatAt: fresh, now: NOW }),
    LUNA_STATE.WAITING
  );
  // Everything real but ancient → STALE, never ACTIVE on cached state.
  assert.equal(
    deriveLunaStatus({ ok: true, jobs: [{ state: "success", lastRunAt: old }], cron: { everRun: true, stale: false, lastBeatAt: old }, heartbeatAt: old, now: NOW }),
    LUNA_STATE.STALE
  );
});

test("queue summary exposes last-fire / overdue / next-fire surfaces without guessing", () => {
  const NOW = Date.now();
  const s = summarizeJobs([
    { id: "a", state: "success", lastRunAt: NOW - 3600_000, nextRunAt: NOW + 3600_000 },
    { id: "b", state: "pending", nextRunAt: NOW - 1000 },
  ]);
  assert.equal(s.lastFireAt, NOW - 3600_000);
  assert.ok(s.lastFireAgeSec >= 3590 && s.lastFireAgeSec <= 3610, "age tracks the real stamp");
  assert.equal(s.overdue, true, "a passed nextRunAt is overdue");
  assert.equal(s.overdueCount, 1);
  assert.equal(s.nextFireAt, NOW - 1000, "earliest upcoming (incl. due) execution");
  const empty = summarizeJobs([]);
  assert.equal(empty.lastFireAt, null, "never fired stays null, not zero");
  assert.equal(empty.lastFireAgeSec, null);
  assert.equal(empty.overdue, false);
  assert.equal(empty.nextFireAt, null);
});

test("browser heartbeat only records real work in a visible tab", () => {
  // Node has no DOM: no heartbeat can be invented here.
  assert.equal(getBrowserHeartbeat(), null);
  assert.equal(recordLunaHeartbeat("sweep"), null);
  assert.equal(recordLunaHeartbeat("bogus-kind"), null);
  assert.equal(heartbeatFresh(Date.now()), true);
  assert.equal(heartbeatFresh(Date.now() - 10 * 60_1000), false, "a 10-minute-old beat is not fresh");
  assert.equal(heartbeatFresh(null), false, "no beat is never fresh");
});

test("job summary counts real states and never invents a run", () => {
  const s = summarizeJobs([
    { id: "a", state: "SUCCESS", lastRunAt: 1000 },
    { id: "b", state: "failed", lastRunAt: 2000, result: "boom" },
    { id: "c", state: "running" },
    { id: "d" },
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.success, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.running, 1);
  assert.equal(s.pending, 1);
  assert.equal(s.lastRunAt, 2000);
  assert.equal(s.nextRunAt, null, "no nextRunAt in the data → must stay null, not a guess");
});

test("publication summary counts only records that exist", () => {
  const s = summarizePublications([
    { channel: "web", status: PUBLICATION_STATE.PUBLISHED },
    { channel: "telegram", status: PUBLICATION_STATE.FAILED, error: "401 Unauthorized" },
    { channel: "external", status: PUBLICATION_STATE.REQUIRES_CONNECTION },
    { channel: "web", status: PUBLICATION_STATE.PENDING },
    null,
  ]);
  assert.equal(s.total, 5);
  assert.equal(s.published, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.requiresConnection, 1);
  assert.equal(s.pending, 2, "an unknown/absent status counts as pending, never as published");
  assert.equal(s.byChannel.telegram.failed, 1);
});

test("content status is the worst channel outcome, with provider proof kept", () => {
  const groups = publicationsByContent([
    { id: "p1", contentId: "pulse_7", contentType: "luna_pulse", productId: "prod_1", channel: "web", status: PUBLICATION_STATE.PUBLISHED, externalId: "bp_9", publishedAt: "2026-09-20T10:00:00.000Z", attempts: 1 },
    { id: "p2", contentId: "pulse_7", contentType: "luna_pulse", channel: "telegram", status: PUBLICATION_STATE.FAILED, error: "401 Unauthorized", publishedAt: "2026-09-20T10:00:01.000Z", attempts: 2 },
    { id: "p3", contentId: "pulse_8", contentType: "luna_pulse", channel: "web", status: PUBLICATION_STATE.PUBLISHED, externalId: "bp_10", publishedAt: "2026-09-19T09:00:00.000Z" },
  ]);
  assert.equal(groups.length, 2);
  const g = groups[0];
  assert.equal(g.contentId, "pulse_7");
  assert.equal(g.status, PUBLICATION_STATE.FAILED, "one failed channel must not be masked by a successful one");
  assert.equal(g.channels.length, 2);
  assert.equal(g.channels.find((c) => c.channel === "web").externalId, "bp_9");
  assert.equal(g.channels.find((c) => c.channel === "telegram").attempts, 2);
  assert.equal(g.channels.find((c) => c.channel === "telegram").label, channelLabel("telegram"));
  assert.equal(groups[1].status, PUBLICATION_STATE.PUBLISHED);
});

test("autopilot API derives scheduler state instead of hardcoding ACTIVE", () => {
  const api = read("api/autopilot.mjs");
  assert.match(api, /function buildSchedulerReport/, "must build the report from the real job queue");
  assert.match(api, /persistence !== "connected" \? "REQUIRES_CONNECTION"/, "missing persistence must be reported as REQUIRES_CONNECTION");
  assert.match(api, /!list\.length \? "WAITING"/, "an empty queue must be reported as WAITING");
  assert.match(api, /failedCount \? "FAILED"/, "a failed job must be reported as FAILED");
  assert.ok(
    !/state:\s*"ACTIVE"/.test(api),
    "the API must never send a fixed ACTIVE state"
  );
});

test("autopilot API keeps a real publication log with provider ids and retry", () => {
  const api = read("api/autopilot.mjs");
  assert.match(api, /const PUBLISH_LOG_KEY = "publish:log"/, "publications must be persisted under a real key");
  assert.match(api, /async function recordPublication/, "every publish attempt must be recorded");
  assert.match(api, /externalId = await sendTelegram/, "telegram must return the provider message id");
  assert.match(api, /requestedMode === "retry-publication"/, "a failed publication must be retryable in the cloud");
  assert.match(api, /attemptOf: target\.id/, "a retry must link back to the attempt it replaces");
  assert.match(api, /publicPublications\(await readPublishLog\(\)\)/, "status must expose the publication log");
});

test("Studio header reports the cloud state instead of a fixed green light", () => {
  const shell = read("src/components/studio/StudioShell.jsx");
  const card = read("src/components/studio/LunaStatusCard.jsx");
  assert.match(shell, /lunaStatus\.js/, "the shell must consume the shared truthful status module");
  assert.match(shell, /platform\?\.state \|\| PLATFORM_STATE\.OFFLINE/, "no answer must show as OFFLINE");
  assert.ok(!shell.includes("Command center active"), "the header must not claim activity with no evidence");
  assert.ok(
    !/animate-pulse"\s+style=\{\{\s*background:\s*"var\(--success\)"/.test(shell),
    "the header must not render an always-success pulse dot"
  );
  assert.match(card, /fetchPlatformStatus/, "the card must read the real platform status");
  assert.match(card, /retryPublication/, "the card must retry through the real cloud endpoint");
  assert.ok(!/MOCK_|FAKE_|DUMMY_/.test(card), "the card must not contain mock data");
});


test("retry is offered only for a real failed record on a reachable channel", () => {
  assert.equal(isRetryableChannel({ id: "p2", channel: "telegram", status: PUBLICATION_STATE.FAILED }), true);
  assert.equal(isRetryableChannel({ id: "p1", channel: "web", status: PUBLICATION_STATE.PUBLISHED }), false);
  assert.equal(isRetryableChannel({ id: "p3", channel: "external", status: PUBLICATION_STATE.REQUIRES_CONNECTION }), false);
  assert.equal(isRetryableChannel(null), false);
});

// ── The explanation must be as truthful as the light ─────────────────────────
// A red light labelled "queue idle" is a lie of the same kind as a green light
// with no evidence, so the reason code is part of the server contract.

test("scheduler report carries a reason the UI can render verbatim", () => {
  const api = read("api/autopilot.mjs");
  const block = api.match(/const reason =([\s\S]*?);\n/);
  assert.ok(block, "buildSchedulerReport must derive a reason code, not leave it to the UI");
  const codes = [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    codes.slice().sort(),
    ["job_failed", "jobs_due_or_running", "jobs_registered", "persistence_not_configured", "queue_empty"].sort(),
    "the reason vocabulary is fixed"
  );

  // Every code the server can send must have text in the card — otherwise the
  // user sees a raw code or the fallback line.
  const card = read("src/components/studio/LunaStatusCard.jsx");
  const reasonBlock = card.match(/const REASON_TEXT = \{([\s\S]*?)\n\};/);
  assert.ok(reasonBlock, "the card must keep a reason-text table");
  const keys = [...reasonBlock[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
  for (const code of codes) {
    assert.ok(keys.includes(code), `the card has no wording for reason "${code}"`);
  }
  // …and the card keeps no wording the server can never send: dead reason codes
  // are how a stale "everything is fine" sentence survives a refactor.
  // scheduler_unreachable is the one client-only code (no answer at all).
  assert.deepEqual(
    keys.slice().sort(),
    [...codes, "scheduler_unreachable"].sort(),
    "the card's reason table must match the server vocabulary exactly"
  );
});

test("the UI never explains a red or grey light as 'queue idle'", () => {
  // A real server reason always wins.
  assert.equal(schedulerReasonFor(PLATFORM_STATE.FAILED, { reason: "job_failed" }), "job_failed");
  // When the scheduler gives no reason, the fallback follows the state — it must
  // never collapse every unknown into the neutral "queue_idle".
  assert.equal(schedulerReasonFor(PLATFORM_STATE.FAILED, null), "job_failed");
  assert.equal(schedulerReasonFor(PLATFORM_STATE.REQUIRES_CONNECTION, null), "persistence_not_configured");
  assert.equal(schedulerReasonFor(PLATFORM_STATE.WAITING, null), "queue_empty");
  assert.equal(schedulerReasonFor(PLATFORM_STATE.OFFLINE, null), "scheduler_unreachable");
  const card = read("src/components/studio/LunaStatusCard.jsx");
  assert.ok(!card.includes('"queue_idle"'), "no blanket queue_idle default may remain in the card");
});

test("the server report itself returns truthful state + reason for real inputs", async () => {
  const { buildSchedulerReport } = await import("../api/autopilot.mjs");

  // No persistence → nothing can run, regardless of what the queue claims.
  const disconnected = buildSchedulerReport([{ state: "success" }], "not_configured");
  assert.equal(disconnected.state, "REQUIRES_CONNECTION");
  assert.equal(disconnected.reason, "persistence_not_configured");

  // Connected but the queue really is empty.
  const empty = buildSchedulerReport([], "connected");
  assert.equal(empty.state, "WAITING");
  assert.equal(empty.reason, "queue_empty");

  // A failed job is reported as failed, with the matching explanation.
  const failed = buildSchedulerReport([{ state: "success" }, { state: "failed" }], "connected");
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.reason, "job_failed");
  assert.equal(failed.failedCount, 1);

  // Real jobs, nothing due, none failed.
  const idle = buildSchedulerReport([{ state: "success", nextRunAt: Date.now() + 3600_000 }], "connected");
  assert.equal(idle.state, "ACTIVE");
  assert.equal(idle.reason, "jobs_registered");

  // A job currently running is explained as running, not as idle.
  const running = buildSchedulerReport([{ state: "running" }], "connected");
  assert.equal(running.reason, "jobs_due_or_running");

  // A job whose next run has arrived is explained as due.
  const due = buildSchedulerReport([{ state: "success", nextRunAt: Date.now() - 1000 }], "connected");
  assert.equal(due.reason, "jobs_due_or_running");
  assert.equal(due.dueCount, 1);

  // The forbidden neutral answer must never be produced by the server.
  for (const r of [disconnected, empty, failed, idle, running, due]) {
    assert.notEqual(r.reason, "queue_idle");
    assert.ok(r.reason, "every report must carry a reason");
  }
});



test("lightweight status path exposes queue-derived scheduler surfaces", () => {
  const api = read("api/autopilot.mjs");
  // The GET/fast path builds its queue inline — it must carry the same
  // additive surfaces as the POST path so production agrees on OVERDUE.
  assert.match(api, /queue: \{\n\s*jobs,\n\s*dueCount: report\.dueCount,\n\s*lastFireAt: report\.lastFireAt,/);
  // And the same path must carry the cron beat + publications + connections
  // the control room renders — read inline under the same keys, no new fn.
  assert.match(api, /const beatRow = await readKV\("cron:beat", null\)/);
  assert.match(api, /const publishRows = await readKV\(PUBLISH_LOG_KEY, \[\]\)/);
  assert.match(api, /publications: publicPublications\(publishRows\),\n\s*connections: platformChannelAvailability\(\),\n\s*cron,/);
});

// ── No claims about infrastructure that does not exist ──────────────────────

test("every /api path the status module calls is a function that exists", () => {
  const source = read("src/lib/cloud/lunaStatus.js");
  const called = new Set(
    [...source.matchAll(/["'`](\/api\/[a-zA-Z0-9_\-/]+)/g)].map((m) => m[1].replace(/\/$/, ""))
  );
  assert.ok(called.size > 0, "the status module must actually call the cloud");
  for (const p of called) {
    const segments = p.split("/").filter(Boolean); // ["api", "autopilot", ...]
    const fn = path.join(ROOT, "api", `${segments[1]}.mjs`);
    assert.ok(
      existsSync(fn),
      `${p} is probed by the status module but api/${segments[1]}.mjs does not exist — a missing endpoint is a false alarm, not a status`
    );
  }
});

test("cron truth comes from recorded beats, not from probing an invented endpoint", () => {
  const source = read("src/lib/cloud/lunaStatus.js");
  assert.ok(!/autopilot-heartbeat|\/api\/cron\//.test(source), "the phantom cron heartbeat endpoint must be gone");
  const api = read("api/autopilot.mjs");
  assert.match(api, /const CRON_BEAT_KEY = "cron:beat"/, "beats must be persisted under a real key");
  assert.match(api, /async function recordCronBeat/, "a real cron run must stamp the beat");
  assert.match(api, /await recordCronBeat\(cronMode\)/, "the stamp must happen inside the cron branch");
  assert.match(api, /async function buildCronReport/, "the beat must be reported honestly");
  assert.match(api, /everRun: Boolean\(lastBeatAt\)/, "never having run must be distinguishable from running");
  // Both status handlers expose it, so no caller can miss the evidence.
  assert.equal(
    (api.match(/cron: await buildCronReport\(\)/g) || []).length,
    2,
    "both the GET and POST status responses must carry the cron evidence"
  );
});

