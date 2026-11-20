// From "sealed" to "anchored in Bitcoin block #N" (src/lib/growth/otsUpgrade.js; the owner, 20.11).
// A proof built byte by byte the way the public calendars build them: the stored proof ends in a
// pending attestation; the calendar's answer continues the path to a Bitcoin block header
// attestation; the anchor counts only when the root equals the block's own Merkle root.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BITCOIN_TAG, PENDING_TAG, anchorProof, anchorsBoard, bitcoinOf, parseOts, pendingOf, rootMatches, spliceUpgrade, toHex } from "../src/lib/growth/otsUpgrade.js";
import { OTS_MAGIC, hexBytes, toBase64 } from "../src/lib/growth/radarSeal.js";
import { sanitizeBoard } from "../src/lib/growth/radarBoard.js";
import { teaserBoard } from "../src/lib/growth/radarGate.js";

const sha256 = (b) => new Uint8Array(createHash("sha256").update(b).digest());
const cat = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]));
const vb = (bytes) => cat([bytes.length], bytes);
const CAL = "https://cal.example.org";
const digest = sha256(new TextEncoder().encode("early=…\nprices=…"));
const nonce = hexBytes("c112f5a98b157c70");
const left = hexBytes("11".repeat(32));
const m1 = sha256(cat(digest, nonce));
const m2 = sha256(cat(left, m1));
const HEIGHT = 925_123;
const BLOCK = "00000000000000000001" + "ab".repeat(22);

// The stored proof: magic, version, sha256, digest, append(nonce), sha256, pending(CAL).
const stored = cat(OTS_MAGIC, [0x01, 0x08], digest, [0xf0], vb(nonce), [0x08], [0x00], hexBytes(PENDING_TAG), vb(vb(new TextEncoder().encode(CAL))));
// The calendar's answer for m1: prepend(left), sha256, bitcoin(height) — 925123 as a varuint.
const varuint = (n) => { const out = []; do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n); return out; };
const answer = cat([0xf1], vb(left), [0x08], [0x00], hexBytes(BITCOIN_TAG), vb(varuint(HEIGHT)));

const fakeFetch = ({ calendar = 200, root = toHex(m2.slice().reverse()) } = {}) => async (url) => {
  const u = String(url);
  if (u === `${CAL}/timestamp/${toHex(m1)}`) return { ok: calendar === 200, status: calendar, arrayBuffer: async () => answer.buffer.slice(answer.byteOffset, answer.byteOffset + answer.length) };
  if (u === `https://mempool.space/api/block-height/${HEIGHT}`) return { ok: true, status: 200, text: async () => BLOCK };
  if (u === `https://mempool.space/api/block/${BLOCK}`) return { ok: true, status: 200, json: async () => ({ merkle_root: root, timestamp: 1763600000 }) };
  return { ok: false, status: 404 };
};

test("reads a stored proof: the digest, and the pending attestation with its commitment", () => {
  const p = parseOts(stored, sha256);
  assert.equal(toHex(p.digest), toHex(digest));
  const [pend] = pendingOf(p.root);
  assert.equal(pend.url, CAL);
  assert.equal(toHex(pend.msg), toHex(m1));
  assert.equal(pend.alone, true);
  assert.equal(parseOts(stored.slice(0, -3), sha256), null, "a cut proof is unreadable, never half-read");
});

test("the calendar's answer spliced in: the path arrives at the Bitcoin block's Merkle root", () => {
  const p = parseOts(stored, sha256);
  const up = spliceUpgrade(stored, pendingOf(p.root)[0], answer);
  const again = parseOts(up, sha256);
  const [btc] = bitcoinOf(again.root);
  assert.equal(btc.height, HEIGHT);
  assert.equal(toHex(btc.merkleRoot), toHex(m2));
  assert.equal(rootMatches(m2, toHex(m2.slice().reverse())), true, "explorers print the root byte-reversed");
  assert.equal(rootMatches(m2, toHex(m2)), false);
});

test("anchor: ANCHORED only when the block's own Merkle root matches; PENDING while the calendar waits", async () => {
  const ok = await anchorProof(stored, { sha256, fetchImpl: fakeFetch(), toBase64 });
  assert.equal(ok.state, "ANCHORED");
  assert.equal(ok.height, HEIGHT);
  assert.equal(ok.block, BLOCK);
  assert.equal(ok.time, 1763600000);
  const complete = parseOts(new Uint8Array(Buffer.from(ok.b64, "base64")), sha256);
  assert.equal(bitcoinOf(complete.root)[0].height, HEIGHT, "the complete proof to download carries the block");
  assert.equal((await anchorProof(stored, { sha256, fetchImpl: fakeFetch({ root: "00".repeat(32) }), toBase64 })).state, "ROOT_MISMATCH", "the calendar alone is never trusted");
  assert.equal((await anchorProof(stored, { sha256, fetchImpl: fakeFetch({ calendar: 404 }), toBase64 })).state, "PENDING");
});

test("the board: newest anchored days first, the waiting ones counted; the sanitizer and the teaser keep them", () => {
  const roots = {
    "2026-11-18": { sha256: "a".repeat(64), anchor: { height: 925000, block: BLOCK, time: 1763500000, b64: "AAA=" } },
    "2026-11-19": { sha256: "b".repeat(64), anchor: { height: 925123, block: BLOCK, time: 1763600000, b64: "AAA=" } },
    "2026-11-20": { sha256: "c".repeat(64), ots: [] },
  };
  const a = anchorsBoard(roots);
  assert.deepEqual(a.list.map((x) => x.d), ["2026-11-19", "2026-11-18"]);
  assert.equal(a.pending, 1);
  const clean = sanitizeBoard({ concepts: [], at: "2026-11-20T07:15:31Z", record: { calls: 0 }, anchors: { ...a, list: [...a.list, { d: "2026-11-17", sha256: "d".repeat(64), height: 1, block: "<script>", b64: "x" }] } });
  assert.deepEqual(clean.anchors.list.map((x) => x.height), [925123, 925000], "a block that is not 64 hex is dropped");
  assert.deepEqual(teaserBoard({ anchors: a }).anchors, a, "public behind the lock: block numbers and roots name no call");
});

test("wiring: the radar run upgrades past days and the page links each block", () => {
  const run = readFileSync("scripts/catalog/trend-radar.mjs", "utf8");
  assert.match(run, /anchorProof\(fromBase64\(o\.b64\)/);
  assert.match(run, /board\.anchors = anchorsBoard\(roots\)/);
  const page = readFileSync("src/components/discover/radar.jsx", "utf8");
  assert.match(page, /https:\/\/mempool\.space\/block\/\$\{a\.block\}/);
});
