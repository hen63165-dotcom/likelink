// Regression: StudioHome must stay truthful and every button must lead somewhere real.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const HOME = read("src/components/studio/StudioHome.jsx");
const SHELL = read("src/components/studio/StudioShell.jsx");

test("every navigation target used by StudioHome is a real Studio view", () => {
  const ids = [...SHELL.matchAll(/^\s{2}[A-Z_]+: "([a-z-]+)",/gm)].map((m) => m[1]);
  assert.ok(ids.length > 10);
  const targets = new Set([
    ...[...HOME.matchAll(/go\("([a-z-]+)"\)/g)].map((m) => m[1]),
    ...[...HOME.matchAll(/view: "([a-z-]+)"/g)].map((m) => m[1]),
    ...[...HOME.matchAll(/\], "([a-z-]+)"\]/g)].map((m) => m[1]),
  ]);
  for (const t of targets) assert.ok(ids.includes(t), `unknown studio view: ${t}`);
});


test("StudioHome polls job status with POST (GET /api/autopilot returns 405)", () => {
  assert.ok(HOME.includes("fetchAutonomousJobStatus"));
  assert.ok(!SHELL.includes('/api/autopilot?mode=autonomous-jobs-status'), "Shell must not GET autopilot");
});

test("StudioHome contains no invented numbers or placeholder media", () => {
  assert.ok(!/2\.4M|12\.7%|unsplash|placeholder|lorem/i.test(HOME));
});
