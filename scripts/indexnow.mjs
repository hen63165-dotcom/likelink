// Tells search engines about the site's pages right after a deploy (IndexNow:
// Bing, Yandex, Seznam, Naver and others share one free endpoint; Bing's index
// also feeds DuckDuckGo, Yahoo and the AI answer engines that search with it).
// No account, no cost: the proof of ownership is a key file the site itself
// serves (public/<key>.txt). Google does not take IndexNow; it reads the
// sitemap once the owner adds the site in Search Console.
//
// Run by .github/workflows/deploy-frontend.yml after a push to main:
//   node scripts/indexnow.mjs dist
// It only notifies. It never claims a page is indexed, and when the key file
// is not live on the host yet (the main address serves a pinned build) it says
// so and sends nothing.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PRODUCTION_ORIGIN } from "../src/constants/domain.js";

export const INDEXNOW_KEY = "1caa053a0d899c42b9c92e13e7a7cc2c";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** The <loc> URLs of a sitemap. */
export function sitemapUrls(xml = "") {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&").trim());
}

/** The IndexNow request body: only URLs on the origin's own host, no duplicates, at most 10,000. */
export function indexNowPayload(urls = [], origin = PRODUCTION_ORIGIN, key = INDEXNOW_KEY) {
  const host = new URL(origin).host;
  const list = [...new Set(urls)].filter((u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" && url.host === host;
    } catch {
      return false;
    }
  });
  return { host, key, keyLocation: `${origin}/${key}.txt`, urlList: list.slice(0, 10_000) };
}

export async function notify({ dist = "dist", origin = PRODUCTION_ORIGIN, fetchImpl = fetch } = {}) {
  const sitemap = join(dist, "sitemap-static.xml");
  if (!existsSync(sitemap)) return { sent: false, reason: "no sitemap in dist" };
  const payload = indexNowPayload(sitemapUrls(readFileSync(sitemap, "utf8")), origin);
  if (!payload.urlList.length) return { sent: false, reason: "no URLs for this host" };
  // The engines fetch the key file; without it the request would be refused.
  let live = false;
  try {
    const res = await fetchImpl(payload.keyLocation, { redirect: "follow" });
    live = res.ok && (await res.text()).trim() === payload.key;
  } catch { /* not reachable */ }
  if (!live) return { sent: false, reason: `key file not live at ${payload.keyLocation}` };
  const res = await fetchImpl(INDEXNOW_ENDPOINT, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(payload) });
  // 200 OK and 202 Accepted are both success; anything else is reported as it is.
  return { sent: res.status === 200 || res.status === 202, status: res.status, urls: payload.urlList.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await notify({ dist: process.argv[2] || "dist" });
  console.log(r.sent ? `indexnow: ${r.urls} URL(s) sent, HTTP ${r.status}` : `indexnow: nothing sent (${r.reason || `HTTP ${r.status}`})`);
}
