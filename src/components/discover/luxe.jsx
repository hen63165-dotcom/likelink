// The home page, built on LTK's editorial idea (black and white, a serif
// headline over a collage of real images, creator videos with the products
// right under them), for LikeLink2 and in Hebrew first.
//
// Every image shows the product it names: a clean frame from the seller's
// own video, or a store photo checked by eye (src/lib/looks.js). A product
// without one stays on /products and off this page. Videos are footage of the
// real product only, named by whose they are (homeShowcase.js). No counters.
// Everything comes from the public graph (src/lib/publicDiscovery.js).
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Play, Ruler, Search } from "lucide-react";
import { REEL_STYLE_LABELS } from "../../lib/publicDiscovery.js";
import { productPath } from "../../lib/acquisition.js";
import { curatedProducts, footageByProduct, spotlight } from "../../lib/homeShowcase.js";
import { cleanImage, lookLabel, lookOf } from "../../lib/looks.js";
import { GUIDE, GUIDE_PATH } from "../../lib/guide.js";
import { SIZE_PATH } from "../../lib/sizeTool.js";
import { saleModelOf } from "../../lib/discovery/surfaces.js";
import { Go, Img, NavCtx, ReelCard, SaveButton, useL, useReducedMotion } from "./kit";

function styleLabel(style, lang) {
  const l = REEL_STYLE_LABELS[style];
  return l ? (lang === "he" ? l.he : l.en) : "";
}

function metaLine(product, picture, L, lang) {
  return [product.merchant, picture?.source ? lookLabel(picture.source, lang) : "", saleModelOf(product) === "affiliate" ? L("קישור שותפים", "Affiliate link") : ""].filter(Boolean).join(" · ");
}

/** A hash change would fire popstate, and the router scrolls to the top on it: scroll here instead. */
function useScrollTo() {
  const reduced = useReducedMotion();
  return (id) => (e) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };
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

/** LTK's search-first header line: a product or creator, straight to /search. */
function HeroSearch({ jewelry }) {
  const { L } = useL();
  const navigate = useContext(NavCtx);
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="lx-luxe-search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      }}
    >
      <label className="lx-sr" htmlFor="lx-luxe-q">{L("חיפוש מוצרים ויוצרים", "Search products and creators")}</label>
      <Search size={17} aria-hidden="true" />
      <input id="lx-luxe-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={jewelry ? L("צמיד, עגילים, טבעת…", "Bracelet, earrings, ring…") : L("מה מחפשים?", "What are you looking for?")} enterKeyHint="search" />
      <button type="submit">{L("חיפוש", "Search")}</button>
    </form>
  );
}

function Hero({ items, jewelry }) {
  const { L } = useL();
  const scrollTo = useScrollTo();
  // The frames that ship with the site lead (they cannot fail to load); a store photo comes last.
  const tiles = [...items].sort((a, b) => (lookOf(a.id) ? 0 : 1) - (lookOf(b.id) ? 0 : 1)).slice(0, 4);
  return (
    <section className="lx-luxe-hero" aria-labelledby="h-luxe">
      <div className="lx-wrap lx-luxe-hero-grid">
        <div className="lx-luxe-copy">
          <p className="lx-luxe-eyebrow">{jewelry ? L("תכשיטים · LikeLink2", "Jewelry · LikeLink2") : "LikeLink2"}</p>
          <h1 id="h-luxe" className="lx-luxe-title">{L("רואים. בודקים. קונים.", "See it. Check it. Buy it.")}</h1>
          <p className="lx-luxe-lead">
            {jewelry
              ? L("LikeLink2 הוא המקום לגלות תכשיטים דרך סרטוני מוצר: רואים אותם בתנועה, בודקים מידה מהמסך וקונים ישר בחנות המקורית.", "LikeLink2 is where you discover jewelry through product videos: see it move, check your size on the screen and buy straight from the original store.")
              : L("LikeLink2 הוא המקום לגלות מוצרים דרך סרטוני מוצר: רואים אותם בתנועה וקונים ישר בחנות המקורית.", "LikeLink2 is where you discover products through product videos: see them move and buy straight from the original store.")}
          </p>
          <div className="lx-luxe-ctas">
            <a href="#collection" className="lx-luxe-btn lx-luxe-btn-white" onClick={scrollTo("collection")}>{L("לקולקציה", "Shop the edit")}</a>
            <Go to="/creators" className="lx-luxe-btn lx-luxe-btn-ghost">{L("ליוצרים", "Creators")}</Go>
          </div>
          <HeroSearch jewelry={jewelry} />
          <a href="#how" className="lx-luxe-how" onClick={scrollTo("how")}>{L("איך זה עובד?", "How does it work?")}</a>
          <p className="lx-luxe-fine">{L("#פרסומת · קישורי שותפים · התמונות מתוך סרטוני המוכרים ותמונות החנות", "Ad · affiliate links · images from the sellers' videos and store photos")}</p>
        </div>
        {tiles.length ? (
          <div className={`lx-luxe-collage lx-luxe-collage-${tiles.length}`}>
            {tiles.map((p, i) => (
              <Go key={p.id} to={productPath(p.id)} className={`lx-luxe-tile lx-luxe-tile-${i}`} aria-label={p.displayTitle}>
                <img src={cleanImage(p).src} alt="" loading={i < 2 ? "eager" : "lazy"} onError={(e) => e.currentTarget.classList.add("is-broken")} />
              </Go>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { L } = useL();
  const steps = [
    { title: L("רואים את התכשיט בסרטון", "See it on video"), line: L("לא רק תמונה אחת: סרטון של המוצר מראה איך הוא זז, נוצץ ויושב.", "Not just one photo: a product video shows how it moves, shines and sits.") },
    { title: L("בודקים מידה ופרטים", "Check the size and details"), line: L("מודד המידות עובד מהמסך, והמדריך החינמי עוזר לבדוק חומר והגנת קונה.", "The size meter works on your screen, and the free guide helps you check the material and buyer protection.") },
    { title: L("קונים ישר בחנות", "Buy at the store"), line: L("הקישור מוביל לעמוד המוצר בחנות המקורית. קישור שותפים, בלי תוספת למחיר.", "The link opens the product page in the original store. An affiliate link, at no extra cost.") },
  ];
  return (
    <section id="how" className="lx-wrap lx-luxe-section" aria-labelledby="h-how">
      <p className="lx-luxe-kicker">{L("איך זה עובד", "How it works")}</p>
      <h2 id="h-how" className="lx-luxe-h2">{L("שלושה צעדים, בלי הפתעות.", "Three steps, no surprises.")}</h2>
      <ol className="lx-luxe-steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="lx-luxe-num" aria-hidden="true">{i + 1}</span>
            <span className="lx-luxe-step-title">{s.title}</span>
            <span className="lx-luxe-step-line">{s.line}</span>
          </li>
        ))}
      </ol>
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
  const picture = cleanImage(product);
  return (
    <article className="lx-luxe-piece">
      <Go to={to} className="lx-luxe-shot" aria-label={product.displayTitle}>
        <Img src={picture.src} alt={product.displayTitle} />
        {hasVideo ? <span className="lx-luxe-tag" aria-label={L("יש סרטון", "Has a video")}><Play size={11} fill="currentColor" aria-hidden="true" /></span> : null}
      </Go>
      <SaveButton productId={product.id} className="absolute end-2.5 top-2.5" />
      <Go to={to} className="lx-luxe-name">{product.displayTitle}</Go>
      <p className="lx-luxe-sub">{metaLine(product, picture, L, lang)}</p>
    </article>
  );
}

function Collection({ items, footage }) {
  const { L } = useL();
  if (!items.length) return null;
  return (
    <section id="collection" className="lx-wrap lx-luxe-section" aria-labelledby="h-collection">
      <Head id="h-collection" kicker={L("הקולקציה", "The edit")} title={L("נבחרו אחד־אחד.", "Chosen one by one.")} to="/products" linkLabel={L("לכל המוצרים", "All products")} />
      <div className="lx-luxe-grid">
        {items.map((p) => <Piece key={p.id} product={p} hasVideo={footage.has(p.id)} />)}
      </div>
    </section>
  );
}

/** LTK-style video post: the footage, whose it is, and the piece right beside it. */
function Spotlight({ product, reel }) {
  const { L, lang } = useL();
  const picture = cleanImage(product);
  const video = useQuietVideo(reel.url);
  const to = productPath(product.id);
  return (
    <section className="lx-wrap lx-luxe-section" aria-labelledby="h-spot">
      <div className="lx-luxe-spot">
        <Go to={to} className="lx-luxe-spot-media" aria-label={product.displayTitle}>
          {reel.poster || picture.src ? <img src={reel.poster || picture.src} alt="" /> : null}
          {video.allowed ? (
            <video ref={video.ref} src={reel.url} muted playsInline loop preload="metadata" onPlaying={video.onPlaying} className={video.playing ? "is-on" : ""} aria-label={product.displayTitle} />
          ) : null}
        </Go>
        <div className="lx-luxe-spot-copy">
          <p className="lx-luxe-kicker">{L("בסרטון", "In the video")}</p>
          <h2 id="h-spot" className="lx-luxe-h2">{product.displayTitle}</h2>
          <p className="lx-luxe-sub">{styleLabel(reel.style, lang)}</p>
          <p className="lx-luxe-sub">{metaLine(product, null, L, lang)}</p>
          <div className="lx-luxe-ctas">
            <Go to={to} className="lx-luxe-btn lx-luxe-btn-dark">{L("לפרטים", "Details")}</Go>
            <Go to={`/reels?r=${encodeURIComponent(reel.id)}`} className="lx-luxe-btn lx-luxe-btn-line"><Play size={15} aria-hidden="true" /> {L("לכל הסרטונים", "All videos")}</Go>
          </div>
        </div>
      </div>
    </section>
  );
}

/** LTK's feed: shoppable posts, each video with its product right under it (ReelCard). */
function Posts({ graph, footage, skip }) {
  const { L } = useL();
  const reels = [...footage.values()].filter((r) => r.id !== skip);
  if (!reels.length) return null;
  return (
    <section className="lx-wrap lx-luxe-section" aria-labelledby="h-posts">
      <Head id="h-posts" kicker={L("פוסטים", "Posts")} title={L("צופים, ובאותו מקום קונים.", "Watch it, shop it, right there.")} to="/reels" linkLabel={L("לכל הסרטונים", "All videos")} />
      <div className="lx-posts">
        {reels.map((r) => <ReelCard key={r.id} reel={r} graph={graph} shoppable ratio="4 / 5" attribution={{ src: "likelink_home", camp: r.id }} />)}
      </div>
    </section>
  );
}

function Creators() {
  const { L } = useL();
  return (
    <section className="lx-luxe-band" aria-labelledby="h-creators">
      <div className="lx-wrap lx-luxe-band-in">
        <p className="lx-luxe-eyebrow">LikeLink2 Studio</p>
        <h2 id="h-creators" className="lx-luxe-band-title">{L("הטעם שלך יכול להיות עסק.", "Your taste can be a business.")}</h2>
        <p className="lx-luxe-lead">{L("עמוד אישי עם המוצרים והסרטונים שלך, קישור אחד לשתף, וכלים ליצירת תוכן עם סימון כן של מה שנוצר במחשב.", "Your own page with your products and videos, one link to share, and content tools that honestly label what a computer made.")}</p>
        <div className="lx-luxe-ctas">
          <Go to="/join" className="lx-luxe-btn lx-luxe-btn-white">{L("דף יוצרת בחינם", "A free creator page")}</Go>
          <Go to="/merchants" className="lx-luxe-btn lx-luxe-btn-ghost">{L("לסוחרים", "For merchants")}</Go>
        </div>
      </div>
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
      <Head id="h-tools" kicker={L("חינם", "Free")} title={L("רגע לפני שמזמינים.", "Right before you order.")} />
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

/** The home page. `extra` sits after the videos (e.g. the engine's own picks). */
export function LuxeHome({ graph, extra = null }) {
  const footage = useMemo(() => footageByProduct(graph.reels), [graph.reels]);
  const items = useMemo(() => curatedProducts(graph.products), [graph.products]);
  const featured = useMemo(() => spotlight(graph.products, footage), [graph.products, footage]);
  const jewelry = graph.products.length > 0 && graph.products.every((p) => p.category === "Accessories");
  const featuredReel = featured ? footage.get(featured.id) : null;
  return (
    <div className="lx-luxe">
      <Hero items={items} jewelry={jewelry} />
      <HowItWorks />
      <Collection items={items} footage={footage} />
      {featured && featuredReel ? <Spotlight product={featured} reel={featuredReel} /> : null}
      <Posts graph={graph} footage={footage} skip={featuredReel?.id} />
      {extra}
      <Creators />
      <Tools />
    </div>
  );
}
