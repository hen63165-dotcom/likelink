// The home page, built on LTK's idea (a white page, a light-blue hero with a
// big serif headline over a collage of real images and a phone playing a
// product video, then "how it works" told by three phone screens), for
// LikeLink2 and in Hebrew first.
//
// Every image shows the product it names: a clean frame from the seller's
// own video, or a store photo checked by eye (src/lib/looks.js). A product
// without one stays on /products and off this page. Videos are footage of the
// real product only, named by whose they are (homeShowcase.js). The phone
// screens are LikeLink2's own pages drawn with the same real records. No
// counters. Everything comes from the public graph (src/lib/publicDiscovery.js).
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Play, Ruler, Search } from "lucide-react";
import { REEL_STYLE_LABELS } from "../../lib/publicDiscovery.js";
import { creatorPath, productPath } from "../../lib/acquisition.js";
import { curatedProducts, footageByProduct, spotlight } from "../../lib/homeShowcase.js";
import { cleanImage, lookLabel, lookOf } from "../../lib/looks.js";
import { GUIDE, GUIDE_PATH } from "../../lib/guide.js";
import { SIZE_PATH } from "../../lib/sizeTool.js";
import { saleModelOf } from "../../lib/discovery/surfaces.js";
import { CreatorAvatar, Go, Img, NavCtx, ReelCard, SaveButton, useL, useReducedMotion } from "./kit";

// An image that fails to load leaves its light-blue cell, never a broken-image icon.
const hideBroken = (e) => e.currentTarget.classList.add("is-broken");

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

/** LTK's search-first line: a product or creator, straight to /search. */
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
      <label className="lx-sr" htmlFor="lx-luxe-q">{L("חיפוש מוצרים ויוצרות", "Search products and creators")}</label>
      <Search size={17} aria-hidden="true" />
      <input id="lx-luxe-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={jewelry ? L("צמיד, עגילים, טבעת…", "Bracelet, earrings, ring…") : L("מה מחפשים?", "What are you looking for?")} enterKeyHint="search" />
      <button type="submit">{L("חיפוש", "Search")}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ phone */

/** A phone drawn around one of LikeLink2's own screens. The whole phone is one link. */
function Phone({ to, label, className = "", children }) {
  return (
    <Go to={to} className={`lx-phone ${className}`} aria-label={label}>
      <span className="lx-phone-screen" aria-hidden="true">
        <span className="lx-phone-bar">LikeLink2</span>
        {children}
      </span>
    </Go>
  );
}

/** A product video inside the phone: whose video it is on top, the product under the footage (never over it). */
function PhoneVideo({ product, reel, play = true }) {
  const { L, lang } = useL();
  const video = useQuietVideo(play ? reel.url : "");
  const still = reel.poster || cleanImage(product)?.src || "";
  const thumb = cleanImage(product)?.src || still;
  return (
    <>
      <span className="lx-phone-video">
        {still ? <img src={still} alt="" onError={hideBroken} /> : null}
        {video.allowed ? (
          <video ref={video.ref} src={reel.url} muted playsInline loop preload="metadata" onPlaying={video.onPlaying} className={video.playing ? "is-on" : ""} />
        ) : null}
        <span className="lx-phone-label">{styleLabel(reel.style, lang)}</span>
      </span>
      <span className="lx-phone-product">
        <span className="lx-phone-thumb">{thumb ? <img src={thumb} alt="" onError={hideBroken} /> : null}</span>
        <span className="min-w-0">
          <span className="lx-phone-name">{product.displayTitle}</span>
          <span className="lx-phone-meta">{L("לפרטים ולחנות", "Details and store")}</span>
        </span>
      </span>
    </>
  );
}

/* ------------------------------------------------------------------- hero */

function Hero({ items, jewelry, featured, reel }) {
  const { L } = useL();
  const scrollTo = useScrollTo();
  // The frames that ship with the site lead (they cannot fail to load); a store photo comes last.
  const tiles = [...items].sort((a, b) => (lookOf(a.id) ? 0 : 1) - (lookOf(b.id) ? 0 : 1)).slice(0, 4);
  const tile = (i, key) => {
    const p = tiles[i];
    if (!p) return <span key={key} className="lx-hv-tile lx-hv-sky" aria-hidden="true" />;
    return (
      <Go key={key} to={productPath(p.id)} className="lx-hv-tile" aria-label={p.displayTitle}>
        <img src={cleanImage(p).src} alt="" loading={i < 2 ? "eager" : "lazy"} onError={hideBroken} />
      </Go>
    );
  };
  const sky = (key, tone = "") => <span key={key} className={`lx-hv-tile lx-hv-sky ${tone}`} aria-hidden="true" />;
  // Three columns like LTK's collage: real images on the sides, light-blue tiles, the phone in front.
  const columns = [
    [tile(0, "a0"), sky("a1", "is-deep"), tile(2, "a2")],
    [sky("b0"), sky("b1", "is-deep"), sky("b2")],
    [sky("c0", "is-deep"), tile(1, "c1"), tile(3, "c2")],
  ];
  return (
    <section className="lx-luxe-hero" aria-labelledby="h-luxe">
      <div className="lx-wrap lx-luxe-hero-grid">
        <div className="lx-luxe-copy">
          <h1 id="h-luxe" className="lx-luxe-title">
            {jewelry ? L("התכשיטים שהיוצרות בוחרות, במקום אחד.", "The jewelry creators pick, in one place.") : L("המוצרים שהיוצרות בוחרות, במקום אחד.", "The products creators pick, in one place.")}
          </h1>
          <p className="lx-luxe-lead">
            {jewelry
              ? L("צופים בסרטון של התכשיט, רואים מי בחרה אותו, בודקים מידה מהמסך וקונים ישר בחנות המקורית. בלי להירשם לאתר ובלי תוספת למחיר.", "Watch the piece on video, see who picked it, check your size on the screen and buy straight from the original store. No account, no extra cost.")
              : L("צופים בסרטון של המוצר, רואים מי בחרה אותו וקונים ישר בחנות המקורית. בלי להירשם לאתר ובלי תוספת למחיר.", "Watch the product on video, see who picked it and buy straight from the original store. No account, no extra cost.")}
          </p>
          <div className="lx-luxe-ctas">
            <a href="#collection" className="lx-luxe-btn lx-luxe-btn-dark" onClick={scrollTo("collection")}>{L("לקולקציה", "Shop the edit")}</a>
            <Go to="/creators" className="lx-luxe-btn lx-luxe-btn-line">{L("ליוצרות", "Creators")}</Go>
          </div>
          <HeroSearch jewelry={jewelry} />
          <p className="lx-luxe-fine">{L("#פרסומת · קישורי שותפים · התמונות מתוך סרטוני המוכרים ותמונות החנות", "Ad · affiliate links · images from the sellers' videos and store photos")}</p>
        </div>
        <div className="lx-hv">
          <div className="lx-hv-cols">
            {columns.map((col, i) => <div key={i} className={`lx-hv-col lx-hv-col-${i}`}>{col}</div>)}
          </div>
          {featured && reel ? (
            <Phone to={productPath(featured.id)} label={featured.displayTitle} className="lx-hv-phone">
              <PhoneVideo product={featured} reel={reel} />
            </Phone>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------- how it works (phones) */

/** A creator's shop, as /u/:slug shows it: her name, the tabs, the pieces she picked. */
function CreatorScreen({ creator, products }) {
  const { L } = useL();
  const pics = products.map((p) => cleanImage(p)?.src).filter(Boolean).slice(0, 4);
  while (pics.length < 4) pics.push("");
  return (
    <>
      <span className="lx-ps-head">
        <CreatorAvatar creator={creator} size={40} />
        <span className="min-w-0">
          <span className="lx-ps-kicker">{L("החנות של", "The shop of")}</span>
          <span className="lx-ps-title">{creator.name}</span>
        </span>
      </span>
      <span className="lx-ps-tabs"><b>{L("סרטונים", "Videos")}</b><span>{L("מוצרים", "Products")}</span><span>{L("אוספים", "Collections")}</span></span>
      <span className="lx-ps-grid">
        {pics.map((src, i) => <span key={i} className="lx-ps-cell">{src ? <img src={src} alt="" loading="lazy" onError={hideBroken} /> : null}</span>)}
      </span>
    </>
  );
}

/** The search page: a query, and the products with their names. */
function FindScreen({ products, jewelry }) {
  const { L } = useL();
  const shown = products.slice(0, 4);
  return (
    <>
      <span className="lx-ps-search"><Search size={13} /> {jewelry ? L("צמיד כסף", "Silver bracelet") : L("מה מחפשים?", "What are you looking for?")}</span>
      <span className="lx-ps-grid lx-ps-grid-named">
        {shown.map((p) => (
          <span key={p.id} className="lx-ps-item">
            <span className="lx-ps-cell"><img src={cleanImage(p).src} alt="" loading="lazy" onError={hideBroken} /></span>
            <span className="lx-ps-name">{p.displayTitle}</span>
          </span>
        ))}
      </span>
    </>
  );
}

function HowItWorks({ graph, items, footage, featured, jewelry }) {
  const { L } = useL();
  const creator = useMemo(() => {
    const curated = new Set(items.map((p) => p.id));
    return graph.creators.find((c) => c.productIds.some((id) => curated.has(id))) || null;
  }, [graph.creators, items]);
  const hers = creator ? items.filter((p) => creator.productIds.includes(p.id)) : [];
  // The third phone plays another video than the hero's when there is one.
  const other = items.find((p) => footage.has(p.id) && p.id !== featured?.id) || featured;
  const steps = [
    creator
      ? {
          to: creatorPath(creator.slug),
          title: L("מכירים את היוצרות", "Meet the creators"),
          line: L("לכל יוצרת יש חנות משלה: הסרטונים, המוצרים והאוספים שהיא בחרה, בעמוד אחד.", "Every creator has her own shop: the videos, products and collections she picked, on one page."),
          screen: <CreatorScreen creator={creator} products={hers} />,
        }
      : null,
    {
      to: "/products",
      title: L("מוצאים מוצרים", "Find products"),
      line: L("מחפשים מוצר או יוצרת. בכל מוצר כתוב מי בחרה אותו ובאיזו חנות הוא נמכר.", "Search for a product or a creator. Every product says who picked it and which store sells it."),
      screen: <FindScreen products={items} jewelry={jewelry} />,
    },
    other && footage.get(other.id)
      ? {
          to: `/reels?r=${encodeURIComponent(footage.get(other.id).id)}`,
          title: L("צופים וקונים", "Watch and shop"),
          line: L("סרטון של המוצר, עם סימון של מי הסרטון, והקישור לחנות המקורית ממש מתחתיו. קישור שותפים, בלי תוספת למחיר.", "A video of the product, labelled with whose it is, and the original store's link right under it. An affiliate link, at no extra cost."),
          screen: <PhoneVideo product={other} reel={footage.get(other.id)} />,
        }
      : null,
  ].filter(Boolean);
  return (
    <section id="how" className="lx-wrap lx-luxe-section" aria-labelledby="h-how">
      <p className="lx-luxe-kicker">{L("איך זה עובד", "How it works")}</p>
      <h2 id="h-how" className="lx-luxe-h2">{L("רואים מי בחרה, צופים בסרטון, קונים בחנות.", "See who picked it, watch it, buy it at the store.")}</h2>
      <ol className="lx-why">
        {steps.map((s, i) => (
          <li key={s.title} className="lx-why-item">
            <div className="lx-why-stage">
              <Phone to={s.to} label={s.title} className="lx-why-phone">{s.screen}</Phone>
            </div>
            <p className="lx-why-title"><span className="lx-why-num" aria-hidden="true">{i + 1}</span> {s.title}</p>
            <p className="lx-why-line">{s.line}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* --------------------------------------------------------------- sections */

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

/** LTK's feed: shoppable posts, each video with its product right under it (ReelCard). */
function Posts({ graph, footage }) {
  const { L } = useL();
  const reels = [...footage.values()];
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
    <section className="lx-wrap lx-luxe-section" aria-labelledby="h-creators">
      <div className="lx-luxe-band">
        <p className="lx-luxe-kicker">LikeLink2 Studio</p>
        <h2 id="h-creators" className="lx-luxe-band-title">{L("הבחירות שלך, בחנות משלך.", "Your picks, in a shop of your own.")}</h2>
        <p className="lx-luxe-lead">{L("עמוד אישי עם המוצרים והסרטונים שלך, קישור אחד לשתף, וכלים ליצירת תוכן עם סימון כן של מה שנוצר במחשב.", "Your own page with your products and videos, one link to share, and content tools that honestly label what a computer made.")}</p>
        <div className="lx-luxe-ctas">
          <Go to="/join" className="lx-luxe-btn lx-luxe-btn-dark">{L("הצטרפות כיוצרת", "Apply to be a creator")}</Go>
          <Go to="/merchants" className="lx-luxe-btn lx-luxe-btn-line">{L("לסוחרים", "For merchants")}</Go>
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
      <Hero items={items} jewelry={jewelry} featured={featured} reel={featuredReel} />
      <HowItWorks graph={graph} items={items} footage={footage} featured={featured} jewelry={jewelry} />
      <Collection items={items} footage={footage} />
      <Posts graph={graph} footage={footage} />
      {extra}
      <Creators />
      <Tools />
    </div>
  );
}
