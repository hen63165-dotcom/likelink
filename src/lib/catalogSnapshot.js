/**
 * Catalog snapshot — the storefront keeps working when the cloud does not.
 *
 * public/snapshot/kv.json holds a copy of the public storefront rows (products
 * the public site lists, the creators' public profiles, recorded click/view
 * events), taken from the same `kv` table, with the time it was taken. When a
 * live read of one of those keys fails (the cloud is down, restricted or
 * unreachable), storage.get serves the copy instead of an empty site.
 *
 * Rules:
 *   • Only after a FAILED read. A live answer always wins, even an empty one.
 *   • A key served from the snapshot is read-only for this visit: it never
 *     becomes a write (the same rule as kvReadGuard on the server).
 *   • Media served by our own cloud (the media proxy, Supabase Storage) is
 *     unreachable in the same outage, so it is dropped from snapshot rows
 *     instead of rendering broken players.
 *   • The site says it is showing a copy, and from when (snapshotTakenAt).
 */

// Under the site's base path, so the GitHub Pages mirror (/likelink/) finds it too.
const BASE = String((typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/").replace(/\/+$/, "");
export const SNAPSHOT_URL = `${BASE}/snapshot/kv.json`;

export const SNAPSHOT_KEYS = Object.freeze(["marketplace:products", "marketplace:marketers", "marketplace:clicks", "marketplace:collections", "marketplace:videos"]);

const KEYS = new Set(SNAPSHOT_KEYS);
const served = new Set();
let pending = null;
let takenAt = null;

/** A URL our own cloud serves (media proxy or Supabase Storage). */
export function isCloudMediaUrl(url) {
  const s = String(url || "");
  return /[?&]mode=media(&|$)/.test(s) || /\.supabase\.co\/storage\//.test(s);
}

/** Drop media our cloud would serve; everything else stays exactly as stored. */
export function withoutCloudMedia(key, value) {
  if (!Array.isArray(value)) return value;
  if (key === "marketplace:videos") {
    return value.filter((v) => !isCloudMediaUrl(v?.videoUrl) && !isCloudMediaUrl(v?.url));
  }
  if (key === "marketplace:products") {
    return value.map((p) => {
      if (!p || typeof p !== "object") return p;
      const out = { ...p };
      for (const f of ["videoUrl", "videoPoster"]) if (isCloudMediaUrl(out[f])) out[f] = null;
      if (isCloudMediaUrl(out.image)) out.image = "";
      return out;
    });
  }
  return value;
}

function loadSnapshot(fetchImpl) {
  if (!pending) {
    const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
    pending = (doFetch ? doFetch(SNAPSHOT_URL, { cache: "no-cache" }) : Promise.reject(new Error("no_fetch")))
      .then((res) => (res && res.ok ? res.json() : null))
      .then((doc) => (doc && typeof doc === "object" && doc.keys && typeof doc.keys === "object" ? doc : null))
      .catch(() => null);
  }
  return pending;
}

/**
 * The snapshot value for `key` (parsed JSON), or null when the key is not a
 * public storefront key or the snapshot has no copy of it.
 */
export async function snapshotGet(key, { fetchImpl } = {}) {
  if (!KEYS.has(key)) return null;
  const doc = await loadSnapshot(fetchImpl);
  if (!doc || !(key in doc.keys)) return null;
  served.add(key);
  takenAt = doc.takenAt || takenAt;
  return withoutCloudMedia(key, doc.keys[key]);
}

/** True once `key` was answered from the snapshot during this visit. */
export function servedFromSnapshot(key) {
  return served.has(key);
}

/** When the snapshot being shown was taken (ISO string), or null when live. */
export function snapshotTakenAt() {
  return served.size ? takenAt : null;
}

/**
 * True when an error says our cloud could not answer at all (a restricted
 * project, a network failure), as opposed to a real answer such as "wrong
 * password". Used to show visitors a calm message instead of the raw error.
 */
export function isCloudUnavailable(error) {
  const text = String(error?.message || error?.error || error || "");
  return /restricted|exceed_\w*quota|\b402\b|failed to fetch|load failed|networkerror|network request failed/i.test(text);
}

/** What a visitor is told while studio sign-up and login cannot reach the cloud. */
export const CLOUD_PAUSED_HE = "פתיחת סטודיו וכניסה לסטודיו חוזרות בקרוב, אנחנו בתחזוקה קצרה. בינתיים אפשר לגלוש באתר ולקנות דרך הקישורים כרגיל.";

/** Test hook: forget what this module loaded and served. */
export function resetSnapshotForTests() {
  pending = null;
  takenAt = null;
  served.clear();
}
