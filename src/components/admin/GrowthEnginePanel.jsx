import React, { useMemo, useState } from "react";
import { Rocket, Copy, Check, Send, Users } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { buildRecruitPitches, whatsappShare, recommendedPitchId, NICHES, PLATFORMS } from "../../lib/growthEngine";

/**
 * Growth Engine Panel — admin-side recruiter for new creators.
 * Picks the right pitch (curiosity / FOMO / Pixar story), tailored to the
 * prospect's niche, platform and follower count — in Hebrew, one tap copy,
 * one tap WhatsApp send. Runs 100% client-side.
 */
export default function GrowthEnginePanel() {
  const { lang } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);

  const [name, setName] = useState("");
  const [niche, setNiche] = useState("fashion");
  const [platform, setPlatform] = useState("instagram");
  const [followers, setFollowers] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [copied, setCopied] = useState("");

  const result = useMemo(
    () => buildRecruitPitches({ name, niche, platform, followers, storeUrl }),
    [name, niche, platform, followers, storeUrl]
  );

  const recommended = recommendedPitchId({ niche, platform, followers });

  async function copy(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="surface rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Rocket size={16} style={{ color: "var(--accent)" }} />
          <p className="text-sm font-semibold">{L("מנוע הגיוס — פנייה ממוקדת לכל יוצרת", "Growth Engine — a tailored pitch for every creator")}</p>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          {L(
            "הזני פרטי יוצרת/משפיענית, והמערכת מנסחת 3 פניות בעברית — סקרנות, FOMO וסיפור פיקסאר — עם הערך של 'הכל בקליק אחד'. העתקי או שלחי בוואטסאפ.",
            "Enter a creator's details and get 3 Hebrew pitches — curiosity, FOMO and a Pixar story — each carrying the one-click value. Copy or send via WhatsApp."
          )}
        </p>
      </div>

      <div className="surface rounded-2xl p-4 shadow-sm grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-1">{L("שם פרטי", "First name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={L("למשל: נועה", "e.g. Noa")}
            className="input-field w-full rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-1">{L("תחום", "Niche")}</label>
          <select value={niche} onChange={(e) => setNiche(e.target.value)} className="input-field w-full rounded-xl px-3 py-2 text-sm">
            {NICHES.map((n) => (
              <option key={n.id} value={n.id}>{n.emoji} {n.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-1">{L("פלטפורמה", "Platform")}</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input-field w-full rounded-xl px-3 py-2 text-sm">
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-1">{L("עוקבים", "Followers")}</label>
          <input
            type="number"
            min="0"
            value={followers}
            onChange={(e) => setFollowers(e.target.value)}
            placeholder="5000"
            className="input-field w-full rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-1">URL {L("חנות", "store")} ({L("אופציונלי", "optional")})</label>
          <input
            value={storeUrl}
            onChange={(e) => setStoreUrl(e.target.value)}
            placeholder="https://…"
            className="input-field w-full rounded-xl px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {result.pitches.map((p) => {
          const isRec = p.id === recommended;
          return (
            <div key={p.id} className="surface rounded-2xl p-4 shadow-sm relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  {p.label}
                  {isRec && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                      ★ {L("מומלץ", "best fit")}
                    </span>
                  )}
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => copy(p.text, p.id)}
                    className="tap flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg surface-subtle"
                  >
                    {copied === p.id ? <Check size={11} style={{ color: "var(--success)" }} /> : <Copy size={11} />}
                    {copied === p.id ? L("הועתק!", "Copied") : L("העתקי", "Copy")}
                  </button>
                  <a
                    href={whatsappShare(p.text)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg"
                    style={{ background: "var(--success-subtle)", color: "var(--success)" }}
                  >
                    <Send size={11} /> WhatsApp
                  </a>
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted font-sans m-0">
                {p.text}
              </pre>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-1">
        <Users size={13} className="text-faint" />
        <p className="text-[10.5px] text-faint leading-relaxed">
          {L(
            `רמת משפיענית: ${result.tier.label} · טיפ הפנייה: ${result.channelTip}`,
            `Tier: ${result.tier.label} · Channel tip: ${result.channelTip}`
          )}
        </p>
      </div>
    </div>
  );
}