// ✍️ The radar's published public key (radarSign.js). The private half is a random seed kept only in
// the radar's encrypted state (scripts/catalog/radar-signer.mjs); it is never uploaded in the clear
// or printed. The first signed main run prints this key's id and public half in its log ("radar key
// …"); it is pinned
// here and in public/radar-key.json (a test keeps the two equal). Until it is pinned, the page shows
// no signature line. A new key (the state lost or replaced) is a new entry with its own day, never
// an edit of an old one.
export const RADAR_KEY = null;
