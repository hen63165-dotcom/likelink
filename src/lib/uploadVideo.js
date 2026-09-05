import { supabase, supabaseConfigured } from "./supabaseClient";

/**
 * Uploads a generated reel video (Blob) and returns a public URL.
 *
 * Reuses the existing public `product-images` bucket (the same one product
 * photos use — already created and public per README.md), under a `reels/`
 * prefix. Zero extra dashboard configuration needed.
 *
 * Returns the public URL on success, or `null` on any failure — the caller
 * falls back to the local blob URL so the app never breaks.
 */
export async function uploadReelVideo(blob) {
  if (!blob) return null;

  if (supabaseConfigured && supabase) {
    try {
      const ext = (blob.type || "video/webm").includes("mp4") ? "mp4" : "webm";
      const path = `reels/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, blob, {
          cacheControl: "3600",
          upsert: false,
          contentType: blob.type || "video/webm",
        });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      if (data?.publicUrl) return data.publicUrl;
    } catch (e) {
      console.error("Supabase reel upload failed, keeping local video", e);
    }
  }

  return null;
}