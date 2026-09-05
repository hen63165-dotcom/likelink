import React, { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageOff, Heart, Star, ShoppingBag, Share2, Sparkles, ShieldCheck } from "lucide-react";
import { money, DEFAULT_PRODUCT_IMAGE, normalizeImageUrl } from "../../utils/helpers";
import { useI18n } from "../../lib/LangContext";
import { useCart } from "../../context/CartContext";
import { Badge } from "../ui";

/** 
 * Luxury ProductThumb with advanced loading and bulletproof fallback handling.
 */
export const ProductThumb = memo(function ProductThumb({ p, className = "" }) {
  const [failed, setFailed] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const rawSrc = p?.image || "";
  const normalized = normalizeImageUrl(rawSrc, origin);
  const src = normalized || DEFAULT_PRODUCT_IMAGE;
  const finalSrc = failed ? DEFAULT_PRODUCT_IMAGE : src;

  return (
    <div className={`relative w-full h-full overflow-hidden bg-stone-100 ${className}`}>
      <img
        src={finalSrc}
        alt={p?.title || "Luxury item"}
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
      />
      {/* Subtle luxury vignette effect on image hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </div>
  );
});

/**
 * Premium WhatsApp Share Button with tailored bi-lingual copywriting.
 */
export const WhatsAppShareButton = memo(function WhatsAppShareButton({ p, marketer }) {
  const { lang } = useI18n();

  const handleWhatsAppShare = (e) => {
    e.stopPropagation();
    if (!p?.affiliateUrl) return;

    const brandName = marketer?.name || "Likelink";
    const productTitle = p.title || "";
    const price = p.price ? money(p.price, lang) : "";

    const heMessage = `💎 ${brandName} מציגה יוקרה: ${productTitle} - ${price}. בחירה קפדנית בסגנון מינימליסטי. גלו עכשיו דרך Likelink 🛍️`;
    const enMessage = `💎 ${brandName} presents luxury collection: ${productTitle} - ${price}. Curated minimalist essentials. Discover via Likelink! 🛍️`;
    const message = lang === "he" ? heMessage : enMessage;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message + " " + p.affiliateUrl)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={handleWhatsAppShare}
      className="tap inline-flex items-center gap-2 px-3.5 py-2 text-[11px] font-medium rounded-xl transition-all shadow-sm hover:shadow"
      style={{
        background: "var(--accent-subtle, rgba(197, 168, 128, 0.12))",
        color: "var(--accent, #C5A880)",
        border: "1px solid var(--accent, #C5A880)",
      }}
      title={lang === "he" ? "שיתוף בוואטסאפ" : "Share on WhatsApp"}
    >
      <Share2 size={13} className="shrink-0" />
      <span>{lang === "he" ? "שיתוף בוואטסאפ" : "Share"}</span>
    </motion.button>
  );
});

/** Small circular avatar from the creator with initials fallback. */
export const CreatorAvatar = memo(function CreatorAvatar({ marketer, size = 24 }) {
  const name = marketer?.name || "";
  const letter = (name.trim().charAt(0) || "L").toLocaleUpperCase();
  const bg = marketer?.color || "var(--accent, #C5A880)";
  const [imgFailed, setImgFailed] = useState(false);
  
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const imgSrc = normalizeImageUrl(marketer?.image, origin);

  if (imgSrc && !imgFailed) {
    return (
      <img
        src={imgSrc}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setImgFailed(true)}
        className="rounded-full object-cover shrink-0 ring-1 ring-black/5"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0 select-none shadow-sm"
      style={{
        width: size,
        height: size,
        background: bg,
        color: "#fff",
        fontSize: Math.max(10, size * 0.42),
        fontWeight: 600,
        letterSpacing: "-0.02em",
      }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
});

/** Creator identity row: avatar + name + optional bio. */
export const CreatorRow = memo(function CreatorRow({ marketer, showBio = false, size = 22, align = "center" }) {
  return (
    <div className="flex items-center gap-2 min-w-0" style={{ alignItems: align }}>
      <CreatorAvatar marketer={marketer} size={size} />
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="truncate text-xs font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          {marketer?.name || "Likelink Creator"}
        </span>
        {showBio && marketer?.bio && (
          <span className="truncate text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {marketer.bio}
          </span>
        )}
      </div>
    </div>
  );
});

/** Interactive Wishlist Favorite Button */
export const FavButton = memo(function FavButton({ isFav, onToggle, floating }) {
  const { t } = useI18n();
  return (
    <motion.button
      whileTap={{ scale: 0.8 }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`tap flex items-center justify-center rounded-full backdrop-blur-md transition-shadow ${
        floating ? "absolute top-3 w-9 h-9 shadow-md bg-white/9ತ್ತು dark:bg-black/60" : "w-8 h-8"
      }`}
      style={{
        insetInlineEnd: floating ? 12 : undefined,
      }}
      aria-label={isFav ? t("common.wishlistRemove") : t("common.wishlistAdd")}
    >
      <Heart
        size={16}
        className={`transition-colors duration-200 ${isFav ? "text-rose-500 fill-rose-500" : "text-stone-600 hover:text-black"}`}
      />
    </motion.button>
  );
});

export const TopBadge = memo(function TopBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
      <Star size={9} fill="currentColor" /> {t("badge.top") || "Top"}
    </span>
  );
});

/** Sponsored promotional chip */
export const SponsoredChip = memo(function SponsoredChip() {
  const { t } = useI18n();
  return (
    <span
      className="absolute top-3 start-3 z-10 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm"
      style={{ background: "rgba(20, 18, 15, 0.88)", color: "#F3ECDD", backdropFilter: "blur(4px)" }}
    >
      <Sparkles size={9} className="text-amber-400" />
      {t("sell.sponsored") || "Sponsored"}
    </span>
  );
});

/** Standard Grid Product Card */
export const ProductCard = memo(function ProductCard({
  p,
  marketer,
  isTop,
  lang,
  isFav,
  onToggleFavorite,
  onOpen,
  onAddToCart,
  index = 0,
  badge = null,
}) {
  const { setIsOpen: openCart } = useCart();

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (onAddToCart) onAddToCart(p, marketer);
    openCart(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.4, ease: "easeOut" }}
      className="tap text-start w-full group cursor-pointer"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="surface rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800">
        <div className="w-full aspect-[4/5] overflow-hidden relative">
          <ProductThumb p={p} />
          <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
          {badge && (
            <span
              className="absolute top-3 start-3 z-10 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm"
              style={{
                background: badge.variant === "trust" ? "rgba(183,143,79,0.92)" : badge.variant === "hot" ? "rgba(179,84,30,0.92)" : "rgba(33,28,22,0.88)",
                color: "#fff",
              }}
            >
              {badge.label}
            </span>
          )}
          {((p.boostedUntil || 0) > Date.now()) && <SponsoredChip />}

          {p.price > 0 && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleAddToCart}
              className="absolute bottom-3 end-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105"
              style={{ background: "var(--accent, #C5A880)", color: "#fff" }}
              aria-label="Add to cart"
            >
              <ShoppingBag size={17} />
            </motion.button>
          )}
        </div>
        
        <div className="p-3.5">
          <p className="text-xs font-semibold leading-snug line-clamp-2 text-stone-900 dark:text-stone-100 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
            {p.title || ""}
          </p>
          
          {p.price > 0 && (
            <p className="mono text-sm font-bold mt-2" style={{ color: "var(--accent, #C5A880)" }}>
              {money(p.price, lang)}
            </p>
          )}
          
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-stone-100 dark:border-stone-800">
            <CreatorRow marketer={marketer} size={20} />
            {isTop && <TopBadge />}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

/** Stream / Feed Featured Card */
export const StreamCard = memo(function StreamCard({
  p,
  marketer,
  isTop,
  lang,
  isFav,
  onToggleFavorite,
  onOpen,
  index = 0,
  badge = null,
}) {
  const { categoryLabel } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.4, ease: "easeOut" }}
      className="tap text-start w-full group cursor-pointer"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="surface rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800">
        <div className="w-full aspect-[16/10] overflow-hidden relative">
          <ProductThumb p={p} />
          <FavButton isFav={isFav} onToggle={onToggleFavorite} floating />
          {badge && (
            <span
              className="absolute top-3 start-3 z-10 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm"
              style={{
                background: badge.variant === "trust" ? "rgba(183,143,79,0.92)" : badge.variant === "hot" ? "rgba(179,84,30,0.92)" : "rgba(33,28,22,0.88)",
                color: "#fff",
              }}
            >
              {badge.label}
            </span>
          )}
          {((p.boostedUntil || 0) > Date.now()) && <SponsoredChip />}
        </div>
        
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--accent, #C5A880)" }}>
              {categoryLabel(p.category)}
            </span>
            {p.price > 0 && (
              <span className="mono text-base font-bold" style={{ color: "var(--accent, #C5A880)" }}>
                {money(p.price, lang)}
              </span>
            )}
          </div>
          
          <p className="text-base font-bold leading-snug mt-1.5 text-stone-900 dark:text-stone-100">
            {p.title || ""}
          </p>
          
          {p.description && (
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1.5 line-clamp-2 leading-relaxed">
              {p.description}
            </p>
          )}
          
          <div className="mt-4 pt-3.5 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
            <CreatorRow marketer={marketer} size={30} showBio />
            <div className="flex items-center gap-2">
              {p.affiliateUrl && <WhatsAppShareButton p={p} marketer={marketer} />}
              {isTop && <TopBadge />}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

/** Detailed Product Modal */
export const ProductModal = memo(function ProductModal({
  product,
  marketer,
  isTop,
  lang,
  isFav,
  onToggleFavorite,
  onClose,
  onGetDeal,
}) {
  const { t, categoryLabel } = useI18n();
  
  if (!product) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col shadow-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800"
      >
        <div className="w-full aspect-[4/3] relative shrink-0">
          <ProductThumb p={product} />
          <button
            onClick={onClose}
            className="tap absolute top-3 end-3 w-9 h-9 rounded-full flex items-center justify-center bg-black/50 text-white backdrop-blur-md transition-transform hover:scale-105"
            aria-label={t("common.close") || "Close"}
          >
            <span className="text-xl leading-none">×</span>
          </button>
          <div className="absolute top-3 start-3">
            <FavButton isFav={isFav} onToggle={onToggleFavorite} floating={false} />
          </div>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto safe-bottom">
          <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--accent, #C5A880)" }}>
            {categoryLabel(product.category)}
          </span>
          
          {product.title && (
            <h2 className="text-xl font-bold mt-1 text-stone-900 dark:text-stone-100 leading-tight">
              {product.title}
            </h2>
          )}

          <div className="flex items-center justify-between gap-3 mt-4 py-3 border-y border-stone-100 dark:border-stone-800">
            <CreatorRow marketer={marketer} size={40} showBio />
            {isTop && <TopBadge />}
          </div>

          {product.description && (
            <p className="text-sm leading-relaxed mt-4 text-stone-600 dark:text-stone-300">
              {product.description}
            </p>
          )}

          {product.price > 0 && (
            <p className="mono text-2xl font-extrabold mt-5" style={{ color: "var(--accent, #C5A880)" }}>
              {money(product.price, lang)}
            </p>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={onGetDeal}
            className="tap w-full mt-6 py-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm shadow-lg text-white transition-opacity hover:opacity-95"
            style={{ background: "var(--accent, #C5A880)" }}
          >
            <ShieldCheck size={18} />
            <span>{t("feed.getDeal") || "Get the Deal"}</span>
          </motion.button>

          {product.affiliateUrl && (
            <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800 flex justify-center">
              <WhatsAppShareButton p={product} marketer={marketer} />
            </div>
          )}

          <p className="text-[11px] text-center text-stone-400 dark:text-stone-500 mt-3">
            {t("feed.opensNewTab") || "Opens securely in a new tab"}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
});