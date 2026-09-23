/**
 * GrowthShowcaseDemo — Shows real catalog data from the production discover endpoint.
 *
 * IMPORTANT: Any recommendation cards that are not backed by real first-party
 * data must be EXPLICITLY labeled "DEMO".
 *
 * This component displays:
 * - Real products from the catalog (if approved + attribution valid)
 * - Real opportunity ranking (if signals exist)
 * - DEMO placeholder cards (explicitly marked) when no real signals exist
 */

import { useEffect, useState } from "react";
import { useI18n } from "../../lib/LangContext";
import { Package, TrendingUp, ExternalLink } from "lucide-react";

export default function GrowthShowcaseDemo() {
  const { lang } = useI18n();
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const t = (he, en) => (lang === "he" ? he : en);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store?mode=discover", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setRecommendations(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e.message || e));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="ll-card rounded-2xl p-5">
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
          {t("תצוגת מוצרים אמיתית", "Real Product Showcase")}
        </h3>
        <div className="mt-4 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: "var(--bg-subtle)" }} />
          ))}
        </div>
      </div>
    );
  }

  const hasProducts = recommendations?.hasResult && Array.isArray(recommendations.results) && recommendations.results.length > 0;
  const demoCount = 2;

  return (
    <div className="ll-card rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
          {t("תצוגת מוצרים אמיתית", "Real Product Showcase")}
        </h3>
        <Package size={16} style={{ color: "var(--accent)" }} />
      </div>

      {error ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {t("לא ניתן לטעון מלאי –", "Cannot load catalog –")}{" "}
          {error}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {hasProducts ? (
            recommendations.results.slice(0, 4).map((p) => (
              <DemoProductCard
                key={p.id || p.title}
                product={p}
                lang={lang}
              />
            ))
          ) : (
            Array.from({ length: demoCount }).map((_, i) => (
              <DemoProductCard
                key={`demo-${i}`}
                product={DEMO_CARDS[i]}
                lang={lang}
                isDemo
              />
            ))
          )}
        </div>
      )}

      {hasProducts && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          {t(
            "כל המוצרים מגיעים מהקטלוג האמיתי של הענן — ללא נתוני דמו.",
            "All products come from the real cloud catalog — no demo data."
          )}
        </p>
      )}
      {!hasProducts && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          {t(
            "ללא מוצרים מאושרים — הוסיפו מוצר עם קישור אמיתי כדי להופיע כאן.",
            "No approved products — add a product with a real link to appear here."
          )}
        </p>
      )}
    </div>
  );
}

const DEMO_CARDS = [
  {
    id: "demo-ring",
    title: "טבעת טבעת סגולה (Demo)",
    price: 199,
    image: "https://images.unsplash.com/photo-1603880732237-95c7877d0f39?auto=format&fit=crop&w=200&q=80",
    category: "Jewelry",
    detail: "DEMO — מוצר לדוגמה בלבד, לא קיים במלאי האמיתי.",
  },
  {
    id: "demo-bracelet",
    title: "שרשרת קהילה (Demo)",
    price: 89,
    image: "https://images.unsplash.com/photo-1591587485116-111d6e98e92f?auto=format&fit=crop&w=200&q=80",
    category: "Accessories",
    detail: "DEMO — מוצר לדוגמה בלבד, לא קיים במלאי האמיתי.",
  },
];

function DemoProductCard({ product, lang, isDemo = false }) {
  const t = (he, en) => (lang === "he" ? he : en);
  const img = product.image || product.imageUrl;
  const validImg = img && String(img).startsWith("http");

  return (
    <div
      className="group relative flex gap-3 rounded-xl p-3 transition-colors"
      style={{ background: "var(--bg-subtle)" }}
    >
      {validImg ? (
        <img
          src={img}
          alt={product.title}
          className="h-20 w-20 rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-lg" style={{ background: "var(--bg-subtle)" }}>
          <Package size={16} style={{ color: "var(--text-muted)" }} />
        </div>
      )}

      <div className="flex-1">
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{product.title}</span>
          {isDemo && (
            <span
              className="rounded px-1 py-px text-[8px] font-black"
              style={{
                background: "color-mix(in srgb, var(--warning) 20%, transparent)",
                color: "var(--warning)",
              }}
            >
              {t("DEMO", "DEMO")}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>
          {Number(product.price) > 0 ? `${product.price} ₪` : t("מחיר לא זמין", "Price not available")}
        </div>
        {product.category && (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{product.category}</div>
        )}
      </div>
    </div>
  );
}
