import React, { useState, useMemo } from "react";
import { useI18n } from "../../lib/LangContext";
import { TREND_STATES, TREND_STATE_LABELS, TREND_STATE_COLORS, createTrend, trendIsActive, summarizeTrend } from "../../lib/cloud/trendRadar.js";

const STATE_FILTERS = [
  { id: "all", label: { he: "הכל", en: "All" } },
  { id: "active", label: { he: "פעילים", en: "Active" } },
  { id: "RISING", label: { he: "עולים", en: "Rising" } },
  { id: "ACCELERATING", label: { he: "מאיצים", en: "Accelerating" } },
  { id: "PEAK", label: { he: "פסגה", en: "Peak" } },
  { id: "INSUFFICIENT_DATA", label: { he: "אין נתונים", en: "No data" } },
];

export default function TrendRadar({ trends = [], products = [], lang = "he" }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return trends;
    if (filter === "active") return trends.filter(trendIsActive);
    return trends.filter((t) => t.state === filter);
  }, [trends, filter]);

  const enriched = useMemo(() => {
    return filtered.map((trend) => {
      const related = (products || []).filter((p) => p.category === trend.category).slice(0, 3);
      return { ...trend, relatedProducts: related };
    });
  }, [filtered, products]);

  const L = (he, en) => (lang === "he" ? he : en);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{L("Trend Radar — lifecycle evidence", "Trend Radar — lifecycle evidence")}</span>
      </div>

      <div className="flex rounded-full p-1 surface-subtle overflow-x-auto">
        {STATE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="tap shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: filter === f.id ? "var(--bg-elevated)" : "transparent",
              color: filter === f.id ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {f.label[lang] || f.label.en}
          </button>
        ))}
      </div>

      {enriched.length === 0 && (
        <div className="p-4 rounded-xl text-center surface" style={{ border: "1px solid var(--border)" }}>
          <p className="text-xs text-muted">{L("אין טרנדים להצגה", "No trends to display")}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {enriched.map((trend) => {
          const color = TREND_STATE_COLORS[trend.state] || "#9CA3AF";
          const label = TREND_STATE_LABELS[trend.state]?.[lang] || trend.state;
          const summary = summarizeTrend(trend, lang);
          return (
            <div key={trend.trendId} className="rounded-2xl p-4 surface" style={{ border: `1px solid ${color}30` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
                  {label}
                </span>
                <span className="text-[10px] text-muted">{trend.platform || "-"}</span>
              </div>
              <p className="text-sm font-semibold mb-1">{trend.category || trend.signal || L("טרנד גנרי", "Generic trend")}</p>
              <p className="text-[11px] text-muted mb-2">{(summary.he || summary.en || "").slice(0, 120)}</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {(trend.keywords || []).slice(0, 6).map((kw, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>{kw}</span>
                ))}
              </div>
              {trend.relatedProducts?.length > 0 && (
                <div className="flex flex-col gap-1 mt-2">
                  <p className="text-[10px] text-muted">{L("מוצרים קשורים", "Related products")}:</p>
                  {trend.relatedProducts.map((p) => (
                    <span key={p.id} className="text-[11px] truncate">{p.title}</span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-faint mt-2">source: {trend.source || "internal"} · {trend.evidence || "no evidence"}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
