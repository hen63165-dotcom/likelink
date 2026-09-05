/**
 * LunaAssistant 🧚 — העוזרת הדיגיטלית של Lykelink.
 * כדור מרחף בתחתית: לוחצים → לונה נפתחת עם הפריט הנבחר של היום,
 * קול בעברית, ופעולות בקליק (לפתוח / ליצור / לשתף) — עבור האתר עצמו
 * ועבור כל סטודיו עם דמות משלו.
 */
import { useState } from "react";
import { X, Sparkles, Send } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { lunaHook } from "../../lib/ambassador";
import { lunaPersona, lunaPitch, personaPitch } from "../../lib/lunaAvatar";
import { LunaAvatar } from "./LunaAvatar";

export default function LunaAssistant({ marketer, onOpenStudio, onOpenCampaign }) {
  const { t, lang } = useI18n();
  const { products, marketers } = useMarketplace();
  const [open, setOpen] = useState(false);

  const flagship = (products || [])
    .filter((p) => p?.status === "approved" && (p.clickCount > 3 || p.clicks > 3))
    .sort((a, b) => (b.clicks || b.clickCount || 0) - (a.clicks || a.clickCount || 0))[0] || (products || [])[0];

  const spotlight = flagship;
  const persona = lunaPersona(marketer); // דמות הסטודיו או לונה של האתר

  const asSite = !marketer;
  const hook = spotlight ? lunaHook(spotlight.id) : (asSite ? "הפריט שכולן שואלות עליו היום — בדיוק כאן" : persona.name);

  async function handleShare() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = asSite
      ? lunaPitch({ persona, lang, studio: false })
      : personaPitch({ persona, productTitle: spotlight?.title || "", lang });
    const msg = `${text}${origin}/?utm_source=luna`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Likelink — הקניות ממליצות", text: msg });
        return;
      } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(msg);
    } catch { /* noop */ }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[75]"
          style={{ background: "rgba(0,0,0,0.25)" }}
          onClick={() => setOpen(false)}
        />
      )}

      <div className="fixed bottom-24 left-4 z-[76] flex flex-col items-start gap-2" style={{ direction: "ltr" }}>
        {open && (
          <div className="rounded-2xl shadow-2xl overflow-hidden w-[290px] max-w-[85vw]" style={{ background: "var(--bg-elevated)" }}>
            {/* ראש */}
            <div className="p-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #C9A86C 0%, #B78F4F 55%, #9C7437 100%)" }}>
              <LunaAvatar persona={persona} size={52} glow={false} />
              <div className="min-w-0" style={{ direction: "rtl" }}>
                <p className="text-[14px] font-bold text-white">{asSite ? "לונה · לייקלינק" : `${persona.emoji} ${persona.name}`}</p>
                <p className="text-[11px] text-white/90">
                  {asSite ? t("luna.greeting", "היי! בואי לגלות את הנבחר של היום") : t("luna.studioGreeting", "הדמות של הסטודיו שלך מוכנה")}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="tap ml-auto w-7 h-7 rounded-lg flex items-center justify-center bg-white/20 text-white">
                <X size={13} />
              </button>
            </div>

            {/* גוף */}
            <div className="p-3.5 flex flex-col gap-2.5" style={{ direction: "rtl" }}>
              {spotlight && (
                <button
                  onClick={() => { onOpenCampaign && onOpenCampaign(spotlight); setOpen(false); }}
                  className="tap text-start rounded-xl p-2.5 flex items-center gap-2.5"
                  style={{ background: "var(--bg-subtle)" }}
                >
                  {spotlight.image && <img src={spotlight.image} alt="" className="w-11 h-11 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold truncate" style={{ color: "var(--text)" }}>{spotlight.title}</p>
                    <p className="text-[11px]" style={{ color: "var(--accent)" }}>{hook}</p>
                  </div>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { onOpenStudio && onOpenStudio(); setOpen(false); }}
                  className="tap rounded-xl py-2.5 text-[11.5px] font-bold text-white"
                  style={{ background: "var(--text)" }}
                >
                  {asSite ? "✨ פתחי סטודיו" : "🎨 בני דמות"}
                </button>
                <button
                  onClick={handleShare}
                  className="tap rounded-xl py-2.5 text-[11.5px] font-bold flex items-center justify-center gap-1.5"
                  style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                >
                  <Send size={13} /> {asSite ? "שתפי את לייקלינק" : "שתפי בקולה"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* כדור */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="tap rounded-full flex items-center justify-center shadow-xl"
          style={{
            width: 52,
            height: 52,
            background: "linear-gradient(135deg, #C9A86C 0%, #B78F4F 55%, #9C7437 100%)",
            boxShadow: "0 8px 24px -6px rgba(183,143,79,0.6)",
          }}
          aria-label="עוזרת דיגיטלית"
        >
          {open ? <X size={20} color="#fff" /> : <Sparkles size={20} color="#fff" />}
        </button>
      </div>
    </>
  );
}