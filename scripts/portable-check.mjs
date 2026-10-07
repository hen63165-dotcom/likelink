import fs from "node:fs";
import path from "node:path";

const required = ["package.json", "vite.config.js", "server/portable.mjs", "api"];
for (const p of required) {
  if (!fs.existsSync(path.resolve(p))) throw new Error("missing:" + p);
}
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (pkg.type !== "module") throw new Error("package must remain ESM");
console.log("portable-check: OK");
