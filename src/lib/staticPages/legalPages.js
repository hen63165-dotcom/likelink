// public/legal/<slug>.html + public/legal.html (the index), rendered from
// src/lib/legal/documents.js. Clauses are numbered n.m like a standard
// Israeli legal document; every page carries its version and last update.
import { getLegalDocuments } from "../legal/documents.js";
import { LEGAL_VERSION, LEGAL_LAST_UPDATED, legalPath } from "../legal/catalog.js";
import { pageShell, esc } from "./layout.js";

// Texts are authored in this repo; they may contain our own <a> links and
// <strong>, nothing else. Everything else is escaped.
function safeInline(html) {
  return esc(html)
    .replace(/&lt;a href=&quot;(\/[a-z0-9\-\/?=&;.#]*)&quot;&gt;/gi, (_m, href) => `<a href="${href.replace(/&amp;/g, "&amp;")}">`)
    .replace(/&lt;\/a&gt;/g, "</a>")
    .replace(/&lt;(\/?)strong&gt;/g, "<$1strong>");
}

function clauseHtml(clause, number) {
  if (typeof clause === "string") return `<li id="s${number}"><span class="num">${number}</span> ${safeInline(clause)}</li>`;
  const items = (clause.items || []).map((i) => `<li>${safeInline(i)}</li>`).join("");
  return `<li id="s${number}"><span class="num">${number}</span> ${safeInline(clause.text)}<ul>${items}</ul></li>`;
}

const EXTRA_CSS = `
article.legal{max-width:760px}
.toc{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:18px 0}
.toc ol{margin:0;padding-inline-start:20px;columns:2;column-gap:28px}
@media (max-width:640px){.toc ol{columns:1}}
ol.clauses{list-style:none;padding:0;margin:0}
ol.clauses>li{margin:8px 0}
ol.clauses ul{margin:6px 0 0;padding-inline-start:22px}
.num{font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;margin-inline-end:4px}
.docs{list-style:none;padding:0;display:grid;gap:10px}
.docs a{display:block;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 16px;text-decoration:none;font-weight:600}
`;

export function renderLegalDocument(doc) {
  const toc = doc.sections.map((s, i) => `<li><a href="#s${i + 1}">${esc(s.title)}</a></li>`).join("");
  const sections = doc.sections.map((s, i) => {
    const n = i + 1;
    const clauses = s.clauses.map((c, j) => clauseHtml(c, `${n}.${j + 1}`)).join("\n");
    return `<section aria-labelledby="h${n}"><h2 id="h${n}"><span id="s${n}"></span>${n}. ${esc(s.title)}</h2>\n<ol class="clauses">\n${clauses}\n</ol></section>`;
  }).join("\n");
  const body = `<article class="legal">
<p class="meta">גרסה ${esc(doc.version)} · עודכן לאחרונה: ${esc(doc.lastUpdated)}</p>
<h1>${esc(doc.title)}</h1>
<p class="lead">${safeInline(doc.intro)}</p>
<nav class="toc" aria-label="תוכן העניינים"><ol>${toc}</ol></nav>
${sections}
<p class="note">מסמך זה הוא חלק מ<a href="/legal">המסמכים המשפטיים של LikeLink</a>. אם יש סתירה בין עמוד זה לבין דין שאי אפשר להתנות עליו, הדין גובר.</p>
</article>`;
  return pageShell({
    title: `${doc.title} · LikeLink`,
    description: `${doc.title} של LikeLink — גרסה ${doc.version}.`,
    path: legalPath(doc.slug),
    body,
    extraCss: EXTRA_CSS,
  });
}

export function renderLegalIndex(docs = getLegalDocuments()) {
  const list = docs.map((d) => `<li><a href="${legalPath(d.slug)}">${esc(d.title)}</a></li>`).join("\n");
  const body = `<h1>מסמכים משפטיים</h1>
<p class="lead">כל המסמכים שחלים על השימוש ב-LikeLink. גרסה ${esc(LEGAL_VERSION)}, עודכנו לאחרונה ב-${esc(LEGAL_LAST_UPDATED)}.</p>
<ul class="docs">
${list}
</ul>`;
  return pageShell({ title: "מסמכים משפטיים · LikeLink", description: "תנאי השימוש, מדיניות הפרטיות, הביטולים, הגילוי הנאות והנגישות של LikeLink.", path: "/legal", body, extraCss: EXTRA_CSS });
}

/** { "legal.html": …, "legal/terms.html": …, … } */
export function renderLegalPages() {
  const docs = getLegalDocuments();
  const out = { "legal.html": renderLegalIndex(docs) };
  for (const d of docs) out[`legal/${d.slug}.html`] = renderLegalDocument(d);
  return out;
}
