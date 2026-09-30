import { supabase, supabaseConfigured } from "./supabaseClient.js";
import { fetchOwnPrivate } from "./cloud/identity.js";
import { MEDIA_BUCKET, newMediaPath, extensionOf, mediaUrl } from "./cloud/mediaStore.js";
import { PRODUCTION_ORIGIN } from "../constants/domain.js";

// Local previews of files this browser just uploaded: the stored object is
// private until an approved product references it, so the form shows the
// local copy in the meantime.
const previews = new Map();

/** The src to render for an image field (a just-uploaded file shows its local copy). */
export function mediaPreviewSrc(url) {
  return (url && previews.get(url)) || url;
}

/** The signed-in creator's studio id (explicit, else the verified session's own studio). */
export async function ownStudioId(explicit) {
  if (explicit) return String(explicit);
  const own = await fetchOwnPrivate();
  return own[0]?.id ? String(own[0].id) : null;
}

/**
 * Uploads a product photo and returns its public URL.
 *
 * If Supabase is configured, uploads to the private `product-images` bucket
 * under products/<studio id>/ (the storage policies allow only the studio's
 * verified owner to write there) and returns the media-proxy URL. The photo
 * becomes publicly visible once an approved product references it.
 *
 * If Supabase isn't configured yet (or the upload fails for any reason),
 * falls back to a base64 data URL so the app never crashes.
 */
export async function uploadProductImage(file, { marketerId = null } = {}) {
  if (!file) return null;

  if (supabaseConfigured) {
    try {
      const owner = await ownStudioId(marketerId);
      const path = owner ? newMediaPath("products", owner, extensionOf(file.name)) : null;
      if (!path) throw new Error("media_upload_not_allowed");
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw error;
      const url = mediaUrl(path, PRODUCTION_ORIGIN);
      try { previews.set(url, URL.createObjectURL(file)); } catch { /* preview is optional */ }
      return url;
    } catch (e) {
      console.error("Supabase image upload failed, falling back to inline image", e);
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
