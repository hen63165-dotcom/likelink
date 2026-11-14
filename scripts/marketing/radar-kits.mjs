// The promotion kits page (the owner's Master Execution Order, item 3): every product the trend
// radar keeps (src/lib/growth/alpha.js kitOf, written daily to briefs.json on the "radar" release)
// as one card — the 3-second hooks (A/B/C), the script, the title and caption with the disclosure
// first, the comment call to action, the storyboard locked to the store's own photos, the exact
// tracked link per channel, and why external posting is blocked. A HALTED kit says what is missing.
// Nothing is posted from here; the page is noindex (it is the owner's worksheet).
//   node scripts/marketing/radar-kits.mjs <briefs.json> <out-dir>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STORE_IMG = /^https:\/\/([a-z0-9-]+\.)*(aliexpress-media\.com|alicdn\.com)\/\S+$/i;
const SITE = /^https:\/\/likelink2\.vercel\.app\/p\/[\w-]+\?[\w=&%.-]+$/;
const safeImg = (u) => (STORE_IMG.test(String(u || "")) ? String(u) : "");
const safeLink = (u) => (SITE.test(String(u || "")) ? String(u) : "");

function card(k) {
  if (k.status === "HALTED") {
    return `<article class="k halted"><h2>${esc(k.productId)}</h2><p class="st">נעצר: חסר מידע מאומת</p><ul>${(k.flags || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul></article>`;
  }
  const v = (k.variants || []).map((x) => `<section class="v"><h3>גרסה ${esc(String(x.variant).toUpperCase())} · ${esc(x.hookType)}</h3>
<p class="hook">${esc(x.hook3s)}</p>
<p><b>כותרת:</b> ${esc(x.title)}</p>
<ol>${(x.script || []).map((l) => `<li>${esc(l)}</li>`).join("")}</ol>
<pre>${esc(x.caption)}</pre>
<p class="ln">${safeLink(x.link) ? `<a href="${esc(x.link)}">${esc(x.link)}</a>` : "—"}</p></section>`).join("");
  const sb = (k.storyboard || []).map((s) => `<figure>${safeImg(s.photo) ? `<img src="${esc(s.photo)}" alt="" loading="lazy">` : ""}<figcaption>${esc(s.t)} · ${esc(s.shot)}</figcaption></figure>`).join("");
  const q = (k.queue || []).map((x) => `<tr><td>${esc(x.he)}</td><td>${esc(x.slot)}</td><td>${esc(x.status)}</td><td>${esc(x.autopost)}</td><td>${safeLink(x.link) ? `<a href="${esc(x.link)}">קישור</a>` : "—"}</td></tr>`).join("");
  return `<article class="k"><h2>${esc(k.productId)}</h2>
<p class="st">טיוטה לאישור שלך · ${esc(String(k.createdAt || "").slice(0, 10))}${Number.isFinite(k.alpha) ? ` · Alpha ${esc(k.alpha)} (ודאות ${esc(Math.round((k.confidence || 0) * 100))}%)` : " · Alpha: אין ציון עדיין"}</p>
<p><b>קריאה לתגובה:</b> ${esc(k.cta)}</p>
<p class="lock">${esc(k.lock)}</p>
<p><b>וידאו:</b> ${esc(k.video)}</p>
<div class="sb">${sb}</div>${v}
<table><thead><tr><th>ערוץ</th><th>שעה</th><th>מצב</th><th>פרסום אוטומטי</th><th>קישור</th></tr></thead><tbody>${q}</tbody></table></article>`;
}

export function kitsPage(doc) {
  const kits = Array.isArray(doc?.briefs) ? doc.briefs : [];
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>ערכות קידום מהרדאר | LikeLink2</title>
<style>:root{color-scheme:light dark;--bg:#fff;--fg:#111;--mut:#555;--line:#ddd;--sky:#e8f4fd}@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#eee;--mut:#aaa;--line:#333;--sky:#0f2a40}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:16px}
.k{border:1px solid var(--line);border-radius:14px;padding:16px;margin:16px 0}.halted{opacity:.8}.st{color:var(--mut)}.lock{background:var(--sky);padding:8px 12px;border-radius:8px}
.hook{font-size:1.2em;font-weight:700}.v{border-top:1px solid var(--line);margin-top:12px}pre{white-space:pre-wrap;background:var(--sky);padding:8px;border-radius:8px;font:inherit}
.ln{overflow-wrap:anywhere;font-size:.85em}.sb{display:flex;gap:8px;overflow-x:auto}figure{margin:0;min-width:120px;max-width:140px}figure img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px}figcaption{font-size:.75em;color:var(--mut)}
table{width:100%;border-collapse:collapse;font-size:.85em;margin-top:12px;display:block;overflow-x:auto}td,th{border:1px solid var(--line);padding:4px 6px;text-align:start}</style></head>
<body><main><h1>ערכות קידום למוצרים החמים</h1>
<p>${esc(doc?.status || "")} · עודכן ${esc(String(doc?.at || "").slice(0, 16).replace("T", " "))} · מוכנות ${esc(doc?.ready ?? 0)} · נעצרו ${esc(doc?.halted ?? 0)}</p>
<p>כל ערכה נבנית רק מהתמונות, המחיר והשם של החנות. שום דבר לא מתפרסם מכאן. פרסום אוטומטי חסום עד שיתווספו החיבורים שכתובים בטבלה ועד האישור שלך לכל פוסט.</p>
${kits.length ? kits.map(card).join("\n") : "<p>אין עדיין מוצר שהרדאר שומר. הרשימה תתמלא כשיצטברו מספיק מדידות.</p>"}
</main></body></html>`;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const [src = "dist/radar/briefs.json", out = "dist/radar/kits"] = process.argv.slice(2);
  const doc = existsSync(src) ? JSON.parse(readFileSync(src, "utf8")) : null;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), kitsPage(doc));
  console.log(`radar kits: ${doc ? (doc.briefs || []).length : 0} kits → ${out}/index.html`);
}
