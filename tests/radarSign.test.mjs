// ✍️ The radar's signature (radarSign.js + scripts/catalog/radar-signer.mjs). Pinned: the key is a random
// seed kept only in the encrypted state (never derived from a secret, so the public key gives nobody a
// way to test guesses of one); the signer exposes the id, the public half and a sign function only; the
// browser's own Web Crypto checks a root against the published key; a changed root, another key or a
// malformed signature is named, never counted as signed; the board and the locked copy keep only a
// well-formed signature; the key file goes into state.enc and into no public file; the published key
// file equals the pinned one; the state moves to its own strong key without losing anything.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanKey, cleanSig, keyIdOf, rootMessage, verifyRootSig } from "../src/lib/growth/radarSign.js";
import { RADAR_KEY } from "../src/lib/growth/radarKey.js";
import { KEY_FILE, newSigningKey, radarSigner } from "../scripts/catalog/radar-signer.mjs";
import { open, pack, stateKeys, unpack, seal, stateKey, STATE_FILE } from "../scripts/catalog/radar-state.mjs";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { ledgerText } from "../src/lib/growth/radarLedger.js";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const keyOf = (s) => ({ alg: "Ed25519", kid: s.kid, pub: s.pub, since: "2026-11-28" });
const KEY_A = newSigningKey("2026-11-28");
const KEY_B = newSigningKey("2026-11-28");

test("the signer: a random seed, a key named by its own public half; only the id, the public half and sign leave it", async () => {
  const a = radarSigner(KEY_A);
  assert.equal(radarSigner(KEY_A).kid, a.kid, "the same stored key every morning");
  assert.notEqual(radarSigner(KEY_B).kid, a.kid, "each new key is its own");
  assert.deepEqual(Object.keys(a).sort(), ["kid", "pub", "signRoot"]);
  assert.equal(JSON.stringify(a).includes(KEY_A.seed), false, "the seed never leaves the stored document");
  assert.equal(JSON.stringify(a.signRoot("2026-11-28", sha("x"))).includes(KEY_A.seed), false);
  assert.equal(a.kid, await keyIdOf(a.pub), "the key's id is its own public half's fingerprint");
  assert.equal(radarSigner({ ...KEY_A, pub: KEY_B.pub }), null, "a document whose halves do not belong together");
  assert.equal(radarSigner({ ...KEY_A, seed: "AAAA" }), null, "a seed that is not 32 bytes");
  assert.equal(radarSigner(null), null);
  const fixed = newSigningKey("2026-11-28", { random: () => Buffer.alloc(32, 7) });
  assert.equal(fixed.since, "2026-11-28");
  assert.equal(radarSigner(fixed).pub, fixed.pub);
});

test("the browser checks the root against the published key; a changed root or another key is named", async () => {
  const s = radarSigner(KEY_A);
  const root = ledgerText({ fresh: sha("1005|2026-11-28|82|2026-12-12|-") });
  const ledger = { d: "2026-11-28", sha256: sha(root), text: root, sig: s.signRoot("2026-11-28", sha(root)) };
  assert.deepEqual(await verifyRootSig(ledger, keyOf(s)), { state: "OK", kid: s.kid, d: "2026-11-28" });
  assert.equal((await verifyRootSig({ ...ledger, sha256: sha("other") }, keyOf(s))).state, "BAD", "another root");
  assert.equal((await verifyRootSig({ ...ledger, d: "2026-11-29" }, keyOf(s))).state, "BAD", "another day");
  const other = radarSigner(KEY_B);
  assert.equal((await verifyRootSig({ ...ledger, sig: other.signRoot(ledger.d, ledger.sha256) }, keyOf(s))).state, "OTHER_KEY", "a copy signs with its own key");
  const forged = { ...ledger.sig, kid: s.kid, b64: other.signRoot(ledger.d, ledger.sha256).b64 };
  assert.equal((await verifyRootSig({ ...ledger, sig: forged }, keyOf(s))).state, "BAD", "another key's signature under this key's id");
  assert.equal((await verifyRootSig({ ...ledger, sig: null }, keyOf(s))).state, "NO_SIG");
  assert.equal((await verifyRootSig(ledger, null)).state, "NO_KEY");
  assert.equal((await verifyRootSig(ledger, { ...keyOf(s), kid: other.kid })).state, "NO_KEY", "a key whose id is not its own fingerprint");
  assert.equal(rootMessage("2026-11-28", "ab"), "likelink2-radar|root|v1|2026-11-28|ab");
});

test("only a well-formed signature and key are kept", () => {
  const s = radarSigner(KEY_A);
  const sig = s.signRoot("2026-11-28", sha("x"));
  assert.deepEqual(cleanSig(sig), sig);
  assert.equal(cleanSig({ ...sig, alg: "RS256" }), null);
  assert.equal(cleanSig({ ...sig, kid: "<script>" }), null);
  assert.equal(cleanSig({ ...sig, b64: sig.b64.slice(4) }), null);
  assert.equal(cleanKey({ alg: "Ed25519", kid: s.kid, pub: `${s.pub}x` }), null);
  assert.equal(cleanKey({ ...keyOf(s), since: "x" }).since, null);
});

test("the board and the locked copy keep the root's signature; a malformed one is dropped", () => {
  const s = radarSigner(KEY_A);
  const root = ledgerText({ fresh: sha("f") });
  const doc = { v: 2, at: "2026-11-28T05:40:00Z", record: {}, concepts: [], ledger: { d: "2026-11-28", sha256: sha(root), count: 1, text: root, ots: [], sig: s.signRoot("2026-11-28", sha(root)) } };
  const board = sanitizeBoard(doc);
  assert.deepEqual(board.ledger.sig, doc.ledger.sig);
  assert.deepEqual(teaserBoard(board).ledger.sig, doc.ledger.sig, "the root and its signature are public behind the lock");
  assert.equal(sanitizeBoard({ ...doc, ledger: { ...doc.ledger, sig: { ...doc.ledger.sig, b64: "x" } } }).ledger.sig, undefined);
});

test("the published key file is the pinned key", async () => {
  const file = new URL("../public/radar-key.json", import.meta.url);
  if (!RADAR_KEY) {
    assert.equal(existsSync(file), false, "no key file before the key is pinned");
    return;
  }
  const k = cleanKey(RADAR_KEY);
  assert.ok(k, "the pinned key is well formed");
  assert.equal(await keyIdOf(k.pub), k.kid);
  assert.ok(k.since, "the pinned key names its first day");
  const pub = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual({ alg: pub.alg, kid: pub.kid, pub: pub.pub, since: pub.since }, k);
});

test("the key file is packed into the encrypted state only, never into a public file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "radar-sign-"));
  writeFileSync(join(dir, KEY_FILE), JSON.stringify(KEY_A));
  writeFileSync(join(dir, "board.json"), JSON.stringify({ v: 2, at: "2026-11-28T05:40:00Z", concepts: [], record: {} }));
  const env = { AUTOPILOT_SECRET: "machine-secret-1234" };
  const out = await pack(dir, { env, fetchImpl: async () => ({ status: 402 }) });
  assert.equal(out.key, "machine");
  for (const f of readdirSync(dir).filter((x) => x !== KEY_FILE && x !== STATE_FILE)) assert.equal(readFileSync(join(dir, f), "utf8").includes(KEY_A.seed), false, `${f} carries no seed`);
  assert.equal(readFileSync(join(dir, STATE_FILE)).includes(Buffer.from(KEY_A.seed)), false, "the state file holds it encrypted");
  assert.equal(JSON.parse(open(readFileSync(join(dir, STATE_FILE)), stateKey(env.AUTOPILOT_SECRET))[KEY_FILE]).kid, KEY_A.kid);
});

test("the state moves to its own strong key with nothing lost; a short one is never used", async () => {
  const machine = { AUTOPILOT_SECRET: "machine-secret-1234" };
  const strong = { ...machine, RADAR_STATE_KEY: "a long random passphrase for the radar state 1234" };
  assert.deepEqual(stateKeys(machine).map((k) => k.id), ["machine"]);
  assert.deepEqual(stateKeys(strong).map((k) => k.id), ["state-key", "machine"]);
  assert.deepEqual(stateKeys({ ...machine, RADAR_STATE_KEY: "short" }).map((k) => k.id), ["machine"], "under 32 characters it is ignored");
  assert.throws(() => stateKeys({}), /state key/);
  const dir = mkdtempSync(join(tmpdir(), "radar-move-"));
  writeFileSync(join(dir, STATE_FILE), seal({ "calls.json": "[1,2,3]" }, stateKey(machine.AUTOPILOT_SECRET)));
  assert.deepEqual(unpack(dir, { env: strong }), { files: 1, key: "machine" }, "the old file opens with the machine secret");
  const out = await pack(dir, { env: strong, fetchImpl: async () => ({ status: 402 }) });
  assert.equal(out.key, "state-key", "and is written back under the state's own key");
  assert.throws(() => unpack(dir, { env: machine }), "the machine secret alone no longer opens it");
  assert.deepEqual(unpack(dir, { env: strong }), { files: 1, key: "state-key" });
  assert.equal(readFileSync(join(dir, "calls.json"), "utf8"), "[1,2,3]");
});
