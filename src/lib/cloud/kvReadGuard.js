// kv read-failure guard — "never write back what you could not read".
//
// Every server-side kv helper returns a fallback ([] / {} / null) when a read
// fails, and many callers then write a whole array/object back. A single
// Supabase timeout used to replace the catalog, the click ledger or every
// creator's autopilot config with that empty fallback.
//
// The rule enforced here: when a read of key K fails (network error, non-OK
// status, non-array body, corrupt JSON), K is marked. Any write of K is then
// refused (throws KvReadFailedError) until a later read of K succeeds.
// A genuinely missing row is NOT a failure — first-time writes still work.
//
// Isomorphic and dependency-free: imported by api/* and src/lib/cloud/*.
// Marks expire after READ_FAIL_TTL_MS so a warm serverless instance never
// blocks a key forever.

const READ_FAIL_TTL_MS = 5 * 60 * 1000;
const failedReads = new Map();

export class KvReadFailedError extends Error {
  constructor(key) {
    super(`kv_read_failed:${key}`);
    this.name = "KvReadFailedError";
    this.code = "kv_read_failed";
    this.key = key;
  }
}

export function noteKvReadFailed(key) {
  failedReads.set(String(key), Date.now());
}

export function noteKvReadOk(key) {
  failedReads.delete(String(key));
}

export function assertKvWritable(key) {
  const k = String(key);
  const at = failedReads.get(k);
  if (at === undefined) return;
  if (Date.now() - at > READ_FAIL_TTL_MS) {
    failedReads.delete(k);
    return;
  }
  throw new KvReadFailedError(k);
}

export function isKvReadFailure(err) {
  return Boolean(err && (err.code === "kv_read_failed" || err instanceof KvReadFailedError));
}

/**
 * Strictly read one kv row from a Supabase REST response.
 * Returns { found:false } for a missing row and { found:true, value } for a
 * present one; marks the key and returns { failed:true } on any failure.
 */
export async function readKvResponse(key, res) {
  try {
    if (!res || !res.ok) { noteKvReadFailed(key); return { failed: true }; }
    const rows = await res.json();
    if (!Array.isArray(rows)) { noteKvReadFailed(key); return { failed: true }; }
    const raw = rows[0]?.value;
    if (raw === undefined || raw === null || raw === "") { noteKvReadOk(key); return { found: false }; }
    let value = JSON.parse(raw);
    // LEGACY: unwrap double-serialized JSON strings.
    while (typeof value === "string" && value.length > 0) {
      try { value = JSON.parse(value); } catch { break; }
    }
    noteKvReadOk(key);
    return { found: true, value };
  } catch {
    noteKvReadFailed(key);
    return { failed: true };
  }
}

/** Test hook: forget every mark. */
export function _resetKvReadGuard() {
  failedReads.clear();
}
