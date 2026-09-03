import { useEffect, useState } from "react";
import { useI18n } from "../../lib/LangContext";

const FALLBACK_LINES = [
  { icon: "🤖", text: "הקמפיינים רצים לבד — אפס עבודה, אפס קליקים ידניים" },
  { icon: "⚡", text: "ירידת מחיר? הפוסט יוצא מיד. לבד." },
  { icon: "💜", text: "הסטודיו הזה מתנהל לבד — גם שלך יכול" },
  { icon: "🏆", text: "תחרות ה-XP מניעה את כל הסטודיו" },
  { icon: "🛍️", text: "הכל בקליק אחד: פוסט, מעקב, PayPal" },
];

export default function ViralProofTicker() {
  const { lang } = useI18n();
  const [lines, setLines] = useState(FALLBACK_LINES);
  const [hasLiveEvents, setHasLiveEvents] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/autopilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "public-feed" }),
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json().catch(() => ({}));
        if (!alive || !Array.isArray(data.events)) return;
        const items = data.events
          .filter((event) => event.ok && event.product)
          .slice(0, 6)
          .map((event) => ({
            icon: event.event === "price_drop" ? "⚡" : "🤖",
            text: event.event === "price_drop"
              ? `פרסום רשף על ${event.product} נשלח לבד · ${event.channels}`
              : `המערכת פרסמה את ${event.product} אוטומטית · ${event.channels}`,
          }));
        if (items.length) {
          setHasLiveEvents(true);
          setLines([...items, ...FALLBACK_LINES.slice(0, 2)]);
        }
      } catch { /* offline-safe */ }
    }
    load();
    const timer = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const row = [...lines, ...lines];
  const label = hasLiveEvents
    ? (lang === "he" ? "חי · פעילות אוטומטית מאומתת" : "LIVE · verified automatic activity")
    : (lang === "he" ? "הצצה למנוע · ממתין לערוץ מחובר" : "ENGINE PREVIEW · waiting for a connected channel");

  return (
    <div className="mb-5 rounded-xl overflow-hidden" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5 px-3 pt-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: "var(--success)" }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--success)" }} />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      </div>
      <div className="overflow-hidden py-2">
        <div className="ll-marquee flex gap-8 whitespace-nowrap ps-4">
          {row.map((line, index) => (
            <span key={index} className="inline-flex items-center gap-1.5 text-[12px] text-muted">
              <span>{line.icon}</span> {line.text} <span className="text-faint">✦</span>
            </span>
          ))}
        </div>
      </div>
      <style>{`.ll-marquee { animation: ll-marquee 34s linear infinite; width: max-content; } @keyframes ll-marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }`}</style>
    </div>
  );
}