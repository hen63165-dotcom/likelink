export function parsePath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "u" && parts[1]) return { type: "creator", slug: decodeURIComponent(parts[1]) };
  if (parts[0] === "r") return { type: "redirect" };
  if (parts[0] === "feed") return { type: "app", tab: "feed" };
  // "studio" is canonical; "sell" is a legacy alias still used by callers
  // (e.g. FeedView's hero CTA). Both must open the seller studio.
  if (parts[0] === "studio" || parts[0] === "sell") return { type: "app", tab: "sell" };
  if (parts[0] === "admin") return { type: "app", tab: "admin" };
  if (parts[0] === "p" && parts[1]) return { type: "product", id: decodeURIComponent(parts[1]) };
  if (parts.length === 0) return { type: "landing" };
  return { type: "landing" };
}

export function tabToPath(tab) {
  if (tab === "feed") return "/feed";
  if (tab === "sell") return "/studio";
  if (tab === "admin") return "/admin";
  return "/feed";
}
