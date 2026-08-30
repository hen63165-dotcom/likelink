import { useState, useMemo, useEffect } from "react";
import { Search, ShoppingBag, LayoutGrid, Rows3, Heart, UserCheck, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { useCart } from "../../context/CartContext";
import { getTopCreatorIds, normalizeImageUrl, money } from "../../utils/helpers";
import { trackClick } from "../../lib/analytics";
import { buildUserProfile, getPersonalizedFeed, getTrendingProducts, getCreatorRecommendations } from "../../lib/recommendations";
import { CATEGORY_KEYS } from "../../lib/i18n";
import { EmptyState, IconButton } from "../ui";
import { ProductCard, StreamCard, ProductModal, CreatorAvatar } from "../product/ProductComponents";
import { ScreenshotSearchModal } from "../search/ScreenshotSearchModal";

// Resolve image URLs against the app origin so relative / protocol-relative
// URLs load correctly on the live web app — not just on localhost.
const safeImgSrc = (raw) =>
  normalizeImageUrl(raw, typeof window !== "undefined" ? window.location.origin : "");

export default function FeedView({ navigate, query, setQuery, activeNav }) {
  const { t, lang, categoryLabel } = useI18n();
  const { products, marketers, favorites, following, toggleFavorite, recordClick, showToast, sales, clicks } = useMarketplace();
  const { addItem: addToCart } = useCart();

  const [view, setView] = useState("grid");
  const [cat, setCat] = useState("All");
  const [sort, setSort] = useState("newest");
  const [favOnly, setFavOnly] = useState(false);
  const [followOnly, setFollowOnly] = useState(false);
  const [active, setActive] = useState(null);
  const [showScreenshotSearch, setShowScreenshotSearch] = useState(false);

  // Deep-link support for Google Merchant feed links (`/?product=<id>`): open
  // that product's modal on load so every g:link in google-feed.xml resolves to
  // a page that actually shows the product.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("product");
    if (!id) return;
    const target = products.find((p) => p.id === id && p.status === "approved");
    if (target) setActive(target);
    // Clean the param off the URL without a page reload or history entry.
    const url = new URL(window.location.href);
    url.searchParams.delete("product");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [products]);

  const getMarketer = (id) => marketers.find((m) => m.id === id) || null;
  const topIds = useMemo(() => getTopCreatorIds(products), [products]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const now = Date.now();
    const boostedRank = (p) => ((p.boostedUntil || 0) > now ? p.boostedUntil || 0 : 0);

    let list = products
      .filter((p) => p.status === "approved")
      .filter((p) => cat === "All" || p.category === cat)
      .filter((p) => !favOnly || favorites.includes(p.id))
      .filter((p) => !followOnly || following.includes(p.marketerId));

    // Smart search: ranked scoring (title/description/category). Prefix matches
    // weigh most, boosts add a bonus — so best-match wins and deals stay fair.
    if (q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length) {
        return list
          .map((p) => {
            const title = String(p.title || "").toLowerCase();
            const desc = String(p.description || "").toLowerCase();
            let sc = 0;
            words.forEach((w) => {
              if (title.includes(w)) sc += title.startsWith(w) ? 8 : 4;
              if (desc.includes(w)) sc += 2;
              if (String(p.category || "").toLowerCase().includes(w)) sc += 1;
            });
            if (sc > 0 && boostedRank(p)) sc += 5;
            return { p, sc };
          })
          .filter((x) => x.sc > 0)
          .sort((a, b) => b.sc - a.sc)
          .map((x) => x.p);
      }
    }

    return [...list].sort((a, b) => {
      const ab = boostedRank(a);
      const bb = boostedRank(b);
      if (ab !== bb) return bb - ab; // boosted products drop-in to the top
      return sort === "popular" ? (b.clicks || 0) - (a.clicks || 0) : b.createdAt - a.createdAt;
    });
  }, [products, cat, favOnly, followOnly, q, sort, favorites, following]);

  const trending = useMemo(
    () =>
      [...products]
        .filter((p) => p.status === "approved")
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 6),
    [products]
  );

  // LTK-style curated sections
  const popularToday = useMemo(
    () =>
      [...products]
        .filter((p) => p.status === "approved")
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 10),
    [products]
  );

  const topCreators = useMemo(
    () =>
      [...marketers]
        .map((m) => ({
          m,
          count:
            products.filter((p) => p.marketerId === m.id && p.status === "approved").length +
            products
              .filter((p) => p.marketerId === m.id)
              .reduce((sum, p) => sum + (p.clicks || 0), 0) / 100,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    [marketers, products]
  );

  // 🔥 Public, transparent leaderboard — "who actually earns" (LTK-style proof of life)
  const topEarners = useMemo(
    () =>
      [...marketers]
        .map((m) => ({
          m,
          productsCount: products.filter((p) => p.marketerId === m.id && p.status === "approved").length,
          net: (sales || []).filter((s) => s.marketerId === m.id).reduce((sum, s) => sum + (s.marketerNet || 0), 0),
        }))
        .filter((x) => x.net > 0 || x.productsCount > 0)
        .sort((a, b) => b.net - a.net)
        .slice(0, 5),
    [marketers, products, sales]
  );

  const topShared = useMemo(
    () =>
      [...products]
        .filter((p) => p.status === "approved")
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 8),
    [products]
  );

  const userProfile = useMemo(
    () => buildUserProfile(products, { id: "guest-user" }, favorites, following, clicks || [], []),
    [products, favorites, following, clicks]
  );

  const aiDiscovery = useMemo(
    () => getPersonalizedFeed(products.filter((p) => p.status === "approved"), userProfile, 6),
    [products, userProfile]
  );

  const liveTrendPicks = useMemo(
    () => getTrendingProducts(products.filter((p) => p.status === "approved"), clicks || [], sales || [], 7).slice(0, 4),
    [products, clicks, sales]
  );

  const creatorMatches = useMemo(
    () => getCreatorRecommendations(marketers, userProfile, products.filter((p) => p.status === "approved"), 4),
    [marketers, userProfile, products]
  );

  const findsUnder100 = useMemo(
    () =>
      [...products]
        .filter((p) => p.status === "approved" && p.price > 0 && p.price <= 100)
        .sort((a, b) => a.price - b.price)
        .slice(0, 10),
    [products]
  );

  const styleCategories = [
    { id: "Fashion", label: t("feed.fashionStyle"), color: "#fb7185" },
    { id: "Beauty", label: t("feed.beautyCare"), color: "#a78bfa" },
    { id: "Home", label: t("feed.lifestyleHome"), color: "#38bdf8" },
  ];

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

      {aiDiscovery.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">AI Discovery</p>
            </div>
            <span className="text-[10px] font-semibold" style={{ color: "var(--accent)" }}>personalized</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {aiDiscovery.map((p) => (
              <button key={p.id} onClick={() => setActive(p)} className="tap surface rounded-2xl overflow-hidden shadow-sm text-left">
                <div className="relative">
                  <div className="aspect-[4/5] overflow-hidden">
                    {safeImgSrc(p.image) ? (
                      <img src={safeImgSrc(p.image)} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full" style={{ background: "var(--accent-subtle)" }} />
                    )}
                  </div>
                  <span className="absolute right-2 top-2 rounded-full px-2 py-1 text-[10px] font-bold text-white" style={{ background: "rgba(24,24,24,0.7)" }}>AI</span>
                </div>
                <div className="p-2.5">
                  <p className="text-[12px] font-semibold line-clamp-2">{p.title}</p>
                  <p className="mono text-[11px] font-bold mt-1" style={{ color: "var(--accent)" }}>{money(p.price || 0, lang)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

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

      {/* Style category visual grid (LTK-style) */}
      {!q && activeNav === "discover" && (
        <div className="mb-5">
          <div className="grid grid-cols-3 gap-3">
            {styleCategories.map((c) => {
                            const catProducts = products.filter((p) => p.status === "approved" && p.category === c.id);
              const image = safeImgSrc(catProducts[0]?.image);
              return (
                <motion.button
                  key={c.id}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setCat(c.id)}
                  className="tap relative aspect-square rounded-2xl overflow-hidden border border-gray-100 shadow-sm"
                >
                                    {image ? (
                    <img src={image} alt={c.label} className="w-full h-full object-cover" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <div className="w-full h-full" style={{ background: `${c.color}33` }} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <span className="absolute bottom-2 inset-x-0 text-center text-white text-xs font-bold px-1">
                    {c.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Popular Today rail */}
      {!q && !favOnly && !followOnly && cat === "All" && activeNav === "discover" && popularToday.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">{t("feed.popularToday")}</p>
            <span className="text-[11px] text-gray-400">🔥</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {popularToday.map((p) => (
              <motion.button
                key={`pop-${p.id}`}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActive(p)}
                className="tap shrink-0 w-24 text-start"
              >
                                <div className="w-24 h-32 rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-2">
                  {safeImgSrc(p.image) ? (
                    <img src={safeImgSrc(p.image)} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" style={{ background: "var(--accent-subtle)" }} />
                  )}
                </div>
                <p className="text-[11px] font-medium line-clamp-2">{p.title || ""}</p>
                {p.price > 0 && (
                  <p className="mono text-xs font-bold mt-0.5" style={{ color: "var(--accent)" }}>
                    {money(p.price, lang)}
                  </p>
                )}
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* Trending Creators rail */}
      {!q && activeNav === "discover" && topCreators.length > 0 && (
        <section className="mb-6">
          <p className="text-sm font-bold mb-3">{t("feed.trendingCreators")}</p>
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {topCreators.map(({ m: creator }) => (
              <button
                key={creator.id}
                onClick={() => navigate(`/u/${creator.slug || creator.id}`)}
                className="tap flex flex-col items-center gap-1.5 shrink-0 w-16"
              >
                <span className="rounded-full" style={{ boxShadow: "0 0 0 2px var(--border), 0 4px 10px rgba(60,20,40,0.12)" }}>
                  <CreatorAvatar marketer={creator} size={46} />
                </span>
                <span className="text-[10.5px] font-medium truncate w-full text-center" style={{ color: "var(--text-secondary)" }}>
                  {creator.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Public earnings leaderboard — transparent, LTK-style proof of life */}
      {!q && activeNav === "discover" && topEarners.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} style={{ color: "var(--accent)" }} />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {lang === "he" ? "היוצרות שהכי מרוויחות" : "Top earning creators"}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {topEarners.map(({ m, net }, i) => (
              <button
                key={m.id}
                onClick={() => navigate(`/u/${m.slug || m.id}`)}
                className="tap surface rounded-2xl px-3 py-2.5 flex items-center gap-3 transition-shadow hover:shadow-card"
              >
                <span className="disp text-base font-bold w-6 text-center shrink-0" style={{ color: i === 0 ? "var(--accent)" : "var(--text-faint)" }}>
                  {i + 1}
                </span>
                <CreatorAvatar marketer={m} size={34} />
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-sm font-semibold truncate">{m.name}</span>
                  <span className="block text-[11px] text-muted">
                    {lang === "he" ? "רווח נקי" : "Net"} <span className="mono font-bold" style={{ color: "var(--accent)" }}>{money(net, lang)}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

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

      {liveTrendPicks.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} style={{ color: "var(--accent)" }} />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Live Momentum</p>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {liveTrendPicks.map((p) => (
              <button key={p.id} onClick={() => setActive(p)} className="tap shrink-0 w-28 text-start">
                <div className="w-28 h-36 rounded-xl overflow-hidden surface mb-2">
                  {safeImgSrc(p.image) ? (
                    <img src={safeImgSrc(p.image)} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full" style={{ background: "var(--accent-subtle)" }} />
                  )}
                </div>
                <p className="text-[11px] font-medium line-clamp-2">{p.title || ""}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {creatorMatches.length > 0 && (
        <section className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Creator Matches</p>
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {creatorMatches.map((creator) => (
              <button key={creator.id} onClick={() => navigate(`/u/${creator.slug || creator.id}`)} className="tap flex flex-col items-center gap-1.5 shrink-0 w-16">
                <CreatorAvatar marketer={creator} size={46} />
                <span className="text-[10.5px] font-medium truncate w-full text-center">{creator.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

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
                  {safeImgSrc(p.image) ? (
                    <img src={safeImgSrc(p.image)} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" style={{ background: "var(--accent-subtle)" }} />
                  )}
                </div>
                <p className="text-[11px] font-medium line-clamp-2">{p.title || ""}</p>
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
