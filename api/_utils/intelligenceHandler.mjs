import { verifyToken } from "./authVerify.js";
import { applyCors } from "./cors.js";
import { intelligenceStore } from "./intelligenceStore.mjs";
import { createIntelligenceCore } from "./intelligenceCore.mjs";
import { creatorContext } from "./intelligenceContext.mjs";

const codes = { UNAUTHENTICATED: 401, INVALID_TASK: 400, INVALID_CONTENT: 400,
  INVALID_CONTEXT: 400, INVALID_REQUEST: 400, REQUEST_TOO_LARGE: 413,
  VERSION_CONFLICT: 409, RATE_LIMITED: 429, BLOCKED_BY_STORAGE: 503 };
async function limitedBody(req) {
  if (Number(req.headers?.["content-length"]) > 16000) throw new Error("REQUEST_TOO_LARGE");
  let raw;
  if (req.body !== undefined) raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  else {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk); size += buffer.length;
      if (size > 16000) throw new Error("REQUEST_TOO_LARGE");
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.byteLength(raw || "") > 16000) throw new Error("REQUEST_TOO_LARGE");
  try { return JSON.parse(raw); } catch { throw new Error("INVALID_REQUEST"); }
}

// Mounted on existing /api/store?mode=intelligence — no additional function.
export function createIntelligenceHandler({ verify = verifyToken, store = intelligenceStore(), core } = {}) {
  core ||= createIntelligenceCore({ store });
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.method === "OPTIONS") { applyCors(res, req); return res.status(204).end(); }
      applyCors(res, req);
      if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
      const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
      const user = token ? await verify(token) : null;
      if (!user?.id) throw new Error("UNAUTHENTICATED");
      const body = await limitedBody(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_REQUEST");
      // Tenant is always the verified Auth identity. Never accept client owner IDs.
      if (body.owner || body.userId || body.creatorId) throw new Error("INVALID_REQUEST");
      if (body.action === "inspect") {
        const state = await store.read(user.id);
        return res.status(200).json({ ok: true, version: state.version,
          memory: creatorContext(state.memory), jobs: state.jobs || [] });
      }
      if (body.action === "memory") {
        if (!Number.isInteger(body.version) || body.version < 0) throw new Error("INVALID_REQUEST");
        const memory = creatorContext(body.memory);
        const state = await store.read(user.id);
        if (state.version !== body.version) throw new Error("VERSION_CONFLICT");
        const next = await store.write(user.id, state.version, { ...state,
          version: state.version + 1, memory: { ...memory, creator: user.id, updatedAt: new Date().toISOString() } });
        return res.status(200).json({ ok: true, version: next.version, memory: next.memory });
      }
      if (body.action !== "run") throw new Error("INVALID_REQUEST");
      const result = await core.run(user.id, body.task);
      return res.status(200).json(result);
    } catch (e) {
      const code = codes[e.message] ? e.message : "CLOUD_UNAVAILABLE";
      return res.status(codes[code] || 503).json({ ok: false, error: code });
    }
  };
}
export const intelligenceHandler = createIntelligenceHandler();
