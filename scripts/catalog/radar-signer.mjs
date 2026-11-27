// ✍️ The radar's signing key, on the runner only (src/lib/growth/radarSign.js).
// The 32-byte Ed25519 seed is SHA-256 over a fixed label and the run's own machine secret
// (AUTOPILOT_SECRET), so the key exists only where that secret exists, is the same every morning, and
// is never stored, uploaded or printed; the encrypted state's key uses another label, so the two are
// independent. Only the public half and the key's id are printed.
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { rootMessage, SIGN } from "../../src/lib/growth/radarSign.js";

export const SIGN_LABEL = "likelink2 radar signing key v1\n";
// PKCS#8 wrapper of a raw Ed25519 seed (RFC 8410).
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

/** The signer for this run, or null without a secret long enough to make a key from. */
export function radarSigner(secret) {
  const s = typeof secret === "string" ? secret.trim() : "";
  if (s.length < 16) return null;
  const seed = createHash("sha256").update(SIGN_LABEL + s).digest();
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
  const raw = createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(-32);
  const pub = raw.toString("base64");
  const kid = createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return {
    kid,
    pub,
    signRoot(d, sha256) {
      return { alg: SIGN.alg, kid, b64: sign(null, Buffer.from(rootMessage(d, sha256)), priv).toString("base64") };
    },
  };
}
