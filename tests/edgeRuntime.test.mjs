// Host-independent runtime: the unchanged api/*.mjs handlers run behind a
// Fetch-API host (Supabase Edge Functions) through edge/adapter.mjs, and a
// static host forwards /api/* to it (edge/pagesProxy.mjs). These tests pin:
//   • every top-level API function is in the edge bundle (no silent 404s)
//   • the vercel.json API rewrites resolve the same way on the edge
//   • req/res behave like the Node runtime the handlers were written for
//   • the static-host proxy forwards to the API without changing the request
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiRewrites, resolveRoute, createFetchHandler } from "../edge/adapter.mjs";
import { apiBase, upstreamUrl } from "../edge/pagesProxy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const ENTRY = readFileSync(path.join(ROOT, "edge/entry.mjs"), "utf8");

function apiFunctions(dir = "api", out = []) {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) {
      if (!name.startsWith("_")) apiFunctions(rel, out);
    } else if (/\.(mjs|js)$/.test(name)) out.push(`/${rel.replace(/\.(mjs|js)$/, "")}`);
  }
  return out;
}

test("every API function is routed by the edge bundle", () => {
  for (const fn of apiFunctions()) {
    assert.match(ENTRY, new RegExp(`"${fn}":`), `${fn} missing from edge/entry.mjs FILES`);
  }
});

const FILES = Object.fromEntries(apiFunctions().map((f) => [f, async () => {}]));
const table = apiRewrites(vercel.rewrites);
const route = (p, q = "") => resolveRoute(p, new URLSearchParams(q), table, FILES);

test("API rewrites resolve on the edge as on the old host", () => {
  assert.deepEqual([route("/api/push").file, route("/api/push").query.get("mode")], ["/api/store", "push"]);
  assert.equal(route("/functions/v1/api/store", "mode=subs").file, "/api/store");
  const r = route("/api/r", "u=https%3A%2F%2Fexample.com");
  assert.deepEqual([r.file, r.query.get("mode"), r.query.get("u")], ["/api/og", "r", "https://example.com"]);
  const d = route("/api/gpt/drafts/d_1");
  assert.deepEqual([d.file, d.query.get("op"), d.query.get("draftId")], ["/api/store", "draft", "d_1"]);
  assert.equal(route("/api/sitemap.xml").query.get("kind"), "sitemap");
  assert.equal(route("/api/nope"), null);
  // A caller can never override the mode a rewrite pins.
  assert.equal(route("/api/push", "mode=finance").query.getAll("mode").join(), "push");
  // SPA rewrites (destination "/") are the static host's business, not the API's.
  assert.equal(route("/api/studio"), null);
});

test("req/res behave like the Node serverless runtime", async () => {
  let seen;
  const handle = createFetchHandler({
    files: {
      "/api/store": async (req, res) => {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        seen = { method: req.method, url: req.url, mode: req.query.mode, body: req.body, raw: Buffer.concat(chunks).toString(), origin: req.headers.origin };
        res.setHeader("set-cookie", ["a=1", "b=2"]);
        res.status(201).json({ ok: true });
      },
      "/api/og": async (req, res) => { res.writeHead(302, { Location: "https://example.com/x" }); res.end(); },
    },
    rewrites: vercel.rewrites,
  });
  const r = await handle(new Request("https://edge.test/api/store?mode=subs", { method: "POST", headers: { origin: "https://site.test", "content-type": "application/json" }, body: '{"a":1}' }));
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { ok: true });
  assert.deepEqual(seen, { method: "POST", url: "/api/store?mode=subs", mode: "subs", body: { a: 1 }, raw: '{"a":1}', origin: "https://site.test" });
  assert.equal(r.headers.get("set-cookie"), "a=1, b=2");
  const red = await handle(new Request("https://edge.test/api/r?u=x"));
  assert.deepEqual([red.status, red.headers.get("location")], [302, "https://example.com/x"]);
  const missing = await handle(new Request("https://edge.test/api/unknown"));
  assert.equal(missing.status, 404);
});

test("a throwing handler becomes a 500 without leaking the error", async () => {
  const handle = createFetchHandler({ files: { "/api/store": async () => { throw new Error("secret detail"); } }, rewrites: [] });
  const r = await handle(new Request("https://edge.test/api/store"));
  assert.equal(r.status, 500);
  assert.doesNotMatch(await r.text(), /secret detail/);
});

test("the static-host proxy forwards to the one API", () => {
  assert.equal(apiBase({ VITE_SUPABASE_URL: "https://ref.supabase.co/" }), "https://ref.supabase.co/functions/v1");
  assert.equal(apiBase({ LIKELINK_API_BASE: "https://api.example/v1/", VITE_SUPABASE_URL: "https://ref.supabase.co" }), "https://api.example/v1");
  assert.equal(apiBase({}), "");
  const base = "https://ref.supabase.co/functions/v1";
  assert.equal(upstreamUrl(base, "https://site.test/api/store?mode=plans"), `${base}/api/store?mode=plans`);
  assert.equal(upstreamUrl(base, "https://site.test/r?u=x&pid=1"), `${base}/api/r?u=x&pid=1`);
  assert.equal(upstreamUrl(base, "https://site.test/sitemap.xml"), `${base}/api/sitemap.xml`);
});

test("the static host sends only API paths to functions", () => {
  const routes = JSON.parse(readFileSync(path.join(ROOT, "public/_routes.json"), "utf8"));
  assert.deepEqual(routes.include.slice(0, 2), ["/api/*", "/r"]);
  for (const p of routes.include) {
    const file = p === "/api/*" ? "functions/api/[[path]].js" : `functions${p}.js`;
    assert.ok(statSync(path.join(ROOT, file)).isFile(), `${file} missing for ${p}`);
  }
});
