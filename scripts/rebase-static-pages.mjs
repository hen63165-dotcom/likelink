// After `vite build` (npm "postbuild", after prerender-products.mjs): when the
// site is built for a sub-folder (VITE_BASE=/likelink/ — the GitHub Pages copy,
// .github/workflows/deploy-frontend.yml), point the plain links of the static
// pages into that folder too.
//
// Vite already rewrites the assets it knows (scripts, styles, icons) to the
// base. It does not touch <a href="/pricing">, the links inside the generated
// pricing/legal pages (public/pricing.html, public/legal/*.html) or the web app
// manifest, so on github.io those would leave /likelink/ and hit GitHub's own
// 404 page. The main host builds with base "/" and this script does nothing.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeBase, withBase } from "../src/lib/basePath.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Top-level app sections that open from a typed or shared link.
export const SPA_SECTIONS = ["discover", "products", "creators", "reels", "trends", "collections", "deals", "search", "saved", "merchants", "feed", "studio", "sell"];

/** Root-relative href/src/action attributes → inside the base folder. */
export function rebaseHtml(html, base) {
  if (!base) return html;
  return String(html).replace(/\b(href|src|action)=(["'])(\/(?!\/)[^"']*)\2/g, (_m, attr, q, path) => `${attr}=${q}${withBase(path, base)}${q}`);
}

/** start_url, scope, icons, shortcuts and share_target of a web app manifest. */
export function rebaseManifest(json, base) {
  if (!base) return json;
  const fix = (v) => (typeof v === "string" ? withBase(v, base) : v);
  const walk = (node, key) => {
    if (Array.isArray(node)) return node.map((n) => walk(n, key));
    if (node && typeof node === "object") {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v, k);
      return out;
    }
    return ["start_url", "scope", "src", "url", "action"].includes(key) ? fix(node) : node;
  };
  return walk(json, "");
}

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "assets") out.push(...htmlFiles(full));
    } else if (name.endsWith(".html")) out.push(full);
  }
  return out;
}

export function rebaseDist(dist, base) {
  if (!base || !existsSync(dist)) return { files: 0 };
  let files = 0;
  for (const file of htmlFiles(dist)) {
    const before = readFileSync(file, "utf8");
    const after = rebaseHtml(before, base);
    if (after !== before) {
      writeFileSync(file, after);
      files += 1;
    }
  }
  for (const name of ["manifest.json", "manifest.webmanifest"]) {
    const file = join(dist, name);
    if (!existsSync(file)) continue;
    writeFileSync(file, `${JSON.stringify(rebaseManifest(JSON.parse(readFileSync(file, "utf8")), base), null, 2)}\n`);
    files += 1;
  }
  // GitHub Pages answers an unknown path with 404.html: the app still opens
  // there, but with HTTP status 404, which search engines and link previews
  // treat as "no page". The public sections get the app shell as a real file
  // (/likelink/discover → discover.html, status 200). Product pages already
  // have their own files (prerender-products.mjs).
  const shell = join(dist, "index.html");
  if (existsSync(shell)) {
    for (const route of SPA_SECTIONS) {
      const file = join(dist, `${route}.html`);
      if (existsSync(file)) continue;
      copyFileSync(shell, file);
      files += 1;
    }
  }
  // GitHub Pages serves /legal/ (a folder) before legal.html: give the folder
  // the index page so /likelink/legal opens the list of documents.
  const legalIndex = join(dist, "legal.html");
  if (existsSync(legalIndex) && existsSync(join(dist, "legal")) && !existsSync(join(dist, "legal", "index.html"))) {
    copyFileSync(legalIndex, join(dist, "legal", "index.html"));
    files += 1;
  }
  return { files };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const base = normalizeBase(process.env.VITE_BASE || "/");
  const dist = join(ROOT, process.argv[2] || "dist");
  const { files } = rebaseDist(dist, base);
  console.log(base ? `rebase-static-pages: ${files} file(s) under ${base}/` : "rebase-static-pages: base is /, nothing to do");
}
