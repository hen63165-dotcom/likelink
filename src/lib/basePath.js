// The site's public base path.
//
// The main host serves the app from "/". The GitHub Pages copy serves the same
// build from "/likelink/" (VITE_BASE in .github/workflows/deploy-frontend.yml),
// so a link to "/p/x" there must become "/likelink/p/x", or the visitor lands on
// github.io's own 404 page.
//
// Rule: routes inside the app are always written WITHOUT the base ("/p/x",
// "/discover"). Only what reaches the browser carries it: the address bar
// (pushState/replaceState) and real href attributes. parsePath always gets a
// path with the base removed.
//
// Isomorphic: in Node (tests, scripts) there is no import.meta.env, so the base
// is "" and every function is the identity.

/** "/likelink/" → "/likelink"; "/", "./", "" → "". */
export function normalizeBase(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s === "/" || s === "./" || s === ".") return "";
  const inner = s.replace(/^\.?\/+|\/+$/g, "");
  return inner ? `/${inner}` : "";
}

const RAW_BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";

/** "" on the main host, "/likelink" on the GitHub Pages copy. */
export const BASE = normalizeBase(RAW_BASE);

/** The browser's pathname → the app route ("/likelink/p/x" → "/p/x"). */
export function stripBase(pathname, base = BASE) {
  const p = String(pathname || "/");
  if (!base) return p;
  if (p === base) return "/";
  if (p.startsWith(`${base}/`)) return p.slice(base.length);
  return p;
}

/** An app route → what the browser shows ("/p/x" → "/likelink/p/x"). */
export function withBase(path, base = BASE) {
  const p = String(path ?? "");
  // Only root-relative paths: full URLs, "//host", "#hash" and "?q" pass as-is.
  if (!base || !p.startsWith("/") || p.startsWith("//")) return p;
  if (p === base || p.startsWith(`${base}/`) || p.startsWith(`${base}?`) || p.startsWith(`${base}#`)) return p;
  return `${base}${p}`;
}
