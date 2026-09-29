// Scheduler fairness: with a small per-run budget (the light cron runs 2 jobs),
// due jobs must run most-overdue-first. Registration order used to decide,
// so every job registered after the first two starved for days (the Luna
// status then correctly showed OVERDUE for 10 of 13 jobs).
import test from "node:test";
import assert from "node:assert/strict";
import { registerJob, runDueJobs } from "../src/lib/cloud/growthScheduler.js";

test("runDueJobs runs the longest-waiting due jobs first", async () => {
  const NOW = 10_000_000_000;
  const ran = [];
  // Registered in this order on purpose: a and b first.
  for (const id of ["fair-a", "fair-b", "fair-c", "fair-d"]) {
    registerJob(id, { intervalMs: 1000, maxDurationMs: 1000, fn: async () => { ran.push(id); return { ok: true }; } });
  }
  const store = new Map([
    ["growth:job:fair-a", { lastRunAt: NOW - 1500 }], // just became due
    ["growth:job:fair-b", { lastRunAt: NOW - 1200 }], // just became due
    // fair-c never ran
    ["growth:job:fair-d", { lastRunAt: NOW - 900_000 }], // waiting the longest
  ]);
  const kvGet = async (k) => store.get(k) ?? null;
  const kvSet = async (k, v) => { store.set(k, v); };

  await runDueJobs({ kvGet, kvSet, now: NOW, maxJobs: 2 });
  assert.deepEqual(ran, ["fair-c", "fair-d"], "never-run and longest-waiting jobs run before recently-run ones");

  // Next run: the two that were skipped get their turn.
  ran.length = 0;
  await runDueJobs({ kvGet, kvSet, now: NOW + 10, maxJobs: 2 });
  assert.deepEqual(ran.sort(), ["fair-a", "fair-b"]);
});
