import React, { useMemo } from "react";
import { Home, Compass, PlayCircle, Search, Store, ShoppingBag, Languages } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useCart } from "../../context/CartContext";
import { siteT } from "../../lib/site/strings.js";
import { SiteContext, SiteLink } from "./SiteParts.jsx";
import {
  HomePage, DiscoverPage, ProductsPage, CreatorsPage, ReelsPage, DealsPage, CollectionsPage, SearchPage, ProductPage, CreatorPage,
} from "./SitePages.jsx";

// The PUBLIC website: consumer-facing, visual, social, commercial.
// It never shows Studio internals (system health, cloud status, backend
// metrics) — those live in /studio.
const NAV = [
  ["/", "navHome"],
  ["/discover", "navDiscover"],
  ["/products", "navProducts"],
  ["/creators", "navCreators"],
  ["/reels", "navReels"],
  ["/deals", "navDeals"],
  ["/collections", "navCollections"],
];

function isActive(path, current) {
  if (path === "/") return current === "/";
  return current === path || current.startsWith(`${path}/`);
}

export default function PublicSite({ route, navigate }) {
  const { lang, setLang } = useI18n();
  const s = useMemo(() => siteT(lang), [lang]);
  const { cartCount, setIsOpen } = useCart();
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const ctx = useMemo(() => ({ lang, s, navigate }), [lang, s, navigate]);
  const dir = lang === "he" ? "rtl" : "ltr";

  let page;
  switch (route.type) {
    case "discover": page = <DiscoverPage category={route.category} />; break;
    case "products": page = <ProductsPage category={route.category} sort={params.get("sort") || ""} />; break;
    case "creators": page = <CreatorsPage category={route.category} />; break;
    case "reels": page = <ReelsPage />; break;
    case "deals": page = <DealsPage />; break;
    case "collections": page = <CollectionsPage id={route.id} />; break;
    case "search": page = <SearchPage query={params.get("q") || ""} />; break;
    case "product": page = <ProductPage id={route.id} />; break;
    case "creator": page = <CreatorPage slug={route.slug} />; break;
    default: page = <HomePage />;
  }

  return (
    <SiteContext.Provider value={ctx}>
      <div className="ll-site" dir={dir} lang={lang}>
        <a href="#s-main" className="s-skip">{lang === "he" ? "דלגי לתוכן" : "Skip to content"}</a>
        <header className="s-header">
          <div className="s-wrap s-header-row">
            <SiteLink to="/" className="s-logo" aria-label="LikeLink">
              <span className="s-logo-mark" aria-hidden="true">L</span>
              <span>{s("brand")}</span>
            </SiteLink>
            <nav className="s-nav" aria-label={s("menu")}>
              {NAV.map(([to, key]) => (
                <SiteLink key={to} to={to} aria-current={isActive(to, path) ? "page" : undefined}>{s(key)}</SiteLink>
              ))}
            </nav>
            <div className="s-header-search">
              <form
                role="search"
                className="s-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = new FormData(e.currentTarget).get("q")?.toString().trim() || "";
                  navigate(v ? `/search?q=${encodeURIComponent(v)}` : "/search");
                }}
              >
                <Search size={17} aria-hidden="true" className="s-muted" />
                <input name="q" type="search" placeholder={s("searchPlaceholder")} aria-label={s("search")} dir="auto" />
              </form>
            </div>
            <div className="s-header-actions">
              <button type="button" className="s-icon-btn" onClick={() => setLang(lang === "he" ? "en" : "he")} aria-label={s("langSwitch")} title={s("langSwitch")}>
                <Languages size={18} aria-hidden="true" />
              </button>
              <button type="button" className="s-icon-btn" onClick={() => setIsOpen(true)} aria-label={s("cart")}>
                <ShoppingBag size={18} aria-hidden="true" />
                {cartCount > 0 && <span className="s-count">{cartCount}</span>}
              </button>
              <SiteLink to="/studio" className="s-btn primary sm">{s("navStudio")}</SiteLink>
            </div>
          </div>
        </header>

        <main id="s-main">{page}</main>

        <footer className="s-footer">
          <div className="s-wrap" style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
              {NAV.map(([to, key]) => <SiteLink key={to} to={to}>{s(key)}</SiteLink>)}
              <SiteLink to="/search">{s("search")}</SiteLink>
              <SiteLink to="/studio">{s("navStudio")}</SiteLink>
            </div>
            <p style={{ margin: 0, maxWidth: 720, lineHeight: 1.6 }}>{s("disclosure")}</p>
            <p className="s-muted" style={{ margin: 0 }}>{s("footerLegal")}</p>
          </div>
        </footer>

        <nav className="s-bottom-nav" aria-label={s("menu")}>
          {[["/", "navHome", Home], ["/discover", "navDiscover", Compass], ["/reels", "navReels", PlayCircle], ["/search", "search", Search], ["/studio", "navStudio", Store]].map(([to, key, Icon]) => (
            <SiteLink key={to} to={to} aria-current={isActive(to, path) ? "page" : undefined}>
              <Icon size={19} aria-hidden="true" />
              <span>{s(key)}</span>
            </SiteLink>
          ))}
        </nav>
      </div>
    </SiteContext.Provider>
  );
}
