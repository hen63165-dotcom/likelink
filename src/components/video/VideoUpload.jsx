/**
 * VideoUpload 📹 — העלאת וידאו קיים מהמכשיר לסטודיו.
 * מעלה ל-Supabase (אותו bucket ציבורי של המוצרים, תיקיית reels) ומחזיר
 * URL ציבורי דרך onUploaded — עם נפילה בטוחה כש-Supabase לא מוגדר.
 * עד עכשיו הקובץ היה ריק לגמרי (0 bytes) — מולא מחדש בקוד תקין.
 */
import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { uploadReelVideo } from "../../lib/uploadVideo";

export default function VideoUpload({ product, marketer, onUploaded, showToast }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      showToast?.("צריך קובץ וידאו (mp4 / webm / mov)");
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      showToast?.("הקובץ גדול מדי — עד 60MB");
      return;
    }
    setBusy(true);
    try {
      const remoteUrl = await uploadReelVideo(file);
      if (onUploaded) {
        onUploaded({
          title: product?.title || file.name.replace(/\.[^.]+$/, ""),
          description: "",
          videoUrl: remoteUrl || URL.createObjectURL(file),
          marketerId: marketer?.id,
          productTags: product ? [{ productId: product.id }] : [],
          source: "upload",
          public: Boolean(remoteUrl),
        });
      }
      showToast?.(
        remoteUrl
          ? "הווידאו הועלה ופורסם לפיד 🎬"
          : "הווידאו נטען מקומית (Supabase לא מוגדר) 🎬"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="tap rounded-xl py-3 text-[12px] font-bold flex flex-col items-center gap-1 disabled:opacity-60"
        style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        {busy ? "מעלה…" : "העלי וידאו"}
      </button>
    </>
  );
}