// StudioWelcome — what a signed-out visitor sees at /studio.
// The dashboard (StudioHome) is the signed-in creator's own workspace; a
// visitor gets a clear explanation of what the free Studio does today and one
// button to sign up or sign in. Every line describes a live feature — no
// numbers, no testimonials, no promises of income.
import React from "react";
import { Link2, ShieldCheck, Clapperboard, LineChart, Sparkles } from "lucide-react";
import { useI18n } from "../../lib/LangContext";

const STEPS = [
  { icon: Link2, he: "מדביקה קישור למוצר שאת ממליצה עליו", en: "Paste a link to a product you recommend" },
  { icon: ShieldCheck, he: "המערכת בודקת שהתמונה והקישור אמיתיים", en: "We check the photo and link are real" },
  { icon: Clapperboard, he: "מקבלת עמוד מוצר, קישור מעקב וערכת שיתוף", en: "Get a product page, tracking link and share kit" },
  { icon: LineChart, he: "רואה כמה קליקים הגיעו מכל רשת", en: "See how many clicks came from each network" },
];

export default function StudioWelcome({ onSignup }) {
  const { lang } = useI18n();
  const he = lang === "he";
  return (
    <div dir={he ? "rtl" : "ltr"} className="space-y-5 max-w-3xl mx-auto">
      <section className="ll-card rounded-3xl p-6 sm:p-8 text-center">
        <p className="inline-flex items-center gap-1 text-xs font-semibold opacity-80">
          <Sparkles size={14} /> {he ? "סטודיו חינם ליוצרות וליוצרים" : "A free Studio for creators"}
        </p>
        <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold leading-tight text-[var(--text)]">
          {he ? "ההמלצות שלך, בעמוד אחד אמין — עם קישור שעוקב אחרי כל קליק" : "Your recommendations on one trusted page, with a link that tracks every click"}
        </h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          {he ? "בלי קוד ובלי כרטיס אשראי. פותחים סטודיו בדקה ומתחילים לשתף." : "No code, no credit card. Open a studio in a minute and start sharing."}
        </p>
        <button
          type="button"
          onClick={onSignup}
          className="mt-5 inline-flex items-center justify-center rounded-full px-6 py-3 font-bold text-white bg-gradient-to-l from-fuchsia-500 to-violet-600 shadow-lg"
        >
          {he ? "פתיחת סטודיו חינם / התחברות" : "Open a free studio / Sign in"}
        </button>
      </section>
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.en} className="ll-card rounded-2xl p-4 flex items-start gap-3">
            <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/10 font-bold">{i + 1}</span>
            <span className="flex items-center gap-2 text-sm text-[var(--text)]">
              <s.icon size={18} className="shrink-0 opacity-80" /> {he ? s.he : s.en}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-center text-[var(--text-secondary)]">
        {he ? "כל פוסט שיוצא מהסטודיו מסומן #פרסומת · קישור שותפים, כמו שהחוק מחייב." : "Every post from the Studio is labelled as an affiliate ad."}
      </p>
    </div>
  );
}
