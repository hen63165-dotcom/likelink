import React, { useState, useMemo } from "react";
import { Search, ShoppingBag, LayoutGrid, Rows3, Heart, UserCheck, TrendingUp, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { useCart } from "../../context/CartContext";
import { getTopCreatorIds } from "../../utils/helpers";
import { trackClick, trackView } from "../../lib/analytics";
import { CATEGORY_KEYS } from "../../lib/i18n";
import { EmptyState, IconButton } from "../ui";
import { ProductCard, StreamCard, ProductModal, CreatorAvatar } from "../product/ProductComponents";
import { ScreenshotSearchModal } from "../search/ScreenshotSearchModal";

export default function FeedView({ navigate }) {
  const { t, lang, categoryLabel } = useI18n();
  const { products, marketers, favorites, following, toggleFavorite, recordClick, showToast } = useMarketplace();
  const { addItem: addToCart } = useCart();

  const [view, setView] = useState("grid");
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [showScreenshotSearch, setShowScreenshotSearch] = useState(false);
  const [sort, setSort] = useState("newest");
  const [favOnly, setFavOnly] = useState(false);
  const [followOnly, setFollowOnly] = useState(false);
  const [active, setActive] = useState(null);

  const getMarketer = (id) => marketers.find((m) => m.id === id) || null;
  const topIds = useMemo(() => getTopCreatorIds(products), [products]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = products
      .filter((p) => p.status === "approved")
      .filter((p) => cat === "All" || p.category === cat)
      .filter((p) => !favOnly || favorites.includes(p.id))
      .filter((p) => !followOnly || following.includes(p.marketerId))
      .filter((p) => !q || (p.title || "").toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
    return list.sort((a, b) =>
      sort === "popular" ? (b.clicks || 0) - (a.clicks || 0) : b.createdAt - a.createdAt
    );
  }, [products, cat, favOnly, followOnly, q, sort, favorites, following]);

  const trending = useMemo(
    () =>
      [...products]
        .filter((p) => p.status === "approved")
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 6),
    [products]
  );

  async function handleGetDeal(p) {
    await recordClick(p);
    trackClick(p.id, p.marketerId, "feed");
    window.open(p.affiliateUrl, "_blank", "noopener,noreferrer");
    showToast(t("toast.openingDeal"));
  }

  function handleAddToCart(p, marketer) {
    trackClick(p.id, p.marketerId, "feed");
    addToCart(p, marketer);
  }

  return (
    <div className="pt-4 pb-2">
      {/* Hero strip */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 mb-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, var(--accent-subtle) 0%, var(--accent-2-subtle) 100%)",
          border: "1px solid var(--border)",
        }}
      >
        <p className="disp text-base font-semibold">{t("feed.heroTitle")}</p>
        <p className="text-xs text-muted mt-1">{t("feed.heroSub")}</p>
      </motion.div>

      {/* Creators rail */}
      {marketers.length > 0 && (
        <section className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2.5" style={{ color: "var(--accent)" }}>
            {t("feed.creators")}
          </p>
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {marketers.map((m) => (
              <button key={m.id} onClick={() => navigate(`/u/${m.slug || m.id}`)} className="tap flex flex-col items-center gap-1.5 shrink-0 w-16">
                <span className="rounded-full" style={{ boxShadow: "0 0 0 2px var(--border), 0 4px 10px rgba(60,20,40,0.12)" }}>
                  <CreatorAvatar marketer={m} size={44} />
                </span>
                <span className="text-[10.5px] font-medium truncate w-full text-center" style={{ color: "var(--text-secondary)" }}>{m.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Search */}
      <div className="relative mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-muted"
            style={{ insetInlineStart: 14 }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("feed.searchPlaceholder")}
            className="input-field w-full rounded-full py-2.5 text-sm"
            style={{ paddingInlineStart: 40, paddingInlineEnd: 16 }}
          />
        </div>
        <button
          onClick={() => setShowScreenshotSearch(true)}
          className="tap p-2.5 rounded-full bg-white border-2 hover:border-accent transition-colors"
          style={{ borderColor: "var(--border)" }}
          title={t("search.screenshotSearch", "חיפוש בתמונה")}
        >
          <Camera size={20} style={{ color: "var(--accent)" }} />
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5 mb-4">
        <div className="flex rounded-full p-1 flex-1 surface-subtle">
          {[
            { id: "newest", l: t("feed.sortNewest") },
            { id: "popular", l: t("feed.sortPopular") },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className="tap flex-1 py-1.5 rounded-full text-[11px] font-semibold transition-colors"
              style={{
                background: sort === s.id ? "var(--bg-elevated)" : "transparent",
                color: sort === s.id ? "var(--text)" : "var(--text-muted)",
              }}
            >
              {s.l}
            </button>
          ))}
        </div>
        <IconButton onClick={() => setFavOnly((v) => !v)} label={t("feed.favoritesOnly")} active={favOnly}>
          <Heart size={15} fill={favOnly ? "var(--danger)" : "none"} color={favOnly ? "var(--danger)" : undefined} />
        </IconButton>
        <IconButton onClick={() => setFollowOnly((v) => !v)} label={t("feed.followingOnly")} active={followOnly}>
          <UserCheck size={15} />
        </IconButton>
        <IconButton onClick={() => setView(view === "grid" ? "stream" : "grid")} label={t("common.toggleView")}>
          {view === "grid" ? <Rows3 size={15} /> : <LayoutGrid size={15} />}
        </IconButton>
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-4 -mx-1 px-1 scrollbar-hide">
        {["All", ...CATEGORY_KEYS].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className="tap whitespace-nowrap text-xs font-medium px-3.5 py-2 rounded-full shrink-0 transition-colors"
            style={{
              background: cat === c ? "var(--text)" : "var(--bg-elevated)",
              color: cat === c ? "var(--bg)" : "var(--text-secondary)",
              border: `1px solid ${cat === c ? "var(--text)" : "var(--border)"}`,
            }}
          >
            {c === "All" ? t("feed.all") : categoryLabel(c)}
          </button>
        ))}
      </div>

      {/* Trending rail */}
      {!q && !favOnly && !followOnly && cat === "All" && trending.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} style={{ color: "var(--accent)" }} />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("feed.trending")}</p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {trending.map((p) => (
              <button
                key={`t-${p.id}`}
                onClick={() => setActive(p)}
                className="tap shrink-0 w-28 text-start"
              >
                <div className="w-28 h-36 rounded-xl overflow-hidden surface mb-2">
                  {p.image ? (
                    <img src={p.image} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" style={{ background: "var(--accent-subtle)" }} />
                  )}
                </div>
                <p className="text-[11px] font-medium line-clamp-2">{p.title}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Products */}
      {visible.length === 0 ? (
        <EmptyState
          icon={q || favOnly || followOnly ? Search : ShoppingBag}
          title={q || favOnly || followOnly ? t("feed.emptySearchTitle") : t("feed.emptyTitle")}
          body={q || favOnly || followOnly ? t("feed.emptySearchBody") : t("feed.emptyBody")}
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          {visible.map((p, i) => (
            <ProductCard
              key={p.id}
              p={p}
              marketer={getMarketer(p.marketerId)}
              isTop={topIds.has(p.marketerId)}
              lang={lang}
              isFav={favorites.includes(p.id)}
              onToggleFavorite={() => toggleFavorite(p.id)}
              onOpen={() => setActive(p)}
              onAddToCart={handleAddToCart}
              index={i}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((p, i) => (
            <StreamCard
              key={p.id}
              p={p}
              marketer={getMarketer(p.marketerId)}
              isTop={topIds.has(p.marketerId)}
              lang={lang}
              isFav={favorites.includes(p.id)}
              onToggleFavorite={() => toggleFavorite(p.id)}
              onOpen={() => setActive(p)}
              index={i}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {active && (
          <ProductModal
            product={active}
            marketer={getMarketer(active.marketerId)}
            isTop={topIds.has(active.marketerId)}
            lang={lang}
            isFav={favorites.includes(active.id)}
            onToggleFavorite={() => toggleFavorite(active.id)}
            onClose={() => setActive(null)}
            onGetDeal={() => handleGetDeal(active)}
          />
        )}
      </AnimatePresence>

      {/* Screenshot Search Modal */}
      <ScreenshotSearchModal
        isOpen={showScreenshotSearch}
        onClose={() => setShowScreenshotSearch(false)}
      />
    </div>
  );
}
