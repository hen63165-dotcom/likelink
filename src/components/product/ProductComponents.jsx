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
  creator,
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
          <div className="flex items-center justify-between mt-2 gap-1">
            <span className="text-[11px] text-muted truncate flex items-center gap-1">
              {creator} {isTop && <TopBadge />}
            </span>
            {p.price > 0 && (
              <span className="mono text-xs font-medium shrink-0">{money(p.price, lang)}</span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
});

export const StreamCard = memo(function StreamCard({
  p,
  creator,
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
      <div className="surface rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-card">
        <div className="w-full aspect-[16/10] overflow-hidden relative">
          <ProductThumb p={p} />
          <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
        </div>
        <div className="p-4">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--accent)" }}>
            {categoryLabel(p.category)}
          </span>
          <p className="text-[15px] font-semibold leading-snug mt-1">{p.title}</p>
          <p className="text-[13px] text-muted mt-1.5 line-clamp-2">{p.description}</p>
          <div className="flex items-center justify-between mt-3 gap-1">
            <span className="text-xs text-muted flex items-center gap-1">
              {creator} {isTop && <TopBadge />}
            </span>
            {p.price > 0 && (
              <span className="mono text-sm font-semibold shrink-0">{money(p.price, lang)}</span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
});

export function ProductModal({ product, creator, isTop, lang, isFav, onToggleFavorite, onClose, onGetDeal }) {
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
            aria-label="Close"
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
          <p className="text-sm text-muted mt-1 flex items-center gap-1">
            {t("feed.by")} {creator} {isTop && <TopBadge />}
          </p>
          <p className="text-sm leading-relaxed mt-3 text-secondary">{product.description}</p>
          {product.price > 0 && (
            <p className="mono text-xl font-semibold mt-4">{money(product.price, lang)}</p>
          )}
          <button
            onClick={onGetDeal}
            className="tap btn-primary w-full mt-5 rounded-xl py-3.5 flex items-center justify-center gap-2 font-semibold text-[15px]"
          >
            {t("feed.getDeal")}
          </button>
          <p className="text-[11px] text-center text-faint mt-2.5">{t("feed.opensNewTab")}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
