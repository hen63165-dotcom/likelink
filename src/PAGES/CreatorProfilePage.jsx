import React, { useState, useMemo, useEffect } from "react";
import { Users, ShoppingBag, ArrowLeft, Share2, Languages, UserCheck, UserPlus, Layers, Copy, Sparkles, TrendingUp, Play } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "../lib/LangContext";
import { getTopCreatorIds, normalizeImageUrl } from "../utils/helpers";
import { ProductCard, ProductModal, TopBadge } from "../components/product/ProductComponents";
import { EmptyState } from "../components/ui";
import { updatePageSEO, getCreatorSEO } from "../lib/seo";
import { getReferralStats, trackReferralClick, getPendingReferral, getReferralTier } from "../lib/referrals";
import { useVideos } from "../context/VideoContext";
import { ReelsPlayer } from "../components/video/ReelsPlayer";

export default function CreatorProfilePage({
  slug, marketers, products, collections, favorites, onToggleFavorite,
  following, onToggleFollow, recordClick, showToast, navigate, lang, setLang,
  currentSellerId
}) {
  const { t, categoryLabel } = useI18n();
  const [active, setActive] = useState(null);
  const [playReel, setPlayReel] = useState(null);
  const [showReferralBanner, setShowReferralBanner] = useState(false);
  const { videos: allVideos } = useVideos();

  const marketer = marketers.find((m) => m.slug === slug || m.id === slug);
  const topIds = useMemo(() => getTopCreatorIds(products), [products]);
  
  // SEO: Update page meta tags for this creator
  useEffect(() => {
    if (marketer) {
      const seo = getCreatorSEO(marketer, products.filter(p => p.marketerId === marketer.id));
      updatePageSEO(seo);
    }
    return () => updatePageSEO({ title: 'לייקלינק — קניות מהיוצרות המובילות בישראל' });
  }, [marketer, products]);
  
  // Track referral clicks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      trackReferralClick(ref);
    }
  }, []);
  
  // Show referral banner for logged-in sellers
  useEffect(() => {
    if (currentSellerId && marketer && marketer.id === currentSellerId) {
      setShowReferralBanner(true);
    }
  }, [currentSellerId, marketer]);

  const referralStats = useMemo(() => {
    if (!marketer || !currentSellerId) return null;
    if (marketer.id !== currentSellerId) return null;
    return getReferralStats(marketer.id);
  }, [marketer, currentSellerId]);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: marketer?.name, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("sell.linkCopied"));
    } catch {
      showToast(url);
    }
  }
  
  async function handleCopyReferralLink() {
    if (!referralStats) return;
    try {
      await navigator.clipboard.writeText(referralStats.referralLink);
      showToast('🔗 קישור ההזמנה הועתק!');
    } catch {
      showToast(referralStats.referralLink);
    }
  }

  async function handleGetDeal(p) {
    await recordClick(p);
    window.open(p.affiliateUrl, "_blank", "noopener,noreferrer");
    showToast(t("toast.openingDeal"));
  }

  if (!marketer) {
    return (
      <div className="flex-1 w-full max-w-app mx-auto px-4 pt-16 flex flex-col items-center text-center">
        <EmptyState icon={Users} title={t("creatorPage.notFoundTitle")} body={t("creatorPage.notFoundBody")} />
        <button onClick={() => navigate("/")} className="tap mt-2 rounded-full px-4 py-2 text-[13px] font-semibold flex items-center gap-1.5" style={{ background: "var(--text)", color: "var(--bg)" }}>
          <ArrowLeft size={14} className="mirror-rtl" /> {t("creatorPage.backHome")}
        </button>
      </div>
    );
  }

  const mine = products.filter((p) => p.marketerId === marketer.id && p.status === "approved").sort((a, b) => b.createdAt - a.createdAt);
  const myCollections = collections.filter((c) => c.marketerId === marketer.id && c.productIds.length > 0);
  const groupedIds = new Set(myCollections.flatMap((c) => c.productIds));
  const ungrouped = mine.filter((p) => !groupedIds.has(p.id));
  const isFollowing = following.includes(marketer.id);

  // רילים של היוצרת: שנוצרו ע"י הסטודיו שלה או מתויגים למוצר שלה.
  // חישוב רגיל (לא useMemo) כדי לשמור על סדר ה-hooks לפני ה-early-return.
  const myReels = allVideos.filter(
    (v) =>
      v.marketerId === marketer.id ||
      (Array.isArray(v.productTags) &&
        v.productTags.some((tg) => mine.some((p) => p.id === tg.productId)))
  );

  function renderGrid(list) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {list.map((p, i) => (
          <ProductCard
            key={p.id}
            p={p}
            marketer={marketer}
            isTop={false}
            lang={lang}
            isFav={favorites.includes(p.id)}
            onToggleFavorite={() => onToggleFavorite(p.id)}
            onOpen={() => setActive(p)}
            index={i}
          />
        ))}
      </div>
    );
  }

  const referralTier = referralStats ? getReferralTier(referralStats.conversions) : null;
  
  return (
    <>
      <header className="w-full sticky top-0 z-40 glass-header safe-top">
        <div className="max-w-app mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="tap w-8 h-8 rounded-full flex items-center justify-center surface" aria-label={t("common.back")}>
            <ArrowLeft size={15} className="mirror-rtl" />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={handleShare} className="tap shrink-0 w-8 h-8 rounded-full flex items-center justify-center surface" aria-label={t("common.share")}>
              <Share2 size={13} style={{ color: "var(--accent)" }} className="mirror-rtl" />
            </button>
            <button onClick={() => setLang(lang === "he" ? "en" : "he")} className="tap shrink-0 w-8 h-8 rounded-full flex items-center justify-center surface" aria-label={t("common.language")}>
              <Languages size={14} style={{ color: "var(--accent)" }} />
            </button>
          </div>
        </div>
      </header>

      {/* Viral Referral Banner - shows for the seller themselves */}
      {showReferralBanner && referralStats && (
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-3">
          <div className="max-w-app mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} />
                <span className="text-sm font-medium">הזמינו יוצרים נוספים וקבלו בונוס!</span>
              </div>
              <button 
                onClick={handleCopyReferralLink}
                className="flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-full px-3 py-1 text-xs font-medium transition-colors"
              >
                <Copy size={12} />
                העתק קישור
              </button>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs opacity-90">
              <span className="flex items-center gap-1">
                <TrendingUp size={12} />
                {referralStats.totalClicks} לחיצות
              </span>
              <span>{referralStats.conversions} הרשמות</span>
              <span>{referralStats.conversionRate}% המרה</span>
              {referralTier && referralTier !== 'new' && (
                <span className="bg-white/20 rounded-full px-2 py-0.5">
                  {referralTier === 'legend' ? '🌟 לגנדה' : 
                   referralTier === 'expert' ? '⭐ מומחה' :
                   referralTier === 'advanced' ? '🚀 מתקדם' :
                   referralTier === 'starter' ? '⭐ מתחיל' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-app mx-auto pb-10 px-4">
        <div className="pt-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center disp font-semibold text-[22px]" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {marketer.name.charAt(0).toUpperCase()}
          </div>
          <p className="disp text-[19px] font-semibold mt-3 flex items-center gap-1.5">{marketer.name} {topIds.has(marketer.id) && <TopBadge />}</p>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>{mine.length} {t("creatorPage.listingsCount")}</p>
          {marketer.bio && (
            <p className="text-[13px] leading-relaxed mt-2.5 max-w-[320px]" style={{ color: "var(--text-secondary)" }}>{marketer.bio}</p>
          )}
          <button
            onClick={() => onToggleFollow(marketer.id)}
            className="tap mt-3 rounded-full px-5 py-2 text-[13px] font-semibold flex items-center gap-1.5"
            style={{ background: isFollowing ? "var(--accent-subtle)" : "var(--accent)", color: isFollowing ? "var(--accent)" : "#fff" }}
          >
            {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
            {isFollowing ? t("creatorPage.following") : t("creatorPage.follow")}
          </button>
        </div>

        {/* Reels — הסרטונים של היוצרת, מוכנים לצפייה וקנייה בקליק */}
        {myReels.length > 0 && (
          <section className="mt-6">
            <p className="text-[12px] font-semibold uppercase tracking-wide mb-2.5 flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
              🎬 Reels
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
              {myReels.slice(0, 12).map((v) => {
                const prod =
                  products.find((p) => p.id === (v.productTags?.[0]?.productId || "")) || mine[0] || null;
                return (
                  <button
                    key={v.id}
                    onClick={() => setPlayReel(v)}
                    className="tap shrink-0 w-28 overflow-hidden rounded-xl surface shadow-sm relative"
                  >
                    {prod?.image ? (
                      <img
                        src={normalizeImageUrl(prod.image, typeof window !== "undefined" ? window.location.origin : "") || prod.image}
                        alt={v.title || ""}
                        className="w-full aspect-[9/16] object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full aspect-[9/16]" style={{ background: "var(--accent-subtle)" }} />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <motion.span
                        whileTap={{ scale: 0.8 }}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
                      >
                        <Play size={16} color="#fff" fill="#fff" />
                      </motion.span>
                    </span>
                    <span
                      className="absolute bottom-1 left-1 right-1 text-[9px] font-semibold text-white truncate text-center"
                      style={{ background: "rgba(0,0,0,0.45)", borderRadius: 6, padding: "1px 4px" }}
                    >
                      {v.title || "ריל"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {myCollections.map((c) => {
          const items = mine.filter((p) => c.productIds.includes(p.id));
          if (items.length === 0) return null;
          return (
            <div key={c.id} className="mt-7">
              <p className="text-[12px] font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}><Layers size={12} /> {c.title}</p>
              {renderGrid(items)}
            </div>
          );
        })}

        <div className="mt-7">
          {(myCollections.length > 0 && ungrouped.length > 0) && (
            <p className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>{t("creatorPage.moreProducts")}</p>
          )}
          {myCollections.length === 0 && (
            <p className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>{t("creatorPage.allProductsBy")} {marketer.name.split(" ")[0]}</p>
          )}
          {mine.length === 0 ? (
            <EmptyState icon={ShoppingBag} title={t("feed.emptyTitle")} body={t("feed.emptyBody")} />
          ) : (myCollections.length === 0 || ungrouped.length > 0) ? (
            renderGrid(myCollections.length === 0 ? mine : ungrouped)
          ) : null}
        </div>

        {/* Viral CTA: Turn visitors into sellers */}
        {(!currentSellerId || marketer?.id !== currentSellerId) && (
          <div className="mt-8 mb-4 p-4 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 text-center">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-2">
              <Sparkles size={18} className="text-purple-600" />
            </div>
            <p className="text-sm font-semibold text-gray-800">
              גם אתם יכולים למכור כמו {marketer.name.split(' ')[0]}!
            </p>
            <p className="text-xs text-gray-600 mt-1 mb-3">
              פתחו סטודיו מכירה בחינן והתחילו להרוויח — בלי צורך בטכנולוגיה
            </p>
            <button
              onClick={() => navigate('/studio')}
              className="tap rounded-full px-5 py-2 text-xs font-semibold bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md hover:shadow-lg transition-shadow"
            >
              🚀 פתחו סטודיו משלכם
            </button>
          </div>
        )}
      </main>

      {active && (
        <ProductModal
          product={active}
          marketer={marketer}
          isTop={topIds.has(marketer.id)}
          lang={lang}
          isFav={favorites.includes(active.id)}
          onToggleFavorite={() => onToggleFavorite(active.id)}
          onClose={() => setActive(null)}
          onGetDeal={() => handleGetDeal(active)}
        />
      )}

      {/* Reels Player — נגן הרילס של היוצרת */}
      {playReel && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
          <div className="relative w-full max-w-[300px]">
            <ReelsPlayer
              video={playReel}
              onClose={() => setPlayReel(null)}
              onProductClick={(prod) => {
                setPlayReel(null);
                setActive(prod);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
