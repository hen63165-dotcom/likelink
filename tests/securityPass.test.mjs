// The 26.11 security pass (the owner: "make sure there are no weaknesses in everything you built; fix,
// upgrade, verify"). Each test pins one fix so it cannot quietly come back.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requestOrigin } from "../api/_utils/origin.mjs";

test("a forwarded host is a host: anything else never becomes the origin written into HTML or asked by the server", () => {
  const r = (headers) => ({ headers });
  assert.equal(requestOrigin(r({ host: "likelink2.vercel.app" })), "https://likelink2.vercel.app");
  assert.equal(requestOrigin(r({ "x-forwarded-host": 'evil.com"><script>alert(1)</script>' })), "");
  assert.equal(requestOrigin(r({ "x-forwarded-host": "evil.com/path" })), "");
  assert.equal(requestOrigin(r({ "x-forwarded-proto": "javascript", host: "likelink2.vercel.app" })), "");
});

test("the server asks the app shell from our own origins only, and a creator's link through safeFetch", () => {
  const og = readFileSync("api/og.mjs", "utf8");
  assert.match(og, /const appOrigin = isApprovedOrigin\(origin\) \? origin : PRODUCTION_ORIGIN;/);
  assert.match(og, /fetch\(`\$\{appOrigin\}\/index\.html`/);
  const pw = readFileSync("api/price-watch.mjs", "utf8");
  const fn = pw.slice(pw.indexOf("async function fetchLivePrice"), pw.indexOf("async function fetchLivePrice") + 600);
  assert.match(fn, /await safeFetch\(url,/);
  assert.doesNotMatch(fn, /redirect: "follow"/);
});

test("workflows: a dispatch input reaches the shell as data (env), never as script text", () => {
  for (const [file, name] of [[".github/workflows/media-render.yml", "RENDER_LIMIT"], [".github/workflows/product-video.yml", "PRODUCT_IDS"], [".github/workflows/visual-audit.yml", "AUDIT_BASE"]]) {
    const y = readFileSync(file, "utf8");
    assert.match(y, new RegExp(`${name}: \\$\\{\\{ github\\.event\\.inputs\\.`), file);
    for (const line of y.split("\n")) {
      if (/^\s*(run:|node |printf )/.test(line)) assert.doesNotMatch(line, /\$\{\{\s*github\.event\.inputs\.(limit|products|base)/, `${file}: ${line.trim()}`);
    }
  }
  assert.match(readFileSync(".github/workflows/webpack.yml", "utf8"), /permissions:\s*\n\s*contents: read/);
});

test("dependencies: the tool with the critical tar flaw is on its fixed major version", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pkg.devDependencies["@capacitor/assets"], /^\^4\./);
});
