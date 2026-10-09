import React, { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, Compass, PlayCircle, ShoppingBag, Users, Share2, Check, TrendingDown, Layers, Info } from "lucide-react";
import { useMarketplace } from "../../context/MarketplaceContext";
import { useVideos } from "../../context/VideoContext";
import {
  publicCatalog, publicCreators, buildCollections, detectedPriceDrops, budgetPicks, searchCatalog,
  categoryLabel, merchantOf, publicVideos, productMedia, MEDIA_STATE, isNewProduct, videoProductId,
} from "../../lib/site/catalog.js";
import { rankProducts, explainRecommendation, scoreProduct } from "../../lib/luna/engine.js";
import { publicUrl } from "../../lib/acquisition.js";
import { updatePageSEO } from "../../lib/seo.js";
import {
  useSite, SiteLink, Price, MediaFrame, ProductCard, CreatorCard, CreatorAvatar, SectionHead, EmptyState, useDeal, Arrow,
} from "./SiteParts.jsx";

// ── shared data ──────────────────────────────────────────────────────────
function useSiteData() {
  const { lang } = useSite();
  const { products, marketers, clicks, collections, notifications } = useMarketplace();
  const { videos } = useVideos();
  return useMemo(() => {
    const pub = publicCatalog(products, marketers);
    const creators = publicCreators(marketers, products);
    const creatorById = new Map(creators.map((c) => [c.id, c]));
    const vids = publicVideos(videos);
    const ranked = rankProducts(pub, { clicks, videos: vids }, lang);
    const categories = [...new Set(pub.map((p) => p.category || "Other"))];
    return {
      pub, creators, creatorById, videos: vids, ranked, categories,
      clicks: clicks || [],
      collections: buildCollections({ products, marketers, collections }, lang),
      drops: detectedPriceDrops(notifications, pub),
    };
  }, [products, marketers, clicks, collections, notifications, videos, lang]);
}

function useSEO({ title, description, path, image, jsonLd = null }) {
  useEffect(() => {
    updatePageSEO({ title, description, url: publicUrl(path), image, jsonLd });
  }, [title, description, path, image, jsonLd]);
}

function SearchBox({ size = "", initial = "", autoFocus = false }) {
  const { s, navigate } = useSite();
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  return (
    <form
      role="search"
      className={`s-search ${size}`}
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        navigate(v ? `/search?q=${encodeURIComponent(v)}` : "/search");
      }}
    >
      <Search size={size ? 20 : 17} aria-hidden="true" className="s-muted" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={s("searchPlaceholder")}
        aria-label={s("search")}
        autoFocus={autoFocus}
        dir="auto"
      />
      <button type="submit" className="s-btn primary sm">{s("search")}</button>
    </form>
  );
}

function CategoryChips({ categories, active, base = "/products" }) {
  const { s, lang } = useSite();
  return (
    <div className="s-rail" style={{ gridAutoColumns: "max-content", paddingBottom: 4 }}>
      <SiteLink to={base} className={`s-chip${!active ? " active" : ""}`}>{s("filterAll")}</SiteLink>
      {categories.map((c) => (
        <SiteLink key={c} to={`${base}/${encodeURIComponent(c)}`} className={`s-chip${active === c ? " active" : ""}`}>
          {categoryLabel(c, lang)}
        </SiteLink>
      ))}
    </div>
  );
}

function ReelCard({ item, creator }) {
  const { s } = useSite();
  const deal = useDeal();
  const p = item.product;
  return (
    <article style={{ position: "relative" }}>
      <MediaFrame product={p} videos={item.videos} shape="reel" animate={item.animate}>
        <div className="s-reel-overlay">
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}><bdi>{p.title}</bdi></p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
            <Price value={p.price} className="" />
            <button type="button" className="s-btn sm" style={{ background: "#fff", color: "#16131a" }} onClick={() => deal.open(p, creator, "reels")}>{s("buy")}</button>
          </div>
        </div>
      </MediaFrame>
      <SiteLink to={`/p/${encodeURIComponent(p.id)}`} className="s-meta" style={{ marginTop: 8, display: "block" }}>
        {creator?.name ? <><span>{s("recommendedBy", { name: "" })}</span><bdi>{creator.name}</bdi></> : s("details")}
      </SiteLink>
    </article>
  );
}

/** Reel items: real videos first, then animation files, then photos animated live (labelled). */
function reelItems(data, limit = 12) {
  const byId = new Map(data.pub.map((p) => [p.id, p]));
  const seen = new Set();
  const items = [];
  for (const state of [MEDIA_STATE.REAL_VIDEO, MEDIA_STATE.SYNTHETIC_ANIMATION]) {
    for (const v of data.videos) {
      const p = byId.get(videoProductId(v));
      if (!p || seen.has(p.id) || v.mediaState !== state) continue;
      seen.add(p.id);
      items.push({ product: p, videos: [v], animate: false });
    }
  }
  for (const r of data.ranked) {
    if (items.length >= limit) break;
    if (seen.has(r.product.id) || !r.product.image) continue;
    seen.add(r.product.id);
    items.push({ product: r.product, videos: [], animate: true });
  }
  return items.slice(0, limit);
}

function CollectionCard({ c }) {
  const { s } = useSite();
  const imgs = c.products.filter((p) => p.image).slice(0, 4);
  return (
    <SiteLink to={`/collections/${encodeURIComponent(c.id)}`} className="s-card" style={{ display: "block" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, aspectRatio: "1 / 1", background: "var(--s-soft)" }}>
        {imgs.map((p) => <img key={p.id} src={p.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />)}
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <h3 className="s-h3"><bdi>{c.title}</bdi></h3>
        <p className="s-meta" style={{ margin: "4px 0 0" }}>
          {s("productsCount", { n: c.products.length })} · {c.kind === "creator" ? s("creatorCollection") : s("autoCollection")}
        </p>
      </div>
    </SiteLink>
  );
}

// ── HOME ─────────────────────────────────────────────────────────────────
export function HomePage() {
  const { s, lang } = useSite();
  const data = useSiteData();
  useSEO({
    title: lang === "he" ? "LikeLink — מוצרים, יוצרות ותוכן במקום אחד" : "LikeLink — products, creators and content in one place",
    description: s("heroSub"),
    path: "/",
    image: data.ranked[0]?.product?.image,
  });
  const mosaic = data.ranked.filter((r) => r.product.image).slice(0, 5).map((r) => r.product);
  const reels = reelItems(data, 10);
  const hasRealVideo = data.videos.some((v) => v.mediaState === MEDIA_STATE.REAL_VIDEO);
  const newest = data.pub.filter((p) => isNewProduct(p)).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 8);
  const budget = budgetPicks(data.pub, 100).slice(0, 10);

  return (
    <>
      <section className="s-hero s-wrap">
        <div className="s-hero-grid">
          <div>
            <span className="s-hero-kicker"><Sparkles size={14} aria-hidden="true" /> {lang === "he" ? "מסחר של יוצרות · תוכן שאפשר לקנות" : "Creator commerce · shoppable content"}</span>
            <h1 className="s-h1" style={{ marginTop: 18 }}>
              {lang === "he" ? <>גלי מוצרים, יוצרות, <span className="s-grad-text">תוכן וטרנדים</span> — במקום אחד.</> : <>Discover products, creators, <span className="s-grad-text">content and trends</span> — in one place.</>}
            </h1>
            <p className="s-lead" style={{ marginTop: 16, maxWidth: 560 }}>{s("heroSub")}</p>
            <div style={{ marginTop: 22, maxWidth: 560 }}><SearchBox size="lg" /></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              {data.categories.slice(0, 6).map((c) => (
                <SiteLink key={c} to={`/discover/${encodeURIComponent(c)}`} className="s-chip">{categoryLabel(c, lang)}</SiteLink>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
              <SiteLink to="/discover" className="s-btn primary"><Compass size={17} aria-hidden="true" />{lang === "he" ? "להתחיל לגלות" : "Start discovering"}</SiteLink>
              <SiteLink to="/reels" className="s-btn ghost"><PlayCircle size={17} aria-hidden="true" />{s("navReels")}</SiteLink>
            </div>
          </div>
          {mosaic.length > 0 && (
            <div className="s-hero-mosaic" aria-label={s("selected")}>
              {mosaic.map((p, i) => (
                <SiteLink key={p.id} to={`/p/${encodeURIComponent(p.id)}`} className="s-card" style={{ borderRadius: 18 }}>
                  <MediaFrame product={p} shape={i === 0 ? "portrait" : "square"} eager={i < 2} />
                </SiteLink>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="s-section s-wrap">
        <div className="s-steps">
          {[["how1Title", "how1Body", Compass], ["how2Title", "how2Body", PlayCircle], ["how3Title", "how3Body", ShoppingBag]].map(([t, b, Icon], i) => (
            <div key={t} className="s-card" style={{ padding: 20, display: "flex", gap: 14 }}>
              <span className="s-avatar" style={{ width: 44, height: 44, fontSize: 16, boxShadow: "none" }} aria-hidden="true"><Icon size={20} /></span>
              <div>
                <h3 className="s-h3">{i + 1}. {s(t)}</h3>
                <p className="s-muted" style={{ margin: "6px 0 0", lineHeight: 1.55, fontSize: 14 }}>{s(b)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="s-section s-wrap">
        <SectionHead title={s("selected")} sub={s("selectedSub")} to="/products" linkLabel={s("seeAll")} />
        <div className="s-grid">
          {data.ranked.slice(0, 8).map((r) => (
            <ProductCard key={r.product.id} product={r.product} creator={data.creatorById.get(r.product.marketerId)} videos={data.videos} />
          ))}
        </div>
      </section>

      {reels.length > 0 && (
        <section className="s-section s-wrap">
          <SectionHead title={s("reels")} sub={hasRealVideo ? s("reelsSub") : s("noRealVideosBody")} to="/reels" linkLabel={s("seeAll")} />
          <div className="s-rail reels">
            {reels.map((it) => <ReelCard key={it.product.id} item={it} creator={data.creatorById.get(it.product.marketerId)} />)}
          </div>
        </section>
      )}

      {data.creators.length > 0 && (
        <section className="s-section s-wrap">
          <SectionHead title={s("creators")} sub={s("creatorsSub")} to="/creators" linkLabel={s("seeAll")} />
          <div className="s-grid">
            {data.creators.slice(0, 4).map((c) => <CreatorCard key={c.id} creator={c} products={data.pub.filter((p) => p.marketerId === c.id)} />)}
          </div>
        </section>
      )}

      {data.collections.length > 0 && (
        <section className="s-section s-wrap">
          <SectionHead title={s("collections")} sub={s("collectionsSub")} to="/collections" linkLabel={s("seeAll")} />
          <div className="s-rail">
            {data.collections.slice(0, 8).map((c) => <CollectionCard key={c.id} c={c} />)}
          </div>
        </section>
      )}

      {budget.length > 0 && (
        <section className="s-section s-wrap">
          <SectionHead title={s("underBudget", { max: 100 })} sub={s("dealsSub")} to="/deals" linkLabel={s("navDeals")} />
          <div className="s-grid">
            {budget.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} creator={data.creatorById.get(p.marketerId)} videos={data.videos} />)}
          </div>
        </section>
      )}

      {newest.length > 0 && (
        <section className="s-section s-wrap">
          <SectionHead title={s("newArrivals")} to="/products?sort=newest" linkLabel={s("seeAll")} />
          <div className="s-grid">
            {newest.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} creator={data.creatorById.get(p.marketerId)} videos={data.videos} />)}
          </div>
        </section>
      )}

      <section className="s-section s-wrap">
        <div className="s-cover" style={{ display: "grid", gap: 14 }}>
          <Users size={28} aria-hidden="true" />
          <h2 className="s-h2" style={{ color: "#fff" }}>{s("creatorsCtaTitle")}</h2>
          <p style={{ margin: 0, maxWidth: 560, lineHeight: 1.6, opacity: 0.92 }}>{s("creatorsCtaBody")}</p>
          <div><SiteLink to="/studio" className="s-btn" style={{ background: "#fff", color: "#16131a" }}>{s("openStudio")}</SiteLink></div>
        </div>
      </section>
    </>
  );
}

// ── DISCOVER ─────────────────────────────────────────────────────────────
export function DiscoverPage({ category = null }) {
  const { s, lang } = useSite();
  const data = useSiteData();
  const scoped = category ? data.ranked.filter((r) => (r.product.category || "Other") === category) : data.ranked;
  useSEO({
    title: category ? `${categoryLabel(category, lang)} — ${s("discover")} | LikeLink` : `${s("discover")} | LikeLink`,
    description: s("discoverSub"),
    path: category ? `/discover/${encodeURIComponent(category)}` : "/discover",
  });
  return (
    <div className="s-wrap s-section">
      <h1 className="s-h2" style={{ fontSize: "clamp(28px,4vw,44px)" }}>{category ? categoryLabel(category, lang) : s("discover")}</h1>
      <p className="s-lead" style={{ margin: "8px 0 18px" }}>{s("discoverSub")}</p>
      <SearchBox />
      <div style={{ marginTop: 16 }}><CategoryChips categories={data.categories} active={category} base="/discover" /></div>

      <section className="s-section" style={{ paddingBottom: 0 }}>
        <SectionHead title={s("lunaPicks")} sub={s("lunaPicksSub")} />
        {scoped.length ? (
          <div className="s-grid">
            {scoped.slice(0, 12).map((r) => (
              <ProductCard
                key={r.product.id}
                product={r.product}
                creator={data.creatorById.get(r.product.marketerId)}
                videos={data.videos}
                reason={`${s("whyHere")}: ${r.reasons.slice(0, 3).join(" · ")}`}
              />
            ))}
          </div>
        ) : (
          <EmptyState title={s("emptyProducts")} action={<SiteLink to="/discover" className="s-btn ghost sm">{s("filterAll")}</SiteLink>} />
        )}
      </section>

      {data.creators.length > 0 && (
        <section className="s-section">
          <SectionHead title={s("creators")} sub={s("creatorsSub")} to="/creators" linkLabel={s("seeAll")} />
          <div className="s-grid">
            {data.creators.slice(0, 4).map((c) => <CreatorCard key={c.id} creator={c} products={data.pub.filter((p) => p.marketerId === c.id)} />)}
          </div>
        </section>
      )}
      {data.collections.length > 0 && (
        <section className="s-section">
          <SectionHead title={s("collections")} to="/collections" linkLabel={s("seeAll")} />
          <div className="s-rail">{data.collections.slice(0, 8).map((c) => <CollectionCard key={c.id} c={c} />)}</div>
        </section>
      )}
    </div>
  );
}

// ── PRODUCTS ─────────────────────────────────────────────────────────────
export function ProductsPage({ category = null, sort: initialSort = "" }) {
  const { s, lang } = useSite();
  const data = useSiteData();
  const [sort, setSort] = useState(initialSort || "selected");
  useSEO({
    title: category ? `${categoryLabel(category, lang)} — ${s("products")} | LikeLink` : `${s("products")} | LikeLink`,
    description: s("selectedSub"),
    path: category ? `/products/${encodeURIComponent(category)}` : "/products",
  });
  const list = useMemo(() => {
    const base = data.ranked.map((r) => r.product).filter((p) => !category || (p.category || "Other") === category);
    if (sort === "newest") return [...base].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    if (sort === "price-low") return [...base].filter((p) => Number(p.price) > 0).sort((a, b) => a.price - b.price);
    if (sort === "price-high") return [...base].filter((p) => Number(p.price) > 0).sort((a, b) => b.price - a.price);
    return base;
  }, [data.ranked, category, sort]);
  return (
    <div className="s-wrap s-section">
      <div className="s-section-head">
        <div>
          <h1 className="s-h2" style={{ fontSize: "clamp(28px,4vw,44px)" }}>{category ? categoryLabel(category, lang) : s("products")}</h1>
          <p className="s-muted" style={{ margin: "6px 0 0" }}>{s("productsCount", { n: list.length })}</p>
        </div>
        <label className="s-meta" style={{ alignItems: "center" }}>
          <span className="s-skip">{s("sortSelected")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="s-chip" aria-label={s("sortSelected")}>
            <option value="selected">{s("sortSelected")}</option>
            <option value="newest">{s("sortNewest")}</option>
            <option value="price-low">{s("sortPriceLow")}</option>
            <option value="price-high">{s("sortPriceHigh")}</option>
          </select>
        </label>
      </div>
      <CategoryChips categories={data.categories} active={category} base="/products" />
      <div style={{ marginTop: 20 }}>
        {list.length ? (
          <div className="s-grid">
            {list.map((p) => <ProductCard key={p.id} product={p} creator={data.creatorById.get(p.marketerId)} videos={data.videos} />)}
          </div>
        ) : (
          <EmptyState title={s("emptyProducts")} action={<SiteLink to="/products" className="s-btn ghost sm">{s("filterAll")}</SiteLink>} />
        )}
      </div>
    </div>
  );
}

// ── CREATORS ─────────────────────────────────────────────────────────────
export function CreatorsPage({ category = null }) {
  const { s, lang } = useSite();
  const data = useSiteData();
  useSEO({ title: `${s("creators")} | LikeLink`, description: s("creatorsSub"), path: category ? `/creators/${encodeURIComponent(category)}` : "/creators" });
  const list = category
    ? data.creators.filter((c) => data.pub.some((p) => p.marketerId === c.id && (p.category || "Other") === category))
    : data.creators;
  return (
    <div className="s-wrap s-section">
      <h1 className="s-h2" style={{ fontSize: "clamp(28px,4vw,44px)" }}>{category ? `${s("creators")} · ${categoryLabel(category, lang)}` : s("creators")}</h1>
      <p className="s-lead" style={{ margin: "8px 0 20px" }}>{s("creatorsSub")}</p>
      {list.length ? (
        <div className="s-grid">
          {list.map((c) => <CreatorCard key={c.id} creator={c} products={data.pub.filter((p) => p.marketerId === c.id)} />)}
        </div>
      ) : (
        <EmptyState title={s("creatorNotFound")} />
      )}
      <div className="s-card" style={{ marginTop: 28, padding: 22, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <div>
          <h2 className="s-h3">{s("creatorsCtaTitle")}</h2>
          <p className="s-muted" style={{ margin: "6px 0 0" }}>{s("creatorsCtaBody")}</p>
        </div>
        <SiteLink to="/studio" className="s-btn accent">{s("joinAsCreator")}</SiteLink>
      </div>
    </div>
  );
}

// ── REELS ────────────────────────────────────────────────────────────────
export function ReelsPage() {
  const { s } = useSite();
  const data = useSiteData();
  useSEO({ title: `${s("reels")} | LikeLink`, description: s("reelsSub"), path: "/reels" });
  const items = reelItems(data, 40);
  const hasReal = data.videos.some((v) => v.mediaState === MEDIA_STATE.REAL_VIDEO);
  return (
    <div className="s-wrap s-section">
      <h1 className="s-h2" style={{ fontSize: "clamp(28px,4vw,44px)" }}>{s("reels")}</h1>
      <p className="s-lead" style={{ margin: "8px 0 18px" }}>{s("reelsSub")}</p>
      {!hasReal && (
        <div className="s-note" style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <Info size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <div><strong>{s("noRealVideosTitle")}.</strong> {s("noRealVideosBody")}</div>
        </div>
      )}
      {items.length ? (
        <div className="s-grid">
          {items.map((it) => <ReelCard key={it.product.id} item={it} creator={data.creatorById.get(it.product.marketerId)} />)}
        </div>
      ) : (
        <EmptyState title={s("noRealVideosTitle")} body={s("noRealVideosBody")} />
      )}
    </div>
  );
}

// ── DEALS ────────────────────────────────────────────────────────────────
export function DealsPage() {
  const { s } = useSite();
  const data = useSiteData();
  useSEO({ title: `${s("deals")} | LikeLink`, description: s("dealsSub"), path: "/deals" });
  const under50 = budgetPicks(data.pub, 50);
  const under100 = budgetPicks(data.pub, 100).filter((p) => Number(p.price) > 50);
  return (
    <div className="s-wrap s-section">
      <h1 className="s-h2" style={{ fontSize: "clamp(28px,4vw,44px)" }}>{s("deals")}</h1>
      <p className="s-lead" style={{ margin: "8px 0 20px" }}>{s("dealsSub")}</p>
      <section style={{ marginBottom: 30 }}>
        <SectionHead title={s("priceDrops")} />
        {data.drops.length ? (
          <div className="s-grid">
            {data.drops.slice(0, 12).map((d) => (
              <ProductCard key={`${d.product.id}-${d.ts}`} product={d.product} creator={data.creatorById.get(d.product.marketerId)} videos={data.videos} reason={d.text} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<TrendingDown size={26} aria-hidden="true" className="s-muted" />} title={s("emptyDealsTitle")} body={s("emptyDealsBody")} />
        )}
      </section>
      {under50.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <SectionHead title={s("underBudget", { max: 50 })} />
          <div className="s-grid">{under50.map((p) => <ProductCard key={p.id} product={p} creator={data.creatorById.get(p.marketerId)} videos={data.videos} />)}</div>
        </section>
      )}
      {under100.length > 0 && (
        <section>
          <SectionHead title={s("underBudget", { max: 100 })} />
          <div className="s-grid">{under100.map((p) => <ProductCard key={p.id} product={p} creator={data.creatorById.get(p.marketerId)} videos={data.videos} />)}</div>
        </section>
      )}
    </div>
  );
}

// ── COLLECTIONS ──────────────────────────────────────────────────────────
export function CollectionsPage({ id = null }) {
  const { s } = useSite();
  const data = useSiteData();
  const one = id ? data.collections.find((c) => c.id === id) : null;
  useSEO({
    title: one ? `${one.title} | LikeLink` : `${s("collections")} | LikeLink`,
    description: one ? `${one.products.length} ${s("products")}` : s("collectionsSub"),
    path: one ? `/collections/${encodeURIComponent(one.id)}` : "/collections",
    image: one?.products?.[0]?.image,
  });
  if (id) {
    return (
      <div className="s-wrap s-section">
        {one ? (
          <>
            <p className="s-meta" style={{ margin: 0 }}><Layers size={14} aria-hidden="true" /> {one.kind === "creator" ? s("creatorCollection") : s("autoCollection")}</p>
            <h1 className="s-h2" style={{ fontSize: "clamp(28px,4vw,44px)", marginTop: 6 }}><bdi>{one.title}</bdi></h1>
            <p className="s-muted" style={{ margin: "6px 0 20px" }}>{s("productsCount", { n: one.products.length })}</p>
            <div className="s-grid">{one.products.map((p) => <ProductCard key={p.id} product={p} creator={data.creatorById.get(p.marketerId)} videos={data.videos} />)}</div>
          </>
        ) : (
          <EmptyState title={s("emptyCollectionsTitle")} action={<SiteLink to="/collections" className="s-btn ghost sm">{s("collections")}</SiteLink>} />
        )}
      </div>
    );
  }
  return (
    <div className="s-wrap s-section">
      <h1 className="s-h2" style={{ fontSize: "clamp(28px,4vw,44px)" }}>{s("collections")}</h1>
      <p className="s-lead" style={{ margin: "8px 0 20px" }}>{s("collectionsSub")}</p>
      {data.collections.length ? (
        <div className="s-grid">{data.collections.map((c) => <CollectionCard key={c.id} c={c} />)}</div>
      ) : (
        <EmptyState title={s("emptyCollectionsTitle")} />
      )}
    </div>
  );
}

// ── SEARCH ───────────────────────────────────────────────────────────────
export function SearchPage({ query = "" }) {
  const { s } = useSite();
  const { products, marketers } = useMarketplace();
  const data = useSiteData();
  useSEO({ title: query ? `${s("results", { q: query })} | LikeLink` : `${s("search")} | LikeLink`, description: s("searchHint"), path: "/search" });
  const res = useMemo(() => searchCatalog(query, { products, marketers }), [query, products, marketers]);
  return (
    <div className="s-wrap s-section">
      <h1 className="s-h2" style={{ fontSize: "clamp(26px,3.6vw,40px)", marginBottom: 16 }}>{query ? s("results", { q: query }) : s("search")}</h1>
      <SearchBox size="lg" initial={query} autoFocus={!query} />
      {!query && <p className="s-muted" style={{ marginTop: 14 }}>{s("searchHint")}</p>}
      {query && !res.products.length && !res.creators.length && (
        <div style={{ marginTop: 22 }}><EmptyState title={s("noResults", { q: query })} body={s("noResultsHint")} action={<SiteLink to="/discover" className="s-btn ghost sm">{s("navDiscover")}</SiteLink>} /></div>
      )}
      {res.creators.length > 0 && (
        <section className="s-section" style={{ paddingBottom: 0 }}>
          <SectionHead title={s("creators")} />
          <div className="s-grid">{res.creators.map((c) => <CreatorCard key={c.id} creator={c} products={data.pub.filter((p) => p.marketerId === c.id)} />)}</div>
        </section>
      )}
      {res.products.length > 0 && (
        <section className="s-section">
          <SectionHead title={`${s("products")} (${res.products.length})`} />
          <div className="s-grid">{res.products.map((p) => <ProductCard key={p.id} product={p} creator={data.creatorById.get(p.marketerId)} videos={data.videos} />)}</div>
        </section>
      )}
    </div>
  );
}

// ── PRODUCT PAGE ─────────────────────────────────────────────────────────
export function ProductPage({ id }) {
  const { s, lang } = useSite();
  const data = useSiteData();
  const { recordProductView } = useMarketplace();
  const deal = useDeal();
  const [copied, setCopied] = useState(false);
  const product = data.pub.find((p) => String(p.id) === String(id)) || null;
  const creator = product ? data.creatorById.get(product.marketerId) : null;
  const merchant = product ? merchantOf(product).name : "";
  const scored = product ? scoreProduct(product, { clicks: data.clicks, videos: data.videos }, lang) : null;
  const url = publicUrl(`/p/${encodeURIComponent(id || "")}`);

  useSEO({
    title: product ? `${product.title} | LikeLink` : `${s("productNotFound")} | LikeLink`,
    description: product ? String(product.description || s("heroSub")).slice(0, 160) : s("productNotFoundBody"),
    path: `/p/${encodeURIComponent(id || "")}`,
    image: product?.image,
    jsonLd: product
      ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        image: product.image || undefined,
        description: product.description || undefined,
        brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
        offers: Number(product.price) > 0 ? { "@type": "Offer", priceCurrency: product.currency || "ILS", price: String(product.price), url } : undefined,
      }
      : null,
  });

  useEffect(() => {
    if (product) Promise.resolve(recordProductView?.(product)).catch(() => {});
    // one view per product page open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product) {
    return (
      <div className="s-wrap s-section">
        <EmptyState title={s("productNotFound")} body={s("productNotFoundBody")} action={<SiteLink to="/" className="s-btn primary sm">{s("backHome")}</SiteLink>} />
      </div>
    );
  }
  const more = data.pub.filter((p) => p.marketerId === product.marketerId && p.id !== product.id).slice(0, 4);
  const similar = data.pub.filter((p) => p.category === product.category && p.id !== product.id && !more.includes(p)).slice(0, 4);
  const media = productMedia(product, data.videos);
  const direct = deal.isDirect(product);

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title: product.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* user cancelled */ }
  }

  return (
    <div className="s-wrap s-section">
      <div className="s-pd-grid">
        <div className="s-card" style={{ borderRadius: 28 }}>
          <MediaFrame product={product} videos={data.videos} shape="portrait" eager animate={media.state === MEDIA_STATE.STATIC_IMAGE ? false : false} />
        </div>
        <div className="s-pd-sticky" style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <SiteLink to={`/discover/${encodeURIComponent(product.category || "Other")}`} className="s-badge light">{categoryLabel(product.category, lang)}</SiteLink>
            {isNewProduct(product) && <span className="s-badge new">{s("newBadge")}</span>}
            {merchant && <span className="s-badge light">{s("soldAt", { merchant: "" })}<bdi>{merchant}</bdi></span>}
          </div>
          <h1 className="s-h2" style={{ fontSize: "clamp(26px,3.4vw,40px)" }}><bdi>{product.title}</bdi></h1>
          <Price value={product.price} className="s-price" />
          {creator && (
            <SiteLink to={`/u/${encodeURIComponent(creator.slug)}`} className="s-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, boxShadow: "none" }}>
              <CreatorAvatar creator={creator} />
              <div style={{ minWidth: 0 }}>
                <div className="s-meta">{s("recommendedBy", { name: "" })}</div>
                <strong><bdi>{creator.name}</bdi></strong>
              </div>
              <span style={{ marginInlineStart: "auto" }}><Arrow /></span>
            </SiteLink>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="s-btn primary" style={{ flex: "1 1 220px" }} onClick={() => deal.open(product, creator, "product_page")}>
              {direct ? s("addToCart") : merchant ? s("buyAt", { merchant }) : s("buy")}
            </button>
            <button type="button" className="s-btn ghost" onClick={share} aria-live="polite">
              {copied ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}{copied ? s("copied") : s("share")}
            </button>
          </div>
          {!direct && <p className="s-note" style={{ margin: 0 }}>{s("disclosure")}</p>}
          {product.description && (
            <div>
              <h2 className="s-h3" style={{ marginBottom: 6 }}>{s("details")}</h2>
              <p className="s-ink2" style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-line" }} dir="auto">{product.description}</p>
            </div>
          )}
          {scored?.reasons?.length > 0 && (
            <div className="s-card" style={{ padding: 16, boxShadow: "none" }}>
              <h2 className="s-h3" style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={16} aria-hidden="true" />{s("whyHere")}</h2>
              <p className="s-muted" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6 }}>{explainRecommendation(scored, lang)}</p>
            </div>
          )}
        </div>
      </div>

      {more.length > 0 && creator && (
        <section className="s-section">
          <SectionHead title={s("moreFromCreator", { name: creator.name })} to={`/u/${encodeURIComponent(creator.slug)}`} linkLabel={s("toStore")} />
          <div className="s-grid">{more.map((p) => <ProductCard key={p.id} product={p} creator={creator} videos={data.videos} />)}</div>
        </section>
      )}
      {similar.length > 0 && (
        <section className="s-section">
          <SectionHead title={s("similar")} />
          <div className="s-grid">{similar.map((p) => <ProductCard key={p.id} product={p} creator={data.creatorById.get(p.marketerId)} videos={data.videos} />)}</div>
        </section>
      )}
    </div>
  );
}

// ── CREATOR STOREFRONT ───────────────────────────────────────────────────
export function CreatorPage({ slug }) {
  const { s, lang } = useSite();
  const data = useSiteData();
  const { following, toggleFollow } = useMarketplace();
  const [tab, setTab] = useState("products");
  const [copied, setCopied] = useState(false);
  const creator = data.creators.find((c) => c.slug === slug || c.id === slug) || null;
  const own = creator ? data.ranked.map((r) => r.product).filter((p) => p.marketerId === creator.id) : [];
  const cols = creator ? data.collections.filter((c) => c.kind === "creator" ? c.marketerId === creator.id : c.products.every((p) => p.marketerId === creator.id)) : [];
  const reels = creator ? reelItems({ ...data, pub: own, ranked: data.ranked.filter((r) => r.product.marketerId === creator.id) }, 24) : [];
  const url = publicUrl(`/u/${encodeURIComponent(slug || "")}`);
  const isFollowing = Boolean(creator && Array.isArray(following) && following.includes(creator.id));

  useSEO({
    title: creator ? `${creator.name} — ${lang === "he" ? "חנות ההמלצות" : "storefront"} | LikeLink` : `${s("creatorNotFound")} | LikeLink`,
    description: creator ? (creator.bio || s("creatorsSub")) : s("creatorNotFound"),
    path: `/u/${encodeURIComponent(slug || "")}`,
    image: own[0]?.image,
    jsonLd: creator ? { "@context": "https://schema.org", "@type": "ProfilePage", mainEntity: { "@type": "Person", name: creator.name, description: creator.bio || undefined, url } } : null,
  });

  if (!creator) {
    return <div className="s-wrap s-section"><EmptyState title={s("creatorNotFound")} action={<SiteLink to="/creators" className="s-btn primary sm">{s("creators")}</SiteLink>} /></div>;
  }

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title: creator.name, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* cancelled */ }
  }

  const tabs = [
    ["products", `${s("products")} · ${own.length}`],
    ...(cols.length ? [["collections", `${s("collections")} · ${cols.length}`]] : []),
    ["reels", s("reels")],
  ];
  return (
    <div className="s-wrap s-section">
      <div className="s-cover" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
        <CreatorAvatar creator={creator} size="xl" />
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h1 className="s-h2" style={{ color: "#fff", fontSize: "clamp(28px,4vw,42px)" }}><bdi>{creator.name}</bdi></h1>
          {creator.bio && <p style={{ margin: "8px 0 0", lineHeight: 1.6, opacity: 0.92, maxWidth: 620 }} dir="auto">{creator.bio}</p>}
          <p style={{ margin: "10px 0 0", fontSize: 14, opacity: 0.85 }}>{s("productsCount", { n: own.length })}</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="s-btn" style={{ background: "#fff", color: "#16131a" }} aria-pressed={isFollowing} onClick={() => toggleFollow?.(creator.id)}>
            {isFollowing ? <Check size={16} aria-hidden="true" /> : null}{isFollowing ? s("following") : s("follow")}
          </button>
          <button type="button" className="s-btn" style={{ background: "rgba(255,255,255,.16)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} onClick={share}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}{copied ? s("copied") : s("share")}
          </button>
        </div>
      </div>

      <div role="tablist" style={{ display: "flex", gap: 8, margin: "22px 0 18px", flexWrap: "wrap" }}>
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`s-chip${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "products" && (own.length
        ? <div className="s-grid">{own.map((p) => <ProductCard key={p.id} product={p} creator={creator} videos={data.videos} />)}</div>
        : <EmptyState title={s("emptyProducts")} />)}
      {tab === "collections" && <div className="s-grid">{cols.map((c) => <CollectionCard key={c.id} c={c} />)}</div>}
      {tab === "reels" && (reels.length
        ? <div className="s-grid">{reels.map((it) => <ReelCard key={it.product.id} item={it} creator={creator} />)}</div>
        : <EmptyState title={s("noRealVideosTitle")} body={s("noRealVideosBody")} />)}
      <p className="s-note" style={{ marginTop: 22 }}>{s("disclosure")}</p>
    </div>
  );
}
