// The home page: one clear promise, real footage, clean imagery.
//
// A dark full-screen hero plays the best product video we have (footage a
// person filmed first, then the seller's own video in LikeLink2's premium
// cut), labelled with whose video it is. Below it: three lines that say what
// the site does, the collection as large clean images, the videos, the free
// tools and one band for sellers. No counters on the home page: a buyer
// chooses by the piece, not by a number.
// Everything comes from the public graph (src/lib/publicDiscovery.js).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Play, Ruler, Store } from "lucide-react";
import { REEL_STYLE_LABELS } from "../../lib/publicDiscovery.js";
import { productPath } from "../../lib/acquisition.js";
import { collectionOrder, FOCUS, footageByProduct, heroReel } from "../../lib/homeShowcase.js";
import { GUIDE, GUIDE_PATH } from "../../lib/guide.js";
import { SIZE_PATH } from "../../lib/sizeTool.js";
import { saleModelOf } from "../../lib/discovery/surfaces.js";
import { Go, Img, Media, Rail, SaveButton, useL, useReducedMotion } from "./kit";

function styleLabel(style, lang) {
  const l = REEL_STYLE_LABELS[style];
  return l ? (lang === "he" ? l.he : l.en) : "";
}

function useHeroVideo(src) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return undefined;
    // iOS plays inline video by itself only when it is muted as a property.
    el.muted = true;
    // Reduced motion or data saver: the cover frame stays, nothing downloads by itself.
    if (reduced || (typeof navigator !== "undefined" && navigator.connection?.saveData)) {
      el.pause?.();
      return undefined;
    }
    const play = () => el.play?.().catch(() => {});
    if (typeof IntersectionObserver === "undefined") {
      play();
      return undefined;
    }
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : el.pause?.()), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [src, reduced]);
  return ref;
}

function LuxeHero({ graph, reel, jewelry }) {
  const { L, lang, Forward } = useL();
  const reduced = useReducedMotion();
  // The videos arrive a moment after the catalog: wait briefly before falling
  // back to a product photo, so the hero doesn't jump from a photo to a video.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const product = reel ? graph.byId.get(reel.productIds[0]) : waited ? graph.products.find((p) => p.media.image) : null;
  const poster = reel?.poster || product?.media.image || "";
  const ref = useHeroVideo(reel?.url);
  // A hash change would fire popstate, and the router scrolls to the top on it: scroll here instead.
  const toCollection = (e) => {
    const el = document.getElementById("collection");
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };
  return (
    <section className="lx-luxe-hero" aria-labelledby="h-luxe">
      {poster ? <div className="lx-luxe-glow" style={{ backgroundImage: `url(${JSON.stringify(poster)})` }} aria-hidden="true" /> : null}
      <div className="lx-luxe-hero-grid lx-wrap">
        <div className="lx-luxe-stage">
          {reel ? (
            <video ref={ref} src={reel.url} poster={poster || undefined} muted playsInline loop preload="metadata" aria-label={product?.displayTitle || L("סרטון המוצר", "Product video")} />
          ) : poster ? (
            <img src={poster} alt={product?.displayTitle || ""} />
          ) : null}
          <div className="lx-luxe-stage-shade" aria-hidden="true" />
        </div>
        <div className="lx-luxe-copy">
          <p className="lx-luxe-kicker">{jewelry ? L("תכשיטים · בווידאו", "Jewelry · on video") : L("מוצרים · בווידאו", "Products · on video")}</p>
          <h1 id="h-luxe" className="lx-luxe-title">
            <span className="block">{jewelry ? L("רואים את התכשיט בתנועה.", "See the piece in motion.") : L("רואים את המוצר בתנועה.", "See it in motion.")}</span>
            <span className="block lx-luxe-gold">{L("לפני שקונים.", "Before you buy.")}</span>
          </h1>
          <p className="lx-luxe-lead">
            {jewelry
              ? L("תכשיטים שנבחרו בקפידה, עם סרטון של המוצר, מודד מידות חינמי וקישור ישיר לחנות.", "Carefully chosen jewelry, with a video of the piece, a free size meter and a direct link to the store.")
              : L("מוצרים שנבחרו בקפידה, עם סרטון של המוצר וקישור ישיר לחנות.", "Carefully chosen products, with a video of the item and a direct link to the store.")}
          </p>
          <div className="lx-luxe-ctas">
            <a href="#collection" className="lx-luxe-btn lx-luxe-btn-solid" onClick={toCollection}>{L("לקולקציה", "See the collection")}</a>
            <Go to={SIZE_PATH} className="lx-luxe-btn lx-luxe-btn-line"><Ruler size={16} aria-hidden="true" /> {L("מה המידה שלי?", "What's my size?")}</Go>
          </div>
          {reel && product ? (
            <p className="lx-luxe-credit">
              <Go to={productPath(product.id)}>{product.displayTitle} <Forward size={13} aria-hidden="true" className="inline" /></Go>
              <span>{styleLabel(reel.style, lang)} · {L("#פרסומת · קישור שותפים", "Ad · affiliate link")}</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Pillars() {
  const { L } = useL();
  const lines = [
    { icon: Play, title: L("וידאו לפני שקונים", "Video before you buy"), line: L("רואים את המוצר בתנועה, לא רק בתמונה.", "See the item move, not just a photo.") },
    { icon: Store, title: L("ישר לחנות המקורית", "Straight to the store"), line: L("קונים בחנות עצמה, עם הגנת הקונה שלה. קישור שותפים, בלי תוספת למחיר.", "You buy in the store itself, with its buyer protection. Affiliate link, no extra cost.") },
    { icon: Ruler, title: L("המידה שלך, בחינם", "Your size, free"), line: L("מודד טבעות וצמידים ישר מהמסך, תוך דקה.", "A ring and bracelet meter right on your screen, in a minute."), to: SIZE_PATH },
  ];
  return (
    <section className="lx-wrap" aria-label={L("מה מקבלים כאן", "What you get here")}>
      <div className="lx-luxe-promise">
      {lines.map(({ icon: Icon, title, line, to }) => {
        const body = (
          <>
            <Icon size={20} strokeWidth={1.5} aria-hidden="true" className="lx-luxe-promise-icon" />
            <span className="lx-luxe-promise-title">{title}</span>
            <span className="lx-luxe-promise-line">{line}</span>
          </>
        );
        return to ? <Go key={title} to={to} className="lx-luxe-promise-item">{body}</Go> : <div key={title} className="lx-luxe-promise-item">{body}</div>;
      })}
      </div>
    </section>
  );
}

function Head({ id, kicker, title, to, linkLabel }) {
  const { Forward } = useL();
  return (
    <div className="lx-luxe-head">
      <div>
        <p className="lx-luxe-kicker">{kicker}</p>
        <h2 id={id} className="lx-luxe-h2">{title}</h2>
      </div>
      {to ? <Go to={to} className="lx-luxe-more">{linkLabel} <Forward size={15} aria-hidden="true" /></Go> : null}
    </div>
  );
}

function Piece({ product, reel, feature = false }) {
  const { L } = useL();
  const to = productPath(product.id);
  const cover = reel?.poster || product.media.image;
  const focus = reel?.poster ? FOCUS[product.id] || "50% 50%" : "50% 50%";
  return (
    <article className={`lx-luxe-piece${feature ? " lx-luxe-piece-feature" : ""}`}>
      <Go to={to} className="lx-luxe-shot" aria-label={product.displayTitle}>
        {feature && reel ? (
          <Media video={reel.url} poster={reel.poster} alt={product.displayTitle} ratio="auto" className="lx-luxe-fill" />
        ) : (
          <Img src={cover} alt={product.displayTitle} style={{ "--lx-focus": focus }} />
        )}
        {reel ? <span className="lx-luxe-tag"><Play size={11} fill="currentColor" aria-hidden="true" /> {L("וידאו", "Video")}</span> : null}
      </Go>
      <SaveButton productId={product.id} className="absolute end-2.5 top-2.5" />
      <div className="lx-luxe-meta">
        <Go to={to} className="lx-luxe-name">{product.displayTitle}</Go>
        <p className="lx-luxe-sub">
          {[product.merchant, saleModelOf(product) === "affiliate" ? L("קישור שותפים", "Affiliate link") : ""].filter(Boolean).join(" · ")}
        </p>
      </div>
    </article>
  );
}

function Collection({ graph, footage, heroProductId }) {
  const { L } = useL();
  const items = collectionOrder(graph.products, footage, heroProductId);
  if (!items.length) return null;
  return (
    <section id="collection" className="lx-wrap lx-luxe-section" aria-labelledby="h-collection">
      <Head id="h-collection" kicker={L("הקולקציה", "The collection")} title={L("נבחרו אחד־אחד", "Chosen one by one")} to="/products" linkLabel={L("לכל המוצרים", "All products")} />
      <div className="lx-luxe-grid">
        {items.map((p, i) => <Piece key={p.id} product={p} reel={footage.get(p.id)} feature={i === 0 && items.length > 2} />)}
      </div>
    </section>
  );
}

function Motion({ graph, footage }) {
  const { L, lang } = useL();
  const reels = [...footage.values()];
  if (!reels.length) return null;
  return (
    <section className="lx-wrap lx-luxe-section" aria-labelledby="h-motion">
      <Head id="h-motion" kicker={L("בתנועה", "In motion")} title={L("ככה זה נראה בווידאו", "How it looks on video")} to="/reels" linkLabel={L("לכל הסרטונים", "All videos")} />
      <Rail item="minmax(200px, 1fr)" label={L("סרטוני מוצרים", "Product videos")}>
        {reels.map((r) => {
          const product = graph.byId.get(r.productIds[0]);
          return (
            <Go key={r.id} to={`/reels?r=${encodeURIComponent(r.id)}`} className="lx-luxe-reel">
              <Img src={r.poster || product?.media.image} alt={product?.displayTitle || ""} />
              <span className="lx-luxe-reel-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
              <span className="lx-luxe-reel-text">
                <span className="lx-clamp-2">{product?.displayTitle}</span>
                <small>{styleLabel(r.style, lang)}</small>
              </span>
            </Go>
          );
        })}
      </Rail>
    </section>
  );
}

function Tools() {
  const { L, lang, Forward } = useL();
  const tools = [
    { to: SIZE_PATH, icon: Ruler, kicker: L("מודד מידות", "Size meter"), title: L("מה מידת הטבעת שלך?", "What's your ring size?"), line: L("מגלים מהמסך, עם כרטיס וטבעת שיש לך. וגם אורך צמיד לפי פרק היד.", "Find out on your screen with a card and a ring you own. Plus bracelet length from your wrist.") },
    { to: GUIDE_PATH, icon: BookOpen, kicker: L("המדריך החינמי", "The free guide"), title: lang === "he" ? GUIDE.title.he : GUIDE.title.en, line: L("כסף 925, מואסניט, מבצעים אמיתיים והגנת קונה. אפשר לשמור כ־PDF.", "Silver 925, moissanite, real sales and buyer protection. Save it as a PDF.") },
  ];
  return (
    <section className="lx-wrap lx-luxe-section" aria-labelledby="h-tools">
      <Head id="h-tools" kicker={L("חינם", "Free")} title={L("רגע לפני שמזמינים", "Right before you order")} />
      <div className="lx-luxe-tools">
        {tools.map(({ to, icon: Icon, kicker, title, line }) => (
          <Go key={to} to={to} className="lx-luxe-tool">
            <span className="lx-luxe-kicker"><Icon size={14} aria-hidden="true" /> {kicker}</span>
            <span className="lx-luxe-tool-title">{title}</span>
            <span className="lx-luxe-tool-line">{line}</span>
            <span className="lx-luxe-more">{L("לפתוח", "Open")} <Forward size={15} aria-hidden="true" /></span>
          </Go>
        ))}
      </div>
    </section>
  );
}

function Sellers() {
  const { L } = useL();
  return (
    <section className="lx-wrap lx-luxe-section">
      <div className="lx-luxe-sellers">
        <p className="lx-luxe-kicker">LikeLink2 Studio</p>
        <h2 className="lx-luxe-h2">{L("יש לך מוצרים או קהל?", "Have products or an audience?")}</h2>
        <p className="lx-luxe-lead">{L("עמוד אישי עם המוצרים והסרטונים שלך, וכלים ליצירת תוכן עם סימון כן של מה שנוצר במחשב.", "Your own page with your products and videos, and content tools that honestly label what a computer made.")}</p>
        <div className="lx-luxe-ctas">
          <Go to="/studio" className="lx-luxe-btn lx-luxe-btn-solid">{L("לסטודיו", "Open the Studio")}</Go>
          <Go to="/merchants" className="lx-luxe-btn lx-luxe-btn-line">{L("לסוחרים", "For merchants")}</Go>
        </div>
      </div>
    </section>
  );
}

/** The home page. `extra` sits between the videos and the tools (e.g. the engine's own picks). */
export function LuxeHome({ graph, extra = null }) {
  const footage = useMemo(() => footageByProduct(graph.reels), [graph.reels]);
  const reel = useMemo(() => heroReel(graph.reels), [graph.reels]);
  const jewelry = graph.products.length > 0 && graph.products.every((p) => p.category === "Accessories");
  return (
    <div className="lx-luxe">
      <LuxeHero graph={graph} reel={reel} jewelry={jewelry} />
      <Pillars />
      <Collection graph={graph} footage={footage} heroProductId={reel?.productIds?.[0]} />
      <Motion graph={graph} footage={footage} />
      {extra}
      <Tools />
      <Sellers />
    </div>
  );
}
