// The home page, built like the big shopping sites (LTK, the jewelry houses):
// a white page, one clear sentence, and a "shoppable post" — a real video of
// the piece with the product listed right under it, one tap from the store.
// Then the collection in clean, uniform images, the videos, the free tools
// and one quiet line for sellers.
//
// Images: a clean frame from the seller's own video where the store photo
// carries banners or text (src/lib/looks.js), always named as the seller's.
// Videos: footage of the real product only (homeShowcase.js). No counters.
// Everything comes from the public graph (src/lib/publicDiscovery.js).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ExternalLink, Play, Ruler } from "lucide-react";
import { REEL_STYLE_LABELS } from "../../lib/publicDiscovery.js";
import { productPath } from "../../lib/acquisition.js";
import { collectionOrder, footageByProduct, heroProduct } from "../../lib/homeShowcase.js";
import { heroLook, lookLabel, lookOf } from "../../lib/looks.js";
import { GUIDE, GUIDE_PATH } from "../../lib/guide.js";
import { SIZE_PATH } from "../../lib/sizeTool.js";
import { saleModelOf } from "../../lib/discovery/surfaces.js";
import { Go, Img, Rail, SaveButton, useL, useReducedMotion } from "./kit";

function styleLabel(style, lang) {
  const l = REEL_STYLE_LABELS[style];
  return l ? (lang === "he" ? l.he : l.en) : "";
}

/** The image a product shows: its clean frame, else the store photo. */
function pictureOf(product) {
  const look = lookOf(product.id);
  return look ? { src: look.src, source: look.source } : { src: product.media.image, source: "" };
}

/** Plays a muted loop while on screen; reduced motion or data saver keep the still image. */
function useQuietVideo(src) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const allowed = Boolean(src) && !reduced && !(typeof navigator !== "undefined" && navigator.connection?.saveData);
  useEffect(() => {
    const el = ref.current;
    if (!el || !allowed) return undefined;
    // iOS plays inline video by itself only when it is muted as a property.
    el.muted = true;
    const play = () => el.play?.().catch(() => {});
    if (typeof IntersectionObserver === "undefined") {
      play();
      return undefined;
    }
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : el.pause?.()), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [src, allowed]);
  return { ref, allowed, playing, onPlaying: () => setPlaying(true) };
}

/** LTK-style post: the video of the piece, and the piece itself right under it. */
function ShopPost({ product, reel }) {
  const { L, lang } = useL();
  const hero = heroLook();
  const still = product.id === hero.productId ? hero.src : pictureOf(product).src;
  const video = useQuietVideo(reel?.url);
  const to = productPath(product.id);
  const credit = reel ? styleLabel(reel.style, lang) : lookLabel(hero.source, lang);
  const thumb = pictureOf(product).src;
  return (
    <article className="lx-luxe-post">
      <Go to={to} className="lx-luxe-post-media" aria-label={product.displayTitle}>
        {still ? <img src={still} alt="" /> : null}
        {video.allowed ? (
          <video ref={video.ref} src={reel.url} muted playsInline loop preload="metadata" onPlaying={video.onPlaying} className={video.playing ? "is-on" : ""} aria-label={product.displayTitle} />
        ) : null}
        <span className="lx-luxe-post-credit">{credit}</span>
        {reel ? <span className="lx-luxe-post-play" aria-hidden="true"><Play size={13} fill="currentColor" /></span> : null}
      </Go>
      <div className="lx-luxe-post-shop">
        <p className="lx-luxe-post-label">{L("בסרטון", "In this video")}</p>
        <Go to={to} className="lx-luxe-post-item">
          <span className="lx-luxe-post-thumb">{thumb ? <img src={thumb} alt="" /> : null}</span>
          <span className="lx-luxe-post-text">
            <span className="lx-luxe-post-name">{product.displayTitle}</span>
            <small>{[product.merchant, saleModelOf(product) === "affiliate" ? L("קישור שותפים", "Affiliate link") : ""].filter(Boolean).join(" · ")}</small>
          </span>
          <span className="lx-luxe-post-go">{L("לפרטים", "Details")}</span>
        </Go>
      </div>
    </article>
  );
}

function Hero({ product, reel, jewelry }) {
  const { L } = useL();
  const reduced = useReducedMotion();
  // A hash change would fire popstate, and the router scrolls to the top on it: scroll here instead.
  const toCollection = (e) => {
    const el = document.getElementById("collection");
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };
  const points = [
    { icon: Play, text: L("סרטון של המוצר", "A video of the item") },
    { icon: ExternalLink, text: L("ישר לחנות המקורית", "Straight to the store") },
    { icon: Ruler, text: L("מודד מידות חינמי", "A free size meter") },
  ];
  return (
    <section className="lx-wrap lx-luxe-hero" aria-labelledby="h-luxe">
      <div className="lx-luxe-copy">
        <p className="lx-luxe-kicker">{jewelry ? L("תכשיטים · LikeLink2", "Jewelry · LikeLink2") : "LikeLink2"}</p>
        <h1 id="h-luxe" className="lx-luxe-title">
          {jewelry ? L("רואים את התכשיט בתנועה, לפני שקונים.", "See the piece in motion before you buy.") : L("רואים את המוצר בתנועה, לפני שקונים.", "See it in motion before you buy.")}
        </h1>
        <p className="lx-luxe-lead">
          {L("מבחר קטן ומדויק: סרטון של המוצר, קישור ישיר לחנות ומודד מידות שעובד מהמסך.", "A small, precise edit: a video of the piece, a direct link to the store and a size meter that works on your screen.")}
        </p>
        <div className="lx-luxe-ctas">
          <a href="#collection" className="lx-luxe-btn lx-luxe-btn-solid" onClick={toCollection}>{L("לקולקציה", "Shop the edit")}</a>
          <Go to={SIZE_PATH} className="lx-luxe-btn lx-luxe-btn-line">{L("מה המידה שלי?", "What's my size?")}</Go>
        </div>
        <ul className="lx-luxe-points">
          {points.map(({ icon: Icon, text }) => (
            <li key={text}><Icon size={15} strokeWidth={1.75} aria-hidden="true" /> {text}</li>
          ))}
        </ul>
      </div>
      {product ? <ShopPost product={product} reel={reel} /> : null}
    </section>
  );
}

function Head({ id, kicker, title, to, linkLabel }) {
  const { Forward } = useL();
  return (
    <div className="lx-luxe-head">
      <div>
        {kicker ? <p className="lx-luxe-kicker">{kicker}</p> : null}
        <h2 id={id} className="lx-luxe-h2">{title}</h2>
      </div>
      {to ? <Go to={to} className="lx-luxe-more">{linkLabel} <Forward size={15} aria-hidden="true" /></Go> : null}
    </div>
  );
}

function Piece({ product, hasVideo }) {
  const { L, lang } = useL();
  const to = productPath(product.id);
  const picture = pictureOf(product);
  return (
    <article className="lx-luxe-piece">
      <Go to={to} className="lx-luxe-shot" aria-label={product.displayTitle}>
        <Img src={picture.src} alt={product.displayTitle} />
        {hasVideo ? <span className="lx-luxe-tag" aria-label={L("יש סרטון", "Has a video")}><Play size={11} fill="currentColor" aria-hidden="true" /></span> : null}
      </Go>
      <SaveButton productId={product.id} className="absolute end-2.5 top-2.5" />
      <Go to={to} className="lx-luxe-name">{product.displayTitle}</Go>
      <p className="lx-luxe-sub">
        {[product.merchant, picture.source ? lookLabel(picture.source, lang) : "", saleModelOf(product) === "affiliate" ? L("קישור שותפים", "Affiliate link") : ""].filter(Boolean).join(" · ")}
      </p>
    </article>
  );
}

function Collection({ graph, footage }) {
  const { L } = useL();
  const items = collectionOrder(graph.products);
  if (!items.length) return null;
  return (
    <section id="collection" className="lx-wrap lx-luxe-section" aria-labelledby="h-collection">
      <Head id="h-collection" kicker={L("הקולקציה", "The edit")} title={L("נבחרו אחד־אחד", "Chosen one by one")} to="/products" linkLabel={L("לכל המוצרים", "All products")} />
      <div className="lx-luxe-grid">
        {items.map((p) => <Piece key={p.id} product={p} hasVideo={footage.has(p.id)} />)}
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
      <Rail item="minmax(180px, 1fr)" label={L("סרטוני מוצרים", "Product videos")}>
        {reels.map((r) => {
          const product = graph.byId.get(r.productIds[0]);
          return (
            <Go key={r.id} to={`/reels?r=${encodeURIComponent(r.id)}`} className="lx-luxe-reel">
              <span className="lx-luxe-reel-media">
                <Img src={r.poster || (product ? pictureOf(product).src : "")} alt={product?.displayTitle || ""} />
                <span className="lx-luxe-reel-play" aria-hidden="true"><Play size={16} fill="currentColor" /></span>
              </span>
              <span className="lx-luxe-reel-name">{product?.displayTitle}</span>
              <small className="lx-luxe-sub">{styleLabel(r.style, lang)}</small>
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
            <span className="lx-luxe-tool-kicker"><Icon size={15} aria-hidden="true" /> {kicker}</span>
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
        <div>
          <h2 className="lx-luxe-h2">{L("יש לך מוצרים או קהל?", "Have products or an audience?")}</h2>
          <p className="lx-luxe-lead">{L("עמוד אישי עם המוצרים והסרטונים שלך, וכלים ליצירת תוכן עם סימון כן של מה שנוצר במחשב.", "Your own page with your products and videos, and content tools that honestly label what a computer made.")}</p>
        </div>
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
  const product = useMemo(() => heroProduct(graph.products), [graph.products]);
  const reel = product ? footage.get(product.id) || null : null;
  const jewelry = graph.products.length > 0 && graph.products.every((p) => p.category === "Accessories");
  return (
    <div className="lx-luxe">
      <Hero product={product} reel={reel} jewelry={jewelry} />
      <Collection graph={graph} footage={footage} />
      <Motion graph={graph} footage={footage} />
      {extra}
      <Tools />
      <Sellers />
    </div>
  );
}
