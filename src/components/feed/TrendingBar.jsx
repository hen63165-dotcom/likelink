/**
 * TrendingBar 🔥 — "מה חם עכשיו".
 * A slim trend-aware strip above the feed. Pulls LIVE trends data from the
 * existing mode=trends endpoint and renders the hottest signals so visitors
 * see real commercial momentum, not fabricated "trending".
 *
 * Pure client fetch, no tokens. Falls back gracefully (renders nothing) on
 * error — never fakes. Matches the existing feed surface styling.
 */
import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { useI18n } from "../../lib/LangContext";

const MOMENTUM_LABELS = {
  "🔥 viral": { he: "ויוראלי", en: "Viral" },
  "📈 hot": { he: "חם", en: "Hot" },
  "↗️ rising": { he: "עולה", en: "Rising" },
  "→ steady": { he: "יציב", en: "Steady" },
  "❄️ cold": { he: "קרחום", en: "Cold" },
};

export default function TrendingBar() {
  const { lang } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/store?mode=trends", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => null);
        if (alive && data?.ok) setTrends(data);
      } catch { /* offline-safe */ } finally {
        if (alive) setLoading(false);
      }
    })();

    const id = setInterval(() => {
      fetch("/api/store?mode=trends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
        .then((r) => r.json().catch(() => null))
        .then((data) => { if (alive && data?.ok) setTrends(data); })
        .catch(() => {});
    }, 60_000);

    return () => { alive = false; clearInterval(id); };
  }, []);

  const hottest = trends?.hottest || [];
  const active = hottest.filter((t) => t.score > 0);
  const items = active.length ? active.slice(0, 5) : hottest.slice(0, 5);

  if (loading || !items.length) return null;

  const activeCount = trends?.activeProducts || active.length;

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <Flame size={14} style={{ color: "var(--accent)" }} />
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
          {L("הטרנדים החמים היום", "Hot trends today")}
        </p>
        <span className="text-[9.5px] text-muted">· {activeCount} {L("פעילים", "active")}</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {items.map((t, i) => {
          const mKey = t.momentum || "❄️ cold";
          const label = MOMENTUM_LABELS[mKey] || { he: mKey, en: "Hot" };
          const heat = Math.max(1, Math.min(10, Math.ceil(t.score / 40)));
          return (
            <button
              key={t.product?.id || i}
              type="button"
              className="flex shrink-0 flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-center tap"
              style={{
                minWidth: "72px",
                background: "color-mix(in srgb, var(--accent) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent) 16%, transparent)",
              }}
            >
              <span className="text-xs font-extrabold" style={{ color: heat >= 7 ? "var(--accent)" : heat >= 4 ? "var(--text)" : "var(--muted)" }}>
                {label[lang === "he" ? "he" : "en"]}
              </span>
              <span className="text-[9px] text-muted truncate w-full">{t.product?.title?.slice(0, 18) || "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}