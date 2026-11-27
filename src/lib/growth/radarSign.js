// ✍️ The radar's own signature on every day's root (the owner, 27.11: "make sure it cannot be copied,
// not by the strongest programmer or the cleverest hacker in the world").
// The code is public and can be copied; the radar's word cannot. Bitcoin already proves WHEN a root
// existed (OpenTimestamps, radarLedger.js); this proves WHO said it: every morning the run signs
// `likelink2-radar|root|v1|<day>|<root sha256>` with an Ed25519 key that exists only on the runner
// (derived there from the run's own machine secret, never stored, never logged — scripts/catalog/
// radar-signer.mjs), and only its public key is published (radarKey.js, /radar-key.json). A copy of
// the code makes another key; a copy of the board cannot be signed again under this one; a copied
// root sealed later in Bitcoin loses to the earlier seal. Anyone checks it in their own browser
// (Web Crypto) with nothing to trust but the published key. Pure; browser-safe; tested.

export const SIGN = Object.freeze({ alg: "Ed25519", v: 1 });

const SHA = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KID = /^[0-9a-f]{16}$/;
const SIG64 = /^[A-Za-z0-9+/]{86}==$/;
const PUB32 = /^[A-Za-z0-9+/]{43}=$/;

/** The exact text that is signed for a day's root. */
export function rootMessage(d, sha256) {
  return `likelink2-radar|root|v${SIGN.v}|${d}|${sha256}`;
}

/** A signature as it may reach the board: the algorithm, the key's id and the 64-byte signature in base64. */
export function cleanSig(s) {
  if (!s || typeof s !== "object" || s.alg !== SIGN.alg || !KID.test(String(s.kid || "")) || !SIG64.test(String(s.b64 || ""))) return null;
  return { alg: SIGN.alg, kid: s.kid, b64: s.b64 };
}

/** A published key: { alg, kid, pub (32 bytes, base64), since }; null unless every field is well formed. */
export function cleanKey(k) {
  if (!k || typeof k !== "object" || k.alg !== SIGN.alg || !KID.test(String(k.kid || "")) || !PUB32.test(String(k.pub || ""))) return null;
  return { alg: SIGN.alg, kid: k.kid, pub: k.pub, since: DAY.test(String(k.since || "")) ? k.since : null };
}

const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The key's id: the first 16 hex of SHA-256 over its 32 raw bytes (so a key is named by itself). */
export async function keyIdOf(pubB64) {
  return hex(await globalThis.crypto.subtle.digest("SHA-256", fromB64(pubB64))).slice(0, 16);
}

/**
 * The day's root checked against the published key, in the visitor's own browser.
 * state: OK (the signature is this key's, over this day's root) · BAD (it is not) · OTHER_KEY (signed
 * by a key other than the published one) · NO_SIG · NO_KEY · UNSUPPORTED (this browser has no Ed25519).
 */
export async function verifyRootSig(ledger, key) {
  const k = cleanKey(key);
  const sig = cleanSig(ledger?.sig);
  if (!k) return { state: "NO_KEY" };
  if (!sig || !SHA.test(String(ledger?.sha256 || "")) || !DAY.test(String(ledger?.d || ""))) return { state: "NO_SIG", kid: k.kid };
  if ((await keyIdOf(k.pub)) !== k.kid) return { state: "NO_KEY" };
  if (sig.kid !== k.kid) return { state: "OTHER_KEY", kid: sig.kid, published: k.kid };
  let pub;
  try {
    pub = await globalThis.crypto.subtle.importKey("raw", fromB64(k.pub), { name: "Ed25519" }, false, ["verify"]);
  } catch {
    return { state: "UNSUPPORTED", kid: k.kid };
  }
  const ok = await globalThis.crypto.subtle.verify({ name: "Ed25519" }, pub, fromB64(sig.b64), new TextEncoder().encode(rootMessage(ledger.d, ledger.sha256)));
  return { state: ok ? "OK" : "BAD", kid: k.kid, d: ledger.d };
}
