/**
 * AvatarStudio 🎨 — "בני הדמות שלי": כל סטודיו בונה לעצמו פרסונה.
 * בוחרים עולם מותג (פיקסאר / לוקס / ניאון / מינימלי / מסיבה), אמוג'י ושם,
 * וחוסכים — ואז כל היצירות (סטורי, וידאו, פרסומים) נולדות בקול של הדמות.
 */
import { useState } from "react";
import { X, Save, Sparkles, Share2, Check } from "lucide-react";
import { BRAND_WORLDS, DEFAULT_WORLD } from "../../lib/brandWorlds";
import { AVATAR_EMOJIS, lunaPersona, personaEmojiSeed, lunaPitch, personaPitch } from "../../lib/lunaAvatar";
import { getTier } from "../../lib/pricing";
import { LunaAvatar } from "./LunaAvatar";

export default function AvatarStudio({ marketer, lang = "he", onClose, onSave, showToast }) {
  const existing = (marketer?.brandWorld && typeof marketer.brandWorld === "object" ? marketer.brandWorld : {}) || {};
  const [worldId, setWorldId] = useState(existing.worldId || DEFAULT_WORLD);
  const [emoji, setEmoji] = useState(existing.emoji || personaEmojiSeed(existing.worldId || DEFAULT_WORLD));
  const [name, setName] = useState(existing.alterEgo || "");
  const [copied, setCopied] = useState("");

  const world = BRAND_WORLDS.find((w) => w.id === worldId) || BRAND_WORLDS[0];
  const persona = lunaPersona({ ...marketer, brandWorld: { worldId, emoji, alterEgo: name || world.alterEgo || "לונה" } });

  function save() {
    onSave({ worldId, emoji, alterEgo: name.trim() || world.alterEgo || "לונה" });
    showToast?.("הדמות נשמרה — כל הפרסומים ינסו בקולה ✨");
  }

  async function shareAsCharacter() {
    const text = personaPitch({ persona, lang });
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const msg = `${text}${origin}/?utm_source=avatar&utm_medium=share&utm_content=${encodeURIComponent(persona.name)}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${persona.name} · Likelink`, text: msg });
        return;
      } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(msg);
      setCopied("msg");
      showToast?.("קישור ההזמנה עוצב והועתק 🔗");
    } catch {
      setCopied("");
    }
  }

  async function shareAsSite() {
    const text = lunaPitch({ persona, lang, studio: true });
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const msg = `${text}${origin}/?utm_source=avatar-studio&utm_medium=share`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopied("site");
      showToast?.("הקישור לסטודיו הועתק — שלחי לכל מי שרוצה להרוויח 💜");
    } catch {
      setCopied("");
    }
  }

  const tier = getTier(marketer?.plan || "starter");

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl" style={{ background: "var(--bg-elevated)" }} onClick={(e) => e.stopPropagation()}>
        {/* כותרת */}
        <div className="p-5 pb-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)" }}>
              <Sparkles size={17} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p className="disp text-[15px] font-semibold" style={{ color: "var(--text)" }}>בני הדמות שלי 🧚</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>כמו לונה — כל סטודיו עם פנים, עולם וקול משלו</p>
            </div>
          </div>
          <button onClick={onClose} className="tap w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--bg-subtle)" }}>
            <X size={15} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* תצוגה חיה */}
          <div className="flex items-center gap-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)" }}>
            <LunaAvatar persona={persona} size={84} />
            <div className="min-w-0">
              <p className="disp text-lg font-bold" style={{ color: "var(--text)" }}>{persona.name}</p>
              <p className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>{world.emoji} {world.label}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{world.tagline}</p>
            </div>
          </div>

          {/* שם */}
          <div>
            <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "var(--text-muted)" }}>שם הדמות</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={"לונה"}
              className="w-full rounded-xl px-3 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </div>

          {/* עולם */}
          <div>
            <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "var(--text-muted)" }}>עולם המותג (נכנס לכל סטורי/וידאו/פרסום)</label>
            <div className="grid grid-cols-2 gap-2">
              {BRAND_WORLDS.map((w) => {
                const on = worldId === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => setWorldId(w.id)}
                    className="tap rounded-xl px-3 py-2 text-right transition-colors"
                    style={{ background: on ? "var(--accent-subtle)" : "var(--bg)", border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}` }}
                  >
                    <p className="text-[12.5px] font-bold flex items-center gap-1.5">
                      <span>{w.emoji}</span> {w.label}
                      {on && <Check size={13} style={{ color: "var(--accent)" }} />}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{w.tagline}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* אמוג'י */}
          <div>
            <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "var(--text-muted)" }}>בחרי פרצוף</label>
            <div className="grid grid-cols-9 gap-1.5">
              {AVATAR_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className="tap h-9 rounded-lg flex items-center justify-center text-lg"
                  style={{ background: emoji === e ? "var(--accent-subtle)" : "var(--bg)", border: `1.5px solid ${emoji === e ? "var(--accent)" : "var(--border)"}` }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* שיתוף קול הדמות */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={shareAsCharacter} className="tap rounded-xl py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              <Share2 size={14} /> {copied === "msg" ? "הועתק ✓" : "שתפי בקולה"}
            </button>
            <button onClick={shareAsSite} className="tap rounded-xl py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>
              <Sparkles size={14} /> {copied === "site" ? "הועתק ✓" : "לונה משווקת את האתר"}
            </button>
          </div>

          {/* רווח — שקיפות מודל העמלות */}
          <div className="rounded-2xl p-3.5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <p className="text-[11px] font-semibold mb-1 flex items-center gap-1.5" style={{ color: "var(--text)" }}>
              <Sparkles size={12} style={{ color: "var(--accent)" }} /> המודל הכלכלי שלך ({tier.name?.he || "מתחיל"})
            </p>
            <div className="flex gap-3 text-[11px]">
              <span style={{ color: "var(--text)" }}>👩‍💼 את שומרת: <b>{tier.sellerNet}%</b></span>
              <span style={{ color: "var(--text-muted)" }}>🛡️ פלטפורמה: {tier.platformFee}%</span>
            </div>
          </div>

          {/* שמירה */}
          <button onClick={save} className="tap w-full rounded-xl py-3.5 text-[14px] font-bold text-white flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #C9A86C 0%, #B78F4F 55%, #9C7437 100%)" }}>
            <Save size={16} /> שמרי את הדמות — הכל מתחבר מכאן
          </button>
        </div>
      </div>
    </div>
  );
}