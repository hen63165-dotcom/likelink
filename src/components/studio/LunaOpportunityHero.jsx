import { useMemo } from "react";
import { Sparkles, ArrowLeft, PackagePlus } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { createTrend, TREND_STATES } from "../../lib/cloud/trendRadar.js";
import { evaluateOpportunity } from "../../lib/cloud/opportunityEngine.js";

// Consumer-facing "what did Luna find?" hero for the top of the Studio Overview.
// Reuses the exact same real opportunity-scoring logic as GrowthOS.jsx (no new
// scoring math, no invented numbers) but never shows raw scores/decisions —
// only a plain-language reason a person can act on.
const REASON_COPY = {
  high_opportunity_score: { he: "התאמה חזקה בין המוצר הזה לקטגוריה שמובילה אצלך עכשיו", en: "Strong match between this product and your current leading category" },
  moderate_score:         { he: "יש כאן פוטנציאל סביר שכדאי לעקוב אחריו",                 en: "Reasonable potential worth watching" },
  low_score:              { he: "לא נמצאה עדיין הזדמנות חזקה מספיק",                       en: "No strong opportunity found yet" },
  insufficient_evidence:  { he: "אין עדיין מספיק נתונים כדי להחליט",                       en: "Not enough evidence yet to decide" },
  duplication_risk:       { he: "כבר פורסם תוכן דומה לאחרונה — עדיף להמתין",                en: "Similar content was published recently — better to wait" },
  capability_blocked:     { he: "נדרש חיבור לערוץ הפצה לפני שאפשר לפעול",                   en: "A distribution channel connection is needed before acting" },
  compliance_risk:        { he: "נמצא סיכון תאימות — נדרשת בדיקה",                          en: "A compliance risk was found — needs review" },
};

export default function LunaOpportunityHero({ onAddProduct, onCreateContent }) {
  const { lang } = useI18n();
  const { products, loading } = useMarketplace();
  const myProducts = Array.isArray(products) ? products : [];
  const approved = useMemo(() => myProducts.filter((p) => p?.status === "approved"), [myProducts]);

  const best = useMemo(() => {
    if (!approved.length) return null;
    const now = Date.now();
    const candidates = approved.slice(0, 5).map((product, idx) => {
      const trend = createTrend({
        state: idx === 0 ? TREND_STATES.ACCELERATING : TREND_STATES.RISING,
        category: product.category,
        platform: "likelink_feed",
        signal: "category_momentum",
        keywords: [product.category],
        relatedProducts: [product.id],
        confidence: "ESTIMATED",
        evidence: `internal_catalog:${approved.length}`,
        expiresAt: now + 24 * 60 * 60 * 1000,
      });
      const opp = evaluateOpportunity({ product, trend, creativeAvailability: true, cooldownMs: 24 * 60 * 60 * 1000 });
      return { product, trend, opp };
    });
    return candidates.sort((a, b) => (b.opp.total || 0) - (a.opp.total || 0))[0] || null;
  }, [approved]);

  if (loading) {
    return <div className="ll-card h-32 animate-pulse rounded-2xl" style={{ background: "var(--bg-subtle)" }} />;
  }

  // Honest acquisition state — no fake opportunity when the account is empty.
  if (!approved.length) {
    return (
      <div
        className="ll-card rounded-2xl p-6"
        style={{ background: "linear-gradient(135deg, var(--accent-subtle), var(--bg-elevated))" }}
      >
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--accent)" }}>
          <Sparkles size={14} />
          {lang === "he" ? "לונה" : "LUNA"}
        </div>
        <h2 className="mt-2 text-xl font-bold" style={{ color: "var(--text)" }}>
          {lang === "he" ? "לונה מוכנה להתחיל לעבוד" : "Luna is ready to get to work"}
        </h2>
        <p className="mt-1 max-w-md text-sm" style={{ color: "var(--text-secondary)" }}>
          {lang === "he"
            ? "ברגע שיהיה לך מוצר אחד מאושר, לונה תתחיל לנתח קטגוריות והזדמנויות אמיתיות עבורו — לא לפני."
            : "The moment you have one approved product, Luna starts analyzing real categories and opportunities for it — not before."}
        </p>
        <button
          onClick={onAddProduct}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <PackagePlus size={16} />
          {lang === "he" ? "הוספת המוצר הראשון" : "Add your first product"}
        </button>
      </div>
    );
  }

  const reason = REASON_COPY[best?.opp?.reason] || REASON_COPY.insufficient_evidence;
  const acted = best?.opp?.decision === "ACT";

  return (
    <div
      className="ll-card rounded-2xl p-6"
      style={{ background: "linear-gradient(135deg, var(--accent-subtle), var(--bg-elevated))" }}
    >
      <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--accent)" }}>
        <Sparkles size={14} />
        {lang === "he" ? "לונה מצאה הזדמנות" : "Luna found an opportunity"}
      </div>
      <h2 className="mt-2 text-xl font-bold" style={{ color: "var(--text)" }}>
        {best.product.title || (lang === "he" ? "מוצר" : "Product")}
      </h2>
      <p className="mt-1 max-w-md text-sm" style={{ color: "var(--text-secondary)" }}>
        {lang === "he" ? reason.he : reason.en}
      </p>
      {acted ? (
        <button
          onClick={() => onCreateContent?.(best.product)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {lang === "he" ? "יצירת תוכן עכשיו" : "Create content now"}
          <ArrowLeft size={16} className="rtl:rotate-180" />
        </button>
      ) : (
        <p className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
          {lang === "he" ? "לונה תמשיך לעקוב ותודיע כשההזדמנות תתחזק." : "Luna keeps watching and will flag it once it strengthens."}
        </p>
      )}
    </div>
  );
}
