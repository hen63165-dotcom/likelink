export function parsePath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "u" && parts[1]) return { type: "creator", slug: decodeURIComponent(parts[1]) };
  if (parts[0] === "r") return { type: "redirect" };
  if (parts[0] === "feed") return { type: "app", tab: "feed" };
  // Public acquisition + discovery surfaces (indexable, shareable).
  if (parts[0] === "creators") {
    return { type: "creators", category: parts[1] ? decodeURIComponent(parts[1]) : null };
  }
  if (parts[0] === "merchants") {
    return { type: "merchants", category: parts[1] ? decodeURIComponent(parts[1]) : null };
  }
  // Public discovery surfaces (redesigned public site).
  if (parts[0] === "reels") return { type: "reels" };
  if (parts[0] === "trends") return { type: "trends" };
  if (parts[0] === "deals") return { type: "deals" };
  if (parts[0] === "search") return { type: "search" };
  if (parts[0] === "saved") return { type: "saved" };
  if (parts[0] === "products") {
    return { type: "products", category: parts[1] ? decodeURIComponent(parts[1]) : null };
  }
  if (parts[0] === "collections") {
    return { type: "collections", id: parts[1] ? decodeURIComponent(parts[1]) : null };
  }
  if (parts[0] === "discover") {
    return { type: "discover", category: parts[1] ? decodeURIComponent(parts[1]) : null };
  }
  // "studio" is canonical; "sell" is a legacy alias still used by callers
  // (e.g. FeedView's hero CTA). Both must open the seller studio.
  // An optional second segment deep-links to a studio view (/studio/video).
  if (parts[0] === "studio" || parts[0] === "sell") {
    return { type: "app", tab: "sell", view: parts[1] ? decodeURIComponent(parts[1]) : undefined };
  }
  if (parts[0] === "admin") return { type: "app", tab: "admin" };
  if (parts[0] === "owner") return { type: "app", tab: "owner" };
  if (parts[0] === "p" && parts[1]) return { type: "product", id: decodeURIComponent(parts[1]) };
  if (parts.length === 0) return { type: "landing" };
  return { type: "landing" };
}



export function tabToPath(tab) {
  if (tab === "feed") return "/feed";
  if (tab === "sell") return "/studio";
  if (tab === "admin") return "/admin";
  if (tab === "owner") return "/owner";
  return "/feed";
}
