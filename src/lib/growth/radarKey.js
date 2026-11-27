// ✍️ The radar's published public key (radarSign.js). The private half exists only on the radar's
// runner, derived there each morning from the run's machine secret; it is never stored or printed.
// The first signed run prints this key's id and public half in its log ("radar key …"); it is pinned
// here and in public/radar-key.json (a test keeps the two equal). Until it is pinned, the page shows
// no signature line. A new key (the machine secret changed) is a new entry with its own day, never
// an edit of an old one.
export const RADAR_KEY = null;
