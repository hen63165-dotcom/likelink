export function parsePath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
    if (parts[0] === "u" && parts[1]) return { type: "creator", slug: decodeURIComponent(parts[1]) };
  // Platform affiliate/tracking redirect (`/r?u=...&ref=...`).
  // On the deployed Netlify build an Edge Function handles `/r` before this route
  // is hit; this only runs for the dev server and the installed PWA.
  if (parts[0] === "r") return { type: "redirect" };
  if (parts[0] === "feed") return { type: "app", tab: "feed" };
  if (parts[0] === "studio") return { type: "app", tab: "sell" };
  if (parts[0] === "admin") return { type: "app", tab: "admin" };
  if (parts.length === 0) return { type: "landing" };
  return { type: "landing" };
}

export function tabToPath(tab) {
  if (tab === "feed") return "/feed";
  if (tab === "sell") return "/studio";
  if (tab === "admin") return "/admin";
  return "/feed";
}
