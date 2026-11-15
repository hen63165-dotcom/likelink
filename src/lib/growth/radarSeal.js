// The radar's seal, anchored where nobody can move it (the owner, 2026-11-15: "make it the one tool
// in the world that…"). Exploding Topics and Glimpse publish backtested or self-reported accuracy;
// the radar publishes every early call before it is graded, and each day's fingerprint of all calls
// (sealOf) is sent to the free public OpenTimestamps calendars, which commit it to Bitcoin within
// hours. The proof (.ots) lets anyone check, at opentimestamps.org, that the calls existed on that
// day: not even LikeLink2 can backdate one. Only the 32-byte hash leaves the runner, never a call.
// Pure (Uint8Array only, isomorphic); the runner does the POST.

export const OTS_CALENDARS = Object.freeze(["https://a.pool.opentimestamps.org", "https://b.pool.opentimestamps.org"]);
// The detached-proof header of the reference client (opentimestamps-client, DetachedTimestampFile):
// magic, major version 1, the file hash op (0x08 = SHA256), then the digest and the calendar's timestamp.
const MAGIC_HEX = "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294";
const hexBytes = (hex) => Uint8Array.from(String(hex).match(/../g) || [], (h) => parseInt(h, 16));
export const OTS_MAGIC = hexBytes(MAGIC_HEX);

/** A pending .ots proof for one sha256 digest from one calendar's answer (null when either is unusable). */
export function otsProof(digestHex, calendarBytes) {
  if (!/^[0-9a-f]{64}$/.test(String(digestHex || ""))) return null;
  const body = calendarBytes instanceof Uint8Array ? calendarBytes : null;
  if (!body || body.length < 2 || body.length > 10_000) return null;
  const out = new Uint8Array(OTS_MAGIC.length + 2 + 32 + body.length);
  out.set(OTS_MAGIC, 0);
  out.set([0x01, 0x08], OTS_MAGIC.length);
  out.set(hexBytes(digestHex), OTS_MAGIC.length + 2);
  out.set(body, OTS_MAGIC.length + 34);
  return out;
}

/** The digest a proof commits to (null when it is not a sha256 detached proof). */
export function otsDigest(proof) {
  if (!(proof instanceof Uint8Array) || proof.length < OTS_MAGIC.length + 34) return null;
  for (let i = 0; i < OTS_MAGIC.length; i++) if (proof[i] !== OTS_MAGIC[i]) return null;
  if (proof[OTS_MAGIC.length] !== 0x01 || proof[OTS_MAGIC.length + 1] !== 0x08) return null;
  return [...proof.slice(OTS_MAGIC.length + 2, OTS_MAGIC.length + 34)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const toBase64 = (bytes) => (typeof Buffer !== "undefined" ? Buffer.from(bytes).toString("base64") : btoa(String.fromCharCode(...bytes)));
export const fromBase64 = (b64) => (typeof Buffer !== "undefined" ? new Uint8Array(Buffer.from(String(b64), "base64")) : Uint8Array.from(atob(String(b64)), (c) => c.charCodeAt(0)));
export { hexBytes };
