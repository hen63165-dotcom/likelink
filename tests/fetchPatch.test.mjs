// The browser fetch patch (src/lib/supabaseClient.js) adds X-Client-Info only to the Supabase host.
// A custom header on any other cross-site GET turns it into a preflighted request, and GitHub Pages
// answers no preflight: on 26.11 the real-deal prices on /magic (and every github.io read from
// likelink2.vercel.app) were blocked by CORS because the patch added the header to every request.
import test from "node:test";
import assert from "node:assert/strict";

test("the fetch patch leaves every non-Supabase request exactly as the caller wrote it", async () => {
  const seen = [];
  const saved = { window: globalThis.window, location: globalThis.location, fetch: globalThis.fetch, url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY };
  globalThis.window = { document: {} };
  globalThis.location = { href: "https://likelink2.vercel.app/magic" };
  globalThis.fetch = async (input, init = {}) => { seen.push({ input: String(input?.url || input), headers: new Headers(init.headers) }); return new Response("{}"); };
  delete globalThis[Symbol.for("likelink.fetchPatched")];
  process.env.VITE_SUPABASE_URL = "https://vjitiuirqfysexsxdxqx.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY = "anon-test";
  try {
    await import(`../src/lib/supabaseClient.js?patch=${Date.now()}`);
    assert.notEqual(globalThis.fetch, saved.fetch, "the browser patch is installed");
    await fetch("https://hen63165-dotcom.github.io/likelink/radar/prices/84.json");
    await fetch("/api/store?mode=magic&u=x", { headers: { accept: "application/json" } });
    await fetch(new URL("https://hen63165-dotcom.github.io/likelink/radar/prices/index.json"));
    await fetch("https://vjitiuirqfysexsxdxqx.supabase.co/rest/v1/kv?select=key");
    const [pages, own, pagesUrl, cloud] = seen.slice(-4);
    assert.equal(pages.headers.has("X-Client-Info"), false, "github.io: no custom header, so no preflight");
    assert.equal(own.headers.has("X-Client-Info"), false);
    assert.equal(own.headers.get("accept"), "application/json", "the caller's own headers are kept");
    assert.equal(pagesUrl.headers.has("X-Client-Info"), false, "a URL object too");
    assert.equal(cloud.headers.get("X-Client-Info"), "supabase-js/2.x", "the Supabase host keeps its header");
  } finally {
    globalThis.window = saved.window;
    globalThis.location = saved.location;
    globalThis.fetch = saved.fetch;
    delete globalThis[Symbol.for("likelink.fetchPatched")];
    if (saved.url === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = saved.key;
  }
});
