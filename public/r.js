// /r — the affiliate forwarder, as a static page.
//
// The server version (api/og.mjs mode=r) runs on Vercel and, on Netlify, used
// to be proxied to the Supabase "api" function. While that project is
// restricted every /r link answered 402, so a link shared in a post, a story
// or a Telegram message led to an error page instead of the store. This page
// needs no server and no database: it reads the catalog copy the site ships
// (/snapshot/kv.json) and applies the same rule as the server:
//   • not an open redirect — it forwards only to a product link that exists in
//     the catalog (by ?pid=, or the exact stored affiliate link in ?u=);
//   • anything else gets a "you are leaving LikeLink" page, never a silent jump;
//   • a /r link that points at /r again, or a non-http link, is refused.
// No click is recorded here (the store's own affiliate dashboard still counts it).

export function decideRedirect({ search = "", origin = "", products = [] } = {}) {
  let params;
  try { params = new URLSearchParams(String(search)); } catch { return { action: "invalid" }; }
  const target = String(params.get("u") || "");
  const pid = String(params.get("pid") || "").slice(0, 80);
  const list = Array.isArray(products) ? products.filter((p) => p && typeof p === "object") : [];
  const byPid = pid ? list.find((p) => String(p.id) === pid) : null;
  const stored = byPid && /^https?:\/\//i.test(String(byPid.affiliateUrl || "")) ? String(byPid.affiliateUrl) : "";
  const raw = stored || target;
  if (!raw) return { action: "invalid" };
  let dest;
  try { dest = new URL(raw); } catch { return { action: "invalid" }; }
  if (dest.protocol !== "https:" && dest.protocol !== "http:") return { action: "invalid" };
  if (origin && dest.origin === origin && dest.pathname.replace(/\/$/, "") === "/r") return { action: "invalid" };
  const known = Boolean(stored) || list.some((p) => String(p.affiliateUrl || "") === dest.href || String(p.affiliateUrl || "") === target);
  if (!known) return { action: "confirm", url: dest.href, host: dest.hostname };
  return { action: "go", url: dest.href };
}

async function loadCatalog() {
  try {
    const res = await fetch("/snapshot/kv.json", { cache: "no-cache" });
    if (!res.ok) return [];
    const doc = await res.json();
    const list = doc?.keys?.["marketplace:products"];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function show(id) {
  for (const el of document.querySelectorAll("[data-state]")) el.hidden = el.getAttribute("data-state") !== id;
}

async function run() {
  const decision = decideRedirect({ search: location.search, origin: location.origin, products: await loadCatalog() });
  if (decision.action === "go") {
    const link = document.getElementById("go-link");
    if (link) link.href = decision.url;
    show("go");
    location.replace(decision.url);
    return;
  }
  if (decision.action === "confirm") {
    const link = document.getElementById("confirm-link");
    const host = document.getElementById("confirm-host");
    if (link) link.href = decision.url;
    if (host) host.textContent = decision.host;
    show("confirm");
    return;
  }
  show("invalid");
}

if (typeof document !== "undefined" && typeof location !== "undefined") run();
