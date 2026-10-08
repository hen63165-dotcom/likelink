// Host-independent API adapter.
//
// The API handlers in api/*.mjs were written for a Node "serverless" runtime
// (req.query, req.body, res.status().json(), res.end(buffer)). This module
// runs the SAME handlers behind any Fetch-API host (Supabase Edge Functions,
// Deno, Cloudflare, Node 18+): it turns a Request into that req/res pair,
// applies the API rewrites from vercel.json, and turns the result back into a
// Response. No handler is copied or changed, so there is one implementation.
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";

/* ───────────────────────────── rewrites ───────────────────────────── */

// "/api/gpt/drafts/:draftId" → RegExp + param names. ":x*" matches the rest.
function compile(source) {
  const names = [];
  const pattern = source.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/:([A-Za-z0-9_]+)(\*)?/g, (_, name, star) => {
    names.push(name);
    return star ? "(.*)" : "([^/]+)";
  });
  return { re: new RegExp(`^${pattern}/?$`), names };
}

/** Only rewrites that land on an API function are the backend's business. */
export function apiRewrites(rewrites = []) {
  return rewrites
    .filter((r) => r && typeof r.source === "string" && typeof r.destination === "string" && r.destination.startsWith("/api/"))
    .map((r) => ({ ...r, ...compile(r.source) }));
}

/**
 * Resolve a request path to { file, query } where file is "/api/<name>".
 * The rewrite's own query params come first; the caller's params are added
 * after (a caller can never override the mode a rewrite pins).
 */
export function resolveRoute(pathname, searchParams, rewrites, files) {
  let path = pathname.replace(/^\/functions\/v1(?=\/)/, "");
  if (!path.startsWith("/api/") && path !== "/api") path = `/api${path.startsWith("/") ? "" : "/"}${path}`;
  path = path.replace(/\/+$/, "") || "/api";
  const query = new URLSearchParams();
  let target = path;
  for (const r of rewrites) {
    // Rewrites are written against the public path ("/r", "/api/push", …).
    const candidates = [path, path.replace(/^\/api(?=\/)/, "")];
    const hit = candidates.map((c) => r.re.exec(c)).find(Boolean);
    if (!hit) continue;
    let dest = r.destination;
    r.names.forEach((name, i) => { dest = dest.split(`:${name}`).join(encodeURIComponent(decodeURIComponent(hit[i + 1] || ""))); });
    const [destPath, destQuery = ""] = dest.split("?");
    target = destPath;
    for (const [k, v] of new URLSearchParams(destQuery)) query.append(k, v);
    break;
  }
  for (const [k, v] of searchParams) if (!query.has(k)) query.append(k, v);
  return files[target] ? { file: target, query } : null;
}

/* ─────────────────────────────── req/res ─────────────────────────────── */

function queryObject(params) {
  const out = {};
  for (const [k, v] of params) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

function parseBody(raw, contentType) {
  if (!raw.length) return undefined;
  const ct = String(contentType || "").toLowerCase();
  const text = () => raw.toString("utf8");
  if (ct.includes("application/json")) {
    try { return JSON.parse(text()); } catch { return undefined; }
  }
  if (ct.includes("application/x-www-form-urlencoded")) return queryObject(new URLSearchParams(text()));
  if (ct.startsWith("text/")) return text();
  return raw;
}

/** A Node-style request: a readable stream of the raw body plus the usual fields. */
export function makeReq(request, { url, query, raw, ip }) {
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  if (ip && !headers["x-forwarded-for"]) headers["x-forwarded-for"] = ip;
  const req = Readable.from(raw.length ? [raw] : []);
  Object.assign(req, {
    method: request.method,
    url,
    headers,
    query: queryObject(query),
    body: parseBody(raw, headers["content-type"]),
    rawBody: raw,
    socket: { remoteAddress: ip || "" },
    connection: { remoteAddress: ip || "" },
  });
  return req;
}

/** A Node/Vercel-style response that collects what the handler writes. */
export function makeRes() {
  const headers = new Map();
  const chunks = [];
  let done;
  const finished = new Promise((resolve) => { done = resolve; });
  const listeners = {};
  const toBuf = (c) => (c == null ? null : Buffer.isBuffer(c) ? c : c instanceof Uint8Array ? Buffer.from(c) : Buffer.from(String(c)));
  const res = {
    statusCode: 200,
    statusMessage: "",
    headersSent: false,
    writableEnded: false,
    finished: false,
    setHeader(k, v) { headers.set(String(k).toLowerCase(), v); return res; },
    getHeader(k) { return headers.get(String(k).toLowerCase()); },
    getHeaders() { return Object.fromEntries(headers); },
    hasHeader(k) { return headers.has(String(k).toLowerCase()); },
    removeHeader(k) { headers.delete(String(k).toLowerCase()); },
    writeHead(code, msg, hdrs) {
      res.statusCode = code;
      const h = typeof msg === "object" && msg ? msg : hdrs;
      if (h) for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
      return res;
    },
    status(code) { res.statusCode = code; return res; },
    json(obj) {
      if (!res.hasHeader("content-type")) res.setHeader("content-type", "application/json; charset=utf-8");
      return res.end(JSON.stringify(obj));
    },
    send(body) {
      if (body && typeof body === "object" && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) return res.json(body);
      if (typeof body === "string" && !res.hasHeader("content-type")) res.setHeader("content-type", "text/html; charset=utf-8");
      return res.end(body);
    },
    redirect(a, b) {
      const [code, loc] = typeof a === "number" ? [a, b] : [307, a];
      res.statusCode = code;
      res.setHeader("location", loc);
      return res.end();
    },
    write(chunk) { const b = toBuf(chunk); if (b) chunks.push(b); res.headersSent = true; return true; },
    end(chunk) {
      if (res.writableEnded) return res;
      const b = typeof chunk === "function" ? null : toBuf(chunk);
      if (b) chunks.push(b);
      res.headersSent = true;
      res.writableEnded = true;
      res.finished = true;
      done();
      (listeners.finish || []).forEach((fn) => { try { fn(); } catch { /* listener */ } });
      return res;
    },
    on(evt, fn) { (listeners[evt] ||= []).push(fn); return res; },
    once(evt, fn) { return res.on(evt, fn); },
    flushHeaders() {},
  };
  res.done = finished;
  res.toResponse = () => {
    const h = new Headers();
    for (const [k, v] of headers) {
      for (const one of [].concat(v)) h.append(k, String(one));
    }
    const status = res.statusCode || 200;
    const noBody = status === 204 || status === 304 || status === 101;
    return new Response(noBody ? null : Buffer.concat(chunks), { status, headers: h });
  };
  return res;
}

/* ─────────────────────────────── handler ─────────────────────────────── */

/**
 * Build a fetch handler from { "/api/store": handlerFn, … } and the
 * vercel.json rewrites. `timeoutMs` bounds a handler that never ends.
 */
export function createFetchHandler({ files, rewrites = [], timeoutMs = 140_000, cors = null } = {}) {
  const table = apiRewrites(rewrites);
  return async function handle(request, info = {}) {
    const url = new URL(request.url);
    const route = resolveRoute(url.pathname, url.searchParams, table, files);
    if (!route) {
      return new Response(JSON.stringify({ ok: false, error: "api_not_found" }), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } });
    }
    const raw = request.method === "GET" || request.method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
    const ip = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || info?.remoteAddr?.hostname || "";
    const qs = route.query.toString();
    const req = makeReq(request, { url: `${route.file}${qs ? `?${qs}` : ""}`, query: route.query, raw, ip });
    const res = makeRes();
    let timer;
    try {
      await Promise.race([
        (async () => { await files[route.file](req, res); if (!res.writableEnded) await res.done; })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("handler_timeout")), timeoutMs); }),
      ]);
    } catch (e) {
      if (!res.writableEnded) {
        console.error("[edge-api]", route.file, e?.message || e);
        res.statusCode = String(e?.message) === "handler_timeout" ? 504 : 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: res.statusCode === 504 ? "timeout" : "internal_error" }));
      }
    } finally {
      clearTimeout(timer);
    }
    const response = res.toResponse();
    if (cors) cors(request, response);
    return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  };
}
