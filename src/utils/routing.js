// SPA router. Two separate experiences:
//   • the PUBLIC website (home, discover, products, creators, reels, deals,
//     collections, search, product and creator pages) — consumer-facing;
//   • the STUDIO (/studio/:view) — the creator/seller operating system.
const dec = (v) => (v ? decodeURIComponent(v) : null);

export function parsePath(pathname) {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (parts[0] === "u" && parts[1]) return { type: "creator", slug: decodeURIComponent(parts[1]) };
  if (parts[0] === "r") return { type: "redirect" };
  if (parts[0] === "feed") return { type: "app", tab: "feed" };
  // Public discovery surfaces (indexable, shareable).
  if (parts[0] === "creators") return { type: "creators", category: dec(parts[1]) };
  if (parts[0] === "merchants") return { type: "merchants", category: dec(parts[1]) };
  if (parts[0] === "discover") return { type: "discover", category: dec(parts[1]) };
  if (parts[0] === "products") return { type: "products", category: dec(parts[1]) };
  if (parts[0] === "reels") return { type: "reels" };
  if (parts[0] === "deals") return { type: "deals" };
  if (parts[0] === "collections") return { type: "collections", id: dec(parts[1]) };
  if (parts[0] === "search") return { type: "search" };
  if (parts[0] === "join") return { type: "join" };
  // "studio" is canonical; "sell" is a legacy alias. An optional second
  // segment deep-links to a studio view (/studio/google-merchant).
  if (parts[0] === "studio" || parts[0] === "sell") {
    return { type: "app", tab: "sell", view: parts[1] ? decodeURIComponent(parts[1]) : undefined };
  }
  if (parts[0] === "admin") return { type: "app", tab: "admin" };
  if (parts[0] === "p" && parts[1]) return { type: "product", id: decodeURIComponent(parts[1]) };
  return { type: "home" };
}

/** Route types rendered by the public website (src/components/site/PublicSite.jsx). */
export const PUBLIC_ROUTE_TYPES = Object.freeze([
  "home", "discover", "products", "creators", "reels", "deals", "collections", "search", "product", "creator",
]);

export function tabToPath(tab) {
  if (tab === "feed") return "/feed";
  if (tab === "sell") return "/studio";
  if (tab === "admin") return "/admin";
  return "/";
}
