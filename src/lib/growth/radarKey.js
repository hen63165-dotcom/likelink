// ✍️ The radar's published public key (radarSign.js). The private half is a random seed kept only in
// the radar's encrypted state (scripts/catalog/radar-signer.mjs); it is never uploaded in the clear
// or printed. The first signed main run prints this key's id and public half in its log ("radar key
// …"); it is pinned
// here and in public/radar-key.json (a test keeps the two equal). Until it is pinned, the page shows
// no signature line. A new key (the state lost or replaced) is a new entry with its own day, never
// an edit of an old one.
// Pinned 27.11 from main run 46071690554 ("radar key 8bf2d5afd249affc: …", the root of 2026-11-27
// signed and checked against this key with radarSign.verifyRootSig: OK; a changed root: BAD).
export const RADAR_KEY = Object.freeze({ alg: "Ed25519", kid: "8bf2d5afd249affc", pub: "4oMcOPLvIm7cQy+BLSTx41xox397CuEkvCloqZuI/tw=", since: "2026-11-27" });
