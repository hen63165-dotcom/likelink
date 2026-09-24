/**
 * MarketingHub — truthful campaign preparation and assisted sharing.
 * Direct external publishing is performed only by the server-side AutoPilot
 * after a real channel is configured and its request succeeds.
 */
import { useState } from "react";
import { PLATFORMS } from "../lib/marketing.js";
import { CAMPAIGN_TEMPLATES, shareToPlatform, shareNative } from "../lib/campaigns.js";

export default function MarketingHub({ product, sellerId, onClose, video, showToast }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const generateText = (template) => {
    if (!template || !product) return "";
    return String(template.text || "")
      .replace(/\[שם מוצר\]/g, product.title || "")
      .replace(/\[מחיר\]/g, product.price || 0)
      .replace(/\[קישור\]/g, product.affiliateUrl || product.url || "");
  };

  const togglePlatform = (id) => {
    setSelectedPlatforms((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const handleShare = async () => {
    if (!selectedTemplate || !selectedPlatforms.length) return;
    setBusy(true);
    const text = customText || generateText(selectedTemplate);
    const videoFile = video?.blob ? new File([video.blob], "likelink-reel.webm", { type: video.blob.type || "video/webm" }) : null;
    const results = [];
    try {
      for (const platformId of selectedPlatforms) {
        if (platformId === "native") {
          results.push({ platform: "native", ...(await shareNative(product, text, videoFile ? { files: [videoFile] } : {})) });
        } else {
          results.push({ platform: platformId, ...shareToPlatform(platformId, product, text) });
        }
      }
      const successful = results.filter((r) => r.success);
      setLastResult({ successful: successful.length, total: results.length, results });
      if (successful.length) showToast?.("השיתוף הוכן/נפתח בהצלחה. פרסום חיצוני אוטומטי מנוהל דרך AutoPilot.");
      else showToast?.("לא נפתח ערוץ שיתוף.");
    } finally {
      setBusy(false);
    }
  };

  const openAutoPilot = () => {
    window.history.pushState({}, "", "/studio/autopilot");
    window.dispatchEvent(new PopStateEvent("popstate"));
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" dir="rtl">
      <div className="ll-card w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em]" style={{ color: "var(--accent)" }}>LikeLink2 Distribution</p>
            <h2 className="mt-1 text-2xl font-black" style={{ color: "var(--text)" }}>מרכז יצירה והפצה</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>הכיני תוכן, שתפי ידנית, או חברי AutoPilot לפרסום חיצוני אמיתי.</p>
          </div>
          <button onClick={onClose} className="rounded-xl px-3 py-2" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>

        {product && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl p-3" style={{ background: "var(--bg-subtle)" }}>
            {product.image && <img src={product.image} alt="" className="h-16 w-16 rounded-xl object-cover" style={{ aspectRatio: "1 / 1" }} />}
            <div><p className="font-bold" style={{ color: "var(--text)" }}>{product.title}</p><p className="text-sm" style={{ color: "var(--accent)" }}>{product.price} ₪</p></div>
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <h3 className="font-bold" style={{ color: "var(--text)" }}>1. תבנית</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Object.values(CAMPAIGN_TEMPLATES).map((cat) => (
                <button key={cat.id} onClick={() => setSelectedTemplate(cat.templates[0])} className="rounded-xl border p-3 text-center" style={{ borderColor: selectedTemplate?.id?.startsWith(cat.id) ? "var(--accent)" : "var(--border)", background: selectedTemplate?.id?.startsWith(cat.id) ? "var(--accent-subtle)" : "var(--bg-elevated)", color: "var(--text)" }}>
                  <div className="text-xl">{cat.icon}</div><div className="mt-1 text-xs font-bold">{cat.name}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <h3 className="font-bold" style={{ color: "var(--text)" }}>2. ערוצים</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Object.values(PLATFORMS).map((p) => (
                <button key={p.id} onClick={() => togglePlatform(p.id)} className="rounded-xl border p-2 text-center" style={{ borderColor: selectedPlatforms.includes(p.id) ? "var(--accent)" : "var(--border)", background: selectedPlatforms.includes(p.id) ? "var(--accent-subtle)" : "transparent", color: "var(--text)" }}>
                  <div>{p.icon}</div><div className="mt-1 text-[10px]">{p.name}</div>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <h3 className="font-bold" style={{ color: "var(--text)" }}>3. טקסט</h3>
          <textarea value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder={selectedTemplate ? generateText(selectedTemplate) : "בחרי תבנית"} className="mt-3 min-h-32 w-full rounded-xl border bg-transparent p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text)" }} />
        </section>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button onClick={handleShare} disabled={busy || !selectedTemplate || !selectedPlatforms.length} className="rounded-xl px-4 py-3 font-bold disabled:opacity-50" style={{ background: "var(--gradient-brand)", color: "white" }}>
            {busy ? "פותח שיתוף…" : "שיתוף / פתיחת ערוץ"}
          </button>
          <button onClick={openAutoPilot} className="rounded-xl border px-4 py-3 font-bold" style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-subtle)" }}>
            ⚡ פתיחת AutoPilot לפרסום חיצוני
          </button>
        </div>

        {lastResult && (
          <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "var(--success-subtle)", color: "var(--text)" }}>
            {lastResult.successful} / {lastResult.total} פעולות שיתוף הצליחו. זה אינו דיווח על פרסום חיצוני.
          </div>
        )}
      </div>
    </div>
  );
}
