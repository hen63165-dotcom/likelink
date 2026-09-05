/**
 * LunaAvatar 🧚 — אווטאר "פיקסאר לייט" בסגנון לייקלינק.
 * קומפוננטה נקייה, ללא תלות: עיגול בגרדיאנט של העולם, אמוג'י הפנים,
 * מסגרת זוהרת ונקודות אור. משמשת גם את העוזרת וגם את סינדק הדמות.
 */
export function LunaAvatar({ persona, size = 96, glow = true }) {
  const s = persona || { emoji: "🧚", gradient: "linear-gradient(135deg,#F7F3EA,#EDE3CE)", accent: "#B78F4F", name: "לונה" };
  const font = Math.round(size * 0.5);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: "100%",
          height: "100%",
          background: s.gradient,
          boxShadow: glow
            ? `0 0 0 4px rgba(255,255,255,0.6), 0 8px 24px -6px ${s.accent}55`
            : `0 0 0 4px rgba(255,255,255,0.5), 0 4px 12px -6px rgba(0,0,0,0.2)`,
        }}
      >
        <span style={{ fontSize: font, lineHeight: 1 }} role="img" aria-label={s.name}>
          {s.emoji}
        </span>
      </div>
      {/* נקודות אור קטנות סביב — קסם פיקסאר */}
      {glow && (
        <>
          <span className="absolute rounded-full" style={{ width: size * 0.1, height: size * 0.1, top: -4, left: size * 0.18, background: s.accent, opacity: 0.55 }} />
          <span className="absolute rounded-full" style={{ width: size * 0.07, height: size * 0.07, top: size * 0.12, right: -3, background: s.accent, opacity: 0.4 }} />
          <span className="absolute rounded-full" style={{ width: size * 0.09, height: size * 0.09, bottom: 0, right: size * 0.12, background: s.accent, opacity: 0.5 }} />
        </>
      )}
    </div>
  );
}