import { supabase, supabaseConfigured } from "./supabaseClient.js";
import { MEDIA_BUCKET, newMediaPath, mediaUrl } from "./cloud/mediaStore.js";
import { ownStudioId } from "./uploadImage.js";
import { PRODUCTION_ORIGIN } from "../constants/domain.js";

/**
 * Uploads a generated reel video (Blob) and returns its URL.
 *
 * Stored in the private `product-images` bucket under reels/<studio id>/ —
 * only the studio's verified owner may write there. A reel becomes publicly
 * visible once an approved product of that studio references it.
 *
 * Returns the URL on success, or `null` on any failure — the caller falls
 * back to the local blob URL so the app never breaks.
 */
export async function uploadReelVideo(blob, { marketerId = null } = {}) {
  if (!blob) return null;

  if (supabaseConfigured && supabase) {
    try {
      const ext = (blob.type || "video/webm").includes("mp4") ? "mp4" : "webm";
      const owner = await ownStudioId(marketerId);
      const path = owner ? newMediaPath("reels", owner, ext) : null;
      if (!path) return null;
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, blob, {
          cacheControl: "3600",
          upsert: false,
          contentType: blob.type || "video/webm",
        });
      if (error) throw error;
      return mediaUrl(path, PRODUCTION_ORIGIN);
    } catch (e) {
      console.error("Supabase reel upload failed, keeping local video", e);
    }
  }

  return null;
}
