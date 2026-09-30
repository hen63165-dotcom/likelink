// LikeLink media storage — the private `product-images` bucket.
//
// The bucket is PRIVATE. Nothing is served from Supabase's public URL. Reads
// go through /api/og?mode=media&path=<path>, which asks Storage with the
// PUBLIC (anon) key, so the storage.objects RLS policies are the only gate
// (supabase/migrations/20260930000000_product_images_bucket.sql):
//   • products/<marketerId>/<file>  public only once an APPROVED product of
//     that creator references it; writable by that creator (verified e-mail
//     in the private creators record) or an admin
//   • reels/<marketerId>/<file>     same rule (a reel is public only when an
//     approved product of that creator references it)
//   • ugc/<productId>/<file>        written by the server only; public while
//     the product is approved
//   • health/…                      the server's storage self-test; never public
//
// Isomorphic and dependency-free.

export const MEDIA_BUCKET = "product-images";
export const MEDIA_KINDS = Object.freeze(["products", "reels", "ugc"]);
export const UPLOAD_EXTENSIONS = Object.freeze(["jpg", "jpeg", "png", "webp", "gif", "avif", "mp4", "webm"]);

const SEGMENT = /^[A-Za-z0-9_-]{1,80}$/;
const FILE = /^[A-Za-z0-9_-]{1,100}\.[A-Za-z0-9]{2,5}$/;

/** products|reels|ugc / <owner or product id> / <file.ext> — nothing else is ever proxied. */
export function isValidMediaPath(path) {
  const parts = String(path || "").split("/");
  return parts.length === 3 && MEDIA_KINDS.includes(parts[0]) && SEGMENT.test(parts[1]) && FILE.test(parts[2]);
}

export function extensionOf(name, fallback = "jpg") {
  const ext = String(name || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext && ext.length <= 5 ? ext : fallback;
}

/** A fresh object path for an upload, or null when it would be refused. */
export function newMediaPath(kind, ownerId, ext, now = Date.now(), rand = Math.random().toString(36).slice(2, 8)) {
  const e = String(ext || "").toLowerCase();
  if (!MEDIA_KINDS.includes(kind) || !SEGMENT.test(String(ownerId || ""))) return null;
  if (kind !== "ugc" && !UPLOAD_EXTENSIONS.includes(e)) return null;
  const path = `${kind}/${ownerId}/${now}-${String(rand).replace(/[^a-z0-9]/gi, "").slice(0, 12) || "x"}.${e}`;
  return isValidMediaPath(path) ? path : null;
}

/** The public URL of a stored object (served by the media proxy). */
export function mediaUrl(path, origin) {
  return `${String(origin || "").replace(/\/+$/, "")}/api/og?mode=media&path=${path}`;
}
