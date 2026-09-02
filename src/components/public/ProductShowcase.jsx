import React from "react";
import { ArrowLeft, Share2, Zap, Wallet, Trophy } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";

/**
 * ProductShowcase — public viral page for a single product.
 * Every shared product link now lands on a stunning page that shows the
 * item + a "this studio runs itself" strip. Whoever sees it instantly
 * understands the creator made money without CapCut, coding or ads —
 * and that they can have the same machine.
 */
export default function ProductShowcase({ product, owner, navigate }) {
  const { lang } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);
  const { recordClick } = useMarketplace();

  if (!product) {
    return (
      <div className="pt-16 flex flex-col items-center text-center px-6">
        <p className="disp text-lg font-semibold">{L("המוצר לא נמצא", "Product not found")}</p>
        <p className="text-sm text-muted mt-2">{L("ייתכן שהקישור שגוי או שהמוצר הוסר.", "The link may be wrong, or the product was removed.")}</p>
        <button onClick={() => navigate("/feed")} className="tap mt-5 text-sm font-bold" style={{ color: "var(--accent)" }}>
          {L("חזרה לפיד", "Back to feed")}
        </button>
      </div>
    );
  }

  const price = Number(product.price) || 0;
  const ownerSlug = owner?.slug || "studio";

  const handleBuy = () => {
    if (product.link) recordClick(product.id, product.link);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.title, url });
        return;
      }
    } catch { /* cancelled */ }
    try {
      await navigator.clipboard.writeText(url);
    } catch { /* clipboard optional */ }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-[var(--bg)]">
      {/* Hero — product image full-bleed */}
      <div className="w-full h-[46vh] relative overflow-hidden bg-[var(--bg-subtle)]">
        {product.image ? (
          <img src={product.image} alt={product.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">🛍️</div>
        )}
        <button
          type="button"
          onClick={() => navigate("/feed")}
          className="tap absolute top-4 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full shadow"
          style={{ right: lang === "he" ? 16 : "auto", left: lang === "he" ? "auto" : 16, background: "rgba(0,0,0,0.55)", color: "#fff" }}
        >
          <ArrowLeft size={14} /> {L("חזרה", "Back")}
        </button>
      </div>

      <div className="w-full max-w-md px-5 pb-16 -mt-8 relative">
        <div className="surface rounded-3xl p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
            {product.category ? product.category : "Likelink"}
          </p>
          <h1 className="disp text-2xl font-bold mt-1 leading-snug">{product.title}</h1>
          {price > 0 && (
            <p className="mono text-3xl font-extrabold mt-2" style={{ color: "var(--accent)" }}>
              ₪{price}
            </p>
          )}

          <a
            href={product.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleBuy}
            className="tap w-full mt-4 py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-[15px]"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {L("קנייה מהירה וזורמת", "Buy in one tap")} →
          </a>

          <button
            type="button"
            onClick={() => navigate(`/u/${encodeURIComponent(ownerSlug)}`)}
            className="tap w-full mt-2 py-2.5 rounded-xl text-xs font-semibold bg-[var(--bg-subtle)]"
          >
            {L(`הסטודיו של ${owner?.name || "יוצרת"}`, `${owner?.name || "Creator"}'s studio`)} →
          </button>
        </div>

        {/* The viral strip — sells the platform through this product */}
        <div className="mt-5 rounded-3xl p-5" style={{ background: "linear-gradient(135deg,#6C4CF1,#3D2E8C)" }}>
          <p className="text-white font-bold text-sm leading-snug">
            {L("הסטודיו הזה מתנהל לבד", "This studio runs itself")}
          </p>
          <p className="text-white/85 text-xs mt-1.5 leading-relaxed">
            {L(
              "כל הקליקים האלה נספרים אוטומטית. הפרסום? יוצא לבד. התשלום? עובר ל-PayPal בקליק. בלי CapCut, בלי ידע טכני, בלי כלום.",
              "Every click is counted automatically. Publishing runs on autopilot. Payouts hit PayPal in one tap. No CapCut, no coding, no fuss."
            )}
          </p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-white/85 text-[11px] font-semibold"><Wallet size={14} /> {L("ארנק", "Wallet")}</div>
            <div className="flex items-center gap-1.5 text-white/85 text-[11px] font-semibold"><Zap size={14} /> {L("אוטומציה", "Autopilot")}</div>
            <div className="flex items-center gap-1.5 text-white/85 text-[11px] font-semibold"><Trophy size={14} /> {L("XP & תחרות", "XP & ranks")}</div>
          </div>
        </div>

        {/* Recruitment CTA */}
        <div className="surface rounded-3xl mt-4 p-5 text-center shadow-sm">
          <p className="disp text-lg font-bold">{L("ככה זה נראה כשזה עובד", "This is what 'it just works' looks like")}</p>
          <p className="text-xs text-muted mt-1.5 leading-relaxed">
            {L(
              "חמש דקות, ואת מקבלת את אותה מערכת. פותחים סטודיו, מדביקים לינק, והמערכת עושה את כל השאר — בעברית, לכל רשת, כל הזמן.",
              "Five minutes and you get the same machine. Open a studio, paste a link, and it does the rest — in Hebrew, to every network, all the time."
            )}
          </p>
          <a
            href="/studio"
            className="tap w-full mt-4 py-3.5 rounded-xl flex items-center justify-center gap-2 font-bold text-[14px]"
            style={{ background: "var(--text)", color: "var(--bg)" }}
          >
            {L("💜 פתחי סטודיו בחינם", "💜 Open your free studio")}
          </a>
        </div>

        <button
          type="button"
          onClick={handleShare}
          className="tap w-full mt-3 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold"
          style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
        >
          <Share2 size={14} /> {L("שתפי את העמוד הזה", "Share this page")}
        </button>
      </div>
    </div>
  );
}