import React, { useMemo } from "react";
import { useI18n } from "../../lib/LangContext";
import { computeWinningPatterns, getTopPerformers } from "../../lib/cloud/audienceIntelligence.js";

export default function LearningLoop({ events = [], lang = "he" }) {
  const { t } = useI18n();
  const patterns = useMemo(() => computeWinningPatterns(events || []), [events]);
  const L = (he, en) => (lang === "he" ? he : en);

  const hasData = patterns.hooks.length > 0 || patterns.formats.length > 0 || patterns.channels.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Brain size={18} style={{ color: "var(--accent)" }} />
        <span className="text-sm font-semibold">{L("לולאת למידה עצמית", "Self-Improvement Loop")}</span>
      </div>

      {!hasData && (
        <div className="p-4 rounded-xl text-center surface" style={{ border: "1px solid var(--border)" }}>
          <p className="text-xs text-muted">{L("אין מספיק נתוני ביצוע למידה", "Insufficient performance data for learning")}</p>
          <p className="text-[10px] text-muted mt-1">{L("המערכת לומדת מהנתונים האמיתיים — פרסום, קליקים והמרות", "System learns from real data — publishes, clicks and conversions")}</p>
        </div>
      )}

      {patterns.hooks.length > 0 && (
        <LearningSection title={L("הוקים מנצחים", "Winning hooks")} items={patterns.hooks.slice(0, 5)} metric="conversions" lang={lang} />
      )}
      {patterns.ctas.length > 0 && (
        <LearningSection title={L("קריאות לפעולה מנצחות", "Winning CTAs")} items={patterns.ctas.slice(0, 5)} metric="conversions" lang={lang} />
      )}
      {patterns.formats.length > 0 && (
        <LearningSection title={L("פורמטים מנצחים", "Winning formats")} items={patterns.formats.slice(0, 5)} metric="conversions" lang={lang} />
      )}
      {patterns.channels.length > 0 && (
        <LearningSection title={L("ערוצים מנצחים", "Winning channels")} items={patterns.channels.slice(0, 5)} metric="conversions" lang={lang} />
      )}
      {patterns.productCombinations.length > 0 && (
        <LearningSection title={L("שילובי מוצר-טרנד מנצחים", "Winning product-trend combos")} items={patterns.productCombinations.slice(0, 5)} metric="conversions" lang={lang} />
      )}
    </div>
  );
}

function LearningSection({ title, items = [], metric = "conversions", lang }) {
  return (
    <div className="rounded-2xl p-4 surface" style={{ border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold text-muted mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted">{lang === "he" ? "אין נתונים" : "No data"}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-[11px] py-1">
              <span className="font-semibold">{item.key}</span>
              <span className="text-muted">
                {metric}: {Math.round(item[metric] || 0)} · ctr: {item.ctr}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
