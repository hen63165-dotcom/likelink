// Shared chrome for the generated static pages (public/pricing.html,
// public/legal/*.html): RTL Hebrew, light/dark tokens, skip link, visible
// focus, footer with the legal pack. Pure string templates — no browser
// globals — so scripts/generate-static-pages.mjs and the tests can render
// exactly the same HTML.
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import { LEGAL_DOCS, legalPath } from "../legal/catalog.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
:root{--bg:#f7f6f3;--surface:#fff;--ink:#1d1c1a;--muted:#5f5b54;--line:#e3dfd8;--accent:#8a2f5a;--accent-ink:#fff;--soon:#6b5a1e;--soon-bg:#f6efd6;--ok:#1f6b45;--focus:#1a5fb4}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121212;--surface:#1c1c1c;--ink:#f1efe9;--muted:#b3aea5;--line:#34322e;--accent:#e58ab3;--accent-ink:#1b0b13;--soon:#f0d98a;--soon-bg:#3a3220;--ok:#7fd6a6;--focus:#8ab4ff}}
:root[data-theme="dark"]{--bg:#121212;--surface:#1c1c1c;--ink:#f1efe9;--muted:#b3aea5;--line:#34322e;--accent:#e58ab3;--accent-ink:#1b0b13;--soon:#f0d98a;--soon-bg:#3a3220;--ok:#7fd6a6;--focus:#8ab4ff}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI","Noto Sans Hebrew",Arial,system-ui,sans-serif;line-height:1.7;font-size:16px}
a{color:var(--accent)}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:4px}
.skip{position:absolute;inset-inline-start:-9999px;top:0;background:var(--surface);padding:8px 12px}
.skip:focus{inset-inline-start:8px;z-index:10}
header.top{border-bottom:1px solid var(--line);background:var(--surface)}
header.top .in{max-width:1080px;margin:0 auto;padding:14px 16px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.brand{font-weight:800;font-size:18px;color:var(--ink);text-decoration:none}
nav.top a{margin-inline-start:14px;font-size:15px}
main{max-width:1080px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:clamp(24px,4vw,32px);line-height:1.3;margin:0 0 8px}
h2{font-size:20px;margin:36px 0 10px}
h3{font-size:17px;margin:22px 0 6px}
.lead{color:var(--muted);max-width:720px;margin:0 0 24px}
.meta{color:var(--muted);font-size:14px}
.note{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:16px 0}
footer.site{border-top:1px solid var(--line);background:var(--surface)}
footer.site .in{max-width:1080px;margin:0 auto;padding:24px 16px 40px;font-size:14px;color:var(--muted)}
footer.site ul{list-style:none;padding:0;margin:0 0 14px;display:flex;flex-wrap:wrap;gap:6px 18px}
`;

/** Footer with every legal document — the same list the app links to. */
export function footerHtml() {
  const links = LEGAL_DOCS.map((d) => `<li><a href="${legalPath(d.slug)}">${esc(d.short)}</a></li>`).join("");
  return `<footer class="site"><div class="in"><nav aria-label="מסמכים משפטיים"><ul>${links}<li><a href="/pricing">מסלולים ומחירים</a></li></ul></nav>
<p>© 2026 LikeLink. כל הזכויות שמורות. אין להעתיק, לשכפל או לאסוף באופן אוטומטי (scraping) תוכן מהאתר, כמפורט ב<a href="${legalPath("acceptable-use")}">מדיניות השימוש ההוגן</a>.</p></div></footer>`;
}

export function pageShell({ title, description, path, body, extraCss = "", jsonLd = null, dataJson = null }) {
  const canonical = `${PRODUCTION_ORIGIN}${path}`;
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:type" content="website">
<meta name="color-scheme" content="light dark">
<style>${CSS}${extraCss}</style>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
${dataJson ? `<script type="application/json" id="likelink-data">${JSON.stringify(dataJson).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
<a class="skip" href="#main">דילוג לתוכן</a>
<header class="top"><div class="in"><a class="brand" href="/">LikeLink</a><nav class="top" aria-label="ראשי"><a href="/studio">לסטודיו</a><a href="/pricing">מסלולים</a><a href="/legal">מסמכים משפטיים</a></nav></div></header>
<main id="main">
${body}
</main>
${footerHtml()}
</body>
</html>
`;
}
