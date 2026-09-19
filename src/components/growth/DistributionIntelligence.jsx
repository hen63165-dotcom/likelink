import React from "react";
import { Share2, Copy, ExternalLink, Download } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { DISTRIBUTION_STATES, DISTRIBUTION_FALLBACKS, resolveDistributionState, getBestFallback } from "../../lib/cloud/distributionIntelligence.js";

export default function DistributionIntelligence({ channels = [], creative, lang = "he" }) {
  const { t } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);

  const plans = channels.map((ch) => {
    const state = resolveDistributionState({ intent: creative ? "share" : "publish", provider: ch });
    const fallback = state === "READY" ? null : creative ? getBestFallback(creative, channels) : null;
    return { channel: ch, state, fallback };
  });

  const readyCount = plans.filter((p) => p.state === DISTRIBUTION_STATES.READY).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 size={18} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold">{L("אינטליגנציית הפצה", "Distribution Intelligence")}</span>
        </div>
        <span className="text-[10px] text-muted">{readyCount}/{channels.length} {L("מוכנים", "ready")}</span>
      </div>

      {plans.length === 0 && (
        <div className="p-4 rounded-xl text-center surface" style={{ border: "1px solid var(--border)" }}>
          <p className="text-xs text-muted">{L("אין ערוצי הפצה", "No distribution channels")}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {plans.map((plan) => {
          const color = plan.state === DISTRIBUTION_STATES.READY ? "#00C896" : plan.state === DISTRIBUTION_STATES.ASSISTED ? "#C9A86C" : "#EF4444";
          return (
            <div key={plan.channel} className="rounded-2xl p-4 surface" style={{ border: `1px solid ${color}30` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold">{plan.channel}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>{plan.state}</span>
              </div>
              {plan.fallback && (
                <div className="flex flex-col gap-1 mt-2">
                  <p className="text-[11px] text-muted">{L("פעולה חלופית", "Fallback action")}: {plan.fallback.action}</p>
                  <p className="text-[10px] text-faint">{plan.fallback.reason}</p>
                </div>
              )}
              {plan.state === DISTRIBUTION_STATES.READY && (
                <div className="flex gap-2 mt-2">
                  <button className="tap px-3 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: "#00C896", color: "#fff" }}>
                    <Play size={11} className="inline-block me-1" />{L("פרסם", "Publish")}
                  </button>
                </div>
              )}
              {plan.state === DISTRIBUTION_STATES.ASSISTED && creative && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => navigator.clipboard?.writeText(creative.title)} className="tap px-3 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                    <Copy size={11} className="inline-block me-1" />{L("העתק", "Copy")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
