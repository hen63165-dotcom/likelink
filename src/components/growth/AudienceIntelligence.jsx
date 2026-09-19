import React from "react";
import { useI18n } from "../../lib/LangContext";
import { getWinningPatterns, audienceInsightSummary } from "../../lib/cloud/audienceIntelligence.js";

export default function AudienceIntelligence({ signals, lang = "he" }) {
  const { t } = useI18n();
  const patterns = useMemo(() => getWinningPatterns(signals || {}), [signals]);
  const summary = useMemo(() => audienceInsightSummary(signals || {}, lang), [signals, lang]);
  const L = (he, en) => (lang === "he" ? he : en);

  const renderSection = (title, items, metric = "conversions") => (
    <div className="rounded-2xl p-4 surface" style={{ border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold text-muted mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted">{L("אין נתונים", "No data")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.slice(0, 5).map((item, i) => (
            <div key={i} className="flex justify-between text-[11px] py-1">
              <span className="font-semibold">{item.key}</span>
              <span className="text-muted">{metric}: {Math.round(item[metric] || 0)} · ctr: {item.ctr}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{L("אינטליגנציה של קהלים", "Audience Intelligence")}</span>
        <span className="text-[10px] text-muted">{summary.slice(0, 80)}</span>
      </div>
      {renderSection(L("הוקים מנצחים", "Winning hooks"), patterns.hooks)}
      {renderSection(L("קריאות לפעולה מנצחות", "Winning CTAs"), patterns.ctas)}
      {renderSection(L("פורמטים מנצחים", "Winning formats"), patterns.formats)}
      {renderSection(L("ערוצים מנצחים", "Winning channels"), patterns.channels)}
      {renderSection(L("גיאוגרפיה", "Geographies"), patterns.geographies)}
    </div>
  );
}
