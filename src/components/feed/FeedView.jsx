import { useState, useMemo, useEffect, useCallback } from "react";
import { Search, ShoppingBag, LayoutGrid, Rows3, Heart, UserCheck, TrendingUp, Play, Sparkles, TrendingDown, Award } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { useCart } from "../../context/CartContext";
import { useVideos } from "../../context/VideoContext";
import { getTopCreatorIds, normalizeImageUrl, money } from "../../utils/helpers";
import { trackClick } from "../../lib/analytics";
import { isPublicCatalogProduct } from "../../lib/cloud/catalog";
import { buildUserProfile, getPersonalizedFeed, getTrendingProducts, getCreatorRecommendations, getFeedBadges } from "../../lib/recommendations";
import { CATEGORY_KEYS } from "../../lib/i18n";
import { EmptyState, IconButton } from "../ui";
import { ProductCard, StreamCard, ProductModal, CreatorAvatar } from "../product/ProductComponents";
import { ScreenshotSearchModal } from "../search/ScreenshotSearchModal";
import { ReelsPlayer } from "../video/ReelsPlayer";
import ViralProofTicker from "./ViralProofTicker";
import LunaAssistant from "../ambassador/LunaAssistant";
import CloudHomeStrip from "./CloudHomeStrip";
import TrendingBar from "./TrendingBar";
import StudioFeed from "./StudioFeed";
import { LunaAvatar } from "../ambassador/LunaAvatar";
import { composeLunaFace } from "../../lib/cloud/lunaFace";
import { lunaPersona } from "../../lib/lunaAvatar";

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
  const [discovery, setDiscovery] = useState(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [trend, setTrend] = useState(null);
  const [sort, setSort] = useState("newest");
  const [favOnly, setFavOnly] = useState(false);
  const [followOnly, setFollowOnly] = useState(false);
  const [active, setActive] = useState(null);
  const [showScreenshotSearch, setShowScreenshotSearch] = useState(false);
  const [playReel, setPlayReel] = useState(null);
  const { videos: allVideos } = useVideos();

  // Deep-link support for Google Merchant feed links (`/p/:id` and `/?product=<id>`):
  // open that product's modal only when it is publicly attributable.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("product");
    if (!id) return;
    const target = products.find((p) => p.id === id && isPublicCatalogProduct(p, marketers));
    if (target) setActive(target);
    // Clean the param off the URL without a page reload or history entry.
    const url = new URL(window.location.href);
    url.searchParams.delete("product");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [products, marketers]);

  const getMarketer = (id) => marketers.find((m) => m.id === id) || null;
  const topIds = useMemo(() => getTopCreatorIds(products.filter((p) => isPublicCatalogProduct(p, marketers))), [products, marketers]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const now = Date.now();
    const boostedRank = (p) => ((p.boostedUntil || 0) > now ? p.boostedUntil || 0 : 0);

    let list = products
      .filter((p) => isPublicCatalogProduct(p, marketers))
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
  }, [products, marketers, cat, favOnly, followOnly, q, sort, favorites, following]);

  // Adaptive Discovery: when the buyer searches, ask the Cloud "what's best?"
  // The discovery engine scores by verified revenue > sales > engagement > clicks,
  // with fatigue + freshness — so the answer changes as evidence changes.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setDiscovery(null); return; }
    let cancelled = false;
    setDiscoveryLoading(true);
    const ctrl = new AbortController();
    fetch("/api/store?mode=discover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: q }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok) setDiscovery({ ...data, decisionId: data.decisionId || `dec_${Date.now()}` });
        else setDiscovery(null);
      })
      .catch(() => { if (!cancelled) setDiscovery(null); })
      .finally(() => { if (!cancelled) setDiscoveryLoading(false); });

    // Also fetch live trend data for the studio feed
    fetch("/api/store?mode=trends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data?.ok) setTrend(data); })
      .catch(() => {});

    return () => { cancelled = true; ctrl.abort(); };
  }, [query]);

  const trending = useMemo(
    () =>
      [...products]
        .filter((p) => isPublicCatalogProduct(p, marketers))
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 6),
    [products, marketers]
  );

  // תגיות אמינות — אילו מוצרים מגיעים לתגית (מומלץ / הכי נמכר / טרנדינג)
  const feedBadges = useMemo(
    () => getFeedBadges(products || [], sales || [], { topN: 5 }),
    [products, sales]
  );

  // LTK-style curated sections
  const popularToday = useMemo(
    () =>
      [...products]
        .filter((p) => isPublicCatalogProduct(p, marketers))
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
        .filter((p) => isPublicCatalogProduct(p, marketers))
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 8),
    [products]
  );

  const userProfile = useMemo(
    () => buildUserProfile(products, { id: "guest-user" }, favorites, following, clicks || [], []),
    [products, favorites, following, clicks]
  );

  const aiDiscovery = useMemo(
    () => getPersonalizedFeed(products.filter((p) => isPublicCatalogProduct(p, marketers)), userProfile, 6),
    [products, userProfile]
  );

  const liveTrendPicks = useMemo(
    () => getTrendingProducts(products.filter((p) => isPublicCatalogProduct(p, marketers)), clicks || [], sales || [], 7).slice(0, 4),
    [products, clicks, sales]
  );

  const creatorMatches = useMemo(
    () => getCreatorRecommendations(marketers, userProfile, products.filter((p) => isPublicCatalogProduct(p, marketers)), 4),
    [marketers, userProfile, products]
  );

  const findsUnder100 = useMemo(
    () =>
      [...products]
        .filter((p) => isPublicCatalogProduct(p, marketers) && p.price > 0 && p.price <= 100)
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
      {/* Public value proposition: make the product clear before the catalog. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="ll-hero mb-5 relative overflow-hidden"
      >
        <div className="ll-hero-glow" aria-hidden="true" />
        <div className="relative z-10 max-w-2xl">
          <p className="ll-kicker">LIKELINK · הבחירה שלך, במקום אחד</p>
          <h1 className="ll-hero-title">{t("feed.heroTitle")}</h1>
          <p className="ll-hero-copy">{t("feed.heroSub")}</p>
          <div className="ll-hero-actions">
            <button type="button" className="btn-primary tap px-4 py-2.5 text-sm" onClick={() => navigate("/sell")}>
              פתחי סטודיו
            </button>
            <span className="ll-hero-note">מוצרים שנבחרו על ידי יוצרות אמיתיות</span>
          </div>
        </div>
        <div className="ll-hero-mark" aria-hidden="true">
          <span>01</span>
          <span>DISCOVER</span>
        </div>
      </motion.div>

            {/* CloudFace — Luna speaks the live pick (real data, additive, before the strip) */}
      {discovery && discovery.hasResult && discovery.top && (() => {
        const face = composeLunaFace(discovery.top);
        if (!face || !face.ok) return null;
        const persona = lunaPersona();
        return (
          <section className="mb-5">
            <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(108,76,241,.16), rgba(255,255,255,.08))", border: "1px solid rgba(108,76,241,.32)" }}>
              <div className="relative z-10 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full shrink-0">
                  <LunaAvatar persona={persona} size={36} glow={false} />
                </div>
                <div className="min-w-0 flex-1" dir="rtl">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    {lang === "he" ? "לונה · הסטודיו הראשי חי" : "Luna · the main studio is alive"}
                  </p>
                  <p className="text-[14px] font-extrabold leading-snug mt-1" style={{ color: "var(--text)" }}>
                    {face.headline}
                  </p>
                  {face.followUp && (
                    <p className="text-[12.5px] font-semibold mt-1" style={{ color: "var(--text)" }}>
                      {face.followUp}
                    </p>
                  )}
                  <p className="text-[10.5px] text-muted mt-1">
                    {face.reasoning}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>
                      {face.badge}
                    </span>
                    <span className="text-[9px] text-muted">· {face.note}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

            {/* TrendingBar — what's hot live right now */}
      <TrendingBar />

      {/* StudioFeed — the studio's autonomous influencer-style post */}
      <StudioFeed discovery={discovery} trend={trend} navigate={navigate} />

      {/* Cloud Home Concierge — today's pick + Boost my studio (additive) */}
      <CloudHomeStrip navigate={navigate} />

      {/* Live social proof — the platform broadcasting "it runs itself" */}
      <ViralProofTicker />

      {/* Adaptive Discovery Result — "the best among the best" for this query */}
      {query.trim() && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {lang === "he" ? "המוצר המומלץ" : "Top Pick"}
              </p>
            </div>
            {discovery?.top?.trend?.emerging && (
              <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: "var(--accent)" }}>
                <TrendingUp className="w-3 h-3" />
                {lang === "he" ? "תנועה מתחזקת" : "Trending up"}
              </span>
            )}
          </div>

          {discoveryLoading ? (
            <div className="surface rounded-2xl p-6 text-center text-sm text-muted">
              {lang === "he" ? "מחפש את הכי טוב..." : "Finding the best..."}
            </div>
          ) : discovery && discovery.hasResult && discovery.top ? (
            <div className="surface rounded-2xl overflow-hidden shadow-sm">
              <div className="flex gap-4 p-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-[var(--bg-subtle)] shrink-0">
                  {discovery.top.image ? (
                    <img src={safeImgSrc(discovery.top.image)} alt={discovery.top.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🛍️</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold line-clamp-2">{discovery.top.title}</h3>
                    <span className="mono text-sm font-bold shrink-0" style={{ color: "var(--accent)" }}>
                      {money(discovery.top.price || 0, lang)}
                    </span>
                  </div>
                  {discovery.top.reasons?.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {discovery.top.reasons.slice(0, 2).map((r, i) => (
                        <li key={i} className="text-[11px] text-muted flex items-start gap-1">
                          <span style={{ color: "var(--accent)" }}>•</span> {r}
                        </li>
                      ))}
                    </ul>
                  )}
                  {discovery.top.badges?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {discovery.top.badges.map((b, i) => (
                        <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      className="btn-primary tap px-3 py-1.5 text-xs font-semibold"
                      onClick={() => {
                        const prod = products.find((p) => p.id === discovery.top.productId);
                        if (prod) {
                          recordClick(prod);
                          trackClick(prod.id, prod.marketerId, "discovery");
                          if (prod.affiliateUrl) window.open(prod.affiliateUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      {lang === "he" ? "קני עכשיו" : "Buy Now"}
                    </button>
                    {discovery.alternatives?.length > 0 && (
                      <span className="text-[10px] text-muted">
                        +{discovery.alternatives.length} {lang === "he" ? "אפשרויות נוספות" : "more options"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : discovery && !discovery.hasResult ? (
            <div className="surface rounded-2xl p-5 text-center">
              <p className="text-sm text-muted">{discovery.message || (lang === "he" ? "לא נמצאו מוצרים מתאימים" : "No matching products found")}</p>
            </div>
          ) : null}
        </section>
      )}

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

      {/* Public Reels rail — רילס של יוצרות, מוכנים לצפייה בקנייה ישירה */}
      {allVideos.length > 0 && (
        <section className="mb-5">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              Reels · {t("feed.reels", "רילס לייקלינק")}
            </p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {allVideos.slice(0, 10).map((v) => {
              const prod = products.find((p) => p.id === (v.productTags?.[0]?.productId || "")) || products[0];
              const mk = prod && marketers.find((m) => m.id === prod.marketerId);
              return (
                <button
                  key={v.id}
                  onClick={() => setPlayReel(v)}
                  className="tap shrink-0 w-28 overflow-hidden rounded-xl surface shadow-sm relative"
                >
                  {prod?.image ? (
                    <img src={safeImgSrc(prod.image)} alt={v.title || ""} className="w-full aspect-[9/16] object-cover" loading="lazy" />
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
                  <span className="absolute bottom-1 left-1 right-1 text-[9px] font-semibold text-white truncate text-center" style={{ background: "rgba(0,0,0,0.45)", borderRadius: 6, padding: "1px 4px" }}>
                    {mk?.name || v.title || "ריל"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Style category visual grid (LTK-style) */}
      {!q && activeNav === "discover" && (
        <div className="mb-5">
          <div className="grid grid-cols-3 gap-3">
            {styleCategories.map((c) => {
                            const catProducts = products.filter((p) => isPublicCatalogProduct(p, marketers) && p.category === c.id);
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
              badge={feedBadges.get(p.id) || null}
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
              badge={feedBadges.get(p.id) || null}
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

      {/* Reels Player — נגן רילס מלא עם טאג קנייה */}
      {playReel && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
          <div className="relative w-full max-w-[300px]">
            <ReelsPlayer
              video={playReel}
              onClose={() => setPlayReel(null)}
              onProductClick={(prod, mk) => {
                setPlayReel(null);
                setActive(prod);
              }}
            />
          </div>
        </div>
      )}

      {/* Luna — הדוברת הדיגיטלית: מפתה לפתוח סטודיו ולגלות */}
      <LunaAssistant
        onOpenStudio={() => navigate("/studio")}
      />
    </div>
  );
}
