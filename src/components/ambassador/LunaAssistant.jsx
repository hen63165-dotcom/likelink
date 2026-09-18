/**
 * LunaAssistant 🧚 — העוזרת הדיגיטלית של לייקלינק.
 * כפתור צף בתחתית המסך: לחיצה פותחת פאנל עם הבחירה של היום,
 * הצעה מהענן, ופעולות בקליק (פתיחת סטודיו / יצירה / שיתוף).
 * הפאנל נפתח אך ורק בלחיצת המשתמש — לעולם לא אוטומטית.
 */
import { useState, useEffect } from "react";
import { X, Sparkles, Send } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { lunaHook } from "../../lib/ambassador.js";
import { composeLunaFace } from "../../lib/cloud/lunaFace.js";
import { lunaPersona, lunaPitch, personaPitch } from "../../lib/lunaAvatar.js";
import { sanitizeInput } from "../../lib/security.js";
import { LunaAvatar } from "./LunaAvatar";
import { fetchCloudHome } from "../../lib/cloud/home.js";
import { runIntelligenceTask, intelligenceMessage, intelligenceStatus, inspectIntelligence, resumeIntelligenceJob } from "../../lib/cloud/intelligenceClient.js";

export default function LunaAssistant({ marketer, onOpenStudio, onOpenCampaign }) {
    const { t, lang } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);
    const { products, marketers } = useMarketplace();
  const [open, setOpen] = useState(false);
  const [cloudPick, setCloudPick] = useState(null);
  const [luna, setLuna] = useState({ status: "idle", text: "" });
  const [cloud, setCloud] = useState(null);
  const [jobs, setJobs] = useState([]);
  // Only load cloud status when panel is opened by user — never auto-open
  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([intelligenceStatus(), inspectIntelligence()]).then(([status, history]) => {
      if (!alive) return;
      setCloud(status);
      setJobs(history.ok ? history.jobs || [] : []);
    });
    return () => { alive = false; };
  }, [open]);
  async function resumeJob(jobId) {
    setLuna({ status: "running", text: "" });
    const r = await resumeIntelligenceJob(jobId);
    setLuna({ status: r.job?.status || "failed", text: r.ok ? r.result.text : intelligenceMessage(r.job?.errorCode || r.error) });
  }

  // Cloud Intelligence in action: Luna's suggestion is a REAL orchestrator run
  // (server-side, validated) — or an honest status when it cannot execute.
  async function askLuna() {
    const draft = spotlight?.title
      ? `מוצר: ${spotlight.title}${spotlight.price ? `, מחיר: ${spotlight.price} ₪` : ""}`
      : "הצעתי לי רעיון לפוסט קצר לקידום הסטודיו שלי";
    setLuna({ status: "running", text: "" });
    const r = await runIntelligenceTask({
      operation: "luna.suggest", modality: "text",
      content: { kind: "text", text: draft },
    });
    if (r.ok && r.result?.text) setLuna({ status: "completed", text: r.result.text });
    else setLuna({ status: r.job?.status || "failed", text: intelligenceMessage(r.job?.errorCode || r.error) });
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const home = await fetchCloudHome({ query: "" });
      if (alive && home.ok && home.hasPick) setCloudPick(home.pick);
    })();
    return () => { alive = false; };
  }, []);

    const flagship = (products || [])
    .filter((p) => p?.status === "approved" && (p.clickCount > 3 || p.clicks > 3))
    .sort((a, b) => (b.clicks || b.clickCount || 0) - (a.clicks || a.clickCount || 0))[0] || (products || [])[0];

  const spotlight = cloudPick || flagship;
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
                <p className="text-[14px] font-bold text-white">{asSite ? "לונה · לייקלינק" : `${persona.emoji} ${sanitizeInput(persona.name)}`}</p>
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
                  {spotlight.image ? (
                    <img src={spotlight.image} alt="" className="w-11 h-11 rounded-lg object-cover" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center text-sm" style={{ background: `linear-gradient(135deg, ${persona.gradient})`, color: "#fff" }}>
                      {persona.emoji}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold truncate" style={{ color: "var(--text)" }}>{sanitizeInput(spotlight.title)}</p>
                    <p className="text-[11px]" style={{ color: "var(--accent)" }}>{sanitizeInput(hook)}</p>
                  </div>
                </button>
              )}

              {/* Luna Face — the main studio's voice today (only when from the cloud pick) */}
              {cloudPick && (
                <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)" }}>
                  <p className="text-[11px] font-bold mb-1" style={{ color: "var(--accent)" }}>
                    {L("לונה אומרת", "Luna says")}
                  </p>
                  <p className="text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
                    {L("הבחירה שלי היום — " + (spotlight?.title || ""), "Today's pick — " + (spotlight?.title || ""))}
                  </p>
                </div>
              )}

              {/* Cloud Intelligence — ask Luna for a REAL orchestrator-run suggestion */}
              <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-subtle)" }}>
                <button
                  onClick={askLuna}
                  disabled={luna.status === "running"}
                  className="tap w-full flex items-center justify-center gap-1.5 text-[11.5px] font-bold disabled:opacity-60"
                  style={{ color: "var(--accent)" }}
                >
                  <Sparkles size={13} />
                  {luna.status === "running" ? L("לונה חושבת…", "Luna is thinking…") : L("בקשי מלונה רעיון לקידום ✨", "Ask Luna for a promo idea ✨")}
                </button>
                {luna.text && (
                  <p className="text-[12.5px] font-semibold mt-2 whitespace-pre-wrap text-center" style={{ color: "var(--text)" }}>
                    {sanitizeInput(luna.text)}
                  </p>
                )}
              </div>

              {cloud && (
                <div role="status" className="text-[11px] rounded-xl p-2" style={{ background: "var(--bg-subtle)" }}>
                  {cloud.ok ? L(cloud.status === "CORE_READY" ? "הענן מוכן" : "מצב ענן מוגבל — הסטודיו והקטלוג ממשיכים לעבוד", cloud.status === "CORE_READY" ? "Cloud ready" : "Degraded cloud — Studio and catalog remain usable") : intelligenceMessage(cloud.error)}
                  {(cloud.capabilities || []).map(c => (
                    <p key={c.capability} dir="ltr">{c.capability}: {c.status}</p>
                  ))}
                </div>
              )}
              {jobs.filter(j => ["blocked", "retrying"].includes(j.status) && j.expiresAt > Date.now()).slice(0, 3).map(j => (
                <div key={j.jobId} className="rounded-xl p-2 text-[11px]" style={{ background: "var(--bg-subtle)" }}>
                  <p>{j.operation} · {j.status}</p>
                  <p>{intelligenceMessage(j.errorCode)}</p>
                  <button type="button" onClick={() => resumeJob(j.jobId)}
                    disabled={luna.status === "running" || j.nextAttemptAt > Date.now()}
                    className="tap font-bold disabled:opacity-50" style={{ color: "var(--accent)" }}>
                    {L("המשיכי את אותה משימה", "Resume this job")}
                  </button>
                </div>
              ))}
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