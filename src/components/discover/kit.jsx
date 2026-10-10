// LikeLink2 public component kit — the visual building blocks of the public
// discovery experience. Every card renders data from buildPublicGraph only;
// every badge is backed by a real field (see src/lib/publicDiscovery.js).
import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Clapperboard,
  Copy,
  ExternalLink,
  Facebook,
  Heart,
  Loader2,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Pin,
  Play,
  Send,
  Volume2,
  VolumeX,
  Share2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { useVideos } from "../../context/VideoContext";
import { buildPublicGraph, categoryName, enCount, formatPrice, heCount, REEL_STYLE_LABELS, EVIDENCE_LABELS } from "../../lib/publicDiscovery.js";
import { MEDIA_TRUTH, MEDIA_TRUTH_LABEL } from "../../lib/discovery/mediaTruth.js";
import { AFFILIATE_DISCLOSURE_HE, saleModelOf } from "../../lib/discovery/surfaces.js";
import { resolveDestinationUrl, buildAffiliateUrl } from "../../utils/helpers.js";
import { SHARE_SHEET_ORDER, buildShareLink, creatorPath, productPath, publicUrl, utmFor, withAttribution } from "../../lib/acquisition.js";
import { stripBase, withBase } from "../../lib/basePath.js";
import { trackFunnel } from "../../lib/funnel.js";
import { trackSiteEvent } from "../../lib/acquisitionTrack.js";

/* ---------------------------------------------------------------- context */

export const NavCtx = createContext(() => {});

export function useL() {
  const { lang, setLang } = useI18n();
  const he = lang === "he";
  return {
    lang,
    setLang,
    he,
    L: (h, e) => (he ? h : e),
    // "Forward" points left in RTL.
    Forward: he ? ArrowLeft : ArrowRight,
    Back: he ? ArrowRight : ArrowLeft,
  };
}

/** The public graph, rebuilt only when the underlying real data changes. */
export function useGraph() {
  const { products, marketers, collections, clicks } = useMarketplace();
  const { videos } = useVideos();
  return useMemo(
    () => buildPublicGraph({ products, marketers, collections, clicks, videos }),
    [products, marketers, collections, clicks, videos]
  );
}

/** A real link: keyboard, middle-click and "open in new tab" all keep working. */
export function Go({ to, children, onClick, ...rest }) {
  const navigate = useContext(NavCtx);
  return (
    <a
      href={withBase(to)}
      onClick={(e) => {
        onClick?.(e);
        // A Studio CTA click is a funnel step (first-party, never blocks navigation).
        if (/^\/(studio|sell)(\/|$|\?)/.test(String(to || ""))) trackFunnel("studio_cta", typeof window !== "undefined" ? stripBase(window.location.pathname) : "");
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        // A link to the page you're already on (e.g. the logo on the home page)
        // still answers the tap: it scrolls back to the top.
        if (typeof window !== "undefined" && `${stripBase(window.location.pathname)}${window.location.search}` === String(to)) {
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ media */

/** A plain image that removes itself on error — the container's background shows instead. */
export function Img({ alt = "", ...props }) {
  const [bad, setBad] = useState(false);
  if (bad || !props.src) return null;
  return <img alt={alt} loading="lazy" decoding="async" {...props} onError={() => setBad(true)} />;
}

/** Responsive delivery for Unsplash; every other host is used as-is. */
export function sized(url, width = 600) {
  if (!url || !/^https:\/\/images\.unsplash\.com\//.test(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("w", String(width));
    u.searchParams.delete("h");
    u.searchParams.set("q", "72");
    u.searchParams.set("auto", "format");
    u.searchParams.set("fit", "crop");
    return u.toString();
  } catch {
    return url;
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * Media — real video first, then the real image, then a clean branded
 * fallback. Never a broken image, never an empty black box, never a fake
 * play button on a photo. Videos play muted only while on screen.
 */
export function Media({ src, video, poster, alt = "", ratio = "4 / 5", width = 600, eager = false, label = "", className = "", style, children, controls = false, controlsAt = "bottom", onFirstPlay }) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const userPaused = useRef(false);
  const reduced = useReducedMotion();
  const videoRef = useRef(null);
  const firstPlay = useRef(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !reduced && !userPaused.current) el.play?.().catch(() => {});
        else if (!entry.isIntersecting) el.pause?.();
      },
      { threshold: 0.55 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [video, reduced]);

  const showImage = !video && src && !failed;
  return (
    <div className={`lx-zoom ${className}`} style={{ aspectRatio: ratio, ...style }}>
      {video ? (
        <video
          ref={videoRef}
          src={video}
          poster={poster ? sized(poster, width) : undefined}
          muted
          playsInline
          loop
          preload="metadata"
          aria-label={alt}
          onPlay={() => {
            setPlaying(true);
            if (!firstPlay.current) { firstPlay.current = true; onFirstPlay?.(); }
          }}
          onPause={() => setPlaying(false)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {video && controls ? (
        <div className={`absolute z-[2] flex gap-2 ${controlsAt === "side" ? "end-3 bottom-[21.5rem] flex-col" : controlsAt === "top" ? "end-3 top-12" : "bottom-3 start-3"}`}>
          <PlayToggle playing={playing} onToggle={() => {
            const el = videoRef.current;
            if (!el) return;
            if (el.paused) { userPaused.current = false; el.play?.().catch(() => {}); } else { userPaused.current = true; el.pause?.(); }
          }} />
          <MuteToggle muted={muted} onToggle={() => {
            const el = videoRef.current;
            if (!el) return;
            el.muted = !el.muted;
            setMuted(el.muted);
          }} />
        </div>
      ) : null}
      {showImage ? (
        <img
          src={sized(src, width)}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchpriority={eager ? "high" : undefined}
          onError={() => setFailed(true)}
          className="absolute inset-0"
        />
      ) : null}
      {!video && !showImage ? (
        <div className="lx-media-fallback" role={alt ? "img" : undefined} aria-label={alt || undefined}>
          <span className="lx-display text-3xl opacity-80">{(label || alt || "L").trim().charAt(0)}</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

// Shown only on a real, playable <video> (never on a photo).
function PlayToggle({ playing, onToggle }) {
  const { L } = useL();
  return (
    <button type="button" className="lx-icon-btn" aria-pressed={!playing} aria-label={playing ? L("השהיה", "Pause") : L("ניגון", "Play")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}>
      {playing ? <Pause size={17} /> : <Play size={17} />}
    </button>
  );
}

function MuteToggle({ muted, onToggle }) {
  const { L } = useL();
  return (
    <button type="button" className="lx-icon-btn" aria-pressed={!muted} aria-label={muted ? L("הפעלת קול", "Unmute") : L("השתקה", "Mute")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}>
      {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
    </button>
  );
}

/** Media truth badge — only for motion. A photo needs no badge on a card. */
export function MediaBadge({ state, showImage = false }) {
  const { lang, L } = useL();
  if (!state) return null;
  if (state === MEDIA_TRUTH.STATIC_IMAGE && !showImage) return null;
  if (state === MEDIA_TRUTH.MISSING_MEDIA) return null;
  const label = MEDIA_TRUTH_LABEL[state]?.[lang] || "";
  const Icon = state === MEDIA_TRUTH.REAL_VIDEO ? Play : state === MEDIA_TRUTH.STATIC_IMAGE ? null : Clapperboard;
  const tip = state === MEDIA_TRUTH.REAL_VIDEO
    ? L("סרטון אמיתי של המוצר", "A real video of the product")
    : state === MEDIA_TRUTH.STATIC_IMAGE
      ? L("תמונה מעמוד המוצר בחנות", "A photo from the store's product page")
      : L("אנימציה ממוחשבת, לא צילום של המוצר", "A computer animation, not footage of the product");
  return (
    <span className="lx-badge lx-badge-glass" data-tip={tip}>
      {Icon ? <Icon size={11} fill={state === MEDIA_TRUTH.REAL_VIDEO ? "currentColor" : "none"} /> : null}
      {label}
    </span>
  );
}

/** The render style of a LikeLink animation (only when one is attached). */
export function StyleBadge({ style }) {
  const { lang } = useL();
  const label = REEL_STYLE_LABELS[style]?.[lang];
  return label ? <span className="lx-badge lx-badge-luna">{label}</span> : null;
}

/* ------------------------------------------------------------ primitives */

export function SectionHead({ kicker, title, sub, to, linkLabel, id }) {
  const { L, Forward } = useL();
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker ? <p className="lx-kicker mb-1.5">{kicker}</p> : null}
        <h2 id={id} className="lx-display text-[26px] md:text-[34px]">{title}</h2>
        {sub ? <p className="lx-mute mt-1.5 text-sm md:text-[15px]">{sub}</p> : null}
      </div>
      {to ? (
        <Go to={to} className="lx-btn lx-btn-ghost lx-btn-sm shrink-0">
          {linkLabel || L("הכל", "See all")} <Forward size={15} />
        </Go>
      ) : null}
    </div>
  );
}

/** Horizontal rail; items keep a fixed width so cards never stretch. */
export function Rail({ children, item = "minmax(200px, 240px)", label }) {
  return (
    <div className="-mx-4 md:mx-0">
      <div className="lx-rail px-4 md:px-0" style={{ gridAutoColumns: item }} role="list" aria-label={label}>
        {React.Children.map(children, (c) => (c ? <div role="listitem" className="min-w-0">{c}</div> : null))}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Sparkles, title, body, children, heading: H = "h3" }) {
  return (
    <div className="rounded-[20px] border border-dashed px-6 py-10 text-center" style={{ borderColor: "var(--lx-line)", background: "var(--lx-surface)" }}>
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--lx-sunk)" }}>
        <Icon size={20} />
      </span>
      <H className="text-lg font-bold">{title}</H>
      {body ? <p className="lx-mute mx-auto mt-1.5 max-w-md text-sm leading-6">{body}</p> : null}
      {children ? <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Luna — the intelligence layer. Only renders lines it is given (computed facts). */
export function LunaInsight({ title, lines = [], children, compact = false }) {
  const { L } = useL();
  if (!lines.length && !children) return null;
  return (
    <aside className={`lx-luna ${compact ? "" : "md:p-5"}`} aria-label={L("תובנת Luna", "Luna insight")}>
      <div className="flex items-center gap-2.5">
        <span className="lx-luna-dot" aria-hidden="true"><Sparkles size={13} /></span>
        <p className="text-sm font-bold" style={{ color: "var(--lx-luna)" }}>{title}</p>
      </div>
      {lines.length ? (
        <ul className="mt-2.5 space-y-1.5 text-[13.5px] leading-6" style={{ color: "var(--lx-ink-2)" }}>
          {lines.map((line) => (
            <li key={line} className="flex gap-2">
              <Check size={15} className="mt-1 shrink-0" style={{ color: "var(--lx-luna)" }} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {children}
    </aside>
  );
}

/** Trust badges — each kind maps to a fact the system can prove. */
export function TrustBadge({ kind }) {
  const { L } = useL();
  if (kind === "verified") return <span className="lx-badge lx-badge-mint" data-tip={L("הפרופיל אומת על ידי LikeLink", "LikeLink verified this profile")}><BadgeCheck size={12} /> {L("יוצר/ת מאומת/ת", "Verified creator")}</span>;
  if (kind === "attributed") return <span className="lx-badge lx-badge-mint" data-tip={L("נבדק שהמוצר שייך לחנות של מי שהוסיף אותו", "Checked: the product belongs to the shop that added it")}><ShieldCheck size={12} /> {L("ייחוס יוצר/ת נבדק", "Creator attribution checked")}</span>;
  if (kind === "approved") return <span className="lx-badge lx-badge-line" data-tip={L("יש לו קישור משלו שמוביל למוצר עצמו, ותמונה אמיתית מהחנות", "It has its own link that opens this product, and a real store photo")}><Check size={12} /> {L("מוצר מאושר בקטלוג", "Approved catalog product")}</span>;
  if (kind === "affiliate") return <span className="lx-badge lx-badge-amber" data-tip={L("קונים דרך הקישור? היוצר/ת עשוי/ה לקבל עמלה מהחנות. המחיר שלך לא משתנה.", "Buy through the link and the creator may earn a commission. Your price stays the same.")}>{L("קישור שותפים", "Affiliate link")}</span>;
  return null;
}

export function Disclosure({ product }) {
  const { L } = useL();
  if (!product || saleModelOf(product) !== "affiliate") return null;
  return (
    <p className="lx-mute text-[12px] leading-5">
      {L(AFFILIATE_DISCLOSURE_HE, "Disclosure: affiliate link — the creator may earn a commission, at no extra cost to you.")}
    </p>
  );
}

/* ------------------------------------------------------------ hover tips */

/**
 * One explanation layer for the whole public site. Hover (or keyboard focus)
 * over an icon-only button shows its name; any element with data-tip shows
 * that explanation (a badge, a price note). On a phone, tapping an explained
 * badge shows it. Never on top of a native title (no double tooltips).
 */
export function HoverTips() {
  const [tip, setTip] = useState(null);
  const active = useRef(null);
  const timer = useRef(0);

  useEffect(() => {
    const find = (node) => {
      const el = node instanceof Element ? node.closest("[data-tip], button[aria-label], a[aria-label]") : null;
      if (!el || !el.closest(".lx") || el.hasAttribute("title")) return null;
      const explicit = el.getAttribute("data-tip");
      if (explicit) return { el, text: explicit };
      if ((el.innerText || "").trim()) return null;
      const label = el.getAttribute("aria-label");
      return label ? { el, text: label } : null;
    };
    const hide = () => {
      clearTimeout(timer.current);
      active.current = null;
      setTip(null);
    };
    const show = ({ el, text }) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const below = r.top < 64;
      const vw = window.innerWidth;
      const half = Math.min(130, vw / 2 - 8);
      const x = Math.min(Math.max(r.left + r.width / 2, half + 8), vw - half - 8);
      setTip({ text, x, y: below ? r.bottom + 8 : r.top - 8, below });
    };
    const onOver = (e) => {
      if (e.pointerType === "touch") return;
      const hit = find(e.target);
      if (hit && hit.el === active.current) return;
      hide();
      if (!hit) return;
      active.current = hit.el;
      timer.current = setTimeout(() => show(hit), 280);
    };
    const onFocus = (e) => {
      const hit = find(e.target);
      let keyboard = false;
      try { keyboard = e.target.matches(":focus-visible"); } catch { keyboard = false; }
      if (!hit || !keyboard) return;
      hide();
      active.current = hit.el;
      show(hit);
    };
    const onClick = (e) => {
      const el = e.target instanceof Element ? e.target.closest("[data-tip]") : null;
      // Buttons and links act on a tap; only plain explained text toggles a tip.
      if (!el || el.closest("a,button")) {
        if (active.current) hide();
        return;
      }
      if (active.current === el) return hide();
      hide();
      active.current = el;
      show({ el, text: el.getAttribute("data-tip") });
    };
    const onKey = (e) => e.key === "Escape" && hide();
    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
    };
  }, []);

  if (!tip) return null;
  return (
    <div role="tooltip" className={`lx-tip ${tip.below ? "is-below" : ""}`} style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
}

/* ---------------------------------------------------------------- actions */

export function SaveButton({ productId, className = "" }) {
  const { favorites, toggleFavorite, showToast } = useMarketplace();
  const { L } = useL();
  const saved = (favorites || []).includes(productId);
  return (
    <button
      type="button"
      className={`lx-icon-btn ${className}`}
      aria-pressed={saved}
      aria-label={saved ? L("הסרה מהשמורים", "Remove from saved") : L("שמירה", "Save")}
      data-tip={saved ? L("הסרה מהשמורים", "Remove from saved") : L("שמירה במכשיר הזה, בלי הרשמה", "Save on this device, no sign-up")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(productId);
        showToast(saved ? L("הוסר מהשמורים", "Removed from saved") : L("נשמר — תמצאו אותו בשמורים", "Saved — find it in Saved"));
      }}
    >
      <Heart size={18} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}

/** X (formerly Twitter) mark — lucide only ships the old bird. */
function XMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

// Brand colours darkened just enough for a white icon to stay legible (≥4.2:1).
const SHARE_NETWORKS = {
  whatsapp: { he: "וואטסאפ", en: "WhatsApp", color: "#168c46", Icon: MessageCircle },
  telegram: { he: "טלגרם", en: "Telegram", color: "#1b7fbf", Icon: Send },
  facebook: { he: "פייסבוק", en: "Facebook", color: "#1877f2", Icon: Facebook },
  pinterest: { he: "פינטרסט", en: "Pinterest", color: "#e60023", Icon: Pin },
  x: { he: "X", en: "X", color: "#0f1419", Icon: XMark },
  email: { he: "מייל", en: "Email", color: "#5f6368", Icon: Mail },
};

/**
 * The site's own share sheet. It used to call navigator.share() directly,
 * which on a Windows computer opens Microsoft's share dialog (Teams, Mail,
 * nearby sharing) instead of WhatsApp. Now every visitor gets the same sheet:
 * one tap to WhatsApp / Telegram / Facebook / Pinterest / X / e-mail, the
 * link to copy, and the device's own dialog only as "more apps".
 * Each network gets its own utm_source, so a share is attributed to where it
 * went. A dialog: labelled, focus kept inside, Escape and the backdrop close
 * it, focus returns to the button.
 */
function ShareSheet({ title, image, linkFor, meta, anchor, onClose }) {
  const { L, he } = useL();
  const { showToast } = useMarketplace();
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [root, setRoot] = useState(null);
  const [copied, setCopied] = useState(false);
  const titleId = useId();
  const copyUrl = linkFor("copy");
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const inApp = inAppBrowser();

  // Render inside the public root so the .lx tokens apply.
  useEffect(() => {
    setRoot(anchor.current?.closest(".lx") || document.body);
  }, [anchor]);

  useEffect(() => {
    if (!root) return undefined;
    const el = panel.current;
    el?.querySelector("a[href],button")?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll("a[href],button:not([disabled]),input")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [root]);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(copyUrl);
      ok = true;
    } catch {
      // Older or in-app browsers: copy from the visible field instead.
      const input = panel.current?.querySelector("input");
      if (input) {
        input.focus();
        input.select();
        try { ok = document.execCommand("copy"); } catch { ok = false; }
      }
    }
    if (!ok) {
      showToast(L("סמנו את הקישור והעתיקו", "Select the link and copy it"));
      return;
    }
    trackSiteEvent("share_completed", { ...meta, target: "copy" });
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    showToast(L("הקישור הועתק", "Link copied"));
  }

  async function shareNative() {
    trackSiteEvent("share_started", { ...meta, target: "native" });
    try {
      await navigator.share({ title, url: linkFor("native") });
      // Resolved == the visitor really completed the device's share dialog.
      trackSiteEvent("share_completed", { ...meta, target: "native" });
      closeRef.current();
    } catch {
      /* cancelled */
    }
  }

  if (!root) return null;
  return createPortal(
    // Clicks stay inside the sheet: the button that opened it may sit inside a card link.
    <div className="lx-share-layer" onClick={(e) => e.stopPropagation()}>
      <button type="button" tabIndex={-1} className="lx-share-scrim" onClick={() => closeRef.current()} aria-label={L("סגירה", "Close")} />
      <div ref={panel} className="lx-share-panel lx-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} dir={he ? "rtl" : "ltr"}>
        <div className="flex items-center gap-3">
          {/* Every .lx img fills its box (public.css), so the box sets the size. */}
          {image ? (
            <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ background: "var(--lx-sunk)" }}>
              <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="lx-display text-lg leading-tight">{L("שיתוף", "Share")}</h2>
            {title ? <p className="lx-mute truncate text-[13px]">{title}</p> : null}
          </div>
          <button type="button" className="lx-icon-btn shrink-0" onClick={() => closeRef.current()} aria-label={L("סגירה", "Close")}>
            <X size={18} />
          </button>
        </div>

        <div className="lx-share-grid mt-5">
          {SHARE_SHEET_ORDER.map((id) => {
            const href = buildShareLink(id, linkFor(id), title || "", image);
            if (!href) return null;
            const n = SHARE_NETWORKS[id];
            return (
              <a
                key={id}
                href={href}
                target={id === "email" || inApp ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="lx-share-target"
                onClick={() => {
                  trackSiteEvent("share_started", { ...meta, target: id });
                  setTimeout(() => closeRef.current(), 0);
                }}
              >
                <span className="lx-share-icon" style={{ background: n.color }} aria-hidden="true"><n.Icon size={22} /></span>
                <span className="text-[12px] font-semibold">{he ? n.he : n.en}</span>
              </a>
            );
          })}
          {canNative ? (
            <button type="button" className="lx-share-target" onClick={shareNative}>
              <span className="lx-share-icon" style={{ background: "#6d4aff" }} aria-hidden="true"><MoreHorizontal size={22} /></span>
              <span className="text-[12px] font-semibold">{L("עוד אפליקציות", "More apps")}</span>
            </button>
          ) : null}
        </div>

        <div className="lx-share-copy">
          <label className="lx-sr" htmlFor={`${titleId}-url`}>{L("קישור לשיתוף", "Link to share")}</label>
          <input id={`${titleId}-url`} readOnly value={copyUrl} onFocus={(e) => e.target.select()} />
          <button type="button" onClick={copy} className="lx-btn lx-btn-primary lx-btn-sm shrink-0" aria-live="polite">
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? L("הועתק", "Copied") : L("העתקת קישור", "Copy link")}
          </button>
        </div>
      </div>
    </div>,
    root,
  );
}

export function ShareButton({ path, title, image = "", productId, marketerId, variant = "icon", className = "" }) {
  const { L } = useL();
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const meta = { page: path, productId, marketerId };
  const linkFor = (target) =>
    withAttribution(publicUrl(path), { ...utmFor({ source: target, medium: "social", campaign: "share_loop" }), ...(marketerId ? { ref: marketerId } : {}) });

  function onOpen(e) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }
  function onClose() {
    setOpen(false);
    button.current?.focus();
  }

  const sheet = open ? <ShareSheet title={title} image={image} linkFor={linkFor} meta={meta} anchor={button} onClose={onClose} /> : null;
  if (variant === "button") {
    return (
      <>
        <button ref={button} type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={open} className={`lx-btn lx-btn-ghost ${className}`}>
          <Share2 size={16} /> {L("שיתוף", "Share")}
        </button>
        {sheet}
      </>
    );
  }
  return (
    <>
      <button ref={button} type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={open} className={`lx-icon-btn ${className}`} aria-label={L("שיתוף", "Share")} data-tip={L("שיתוף בוואטסאפ, טלגרם, פייסבוק ועוד", "Share on WhatsApp, Telegram, Facebook and more")}>
        <Share2 size={17} />
      </button>
      {sheet}
    </>
  );
}

/** Tracked outbound purchase link (same attribution path the catalog has always used). */
export function shopHref(product, creator) {
  if (!product) return "";
  const raw = product.affiliateUrl || product.link || "";
  const tracked = buildAffiliateUrl(raw, creator?.trackingId) || raw;
  return resolveDestinationUrl(tracked) || tracked;
}

// Instagram / Facebook / TikTok in-app browsers can swallow target="_blank",
// so there the store opens in the same view (the back button returns here).
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Line\//i;
const inAppBrowser = () => typeof navigator !== "undefined" && IN_APP_BROWSER.test(navigator.userAgent || "");

export function ShopButton({ product, className = "", children, attribution = null }) {
  const { recordClick, marketers } = useMarketplace();
  const { L } = useL();
  const owner = (marketers || []).find((m) => m.id === product?.marketerId);
  const href = shopHref(product, owner);
  if (!href) {
    return <p className="lx-mute text-sm">{L("קישור הרכישה לא זמין כרגע.", "The purchase link is not available right now.")}</p>;
  }
  return (
    <a
      href={href}
      target={inAppBrowser() ? undefined : "_blank"}
      rel="noopener noreferrer sponsored"
      onClick={() => recordClick(product, attribution)}
      className={`lx-btn lx-btn-rose ${className}`}
    >
      {children || (
        <>
          {L(`לקנייה ב־${product.merchant || "חנות"}`, `Shop at ${product.merchant || "store"}`)} <ExternalLink size={16} />
        </>
      )}
    </a>
  );
}

export function FollowButton({ creatorId, small = false }) {
  const { following, toggleFollow, showToast } = useMarketplace();
  const { L } = useL();
  const on = (following || []).includes(creatorId);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFollow(creatorId);
        showToast(on ? L("הפסקת לעקוב", "Unfollowed") : L("עוקבים — הבחירות שלה יופיעו ב״בשבילך״", "Following — their picks show up in For you"));
      }}
      className={`lx-btn ${on ? "lx-btn-ghost" : "lx-btn-primary"} ${small ? "lx-btn-sm" : ""}`}
    >
      {on ? <UserCheck size={16} /> : <UserPlus size={16} />} {on ? L("עוקבים", "Following") : L("מעקב", "Follow")}
    </button>
  );
}

/* ------------------------------------------------------------------ cards */

export function CreatorAvatar({ creator, size = 40, ring = false }) {
  const bg = creator?.color || "#d22f5d";
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, ${bg}, #ff9f5a)`, boxShadow: ring ? "0 0 0 3px #fff, 0 6px 16px -6px rgba(23,19,31,.4)" : undefined }}
      aria-hidden="true"
    >
      {(creator?.name || "?").charAt(0).toUpperCase()}
      {creator?.avatar ? <Img src={creator.avatar} className="absolute inset-0" /> : null}
    </span>
  );
}

export function PriceLine({ product, large = false }) {
  const { lang } = useL();
  const price = formatPrice(product.price, lang);
  if (!price) return null;
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={large ? "text-[28px] font-extrabold" : "text-[15px] font-bold"} style={{ color: "var(--lx-ink)" }}>{price}</span>
      {product.deal ? <s className="lx-mute text-[13px]">{formatPrice(product.deal.was, lang)}</s> : null}
    </span>
  );
}

/** ProductCard — media first, then product, creator, price, merchant, disclosure. */
export function ProductCard({ product, creator, ratio = "4 / 5", eager = false, showCreator = true, why = null }) {
  const { L, lang } = useL();
  if (!product) return null;
  const to = productPath(product.id);
  return (
    <article className="lx-card flex h-full flex-col">
      <Go to={to} aria-label={product.displayTitle} className="block">
        {/* Cards stay photo-first; a reel exists → truth badge, playback in /reels and on the product page. */}
        <Media src={product.media.image} video={ratio === "9 / 16" ? product.media.video : ""} poster={product.media.poster} alt={product.displayTitle} ratio={ratio} eager={eager} label={product.displayTitle}>
          <div className="absolute start-2.5 top-2.5 flex flex-wrap gap-1.5">
            <MediaBadge state={product.media.state} />
            {product.deal ? <span className="lx-badge lx-badge-rose">−{product.deal.discountPct}%</span> : null}
          </div>
        </Media>
      </Go>
      <SaveButton productId={product.id} className="absolute end-2.5 top-2.5" />
      <div className="flex flex-1 flex-col gap-1.5 p-3 md:p-3.5">
        {showCreator && creator ? (
          <Go to={creatorPath(creator.slug)} className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--lx-ink-2)" }}>
            <CreatorAvatar creator={creator} size={20} />
            <span className="truncate">{creator.name}</span>
            {creator.verified ? <BadgeCheck size={13} style={{ color: "var(--lx-mint)" }} aria-label={L("מאומת/ת", "Verified")} /> : null}
          </Go>
        ) : null}
        <Go to={to} className="lx-clamp-2 text-[14px] font-semibold leading-snug">{product.displayTitle}</Go>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <PriceLine product={product} />
          {product.merchant ? <span className="lx-mute truncate text-[11.5px]">{product.merchant}</span> : null}
        </div>
        {why && why.signals.length ? (
          <div className="flex flex-wrap gap-1 pt-0.5" aria-label={L("למה המוצר כאן", "Why this product is here")} data-tip={L("רק סימנים שקיימים בנתונים. בלי כוכבים או ביקורות מומצאים.", "Only signals that exist in the data. No invented stars or reviews.")}>
            <span className="lx-mute text-[10.5px] font-semibold">{L("למה כאן:", "Why here:")}</span>
            {why.signals.slice(0, 3).map((k) => <span key={k} className="lx-badge text-[10px]" style={{ padding: "1px 6px" }}>{lang === "he" ? EVIDENCE_LABELS[k].he : EVIDENCE_LABELS[k].en}</span>)}
            {why.offers > 1 ? <span className="lx-badge lx-badge-rose text-[10px]" style={{ padding: "1px 6px" }}>{L(`${why.offers} המלצות לאותו מוצר`, `${why.offers} offers`)}</span> : null}
          </div>
        ) : null}
        {saleModelOf(product) === "affiliate" ? (
          <p className="lx-mute text-[10.5px]" data-tip={lang === "he" ? AFFILIATE_DISCLOSURE_HE : "Affiliate link: the creator may earn a commission, at no extra cost to you."}>
            {L("קישור שותפים · עמלה ליוצר/ת", "Affiliate link · creator may earn")}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function DealCard({ product, creator }) {
  return <ProductCard product={product} creator={creator} ratio="1 / 1" />;
}

/** CreatorCard — a person, not a record: their content first, then who they are. */
export function CreatorCard({ creator, graph }) {
  const { L, lang } = useL();
  const to = creatorPath(creator.slug);
  const covers = creator.covers.slice(0, 3);
  return (
    <article className="lx-card flex h-full flex-col">
      <Go to={to} className="grid grid-cols-3 gap-0.5" aria-label={L(`החנות של ${creator.name}`, `${creator.name}'s shop`)} style={{ background: "var(--lx-sunk)" }}>
        {[0, 1, 2].map((i) => (
          <Media key={i} src={covers[i]} alt="" ratio="3 / 4" width={300} label={creator.name} />
        ))}
      </Go>
      <div className="relative flex flex-1 flex-col px-4 pb-4">
        <div className="-mt-7 mb-2">
          <CreatorAvatar creator={creator} size={56} ring />
        </div>
        <div className="flex items-center gap-1.5">
          <Go to={to} className="truncate text-[17px] font-bold">{creator.name}</Go>
          {creator.verified ? <BadgeCheck size={16} style={{ color: "var(--lx-mint)" }} aria-label={L("מאומת/ת", "Verified")} /> : null}
        </div>
        {creator.bio ? <p className="lx-mute lx-clamp-2 mt-1 text-[13px] leading-5">{creator.bio}</p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {creator.categories.slice(0, 3).map((c) => (
            <span key={c} className="lx-badge lx-badge-line">{categoryName(c, lang)}</span>
          ))}
        </div>
        <p className="lx-mute mt-2.5 text-[12px]">
          {L(`${heCount(creator.productIds.length, "products")} בחנות`, `${enCount(creator.productIds.length, "products")} in the shop`)}
          {graph?.reels?.some((r) => r.creatorId === creator.id) ? L(" · יש סרטונים", " · has reels") : ""}
        </p>
        <div className="mt-auto flex gap-2 pt-4">
          <FollowButton creatorId={creator.id} small />
          <Go to={to} className="lx-btn lx-btn-ghost lx-btn-sm">{L("לחנות", "View shop")}</Go>
        </div>
      </div>
    </article>
  );
}

/** CollectionCard — an editorial board: mosaic cover, title, the rule behind it. */
export function CollectionCard({ collection, wide = false }) {
  const { L, lang } = useL();
  const covers = collection.covers;
  return (
    <Go to={`/collections/${encodeURIComponent(collection.id)}`} className="lx-card block h-full">
      <div className={`grid gap-0.5 ${wide ? "grid-cols-3" : "grid-cols-2"}`} style={{ background: "var(--lx-sunk)" }}>
        <Media src={covers[0]} alt="" ratio={wide ? "3 / 4" : "1 / 1"} width={400} className={wide ? "" : "col-span-2"} label={collection.title[lang]} style={wide ? undefined : { aspectRatio: "2 / 1" }} />
        <Media src={covers[1]} alt="" ratio={wide ? "3 / 4" : "1 / 1"} width={300} label={collection.title[lang]} />
        <Media src={covers[2]} alt="" ratio={wide ? "3 / 4" : "1 / 1"} width={300} label={collection.title[lang]} />
      </div>
      <div className="p-4">
        <p className="lx-kicker">{collection.kind === "curated" ? L("אוסף של יוצר/ת", "Creator collection") : collection.kind === "creator" ? L("בחירות יוצר/ת", "Creator picks") : L("לוח עריכה", "Editorial board")}</p>
        <h3 className="lx-display mt-1 text-[22px]">{collection.title[lang]}</h3>
        <p className="lx-mute mt-1 text-[13px] leading-5">{collection.description[lang]}</p>
      </div>
    </Go>
  );
}

/** TrendCard — only rendered for trends with recorded evidence. */
export function TrendCard({ trend, graph }) {
  const { L, lang } = useL();
  const thumbs = trend.productIds.slice(0, 3).map((id) => graph.byId.get(id)).filter(Boolean);
  return (
    <Go to={`/discover/${encodeURIComponent(trend.category)}`} className="lx-card block h-full">
      <Media src={trend.cover} alt={categoryName(trend.category, lang)} ratio="4 / 5" width={500}>
        <div className="lx-reel-shade" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <span className="lx-badge lx-badge-glass">{L(`${heCount(trend.views, "views")} · ${heCount(trend.clicks, "clicks")} · ${trend.windowDays} ימים`, `${enCount(trend.views, "views")} · ${enCount(trend.clicks, "clicks")} · ${trend.windowDays} days`)}</span>
          <h3 className="lx-display mt-2 text-[26px]">{categoryName(trend.category, lang)}</h3>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex -space-x-2 rtl:space-x-reverse">
              {thumbs.map((p) => (
                <span key={p.id} className="block h-8 w-8 overflow-hidden rounded-full border-2 border-white" style={{ background: "#ddd" }}>
                  <Img src={sized(p.media.image, 80)} />
                </span>
              ))}
            </div>
            <span className="text-[13px] font-semibold">{L(`${heCount(trend.productIds.length, "products")} · גלו`, `${enCount(trend.productIds.length, "products")} · Explore`)}</span>
          </div>
        </div>
      </Media>
    </Go>
  );
}

/** ReelCard — vertical, playable media only (classified by mediaTruth). */
export function ReelCard({ reel, graph }) {
  const { L } = useL();
  const creator = graph.creatorById.get(reel.creatorId);
  const product = reel.productIds.length ? graph.byId.get(reel.productIds[0]) : null;
  return (
    <Go to={`/reels?r=${encodeURIComponent(reel.id)}`} className="lx-card block">
      <Media video={reel.url} poster={reel.poster} alt={reel.title || product?.displayTitle || L("סרטון", "Reel")} ratio="9 / 16" width={400}>
        <div className="lx-reel-shade" />
        <div className="absolute start-2.5 top-2.5 flex flex-col items-start gap-1"><MediaBadge state={reel.state} /><StyleBadge style={reel.style} /></div>
        <div className="absolute inset-x-0 bottom-0 p-3 text-white">
          {creator ? <p className="text-[13px] font-bold">{creator.name}</p> : null}
          {product ? <p className="lx-clamp-2 text-[12px] opacity-90">{product.displayTitle}</p> : null}
        </div>
      </Media>
    </Go>
  );
}

export function Spinner() {
  return <Loader2 size={18} className="animate-spin" aria-hidden="true" />;
}

export { categoryName, formatPrice };
