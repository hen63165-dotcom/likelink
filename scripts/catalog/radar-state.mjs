#!/usr/bin/env node
// The radar's state, private (the owner, 2026-11-15: "כן לנעילה", stage 2). The repository and its
// releases are public, so the daily state (board, calls, readings, kits…) goes to the "radar" release
// as ONE encrypted file, state.enc (AES-256-GCM; key = sha256 of a label + RADAR_STATE_KEY when it
// exists, else AUTOPILOT_SECRET, which only the workflows have). What the public may see is written apart:
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
import { evidenceOf } from "../../src/lib/growth/radarEvidence.js";

export const STATE_FILE = "state.enc";
export const PUBLIC_FILES = ["board-public.json", "briefs-public.json", "prices-public.json", "evidence-public.json", "backtest-public.json"];
const MAGIC = "LLRS1";
export const PROBE = "https://vjitiuirqfysexsxdxqx.supabase.co/functions/v1/api/store?mode=radar-board";

export function stateKey(secret) {
  if (!secret || String(secret).length < 8) throw new Error("state key needs AUTOPILOT_SECRET");
  return createHash("sha256").update(`likelink-radar-state|${secret}`).digest();
}

// A key of its own for the state (the owner, 27.11: "not even the cleverest hacker"): the releases
// are public, so state.enc can be tested offline against guesses of whatever its key comes from. A
// long random RADAR_STATE_KEY (≥ 32 characters, a GitHub secret) separates it from the machine secret
// the workflows also send to the server. When it exists, pack writes with it; unpack tries it first,
// then the machine secret, so the first run with it moves the state over and nothing is lost.
export const STRONG_MIN = 32;
export function stateKeys(env = process.env) {
  const keys = [];
  const strong = String(env.RADAR_STATE_KEY || "").trim();
  if (strong.length >= STRONG_MIN) keys.push({ id: "state-key", key: createHash("sha256").update(`likelink-radar-state-v2|${strong}`).digest() });
  if (env.AUTOPILOT_SECRET && String(env.AUTOPILOT_SECRET).length >= 8) keys.push({ id: "machine", key: stateKey(env.AUTOPILOT_SECRET) });
  if (!keys.length) throw new Error("state key needs RADAR_STATE_KEY or AUTOPILOT_SECRET");
  return keys;
}

/** Open with the first key that authenticates (AES-GCM refuses every other). */
export function openAny(buf, keys) {
  let last = null;
  for (const k of keys) {
    try { return { files: open(buf, k.key), key: k.id }; } catch (e) { last = e; }
  }
  throw last || new Error("no key opens the radar state");
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
  const { key, id: keyId } = stateKeys(env)[0];
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
  // 🏷️ The price ledger is public on purpose (realDeal.js): store prices, and the seals that prove them.
  if (files["prices.json"]) writeFileSync(join(dir, "prices-public.json"), JSON.stringify({ ledger: JSON.parse(files["prices.json"]), seals: files["price-seals.json"] ? JSON.parse(files["price-seals.json"]) : {} }));
  // 🔎 The evidence (radarEvidence.js): every graded new-product call with the daily store readings
  // behind it, open calls too while the board is open, so anyone can check a grade without trusting us.
  if (files["fresh-calls.json"]) {
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(join(dir, "evidence-public.json"), JSON.stringify(evidenceOf({ freshCalls: JSON.parse(files["fresh-calls.json"]), items: files["items.json"] ? JSON.parse(files["items.json"]) : {}, open: isOpen, today, baseline: files["baseline.json"] ? JSON.parse(files["baseline.json"]) : null })));
  }
  return { files: names.length, open: isOpen, key: keyId };
}

export function unpack(dir, { env = process.env } = {}) {
  const p = join(dir, STATE_FILE);
  if (!existsSync(p)) return { files: 0 };
  const { files, key } = openAny(readFileSync(p), stateKeys(env));
  for (const [f, text] of Object.entries(files)) if (/^[a-z0-9-]+\.json$/.test(f)) writeFileSync(join(dir, f), text);
  return { files: Object.keys(files).length, key };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, dir = "radar-state"] = process.argv.slice(2);
  const out = cmd === "pack" ? await pack(dir) : cmd === "unpack" ? unpack(dir) : null;
  if (!out) { console.error("usage: radar-state.mjs pack|unpack <dir>"); process.exit(2); }
  console.log(`radar state ${cmd}: ${JSON.stringify(out)}`);
}
