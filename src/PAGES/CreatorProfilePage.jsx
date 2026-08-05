import React, { useState, useMemo } from "react";
import { Users, ShoppingBag, ArrowLeft, Share2, Languages, UserCheck, UserPlus, Layers } from "lucide-react";
import { useI18n } from "../lib/LangContext";
import {
  getTopCreatorIds, ProductCard, ProductModal, EmptyState, TopBadge
} from "./SharedComponents";

export default function CreatorProfilePage({
  slug, marketers, products, collections, favorites, onToggleFavorite,
  following, onToggleFollow, onOpenClick, showToast, navigate, lang, setLang
}) {
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
