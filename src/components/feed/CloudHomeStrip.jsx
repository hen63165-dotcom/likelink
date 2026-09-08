import React, { useState, useEffect } from "react";
import { Sparkles, Flame, Share2, ChevronRight } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { fetchCloudHome, buildStudioBoost } from "../../lib/cloud/home";
import { shareProduct } from "../../lib/native";

/**
 * Cloud Home Concierge ☁️🎯
 * A slim, additive strip for the feed that answers "what should I look at /
 * do RIGHT NOW" using ONLY the existing cloud machinery:
 *   • "Today's pick" — the live Growth-Brain ranking (mode=discover), not a guess.
 *   • "Boost my studio" — for a logged-in seller: one tap → native OS share of
 *     the studio's strongest product with a fully tracked URL. NO auto-publish;
 *     distribution always requires the user's explicit share action.
 * Pure addition — never replaces or alters the existing feed.
 */
export default function CloudHomeStrip({ navigate }) {
  const { lang } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);
  const { currentMarketer, products } = useMarketplace();
  const [pick, setPick] = useState(null);
  const [boost, setBoost] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const home = await fetchCloudHome({ query: "" });
      if (alive && home.ok && home.hasPick) setPick(home.pick);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (currentMarketer) setBoost(buildStudioBoost(currentMarketer, products));
    else setBoost(null);
  }, [currentMarketer, products]);

  async function handleBoostShare() {
    if (!boost || busy) return;
    setBusy(true);
    try {
      await shareProduct({
        id: boost.product.id,
        title: boost.product.title,
      }, { medium: "studio_boost" });
    } finally {
      setBusy(false);
    }
  }

  if (!pick && !boost) return null;

  return (
    <section className="mb-5 flex flex-col gap-3">
      {/* TODAY'S PICK */}
      {pick && (
        <div className="surface rounded-2xl overflow-hidden shadow-sm relative">
          <div className="ll-hero-glow" aria-hidden="true" style={{ opacity: 0.25 }} />
          <div className="relative z-10 p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={14} style={{ color: "var(--accent)" }} />
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                {L("הבחירה של היום · הענן מדרג מאמת", "Today's pick · cloud-ranked from real data")}
              </p>
            </div>
            <div className="flex gap-3 items-center">
              {pick.image && (
                <img
                  src={pick.image}
                  alt={pick.title}
                  className="w-16 h-16 rounded-xl object-cover bg-[var(--bg-subtle)] shrink-0"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{pick.title}</p>
                <p className="text-xs text-muted mt-0.5">
                  {Number(pick.price) > 0 ? `₪${Number(pick.price).toFixed(0)}` : ""}
                  {pick.badges?.length ? ` · ${pick.badges[0]}` : ""}
                </p>
                {(pick.reasons || []).slice(0, 1).map((r, i) => (
                  <p key={i} className="text-[11px] text-muted truncate mt-0.5">{r}</p>
                ))}
              </div>
              <button
                type="button"
                className="tap shrink-0 rounded-full text-xs font-bold px-3 py-2"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => pick.productId && navigate(`/p/${encodeURIComponent(pick.productId)}`)}
              >
                {L("לצפייה", "View")} <ChevronRight size={12} style={{ verticalAlign: "middle" }} />
              </button>
            </div>
          </div>
        </div>
      )}
{/* BOOST MY STUDIO */}
      {boost && boost.ok && (
        <div className="surface rounded-2xl p-4 shadow-sm relative" style={{ border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 6%, var(--surface))" }}>
          <div className="relative z-10">
            <div className="flex items-center gap-1.5 mb-2">
              <Flame size={14} style={{ color: "var(--accent)" }} />
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                {L("Boost · תני לענן לשווק את הסטודיו שלך", "Boost · let the cloud market your studio")}
              </p>
            </div>
            <div className="flex gap-3 items-center">
              {boost.product.image && (
                <img
                  src={boost.product.image}
                  alt={boost.product.title}
                  className="w-12 h-12 rounded-lg object-cover bg-[var(--bg-subtle)] shrink-0"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{boost.product.title}</p>
              </div>
              <button
                type="button"
                className="tap shrink-0 rounded-full text-xs font-bold px-3.5 py-2"
                style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}
                onClick={handleBoostShare}
              >
                <Share2 size={12} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />
                {busy ? L("משתפת…", "Sharing…") : L("שתפי עכשיו", "Share now")}
              </button>
            </div>
            <p className="text-[10px] text-muted mt-2">
              {L("שיתוף מהטלפון — הענן עוקב אחרי כל קליק מהקישור.", "Shares from your phone — the cloud tracks every click on the link.")}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}