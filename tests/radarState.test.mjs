// The radar's private state (scripts/catalog/radar-state.mjs): one encrypted file on the public
// release; the public board is the teaser unless the server says the trial is open.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open, pack, seal, stateKey, unpack } from "../scripts/catalog/radar-state.mjs";

const env = { AUTOPILOT_SECRET: "test-secret-that-is-long-enough" };
const board = { v: 1, at: "2026-12-05T05:37:00Z", record: {}, concepts: [{ id: "tofu-squishy", he: "סקווישי טופו" }], early: { need: 4, record: {}, ledger: [{ concept: "tofu-squishy", at: "2026-12-05", due: "2026-12-19" }], seal: { d: "2026-12-05", sha256: "b".repeat(64), count: 1, text: "tofu-squishy|2026-12-05|demand", ots: [] } } };

function stateDir() {
  const dir = mkdtempSync(join(tmpdir(), "rs-"));
  writeFileSync(join(dir, "board.json"), JSON.stringify(board));
  writeFileSync(join(dir, "calls.json"), JSON.stringify([{ concept: "tofu-squishy", kind: "early", at: "2026-12-05" }]));
  writeFileSync(join(dir, "briefs.json"), JSON.stringify({ kits: [{ id: "k" }] }));
  return dir;
}

test("the state is unreadable without the key and opens with it", () => {
  const key = stateKey(env.AUTOPILOT_SECRET);
  const enc = seal({ "calls.json": "[1]" }, key);
  assert.doesNotMatch(enc.toString("latin1"), /calls|\[1\]/);
  assert.deepEqual(open(enc, key), { "calls.json": "[1]" });
  assert.throws(() => open(enc, stateKey("another-secret-long-enough")), "a wrong key never opens it");
  assert.throws(() => stateKey(""), /AUTOPILOT_SECRET/);
});

test("locked (or unreachable server): the public board is the teaser and no kits are public", async () => {
  const dir = stateDir();
  const out = await pack(dir, { env, fetchImpl: async () => ({ status: 402 }) });
  assert.equal(out.open, false);
  const pub = readFileSync(join(dir, "board-public.json"), "utf8");
  assert.doesNotMatch(pub, /tofu/, "no live call in the public file");
  assert.equal(existsSync(join(dir, "briefs-public.json")), false);
  const down = await pack(dir, { env, fetchImpl: async () => { throw new Error("down"); } });
  assert.equal(down.open, false, "a failure is treated as locked");
  // and the encrypted state brings every file back
  for (const f of ["board.json", "calls.json", "briefs.json"]) rmSync(join(dir, f));
  assert.equal(unpack(dir, { env }).files, 3);
  assert.equal(JSON.parse(readFileSync(join(dir, "calls.json"), "utf8"))[0].concept, "tofu-squishy");
});

test("open trial: the public board is the full one and the kits are public", async () => {
  const dir = stateDir();
  const out = await pack(dir, { env, fetchImpl: async () => ({ status: 200 }) });
  assert.equal(out.open, true);
  assert.match(readFileSync(join(dir, "board-public.json"), "utf8"), /tofu/);
  assert.equal(existsSync(join(dir, "briefs-public.json")), true);
});
