// Build the host-independent API bundle: edge/dist/api.mjs.
// One ESM file with every API handler, runnable on Deno (Supabase Edge
// Functions) or Node 18+. Node built-ins stay external as "node:*" imports.
import { build } from "esbuild";
import { builtinModules } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// The canonical public origin (src/constants/domain.js). On a Fetch host the
// request host is the API's own domain, so links must not be derived from it.
const { PRODUCTION_ORIGIN } = await import("../../src/constants/domain.js");

const builtins = new Set(builtinModules.flatMap((m) => [m, m.split("/")[0]]));
const nodePrefix = {
  name: "node-prefix",
  setup(b) {
    b.onResolve({ filter: /^[a-z_]+(\/[a-z_]+)?$/ }, (args) => (builtins.has(args.path) ? { path: `node:${args.path}`, external: true } : undefined));
    b.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
  },
};

// Runs before any bundled module: Node globals for Deno, CommonJS require for
// bundled CJS packages, and the Supabase-provided env names the handlers read.
const banner = `
import __process from "node:process";
import { Buffer as __Buffer } from "node:buffer";
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);
globalThis.process ??= __process;
globalThis.Buffer ??= __Buffer;
try {
  const e = globalThis.process.env;
  if (!e.VITE_SUPABASE_URL && e.SUPABASE_URL) e.VITE_SUPABASE_URL = e.SUPABASE_URL;
  if (!e.VITE_SUPABASE_ANON_KEY && e.SUPABASE_ANON_KEY) e.VITE_SUPABASE_ANON_KEY = e.SUPABASE_ANON_KEY;
  if (!e.PUBLIC_ORIGIN) e.PUBLIC_ORIGIN = ${JSON.stringify(PRODUCTION_ORIGIN)};
} catch { /* read-only env */ }
`.trim();

const out = "edge/dist/api.mjs";
await build({
  entryPoints: ["edge/entry.mjs"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  conditions: ["import", "node", "default"],
  target: "es2022",
  outfile: out,
  minify: true,
  legalComments: "none",
  banner: { js: banner },
  plugins: [nodePrefix],
  logLevel: "warning",
});
const bytes = readFileSync(out);
const sha = createHash("sha256").update(bytes).digest("hex");
writeFileSync("edge/dist/api.sha256", `${sha}\n`);
console.log(`built ${out} ${(bytes.length / 1024).toFixed(0)} KB sha256=${sha.slice(0, 16)}`);
