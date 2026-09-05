/**
 * AutoVideoStudio 🎬 — "הכל בקליק":
 * היוצרת בוחרת מוצר → לחיצה אחת → קליפ 9:16 רץ בדפדפן (ללא עלויות,
 * ללא API חיצוני) → תצוגה מקדימה → שיתוף / הורדה / פרסום בכל הרשתות.
 */
import { useState, useEffect } from "react";
import { X, Video, Loader2, Download, Share2, CheckCircle2, Send } from "lucide-react";
import { generateProductReel, canRecordVideo } from "../../lib/videoEngine";
import { uploadReelVideo } from "../../lib/uploadVideo";
import { useVideos } from "../../context/VideoContext";
import VideoUpload from "./VideoUpload";
import { getBrandWorld, worldHook, worldVideoPalette } from "../../lib/brandWorlds";
import { lunaPersona } from "../../lib/lunaAvatar";

const HOOKS = (p, store) => [
  `✨ ${store}: ${p?.title || "הקולקציה החדשה"} — הפריט שכולם שואלים עליו`,
  `🔥 ${p?.title || "הפריט החדש"} — חייבים להכיר`,
  `🛍️ המומלצת שלי: ${p?.title || ""}`,
  `🎁 רעיון למתנה מושלמת: ${p?.title || ""}`,
];

const CTAS = ["לרכישה 👉 הלינק בפרופיל", "קנייה מהנה 🛍️", "הזמינו עכשיו ✨"];

const PALETTE_OPTIONS = [
  { id: "dark", label: "פחם · לוקסוס", swatch: "#211C16" },
  { id: "cream", label: "קרם · קריא", swatch: "#F7F3EA" },
  { id: "gold", label: "זהב · יוקרה", swatch: "#241404" },
];

export default function AutoVideoStudio({ product, marketer, onClose, showToast, onOpenMarketing }) {
  const { addVideo } = useVideos();
  const [stage, setStage] = useState("idle"); // idle | rendering | done
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [hook, setHook] = useState("");
  const [cta, setCta] = useState(CTAS[0]);
  const [saving, setSaving] = useState(false);

  const storeName = (typeof marketer?.name === "string" && marketer.name) || "Likelink";
  const persona = lunaPersona(marketer);
  const world = getBrandWorld(marketer);
  const [palette, setPalette] = useState(world.videoPalette || "dark");
  const [actorName, setActorName] = useState(persona.name);

  useEffect(() => {
    if (!product) return;
    const persona2 = lunaPersona(marketer);
    setActorName(persona2.name);
    setPalette(worldVideoPalette(marketer?.brandWorld?.worldId) || (persona2.worldId === "pixar" ? "gold" : "dark"));
    // הוק אוטומטי מהעולם — זווית שיווקית חדשה כל פעם
    if (marketer?.brandWorld?.worldId && !hook) {
      setHook(worldHook(getBrandWorld(marketer), product.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, marketer?.brandWorld]);

  if (!product) return null;

  const supported = canRecordVideo();
  const price = Number(product.price) || 0;
  const images = [product.image, product.image2, product.image3].filter(Boolean);

  async function start() {
    setError("");
    setStage("rendering");
    setProgress(0);
    try {
      const res = await generateProductReel({
        images,
        title: product.title || "",
        price,
        hook,
        cta,
        storeName,
        palette,
        onProgress: setProgress,
      });
      setResult(res);
      setStage("done");
      showToast?.("הסרטון מוכן! 🎉");
    } catch (e) {
      setError(e && e.message ? e.message : "שגיאה ביצירת הסרטון — נסי שוב");
      setStage("idle");
    }
  }

  function blobFile() {
    if (!result?.blob) return null;
    return new File([result.blob], "likelink-reel.webm", { type: result.blob.type || "video/webm" });
  }

  async function share() {
    if (!result) return;
    const file = blobFile();
    if (typeof navigator.share === "function" && file && typeof navigator.canShare === "function") {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: product.title || "Likelink", text: hook, files: [file] });
          showToast?.("שותף! 🚀");
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: product.title || "Likelink", text: hook });
        return;
      } catch {
        // בוטל או לא זמין — נופלים להורדה
      }
    }
    download();
  }

  function download() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = "likelink-reel.webm";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast?.("הסרטון ירד למכשיר ⬇️");
  }

  async function saveToReels() {
    if (!result || saving) return;
    setSaving(true);
    try {
      // מעלה ל-Supabase כדי שהריל יופיע בפיד אצל כולם; בכשל — נשאר מקומי
      const remoteUrl = await uploadReelVideo(result.blob);
      addVideo({
        title: product.title || "Reel",
        description: hook,
        videoUrl: remoteUrl || result.url,
        marketerId: marketer?.id,
        productTags: [{ productId: product.id }],
        source: "studio",
        public: Boolean(remoteUrl),
      });
      showToast?.(
        remoteUrl
          ? "הריל פורסם לפיד — כולם רואים אותו 🎬"
          : "נשמר במכשיר (Supabase לא מוגדר בסביבה הזו) 🎬"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
        style={{ background: "var(--bg-elevated)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* כותרת */}
        <div className="p-5 pb-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)" }}>
              <Video size={17} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p className="disp text-[15px] font-semibold" style={{ color: "var(--text)" }}>סטודיו הווידאו — בקליק</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>מנוע עיבוד בדפדפן · ללא עלות · מוכן לפרסום</p>
            </div>
          </div>
          <button onClick={onClose} className="tap w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--bg-subtle)" }}>
            <X size={15} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* סיכום מוצר */}
          <div className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: "var(--bg-subtle)" }}>
            {images[0] && <img src={images[0]} alt={product.title} className="w-12 h-12 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>{product.title}</p>
              <p className="text-[12px] font-bold" style={{ color: "var(--accent)" }}>{price > 0 ? `${price.toLocaleString("he-IL")} ₪` : "המחיר בחנות"}</p>
            </div>
          </div>

          {/* הוק שיווקי */}
          <div>
            <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "var(--text-muted)" }}>הוק שיווקי (הכל נשאר אצלך)</label>
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-[13px] resize-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </div>

          {/* CTA */}
          <div>
            <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "var(--text-muted)" }}>כפתור מעשה</label>
            <div className="flex flex-wrap gap-2">
              {CTAS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCta(c)}
                  className="tap rounded-full px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: cta === c ? "var(--accent)" : "var(--bg-subtle)", color: cta === c ? "#fff" : "var(--text)" }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* פלטת צבע */}
          <div>
            <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "var(--text-muted)" }}>סגנון הרקע</label>
            <div className="flex gap-2">
              {PALETTE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setPalette(o.id)}
                  className="tap flex-1 rounded-xl px-3 py-2 text-center"
                  style={{ border: `1.5px solid ${palette === o.id ? "var(--accent)" : "var(--border)"}`, background: "var(--bg-subtle)" }}
                >
                  <span className="block w-5 h-5 mx-auto rounded-full mb-1" style={{ background: o.swatch, border: "1px solid var(--border)" }} />
                  <span className="text-[11px] font-medium" style={{ color: "var(--text)" }}>{o.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* כפתור יצירה / התקדמות */}
          {stage === "idle" && (
            <button
              onClick={start}
              disabled={!supported}
              className="tap w-full rounded-xl py-3.5 text-[14px] font-bold text-white flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #C9A86C 0%, #B78F4F 55%, #9C7437 100%)", boxShadow: "0 8px 24px -12px rgba(183,143,79,0.7)" }}
            >
              <Video size={17} /> {supported ? "🎬 צרי סרטון עכשיו — בקליק אחד" : "הדפדפן לא תומך בהקלטת וידאו"}
            </button>
          )}
          {stage === "rendering" && (
            <div className="rounded-xl p-4" style={{ background: "var(--bg-subtle)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: "var(--text)" }}>
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} /> מרכיבים את הסרטון…
                </span>
                <span className="mono text-[12px] font-bold" style={{ color: "var(--accent)" }}>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(progress * 100)}%`, background: "var(--accent)" }} />
              </div>
              <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>בונה פריימים מהתמונה + טקסט — בלי עלויות, בלי מפתחות.</p>
            </div>
          )}
          {error && (
            <p className="text-[12px] font-medium" style={{ color: "var(--danger, #dc2626)" }}>{error}</p>
          )}

          {/* תצוגה מקדימה + פעולות */}
          {stage === "done" && result && (
            <>
              <div className="rounded-2xl overflow-hidden bg-black mx-auto w-full max-w-[240px] aspect-[9/16]">
                <video src={result.url} controls autoPlay muted loop playsInline className="w-full h-full object-cover" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={share} className="tap rounded-xl py-3 text-[12px] font-bold flex flex-col items-center gap-1 text-white" style={{ background: "var(--text)" }}>
                  <Share2 size={15} /> שתפי
                </button>
                <button onClick={download} className="tap rounded-xl py-3 text-[12px] font-bold flex flex-col items-center gap-1" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                  <Download size={15} /> הורדה
                </button>
                <button onClick={saveToReels} disabled={saving} className="tap rounded-xl py-3 text-[12px] font-bold flex flex-col items-center gap-1 disabled:opacity-60" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {saving ? "מעלה…" : "שמירה"}
                </button>
                <VideoUpload
                  product={product}
                  marketer={marketer}
                  onUploaded={addVideo}
                  showToast={showToast}
                />
              </div>
              <button
                onClick={() => onOpenMarketing?.(result)}
                className="tap w-full rounded-xl py-3.5 text-[14px] font-bold text-white flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #C9A86C 0%, #B78F4F 55%, #9C7437 100%)" }}
              >
                <Send size={16} /> המשך לפרסום בכל הרשתות 📣
              </button>
              <p className="text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
                השלב הבא יפתח את מרכז השיווק עם הווידאו מצורף לקמפיין.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}