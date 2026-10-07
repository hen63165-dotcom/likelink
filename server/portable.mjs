import http from "node:http";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

const route = async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;

  // Static Vite build is served by the hosting layer in production.
  // API handlers remain provider-neutral Node modules; this adapter supplies
  // the small req/res surface they already use.
  if (!pathname.startsWith("/api/")) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }

  const candidates = [
    pathname.replace(/^\/api\//, "api/"),
    pathname.replace(/^\/api\//, "api/") + ".mjs",
  ];
  let file = null;
  for (const candidate of candidates) {
    try {
      const mod = await import(pathToFileURL(process.cwd() + "/" + candidate).href);
      file = mod.default;
      break;
    } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
    }
  }
  if (typeof file !== "function") {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "api_not_found" }));
    return;
  }
  await file(req, res);
};

const server = createServer((req, res) => {
  Promise.resolve(route(req, res)).catch((error) => {
    console.error("[portable-runtime]", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
    }
    res.end(JSON.stringify({ ok: false, error: "internal_error" }));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`LikeLink portable API listening on ${HOST}:${PORT}`);
});
