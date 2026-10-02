#!/usr/bin/env node
// Owner links → products (.github/workflows/catalog-add-links.yml).
//
// The owner pastes links from her own AliExpress Link Generator
// (https://s.click.aliexpress.com/e/_…). Google Chrome on the runner follows
// each one to the store's product page and reads what the page itself shows:
// the store title, the store photo (og:image) and the current price. The
// server (op=catalog-add-link) accepts only a store product page and a store
// photo it downloads itself, writes the product and reads it back.
// Read-only on the store: one page view per link. One CAPTCHA stops the run.
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";

const API = String(process.env.LIKELINK_API || "https://likelink2.vercel.app").replace(/\/+$/, "");
const SECRET = process.env.AUTOPILOT_SECRET || "";
const DRY = process.argv.includes("--dry-run");
const summary = (l) => { console.log(l); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, l + "\n"); };

/** Links pasted in any form (one per line, comma-separated, or run together). */
export function parseLinks(text) {
  return [...new Set(String(text || "").match(/https:\/\/s\.click\.aliexpress\.com\/e\/_[A-Za-z0-9]{4,24}?(?=https:|[\s,;]|$)/g) || [])];
}

/** Price text as the store shows it → { price, currency }. */
export function parsePrice(text) {
  const t = String(text || "").replace(/ /g, " ");
  const m = t.match(/(₪|ILS|US\s?\$|\$|USD)\s*([\d.,]+)|([\d.,]+)\s*(₪|ILS)/i);
  if (!m) return null;
  const sym = (m[1] || m[4] || "").toUpperCase();
  const raw = (m[2] || m[3] || "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const price = Number(raw);
  if (!(price > 0)) return null;
  return { price, currency: /₪|ILS/.test(sym) ? "ILS" : "USD" };
}

async function main() {
  const links = parseLinks(process.env.LINKS);
  summary(`## Owner links → products (${links.length})${DRY ? " — dry run" : ""}`);
  if (!links.length) return;
  if (!SECRET && !DRY) throw new Error("AUTOPILOT_SECRET is required");
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || "chrome" });
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1280, height: 900 } });
  // Ask the store for Israeli prices in shekels (its own currency setting).
  const pref = "site=glo&c_tp=ILS&region=IL&b_locale=he_IL";
  await ctx.addCookies(["aliexpress.com", "aliexpress.us"].map((d) => ({ name: "aep_usuc_f", value: pref, domain: `.${d}`, path: "/" })));
  let blocked = false, added = 0;
  for (const link of links) {
    if (blocked) { summary(`- ${link}: skipped — the store blocked automation earlier in this run`); continue; }
    const page = await ctx.newPage();
    try {
      await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(6000);
      const found = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const priceEl = [...document.querySelectorAll('[class*="price-default--current"], [class*="product-price-current"], [class*="price--currentPriceText"], [class*="uniform-banner-box-price"], [class*="price--current"]')][0];
        return {
          url: location.href,
          og: q('meta[property="og:image"]')?.content || "",
          title: q('meta[property="og:title"]')?.content || q("h1")?.textContent || document.title || "",
          priceText: priceEl?.textContent || "",
        };
      });
      const itemUrl = found.url.split("?")[0];
      let image = found.og.startsWith("//") ? `https:${found.og}` : found.og;
      image = image.replace(/_\d+x\d+(q\d+)?\.(jpg|png|webp)(_\.webp)?$/i, "");
      const pr = parsePrice(found.priceText);
      summary(`- ${link}\n  page ${itemUrl.slice(0, 90)} · price "${found.priceText.trim().slice(0, 30)}" → ${pr ? `${pr.price} ${pr.currency}` : "none"} · title "${found.title.slice(0, 70)}"`);
      const captcha = /_____tmd_____|\/punish|captcha/i.test(found.url) || /captcha/i.test(found.title);
      if (captcha) { blocked = true; summary("  - SOURCE_BLOCKED (captcha) — nothing written"); continue; }
      if (DRY) continue;
      const res = await fetch(`${API}/api/store?mode=media-pipeline&op=catalog-add-link`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}`, Origin: API, "content-type": "application/json" },
        body: JSON.stringify({ affiliateUrl: link, itemUrl, image, storeTitle: found.title, price: pr?.price, currency: pr?.currency, observedInRun: process.env.GITHUB_RUN_ID || "" }),
        signal: AbortSignal.timeout(60_000),
      });
      const json = await res.json().catch(() => null);
      summary(`  - server: http ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
      if (res.status === 200 && json?.ok) added += 1;
    } catch (e) {
      summary(`- ${link}: FAILED ${String(e?.message || e).slice(0, 200)}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
  summary(`Done: ${added}/${links.length} added or already present`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 2000));
