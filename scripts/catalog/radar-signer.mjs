// ✍️ The radar's signing key, on the runner only (src/lib/growth/radarSign.js).
// The 32-byte Ed25519 seed is random, made once by the first main run and kept only inside the
// radar's encrypted state (sign-key.json → state.enc, AES-256-GCM); it is never uploaded in the
// clear, logged or printed. A random seed, not one derived from a secret: a published public key
// derived from a secret would let anyone test guesses of that secret offline. Only the key's id and
// public half are printed. Branch runs never make or use a key (their board is a preview).
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign } from "node:crypto";
import { rootMessage, SIGN } from "../../src/lib/growth/radarSign.js";

export const KEY_FILE = "sign-key.json";
// PKCS#8 wrapper of a raw Ed25519 seed (RFC 8410).
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

function fromSeed(seed) {
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
  const raw = createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(-32);
  return { priv, pub: raw.toString("base64"), kid: createHash("sha256").update(raw).digest("hex").slice(0, 16) };
}

/** A new key document for the encrypted state: { v, alg, kid, pub, seed, since }. */
export function newSigningKey(day, { random = randomBytes } = {}) {
  const seed = random(32);
  const { pub, kid } = fromSeed(seed);
  return { v: 1, alg: SIGN.alg, kid, pub, seed: seed.toString("base64"), since: day };
}

/** The signer for a stored key document, or null when the document is not a whole, consistent key. */
export function radarSigner(doc) {
  if (!doc || typeof doc !== "object" || typeof doc.seed !== "string") return null;
  const seed = Buffer.from(doc.seed, "base64");
  if (seed.length !== 32) return null;
  const { priv, pub, kid } = fromSeed(seed);
  if (doc.kid !== kid || doc.pub !== pub) return null;
  return {
    kid,
    pub,
    signRoot(d, sha256) {
      return { alg: SIGN.alg, kid, b64: sign(null, Buffer.from(rootMessage(d, sha256)), priv).toString("base64") };
    },
  };
}
