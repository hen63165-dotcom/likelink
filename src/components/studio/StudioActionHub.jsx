/**
 * StudioActionHub — the Studio overview's three primary actions.
 * Every status line is computed from the creator's REAL data; when there is no
 * data yet the card says so and explains how to start measuring.
 */
import React, { useMemo } from "react";
import { Link2, LayoutTemplate, BarChart3, ArrowLeft, Sparkles } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";

const ACTIONS = [
  {
    view: "add-product",
    icon: Link2,
    he: { title: "קישורים ומוצרים", body: "מדביקים קישור שותפים מכל תוכנית, ממלאים שם ותמונה, ומפרסמים בחנות או שומרים כטיוטה." },
    en: { title: "Affiliate Link Manager", body: "Paste a link from any network, check it, pick an account and channels, then publish or keep as a draft." },
  },
  {
    view: "storefront",
    icon: LayoutTemplate,
    he: { title: "עיצוב החנות שלי", body: "שם, תמונה, תיאור וקישורים חברתיים — בדיוק מה שמוצג בעמוד החנות הציבורי." },
    en: { title: "Design my store", body: "Name, photo, bio and social links — exactly what the public store page shows." },
  },
  {
    view: "performance",
    icon: BarChart3,
    he: { title: "ביצועים וקליקים", body: "קליקים וצפיות אמיתיים מהמוצרים שלך, לפי מוצר ומקור." },
    en: { title: "Performance & clicks", body: "Real clicks and views from your own products, per product and source." },
  },
];

export default function StudioActionHub({ onNavigate, onStartOnboarding, needsOnboarding }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const { currentMarketer: marketer, products, sales } = useMarketplace();

  const mine = useMemo(
    () => (products || []).filter((p) => p.marketerId === marketer?.id),
    [products, marketer]
  );
  const published = mine.filter((p) => p.status === "approved");
  const totalClicks = mine.reduce((s, p) => s + Number(p.clicks || 0), 0);
  const mySales = (sales || []).filter((s) => s.marketerId === marketer?.id);
  const completeness = [
    Boolean(marketer?.name),
    Boolean(marketer?.bio),
    Boolean(marketer?.avatar || marketer?.avatarUrl),
    Boolean(marketer?.socialLinks && Object.values(marketer.socialLinks).some(Boolean)),
  ].filter(Boolean).length;

  const statuses = [
    mine.length === 0
      ? (he ? "אין עדיין מוצרים — זה המקום להתחיל." : "No products yet — this is where you start.")
      : (he ? `${mine.length} מוצרים · ${published.length} פורסמו · ${totalClicks} קליקים` : `${mine.length} products · ${published.length} published · ${totalClicks} clicks`),
    he ? `${completeness} מתוך 4 שדות מלאו` : `${completeness} of 4 fields filled`,
    totalClicks === 0 && mySales.length === 0
      ? (he ? "אין עדיין נתונים. כך מתחילים למדוד: פרסום מוצר ושיתוף הקישור — כל קליק יירשם כאן." : "No data yet. How to start: publish a product and share the link — every click is recorded here.")
      : (he ? `${totalClicks} קליקים · ${mySales.length} אירועים` : `${totalClicks} clicks · ${mySales.length} sales events`),
  ];

  return (
    <div className="space-y-4">
      {needsOnboarding && (
        <section className="ll-card rounded-3xl p-5 flex flex-wrap items-center justify-between gap-3" style={{ border: "1px solid var(--accent)" }}>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--accent)" }}>
              <Sparkles size={14} /> {he ? "פתיחת סטודיו מודרכת" : "Guided studio setup"}
            </p>
            <p className="mt-1 text-sm font-bold" style={{ color: "var(--text)" }}>
              {he ? "5 צעדים קצרים: סוג החנות · פרטים · מוצר ראשון · תצוגה מקדימה · פרסום ושיתוף." : "5 short steps: store type · details · first product · preview · publish & share."}
            </p>
          </div>
          <button
            type="button"
            onClick={onStartOnboarding}
            className="ll-tap rounded-full px-5 py-2.5 text-xs font-extrabold"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {he ? "להתחלת ההדרכה" : "Start the guide"}
          </button>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {ACTIONS.map((a, i) => {
          const Icon = a.icon;
          const copy = he ? a.he : a.en;
          return (
            <button
              key={a.view}
              type="button"
              onClick={() => onNavigate?.(a.view)}
              className="ll-card ll-tap group rounded-3xl p-5 text-start transition hover:-translate-y-0.5"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                <Icon size={20} />
              </span>
              <span className="mt-3 block text-sm font-extrabold leading-snug" style={{ color: "var(--text)" }}>
                {copy.title}
              </span>
              <span className="mt-1.5 block text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>
                {copy.body}
              </span>
              <span className="mt-3 block text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                {statuses[i]}
              </span>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-extrabold" style={{ color: "var(--accent)" }}>
                {he ? "פתיחה" : "Open"} <ArrowLeft size={13} className="transition group-hover:-translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
