// StudioWelcome — what a signed-out visitor sees at /studio.
// Clear Hebrew-first onboarding: explain what the Studio does and exactly where
// affiliate links go, without promising integrations or earnings that aren't verified.
import React from "react";
import { Link2, ShieldCheck, Clapperboard, LineChart, Sparkles, ShoppingBag } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { cloudStatus } from "../../lib/storage.js";
import { CLOUD_PAUSED_HE, snapshotTakenAt } from "../../lib/catalogSnapshot.js";

const STEPS = [
  { icon: Link2, he: "נכנסים ל״מוצרים״ ולוחצים על הוספת מוצר", en: "Open Products and choose Add product" },
  { icon: ShoppingBag, he: "מדביקים את קישור האפילייט שכבר יצרת ברשת השותפים", en: "Paste the affiliate link you already created in your network" },
  { icon: ShieldCheck, he: "בודקים את פרטי המוצר ומשלימים ידנית מה שחסר", en: "Check the product details and fill in anything missing" },
  { icon: Clapperboard, he: "שומרים את המוצר ומעתיקים את עמוד השיתוף לפרסום", en: "Save the product and copy its share page" },
];

const NETWORKS = [
  { he: "AliExpress Affiliate", en: "AliExpress Affiliate" },
  { he: "Amazon Associates", en: "Amazon Associates" },
  { he: "Awin / impact.com", en: "Awin / impact.com" },
  { he: "רשתות אפילייט אחרות", en: "Other affiliate networks" },
];

export default function StudioWelcome({ onSignup }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const { loading } = useMarketplace();
  const paused = !loading && (Boolean(snapshotTakenAt()) || cloudStatus().state !== "ok");

  return (
    <div dir={he ? "rtl" : "ltr"} className="mx-auto max-w-4xl space-y-5">
      <section className="ll-card overflow-hidden rounded-3xl p-6 text-center sm:p-9">
        <p className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
          <Sparkles size={14} /> {he ? "הסטודיו שלך מתחיל כאן" : "Your Studio starts here"}
        </p>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight text-[var(--text)] sm:text-4xl">
          {he ? "כל קישורי ההמלצות שלך — במקום אחד" : "All your recommendation links in one place"}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          {he
            ? "פותחים סטודיו, מוסיפים מוצר עם קישור השותפים שלך, ואז משתפים עמוד מוצר מסודר. לא צריך לדעת לתכנת."
            : "Open a Studio, add a product with your affiliate link, then share a clear product page. No coding required."}
        </p>
        <button type="button" onClick={onSignup}
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full px-7 py-3 font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
          style={{ background: "linear-gradient(110deg, #7c3aed, #db2777)" }}>
          {he ? "פתיחת סטודיו חינם / התחברות" : "Open a free Studio / Sign in"}
        </button>
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          {he ? "התחילי מקישור אפילייט קיים — אין צורך ליצור קישור מחדש בתוך LikeLink." : "Start with an existing affiliate link — you don't need to recreate it in LikeLink."}
        </p>
      </section>

      <section className="ll-card rounded-2xl p-5 sm:p-6">
        <h2 className="text-base font-bold text-[var(--text)] sm:text-lg">
          {he ? "איפה מדביקים את הקישור?" : "Where do I paste my link?"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {he
            ? "אחרי פתיחת החשבון: עברי ל״מוצרים״ ← ״הוספת מוצר״. בשדה הקישור הדביקי את כתובת האפילייט המלאה שהעתקת מלוח הבקרה של הרשת."
            : "After opening your account, go to Products → Add product. Paste the full affiliate URL copied from your network dashboard into the link field."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {NETWORKS.map((network) => (
            <span key={network.en} className="rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              {he ? network.he : network.en}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
          {he
            ? "חשוב: יש להדביק קישור שותפים שכבר אושר או נוצר ברשת. לא כל רשת מאפשרת ל־LikeLink להמיר קישור רגיל אוטומטית. אם פרטי המוצר לא נטענים, השלימי אותם ידנית ובדקי שהקישור נפתח כראוי."
            : "Important: paste a link already created or approved by your affiliate network. Not every network allows LikeLink to convert ordinary URLs automatically. If product details don't load, fill them in manually and test the link."}
        </p>
      </section>

      {paused ? (
        <p role="status" className="rounded-xl px-4 py-3 text-sm leading-6 surface-subtle">
          {he ? CLOUD_PAUSED_HE : "Studio account actions may be temporarily unavailable while the cloud service is paused."}
        </p>
      ) : null}

      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((step, i) => (
          <li key={step.en} className="ll-card flex items-start gap-3 rounded-2xl p-4 sm:p-5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-bold"
              style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>{i + 1}</span>
            <span className="flex items-start gap-2 pt-1 text-sm leading-6 text-[var(--text)]">
              <step.icon size={18} className="mt-1 shrink-0 opacity-80" /> {he ? step.he : step.en}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-center text-xs leading-5 text-[var(--text-secondary)]">
        {he
          ? "הקלקות ועמלות יוצגו רק ככל שהנתונים זמינים ונקלטים בפועל. קישורי שותפים צריכים להיות מסומנים כפרסום לפי הדין."
          : "Clicks and commissions are shown only when data is actually available. Affiliate links should be disclosed as advertising as required by law."}
      </p>
    </div>
  );
}
