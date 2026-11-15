// The radar's seal in Bitcoin (src/lib/growth/radarSeal.js): a detached OpenTimestamps proof in the
// reference client's format, so opentimestamps.org can verify it; only a 32-byte hash is ever sent.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

test("a proof is the reference header, the sha256 digest and the calendar's answer", async () => {
  const { OTS_MAGIC, OTS_CALENDARS, otsProof, otsDigest, toBase64, fromBase64 } = await import("../src/lib/growth/radarSeal.js");
  assert.equal(Buffer.from(OTS_MAGIC).toString("latin1"), "\u0000OpenTimestamps\u0000\u0000Proof\u0000¿\u0089âè\u0084è\u0092\u0094");
  assert.ok(OTS_CALENDARS.every((u) => /^https:\/\/[ab]\.pool\.opentimestamps\.org$/.test(u)), "only the public free calendars");
  const sha = createHash("sha256").update("tofu-squishy|2026-11-15|world,demand,supply").digest("hex");
  const answer = Uint8Array.from([0xf0, 0x10, 1, 2, 3, 0x08]);
  const proof = otsProof(sha, answer);
  assert.equal(proof.length, OTS_MAGIC.length + 2 + 32 + answer.length);
  assert.deepEqual([...proof.slice(OTS_MAGIC.length, OTS_MAGIC.length + 2)], [0x01, 0x08], "version 1, SHA256");
  assert.equal(otsDigest(proof), sha, "the proof commits to exactly the seal");
  assert.deepEqual([...proof.slice(-answer.length)], [...answer]);
  assert.equal(otsDigest(fromBase64(toBase64(proof))), sha, "survives the board's base64");
  assert.equal(otsProof("nope", answer), null);
  assert.equal(otsProof(sha, new Uint8Array(0)), null, "an empty answer is no proof");
  assert.equal(otsProof(sha, "text"), null);
  assert.equal(otsDigest(Uint8Array.from([1, 2, 3])), null);
});

test("the board keeps only proofs from the two calendars, and only sealed-call text", async () => {
  const { sanitizeBoard } = await import("../src/lib/growth/radarBoard.js");
  const sha = "a".repeat(64);
  const b = sanitizeBoard({ at: "2026-11-15T05:37:00Z", record: {}, concepts: [], early: { need: 3, record: {}, seal: { d: "2026-11-15", sha256: sha, count: 1, text: "tofu-squishy|2026-11-15|demand,world", ots: [{ cal: "a.pool.opentimestamps.org", b64: "AE9wZW5UaW1lc3RhbXBz" }, { cal: "evil.example", b64: "AAAA" }, { cal: "b.pool.opentimestamps.org", b64: "<script>" }] } } });
  assert.deepEqual(b.early.seal.ots, [{ cal: "a.pool.opentimestamps.org", b64: "AE9wZW5UaW1lc3RhbXBz" }]);
  assert.equal(b.early.seal.text, "tofu-squishy|2026-11-15|demand,world");
  const bad = sanitizeBoard({ at: "2026-11-15T05:37:00Z", record: {}, concepts: [], early: { need: 3, record: {}, seal: { d: "2026-11-15", sha256: sha, count: 1, text: "<img src=x onerror=alert(1)>" } } });
  assert.equal(bad.early.seal.text, null);
});
