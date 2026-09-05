/**
 * CoachPanel 🧠 — "המאמן האישי של הסטודיו".
 * מציג ציון, סיכון וטיפים קונקרטיים לשיפור — מבוסס על sellerCoach.js.
 * עיצוב לוקסוס שקט: פחם #211C16, שמפניה #B78F4F, קרם #F7F3EA.
 */
import { useMemo } from "react";
import { Lightbulb, TrendingUp } from "lucide-react";
import { analyzeSeller, dailyTip } from "../../lib/sellerCoach";

const PRIORITY_STYLE = {
  high: { background: "rgba(179, 84, 30, 0.14)", color: "#B3541E" },
  medium: { background: "rgba(183, 143, 79, 0.16)", color: "#9C7437" },
  low: { background: "rgba(79, 122, 94, 0.14)", color: "#4F7A5E" },
};

const GRADE_COLOR = {
  A: "#4F7A5E",
  B: "#B78F4F",
  C: "#B3541E",
  D: "#211C16",
};

export default function CoachPanel({ products = [], sales = [], clicks = [], marketerId }) {
  const analysis = useMemo(
    () => analyzeSeller({ products, sales, clicks, marketerId }),
    [products, sales, clicks, marketerId]
  );

  const tip = useMemo(() => dailyTip(), []);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      {/* ראש — ציון + דירוג */}
      <div className="p-4 flex items-center gap-3" style={{ background: "var(--accent-subtle)" }}>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--text)", color: "#fff" }}
        >
          <span className="text-lg font-bold" style={{ color: GRADE_COLOR[analysis.grade] || "#fff" }}>
            {analysis.grade}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: "var(--text)" }}>
            <Lightbulb size={14} style={{ color: "var(--accent)" }} /> המאמן האישי
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            ציון {analysis.score}/100 — {analysis.summary}
          </p>
        </div>
      </div>

      {/* טיפ יומי */}
      <div className="px-4 py-2.5 text-[11px] flex items-start gap-1.5" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
        <TrendingUp size={12} className="shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
        <span>{tip}</span>
      </div>

      {/* רשימת טיפים */}
      <div className="p-3 space-y-2">
        {analysis.tips.map((t, i) => (
          <div
            key={i}
            className="rounded-xl p-3"
            style={{ background: "var(--bg)", border: "1px solid var(--border-subtle, rgba(27,23,18,0.06))" }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.low}>
                {t.icon}
              </span>
              <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                {t.title}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {t.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}