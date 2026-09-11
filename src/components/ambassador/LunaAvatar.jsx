/**
 * LunaAvatar 🧚 — אווטאר "פיקסאר" אמיתי בסגנון לייקלינק.
 * לונה עצמה מקבלת פנים מצוירות (SVG וקטורי — חד בכל גודל, 100% קוד שלנו).
 * סטודיו עם דמות מותאמת אישית ממשיך לקבל את האמוג'י שבחר.
 * משמשת גם את העוזרת, גם את פיד הדמות וגם את AvatarStudio.
 */

/** זיהוי "לונה של האתר" — הדמות ברירת המחדל מקבלת את הפנים המלאות */
function isLunaDefault(s) {
  return (!s.emoji || s.emoji === "🧚") && (!s.name || s.name === "לונה");
}

/** הפנים המצוירות של לונה — וקטור נקי, רקע שקוף (על גרדיאנט העולם) */
function LunaFaceSvg() {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="לונה"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <defs>
        <linearGradient id="lunaHair" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7C4DBE" />
          <stop offset="55%" stopColor="#B06AC9" />
          <stop offset="100%" stopColor="#E86A9E" />
        </linearGradient>
        <linearGradient id="lunaHairDeep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5D3A99" />
          <stop offset="100%" stopColor="#8F52B8" />
        </linearGradient>
        <radialGradient id="lunaSkin" cx="0.5" cy="0.42" r="0.75">
          <stop offset="0%" stopColor="#FFE9D6" />
          <stop offset="70%" stopColor="#FBD7BC" />
          <stop offset="100%" stopColor="#F2C3A6" />
        </radialGradient>
        <radialGradient id="lunaIris" cx="0.35" cy="0.3" r="0.9">
          <stop offset="0%" stopColor="#9E7BE0" />
          <stop offset="60%" stopColor="#5D3A99" />
          <stop offset="100%" stopColor="#3A2370" />
        </radialGradient>
        <radialGradient id="lunaCheek" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#F79BB4" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#F79BB4" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* שיער אחורי */}
      <ellipse cx="50" cy="47" rx="33" ry="35" fill="url(#lunaHair)" />
      {/* קשתות ליד הפנים */}
      <path d="M17 50 C15 30 30 14 50 14 C70 14 85 30 83 50 C80 32 68 22 50 22 C32 22 20 32 17 50 Z" fill="url(#lunaHairDeep)" />
      {/* אוזניים */}
      <ellipse cx="26.5" cy="58" rx="4.2" ry="5.5" fill="#F7CBAF" />
      <ellipse cx="73.5" cy="58" rx="4.2" ry="5.5" fill="#F7CBAF" />
      {/* הפנים */}
      <ellipse cx="50" cy="54" rx="23.5" ry="25.5" fill="url(#lunaSkin)" />
      {/* פוני (שיער קדמי) */}
      <path d="M27 50 C27 30 36 21.5 50 21.5 C64 21.5 73 30 73 50 C69.5 36 61.5 29.5 50 29.5 C38.5 29.5 30.5 36 27 50 Z" fill="url(#lunaHair)" />
      {/* קווצות צדדיות */}
      <path d="M27.5 49 C25 42 26 36 29 32 C28.5 38 28.5 44 30 49 Z" fill="url(#lunaHairDeep)" opacity="0.85" />
      <path d="M72.5 49 C75 42 74 36 71 32 C71.5 38 71.5 44 70 49 Z" fill="url(#lunaHairDeep)" opacity="0.85" />
      {/* גבות */}
      <path d="M35.5 46.5 Q40.5 43.8 45.5 46.2" stroke="#5D3A99" strokeWidth="2.1" strokeLinecap="round" fill="none" />
      <path d="M54.5 46.2 Q59.5 43.8 64.5 46.5" stroke="#5D3A99" strokeWidth="2.1" strokeLinecap="round" fill="none" />
      {/* עיניים — סגנון פיקסאר */}
      <ellipse cx="40.5" cy="55.5" rx="5.6" ry="6.6" fill="#FFFFFF" />
      <ellipse cx="59.5" cy="55.5" rx="5.6" ry="6.6" fill="#FFFFFF" />
      <circle cx="41.3" cy="56.3" r="3.9" fill="url(#lunaIris)" />
      <circle cx="58.7" cy="56.3" r="3.9" fill="url(#lunaIris)" />
      <circle cx="41.3" cy="56.3" r="1.9" fill="#241640" />
      <circle cx="58.7" cy="56.3" r="1.9" fill="#241640" />
      {/* אורות בעיניים — הנשמה של הדמות */}
      <circle cx="39.7" cy="54.2" r="1.35" fill="#FFFFFF" opacity="0.95" />
      <circle cx="57.1" cy="54.2" r="1.35" fill="#FFFFFF" opacity="0.95" />
      <circle cx="43.2" cy="58.6" r="0.7" fill="#FFFFFF" opacity="0.7" />
      <circle cx="60.6" cy="58.6" r="0.7" fill="#FFFFFF" opacity="0.7" />
      {/* סומק עדין */}
      <ellipse cx="35" cy="64.5" rx="4.6" ry="3.4" fill="url(#lunaCheek)" />
      <ellipse cx="65" cy="64.5" rx="4.6" ry="3.4" fill="url(#lunaCheek)" />
      {/* אף קטן */}
      <path d="M49.2 60.5 Q48 63.2 49.6 64.6" stroke="#DEA488" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* חיוך חם */}
      <path d="M43.5 69.5 Q50 75.5 56.5 69.5" stroke="#C2586A" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      {/* כוכב קסם בשיער */}
      <path d="M68 24 l1.1 2.4 2.6 0.4 -1.9 1.9 0.5 2.6 -2.3 -1.3 -2.3 1.3 0.5 -2.6 -1.9 -1.9 2.6 -0.4 Z" fill="#FFD98A" opacity="0.95" />
    </svg>
  );
}

export function LunaAvatar({ persona, size = 96, glow = true }) {
  const s = persona || { emoji: "🧚", gradient: "linear-gradient(135deg,#F7F3EA,#EDE3CE)", accent: "#B78F4F", name: "לונה" };
  const face = isLunaDefault(s);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full flex items-center justify-center overflow-hidden"
        style={{
          width: "100%",
          height: "100%",
          background: s.gradient,
          boxShadow: glow
            ? `0 0 0 4px rgba(255,255,255,0.6), 0 8px 24px -6px ${s.accent}55`
            : `0 0 0 4px rgba(255,255,255,0.5), 0 4px 12px -6px rgba(0,0,0,0.2)`,
        }}
      >
        {face ? (
          <LunaFaceSvg />
        ) : (
          <span style={{ fontSize: Math.round(size * 0.5), lineHeight: 1 }} role="img" aria-label={s.name}>
            {s.emoji}
          </span>
        )}
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