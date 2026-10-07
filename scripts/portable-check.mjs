import fs from "node:fs";
import path from "node:path";

const required = ["package.json", "vite.config.js", "server/portable.mjs", "api"];
for (const p of required) {
  if (!fs.existsSync(path.resolve(p))) throw new Error("missing:" + p);
}
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (pkg.type !== "module") throw new Error("package must remain ESM");
if (pkg.scripts?.start !== "node server/portable.mjs") throw new Error("start script must use portable runtime");
const server = fs.readFileSync("server/portable.mjs", "utf8");
for (const forbidden of ["vercel.app", "VERCEL_", "@vercel/"]) {
  if (server.includes(forbidden)) throw new Error("portable runtime contains provider-specific reference:" + forbidden);
}
console.log("portable-check: OK");
