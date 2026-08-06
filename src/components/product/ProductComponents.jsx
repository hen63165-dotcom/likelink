import React, { memo } from "react";
import { motion } from "framer-motion";
import { ImageOff, Heart, Star } from "lucide-react";
import { money } from "../../utils/helpers";
import { useI18n } from "../../lib/LangContext";
import { Badge } from "../ui";

export function ProductThumb({ p, className = "" }) {
  return p.image ? (
    <img
      src={p.image}
      alt={p.title}
      loading="lazy"
      decoding="async"
      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${className}`}
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--accent-subtle)" }}>
      <ImageOff size={24} style={{ color: "var(--accent)", opacity: 0.5 }} />
    </div>
  );
}

/** Small circular avatar from the creator: initials chip, or photo when provided. */
export function CreatorAvatar({ marketer, size = 20 }) {
  const name = marketer?.name || "";
  const letter = (name.trim().charAt(0) || "?").toLocaleUpperCase("he");
  const bg = marketer?.color || "var(--accent)";
  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: bg,
        color: "#fff",
        fontSize: Math.max(10, size * 0.42),
        fontWeight: 700,
      }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

/** Creator identity row: avatar + name (+ optional one-line bio). */
export function CreatorRow({ marketer, showBio = false, size = 20, align = "center" }) {
  return (
    <span className="flex items-center gap-2 min-w-0" style={{ alignItems: align }}>
      <CreatorAvatar marketer={marketer} size={size} />
      <span className="flex flex-col min-w-0 leading-tight">
        <span className="truncate font-semibold" style={{ color: "var(--text)" }}>
          {marketer?.name || "—"}
        </span>
        {showBio && marketer?.bio && (
          <span className="truncate text-default" style={{ color: "var(--text-muted)", fontSize: 11 }}>
            {marketer.bio}
          </span>
        )}
      </span>
    </span>
  );
}

export function FavButton({ isFav, onToggle, floating }) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`tap flex items-center justify-center rounded-full backdrop-blur-sm ${
        floating ? "absolute top-2.5 w-8 h-8 shadow-sm" : "w-8 h-8"
      }`}
      style={{
        insetInlineEnd: floating ? 10 : undefined,
        background: floating ? "rgba(255,255,255,0.92)" : "transparent",
      }}
      aria-label={isFav ? "Remove from wishlist" : "Add to wishlist"}
    >
      <Heart
        size={16}
        color={isFav ? "var(--danger)" : "var(--text-muted)"}
        fill={isFav ? "var(--danger)" : "none"}
      />
    </motion.button>
  );
}

export function TopBadge() {
  const { t } = useI18n();
  return (
    <Badge variant="top">
      <Star size={8} fill="currentColor" /> {t("badge.top")}
    </Badge>
  );
}

export const ProductCard = memo(function ProductCard({
  p,
  marketer,
  isTop,
  lang,
  isFav,
  onToggleFavorite,
  onOpen,
  index = 0,
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.35 }}
      onClick={onOpen}
      className="tap text-start w-full group"
    >
      <div className="surface rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-card hover:-translate-y-0.5">
        <div className="w-full aspect-[4/5] overflow-hidden relative">
          <ProductThumb p={p} />
          <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
        </div>
        <div className="p-3">
          <p className="text-[13px] font-semibold leading-snug line-clamp-2">{p.title}</p>
          {p.price > 0 && (
            <p className="mono text-xs font-semibold mt-1.5" style={{ color: "var(--accent)" }}>
              {money(p.price, lang)}
            </p>
          )}
          <div className="flex items-center mt-2 gap-1">
            <CreatorRow marketer={marketer} size={18} />
            {isTop && <TopBadge />}
          </div>
        </div>
      </div>
    </motion.button>
  );
});

export const StreamCard = memo(function StreamCard({
  p,
  marketer,
  isTop,
  lang,
  isFav,
  onToggleFavorite,
  onOpen,
  index = 0,
}) {
  const { categoryLabel } = useI18n();
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.35 }}
      onClick={onOpen}
      className="tap text-start w-full group"
    >
      <div className="surface rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-card hover:-translate-y-0.5">
        <div className="w-full aspect-[16/10] overflow-hidden relative">
          <ProductThumb p={p} />
          <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--accent)" }}>
              {categoryLabel(p.category)}
            </span>
            {p.price > 0 && (
              <span className="mono text-sm font-bold shrink-0" style={{ color: "var(--accent)" }}>{money(p.price, lang)}</span>
            )}
          </div>
          <p className="text-[15px] font-semibold leading-snug mt-1">{p.title}</p>
          <p className="text-[13px] text-muted mt-1.5 line-clamp-2">{p.description}</p>
          <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--border)" }}>
            <CreatorRow marketer={marketer} size={28} showBio />
            {isTop && <TopBadge />}
          </div>
        </div>
      </div>
    </motion.button>
  );
});

export function ProductModal({ product, marketer, isTop, lang, isFav, onToggleFavorite, onClose, onGetDeal }) {
  const { t, categoryLabel } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "var(--overlay)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-app rounded-t-3xl overflow-hidden max-h-[88vh] flex flex-col shadow-elevated"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div className="w-full aspect-[4/3] relative shrink-0 group">
          <ProductThumb p={product} />
          <button
            onClick={onClose}
            className="tap absolute top-3 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm"
            style={{ insetInlineEnd: 12, background: "rgba(0,0,0,0.5)" }}
            aria-label={t("common.close")}
          >
            <span className="text-white text-lg leading-none">×</span>
          </button>
          <div className="absolute top-3" style={{ insetInlineStart: 12 }}>
            <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
          </div>
        </div>
        <div className="p-5 overflow-y-auto safe-bottom">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--accent)" }}>
            {categoryLabel(product.category)}
          </span>
          <h2 className="disp text-xl font-semibold mt-1 leading-tight">{product.title}</h2>

          <div className="flex items-center gap-2.5 mt-3 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <CreatorAvatar marketer={marketer} size={36} />
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold truncate">{marketer?.name || "—"}</span>
                {isTop && <TopBadge />}
              </span>
              {marketer?.bio && (
                <span className="text-[11.5px] truncate" style={{ color: "var(--text-muted)" }}>{marketer.bio}</span>
              )}
            </div>
          </div>

          <p className="text-sm leading-relaxed mt-3 text-secondary">{product.description}</p>

          {product.price > 0 && (
            <p className="mono text-xl font-bold mt-4" style={{ color: "var(--accent)" }}>{money(product.price, lang)}</p>
          )}
          <button
            onClick={onGetDeal}
            className="tap btn-primary w-full mt-4 rounded-xl py-3.5 flex items-center justify-center gap-2 font-semibold text-[15px]"
          >
            {t("feed.getDeal")}
          </button>
          <p className="text-[11px] text-center text-faint mt-2.5">{t("feed.opensNewTab")}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
