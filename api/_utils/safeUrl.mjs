// Outbound-fetch safety (SSRF guard) for server code that fetches a URL a user
// supplied (product-info scraper, price watch).
//
//   • only http(s)
//   • never localhost / *.local / *.internal / private, loopback, link-local,
//     CGNAT or metadata addresses — checked on the literal host AND on every
//     address DNS resolves it to
//   • redirects are followed manually (max 3) and every hop is re-validated
//
// A blocked URL throws UnsafeUrlError; callers turn that into a normal
// "can't fetch this link" response.

import { lookup } from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {
  constructor(reason) {
    super(`unsafe_url:${reason}`);
    this.name = "UnsafeUrlError";
    this.code = "unsafe_url";
  }
}

function ipv4IsPrivate(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||            // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                               // multicast / reserved
  );
}

function ipv6IsPrivate(ip) {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

export function isPrivateAddress(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return ipv4IsPrivate(ip);
  if (kind === 6) return ipv6IsPrivate(ip);
  return true;
}

/** Synchronous checks on the URL itself (protocol, hostname, IP literal). */
export function checkUrlSyntax(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch { throw new UnsafeUrlError("invalid"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError("protocol");
  if (u.username || u.password) throw new UnsafeUrlError("credentials");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new UnsafeUrlError("host");
  if (host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host)) throw new UnsafeUrlError("internal_host");
  if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("private_ip");
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) throw new UnsafeUrlError("port");
  return u;
}

/** Full check: syntax + every DNS answer must be a public address. */
export async function assertPublicUrl(raw) {
  const u = checkUrlSyntax(raw);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!net.isIP(host)) {
    let answers;
    try { answers = await lookup(host, { all: true }); } catch { throw new UnsafeUrlError("dns"); }
    if (!answers.length || answers.some((a) => isPrivateAddress(a.address))) throw new UnsafeUrlError("private_dns");
  }
  return u;
}

/** fetch() with manual, re-validated redirects. Returns the final Response. */
export async function safeFetch(raw, init = {}, maxRedirects = 3) {
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u.href, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), u.href).href;
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("too_many_redirects");
}
