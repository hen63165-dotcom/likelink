// LikeLink2 public pages. All data comes from the public graph
// (src/lib/publicDiscovery.js); every section that lacks real evidence shows
// an honest state instead of a filler.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpLeft,
  Camera,
  Mic,
  Clapperboard,
  Compass,
  Flame,
  Heart,
  LayoutGrid,
  Package,
  Search,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useMarketplace } from "../../context/MarketplaceContext";
import {
  collectionsFor,
  findCollection,
  findCreator,
  lunaPicks,
  productInsights,
  relatedProducts,
  offersOf,
  evidenceOf,
  searchGraph,
  TREND_MIN_EVENTS,
  TREND_WINDOW_DAYS,
} from "../../lib/publicDiscovery.js";
import { creatorPath, productPath } from "../../lib/acquisition.js";
import { trackAcquisition, trackSiteEvent } from "../../lib/acquisitionTrack.js";
import { trackReferralClick } from "../../lib/referral.js";
import { trackLanding } from "../../lib/funnel.js";
import { enginePicksFrom } from "../../lib/growth/enginePicks.js";
import {
  categoryName,
  CollectionCard,
  CreatorAvatar,
  CreatorCard,
  DealCard,
  Disclosure,
  EmptyState,
  FollowButton,
  formatPrice,
  Go,
  Img,
  LunaInsight,
  Media,
  MediaBadge,
  PriceLine,
  ProductCard,
  Rail,
  ReelCard,
  SaveButton,
  SectionHead,
  ShareButton,
  ShopButton,
  sized,
  StyleBadge,
  TrendCard,
  TrustBadge,
  useL,
} from "./kit";

/* ----------------------------------------------------------------- helpers */

function viewedIds() {
  try {
    const v = JSON.parse(sessionStorage.getItem("ll_viewed") || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function useQueryParam(name) {
  const [value, setValue] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch {
      return "";
    }
  });
  const set = (v) => {
    setValue(v);
    try {
      const u = new URL(window.location.href);
      if (v) u.searchParams.set(name, v);
      else u.searchParams.delete(name);
      window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}`);
    } catch {
      /* ignore */
    }
  };
  return [value, set];
}

const PRICE_BANDS = [
  { id: "under50", he: "עד ₪50", en: "Under ₪50", test: (p) => p > 0 && p < 50 },
  { id: "under100", he: "עד ₪100", en: "Under ₪100", test: (p) => p > 0 && p < 100 },
  { id: "100-250", he: "₪100–250", en: "₪100–250", test: (p) => p >= 100 && p <= 250 },
  { id: "250plus", he: "₪250 ומעלה", en: "₪250+", test: (p) => p > 250 },
];

/** Pinterest-like masonry with a varied rhythm of card heights. */
function Masonry({ products, graph, eagerFirst = false }) {
  const ratios = ["4 / 5", "3 / 4", "1 / 1", "4 / 5", "2 / 3", "1 / 1"];
  return (
    <div className="columns-2 gap-3 md:columns-3 md:gap-4 xl:columns-4">
      {products.map((p, i) => (
        <div key={p.id} className="mb-3 break-inside-avoid md:mb-4">
          <ProductCard product={p} creator={graph.creatorById.get(p.marketerId)} ratio={ratios[i % ratios.length]} eager={eagerFirst && i < 4} />
        </div>
      ))}
    </div>
  );
}

function Grid({ products, graph, cols = "grid-cols-2 md:grid-cols-3 xl:grid-cols-4", why = null }) {
  return (
    <div className={`grid ${cols} gap-3 md:gap-4`}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} why={why ? why.get(p.id) : null} />
      ))}
    </div>
  );
}

/**
 * What the marketing engine published to LikeLink's own feed. Only posts whose
 * product is in the public graph (or a LikeLink page) are shown. Each link
 * keeps its creative id (cid), so a visit from here is measured.
 */
function EnginePicks({ graph }) {
  const { L, lang } = useL();
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/store?mode=brand-pulse")
      .then((r) => r.json())
      .then((d) => { if (alive && d?.ok) setPosts(enginePicksFrom(d.posts, graph)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [graph]);
  if (!posts.length) return null;
  return (
    <Section labelledBy="h-engine">
      <SectionHead id="h-engine" kicker={<><Sparkles size={14} /> {L("לונה מקדמת עכשיו", "Luna is promoting")}</>} title={L("מה עלה עכשיו בפיד של LikeLink", "Fresh on the LikeLink feed")} sub={L("פוסטים שמנוע השיווק פרסם כאן. כל לינק נמדד, וסרטון מסומן אם הוא אנימציה", "Posts the marketing engine published here. Every link is measured; animation is labelled")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((x) => (
          <Go key={x.id} to={x.to} onClick={() => setTimeout(trackLanding, 0)} className="lx-card block overflow-hidden" style={{ borderRadius: 18 }}>
            {x.image ? <Media src={x.image} alt={x.title} ratio="4 / 3" width={480} /> : null}
            <div className="p-4">
              <p className="text-[15px] font-bold leading-snug">{x.hook}</p>
              <p className="lx-mute mt-1 text-[13px]">{x.title}{x.price ? ` · ${formatPrice(x.price, lang)}` : ""}</p>
              {x.animated ? <p className="lx-mute mt-2 text-[12px]">{L("כולל סרטון · אנימציה ממוחשבת, לא צולם", "Includes a computer-animated video")}</p> : null}
              {x.affiliate ? <p className="lx-mute mt-1 text-[11px]">{L("#פרסומת · קישור שותפים", "Ad · affiliate link")}</p> : null}
            </div>
          </Go>
        ))}
      </div>
    </Section>
  );
}

function Section({ children, className = "", id, labelledBy }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`lx-wrap mt-14 md:mt-20 ${className}`}>
      {children}
    </section>
  );
}

function PageHero({ kicker, title, sub, children }) {
  return (
    <div className="lx-wrap pt-8 md:pt-12">
      {kicker ? <p className="lx-kicker mb-2">{kicker}</p> : null}
      <h1 className="lx-display text-[36px] md:text-[56px]">{title}</h1>
      {sub ? <p className="lx-mute mt-3 max-w-2xl text-[15px] leading-7 md:text-[17px]">{sub}</p> : null}
      {children}
    </div>
  );
}

function CategoryChips({ graph, active, base = "/discover", allLabel }) {
  const { L, lang } = useL();
  return (
    <div className="-mx-4 mt-6 overflow-x-auto px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: "none" }}>
      <div className="flex w-max gap-2">
        <Go to={base} className="lx-chip" aria-current={!active ? "page" : undefined}>{allLabel || L("הכל", "All")}</Go>
        {graph.categories.map((c) => (
          <Go key={c.id} to={`${base}/${encodeURIComponent(c.id)}`} className="lx-chip" aria-current={active === c.id ? "page" : undefined}>
            {categoryName(c.id, lang)} <span className="opacity-60">{c.count}</span>
          </Go>
        ))}
      </div>
    </div>
  );
}

/** Category rail — round covers from real product images. */
function CategoryRail({ graph }) {
  const { lang } = useL();
  return (
    <Rail item="minmax(92px, 104px)" label="categories">
      {graph.categories.map((c) => (
        <Go key={c.id} to={`/discover/${encodeURIComponent(c.id)}`} className="group flex flex-col items-center gap-2 text-center">
          <span className="block h-[84px] w-[84px] overflow-hidden rounded-full border-[3px] border-white shadow-md transition-transform group-hover:scale-105" style={{ background: "var(--lx-sunk)" }}>
            <Img src={sized(c.cover, 200)} />
          </span>
          <span className="text-[13px] font-semibold leading-tight">{categoryName(c.id, lang)}</span>
        </Go>
      ))}
    </Rail>
  );
}

const MATCH_LABEL_HE = { same_photo: "נראה כמו אותה תמונה", similar: "התאמה דומה" };
const MATCH_LABEL_EN = { same_photo: "Looks like the same photo", similar: "Similar match" };
const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function SearchBox({ value, onChange, onSubmit, autoFocus = false, big = false, onImage = null }) {
  const { L, lang } = useL();
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [listening, setListening] = useState(false);
  // Voice: the browser's own speech recognition (no provider, no upload by us).
  function listen() {
    if (!SpeechRec || listening) return;
    const rec = new SpeechRec();
    rec.lang = lang === "he" ? "he-IL" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { const t = e.results?.[0]?.[0]?.transcript || ""; if (t) { onChange(t); onSubmit?.(t); } };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <form
      role="search"
      className="lx-search"
      style={big ? { minHeight: 62 } : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
      }}
    >
      <Search size={20} className="lx-mute shrink-0" aria-hidden="true" />
      <label htmlFor="lx-q" className="lx-sr">{L("חיפוש", "Search")}</label>
      <input
        id="lx-q"
        ref={ref}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={L("מה מחפשים? מוצר, יוצר/ת, קטגוריה…", "Search products, creators, categories…")}
      />
      {value ? (
        <button type="button" className="lx-icon-btn" style={{ width: 36, height: 36 }} onClick={() => onChange("")} aria-label={L("ניקוי", "Clear")}>
          <X size={16} />
        </button>
      ) : null}
      {big && SpeechRec ? (
        <button type="button" className="lx-icon-btn" style={{ width: 38, height: 38 }} onClick={listen} aria-label={L("חיפוש קולי", "Voice search")} aria-pressed={listening} title={L("דברו — נחפש בשבילכם", "Speak — we'll search")}>
          <Mic size={17} style={listening ? { color: "var(--lx-rose)" } : undefined} />
        </button>
      ) : null}
      {big && onImage ? (
        <>
          <button type="button" className="lx-icon-btn" style={{ width: 38, height: 38 }} onClick={() => fileRef.current?.click()} aria-label={L("חיפוש לפי תמונה", "Search by image")} title={L("תמונה או צילום מסך של מוצר", "A photo or screenshot of a product")}>
            <Camera size={17} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = ""; }} />
        </>
      ) : null}
      <button type="submit" className="lx-btn lx-btn-rose lx-btn-sm">{L("חיפוש", "Search")}</button>
    </form>
  );
}

/* --------------------------------------------------------------------- home */

export function HomePage({ graph, navigate }) {
  const { L, lang, Forward } = useL();
  const { favorites, following } = useMarketplace();
  const [q, setQ] = useState("");
  const heroProducts = graph.products.filter((p) => p.media.image).slice(0, 5);
  const creator = graph.creators[0];
  const picks = useMemo(() => lunaPicks(graph, { favorites, following, viewed: viewedIds() }), [graph, favorites, following]);
  const [cat, setCat] = useState("");
  const gridProducts = (cat ? graph.products.filter((p) => p.category === cat) : graph.products).slice(0, 12);
  const editorial = graph.products.filter((p) => p.media.image).slice(5, 10);
  const budget = graph.products.filter((p) => Number(p.price) > 0 && Number(p.price) < 100);

  useEffect(() => {
    trackSiteEvent("landing_view", { page: "/" });
  }, []);

  return (
    <>
      {/* HERO DISCOVERY */}
      <section className="relative overflow-hidden" aria-labelledby="lx-hero-title">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 60% at 85% 0%, rgba(255,159,90,.22), transparent 70%), radial-gradient(50% 60% at 0% 30%, rgba(210,47,93,.12), transparent 70%)" }} />
        <div className="lx-wrap relative grid items-center gap-10 pb-6 pt-8 md:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div className="lx-rise">
            <p className="lx-kicker"><Sparkles size={14} /> {L("Creator commerce בעברית", "Creator commerce, Hebrew first")}</p>
            <nav aria-label={L("מה עושים כאן", "What you can do here")} className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-semibold" style={{ color: "var(--lx-ink-2)" }}>
              {[["/discover", L("לגלות", "Discover")], ["/products", L("לקנות", "Shop")], ["/reels", L("לצפות", "Watch")], ["/creators", L("לעקוב", "Follow")], ["/studio", L("ליצור", "Create")], ["/studio", L("להרוויח", "Earn")]].map(([to, label], i) => (
                <Go key={label} to={to} className="hover:underline">{i ? "· " : ""}{label}</Go>
              ))}
            </nav>
            <h1 id="lx-hero-title" className="lx-display mt-3 text-[42px] leading-[1.02] sm:text-[54px] lg:text-[68px]">
              {L("גלו מה שווה לקנות", "Discover what's worth buying")}
              <span className="block" style={{ color: "var(--lx-rose)" }}>{L("דרך אנשים.", "through people.")}</span>
            </h1>
            <p className="lx-mute mt-4 max-w-xl text-[16px] leading-7 md:text-[18px]">
              {L(
                "מוצרים שיוצרים בחרו, אוספים, סרטונים וטרנדים — עם מחיר אמיתי, חנות ברורה וגילוי נאות.",
                "Creator-picked products, collections, reels and trends — with real prices, a clear store and honest disclosure."
              )}
            </p>
            <div className="mt-6 max-w-xl">
              <SearchBox value={q} onChange={setQ} big onSubmit={(v) => navigate(`/search${v.trim() ? `?q=${encodeURIComponent(v.trim())}` : ""}`)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {graph.categories.slice(0, 5).map((c) => (
                <Go key={c.id} to={`/discover/${encodeURIComponent(c.id)}`} className="lx-chip">{categoryName(c.id, lang)}</Go>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Go to="/discover" className="lx-btn lx-btn-primary">{L("התחילו לגלות", "Start discovering")} <Forward size={16} /></Go>
              <Go to="/creators" className="lx-btn lx-btn-ghost">{L("הכירו את היוצרים", "Meet the creators")}</Go>
            </div>
            <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              {[
                [graph.products.length, L("מוצרים מאושרים", "approved products")],
                [graph.creators.length, L(graph.creators.length === 1 ? "יוצרת" : "יוצרים", graph.creators.length === 1 ? "creator" : "creators")],
                [graph.categories.length, L("קטגוריות", "categories")],
                [graph.collections.length, L("אוספים", "collections")],
              ].map(([n, label]) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <dt className="lx-sr">{label}</dt>
                  <dd className="lx-display text-[26px]">{n}</dd>
                  <span className="lx-mute">{label}</span>
                </div>
              ))}
            </dl>
          </div>

          {heroProducts.length >= 3 ? (
            <div className="relative">
              <div className="lx-hero-mosaic">
                {heroProducts.map((p, i) => (
                  <Go key={p.id} to={productPath(p.id)} className={`lx-tile group ${i === 1 ? "lx-drift" : ""}`} aria-label={p.displayTitle}>
                    <Media src={p.media.image} alt={p.displayTitle} ratio="auto" style={{ height: "100%" }} eager={i < 2} width={480} />
                    <span className="absolute bottom-2 start-2 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-bold shadow" style={{ color: "var(--lx-ink)" }}>
                      {formatPrice(p.price, lang)}
                    </span>
                  </Go>
                ))}
              </div>
              {creator ? (
                <Go to={creatorPath(creator.slug)} className="absolute -bottom-5 end-4 flex items-center gap-2.5 rounded-full bg-white py-2.5 pe-4 ps-2.5 md:end-8" style={{ boxShadow: "var(--lx-shadow-lift)" }}>
                  <CreatorAvatar creator={creator} size={36} />
                  <span className="text-[13px] leading-tight">
                    <span className="block font-bold">{creator.name}</span>
                    <span className="lx-mute">{L(`${creator.productIds.length} בחירות`, `${creator.productIds.length} picks`)}</span>
                  </span>
                </Go>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* CATEGORY RAIL */}
      {graph.categories.length ? (
        <Section className="!mt-10">
          <CategoryRail graph={graph} />
        </Section>
      ) : null}

      {/* TRENDING NOW — evidence only; otherwise "just added" (by real createdAt) */}
      {graph.trends.length ? (
        <Section labelledBy="h-trends">
          <SectionHead id="h-trends" kicker={<><Flame size={14} /> {L("עכשיו חם", "Trending now")}</>} title={L("מה מעניין אנשים השבוע", "What people are into")} sub={L(`לפי צפיות וקליקים שנרשמו ב־${TREND_WINDOW_DAYS} הימים האחרונים`, `Based on views and clicks recorded in the last ${TREND_WINDOW_DAYS} days`)} to="/trends" />
          <Rail item="minmax(230px, 280px)">{graph.trends.map((t) => <TrendCard key={t.category} trend={t} graph={graph} />)}</Rail>
        </Section>
      ) : (
        <Section labelledBy="h-new">
          <SectionHead id="h-new" kicker={<><Sparkles size={14} /> {L("חדש בקטלוג", "Just added")}</>} title={L("נוספו לאחרונה", "Fresh finds")} sub={L("המוצרים האחרונים שיוצרים הוסיפו", "The latest products creators added")} to="/products" />
          <Rail item="minmax(176px, 220px)">{graph.products.slice(0, 10).map((p) => <ProductCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} />)}</Rail>
        </Section>
      )}

      {/* LUNA PROMOTES NOW — the marketing engine's own published site-feed posts */}
      <EnginePicks graph={graph} />

      {/* CREATORS TO DISCOVER */}
      {graph.creators.length ? (
        <Section labelledBy="h-creators">
          <SectionHead id="h-creators" kicker={<><Users size={14} /> {L("יוצרים שכדאי להכיר", "Creators to know")}</>} title={L("האנשים מאחורי הבחירות", "The people behind the picks")} to="/creators" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {graph.creators.slice(0, 2).map((c) => <CreatorCard key={c.id} creator={c} graph={graph} />)}
            <JoinCreatorsCard />
          </div>
        </Section>
      ) : null}

      {/* REELS */}
      <Section labelledBy="h-reels">
        <SectionHead id="h-reels" kicker={<><Clapperboard size={14} /> LikeLink Reels</>} title={L("לראות את המוצר בתנועה", "See products in motion")} to="/reels" linkLabel={L("לחוויה המלאה", "Open reels")} />
        {graph.reels.length ? (
          <Rail item="minmax(160px, 200px)">{graph.reels.map((r) => <ReelCard key={r.id} reel={r} graph={graph} />)}</Rail>
        ) : (
          <ReelsEmptyBand graph={graph} />
        )}
      </Section>

      {/* SHOPPING DISCOVERY — editorial bento */}
      {editorial.length >= 3 ? (
        <Section labelledBy="h-edit">
          <SectionHead id="h-edit" kicker={<><LayoutGrid size={14} /> {L("גילוי קניות", "Shopping discovery")}</>} title={L("העריכה של השבוע", "This week's edit")} sub={L("מבחר מהקטלוג — כל פריט מוביל לפרטים, ליוצר/ת ולחנות", "From the catalog — every item leads to details, the creator and the store")} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:grid-rows-2 md:gap-4">
            {editorial.map((p, i) => (
              <div key={p.id} className={i === 0 ? "col-span-2 row-span-2" : ""}>
                <ProductCard product={p} creator={graph.creatorById.get(p.marketerId)} ratio={i === 0 ? "1 / 1" : "4 / 5"} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* FEATURED COLLECTIONS */}
      {graph.collections.length ? (
        <Section labelledBy="h-cols">
          <SectionHead id="h-cols" kicker={L("אוספים", "Collections")} title={L("לוחות שכדאי לדפדף", "Boards worth browsing")} to="/collections" />
          <Rail item="minmax(260px, 320px)">{graph.collections.slice(0, 8).map((c) => <CollectionCard key={c.id} collection={c} />)}</Rail>
        </Section>
      ) : null}

      {/* DEALS — real price drops only; otherwise budget picks, labelled as such */}
      <Section labelledBy="h-deals">
        {graph.deals.length ? (
          <>
            <SectionHead id="h-deals" kicker={<><Tag size={14} /> {L("דילים", "Deals")}</>} title={L("ירידות מחיר אמיתיות", "Real price drops")} to="/deals" />
            <Rail item="minmax(176px, 220px)">{graph.deals.map((p) => <DealCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} />)}</Rail>
          </>
        ) : budget.length ? (
          <>
            <SectionHead id="h-deals" kicker={<><Tag size={14} /> {L("לפי תקציב", "By budget")}</>} title={L("שווים, עד ₪100", "Good finds under ₪100")} sub={L("לפי המחיר הרשום. הנחה מוצגת רק כשיש מחיר קודם אמיתי.", "By listed price. A discount is shown only with a real previous price.")} to="/deals" />
            <Rail item="minmax(176px, 220px)">{budget.slice(0, 10).map((p) => <ProductCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} ratio="1 / 1" />)}</Rail>
          </>
        ) : null}
      </Section>

      {/* PRODUCTS */}
      <Section labelledBy="h-products">
        <SectionHead id="h-products" kicker={<><Package size={14} /> {L("מוצרים", "Products")}</>} title={L("כל מה שבקטלוג", "Everything in the catalog")} to={cat ? `/products/${encodeURIComponent(cat)}` : "/products"} />
        <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: "none" }}>
          <div className="flex w-max gap-2">
            <button type="button" className="lx-chip" aria-pressed={!cat} onClick={() => setCat("")}>{L("הכל", "All")}</button>
            {graph.categories.map((c) => (
              <button key={c.id} type="button" className="lx-chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{categoryName(c.id, lang)}</button>
            ))}
          </div>
        </div>
        <Grid products={gridProducts} graph={graph} />
      </Section>

      {/* LUNA PICKS */}
      <Section labelledBy="h-luna">
        <SectionHead id="h-luna" kicker={<><Sparkles size={14} /> Luna</>} title={L("נבחר עבורך", "Picked for you")} />
        {picks.products.length ? (
          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <LunaInsight title={L("למה דווקא אלה?", "Why these?")} lines={[pickReason(picks.reason, L), L("רק לפי מה שעשית באתר הזה, במכשיר הזה.", "Only from what you did on this site, on this device.")]} />
            <Rail item="minmax(176px, 210px)">{picks.products.map((p) => <ProductCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} />)}</Rail>
          </div>
        ) : (
          <LunaInsight title={L("Luna עוד לא מכירה את הטעם שלך", "Luna doesn't know your taste yet")} lines={[L("שמרו מוצר (♡), צפו במוצרים או עקבו אחרי יוצר/ת — ו־Luna תבחר עבורכם מוצרים דומים.", "Save a product (♡), view products or follow a creator — Luna will pick similar ones."), L("ההתאמה מבוססת רק על הפעולות שלכם כאן. בלי ניחושים.", "Matching uses only your actions here. No guessing.")]}>
            <Go to="/discover" className="lx-btn lx-btn-ghost lx-btn-sm mt-4">{L("להתחיל לגלות", "Start discovering")}</Go>
          </LunaInsight>
        )}
      </Section>

      {/* CREATOR CTA */}
      <Section>
        <CreatorBand />
      </Section>
    </>
  );
}

function pickReason(reason, L) {
  if (!reason) return "";
  if (reason.kind === "saved") return L(`כי שמרת את „${reason.productTitle}”`, `Because you saved “${reason.productTitle}”`);
  if (reason.kind === "viewed") return L(`כי צפית ב„${reason.productTitle}”`, `Because you viewed “${reason.productTitle}”`);
  return L(`כי את/ה עוקב/ת אחרי ${reason.creatorName}`, `Because you follow ${reason.creatorName}`);
}

function JoinCreatorsCard() {
  const { L } = useL();
  return (
    <div className="flex h-full flex-col justify-between rounded-[20px] p-6 text-white" style={{ background: "linear-gradient(150deg,#17131f,#3b2160 60%,#d22f5d)" }}>
      <div>
        <p className="text-[12px] font-semibold opacity-80">{L("ליוצרים", "For creators")}</p>
        <p className="lx-display mt-2 text-[26px] leading-tight">{L("יש לך קהל וטעם טוב? פתחו כאן חנות.", "Got an audience and taste? Open a shop here.")}</p>
        <p className="mt-2 text-[14px] leading-6 opacity-85">{L("מוצרים, אוספים, סרטונים וקישורים עם ייחוס — מנוהלים מה־Studio.", "Products, collections, reels and attributed links — run from the Studio.")}</p>
      </div>
      <Go to="/studio" className="lx-btn mt-6 self-start bg-white" style={{ color: "#17131f" }}>{L("פתחו Studio", "Open the Studio")}</Go>
    </div>
  );
}

function CreatorBand() {
  const { L } = useL();
  const items = [
    [L("חנות אישית", "Your storefront"), L("עמוד יוצר/ת עם מוצרים, אוספים וסרטונים", "A creator page with products, collections and reels")],
    [L("תוכן ו־UGC", "Content & UGC"), L("כלי יצירה ב־Studio, עם סימון כן של תוכן ממוחשב", "Creation tools, with honest labels for computer-made content")],
    [L("מדידה אמיתית", "Real measurement"), L("צפיות וקליקים שנרשמו בפועל — בלי מספרים מומצאים", "Views and clicks that actually happened — no invented numbers")],
  ];
  return (
    <div className="overflow-hidden rounded-[28px] p-7 text-white md:p-12" style={{ background: "radial-gradient(90% 120% at 100% 0%, #3a2a7a 0%, transparent 60%), linear-gradient(140deg,#0b0d1a,#1b1733)" }}>
      <p className="lx-kicker" style={{ color: "#c9b5ff" }}><Sparkles size={14} /> LikeLink2 Studio</p>
      <h2 className="lx-display mt-3 max-w-2xl text-[32px] md:text-[48px]">{L("הגילוי שלך יכול להיות עסק.", "Your taste can be a business.")}</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map(([t, d]) => (
          <div key={t} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}>
            <p className="font-bold">{t}</p>
            <p className="mt-1 text-[14px] leading-6 opacity-80">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Go to="/studio" className="lx-btn bg-white" style={{ color: "#0b0d1a" }}>{L("פתחו את ה־Studio", "Open the Studio")}</Go>
        <Go to="/merchants" className="lx-btn" style={{ border: "1px solid rgba(255,255,255,.3)", color: "#fff" }}>{L("יש לך מוצרים? לסוחרים", "Have products? For merchants")}</Go>
      </div>
    </div>
  );
}

function ReelsEmptyBand({ graph }) {
  const { L } = useL();
  const stories = graph.products.filter((p) => p.media.image).slice(0, 4);
  return (
    <div className="grid items-center gap-6 overflow-hidden rounded-[24px] p-5 md:grid-cols-[1fr_1.2fr] md:p-8" style={{ background: "#17131f", color: "#fff" }}>
      <div>
        <p className="lx-display text-[26px] leading-tight md:text-[32px]">{L("עדיין אין כאן סרטונים שפורסמו.", "No reels have been published yet.")}</p>
        <p className="mt-3 text-[14px] leading-6 opacity-80">
          {L(
            "יוצרים מעלים סרטונים מה־Studio, עם תיוג מוצרים. כשסרטון יעלה — הוא יופיע כאן, מסומן בכנות: סרטון אמיתי או אנימציה ממוחשבת.",
            "Creators upload reels from the Studio, with product tags. When one is published it appears here, honestly labelled: real video or computer animation."
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Go to="/reels" className="lx-btn bg-white lx-btn-sm" style={{ color: "#17131f" }}>{L("לסיפורי המוצר בתמונות", "Browse product stories")}</Go>
          <Go to="/studio/video" className="lx-btn lx-btn-sm" style={{ border: "1px solid rgba(255,255,255,.3)", color: "#fff" }}>{L("יוצרים? העלו סרטון", "Creators: upload a reel")}</Go>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {stories.map((p) => (
          <Go key={p.id} to="/reels" className="relative block overflow-hidden rounded-xl" aria-label={p.displayTitle}>
            <Media src={p.media.image} alt="" ratio="9 / 16" width={240} />
          </Go>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- discover */

export function DiscoverPage({ graph, category }) {
  const { L, lang } = useL();
  const { favorites, following } = useMarketplace();
  const picks = useMemo(() => lunaPicks(graph, { favorites, following, viewed: viewedIds() }), [graph, favorites, following]);
  const inCat = category ? graph.products.filter((p) => p.category === category) : null;

  useEffect(() => {
    trackSiteEvent("landing_view", { page: category ? `/discover/${category}` : "/discover" });
  }, [category]);

  if (category) {
    const creators = graph.creators.filter((c) => c.categories.includes(category));
    const boards = graph.collections.filter((c) => c.category === category || c.productIds.some((id) => graph.byId.get(id)?.category === category && c.kind === "curated"));
    return (
      <>
        <PageHero kicker={<><Compass size={14} /> {L("גילוי", "Discover")}</>} title={categoryName(category, lang)} sub={inCat.length ? L(`${inCat.length} מוצרים מאושרים בקטגוריה`, `${inCat.length} approved products in this category`) : L("אין כרגע מוצרים מאושרים בקטגוריה הזו.", "No approved products in this category yet.")}>
          <CategoryChips graph={graph} active={category} />
        </PageHero>
        <section className="lx-wrap mt-8">
          {inCat.length ? <Masonry products={inCat} graph={graph} eagerFirst /> : <EmptyState icon={Package} title={L("עוד אין כאן מוצרים", "Nothing here yet")} body={L("נסו קטגוריה אחרת או חפשו.", "Try another category or search.")}><Go to="/discover" className="lx-btn lx-btn-primary lx-btn-sm">{L("לכל הגילוי", "All discovery")}</Go></EmptyState>}
        </section>
        {creators.length ? (
          <Section>
            <SectionHead title={L(`יוצרים ב${categoryName(category, lang)}`, `${categoryName(category, lang)} creators`)} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{creators.map((c) => <CreatorCard key={c.id} creator={c} graph={graph} />)}</div>
          </Section>
        ) : null}
        {boards.length ? (
          <Section>
            <SectionHead title={L("אוספים קשורים", "Related collections")} />
            <Rail item="minmax(260px, 320px)">{boards.map((c) => <CollectionCard key={c.id} collection={c} />)}</Rail>
          </Section>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHero kicker={<><Compass size={14} /> {L("גילוי", "Discover")}</>} title={L("מה תגלו היום?", "What will you find today?")} sub={L("פיד ויזואלי של כל מה שבקטלוג — לפי קטגוריה, תקציב, יוצר/ת ואוסף.", "A visual feed of the whole catalog — by category, budget, creator and collection.")}>
        <CategoryChips graph={graph} active={null} />
      </PageHero>

      {picks.products.length ? (
        <Section className="!mt-10">
          <SectionHead kicker={<><Sparkles size={14} /> Luna</>} title={L("בשבילך", "For you")} sub={pickReason(picks.reason, L)} />
          <Rail item="minmax(176px, 210px)">{picks.products.map((p) => <ProductCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} />)}</Rail>
        </Section>
      ) : null}

      {graph.trends.length ? (
        <Section>
          <SectionHead kicker={<><Flame size={14} /> {L("עכשיו חם", "Trending")}</>} title={L("טרנדים עם ראיות", "Trends with evidence")} to="/trends" />
          <Rail item="minmax(230px, 280px)">{graph.trends.map((t) => <TrendCard key={t.category} trend={t} graph={graph} />)}</Rail>
        </Section>
      ) : null}

      {graph.attention.length ? (
        <Section>
          <SectionHead kicker={<><TrendingUp size={14} /> {L("תשומת לב", "Attention")}</>} title={L("מוצרים שמקבלים תשומת לב", "Products getting attention")} sub={L(`לפי צפיות וקליקים שנרשמו ב־${TREND_WINDOW_DAYS} ימים`, `By views and clicks recorded in ${TREND_WINDOW_DAYS} days`)} />
          <Rail item="minmax(176px, 210px)">{graph.attention.slice(0, 10).map((p) => <ProductCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} />)}</Rail>
        </Section>
      ) : null}

      {graph.creators.length ? (
        <Section>
          <SectionHead kicker={<><Users size={14} /> {L("יוצרים", "Creators")}</>} title={L("יוצרים שכדאי להכיר", "Creators worth knowing")} to="/creators" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{graph.creators.slice(0, 3).map((c) => <CreatorCard key={c.id} creator={c} graph={graph} />)}</div>
        </Section>
      ) : null}

      <Section>
        <SectionHead kicker={<><Tag size={14} /> {L("לפי צורך", "By need")}</>} title={L("לפי תקציב", "By budget")} />
        <div className="flex flex-wrap gap-2">
          {PRICE_BANDS.map((b) => {
            const n = graph.products.filter((p) => b.test(Number(p.price))).length;
            return n ? <Go key={b.id} to={`/products?price=${b.id}`} className="lx-chip">{lang === "he" ? b.he : b.en} <span className="opacity-60">{n}</span></Go> : null;
          })}
        </div>
      </Section>

      {graph.categories.map((c) => (
        <Section key={c.id}>
          <SectionHead title={categoryName(c.id, lang)} sub={L(`${c.count} מוצרים`, `${c.count} products`)} to={`/discover/${encodeURIComponent(c.id)}`} />
          <Rail item="minmax(176px, 210px)">{c.productIds.slice(0, 10).map((id) => { const p = graph.byId.get(id); return <ProductCard key={id} product={p} creator={graph.creatorById.get(p.marketerId)} />; })}</Rail>
        </Section>
      ))}

      {graph.collections.length ? (
        <Section>
          <SectionHead kicker={L("אוספים", "Collections")} title={L("לדפדף לפי לוח", "Browse by board")} to="/collections" />
          <Rail item="minmax(260px, 320px)">{graph.collections.map((c) => <CollectionCard key={c.id} collection={c} />)}</Rail>
        </Section>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------- products */

export function ProductsPage({ graph, category }) {
  const { L, lang } = useL();
  const [price, setPrice] = useQueryParam("price");
  const [sort, setSort] = useQueryParam("sort");
  const band = PRICE_BANDS.find((b) => b.id === price);
  let list = graph.products.filter((p) => (!category || p.category === category) && (!band || band.test(Number(p.price))));
  if (sort === "price-asc") list = [...list].sort((a, b) => (Number(a.price) || Infinity) - (Number(b.price) || Infinity));
  if (sort === "price-desc") list = [...list].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));

  return (
    <>
      <PageHero kicker={<><Package size={14} /> {L("מוצרים", "Products")}</>} title={category ? categoryName(category, lang) : L("כל המוצרים", "All products")} sub={L(`${list.length} מוצרים`, `${list.length} products`)}>
        <CategoryChips graph={graph} active={category} base="/products" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="lx-chip" aria-pressed={!price} onClick={() => setPrice("")}>{L("כל המחירים", "Any price")}</button>
          {PRICE_BANDS.map((b) => (
            <button key={b.id} type="button" className="lx-chip" aria-pressed={price === b.id} onClick={() => setPrice(price === b.id ? "" : b.id)}>{lang === "he" ? b.he : b.en}</button>
          ))}
          <label className="lx-chip ms-auto cursor-pointer">
            <span className="lx-sr">{L("מיון", "Sort")}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="cursor-pointer bg-transparent text-[13px] outline-none" aria-label={L("מיון", "Sort")}>
              <option value="">{L("החדשים ביותר", "Newest")}</option>
              <option value="price-asc">{L("מחיר: מהנמוך", "Price: low to high")}</option>
              <option value="price-desc">{L("מחיר: מהגבוה", "Price: high to low")}</option>
            </select>
          </label>
        </div>
      </PageHero>
      <section className="lx-wrap mt-8">
        {list.length ? <Grid products={list} graph={graph} /> : <EmptyState icon={Search} title={L("אין מוצרים שמתאימים לסינון", "No products match these filters")}><button type="button" className="lx-btn lx-btn-primary lx-btn-sm" onClick={() => setPrice("")}>{L("ניקוי סינון", "Clear filters")}</button></EmptyState>}
      </section>
    </>
  );
}

/* ----------------------------------------------------------------- creators */

export function CreatorsPage({ graph, category, navigate }) {
  const { L, lang } = useL();
  const list = category ? graph.creators.filter((c) => c.categories.includes(category)) : graph.creators;
  useEffect(() => {
    trackSiteEvent("creator_landing_view", { page: category ? `/creators/${category}` : "/creators" });
  }, [category]);
  const openStudio = () => {
    trackAcquisition("creator_cta_click", "פתחת Studio מעמוד היוצרים", { page: "/creators" });
    trackSiteEvent("studio_opened", { page: "/creators" });
    navigate("/studio");
  };
  return (
    <>
      <PageHero kicker={<><Users size={14} /> {L("יוצרים", "Creators")}</>} title={L("יוצרים שכדאי להכיר", "Creators worth knowing")} sub={L("כל יוצר/ת כאן מחזיק/ה חנות אמיתית עם מוצרים מאושרים.", "Every creator here runs a real shop with approved products.")}>
        <CategoryChips graph={graph} active={category} base="/creators" />
      </PageHero>
      <section className="lx-wrap mt-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => <CreatorCard key={c.id} creator={c} graph={graph} />)}
          <div className="flex h-full flex-col justify-between rounded-[20px] p-6 text-white" style={{ background: "linear-gradient(150deg,#17131f,#3b2160 60%,#d22f5d)" }}>
            <div>
              <p className="lx-display text-[26px] leading-tight">{L("יש לך קהל? הפכו אותו לחנות.", "Have an audience? Turn it into a shop.")}</p>
              <p className="mt-2 text-[14px] leading-6 opacity-85">{L("גלו, צרו, פרסמו ומדדו לפי כללי התוכנית האמיתיים. כל מוצר וקליק מקבלים ייחוס ברור.", "Discover, create, publish and measure under the real program rules. Every product and click keeps attribution.")}</p>
            </div>
            <button type="button" onClick={openStudio} data-testid="creator-cta" className="lx-btn mt-6 self-start bg-white" style={{ color: "#17131f" }}>{L("פתחו Studio", "Open the Studio")}</button>
          </div>
        </div>
        {!list.length ? <p className="lx-mute mt-6 text-sm">{L("אין עדיין יוצרים בקטגוריה הזו.", "No creators in this category yet.")}</p> : null}
      </section>
    </>
  );
}

export function CreatorPage({ graph, slug, navigate }) {
  const { L, lang } = useL();
  const creator = findCreator(graph, slug);
  const [cat, setCat] = useState("");

  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) trackReferralClick(ref);
    } catch {
      /* ignore */
    }
  }, []);

  if (!creator) return <NotFound navigate={navigate} what="creator" />;
  const products = creator.productIds.map((id) => graph.byId.get(id));
  const shop = cat ? products.filter((p) => p.category === cat) : products;
  const reels = graph.reels.filter((r) => r.creatorId === creator.id);
  const boards = graph.collections.filter((c) => c.creatorIds.includes(creator.id) && c.kind !== "creator");
  const standouts = [...products].sort((a, b) => b.attention.clicks * 2 + b.attention.views - (a.attention.clicks * 2 + a.attention.views)).slice(0, 4);
  const hasAttention = standouts.some((p) => p.attention.clicks + p.attention.views > 0);
  const hero = products.find((p) => p.media.image);
  const topCategories = [...creator.categories].sort((a, b) => products.filter((p) => p.category === b).length - products.filter((p) => p.category === a).length);

  return (
    <>
      {/* PROFILE */}
      <section className="relative">
        <div className="grid h-[180px] grid-cols-4 gap-0.5 overflow-hidden md:h-[260px]" aria-hidden="true">
          {creator.covers.concat(creator.covers).slice(0, 4).map((src, i) => (
            <div key={i} className="relative" style={{ background: "var(--lx-sunk)" }}>
              <Img src={sized(src, 500)} loading={i < 2 ? "eager" : "lazy"} />
            </div>
          ))}
        </div>
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, var(--lx-paper) 0%, rgba(250,247,242,.2) 60%, transparent)" }} aria-hidden="true" />
        <div className="lx-wrap relative -mt-14 md:-mt-20">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <CreatorAvatar creator={creator} size={104} ring />
              <div className="min-w-0 pb-1">
                <h1 className="lx-display flex items-center gap-2 text-[34px] md:text-[44px]">
                  <span className="truncate">{creator.name}</span>
                  {creator.verified ? <TrustBadge kind="verified" /> : null}
                </h1>
                <p className="lx-mute text-[14px]">
                  {L(`${products.length} מוצרים · ${creator.categories.length} קטגוריות`, `${products.length} products · ${creator.categories.length} categories`)}
                  {boards.length ? L(` · ${boards.length} אוספים`, ` · ${boards.length} collections`) : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <FollowButton creatorId={creator.id} />
              <ShareButton variant="button" path={creatorPath(creator.slug)} title={`${creator.name} | LikeLink2`} marketerId={creator.id} />
              <a href="#shop" className="lx-btn lx-btn-rose">{L("לחנות", "Shop")}</a>
            </div>
          </div>
        </div>
      </section>

      {/* HERO CONTENT + ABOUT */}
      <Section className="!mt-10">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          {hero ? (
            <Go to={productPath(hero.id)} className="lx-card block">
              <Media src={hero.media.image} alt={hero.displayTitle} ratio="16 / 10" width={900} eager>
                <div className="lx-reel-shade" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <span className="lx-badge lx-badge-glass">{L("הבחירה האחרונה", "Latest pick")}</span>
                  <p className="lx-display mt-2 text-[26px] leading-tight">{hero.displayTitle}</p>
                  <p className="mt-1 font-bold">{formatPrice(hero.price, lang)}</p>
                </div>
              </Media>
            </Go>
          ) : null}
          <div className="flex flex-col gap-4">
            <div className="lx-card p-5">
              <p className="lx-kicker">{L("אודות", "About")}</p>
              <p className="mt-2 text-[15px] leading-7">{creator.bio || L(`${creator.name} בוחר/ת מוצרים בלייקלינק.`, `${creator.name} picks products on LikeLink.`)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {creator.categories.map((c) => <Go key={c} to={`/discover/${encodeURIComponent(c)}`} className="lx-badge lx-badge-line">{categoryName(c, lang)}</Go>)}
              </div>
              <div className="mt-3"><TrustBadge kind="attributed" /></div>
            </div>
            <LunaInsight
              title={hasAttention ? L(`הבולטים אצל ${creator.name}`, `${creator.name}'s standouts`) : L(`מה כדאי לראות אצל ${creator.name}`, `Where to start with ${creator.name}`)}
              lines={
                hasAttention
                  ? standouts.filter((p) => p.attention.clicks + p.attention.views > 0).map((p) => L(`${p.displayTitle} — ${p.attention.views} צפיות, ${p.attention.clicks} קליקים ב־${TREND_WINDOW_DAYS} ימים`, `${p.displayTitle} — ${p.attention.views} views, ${p.attention.clicks} clicks in ${TREND_WINDOW_DAYS} days`))
                  : [L("עוד לא נרשמו מספיק צפיות כדי לדרג — הנה הבחירות האחרונות.", "Not enough recorded views to rank yet — here are the latest picks."), ...topCategories.slice(0, 2).map((c) => L(`${products.filter((p) => p.category === c).length} בחירות ב${categoryName(c, "he")}`, `${products.filter((p) => p.category === c).length} picks in ${categoryName(c, "en")}`))].slice(0, 3)
              }
            />
          </div>
        </div>
      </Section>

      {/* FEATURED COLLECTIONS */}
      {boards.length ? (
        <Section>
          <SectionHead title={L("אוספים", "Collections")} />
          <Rail item="minmax(260px, 320px)">{boards.map((c) => <CollectionCard key={c.id} collection={c} />)}</Rail>
        </Section>
      ) : null}

      {/* REELS */}
      {reels.length ? (
        <Section>
          <SectionHead kicker="Reels" title={L("סרטונים", "Reels")} to="/reels" />
          <Rail item="minmax(160px, 200px)">{reels.map((r) => <ReelCard key={r.id} reel={r} graph={graph} />)}</Rail>
        </Section>
      ) : null}

      {/* RECOMMENDED */}
      <Section>
        <SectionHead title={L("מומלצים", "Recommended")} sub={hasAttention ? L("לפי תשומת לב שנרשמה", "By recorded attention") : L("הבחירות האחרונות", "Latest picks")} />
        <Rail item="minmax(176px, 210px)">{standouts.map((p) => <ProductCard key={p.id} product={p} creator={creator} showCreator={false} />)}</Rail>
      </Section>

      {/* SHOP */}
      <Section id="shop">
        <SectionHead title={L(`החנות של ${creator.name}`, `${creator.name}'s shop`)} sub={L(`${shop.length} מוצרים`, `${shop.length} products`)} />
        <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: "none" }}>
          <div className="flex w-max gap-2">
            <button type="button" className="lx-chip" aria-pressed={!cat} onClick={() => setCat("")}>{L("הכל", "All")}</button>
            {creator.categories.map((c) => <button key={c} type="button" className="lx-chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{categoryName(c, lang)}</button>)}
          </div>
        </div>
        <Masonry products={shop} graph={graph} />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ product */

export function ProductPage({ graph, id, navigate }) {
  const { L, lang } = useL();
  const { recordProductView, marketers } = useMarketplace();
  const product = graph.byId.get(id);
  const creator = product ? graph.creatorById.get(product.marketerId) : null;

  useEffect(() => {
    if (product && recordProductView) recordProductView(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product || !creator) return <NotFound navigate={navigate} what="product" />;
  const owner = (marketers || []).find((m) => m.id === product.marketerId);
  const insights = productInsights(graph, product).map((i) => (lang === "he" ? i.he : i.en));
  const related = relatedProducts(graph, product, 10);
  const offers = offersOf(product, graph);
  const more = graph.products.filter((p) => p.marketerId === creator.id && p.id !== product.id).slice(0, 10);
  const boards = collectionsFor(graph, product.id);
  const reels = graph.reels.filter((r) => r.productIds.includes(product.id));
  const tags = (Array.isArray(product.tags) ? product.tags : []).filter((t) => typeof t === "string").slice(0, 6);

  return (
    <>
      <div className="lx-wrap pt-5 md:pt-8">
        <nav aria-label={L("פירורי לחם", "Breadcrumb")} className="lx-mute flex flex-wrap items-center gap-1.5 text-[13px]">
          <Go to="/" className="hover:underline">{L("בית", "Home")}</Go> <span aria-hidden="true">/</span>
          <Go to={`/discover/${encodeURIComponent(product.category || "Other")}`} className="hover:underline">{categoryName(product.category, lang)}</Go>
        </nav>
        <div className="mt-4 grid gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-[1.15fr_1fr]">
          {/* MEDIA */}
          <div className="md:sticky md:top-24 md:self-start">
            <div className="lx-card" style={product.media.video ? { maxWidth: "min(100%, calc(80vh * 9 / 16))", marginInline: "auto" } : undefined}>
              <Media src={product.media.image} video={product.media.video} poster={product.media.poster} alt={product.displayTitle} ratio={product.media.video ? "9 / 16" : "4 / 5"} width={1000} eager label={product.displayTitle} controls={Boolean(product.media.video)}>
                {product.media.video ? null : (
                  <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
                    <MediaBadge state={product.media.state} showImage />
                    {product.deal ? <span className="lx-badge lx-badge-rose">−{product.deal.discountPct}%</span> : null}
                  </div>
                )}
              </Media>
              <SaveButton productId={product.id} className="absolute end-3 top-3" />
            </div>
            {product.media.video ? (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                <MediaBadge state={product.media.state} showImage />
                <StyleBadge style={product.media.style} />
              </div>
            ) : null}
          </div>

          {/* DETAILS */}
          <div>
            <p className="lx-kicker">{categoryName(product.category, lang)}{product.merchant ? ` · ${product.merchant}` : ""}</p>
            <h1 className="lx-display mt-2 text-[30px] leading-tight md:text-[40px]">{product.displayTitle}</h1>
            {product.marketingTitle && product.marketingTitle !== product.displayTitle ? <p className="lx-mute mt-2 text-[16px]">{product.marketingTitle}</p> : null}

            <Go to={creatorPath(creator.slug)} className="lx-card mt-5 flex items-center gap-3 p-3" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
              <CreatorAvatar creator={creator} size={44} />
              <span className="min-w-0 flex-1">
                <span className="lx-mute block text-[12px]">{L("נבחר על ידי", "Picked by")}</span>
                <span className="block truncate font-bold">{creator.name}</span>
              </span>
              <span className="lx-btn lx-btn-ghost lx-btn-sm">{L("לחנות", "View shop")}</span>
            </Go>

            <div className="mt-5 flex items-center justify-between gap-3">
              <PriceLine product={product} large />
              {product.merchant ? <span className="lx-mute text-[13px]">{L(`נמכר ב־${product.merchant}`, `Sold at ${product.merchant}`)}</span> : null}
            </div>
            <p className="lx-mute mt-1 text-[12px]">{L("מחיר קטלוג. המחיר והמלאי הסופיים נקבעים אצל החנות.", "Catalog price. Final price and stock are set by the store.")}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <ShopButton product={product} className="flex-1" />
              <SaveButton productId={product.id} className="!h-11 !w-11" />
              <ShareButton path={productPath(product.id)} title={`${product.displayTitle} | LikeLink2`} productId={product.id} marketerId={creator.id} className="!h-11 !w-11" />
            </div>
            <div className="mt-3"><Disclosure product={product} /></div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <TrustBadge kind="approved" />
              <TrustBadge kind="attributed" />
              {owner?.verified === true ? <TrustBadge kind="verified" /> : null}
            </div>

            {insights.length ? (
              <div className="mt-6">
                <LunaInsight title={L("למה המוצר הזה מוצג לך", "Why you're seeing this")} lines={insights} compact />
              </div>
            ) : null}

            {product.description ? (
              <div className="mt-6">
                <h2 className="text-[15px] font-bold">{L("על המוצר", "About this product")}</h2>
                <p className="mt-2 whitespace-pre-line text-[15px] leading-7" style={{ color: "var(--lx-ink-2)" }}>{product.description}</p>
              </div>
            ) : null}
            {tags.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map((t) => <Go key={t} to={`/search?q=${encodeURIComponent(t)}`} className="lx-chip !min-h-[32px] !text-[12px]">#{t}</Go>)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {reels.length ? (
        <Section>
          <SectionHead title={L("בסרטונים", "In reels")} />
          <Rail item="minmax(160px, 200px)">{reels.map((r) => <ReelCard key={r.id} reel={r} graph={graph} />)}</Rail>
        </Section>
      ) : null}
      {more.length ? (
        <Section>
          <SectionHead title={L(`עוד מ־${creator.name}`, `More from ${creator.name}`)} to={creatorPath(creator.slug)} />
          <Rail item="minmax(176px, 210px)">{more.map((p) => <ProductCard key={p.id} product={p} creator={creator} showCreator={false} />)}</Rail>
        </Section>
      ) : null}
      {offers.length ? (
        <Section>
          <SectionHead title={L(`עוד ${offers.length} המלצות לאותו מוצר`, `${offers.length} more offers for this product`)} sub={L("אותו פריט בחנות, מיוצרים אחרים — מסודר לפי ראיות אמיתיות. אתם בוחרים.", "The same store item from other creators — ordered by real evidence. You choose.")} />
          <Rail item="minmax(176px, 210px)">{offers.map(({ product: o, evidence }) => <ProductCard key={o.id} product={o} creator={graph.creatorById.get(o.marketerId)} why={evidence} />)}</Rail>
        </Section>
      ) : null}
      {related.length ? (
        <Section>
          <SectionHead title={L("אולי יעניין אותך גם", "You might also like")} />
          <Rail item="minmax(176px, 210px)">{related.map((p) => <ProductCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} />)}</Rail>
        </Section>
      ) : null}
      {boards.length ? (
        <Section>
          <SectionHead title={L("מופיע באוספים", "Featured in collections")} />
          <Rail item="minmax(260px, 320px)">{boards.map((c) => <CollectionCard key={c.id} collection={c} />)}</Rail>
        </Section>
      ) : null}

      {/* Mobile sticky commerce bar (above the tab bar) */}
      <div className="fixed inset-x-0 z-40 border-t px-4 py-2.5 md:hidden" style={{ bottom: "calc(58px + env(safe-area-inset-bottom))", background: "rgba(255,255,255,.96)", borderColor: "var(--lx-line)" }}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{product.displayTitle}</p>
            <PriceLine product={product} />
          </div>
          <ShopButton product={product} className="lx-btn-sm">{L("לחנות", "Shop")}</ShopButton>
        </div>
      </div>
      <div className="h-16 md:hidden" aria-hidden="true" />
    </>
  );
}

/* -------------------------------------------------------------------- reels */

export function ReelsPage({ graph }) {
  const { L, lang } = useL();
  const { recordProductView } = useMarketplace();
  const [target] = useQueryParam("r");
  const hasReels = graph.reels.length > 0;
  // Without published reels, the same immersive pager shows product stories
  // built from real product photos — clearly labelled as photos, never as video.
  const items = hasReels
    ? graph.reels.map((r) => ({ key: r.id, kind: "reel", reel: r, product: r.productIds.length ? graph.byId.get(r.productIds[0]) : null, creator: graph.creatorById.get(r.creatorId) }))
    : graph.products.filter((p) => p.media.image).map((p) => ({ key: p.id, kind: "story", product: p, creator: graph.creatorById.get(p.marketerId) }));
  const scroller = useRef(null);

  useEffect(() => {
    if (!target) return;
    const el = scroller.current?.querySelector(`[data-key="${CSS.escape(target)}"]`);
    el?.scrollIntoView({ block: "start" });
  }, [target]);

  if (!items.length) {
    return (
      <div className="lx-wrap py-16">
        <EmptyState icon={Clapperboard} title={L("אין עדיין תוכן להצגה", "Nothing to show yet")} body={L("כשיוצרים יפרסמו סרטונים או מוצרים — הם יופיעו כאן.", "When creators publish reels or products, they appear here.")} />
      </div>
    );
  }

  return (
    <div className="relative">
      <h1 className="lx-sr">{hasReels ? "LikeLink Reels" : L("סיפורי מוצר", "Product stories")}</h1>
      <div className="absolute inset-x-0 top-0 z-10 flex justify-center px-4 pt-3" style={{ pointerEvents: "none" }}>
        {hasReels ? null : (
          <span className="lx-badge lx-badge-glass" style={{ pointerEvents: "auto" }}>
            {L("סיפורי מוצר בתמונות · עדיין אין סרטונים שפורסמו", "Product stories in photos · no reels published yet")}
          </span>
        )}
      </div>
      <div ref={scroller} className="lx-reels" aria-label={L("סרטונים", "Reels")}>
        {items.map(({ key, kind, reel, product, creator }) => (
          <article key={key} data-key={key} className="lx-reel">
            <div className="lx-reel-frame">
              <Media
                src={kind === "story" ? product?.media.image : reel.poster}
                video={kind === "reel" ? reel.url : ""}
                poster={kind === "reel" ? reel.poster : ""}
                alt={product?.displayTitle || reel?.title || ""}
                ratio="auto"
                width={900}
                style={{ position: "absolute", inset: 0, height: "100%" }}
                controls={kind === "reel"}
                controlsAt="side"
                onFirstPlay={() => { if (product && recordProductView) recordProductView(product); }}
              />
              <div className="lx-reel-shade" />
              {kind === "story" ? (
                <div className="absolute start-3 top-12">
                  <MediaBadge state={product?.media.state} showImage />
                </div>
              ) : null}
              {/* Side actions */}
              <div className="absolute bottom-40 end-3 flex flex-col items-center gap-3">
                {product ? <SaveButton productId={product.id} /> : null}
                {product ? <ShareButton path={productPath(product.id)} title={product.displayTitle} productId={product.id} marketerId={creator?.id} /> : null}
                {creator ? (
                  <Go to={creatorPath(creator.slug)} aria-label={creator.name}><CreatorAvatar creator={creator} size={40} ring /></Go>
                ) : null}
              </div>
              {/* Caption + product tag */}
              <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                {kind === "reel" ? (
                  <div className="mb-2 flex flex-wrap gap-1">
                    <MediaBadge state={reel.state} showImage />
                    <StyleBadge style={reel.style} />
                  </div>
                ) : null}
                {creator ? (
                  <Go to={creatorPath(creator.slug)} className="text-[15px] font-bold">{creator.name}</Go>
                ) : null}
                {/* A LikeLink render already carries its title on-frame. */}
                {reel?.title && !reel.style ? <p className="mt-1 text-[14px] opacity-90">{reel.title}</p> : null}
                {product ? (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl p-2.5" style={{ background: "rgba(255,255,255,.95)", color: "var(--lx-ink)" }}>
                    <Go to={productPath(product.id)} className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ background: "var(--lx-sunk)" }}>
                        <Img src={sized(product.media.image, 120)} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold">{product.displayTitle}</span>
                        <span className="text-[13px] font-bold">{formatPrice(product.price, lang)}</span>
                      </span>
                    </Go>
                    <ShopButton product={product} className="lx-btn-sm" attribution={kind === "reel" ? { src: "likelink_reels", camp: reel.id } : null}>{L("לחנות", "Shop")}</ShopButton>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- trends */

export function TrendsPage({ graph }) {
  const { L, lang } = useL();
  return (
    <>
      <PageHero kicker={<><Flame size={14} /> {L("טרנדים", "Trends")}</>} title={L("מה מעניין עכשיו", "What's catching on")} sub={L(`Luna מזהה טרנד רק כשיש ראיות: לפחות ${TREND_MIN_EVENTS} צפיות או קליקים שנרשמו בקטגוריה ב־${TREND_WINDOW_DAYS} הימים האחרונים.`, `Luna calls a trend only with evidence: at least ${TREND_MIN_EVENTS} recorded views or clicks in a category in the last ${TREND_WINDOW_DAYS} days.`)} />
      <section className="lx-wrap mt-8">
        {graph.trends.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{graph.trends.map((t) => <TrendCard key={t.category} trend={t} graph={graph} />)}</div>
        ) : (
          <EmptyState icon={TrendingUp} title={L("עוד אין מספיק נתונים כדי לקרוא לזה טרנד", "Not enough data to call a trend yet")} body={L("במקום להמציא „טרנדים”, נחכה לצפיות וקליקים אמיתיים. בינתיים — אפשר לגלות לפי קטגוריה.", "Rather than invent “trends”, we wait for real views and clicks. Meanwhile, explore by category.")}>
            <Go to="/discover" className="lx-btn lx-btn-primary lx-btn-sm">{L("לגילוי", "Discover")}</Go>
          </EmptyState>
        )}
      </section>
      {graph.attention.length ? (
        <Section>
          <SectionHead title={L("מוצרים שמקבלים תשומת לב", "Products getting attention")} />
          <Rail item="minmax(176px, 210px)">{graph.attention.slice(0, 12).map((p) => <ProductCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} />)}</Rail>
        </Section>
      ) : null}
      <Section>
        <SectionHead title={L("לגלות לפי קטגוריה", "Explore by category")} sub={L("קטגוריות מהקטלוג — לא טרנדים", "Catalog categories — not trends")} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {graph.categories.map((c) => (
            <Go key={c.id} to={`/discover/${encodeURIComponent(c.id)}`} className="lx-card block">
              <Media src={c.cover} alt={categoryName(c.id, lang)} ratio="1 / 1" width={360}>
                <div className="lx-reel-shade" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <p className="lx-display text-[20px]">{categoryName(c.id, lang)}</p>
                  <p className="text-[12px] opacity-85">{L(`${c.count} מוצרים`, `${c.count} products`)}</p>
                </div>
              </Media>
            </Go>
          ))}
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------- collections */

export function CollectionsPage({ graph, id, navigate }) {
  const { L, lang } = useL();
  if (id) {
    const col = findCollection(graph, id);
    if (!col) return <NotFound navigate={navigate} what="collection" />;
    const products = col.productIds.map((pid) => graph.byId.get(pid)).filter(Boolean);
    const creators = col.creatorIds.map((cid) => graph.creatorById.get(cid)).filter(Boolean);
    const others = graph.collections.filter((c) => c.id !== col.id).slice(0, 8);
    return (
      <>
        <PageHero kicker={col.kind === "curated" ? L("אוסף של יוצר/ת", "Creator collection") : L("לוח עריכה", "Editorial board")} title={col.title[lang]} sub={col.description[lang]}>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {creators.map((c) => (
              <Go key={c.id} to={creatorPath(c.slug)} className="lx-chip"><CreatorAvatar creator={c} size={22} /> {c.name}</Go>
            ))}
            <ShareButton variant="button" path={`/collections/${encodeURIComponent(col.id)}`} title={`${col.title[lang]} | LikeLink2`} className="lx-btn-sm" />
          </div>
        </PageHero>
        <section className="lx-wrap mt-8"><Masonry products={products} graph={graph} eagerFirst /></section>
        {others.length ? (
          <Section>
            <SectionHead title={L("עוד אוספים", "More collections")} to="/collections" />
            <Rail item="minmax(260px, 320px)">{others.map((c) => <CollectionCard key={c.id} collection={c} />)}</Rail>
          </Section>
        ) : null}
      </>
    );
  }
  return (
    <>
      <PageHero kicker={L("אוספים", "Collections")} title={L("לוחות לדפדוף", "Boards to browse")} sub={L("לוחות עריכה מהקטלוג ואוספים שיוצרים שמרו — כל לוח מסביר מה נכנס אליו.", "Editorial boards from the catalog and creator-saved collections — each one states what goes in it.")} />
      <section className="lx-wrap mt-8">
        {graph.collections.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{graph.collections.map((c) => <CollectionCard key={c.id} collection={c} />)}</div>
        ) : (
          <EmptyState icon={LayoutGrid} title={L("עוד אין אוספים", "No collections yet")} body={L("אוספים נבנים מהמוצרים בקטלוג.", "Collections are built from catalog products.")} />
        )}
      </section>
    </>
  );
}

/* -------------------------------------------------------------------- deals */

export function DealsPage({ graph }) {
  const { L, lang } = useL();
  return (
    <>
      <PageHero kicker={<><Tag size={14} /> {L("דילים", "Deals")}</>} title={L("דילים אמיתיים בלבד", "Real deals only")} sub={L("הנחה מוצגת רק כשיש מחיר קודם אמיתי, והאחוז מחושב משני המחירים. בלי טיימרים מזויפים ובלי „נשארו 2”.", "A discount shows only with a real previous price, computed from both prices. No fake timers, no “only 2 left”.")} />
      <section className="lx-wrap mt-8">
        {graph.deals.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">{graph.deals.map((p) => <DealCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} />)}</div>
        ) : (
          <EmptyState icon={Tag} title={L("אין כרגע ירידות מחיר מאומתות", "No verified price drops right now")} body={L("ברגע שמחיר של מוצר בקטלוג יירד ממחיר קודם רשום — הוא יופיע כאן. בינתיים, לפי תקציב:", "When a catalog price drops from a recorded previous price, it shows here. Meanwhile, by budget:")} />
        )}
      </section>
      {PRICE_BANDS.slice(0, 3).map((b) => {
        const list = graph.products.filter((p) => b.test(Number(p.price)));
        if (!list.length) return null;
        return (
          <Section key={b.id}>
            <SectionHead title={lang === "he" ? b.he : b.en} sub={L(`${list.length} מוצרים לפי המחיר הרשום`, `${list.length} products by listed price`)} to={`/products?price=${b.id}`} />
            <Rail item="minmax(176px, 210px)">{list.slice(0, 12).map((p) => <ProductCard key={p.id} product={p} creator={graph.creatorById.get(p.marketerId)} ratio="1 / 1" />)}</Rail>
          </Section>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------- search */

export function SearchPage({ graph }) {
  const { L, lang } = useL();
  const [q, setQParam] = useQueryParam("q");
  const [draft, setDraft] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== q) setQParam(draft.trim());
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const res = useMemo(() => searchGraph(graph, q), [graph, q]);
  const [visual, setVisual] = useState({ state: "idle", matches: [], preview: "" });
  async function searchByImage(file) {
    setVisual({ state: "working", matches: [], preview: URL.createObjectURL(file) });
    try {
      const { fileSignature, visualMatches } = await import("../../lib/visualSearch.js");
      const sig = await fileSignature(file);
      // Image + words/price: compare only within what the words and price already allow.
      const pool = q.trim() && res.products.length ? res.products : graph.products.filter((p) => {
        const v = Number(p.price); const it = res.intent || {};
        return (it.maxPrice == null || (v > 0 && v <= it.maxPrice)) && (it.minPrice == null || v >= it.minPrice);
      });
      const matches = await visualMatches(sig, pool, { limit: 12 });
      setVisual((v) => ({ ...v, state: "done", matches }));
    } catch {
      setVisual((v) => ({ ...v, state: "failed", matches: [] }));
    }
  }
  const suggestions = useMemo(() => {
    const counts = new Map();
    for (const p of graph.products) for (const t of Array.isArray(p.tags) ? p.tags : []) if (typeof t === "string") counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
  }, [graph]);

  return (
    <>
      <div className="lx-wrap pt-8 md:pt-12">
        <h1 className="lx-display text-[34px] md:text-[48px]">{L("מה מחפשים?", "What are you looking for?")}</h1>
        <p className="lx-mute mt-2 text-[15px]">{L("מוצרים, יוצרים, אוספים וקטגוריות — במקום אחד.", "Products, creators, collections and categories — in one place.")}</p>
        <div className="mt-5 max-w-3xl">
          <SearchBox value={draft} onChange={setDraft} onSubmit={(v) => setQParam(v.trim())} autoFocus big onImage={searchByImage} />
          <p className="lx-mute mt-2 text-[12.5px]">{L("כתבו, דברו 🎙️, צלמו או הדביקו קישור — אפשר גם „סט יוגה עד 150 שקל”.", "Type, speak, snap or paste a link — e.g. “yoga set under 150”.")}</p>
        </div>
      </div>
      {visual.state !== "idle" ? (
        <div className="lx-wrap mt-6">
          <div className="flex items-center gap-3">
            {visual.preview ? <img src={visual.preview} alt={L("התמונה שלכם", "Your photo")} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 12 }} /> : null}
            <div>
              <p className="text-sm font-bold">{L("חיפוש לפי תמונה", "Search by image")}</p>
              <p className="lx-mute text-[12px]">{L("התמונה נבדקת אצלכם במכשיר ומושווית לתמונות המוצרים בקטלוג. זו התאמה חזותית — לא זיהוי מוצר.", "Your photo is compared on your device with the catalog's product photos. A visual match — not product recognition.")}</p>
            </div>
            <button type="button" className="lx-chip ms-auto" onClick={() => setVisual({ state: "idle", matches: [], preview: "" })}>{L("ניקוי", "Clear")}</button>
          </div>
          {visual.state === "working" ? <p className="lx-mute mt-3 text-sm" role="status">{L("משווים לתמונות בקטלוג…", "Comparing with catalog photos…")}</p> : null}
          {visual.state === "failed" ? <p className="mt-3 text-sm" role="status">{L("לא הצלחנו לקרוא את התמונה. נסו תמונה אחרת.", "We couldn't read that image. Try another one.")}</p> : null}
          {visual.state === "done" && !visual.matches.length ? <p className="mt-3 text-sm" role="status">{L("לא מצאנו מוצר שנראה דומה בקטלוג. נסו לכתוב מה מחפשים.", "Nothing in the catalog looks similar. Try describing it.")}</p> : null}
          {visual.matches.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
              {visual.matches.map((m) => (
                <div key={m.product.id}>
                  <span className="lx-badge mb-1.5 inline-block text-[11px]">{lang === "he" ? MATCH_LABEL_HE[m.label] : MATCH_LABEL_EN[m.label]} · {Math.round(m.similarity * 100)}%</span>
                  <ProductCard product={m.product} creator={graph.creatorById.get(m.product.marketerId)} why={evidenceOf(m.product, graph)} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!q ? (
        <div className="lx-wrap mt-8 space-y-8">
          <div>
            <p className="mb-3 text-sm font-bold">{L("קטגוריות", "Categories")}</p>
            <div className="flex flex-wrap gap-2">{graph.categories.map((c) => <button key={c.id} type="button" className="lx-chip" onClick={() => setDraft(categoryName(c.id, lang))}>{categoryName(c.id, lang)}</button>)}</div>
          </div>
          {suggestions.length ? (
            <div>
              <p className="mb-3 text-sm font-bold">{L("נושאים מהקטלוג", "Topics from the catalog")}</p>
              <div className="flex flex-wrap gap-2">{suggestions.map((t) => <button key={t} type="button" className="lx-chip" onClick={() => setDraft(t)}>#{t}</button>)}</div>
            </div>
          ) : null}
          {graph.creators.length ? (
            <div>
              <p className="mb-3 text-sm font-bold">{L("יוצרים", "Creators")}</p>
              <div className="flex flex-wrap gap-2">{graph.creators.map((c) => <Go key={c.id} to={creatorPath(c.slug)} className="lx-chip"><CreatorAvatar creator={c} size={22} /> {c.name}</Go>)}</div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="lx-wrap mt-8">
          <p className="lx-mute text-sm" role="status" aria-live="polite">{res.total ? L(`${res.total} תוצאות עבור „${q}”`, `${res.total} results for “${q}”`) : ""}</p>
          {res.link ? (
            <p className="mt-2 text-[13px]" role="status">{res.link.products.length
              ? L("זיהינו את הקישור — זה המוצר שהוא מוביל אליו" + (res.link.products.length > 1 ? `, עם ${res.link.products.length} המלצות.` : "."), "We recognised the link — this is the product it leads to.")
              : L("הקישור הזה לא מוביל למוצר שנמצא כרגע ב-LikeLink. נסו לכתוב את שם המוצר.", "This link doesn't lead to a product on LikeLink yet. Try its name.")}</p>
          ) : null}
          {res.intent && (res.intent.maxPrice != null || res.intent.minPrice != null) ? (
            <div className="mt-2 flex flex-wrap gap-2" aria-label={L("הבנו מהחיפוש", "Understood from your search")}>
              <span className="lx-mute text-[12.5px]">{L("הבנו:", "Understood:")}</span>
              {res.intent.maxPrice != null ? <span className="lx-chip">{L(`עד ₪${res.intent.maxPrice}`, `Up to ₪${res.intent.maxPrice}`)}</span> : null}
              {res.intent.minPrice != null ? <span className="lx-chip">{L(`מ־₪${res.intent.minPrice}`, `From ₪${res.intent.minPrice}`)}</span> : null}
              {res.intent.text ? <span className="lx-chip">„{res.intent.text}”</span> : null}
            </div>
          ) : null}
          {!res.total ? (
            <div className="mt-4">
              <EmptyState icon={Search} title={L(`לא מצאנו תוצאות עבור „${q}”`, `No results for “${q}”`)} body={L("נסו מילה אחרת, קטגוריה, או שם של יוצר/ת.", "Try another word, a category, or a creator's name.")}>
                {graph.categories.slice(0, 5).map((c) => <button key={c.id} type="button" className="lx-chip" onClick={() => setDraft(categoryName(c.id, lang))}>{categoryName(c.id, lang)}</button>)}
              </EmptyState>
            </div>
          ) : null}
          {res.creators.length ? (
            <div className="mt-6">
              <SectionHead title={L("יוצרים", "Creators")} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{res.creators.map((c) => <CreatorCard key={c.id} creator={c} graph={graph} />)}</div>
            </div>
          ) : null}
          {res.categories.length || res.collections.length ? (
            <div className="mt-10">
              <SectionHead title={L("אוספים וקטגוריות", "Collections & categories")} />
              <div className="mb-4 flex flex-wrap gap-2">{res.categories.map((c) => <Go key={c.id} to={`/discover/${encodeURIComponent(c.id)}`} className="lx-chip">{categoryName(c.id, lang)} <span className="opacity-60">{c.count}</span></Go>)}</div>
              {res.collections.length ? <Rail item="minmax(260px, 320px)">{res.collections.map((c) => <CollectionCard key={c.id} collection={c} />)}</Rail> : null}
            </div>
          ) : null}
          {res.products.length ? (
            <div className="mt-10">
              <SectionHead title={L("מוצרים", "Products")} sub={L(`${res.products.length} מוצרים · מסודרים לפי התאמה לחיפוש ואז לפי ראיות אמיתיות`, `${res.products.length} products · ordered by match, then by real evidence`)} />
              <p className="lx-mute mb-4 text-[12.5px]">{L("לכל מוצר מוצג למה הוא כאן — רק סימנים שקיימים בנתונים. אין כאן דירוגי כוכבים או ביקורות מומצאים.", "Each product shows why it is here — only signals that exist in the data. No invented stars or reviews.")}</p>
              <Grid products={res.products} graph={graph} why={res.why} />
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- saved */

export function SavedPage({ graph }) {
  const { L } = useL();
  const { favorites, following } = useMarketplace();
  const saved = (favorites || []).map((id) => graph.byId.get(id)).filter(Boolean);
  const followed = (following || []).map((id) => graph.creatorById.get(id)).filter(Boolean);
  return (
    <>
      <PageHero kicker={<><Heart size={14} /> {L("שמורים", "Saved")}</>} title={L("מה ששמרת", "Your saved finds")} sub={L("נשמר במכשיר הזה.", "Saved on this device.")} />
      <section className="lx-wrap mt-8">
        {saved.length ? <Grid products={saved} graph={graph} /> : <EmptyState icon={Heart} title={L("עוד לא שמרת כלום", "Nothing saved yet")} body={L("לחצו על ♡ בכל מוצר כדי לשמור אותו כאן.", "Tap ♡ on any product to keep it here.")}><Go to="/discover" className="lx-btn lx-btn-primary lx-btn-sm">{L("לגילוי", "Discover")}</Go></EmptyState>}
      </section>
      {followed.length ? (
        <Section>
          <SectionHead title={L("יוצרים שאת/ה עוקב/ת אחריהם", "Creators you follow")} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{followed.map((c) => <CreatorCard key={c.id} creator={c} graph={graph} />)}</div>
        </Section>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- not found */

export function NotFound({ what = "page" }) {
  const { L } = useL();
  const copy = {
    product: [L("המוצר לא נמצא", "Product not found"), L("ייתכן שהקישור שגוי, שהמוצר הוסר, או שעדיין לא אושר.", "The link may be wrong, the product removed, or not yet approved.")],
    creator: [L("היוצר/ת לא נמצא/ה", "Creator not found"), L("ייתכן שהקישור שגוי או שעדיין אין לחנות מוצרים מאושרים.", "The link may be wrong, or the shop has no approved products yet.")],
    collection: [L("האוסף לא נמצא", "Collection not found"), L("ייתכן שהאוסף השתנה או הוסר.", "The collection may have changed or been removed.")],
    page: [L("העמוד לא נמצא", "Page not found"), L("אבל יש הרבה מה לגלות.", "But there's plenty to discover.")],
  }[what];
  return (
    <div className="lx-wrap py-16">
      <EmptyState icon={ArrowUpLeft} title={copy[0]} body={copy[1]} heading="h1">
        <Go to="/discover" className="lx-btn lx-btn-primary lx-btn-sm">{L("לגילוי", "Discover")}</Go>
        <Go to="/search" className="lx-btn lx-btn-ghost lx-btn-sm">{L("חיפוש", "Search")}</Go>
      </EmptyState>
    </div>
  );
}
