// LikeLink2 public site — one lazy chunk for every public discovery surface.
// App.jsx mounts this for the public route types; the Studio and Admin keep
// their own shells.
import React, { useEffect } from "react";
import { NavCtx, useGraph, useL } from "./kit";
import { PublicShell } from "./PublicShell";
import {
  CollectionsPage,
  CreatorPage,
  CreatorsPage,
  DealsPage,
  GuidePage,
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
import { getCreatorSEO, getDefaultSEO, getProductSEO, updatePageSEO } from "../../lib/seo.js";
import { publicUrl } from "../../lib/acquisition.js";

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
  const page = (path, title, description, extra = {}) => ({ ...base, title: `${title} | LikeLink2`, description, url: publicUrl(path), robots: "index,follow", ...extra });
  switch (route.type) {
    case "landing":
      return base;
    case "product": {
      const p = graph.byId.get(route.id);
      const owner = p ? graph.creatorById.get(p.marketerId) : null;
      return getProductSEO(p ? { ...p, title: p.displayTitle } : null, owner) || { ...base, title: "מוצר לא נמצא | LikeLink2", robots: "noindex,follow" };
    }
    case "creator": {
      const c = findCreator(graph, route.slug);
      return c ? getCreatorSEO(c, c.productIds.map((id) => graph.byId.get(id))) : { ...base, title: "יוצר/ת לא נמצא/ה | LikeLink2", robots: "noindex,follow" };
    }
    case "discover":
      return route.category
        ? page(`/discover/${encodeURIComponent(route.category)}`, `${categoryName(route.category, lang)} — גילוי`, `מוצרים מאושרים בקטגוריית ${categoryName(route.category, "he")}, שנבחרו על ידי יוצרים.`)
        : page("/discover", he ? "גילוי" : "Discover", "פיד ויזואלי של מוצרים, יוצרים, אוספים וטרנדים בלייקלינק.");
    case "products":
      return page(route.category ? `/products/${encodeURIComponent(route.category)}` : "/products", he ? "מוצרים" : "Products", "כל המוצרים המאושרים בלייקלינק, לפי קטגוריה ותקציב.");
    case "creators":
      return page("/creators", he ? "יוצרים" : "Creators", "יוצרים, החנויות והבחירות שלהם בלייקלינק.");
    case "reels":
      return page("/reels", he ? "סרטונים" : "Reels", "סרטונים וסיפורי מוצר מהיוצרים בלייקלינק, מסומנים בכנות.");
    case "trends":
      return page("/trends", he ? "טרנדים" : "Trends", "טרנדים שמבוססים על צפיות וקליקים שנרשמו בפועל.");
    case "collections": {
      const col = route.id ? findCollection(graph, route.id) : null;
      return col
        ? page(`/collections/${encodeURIComponent(col.id)}`, col.title[he ? "he" : "en"], col.description.he)
        : page("/collections", he ? "אוספים" : "Collections", "לוחות עריכה ואוספים של יוצרים בלייקלינק.");
    }
    case "deals":
      return page("/deals", he ? "דילים" : "Deals", "ירידות מחיר אמיתיות בלבד, ובחירות לפי תקציב.");
    case "guide":
      return page("/guide", he ? "המדריך החינמי: 8 בדיקות לפני שקונים באליאקספרס" : "Free guide: 8 checks before buying on AliExpress", "המדריך של לונה: כסף 925, מידת טבעת וצמיד, מואסניט, מתנות, מבצעים אמיתיים, בדיקת קישור והגנת קונה.");
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
