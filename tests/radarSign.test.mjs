// ✍️ The radar's signature (radarSign.js + scripts/catalog/radar-signer.mjs). Pinned: the key is made
// from the machine secret on the runner and never leaves it (the signer exposes the id, the public half
// and a sign function only); the browser's own Web Crypto checks a root against the published key; a
// changed root, another key or a malformed signature is named, never counted as signed; the board and
// the locked copy keep only a well-formed signature; the published key file equals the pinned one.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { cleanKey, cleanSig, keyIdOf, rootMessage, verifyRootSig } from "../src/lib/growth/radarSign.js";
import { RADAR_KEY } from "../src/lib/growth/radarKey.js";
import { radarSigner, SIGN_LABEL } from "../scripts/catalog/radar-signer.mjs";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";
import { ledgerText } from "../src/lib/growth/radarLedger.js";

const SECRET = "test-machine-secret-0123456789abcdef";
const sha = (t) => createHash("sha256").update(t).digest("hex");
const keyOf = (s) => ({ alg: "Ed25519", kid: s.kid, pub: s.pub, since: "2026-11-28" });

test("the signer: the same secret makes the same key, another secret another; only the id, the public half and sign leave it", async () => {
  const a = radarSigner(SECRET);
  assert.equal(radarSigner(SECRET).kid, a.kid);
  assert.notEqual(radarSigner(`${SECRET}x`).kid, a.kid);
  assert.equal(radarSigner("short"), null, "no key from a missing or short secret");
  assert.equal(radarSigner(undefined), null);
  assert.deepEqual(Object.keys(a).sort(), ["kid", "pub", "signRoot"]);
  assert.equal(JSON.stringify(a).includes(SECRET), false);
  assert.equal(a.kid, await keyIdOf(a.pub), "the key's id is its own public half's fingerprint");
  const seed = createHash("sha256").update(SIGN_LABEL + SECRET).digest("hex");
  assert.equal(JSON.stringify(a.signRoot("2026-11-28", sha("x"))).includes(seed), false);
  assert.equal(SIGN_LABEL.includes("likelink-radar-state"), false, "the state's key uses another label");
});

test("the browser checks the root against the published key; a changed root or another key is named", async () => {
  const s = radarSigner(SECRET);
  const root = ledgerText({ fresh: sha("1005|2026-11-28|82|2026-12-12|-") });
  const ledger = { d: "2026-11-28", sha256: sha(root), text: root, sig: s.signRoot("2026-11-28", sha(root)) };
  assert.deepEqual(await verifyRootSig(ledger, keyOf(s)), { state: "OK", kid: s.kid, d: "2026-11-28" });
  assert.equal((await verifyRootSig({ ...ledger, sha256: sha("other") }, keyOf(s))).state, "BAD", "another root");
  assert.equal((await verifyRootSig({ ...ledger, d: "2026-11-29" }, keyOf(s))).state, "BAD", "another day");
  const other = radarSigner(`${SECRET}-copy`);
  assert.equal((await verifyRootSig({ ...ledger, sig: other.signRoot(ledger.d, ledger.sha256) }, keyOf(s))).state, "OTHER_KEY", "a copy signs with its own key");
  const forged = { ...ledger.sig, kid: s.kid, b64: other.signRoot(ledger.d, ledger.sha256).b64 };
  assert.equal((await verifyRootSig({ ...ledger, sig: forged }, keyOf(s))).state, "BAD", "another key's signature under this key's id");
  assert.equal((await verifyRootSig({ ...ledger, sig: null }, keyOf(s))).state, "NO_SIG");
  assert.equal((await verifyRootSig(ledger, null)).state, "NO_KEY");
  assert.equal((await verifyRootSig(ledger, { ...keyOf(s), kid: other.kid })).state, "NO_KEY", "a key whose id is not its own fingerprint");
  assert.equal(rootMessage("2026-11-28", "ab"), "likelink2-radar|root|v1|2026-11-28|ab");
});

test("only a well-formed signature and key are kept", () => {
  const s = radarSigner(SECRET);
  const sig = s.signRoot("2026-11-28", sha("x"));
  assert.deepEqual(cleanSig(sig), sig);
  assert.equal(cleanSig({ ...sig, alg: "RS256" }), null);
  assert.equal(cleanSig({ ...sig, kid: "<script>" }), null);
  assert.equal(cleanSig({ ...sig, b64: sig.b64.slice(4) }), null);
  assert.equal(cleanKey({ alg: "Ed25519", kid: s.kid, pub: `${s.pub}x` }), null);
  assert.equal(cleanKey({ ...keyOf(s), since: "x" }).since, null);
});

test("the board and the locked copy keep the root's signature; a malformed one is dropped", () => {
  const s = radarSigner(SECRET);
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
