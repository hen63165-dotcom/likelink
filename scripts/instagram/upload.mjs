#!/usr/bin/env node
/**
 * Instagram Reels publisher — Meta Graph API (LikeLink2, auto-poster).
 *
 * Publishes one or more rendered Luna reels to the owner's Instagram
 * Business account via the Facebook Graph API "Instagram Content
 * Publishing" endpoint:
 *
 *   POST   https://graph.facebook.com/v21.0/{account-id}/media
 *   GET    https://graph.facebook.com/v21.0/{media-id}?fields=...&access_token
 *
 * Env / GitHub Actions repository secrets (READ ONLY, nothing printed):
 *   INSTAGRAM_ACCOUNT_ID   Instagram Business / Page numeric ID
 *   INSTAGRAM_ACCESS_TOKEN Long-lived Page Access Token with
 *                          instagram_business_content_publish (60-day)
 * Legacy (kept for compat with viral-reel.yml): IG_ACCESS_TOKEN
 *
 * Exit codes: 0 = deferred (no secrets configured, non-blocking) or
 * published; 1 = publish failed. Reels processing is polled up to ~5 min.
 *
 * Usage:
 *   node scripts/instagram/upload.mjs --manifest out/luna-reels/manifest.json
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, "..", "..");
const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_CAPTION = 2200;
const POLL_MS = 5000;
const MAX_POLLS = 60;

const REQUIRED = ["INSTAGRAM_ACCOUNT_ID", "INSTAGRAM_ACCESS_TOKEN"];

function parseArgs(argv) {
  const out = { mp4s: [], manifest: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--mp4") out.mp4s.push(argv[++i]);
    else if (a === "--manifest") out.manifest = argv[++i];
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i] ?? true;
  }
  return out;
}

function resolveSecrets() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN; // legacy fallback
  return { accountId, token, missing, deferred: missing.length > 0 };
}

function deriveCaption(manifest, sourceName) {
  const text = (manifest && Array.isArray(manifest.texts) && manifest.texts[0])
    ? String(manifest.texts[0]).trim()
    : "";
  const base = text || "LikeLink2 — פרסומת יומית";
  const hashtags = "#פרסומת #Reels #LikeLink2 #מוצר #AliExpress";
  let caption = base.includes("#פרסומת") ? base : `${base} ${hashtags}`;
  caption = caption.replace(/[\u0000-\u001F\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  return caption.slice(0, MAX_CAPTION);
}

function multipartBody(mp4Path, caption) {
  const boundary = `----likelink-ig-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const fileName = path.basename(mp4Path).replace(/"/g, '\\"');
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: video/mp4\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const captionPart = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`,
    "utf8",
  );
  const file = readFileSync(mp4Path);
  return { body: Buffer.concat([head, file, captionPart, tail]), boundary };
}

async function graphFetch(url, { method = "GET", body, token } = {}) {
  const res = await fetch(url, {
    method,
    headers: body
      ? { "Content-Type": `multipart/form-data; boundary=${body.boundary}` }
      : {},
    body: body ? body.body : undefined,
  });
  if (!res.ok) {
    let detail = `Graph HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j?.error?.message || JSON.stringify(j).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) throw new Error(`Graph non-JSON (${res.status})`);
  return res.json();
}

async function pollFinished(mediaId, token) {
  const fields = "id,caption,media_url,permalink,status,media_type";
  let last = null;
  for (let i = 0; i < MAX_POLLS; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const status = await graphFetch(
      `${GRAPH}/${encodeURIComponent(mediaId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
    );
    const s = status?.status || "UNKNOWN";
    last = status;
    console.log(`[ig]   poll ${i + 1}/${MAX_POLLS}  status=${s}`);
    if (s === "FINISHED") return status;
    if (s === "ERROR" || s === "EXPIRED") throw new Error(`Graph status=${s}`);
  }
  throw new Error("poll_timeout_after_5m");
}

async function publishReel(mp4Path, caption, { accountId, token }) {
  const mediaUrl = `${GRAPH}/${encodeURIComponent(accountId)}/media`;
  const { body, boundary } = multipartBody(mp4Path, caption);
  const mediaRes = await graphFetch(mediaUrl, { method: "POST", body, token });
  const mediaId = mediaRes?.id;
  if (!mediaId) throw new Error(`upload_rejected:${JSON.stringify(mediaRes)}`);
  console.log(`[ig]   media uploaded: id=${mediaId}`);


async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secrets = resolveSecrets();
  if (secrets.deferred) {
    console.log(`[ig] DEFERRED (no INSTAGRAM_ACCOUNT_ID / INSTAGRAM_ACCESS_TOKEN set)`);
    if (secrets.missing.length) console.log(`[ig]   missing: ${secrets.missing.join(", ")}`);
    console.log(`[ig]   Owner must set these as GitHub Actions repository secrets, then re-run.`);
    return 0;
  }

  const manifestPath = args.manifest || path.join(ROOT, "out", "luna-reels", "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`manifest_not_found:${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const mp4s = args.mp4s.length
    ? args.mp4s.map((p) => path.resolve(p))
    : discoverMp4s(manifestPath);

  const caption = deriveCaption(manifest, mp4s[0]);
  console.log(`[ig] caption=[${caption.slice(0, 80)}]...`);

  let lastErr = null;
  for (const mp4 of mp4s) {
    console.log(`[ig] uploading ${path.basename(mp4)} (${statSync(mp4).size} bytes)`);
    try {
      const permalink = await publishReel(mp4, caption, secrets);
      console.log(`[ig]   OK: ${permalink}`);
      return 0;
    } catch (err) {
      lastErr = err;
      console.error(`[ig]   FAILED: ${err.message}`);
    }
  }
  console.error("[ig] ABORT: every reel failed to publish");
  return 1;
}

main().then((code) => {
  process.exitCode = code;
}).catch((err) => {
  console.error(`[ig] CRASH: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
});

  const status = await pollFinished(mediaId, token);
  const permalink = status?.permalink || `https://www.instagram.com/accounts/manage/?media_id=${mediaId}`;
  console.log(`[ig]   PUBLISHED media_id=${mediaId} permalink=${permalink}`);
  return permalink;
}


function discoverMp4s(manifestPath) {
  const dir = path.dirname(manifestPath);
  const files = readdirSync(dir).filter((f) => f.endsWith(".mp4"));
  if (!files.length) throw new Error(`no_mp4_found_in:${dir}`);
  return files.map((f) => path.join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}
