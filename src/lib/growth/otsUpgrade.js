// From "sealed" to "anchored in Bitcoin block #N" (the owner, 20.11: "that ChatGPT checks it and says
// yes"). The radar's seals (radarSeal.js) are OpenTimestamps proofs that end in a calendar's *pending*
// attestation: a promise that the calendar will commit the hash to Bitcoin. A few hours later the
// calendar answers `GET <calendar>/timestamp/<commitment>` with the rest of the path, which ends in a
// Bitcoin block header attestation. This module reads a detached .ots proof, finds the pending
// attestations, splices in the calendar's answer (the reference client's upgrade), and reads the
// Bitcoin block height and the Merkle root the path arrives at. The runner then compares that root
// with the block's own Merkle root from a public block explorer, so the anchor shown on /radar is a
// fact anyone can recompute: the day's ledger is inside block #N, mined at time T.
// Pure: Uint8Array in and out, sha256 is passed in (node:crypto in the runner). Supports the ops the
// public calendars use (sha256, append, prepend, reverse); any other op makes the proof unreadable here.
import { OTS_MAGIC, hexBytes } from "./radarSeal.js";

export const PENDING_TAG = "83dfe30d2ef90c8e";
export const BITCOIN_TAG = "0588960d73d71901";
const MAX_DEPTH = 512;

export const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const concat = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; };

function readVaruint(b, p) {
  let v = 0, shift = 0, byte;
  do {
    if (p >= b.length || shift > 49) throw new Error("varuint");
    byte = b[p++];
    v += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return [v, p];
}
function readVarbytes(b, p, max = 8192) {
  const [n, q] = readVaruint(b, p);
  if (n > max || q + n > b.length) throw new Error("varbytes");
  return [b.slice(q, q + n), q + n];
}

function applyOp(tag, arg, msg, sha256) {
  if (tag === 0x08) return sha256(msg);
  if (tag === 0xf0) return concat(msg, arg);
  if (tag === 0xf1) return concat(arg, msg);
  if (tag === 0xf2) return msg.slice().reverse();
  return null;
}

/** One timestamp node (the reference format): its message, attestations (with byte spans) and ops. */
export function parseTimestamp(b, p, msg, sha256, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error("depth");
  const node = { msg, attestations: [], ops: [] };
  const one = (tag, q) => {
    if (tag === 0x00) {
      const start = q - 1;
      if (q + 8 > b.length) throw new Error("attestation");
      const t = toHex(b.slice(q, q + 8));
      const [payload, r] = readVarbytes(b, q + 8);
      node.attestations.push({ tag: t, payload, start, end: r });
      return r;
    }
    let arg = null;
    let r = q;
    if (tag === 0xf0 || tag === 0xf1) [arg, r] = readVarbytes(b, q, 4096);
    const next = applyOp(tag, arg, msg, sha256);
    if (!next) throw new Error(`op 0x${tag.toString(16)}`);
    const child = parseTimestamp(b, r, next, sha256, depth + 1);
    node.ops.push({ tag, arg, child: child.node });
    return child.pos;
  };
  if (p >= b.length) throw new Error("truncated");
  let tag = b[p++];
  while (tag === 0xff) {
    if (p >= b.length) throw new Error("truncated");
    p = one(b[p], p + 1);
    if (p >= b.length) throw new Error("truncated");
    tag = b[p++];
  }
  p = one(tag, p);
  return { node, pos: p };
}

/** A detached proof → { digest, root } (null when it is not a sha256 detached proof this module reads). */
export function parseOts(file, sha256) {
  if (!(file instanceof Uint8Array) || file.length < OTS_MAGIC.length + 35) return null;
  for (let i = 0; i < OTS_MAGIC.length; i++) if (file[i] !== OTS_MAGIC[i]) return null;
  if (file[OTS_MAGIC.length] !== 0x01 || file[OTS_MAGIC.length + 1] !== 0x08) return null;
  const digest = file.slice(OTS_MAGIC.length + 2, OTS_MAGIC.length + 34);
  try {
    const { node, pos } = parseTimestamp(file, OTS_MAGIC.length + 34, digest, sha256);
    return pos === file.length ? { digest, root: node } : null;
  } catch { return null; }
}

const walk = (node, fn) => { fn(node); for (const o of node.ops) walk(o.child, fn); };

/** Pending attestations: the calendar URL, the commitment to ask about, and whether it can be spliced. */
export function pendingOf(root) {
  const out = [];
  walk(root, (n) => {
    for (const a of n.attestations) {
      if (a.tag !== PENDING_TAG) continue;
      try {
        const [uri] = readVarbytes(a.payload, 0, 1000);
        const url = new TextDecoder().decode(uri);
        if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) continue;
        out.push({ url, msg: n.msg, start: a.start, end: a.end, alone: n.attestations.length === 1 && n.ops.length === 0 });
      } catch { /* an unreadable attestation is skipped */ }
    }
  });
  return out;
}

/** Bitcoin block header attestations: the block height and the Merkle root the path arrives at. */
export function bitcoinOf(root) {
  const out = [];
  walk(root, (n) => {
    for (const a of n.attestations) {
      if (a.tag !== BITCOIN_TAG) continue;
      try {
        const [height] = readVaruint(a.payload, 0);
        if (n.msg.length === 32 && height > 0) out.push({ height, merkleRoot: n.msg });
      } catch { /* skipped */ }
    }
  });
  return out;
}

/** The proof with one pending attestation replaced by the calendar's answer (a timestamp of the same commitment). */
export function spliceUpgrade(file, pending, answer) {
  if (!pending?.alone || !(answer instanceof Uint8Array) || !answer.length) return null;
  const out = new Uint8Array(file.length - (pending.end - pending.start) + answer.length);
  out.set(file.slice(0, pending.start), 0);
  out.set(answer, pending.start);
  out.set(file.slice(pending.end), pending.start + answer.length);
  return out;
}

/**
 * The Merkle root a block explorer gives (RPC hex, byte-reversed) matches the root the proof arrives at.
 * Bitcoin serialises hashes little-endian; explorers print them reversed.
 */
export function rootMatches(merkleRoot, explorerHex) {
  if (!(merkleRoot instanceof Uint8Array) || merkleRoot.length !== 32 || !/^[0-9a-f]{64}$/.test(String(explorerHex || ""))) return false;
  return toHex(merkleRoot.slice().reverse()) === explorerHex;
}

/**
 * Upgrade one stored proof and verify its anchor. `fetchImpl` reaches the calendar and the explorer;
 * returns { state, ... }: ANCHORED (height, block, time, b64 of the complete proof), PENDING (the
 * calendar has not reached Bitcoin yet), or an error state. Never trusts the calendar alone: the root
 * must equal the block's own Merkle root.
 */
export async function anchorProof(fileBytes, { sha256, fetchImpl, explorer = "https://mempool.space/api", toBase64 }) {
  const parsed = parseOts(fileBytes, sha256);
  if (!parsed) return { state: "UNREADABLE" };
  let file = fileBytes;
  let found = bitcoinOf(parsed.root);
  if (!found.length) {
    for (const p of pendingOf(parsed.root).filter((x) => x.alone)) {
      let res;
      try {
        res = await fetchImpl(`${p.url}/timestamp/${toHex(p.msg)}`, { headers: { Accept: "application/vnd.opentimestamps.v1" }, signal: AbortSignal.timeout(20_000) });
      } catch { continue; }
      if (res.status === 404) continue;
      if (!res.ok) continue;
      const answer = new Uint8Array(await res.arrayBuffer());
      const next = spliceUpgrade(file, p, answer);
      const again = next ? parseOts(next, sha256) : null;
      if (!again) continue;
      file = next;
      found = bitcoinOf(again.root);
      if (found.length) break;
    }
  }
  if (!found.length) return { state: "PENDING" };
  const { height, merkleRoot } = found[0];
  try {
    const hRes = await fetchImpl(`${explorer}/block-height/${height}`, { signal: AbortSignal.timeout(20_000) });
    const block = hRes.ok ? (await hRes.text()).trim() : "";
    if (!/^[0-9a-f]{64}$/.test(block)) return { state: "EXPLORER_ERROR", height };
    const bRes = await fetchImpl(`${explorer}/block/${block}`, { signal: AbortSignal.timeout(20_000) });
    const info = bRes.ok ? await bRes.json() : null;
    if (!rootMatches(merkleRoot, info?.merkle_root)) return { state: "ROOT_MISMATCH", height, block };
    return { state: "ANCHORED", height, block, time: Number(info.timestamp) || null, b64: toBase64(file) };
  } catch { return { state: "EXPLORER_ERROR", height }; }
}

export { hexBytes };

/** The board's anchors: the latest days whose ledger root is verified inside a Bitcoin block, newest first. */
export function anchorsBoard(roots = {}, { max = 10 } = {}) {
  const days = Object.keys(roots || {}).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
  const list = days
    .map((d) => ({ d, r: roots[d] }))
    .filter(({ r }) => r?.anchor && /^[0-9a-f]{64}$/.test(String(r.sha256 || "")) && /^[0-9a-f]{64}$/.test(String(r.anchor.block || "")) && Number(r.anchor.height) > 0)
    .slice(0, max)
    .map(({ d, r }) => ({ d, sha256: r.sha256, height: Number(r.anchor.height), block: r.anchor.block, time: Number(r.anchor.time) || null, b64: r.anchor.b64 || null }));
  const pending = days.filter((d) => roots[d] && !roots[d].anchor).length;
  return { list, pending, since: days.length ? days[days.length - 1] : null };
}
