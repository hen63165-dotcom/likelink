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

test("the light cron is time-boxed, not count-boxed: due jobs run until the budget is spent", async () => {
  const NOW = 20_000_000_000;
  const ran = [];
  let t = 0;
  const clock = () => t;
  for (const id of ["budget-a", "budget-b", "budget-c", "budget-d", "budget-e"]) {
    registerJob(id, { intervalMs: 1000, maxDurationMs: 1000, fn: async () => { ran.push(id); t += 30_000; return { ok: true }; } });
  }
  const store = new Map();
  const kvGet = async (k) => store.get(k) ?? null;
  const kvSet = async (k, v) => { store.set(k, v); };
  const results = await runDueJobs({ kvGet, kvSet, now: NOW, budgetMs: 90_000, clock });
  const mine = results.filter((r) => String(r.id).startsWith("budget-"));
  assert.equal(ran.length, 3, "30s jobs within a 90s budget → 3 jobs (a fixed limit of 2 used to leave the rest overdue)");
  assert.equal(mine.filter((r) => r.skipped === "time_budget").length, 2, "the rest are deferred, not dropped");
  // Next beat: the deferred ones have waited longest and go first.
  ran.length = 0;
  t = 0;
  await runDueJobs({ kvGet, kvSet, now: NOW + 10, budgetMs: 90_000, clock });
  assert.deepEqual(ran.filter((id) => id.startsWith("budget-")).slice(0, 2).sort(), ["budget-d", "budget-e"]);
});
