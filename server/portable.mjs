import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const file = path.normalize(path.join(DIST, decoded.replace(/^[/\\]+/, "")));
  return file.startsWith(DIST + path.sep) || file === DIST ? file : null;
}

async function apiRoute(req, res, pathname) {
  const candidates = [
    pathname.replace(/^\/api\//, "api/"),
    pathname.replace(/^\/api\//, "api/") + ".mjs",
  ];
  for (const candidate of candidates) {
    try {
      const mod = await import(pathToFileURL(path.join(ROOT, candidate)).href);
      if (typeof mod.default !== "function") continue;
      return await mod.default(req, res);
    } catch (e) {
      if (e?.code === "ERR_MODULE_NOT_FOUND") continue;
      throw e;
    }
  }
  res.statusCode = 404;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: false, error: "api_not_found" }));
}

function sendFile(res, file) {
  const stat = fs.statSync(file);
  res.statusCode = 200;
  res.setHeader("content-type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
  res.setHeader("content-length", String(stat.size));
  fs.createReadStream(file).pipe(res);
}

async function route(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) return apiRoute(req, res, pathname);

  const direct = safePath(pathname);
  if (direct && fs.existsSync(direct) && fs.statSync(direct).isFile()) return sendFile(res, direct);

  // SPA fallback: public client routes resolve to the built index.
  const index = path.join(DIST, "index.html");
  if (fs.existsSync(index)) return sendFile(res, index);

  res.statusCode = 503;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("LikeLink runtime is built but dist/index.html is missing");
}

const server = http.createServer((req, res) => {
  Promise.resolve(route(req, res)).catch((error) => {
    console.error("[portable-runtime]", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ ok: false, error: "internal_error" }));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`LikeLink portable runtime listening on ${HOST}:${PORT}`);
});
