#!/usr/bin/env node
// The radar's state, private (the owner, 2026-11-15: "כן לנעילה", stage 2). The repository and its
// releases are public, so the daily state (board, calls, readings, kits…) goes to the "radar" release
// as ONE encrypted file, state.enc (AES-256-GCM; key = sha256 of a label + AUTOPILOT_SECRET, which
// only the workflows have). What the public may see is written apart:
//   board-public.json  the full board while the server says the trial is open (GET mode=radar-board
//                      answers 200 without a session), else the teaser (radarGate.teaserBoard);
//   briefs-public.json the promotion kits, only while open.
// Unreachable server → locked (never leak). Usage:
//   node scripts/catalog/radar-state.mjs pack <dir>     → <dir>/state.enc + the public files
//   node scripts/catalog/radar-state.mjs unpack <dir>   ← <dir>/state.enc (no file: nothing to do)
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { teaserBoard } from "../../src/lib/growth/radarGate.js";

export const STATE_FILE = "state.enc";
export const PUBLIC_FILES = ["board-public.json", "briefs-public.json"];
const MAGIC = "LLRS1";
export const PROBE = "https://vjitiuirqfysexsxdxqx.supabase.co/functions/v1/api/store?mode=radar-board";

export function stateKey(secret) {
  if (!secret || String(secret).length < 8) throw new Error("state key needs AUTOPILOT_SECRET");
  return createHash("sha256").update(`likelink-radar-state|${secret}`).digest();
}

export function seal(files, key) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(Buffer.from(JSON.stringify(files), "utf8")), c.final()]);
  return Buffer.concat([Buffer.from(MAGIC), iv, c.getAuthTag(), body]);
}

export function open(buf, key) {
  if (buf.subarray(0, MAGIC.length).toString() !== MAGIC) throw new Error("not a radar state file");
  const iv = buf.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = buf.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(buf.subarray(MAGIC.length + 28)), d.final()]).toString("utf8"));
}

/** Open (200 without a session) or locked (anything else, a failure included). */
export async function probeOpen({ fetchImpl = globalThis.fetch, url = PROBE } = {}) {
  try {
    const res = await fetchImpl(url, { headers: { origin: "https://likelink2.vercel.app" }, signal: AbortSignal.timeout(20_000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function pack(dir, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const key = stateKey(env.AUTOPILOT_SECRET);
  const names = readdirSync(dir).filter((f) => f.endsWith(".json") && !PUBLIC_FILES.includes(f));
  const files = Object.fromEntries(names.map((f) => [f, readFileSync(join(dir, f), "utf8")]));
  const enc = seal(files, key);
  // Round trip before anything public changes: the archive must open to the same files.
  const back = open(enc, key);
  if (Object.keys(back).length !== names.length || names.some((f) => back[f] !== files[f])) throw new Error("state round trip failed");
  writeFileSync(join(dir, STATE_FILE), enc);
  const isOpen = await probeOpen({ fetchImpl });
  const board = files["board.json"] ? JSON.parse(files["board.json"]) : null;
  if (board) writeFileSync(join(dir, "board-public.json"), JSON.stringify(isOpen ? board : teaserBoard(board)));
  if (isOpen && files["briefs.json"]) writeFileSync(join(dir, "briefs-public.json"), files["briefs.json"]);
  return { files: names.length, open: isOpen };
}

export function unpack(dir, { env = process.env } = {}) {
  const p = join(dir, STATE_FILE);
  if (!existsSync(p)) return { files: 0 };
  const files = open(readFileSync(p), stateKey(env.AUTOPILOT_SECRET));
  for (const [f, text] of Object.entries(files)) if (/^[a-z0-9-]+\.json$/.test(f)) writeFileSync(join(dir, f), text);
  return { files: Object.keys(files).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, dir = "radar-state"] = process.argv.slice(2);
  const out = cmd === "pack" ? await pack(dir) : cmd === "unpack" ? unpack(dir) : null;
  if (!out) { console.error("usage: radar-state.mjs pack|unpack <dir>"); process.exit(2); }
  console.log(`radar state ${cmd}: ${JSON.stringify(out)}`);
}
