import React, { useState, useEffect, useMemo } from "react";
import {
  ShoppingBag, TrendingUp, Plus, X, ExternalLink, Shield, Users,
  MousePointerClick, DollarSign, Check, Flag, LogOut, Sparkles,
  LayoutGrid, Rows3, ImageOff, Lock, Trash2, Receipt, CircleAlert,
  Search, Heart, Languages, Upload, Loader2, Share2, Star, Rocket, ArrowRight, ArrowLeft,
  UserCheck, UserPlus, Layers, Pencil
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { storage } from "./lib/storage";
import { uploadProductImage } from "./lib/uploadImage";
import { LangProvider, useI18n } from "./lib/LangContext";
import { CATEGORY_KEYS } from "./lib/i18n";

/* ---------------------------------------------------------------
   SOCIAL-COMMERCE HUB
   Canvas #FAFAF8  Ink #14121F  Primary #6C4CF1 (indigo)
   Success #00C896  Muted #8B879C  Card border #ECEAF3
   Display: Space Grotesk / Body: Inter / Hebrew fallback: Heebo
----------------------------------------------------------------*/

const ADMIN_CODE = "hub-admin"; // demo-only client-side gate — replace with real auth before going live

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const CURRENCY = { he: "₪", en: "$" };
const money = (n, lang = "en") => `${CURRENCY[lang] || "$"}${(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2)}`;

function slugify(str) {
  return (
    str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u0590-\u05FF]+/g, "-")
      .replace(/^-+|-+$/g, "") || "creator"
  );
}
function uniqueSlug(base, existingSlugs) {
  let slug = base;
  let i = 2;
  while (existingSlugs.includes(slug)) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}
function getTopCreatorIds(products, n = 3) {
  const totals = {};
  products.forEach((p) => {
    if (p.status === "approved") totals[p.marketerId] = (totals[p.marketerId] || 0) + (p.clicks || 0);
  });
  return new Set(
    Object.entries(totals)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => id)
  );
}
function parsePath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "u" && parts[1]) return { type: "creator", slug: decodeURIComponent(parts[1]) };
  return { type: "home" };
}
function groupByDay(sales, valueKey, days = 14) {
  const now = new Date();
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ key, label: `${d.getDate()}/${d.getMonth() + 1}`, value: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  sales.forEach((s) => {
    const key = new Date(s.ts).toISOString().slice(0, 10);
    if (byKey[key]) byKey[key].value += s[valueKey] || 0;
  });
  return buckets;
}

async function getJSON(key, shared, fallback) {
  const res = await storage.get(key, shared);
  try {
    return res ? JSON.parse(res.value) : fallback;
  } catch {
    return fallback;
  }
}
async function setJSON(key, value, shared) {
  await storage.set(key, JSON.stringify(value), shared);
}

const K = {
  marketers: "marketplace:marketers",
  products: "marketplace:products",
  clicks: "marketplace:clicks",
  sales: "marketplace:sales",
  settings: "marketplace:settings",
  session: "session:marketerId",
  favorites: "ui:favorites",
  introSeen: "ui:sellIntroSeen",
  collections: "marketplace:collections",
  following: "ui:following",
};

export default function AppRoot() {
  return (
    <LangProvider>
      <App />
    </LangProvider>
  );
}

/* ================================================================== */

function App() {
  const { t, lang, setLang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("feed");
  const [marketers, setMarketers] = useState([]);
  const [products, setProducts] = useState([]);
  const [clicks, setClicks] = useState([]);
  const [sales, setSales] = useState([]);
  const [settings, setSettings] = useState({ platformFeePercent: 15 });
  const [sessionMarketerId, setSessionMarketerId] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [collections, setCollections] = useState([]);
  const [following, setFollowing] = useState([]);
  const [introSeen, setIntroSeen] = useState(false);
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(path) {
    window.history.pushState({}, "", path);
    setRoute(parsePath(path));
  }

  useEffect(() => {
    (async () => {
      const [m, p, c, s, st, sess, fav, intro, cols, follow] = await Promise.all([
        getJSON(K.marketers, true, []),
        getJSON(K.products, true, []),
        getJSON(K.clicks, true, []),
        getJSON(K.sales, true, []),
        getJSON(K.settings, true, { platformFeePercent: 15 }),
        getJSON(K.session, false, { marketerId: null }),
        getJSON(K.favorites, false, []),
        getJSON(K.introSeen, false, false),
        getJSON(K.collections, true, []),
        getJSON(K.following, false, []),
      ]);
      setMarketers(m);
      setProducts(p);
      setClicks(c);
      setSales(s);
      setSettings(st);
      setSessionMarketerId(sess?.marketerId || null);
      setFavorites(fav);
      setIntroSeen(Boolean(intro));
      setCollections(cols);
      setFollowing(follow);
      setLoading(false);
    })();
  }, []);

  function showToast(msg) {
    setToast({ msg });
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 2600);
  }

  const persistMarketers = async (next) => { setMarketers(next); await setJSON(K.marketers, next, true); };
  const persistProducts = async (next) => { setProducts(next); await setJSON(K.products, next, true); };
  const persistClicks = async (next) => { setClicks(next); await setJSON(K.clicks, next, true); };
  const persistSales = async (next) => { setSales(next); await setJSON(K.sales, next, true); };
  const persistSettings = async (next) => { setSettings(next); await setJSON(K.settings, next, true); };
  const persistSession = async (marketerId) => {
    setSessionMarketerId(marketerId);
    await setJSON(K.session, { marketerId }, false);
  };
  const toggleFavorite = async (productId) => {
    const next = favorites.includes(productId) ? favorites.filter((id) => id !== productId) : [...favorites, productId];
    setFavorites(next);
    await setJSON(K.favorites, next, false);
  };
  const dismissIntro = async () => {
    setIntroSeen(true);
    await setJSON(K.introSeen, true, false);
  };
  const persistCollections = async (next) => { setCollections(next); await setJSON(K.collections, next, true); };
  const toggleFollow = async (marketerId) => {
    const next = following.includes(marketerId) ? following.filter((id) => id !== marketerId) : [...following, marketerId];
    setFollowing(next);
    await setJSON(K.following, next, false);
  };

  const currentMarketer = useMemo(
    () => marketers.find((m) => m.id === sessionMarketerId) || null,
    [marketers, sessionMarketerId]
  );

  async function recordClick(product) {
    const c = { id: uid(), productId: product.id, marketerId: product.marketerId, ts: Date.now() };
    await persistClicks([...clicks, c]);
    await persistProducts(products.map((p) => (p.id === product.id ? { ...p, clicks: (p.clicks || 0) + 1 } : p)));
  }

  if (loading) {
    return (
      <div style={{ background: "#FAFAF8" }} className="w-full h-full min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-full border-2 border-[#ECEAF3] border-t-[#6C4CF1] animate-spin" />
          <span style={{ fontFamily: "'Space Grotesk','Heebo',sans-serif" }} className="text-sm text-[#8B879C]">
            Loading…
          </span>
        </div>
      </div>
    );
  }

  if (route.type === "creator") {
    return (
      <div
        className="w-full min-h-screen flex flex-col"
        style={{ background: "#FAFAF8", fontFamily: "'Inter','Heebo',sans-serif", color: "#14121F" }}
      >
        <style>{`
          .disp { font-family: 'Space Grotesk', 'Heebo', sans-serif; }
          .mono { font-family: 'JetBrains Mono', 'Heebo', monospace; }
          .tap { transition: transform .12s ease, opacity .12s ease; }
          .tap:active { transform: scale(0.96); opacity: .85; }
        `}</style>
        <CreatorProfilePage
          slug={route.slug}
          marketers={marketers}
          products={products}
          collections={collections}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          following={following}
          onToggleFollow={toggleFollow}
          onOpenClick={recordClick}
          showToast={showToast}
          navigate={navigate}
          lang={lang}
          setLang={setLang}
        />
        {toast && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-6 px-4 py-2.5 rounded-full shadow-lg z-50 text-sm font-medium tap" style={{ background: "#14121F", color: "#FAFAF8" }}>
            {toast.msg}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="w-full min-h-screen flex flex-col"
      style={{ background: "#FAFAF8", fontFamily: "'Inter','Heebo',sans-serif", color: "#14121F" }}
    >
      <style>{`
        .disp { font-family: 'Space Grotesk', 'Heebo', sans-serif; }
        .mono { font-family: 'JetBrains Mono', 'Heebo', monospace; }
        .tap { transition: transform .12s ease, opacity .12s ease; }
        .tap:active { transform: scale(0.96); opacity: .85; }
      `}</style>

      <TopBar tab={tab} feeRate={settings.platformFeePercent} lang={lang} setLang={setLang} />

      <main className="flex-1 w-full max-w-[520px] mx-auto pb-24 px-4">
        {tab === "feed" && (
          <FeedView
            products={products}
            marketers={marketers}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            following={following}
            onOpenClick={recordClick}
            showToast={showToast}
          />
        )}
        {tab === "sell" && (
          <SellView
            marketer={currentMarketer}
            marketers={marketers}
            products={products}
            sales={sales}
            settings={settings}
            showToast={showToast}
            navigate={navigate}
            introSeen={introSeen}
            onDismissIntro={dismissIntro}
            collections={collections}
            onAddCollection={async (title) => {
              const col = { id: uid(), marketerId: currentMarketer.id, title, productIds: [], createdAt: Date.now() };
              await persistCollections([...collections, col]);
            }}
            onUpdateCollection={async (id, productIds) => {
              await persistCollections(collections.map((c) => (c.id === id ? { ...c, productIds } : c)));
            }}
            onDeleteCollection={async (id) => {
              await persistCollections(collections.filter((c) => c.id !== id));
            }}
            onLogin={async (m) => { await persistSession(m.id); }}
            onSignup={async (name, email) => {
              const existing = marketers.find((m) => m.email.toLowerCase() === email.toLowerCase());
              if (existing) {
                await persistSession(existing.id);
                showToast(`${t("sell.welcomeBack")} ${existing.name.split(" ")[0]}`);
                return;
              }
              const m = { id: uid(), name, email, slug: uniqueSlug(slugify(name), marketers.map((x) => x.slug).filter(Boolean)), createdAt: Date.now() };
              await persistMarketers([...marketers, m]);
              await persistSession(m.id);
              showToast(t("sell.studioCreated"));
            }}
            onLogout={async () => { await persistSession(null); }}
            onAddProduct={async (draft) => {
              const p = {
                id: uid(),
                marketerId: currentMarketer.id,
                title: draft.title,
                description: draft.description,
                image: draft.image,
                affiliateUrl: draft.affiliateUrl,
                category: draft.category,
                price: Number(draft.price) || 0,
                commission: Number(draft.commission) || 0,
                status: "approved",
                clicks: 0,
                createdAt: Date.now(),
              };
              await persistProducts([...products, p]);
              showToast(t("sell.published"));
            }}
            onDeleteProduct={async (id) => {
              await persistProducts(products.filter((p) => p.id !== id));
              showToast(t("sell.removed"));
            }}
            onLogSale={async (product, saleAmount, commissionAmount) => {
              const fee = Math.round(commissionAmount * (settings.platformFeePercent / 100) * 100) / 100;
              const net = Math.round((commissionAmount - fee) * 100) / 100;
              const s = {
                id: uid(),
                productId: product.id,
                marketerId: product.marketerId,
                saleAmount,
                commissionAmount,
                platformFee: fee,
                marketerNet: net,
                ts: Date.now(),
              };
              await persistSales([...sales, s]);
              return s;
            }}
          />
        )}
        {tab === "admin" && (
          <AdminView
            marketers={marketers}
            products={products}
            clicks={clicks}
            sales={sales}
            settings={settings}
            onSetStatus={async (id, status) => {
              await persistProducts(products.map((p) => (p.id === id ? { ...p, status } : p)));
              showToast(status === "approved" ? t("admin.approved2") : status === "flagged" ? t("admin.flagged2") : t("admin.removed2"));
            }}
            onRemove={async (id) => {
              await persistProducts(products.filter((p) => p.id !== id));
              showToast(t("admin.removed2"));
            }}
            onSetFee={async (val) => { await persistSettings({ ...settings, platformFeePercent: val }); }}
          />
        )}
      </main>

      <BottomNav tab={tab} setTab={setTab} />

      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-24 px-4 py-2.5 rounded-full shadow-lg z-50 text-sm font-medium tap"
          style={{ background: "#14121F", color: "#FAFAF8" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ================================================================== TOP BAR */
function TopBar({ tab, feeRate, lang, setLang }) {
  const { t } = useI18n();
  const titles = { feed: t("topbar.feed"), sell: t("topbar.sell"), admin: t("topbar.admin") };
  return (
    <header className="w-full sticky top-0 z-40 backdrop-blur-md" style={{ background: "rgba(250,250,248,0.9)", borderBottom: "1px solid #ECEAF3" }}>
      <div className="max-w-[520px] mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#6C4CF1" }}>
            <Sparkles size={15} color="#fff" />
          </div>
          <span className="disp text-[17px] font-semibold tracking-tight">{titles[tab]}</span>
        </div>
        <div className="flex items-center gap-2">
          {tab === "feed" && (
            <span className="mono text-[10px] px-2 py-1 rounded-full whitespace-nowrap" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
              {feeRate}% {t("topbar.fee")}
            </span>
          )}
          <button
            onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="tap shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}
            aria-label="Switch language"
          >
            <Languages size={14} color="#6C4CF1" />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ================================================================== BOTTOM NAV */
function BottomNav({ tab, setTab }) {
  const { t } = useI18n();
  const items = [
    { id: "feed", label: t("nav.feed"), icon: ShoppingBag },
    { id: "sell", label: t("nav.sell"), icon: TrendingUp },
    { id: "admin", label: t("nav.admin"), icon: Shield },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40" style={{ background: "#FFFFFF", borderTop: "1px solid #ECEAF3" }}>
      <div className="max-w-[520px] mx-auto flex px-6 py-2">
        {items.map((it) => {
          const active = tab === it.id;
          const Icon = it.icon;
          return (
            <button key={it.id} onClick={() => setTab(it.id)} className="flex-1 flex flex-col items-center gap-1 py-1.5 tap">
              <Icon size={20} color={active ? "#6C4CF1" : "#8B879C"} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[11px] font-medium" style={{ color: active ? "#6C4CF1" : "#8B879C" }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ================================================================== FEED */
function FeedView({ products, marketers, favorites, onToggleFavorite, following, onOpenClick, showToast }) {
  const { t, lang, categoryLabel } = useI18n();
  const [view, setView] = useState("grid");
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest"); // newest | popular
  const [favOnly, setFavOnly] = useState(false);
  const [followOnly, setFollowOnly] = useState(false);
  const [active, setActive] = useState(null);

  const marketerName = (id) => marketers.find((m) => m.id === id)?.name || "—";
  const topIds = useMemo(() => getTopCreatorIds(products), [products]);

  const q = query.trim().toLowerCase();
  let visible = products
    .filter((p) => p.status === "approved")
    .filter((p) => cat === "All" || p.category === cat)
    .filter((p) => !favOnly || favorites.includes(p.id))
    .filter((p) => !followOnly || following.includes(p.marketerId))
    .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));

  visible = visible.sort((a, b) => (sort === "popular" ? (b.clicks || 0) - (a.clicks || 0) : b.createdAt - a.createdAt));

  async function handleGetDeal(p) {
    await onOpenClick(p);
    window.open(p.affiliateUrl, "_blank", "noopener,noreferrer");
    showToast(t("toast.openingDeal"));
  }

  return (
    <div className="pt-3">
      {/* search */}
      <div className="relative mb-3">
        <Search size={15} color="#B4AFC0" className="absolute top-1/2 -translate-y-1/2 rtl:right-3 ltr:left-3" style={{ insetInlineStart: 12 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("feed.searchPlaceholder")}
          className="w-full rounded-full py-2.5 text-[13.5px] outline-none"
          style={{ background: "#FFFFFF", border: "1px solid #ECEAF3", paddingInlineStart: 36, paddingInlineEnd: 14 }}
        />
      </div>

      {/* sort + favorites + view toggle */}
      <div className="flex items-center gap-1.5 mb-3">
        <div className="flex rounded-full p-1 flex-1" style={{ background: "#F1EFFB" }}>
          {[{ id: "newest", l: t("feed.sortNewest") }, { id: "popular", l: t("feed.sortPopular") }].map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className="tap flex-1 py-1.5 rounded-full text-[11.5px] font-semibold"
              style={{ background: sort === s.id ? "#fff" : "transparent", color: sort === s.id ? "#14121F" : "#8B879C" }}
            >
              {s.l}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFavOnly((v) => !v)}
          className="tap shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: favOnly ? "#FBEAEA" : "#FFFFFF", border: "1px solid " + (favOnly ? "#F3C9C9" : "#ECEAF3") }}
          aria-label={t("feed.favoritesOnly")}
        >
          <Heart size={15} color={favOnly ? "#E1483B" : "#8B879C"} fill={favOnly ? "#E1483B" : "none"} />
        </button>
        <button
          onClick={() => setFollowOnly((v) => !v)}
          className="tap shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: followOnly ? "#EEEAFB" : "#FFFFFF", border: "1px solid " + (followOnly ? "#D9CDF5" : "#ECEAF3") }}
          aria-label={t("feed.followingOnly")}
        >
          <UserCheck size={15} color={followOnly ? "#6C4CF1" : "#8B879C"} />
        </button>
        <button
          onClick={() => setView(view === "grid" ? "stream" : "grid")}
          className="tap shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}
        >
          {view === "grid" ? <Rows3 size={15} /> : <LayoutGrid size={15} />}
        </button>
      </div>

      {/* category chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1">
        {["All", ...CATEGORY_KEYS].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className="tap whitespace-nowrap text-[12.5px] font-medium px-3 py-1.5 rounded-full shrink-0"
            style={{
              background: cat === c ? "#14121F" : "#FFFFFF",
              color: cat === c ? "#FAFAF8" : "#4A4658",
              border: "1px solid " + (cat === c ? "#14121F" : "#ECEAF3"),
            }}
          >
            {c === "All" ? t("feed.all") : categoryLabel(c)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={q || favOnly || followOnly ? Search : ShoppingBag}
          title={q || favOnly || followOnly ? t("feed.emptySearchTitle") : t("feed.emptyTitle")}
          body={q || favOnly || followOnly ? t("feed.emptySearchBody") : t("feed.emptyBody")}
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              creator={marketerName(p.marketerId)}
              isTop={topIds.has(p.marketerId)}
              lang={lang}
              isFav={favorites.includes(p.id)}
              onToggleFavorite={() => onToggleFavorite(p.id)}
              onOpen={() => setActive(p)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((p) => (
            <StreamCard
              key={p.id}
              p={p}
              creator={marketerName(p.marketerId)}
              isTop={topIds.has(p.marketerId)}
              lang={lang}
              isFav={favorites.includes(p.id)}
              onToggleFavorite={() => onToggleFavorite(p.id)}
              onOpen={() => setActive(p)}
            />
          ))}
        </div>
      )}

      {active && (
        <ProductModal
          product={active}
          creator={marketerName(active.marketerId)}
          isTop={topIds.has(active.marketerId)}
          lang={lang}
          isFav={favorites.includes(active.id)}
          onToggleFavorite={() => onToggleFavorite(active.id)}
          onClose={() => setActive(null)}
          onGetDeal={() => handleGetDeal(active)}
        />
      )}
    </div>
  );
}

function ProductThumb({ p }) {
  return p.image ? (
    <img src={p.image} alt={p.title} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full flex items-center justify-center" style={{ background: "#F1EFFB" }}>
      <ImageOff size={20} color="#B9AEF0" />
    </div>
  );
}

function FavButton({ isFav, onToggle, floating }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={"tap flex items-center justify-center rounded-full " + (floating ? "absolute top-2 w-7 h-7" : "w-7 h-7")}
      style={{ insetInlineEnd: floating ? 8 : undefined, background: floating ? "rgba(255,255,255,0.92)" : "transparent" }}
    >
      <Heart size={15} color={isFav ? "#E1483B" : "#8B879C"} fill={isFav ? "#E1483B" : "none"} />
    </button>
  );
}

function TopBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#FFF4DC", color: "#B5820E" }}>
      <Star size={8} fill="#B5820E" /> {t("badge.top")}
    </span>
  );
}

function ProductCard({ p, creator, isTop, lang, isFav, onToggleFavorite, onOpen }) {
  return (
    <button onClick={onOpen} className="tap text-left w-full">
      <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
        <div className="w-full aspect-[4/5] overflow-hidden relative">
          <ProductThumb p={p} />
          <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
        </div>
        <div className="p-2.5">
          <p className="text-[13px] font-semibold leading-snug line-clamp-2">{p.title}</p>
          <div className="flex items-center justify-between mt-1.5 gap-1">
            <span className="text-[11px] text-[#8B879C] truncate flex items-center gap-1">{creator} {isTop && <TopBadge />}</span>
            {p.price > 0 && <span className="mono text-[12px] font-medium shrink-0">{money(p.price, lang)}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function StreamCard({ p, creator, isTop, lang, isFav, onToggleFavorite, onOpen }) {
  const { categoryLabel } = useI18n();
  return (
    <button onClick={onOpen} className="tap text-left w-full">
      <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
        <div className="w-full aspect-[16/10] overflow-hidden relative">
          <ProductThumb p={p} />
          <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
        </div>
        <div className="p-3.5">
          <span className="text-[10.5px] uppercase tracking-wide font-semibold" style={{ color: "#6C4CF1" }}>{categoryLabel(p.category)}</span>
          <p className="text-[15px] font-semibold leading-snug mt-1">{p.title}</p>
          <p className="text-[13px] text-[#8B879C] mt-1 line-clamp-2">{p.description}</p>
          <div className="flex items-center justify-between mt-3 gap-1">
            <span className="text-[12px] text-[#8B879C] flex items-center gap-1">{creator} {isTop && <TopBadge />}</span>
            {p.price > 0 && <span className="mono text-[13px] font-semibold shrink-0">{money(p.price, lang)}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function ProductModal({ product, creator, isTop, lang, isFav, onToggleFavorite, onClose, onGetDeal }) {
  const { t, categoryLabel } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,18,31,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-t-3xl overflow-hidden max-h-[88vh] flex flex-col" style={{ background: "#FFFFFF" }}>
        <div className="w-full aspect-[4/3] relative shrink-0">
          <ProductThumb p={product} />
          <button onClick={onClose} className="tap absolute top-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ insetInlineEnd: 12, background: "rgba(20,18,31,0.6)" }}>
            <X size={16} color="#fff" />
          </button>
          <div className="absolute top-3" style={{ insetInlineStart: 12 }}>
            <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
          </div>
        </div>
        <div className="p-5 overflow-y-auto">
          <span className="text-[10.5px] uppercase tracking-wide font-semibold" style={{ color: "#6C4CF1" }}>{categoryLabel(product.category)}</span>
          <h2 className="disp text-[20px] font-semibold mt-1 leading-tight">{product.title}</h2>
          <p className="text-[13.5px] text-[#8B879C] mt-1 flex items-center gap-1">{t("feed.by")} {creator} {isTop && <TopBadge />}</p>
          <p className="text-[14px] leading-relaxed mt-3" style={{ color: "#4A4658" }}>{product.description}</p>
          {product.price > 0 && <p className="mono text-[18px] font-semibold mt-4">{money(product.price, lang)}</p>}
          <button onClick={onGetDeal} className="tap w-full mt-5 rounded-2xl py-3.5 flex items-center justify-center gap-2 font-semibold text-[15px]" style={{ background: "#6C4CF1", color: "#fff" }}>
            {t("feed.getDeal")} <ExternalLink size={16} />
          </button>
          <p className="text-[11px] text-center text-[#B4AFC0] mt-2.5">{t("feed.opensNewTab")}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#F1EFFB" }}>
        <Icon size={24} color="#6C4CF1" />
      </div>
      <p className="disp text-[16px] font-semibold">{title}</p>
      <p className="text-[13.5px] text-[#8B879C] mt-1.5 max-w-[280px]">{body}</p>
    </div>
  );
}

/* ================================================================== SELL (Creator Studio) */
function SellView({ marketer, marketers, products, sales, settings, showToast, navigate, introSeen, onDismissIntro, collections, onAddCollection, onUpdateCollection, onDeleteCollection, onLogin, onSignup, onLogout, onAddProduct, onDeleteProduct, onLogSale }) {
  const { t, lang } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [showNewCollection, setShowNewCollection] = useState(false);

  if (!introSeen) {
    return <OnboardingIntro onDismiss={onDismissIntro} />;
  }

  if (!marketer) {
    return <AuthGate marketers={marketers} onLogin={onLogin} onSignup={onSignup} />;
  }

  const mine = products.filter((p) => p.marketerId === marketer.id).sort((a, b) => b.createdAt - a.createdAt);
  const myClicks = mine.reduce((s, p) => s + (p.clicks || 0), 0);
  const mySales = sales.filter((s) => s.marketerId === marketer.id);
  const myNet = mySales.reduce((s, x) => s + x.marketerNet, 0);
  const myLink = `${window.location.origin}/u/${marketer.slug || marketer.id}`;
  const myCollections = collections.filter((c) => c.marketerId === marketer.id);
  const chartData = groupByDay(mySales, "marketerNet");

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: marketer.name, url: myLink });
        return;
      } catch {
        /* user cancelled share sheet — fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(myLink);
      showToast(t("sell.linkCopied"));
    } catch {
      showToast(myLink);
    }
  }

  return (
    <div className="pt-3 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="disp text-[17px] font-semibold">{t("sell.studioTitle")} {marketer.name.split(" ")[0]}</p>
          <p className="text-[12.5px] text-[#8B879C]">{marketer.email}</p>
        </div>
        <button onClick={onLogout} className="tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
          <LogOut size={14} />
        </button>
      </div>

      <button onClick={handleShare} className="tap w-full rounded-2xl p-3.5 flex items-center gap-3 mb-4" style={{ background: "#14121F" }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#6C4CF1" }}>
          <Share2 size={15} color="#fff" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12.5px] font-semibold text-white">{t("sell.sharePage")}</p>
          <p className="text-[11px] truncate" style={{ color: "#A9A5BC" }}>{myLink.replace(/^https?:\/\//, "")}</p>
        </div>
        <ArrowLeft size={15} color="#8B879C" className="shrink-0" style={{ transform: "scaleX(var(--flip,1))" }} />
      </button>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <StatChip icon={ShoppingBag} label={t("sell.statListings")} value={mine.length} />
        <StatChip icon={MousePointerClick} label={t("sell.statClicks")} value={myClicks} />
        <StatChip icon={DollarSign} label={t("sell.statNet")} value={money(myNet, lang)} accent />
      </div>

      <EarningsChart title={t("sell.earningsChart")} data={chartData} lang={lang} />

      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[12.5px] font-semibold flex items-center gap-1.5"><Layers size={14} color="#6C4CF1" /> {t("sell.collectionsTitle")}</p>
        <button onClick={() => setShowNewCollection(true)} className="tap text-[11.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
          <Plus size={12} /> {t("sell.newCollection")}
        </button>
      </div>

      {myCollections.length === 0 ? (
        <p className="text-[12px] text-[#B4AFC0] mb-5">{t("sell.emptyCollections")}</p>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {myCollections.map((c) => (
            <div key={c.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#F1EFFB" }}>
                <Layers size={16} color="#6C4CF1" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{c.title}</p>
                <p className="text-[11px] text-[#8B879C]">{c.productIds.length} {t("sell.statListings")}</p>
              </div>
              <button onClick={() => setEditingCollection(c)} className="tap w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "#F1EFFB" }}>
                <Pencil size={12} color="#6C4CF1" />
              </button>
              <button onClick={() => onDeleteCollection(c.id)} className="tap w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "#FBEAEA" }}>
                <Trash2 size={12} color="#E1483B" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setShowForm(true)} className="tap w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 font-semibold text-[15px] mb-5" style={{ background: "#14121F", color: "#fff" }}>
        <Plus size={17} /> {t("sell.postProduct")}
      </button>

      {mine.length === 0 ? (
        <EmptyState icon={TrendingUp} title={t("sell.emptyTitle")} body={t("sell.emptyBody")} />
      ) : (
        <div className="flex flex-col gap-3">
          {mine.map((p) => (
            <CreatorProductRow key={p.id} p={p} lang={lang} feeRate={settings.platformFeePercent} onDelete={() => onDeleteProduct(p.id)} onLogSale={(amt, comm) => onLogSale(p, amt, comm)} />
          ))}
        </div>
      )}

      {showForm && <ProductForm onClose={() => setShowForm(false)} onSubmit={(d) => { onAddProduct(d); setShowForm(false); }} />}
      {showNewCollection && (
        <NewCollectionModal
          onClose={() => setShowNewCollection(false)}
          onCreate={(title) => { onAddCollection(title); setShowNewCollection(false); }}
        />
      )}
      {editingCollection && (
        <CollectionEditorModal
          collection={editingCollection}
          myProducts={mine}
          onClose={() => setEditingCollection(null)}
          onSave={(productIds) => { onUpdateCollection(editingCollection.id, productIds); setEditingCollection(null); }}
        />
      )}
    </div>
  );
}

function NewCollectionModal({ onClose, onCreate }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,18,31,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-t-3xl" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between p-5 pb-2">
          <p className="disp text-[17px] font-semibold">{t("sell.newCollection")}</p>
          <button onClick={onClose} className="tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F1EFFB" }}>
            <X size={15} />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-5 pt-2">
          <LabeledInput label={t("sell.newCollection")} value={title} onChange={setTitle} placeholder={t("sell.collectionTitlePh")} />
          <button
            onClick={() => title.trim() && onCreate(title.trim())}
            className="tap w-full rounded-2xl py-3.5 font-semibold text-[15px]"
            style={{ background: "#6C4CF1", color: "#fff" }}
          >
            {t("sell.newCollection")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CollectionEditorModal({ collection, myProducts, onClose, onSave }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(collection.productIds);

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,18,31,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-t-3xl max-h-[85vh] overflow-y-auto" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between p-5 pb-2 sticky top-0" style={{ background: "#FFFFFF" }}>
          <p className="disp text-[17px] font-semibold">{collection.title}</p>
          <button onClick={onClose} className="tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F1EFFB" }}>
            <X size={15} />
          </button>
        </div>
        <div className="p-5 pt-2">
          {myProducts.length === 0 ? (
            <p className="text-[12.5px] text-[#8B879C] py-6 text-center">{t("sell.noProductsForCollection")}</p>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {myProducts.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} className="tap w-full flex items-center gap-3 rounded-xl p-2.5" style={{ background: on ? "#F1EFFB" : "#FAFAF8", border: "1px solid " + (on ? "#D9CDF5" : "#ECEAF3") }}>
                    <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0"><ProductThumb p={p} /></div>
                    <p className="text-[12.5px] font-medium flex-1 text-left truncate">{p.title}</p>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: on ? "#6C4CF1" : "#ECEAF3" }}>
                      {on && <Check size={12} color="#fff" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={() => onSave(selected)} className="tap w-full rounded-2xl py-3.5 font-semibold text-[15px]" style={{ background: "#6C4CF1", color: "#fff" }}>
            {t("sell.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingIntro({ onDismiss }) {
  const { t } = useI18n();
  const steps = [t("onboarding.step1"), t("onboarding.step2"), t("onboarding.step3")];
  return (
    <div className="pt-10 flex flex-col items-center text-center px-2">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#6C4CF1" }}>
        <Rocket size={24} color="#fff" />
      </div>
      <p className="disp text-[19px] font-semibold">{t("onboarding.title")}</p>
      <p className="text-[13.5px] text-[#8B879C] mt-1.5">{t("onboarding.subtitle")}</p>

      <div className="w-full mt-6 flex flex-col gap-3 text-left">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl p-3.5" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mono text-[12px] font-semibold" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
              {i + 1}
            </div>
            <p className="text-[13.5px] leading-snug" style={{ color: "#4A4658" }}>{s}</p>
          </div>
        ))}
      </div>

      <button onClick={onDismiss} className="tap w-full mt-6 rounded-2xl py-3.5 font-semibold text-[15px]" style={{ background: "#6C4CF1", color: "#fff" }}>
        {t("onboarding.cta")}
      </button>
    </div>
  );
}

function StatChip({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-1.5" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
      <Icon size={15} color={accent ? "#00C896" : "#6C4CF1"} />
      <span className="mono text-[15px] font-semibold leading-none" style={{ color: accent ? "#00C896" : "#14121F" }}>{value}</span>
      <span className="text-[10.5px] text-[#8B879C]">{label}</span>
    </div>
  );
}

function EarningsChart({ title, data, lang }) {
  const hasData = data.some((d) => d.value > 0);
  return (
    <div className="rounded-2xl p-4 mb-5" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
      <p className="text-[12.5px] font-semibold mb-2">{title}</p>
      {!hasData ? (
        <div className="h-[120px] flex items-center justify-center">
          <p className="text-[12px] text-[#B4AFC0]">—</p>
        </div>
      ) : (
        <div style={{ width: "100%", height: 120 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6C4CF1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6C4CF1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#B4AFC0" }} axisLine={false} tickLine={false} interval={2} />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip
                formatter={(v) => [money(v, lang), ""]}
                labelFormatter={() => ""}
                contentStyle={{ borderRadius: 10, border: "1px solid #ECEAF3", fontSize: 11 }}
              />
              <Area type="monotone" dataKey="value" stroke="#6C4CF1" strokeWidth={2} fill="url(#earningsFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function AuthGate({ marketers, onLogin, onSignup }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    if (!email.trim() || !email.includes("@")) return setErr(t("auth.errEmail"));
    if (mode === "signup") {
      if (!name.trim()) return setErr(t("auth.errName"));
      onSignup(name.trim(), email.trim());
    } else {
      const m = marketers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!m) return setErr(t("auth.errNoStudio"));
      onLogin(m);
    }
  }

  return (
    <div className="pt-8 flex flex-col items-center text-center px-2">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#F1EFFB" }}>
        <TrendingUp size={24} color="#6C4CF1" />
      </div>
      <p className="disp text-[19px] font-semibold">{t("auth.title")}</p>
      <p className="text-[13.5px] text-[#8B879C] mt-1.5 max-w-[280px]">{t("auth.subtitle")}</p>

      <div className="w-full mt-6 flex rounded-full p-1" style={{ background: "#F1EFFB" }}>
        {["signup", "login"].map((m) => (
          <button key={m} onClick={() => { setMode(m); setErr(""); }} className="tap flex-1 py-2 rounded-full text-[13px] font-semibold" style={{ background: mode === m ? "#fff" : "transparent", color: mode === m ? "#14121F" : "#8B879C" }}>
            {m === "signup" ? t("auth.createStudio") : t("auth.login")}
          </button>
        ))}
      </div>

      <div className="w-full mt-5 flex flex-col gap-3 text-left">
        {mode === "signup" && <LabeledInput label={t("auth.yourName")} value={name} onChange={setName} placeholder={t("auth.yourNamePh")} />}
        <LabeledInput label={t("auth.email")} value={email} onChange={setEmail} placeholder={t("auth.emailPh")} />
        {err && <p className="text-[12.5px] text-[#E1483B] flex items-center gap-1"><CircleAlert size={13} /> {err}</p>}
        <button onClick={submit} className="tap w-full rounded-2xl py-3.5 font-semibold text-[15px] mt-1" style={{ background: "#6C4CF1", color: "#fff" }}>
          {mode === "signup" ? t("auth.createBtn") : t("auth.enterBtn")}
        </button>
      </div>
      <p className="text-[11px] text-[#B4AFC0] mt-4 max-w-[280px]">{t("auth.note")}</p>
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[#4A4658]">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }} />
    </label>
  );
}
function LabeledTextarea({ label, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[#4A4658]">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none resize-none" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }} />
    </label>
  );
}

function ProductForm({ onClose, onSubmit }) {
  const { t } = useI18n();
  const [d, setD] = useState({ title: "", description: "", image: "", affiliateUrl: "", category: CATEGORY_KEYS[0], price: "", commission: "" });
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const set = (k) => (v) => setD((s) => ({ ...s, [k]: v }));

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      set("image")(url);
    } catch (err2) {
      console.error(err2);
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!d.title.trim()) return setErr(t("form.errTitle"));
    if (!d.affiliateUrl.trim().startsWith("http")) return setErr(t("form.errLink"));
    onSubmit(d);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,18,31,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-t-3xl max-h-[92vh] overflow-y-auto" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between p-5 pb-2 sticky top-0" style={{ background: "#FFFFFF" }}>
          <p className="disp text-[17px] font-semibold">{t("form.newListing")}</p>
          <button onClick={onClose} className="tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F1EFFB" }}>
            <X size={15} />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-5 pt-2">
          <LabeledInput label={t("form.title")} value={d.title} onChange={set("title")} placeholder={t("form.titlePh")} />
          <LabeledTextarea label={t("form.description")} value={d.description} onChange={set("description")} placeholder={t("form.descriptionPh")} />

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#4A4658]">{t("form.imageSection")}</span>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ background: "#F1EFFB", border: "1px solid #ECEAF3" }}>
                {d.image ? <img src={d.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageOff size={16} color="#B9AEF0" /></div>}
              </div>
              <label className="tap flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-semibold cursor-pointer" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? t("form.uploading") : t("form.uploadFromDevice")}
                <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
              </label>
            </div>
            <input
              value={d.image}
              onChange={(e) => set("image")(e.target.value)}
              placeholder={t("form.orPasteUrl")}
              className="w-full rounded-xl px-3.5 py-2.5 text-[12.5px] outline-none mt-1"
              style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}
            />
          </div>

          <LabeledInput label={t("form.link")} value={d.affiliateUrl} onChange={set("affiliateUrl")} placeholder={t("form.linkPh")} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#4A4658]">{t("form.category")}</span>
            <select value={d.category} onChange={(e) => set("category")(e.target.value)} className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
              {CATEGORY_KEYS.map((c) => <CategoryOption key={c} value={c} />)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label={t("form.price")} value={d.price} onChange={set("price")} placeholder="24.99" type="number" />
            <LabeledInput label={t("form.commission")} value={d.commission} onChange={set("commission")} placeholder="3.50" type="number" />
          </div>
          {err && <p className="text-[12.5px] text-[#E1483B] flex items-center gap-1"><CircleAlert size={13} /> {err}</p>}
          <button onClick={submit} className="tap w-full rounded-2xl py-3.5 font-semibold text-[15px] mt-1" style={{ background: "#6C4CF1", color: "#fff" }}>
            {t("form.publish")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryOption({ value }) {
  const { categoryLabel } = useI18n();
  return <option value={value}>{categoryLabel(value)}</option>;
}

function CreatorProductRow({ p, lang, feeRate, onDelete, onLogSale }) {
  const { t, categoryLabel } = useI18n();
  const [logging, setLogging] = useState(false);
  const [amount, setAmount] = useState(p.price ? String(p.price) : "");
  const [comm, setComm] = useState(p.commission ? String(p.commission) : "");
  const [receipt, setReceipt] = useState(null);

  const statusColor = { approved: "#00C896", pending: "#E8A93B", flagged: "#E1483B" }[p.status] || "#8B879C";

  async function submitSale() {
    const a = Number(amount), c = Number(comm);
    if (!a || !c) return;
    const s = await onLogSale(a, c);
    setReceipt(s);
  }

  return (
    <div className="rounded-2xl p-3 flex gap-3" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0"><ProductThumb p={p} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[13.5px] font-semibold truncate">{p.title}</p>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} title={p.status} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11.5px] text-[#8B879C]">
          <span className="flex items-center gap-1"><MousePointerClick size={12} /> {p.clicks || 0}</span>
          <span>{categoryLabel(p.category)}</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setLogging((v) => !v)} className="tap text-[11.5px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
            {t("sell.logSale")}
          </button>
          <button onClick={onDelete} className="tap text-[11.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: "#FBEAEA", color: "#E1483B" }}>
            <Trash2 size={11} /> {t("sell.remove")}
          </button>
        </div>
        {logging && (
          <div className="mt-3 p-3 rounded-xl" style={{ background: "#FAFAF8" }}>
            <div className="grid grid-cols-2 gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder={t("sell.saleAmountPlaceholder")} className="rounded-lg px-2.5 py-2 text-[12.5px] outline-none" style={{ border: "1px solid #ECEAF3" }} />
              <input value={comm} onChange={(e) => setComm(e.target.value)} type="number" placeholder={t("sell.saleCommissionPlaceholder")} className="rounded-lg px-2.5 py-2 text-[12.5px] outline-none" style={{ border: "1px solid #ECEAF3" }} />
            </div>
            <button onClick={submitSale} className="tap w-full mt-2 rounded-lg py-2 text-[12.5px] font-semibold" style={{ background: "#14121F", color: "#fff" }}>
              {t("sell.confirmSale")}
            </button>
            {receipt && <CommissionTicker s={receipt} lang={lang} feeRate={feeRate} />}
          </div>
        )}
      </div>
    </div>
  );
}

function CommissionTicker({ s, lang, feeRate }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: "1px dashed #D9D3F2", background: "#FFFFFF" }}>
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        <Receipt size={13} color="#6C4CF1" />
        <span className="text-[11px] font-semibold" style={{ color: "#6C4CF1" }}>{t("ticker.title")}</span>
      </div>
      <div className="px-3 pb-3 pt-1.5 flex flex-col gap-1 mono text-[12px]">
        <Row label={t("ticker.saleAmount")} value={money(s.saleAmount, lang)} />
        <Row label={t("ticker.yourCommission")} value={money(s.commissionAmount, lang)} />
        <Row label={`${t("ticker.platformFee")} (${feeRate}%)`} value={`− ${money(s.platformFee, lang)}`} muted />
        <div className="h-px my-1" style={{ background: "#ECEAF3" }} />
        <Row label={t("ticker.youKeep")} value={money(s.marketerNet, lang)} strong />
      </div>
    </div>
  );
}
function Row({ label, value, muted, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: muted ? "#B4AFC0" : "#8B879C" }} className="font-sans">{label}</span>
      <span style={{ color: strong ? "#00C896" : muted ? "#B4AFC0" : "#14121F", fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}

/* ================================================================== ADMIN */
function AdminView({ marketers, products, clicks, sales, settings, onSetStatus, onRemove, onSetFee }) {
  const { t, lang, categoryLabel } = useI18n();
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [section, setSection] = useState("overview");
  const topIds = useMemo(() => getTopCreatorIds(products), [products]);

  if (!unlocked) {
    return (
      <div className="pt-10 flex flex-col items-center text-center px-2">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#14121F" }}>
          <Lock size={22} color="#fff" />
        </div>
        <p className="disp text-[18px] font-semibold">{t("admin.accessTitle")}</p>
        <p className="text-[13px] text-[#8B879C] mt-1.5 max-w-[260px]">{t("admin.accessSubtitle")}</p>
        <div className="w-full mt-5 flex flex-col gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} type="password" placeholder={t("admin.accessCodePh")} className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none text-center" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }} />
          {err && <p className="text-[12px] text-[#E1483B]">{err}</p>}
          <button onClick={() => (code === ADMIN_CODE ? setUnlocked(true) : setErr(t("admin.incorrect")))} className="tap w-full rounded-2xl py-3 font-semibold text-[14px]" style={{ background: "#14121F", color: "#fff" }}>
            {t("admin.unlock")}
          </button>
        </div>
        <p className="text-[11px] text-[#B4AFC0] mt-3">{t("admin.hint")} {ADMIN_CODE}</p>
      </div>
    );
  }

  const totalFees = sales.reduce((s, x) => s + x.platformFee, 0);
  const totalGMV = sales.reduce((s, x) => s + x.saleAmount, 0);

  return (
    <div className="pt-3 pb-4">
      <div className="w-full flex rounded-full p-1 mb-4" style={{ background: "#F1EFFB" }}>
        {[{ id: "overview", l: t("admin.overview") }, { id: "listings", l: t("admin.listings") }, { id: "creators", l: t("admin.creators") }].map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} className="tap flex-1 py-2 rounded-full text-[12.5px] font-semibold" style={{ background: section === s.id ? "#fff" : "transparent", color: section === s.id ? "#14121F" : "#8B879C" }}>
            {s.l}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5">
            <StatChip icon={Users} label={t("admin.statCreators")} value={marketers.length} />
            <StatChip icon={ShoppingBag} label={t("admin.statListings")} value={products.length} />
            <StatChip icon={MousePointerClick} label={t("admin.statClicks")} value={clicks.length} />
            <StatChip icon={DollarSign} label={t("admin.statEarnings")} value={money(totalFees, lang)} accent />
          </div>

          <div className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
            <p className="text-[12.5px] font-semibold mb-1">{t("admin.gmvTitle")}</p>
            <p className="mono text-[20px] font-semibold">{money(totalGMV, lang)}</p>
            <p className="text-[11.5px] text-[#8B879C] mt-1">{t("admin.gmvSub")} {sales.length} {t("admin.gmvSalesWord")}</p>
          </div>

          <EarningsChart title={t("admin.earningsChart")} data={groupByDay(sales, "platformFee")} lang={lang} />

          <div className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12.5px] font-semibold">{t("admin.feeTitle")}</p>
              <span className="mono text-[15px] font-semibold" style={{ color: "#6C4CF1" }}>{settings.platformFeePercent}%</span>
            </div>
            <input type="range" min={0} max={40} step={1} value={settings.platformFeePercent} onChange={(e) => onSetFee(Number(e.target.value))} className="w-full accent-[#6C4CF1]" />
            <p className="text-[11px] text-[#B4AFC0] mt-1.5">{t("admin.feeNote")}</p>
          </div>
        </div>
      )}

      {section === "listings" && (
        <div className="flex flex-col gap-2.5">
          {products.length === 0 && <EmptyState icon={ShoppingBag} title={t("admin.emptyListings")} body={t("admin.emptyListingsBody")} />}
          {products.sort((a, b) => b.createdAt - a.createdAt).map((p) => (
            <AdminListingRow key={p.id} p={p} onSetStatus={onSetStatus} onRemove={onRemove} />
          ))}
        </div>
      )}

      {section === "creators" && (
        <div className="flex flex-col gap-2.5">
          {marketers.length === 0 && <EmptyState icon={Users} title={t("admin.emptyCreators")} body={t("admin.emptyCreatorsBody")} />}
          {marketers.map((m) => {
            const theirs = products.filter((p) => p.marketerId === m.id);
            const theirClicks = theirs.reduce((s, p) => s + (p.clicks || 0), 0);
            const theirFees = sales.filter((s) => s.marketerId === m.id).reduce((s, x) => s + x.platformFee, 0);
            return (
              <div key={m.id} className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 disp font-semibold text-[14px]" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold truncate flex items-center gap-1">{m.name} {topIds.has(m.id) && <TopBadge />}</p>
                  <p className="text-[11.5px] text-[#8B879C] truncate">{m.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="mono text-[12.5px] font-semibold">{theirs.length} <span className="text-[10px] text-[#B4AFC0] font-normal">{t("admin.listingsWord")}</span></p>
                  <p className="mono text-[11px] text-[#8B879C]">{theirClicks} {t("admin.clicksFeesWord")} · {money(theirFees, lang)} {t("admin.feesWord")}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminListingRow({ p, onSetStatus, onRemove }) {
  const { t, categoryLabel } = useI18n();
  const statusStyle = {
    approved: { bg: "#E9FBF4", fg: "#00966F" },
    pending: { bg: "#FEF6E7", fg: "#B5820E" },
    flagged: { bg: "#FBEAEA", fg: "#C6392E" },
  }[p.status] || { bg: "#F1EFFB", fg: "#6C4CF1" };

  return (
    <div className="rounded-2xl p-3 flex gap-3" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0"><ProductThumb p={p} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold truncate">{p.title}</p>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: statusStyle.bg, color: statusStyle.fg }}>{p.status}</span>
        </div>
        <p className="text-[11.5px] text-[#8B879C] mt-0.5">{categoryLabel(p.category)} · {p.clicks || 0}</p>
        <div className="flex gap-1.5 mt-2">
          {p.status !== "approved" && <IconAction onClick={() => onSetStatus(p.id, "approved")} icon={Check} label={t("admin.approve")} tone="ok" />}
          {p.status !== "flagged" && <IconAction onClick={() => onSetStatus(p.id, "flagged")} icon={Flag} label={t("admin.flag")} tone="warn" />}
          <IconAction onClick={() => onRemove(p.id)} icon={Trash2} label={t("sell.remove")} tone="danger" />
        </div>
      </div>
    </div>
  );
}
function IconAction({ onClick, icon: Icon, label, tone }) {
  const styles = {
    ok: { bg: "#E9FBF4", fg: "#00966F" },
    warn: { bg: "#FEF6E7", fg: "#B5820E" },
    danger: { bg: "#FBEAEA", fg: "#C6392E" },
  }[tone];
  return (
    <button onClick={onClick} className="tap flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: styles.bg, color: styles.fg }}>
      <Icon size={11} /> {label}
    </button>
  );
}

/* ================================================================== CREATOR PROFILE PAGE (public, shareable) */
function CreatorProfilePage({ slug, marketers, products, collections, favorites, onToggleFavorite, following, onToggleFollow, onOpenClick, showToast, navigate, lang, setLang }) {
  const { t, categoryLabel } = useI18n();
  const [active, setActive] = useState(null);

  const marketer = marketers.find((m) => m.slug === slug || m.id === slug);
  const topIds = useMemo(() => getTopCreatorIds(products), [products]);

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

  async function handleGetDeal(p) {
    await onOpenClick(p);
    window.open(p.affiliateUrl, "_blank", "noopener,noreferrer");
    showToast(t("toast.openingDeal"));
  }

  if (!marketer) {
    return (
      <div className="flex-1 w-full max-w-[520px] mx-auto px-4 pt-16 flex flex-col items-center text-center">
        <EmptyState icon={Users} title={t("creatorPage.notFoundTitle")} body={t("creatorPage.notFoundBody")} />
        <button onClick={() => navigate("/")} className="tap mt-2 rounded-full px-4 py-2 text-[13px] font-semibold flex items-center gap-1.5" style={{ background: "#14121F", color: "#fff" }}>
          <ArrowLeft size={14} /> {t("creatorPage.backHome")}
        </button>
      </div>
    );
  }

  const mine = products.filter((p) => p.marketerId === marketer.id && p.status === "approved").sort((a, b) => b.createdAt - a.createdAt);
  const myCollections = collections.filter((c) => c.marketerId === marketer.id && c.productIds.length > 0);
  const groupedIds = new Set(myCollections.flatMap((c) => c.productIds));
  const ungrouped = mine.filter((p) => !groupedIds.has(p.id));
  const isFollowing = following.includes(marketer.id);

  function renderGrid(list) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {list.map((p) => (
          <ProductCard
            key={p.id}
            p={p}
            creator={marketer.name}
            isTop={false}
            lang={lang}
            isFav={favorites.includes(p.id)}
            onToggleFavorite={() => onToggleFavorite(p.id)}
            onOpen={() => setActive(p)}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <header className="w-full sticky top-0 z-40 backdrop-blur-md" style={{ background: "rgba(250,250,248,0.9)", borderBottom: "1px solid #ECEAF3" }}>
        <div className="max-w-[520px] mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="tap w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
            <ArrowLeft size={15} />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={handleShare} className="tap shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
              <Share2 size={13} color="#6C4CF1" />
            </button>
            <button onClick={() => setLang(lang === "he" ? "en" : "he")} className="tap shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FFFFFF", border: "1px solid #ECEAF3" }}>
              <Languages size={14} color="#6C4CF1" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[520px] mx-auto pb-10 px-4">
        <div className="pt-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center disp font-semibold text-[22px]" style={{ background: "#F1EFFB", color: "#6C4CF1" }}>
            {marketer.name.charAt(0).toUpperCase()}
          </div>
          <p className="disp text-[19px] font-semibold mt-3 flex items-center gap-1.5">{marketer.name} {topIds.has(marketer.id) && <TopBadge />}</p>
          <p className="text-[12.5px] text-[#8B879C] mt-1">{mine.length} {t("creatorPage.listingsCount")}</p>
          <button
            onClick={() => onToggleFollow(marketer.id)}
            className="tap mt-3 rounded-full px-5 py-2 text-[13px] font-semibold flex items-center gap-1.5"
            style={{ background: isFollowing ? "#F1EFFB" : "#6C4CF1", color: isFollowing ? "#6C4CF1" : "#fff" }}
          >
            {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
            {isFollowing ? t("creatorPage.following") : t("creatorPage.follow")}
          </button>
        </div>

        {myCollections.map((c) => {
          const items = mine.filter((p) => c.productIds.includes(p.id));
          if (items.length === 0) return null;
          return (
            <div key={c.id} className="mt-7">
              <p className="text-[12px] font-semibold text-[#8B879C] uppercase tracking-wide mb-3 flex items-center gap-1.5"><Layers size={12} /> {c.title}</p>
              {renderGrid(items)}
            </div>
          );
        })}

        <div className="mt-7">
          {(myCollections.length > 0 && ungrouped.length > 0) && (
            <p className="text-[12px] font-semibold text-[#8B879C] uppercase tracking-wide mb-3">{t("creatorPage.moreProducts")}</p>
          )}
          {myCollections.length === 0 && (
            <p className="text-[12px] font-semibold text-[#8B879C] uppercase tracking-wide mb-3">{t("creatorPage.allProductsBy")} {marketer.name.split(" ")[0]}</p>
          )}
          {mine.length === 0 ? (
            <EmptyState icon={ShoppingBag} title={t("feed.emptyTitle")} body={t("feed.emptyBody")} />
          ) : (myCollections.length === 0 || ungrouped.length > 0) ? (
            renderGrid(myCollections.length === 0 ? mine : ungrouped)
          ) : null}
        </div>
      </main>

      {active && (
        <ProductModal
          product={active}
          creator={marketer.name}
          isTop={topIds.has(marketer.id)}
          lang={lang}
          isFav={favorites.includes(active.id)}
          onToggleFavorite={() => onToggleFavorite(active.id)}
          onClose={() => setActive(null)}
          onGetDeal={() => handleGetDeal(active)}
        />
      )}
    </>
  );
}
