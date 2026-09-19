import React from "react";
import { useI18n } from "../../lib/LangContext";
import { OPPORTUNITY_DECISIONS, OPPORTUNITY_DECISION_LABELS, OPPORTUNITY_DECISION_COLORS } from "../../lib/cloud/opportunityEngine.js";

export default function OpportunityEngine({ opportunities = [], onSelect, selectedId, lang = "he" }) {
  const { t } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{L("מנוע ההזדמנויות", "Opportunity Engine")}</span>
      </div>
      {opportunities.length === 0 && (
        <div className="p-4 rounded-xl text-center surface" style={{ border: "1px solid var(--border)" }}>
          <p className="text-xs text-muted">{L("אין הזדמנויות זמינות כרגע", "No opportunities available right now")}</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {opportunities.map((opp, idx) => {
          const color = OPPORTUNITY_DECISION_COLORS[opp.decision] || "#6B7280";
          const label = OPPORTUNITY_DECISION_LABELS[opp.decision]?.[lang] || opp.decision;
          const isSelected = selectedId === `${opp.product?.id}_${opp.trend?.trendId}`;
          return (
            <button
              key={idx}
              onClick={() => onSelect?.(opp)}
              className="tap text-start rounded-2xl p-4 surface transition-all"
              style={{
                border: `1px solid ${isSelected ? color : "var(--border)"}`,
                background: isSelected ? `${color}10` : "var(--bg)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
                  {label}
                </span>
                <span className="text-[10px] text-muted">{opp.confidence}</span>
              </div>
              <p className="text-sm font-semibold mb-1">{opp.product?.title || L("מוצר כללי", "Generic product")}</p>
              <p className="text-[11px] text-muted mb-2">{opp.reason} · {L("ציון", "score")}: {Math.round(opp.total || 0)}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {Object.entries(opp.scores || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="font-semibold">{Math.round(v || 0)}</span></div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
