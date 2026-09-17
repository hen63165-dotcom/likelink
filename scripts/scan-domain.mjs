// Read-only scanner: reports every source reference to a hardcoded legacy domain.
// Usage: node scripts/scan-domain.mjs [needle]
import fs from "node:fs";
import path from "node:path";

const needle = process.argv[2] || "likelink.com";
const SKIP = new Set(["node_modules", ".git", "dist", ".vercel", "coverage"]);
const EXTS = /\.(js|jsx|mjs|cjs|ts|tsx|html|json|txt|xml|css|md|yml|yaml)$/i;
const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!EXTS.test(entry.name)) continue;
    let content;
    try { content = fs.readFileSync(full, "utf8"); } catch { continue; }
    content.split(/\r?\n/).forEach((line, i) => {
      if (line.includes(needle)) {
        hits.push(`${path.relative(process.cwd(), full).replace(/\\/g, "/")}:${i + 1}: ${line.trim().slice(0, 180)}`);
      }
    });
  }
}

walk(process.cwd());
if (hits.length === 0) {
  console.log(`NO_MATCHES for "${needle}"`);
} else {
  console.log(hits.join("\n"));
}
console.log(`TOTAL=${hits.length}`);