// LikeLink2 public site — one lazy chunk for every public discovery surface.
// App.jsx mounts this for the public route types; the Studio and Admin keep
// their own shells.
import React, { useEffect } from "react";
import { NavCtx, useGraph, useL } from "./kit";
import { PublicShell } from "./PublicShell";
import { StatusPage } from "./status";
import { JoinPage } from "./join";
import {
  CollectionsPage,
  CreatorPage,
  CreatorsPage,
  DealsPage,
  GuidePage,
  SizePage,
  DiscoverPage,
  HomePage,
  NotFound,
  ProductPage,
  ProductsPage,
  ReelsPage,
  SavedPage,
  SearchPage,
  TrendsPage,
} from "./pages";
import { categoryName, findCollection, findCreator } from "../../lib/publicDiscovery.js";
import { getCreatorSEO, getDefaultSEO, updatePageSEO, PUBLIC_ORIGIN } from "../../lib/seo.js";
import { sectionSeo } from "../../lib/publicSeo.js";
import { buildProductSeo, canonicalProduct } from "../../lib/discovery/surfaces.js";
import { publicUrl } from "../../lib/acquisition.js";
import { INDEX_ROBOTS } from "../../constants/seo.js";

export const PUBLIC_ROUTE_TYPES = Object.freeze([
  "landing",
  "discover",
  "products",
  "creators",
  "creator",
  "product",
  "reels",
  "trends",
  "collections",
  "deals",
  "search",
  "saved",
]);

function pageSEO(route, graph, lang) {
  const he = lang === "he";
  const base = getDefaultSEO("home");
  const page = (path, title, description, extra = {}) => ({ ...base, title: `${title} | LikeLink2`, description, url: publicUrl(path), robots: INDEX_ROBOTS, ...extra });
  // A whole section: the same head the build writes into its static HTML (publicSeo.js).
  const section = (type) => {
    const s = sectionSeo(type, { lang: he ? "he" : "en" });
    return { ...base, title: s.title, description: s.description, url: s.canonical, robots: INDEX_ROBOTS, jsonLd: s.jsonLd };
  };
  switch (route.type) {
    case "landing":
      return base;
    case "product": {
      const p = graph.byId.get(route.id);
      const owner = p ? graph.creatorById.get(p.marketerId) : null;
      if (!p || !owner) return { ...base, title: "מוצר לא נמצא | LikeLink2", robots: "noindex,follow" };
      // The one builder the static page, /p/:id on the server and the engine's
      // audit use: no price without a store source, no stock claim, the
      // recommending creator is never the brand.
      const seo = buildProductSeo(canonicalProduct(p, owner, PUBLIC_ORIGIN));
      return { title: seo.title, description: seo.description, image: seo.og.image, url: seo.canonical, type: "product", robots: seo.robots, jsonLd: seo.jsonLd };
    }
    case "creator": {
      const c = findCreator(graph, route.slug);
      return c ? getCreatorSEO(c, c.productIds.map((id) => graph.byId.get(id))) : { ...base, title: "יוצר/ת לא נמצא/ה | LikeLink2", robots: "noindex,follow" };
    }
    case "discover":
      return route.category
        ? page(`/discover/${encodeURIComponent(route.category)}`, `${categoryName(route.category, lang)} — גילוי`, `מוצרים מאושרים בקטגוריית ${categoryName(route.category, "he")}, שנבחרו על ידי יוצרים.`)
        : section("discover");
    case "products":
      return route.category
        ? page(`/products/${encodeURIComponent(route.category)}`, `${categoryName(route.category, lang)} — ${he ? "מוצרים" : "Products"}`, `מוצרים בקטגוריית ${categoryName(route.category, "he")} שיוצרים בחרו בלייקלינק, עם קישור ישיר לחנות.`)
        : section("products");
    case "creators":
      return section("creators");
    case "reels":
      return section("reels");
    case "trends":
      return section("trends");
    case "collections": {
      const col = route.id ? findCollection(graph, route.id) : null;
      return col
        ? page(`/collections/${encodeURIComponent(col.id)}`, col.title[he ? "he" : "en"], col.description.he)
        : section("collections");
    }
    case "deals":
      return section("deals");
    case "guide":
      return section("guide");
    case "size":
      return section("size");
    case "status":
      return { ...page("/status", he ? "מצב האתר ומה כל תווית אומרת" : "Site status and what each label means", "מה נבדק בקטלוג, מתי, ומה עוד חסר: קישורים, מחירים, התאמת תמונות וסרטונים למוצרים."), robots: "noindex,follow" };
    case "join":
      return section("join");
    case "search":
      return { ...page("/search", he ? "חיפוש" : "Search", "חיפוש מוצרים, יוצרים, אוספים וקטגוריות."), robots: "noindex,follow" };
    case "saved":
      return { ...page("/saved", he ? "שמורים" : "Saved", "המוצרים שנשמרו במכשיר הזה."), robots: "noindex,follow" };
    default:
      return base;
  }
}

/** The public chrome around a page that is not part of the graph (e.g. /merchants). */
export function PublicFrame({ routeType, navigate, children }) {
  return (
    <NavCtx.Provider value={navigate}>
      <PublicShell routeType={routeType} navigate={navigate}>
        {children}
      </PublicShell>
    </NavCtx.Provider>
  );
}

export default function PublicSite({ route, navigate }) {
  const graph = useGraph();
  const { lang } = useL();

  // (The shell keeps the overscroll / safe-area background on the theme's canvas.)
  useEffect(() => {
    updatePageSEO(pageSEO(route, graph, lang));
    // route identity is what matters; graph changes only refresh copy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, lang, graph.products.length]);

  let page;
  switch (route.type) {
    case "landing":
      page = <HomePage graph={graph} navigate={navigate} />;
      break;
    case "discover":
      page = <DiscoverPage graph={graph} category={route.category} />;
      break;
    case "products":
      page = <ProductsPage key={`${route.category || ""}-${route.nav || ""}`} graph={graph} category={route.category} />;
      break;
    case "creators":
      page = <CreatorsPage graph={graph} category={route.category} navigate={navigate} />;
      break;
    case "creator":
      page = <CreatorPage key={route.slug} graph={graph} slug={route.slug} navigate={navigate} />;
      break;
    case "product":
      page = <ProductPage key={route.id} graph={graph} id={route.id} navigate={navigate} />;
      break;
    case "reels":
      page = <ReelsPage key={route.nav || "reels"} graph={graph} />;
      break;
    case "trends":
      page = <TrendsPage graph={graph} />;
      break;
    case "collections":
      page = <CollectionsPage key={route.id || "all"} graph={graph} id={route.id} navigate={navigate} />;
      break;
    case "deals":
      page = <DealsPage graph={graph} />;
      break;
    case "guide":
      page = <GuidePage graph={graph} />;
      break;
    case "size":
      page = <SizePage graph={graph} />;
      break;
    case "status":
      page = <StatusPage graph={graph} />;
      break;
    case "join":
      page = <JoinPage graph={graph} />;
      break;
    case "search":
      page = <SearchPage key={route.nav || "search"} graph={graph} />;
      break;
    case "saved":
      page = <SavedPage graph={graph} />;
      break;
    default:
      page = <NotFound />;
  }

  return (
    <NavCtx.Provider value={navigate}>
      <PublicShell routeType={route.type} navigate={navigate} immersive={route.type === "reels"}>
        {page}
      </PublicShell>
    </NavCtx.Provider>
  );
}
