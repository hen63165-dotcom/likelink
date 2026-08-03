import { supabase, supabaseConfigured } from "./supabaseClient";

/**
 * Uploads a product photo and returns a public URL.
 *
 * If Supabase is configured, uploads to the `product-images` storage bucket
 * (see README.md for the one-time SQL that creates it) and returns a real
 * public URL — visible to every visitor, from any device.
 *
 * If Supabase isn't configured yet (or the upload fails for any reason),
 * falls back to a base64 data URL so the app never crashes — but that image
 * will only render in the browser that uploaded it.
 */
export async function uploadProductImage(file) {
  if (!file) return null;

  if (supabaseConfigured) {
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      return data.publicUrl;
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
