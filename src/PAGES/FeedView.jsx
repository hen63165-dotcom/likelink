import React, { useState, useMemo } from "react";
import { Search, ShoppingBag, Heart, UserCheck, Rows3, LayoutGrid } from "lucide-react";
import { useI18n } from "../lib/LangContext";
import { CATEGORY_KEYS } from "../lib/i18n";
import { getTopCreatorIds, ProductCard, StreamCard, ProductModal, EmptyState } from "./SharedComponents";

export default function FeedView({ products, marketers, favorites, onToggleFavorite, following, onOpenClick, showToast }) {
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
        <Search size={15} color="#B4AFC0" className="absolute top-1/2 -translate-y-1/2" style={{ insetInlineStart: 12 }} />
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
