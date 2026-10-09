import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Play, Sparkles, ImageOff, ArrowUpLeft, ArrowUpRight, ShoppingBag } from "lucide-react";
import { useMarketplace } from "../../context/MarketplaceContext";
import { useCart } from "../../context/CartContext";
import {
  MEDIA_STATE, productMedia, merchantOf, formatPrice, trackedDealPath, directCheckoutUrl,
  categoryLabel, isNewProduct,
} from "../../lib/site/catalog.js";

// Site context: language, strings and SPA navigation for every public page.
export const SiteContext = createContext(null);
export function useSite() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSite must be used inside <PublicSite>");
  return ctx;
}

/** Real <a href> (crawlable, middle-click works) with SPA navigation. */
export function SiteLink({ to, children, onClick, ...rest }) {
  const { navigate } = useSite();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Prices are numbers with a currency sign — isolate them so RTL never reorders them. */
export function Price({ value, className = "s-price" }) {
  const { lang } = useSite();
  const text = formatPrice(value, lang);
  if (!text) return null;
  return <bdi dir="ltr" className={className}>{text}</bdi>;
}

export function Arrow({ size = 16 }) {
  const { lang } = useSite();
  return lang === "he" ? <ArrowUpLeft size={size} aria-hidden="true" /> : <ArrowUpRight size={size} aria-hidden="true" />;
}

/**
 * Media with a truthful state badge.
 *   REAL_VIDEO          → playable video, badge "וידאו"
 *   SYNTHETIC_ANIMATION → animation file, or the photo animated live (animate),
 *                         badge "אנימציה מתמונת המוצר"
 *   STATIC_IMAGE        → the photo, no badge
 *   MISSING_MEDIA       → designed fallback
 */
export function MediaFrame({ product, videos = [], shape = "portrait", animate = false, eager = false, children, badges = null }) {
  const { s, lang } = useSite();
  const media = productMedia(product, videos);
  const [imgFailed, setImgFailed] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.play?.().catch(() => {});
      else el.pause?.();
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [media.videoUrl]);

  const isVideo = media.state === MEDIA_STATE.REAL_VIDEO || media.state === MEDIA_STATE.SYNTHETIC_ANIMATION;
  const showImage = media.state === MEDIA_STATE.STATIC_IMAGE && !imgFailed;
  const animated = showImage && animate;
  const stateBadge = media.state === MEDIA_STATE.REAL_VIDEO
    ? <span className="s-badge"><Play size={11} fill="currentColor" aria-hidden="true" />{s("videoReal")}</span>
    : media.state === MEDIA_STATE.SYNTHETIC_ANIMATION || animated
      ? <span className="s-badge"><Sparkles size={11} aria-hidden="true" />{s("videoSynthetic")}</span>
      : null;

  return (
    <div className={`s-media ${shape}${animated ? " s-kenburns" : ""}`}>
      {isVideo ? (
        <video
          ref={videoRef}
          src={media.videoUrl}
          poster={media.poster || undefined}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={product?.title || ""}
        />
      ) : showImage ? (
        <img
          src={media.image}
          alt={product?.title || ""}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="s-fallback">
          <div>
            <ImageOff size={26} aria-hidden="true" style={{ margin: "0 auto 8px", opacity: 0.55 }} />
            <div>{categoryLabel(product?.category, lang)}</div>
          </div>
        </div>
      )}
      {(stateBadge || badges) && <div className="s-badges">{stateBadge}{badges}</div>}
      {children}
    </div>
  );
}

/** Buy flow: on-site checkout when LikeLink sells it; otherwise the tracked store link. */
export function useDeal() {
  const { recordClick } = useMarketplace();
  const { addItem, setIsOpen } = useCart();
  return {
    isDirect(product) {
      return Boolean(directCheckoutUrl(product, typeof window !== "undefined" ? window.location.origin : ""));
    },
    open(product, marketer = null, src = "site") {
      if (!product) return;
      const direct = directCheckoutUrl(product, typeof window !== "undefined" ? window.location.origin : "");
      if (direct) {
        addItem(product, marketer);
        setIsOpen(true);
        return;
      }
      // Open synchronously (popup blockers), then log the click best-effort.
      window.open(trackedDealPath(product, src), "_blank", "noopener,noreferrer");
      Promise.resolve(recordClick?.(product)).catch(() => {});
    },
  };
}

export function CreatorAvatar({ creator, size = "" }) {
  const initial = String(creator?.name || "L").trim().charAt(0).toUpperCase() || "L";
  const color = creator?.color && /^#[0-9a-f]{3,8}$/i.test(creator.color) ? creator.color : null;
  return (
    <span className={`s-avatar ${size}`} style={color ? { background: `linear-gradient(135deg, ${color}, #e2557c)` } : undefined} aria-hidden="true">
      {creator?.avatar ? <img src={creator.avatar} alt="" loading="lazy" /> : initial}
    </span>
  );
}

export function ProductCard({ product, creator = null, videos = [], animate = false, reason = "" }) {
  const { s } = useSite();
  const deal = useDeal();
  const merchant = merchantOf(product).name;
  const direct = deal.isDirect(product);
  return (
    <article className="s-card s-pcard">
      <SiteLink to={`/p/${encodeURIComponent(product.id)}`} aria-label={`${s("viewProduct")}: ${product.title || ""}`}>
        <MediaFrame
          product={product}
          videos={videos}
          animate={animate}
          badges={isNewProduct(product) ? <span className="s-badge new">{s("newBadge")}</span> : null}
        />
      </SiteLink>
      <div className="s-pcard-body">
        <SiteLink to={`/p/${encodeURIComponent(product.id)}`} className="s-pcard-title"><bdi>{product.title}</bdi></SiteLink>
        <Price value={product.price} />
        <div className="s-meta">
          {creator?.name && <span>{s("recommendedBy", { name: "" })}<bdi>{creator.name}</bdi></span>}
          {merchant && <span>{s("soldAt", { merchant: "" })}<bdi>{merchant}</bdi></span>}
        </div>
        {reason && <p className="s-meta" style={{ margin: 0 }}>{reason}</p>}
        <div className="s-pcard-actions">
          <button type="button" className="s-btn primary sm" style={{ flex: 1 }} onClick={() => deal.open(product, creator)}>
            {direct ? <ShoppingBag size={15} aria-hidden="true" /> : null}
            {direct ? s("addToCart") : merchant ? s("buyAt", { merchant }) : s("buy")}
          </button>
        </div>
      </div>
    </article>
  );
}

export function CreatorCard({ creator, products = [] }) {
  const { s } = useSite();
  const thumbs = products.filter((p) => p.image).slice(0, 3);
  return (
    <article className="s-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CreatorAvatar creator={creator} />
        <div style={{ minWidth: 0 }}>
          <h3 className="s-h3"><bdi>{creator.name}</bdi></h3>
          <p className="s-meta" style={{ margin: 0 }}>{s("productsCount", { n: creator.productCount ?? products.length })}</p>
        </div>
      </div>
      {creator.bio && <p className="s-ink2" style={{ margin: 0, fontSize: 14, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}><bdi>{creator.bio}</bdi></p>}
      {thumbs.length > 0 && (
        <div className="s-thumbs">
          {thumbs.map((p) => <div key={p.id}><img src={p.image} alt="" loading="lazy" /></div>)}
        </div>
      )}
      <SiteLink to={`/u/${encodeURIComponent(creator.slug)}`} className="s-btn ghost sm block">{s("toStore")}</SiteLink>
    </article>
  );
}

export function SectionHead({ title, sub, to, linkLabel }) {
  return (
    <div className="s-section-head">
      <div>
        <h2 className="s-h2">{title}</h2>
        {sub && <p className="s-muted" style={{ margin: "6px 0 0", fontSize: 14.5 }}>{sub}</p>}
      </div>
      {to && <SiteLink to={to} className="s-link">{linkLabel} <Arrow size={14} /></SiteLink>}
    </div>
  );
}

export function EmptyState({ title, body, action = null, icon = null }) {
  return (
    <div className="s-empty">
      {icon}
      <h3 className="s-h3" style={{ marginTop: icon ? 10 : 0 }}>{title}</h3>
      {body && <p className="s-muted" style={{ maxWidth: 460, margin: "8px auto 0", lineHeight: 1.6 }}>{body}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
