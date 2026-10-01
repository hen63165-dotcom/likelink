// What the Studio may say about one reel — derived only from the publishing
// ledger (publish:ledger, written by runPublishingSweep after reading every
// surface back). Pure, isomorphic.
//
//   media   GENERATED → STORED → PUBLICATION_READY → PUBLISHED → VERIFIED | BLOCKED
//   source  NATIVE | PROVIDER  (+ SYNTHETIC for every render) (+ EXTERNAL once a provider id exists)
//   truth   VERIFIED (read back < STALE_MS ago) | OBSERVED (exists, not yet read back) | STALE | BLOCKED
//
// Green is allowed only for truth VERIFIED. An external post counts only with
// the provider's own id.

export const STALE_MS = 24 * 60 * 60 * 1000;
const NATIVE_PROVIDER = "likelink_native_render";
const arr = (v) => (Array.isArray(v) ? v : []);

export function reelStudioStatus(reel, entry, now = Date.now()) {
  const native = !reel?.provider || reel.provider === NATIVE_PROVIDER || /^likelink_/.test(String(reel?.source || ""));
  const external = arr(entry?.external)
    .filter((x) => x?.providerId)
    .map((x) => ({ destination: x.destination, providerId: x.providerId, status: x.status }));
  const source = [native ? "NATIVE" : "PROVIDER"];
  if (reel?.truth === "SYNTHETIC_ANIMATION" || native) source.push("SYNTHETIC");
  if (external.length) source.push("EXTERNAL");
  const needs = arr(entry?.external).filter((x) => !x?.providerId).map((x) => ({ destination: x.destination, status: x.status }));
  const base = { source, external, externalMissing: needs, verifiedOn: arr(entry?.verified), checkedAt: entry?.checkedAt || null };

  if (!reel?.videoUrl) return { ...base, media: "GENERATED", truth: "OBSERVED" };
  if (!entry || entry.state === "PENDING_CHECK" || !entry.checkedAt) {
    // Ingest already read the file back with the anon key; publication not checked yet.
    return { ...base, media: reel.audio === "aac" ? "PUBLICATION_READY" : "STORED", truth: "OBSERVED" };
  }
  if (entry.state === "BLOCKED") return { ...base, media: "BLOCKED", truth: "BLOCKED", reason: entry.blockedReason || null };
  const age = now - Date.parse(entry.checkedAt);
  if (entry.state === "VERIFIED" && base.verifiedOn.length) {
    return { ...base, media: "VERIFIED", truth: age > STALE_MS ? "STALE" : "VERIFIED" };
  }
  return { ...base, media: "PUBLISHED", truth: age > STALE_MS ? "STALE" : "OBSERVED" };
}
