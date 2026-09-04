import { readFileSync } from "node:fs";
const env = {};
try { const raw = readFileSync(new URL("../.env", import.meta.url), "utf8"); for (const line of raw.split(/\r?\n/)) { const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2]; } } catch {}
const SB_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const ORIGIN = "https://likelink.vercel.app";
const url = process.argv[2] || "https://www.aliexpress.com/item/1005059060787359.html";
const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function kvGet(k, fb) { const r = await fetch(`${SB_URL}/rest/v1/kv?key=eq.${encodeURIComponent(k)}&select=value`, { headers, signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error("kv read"); const rows = await r.json(); try { return rows?.[0]?.value ? JSON.parse(rows[0].value) : fb; } catch { return fb; } }
async function kvSet(k, v) { const r = await fetch(`${SB_URL}/rest/v1/kv?on_conflict=key`, { method: "POST", headers: { ...headers, "content-type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: k, value: JSON.stringify(v) }), signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error("kv write"); }
async function getPage(u) { const r = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": UA } }); if (!r.ok) throw new Error("fetch"); return r.text(); }
const dec = (s) => String(s).replace(/&[a-z]+;/g, (m) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'" }[m]));
const meta = (h, p) => { const m = h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']*)["']`, "i")); return m ? dec(m[1]).trim() : null; };
console.log("Scraping: " + url);
let itemUrl = url;
if (!/\/item\//.test(url)) { const html = await getPage(url); const ms = html.match(/aliexpress\.com\/item\/\d+\.html/g) || []; if (!ms.length) { console.error("No items"); process.exit(1); } itemUrl = "https://" + ms[0]; console.log("Picked: " + itemUrl); }
const h = await getPage(itemUrl);
let img = meta(h, "og:image") || "";
const tit = meta(h, "og:title") || "Product";
const pr = Number(meta(h, "og:price:amount") || 11.99);
if (!img) { const c = h.match(/https:\/\/ae0\d\.alicdn\.com\/[^\s\\]+\.(?:jpe?g|png|webp)/i); if (c) img = c[0]; }
if (!img) { img = "https://placehold.co/600x600/6C4CF1/ffffff?text=" + encodeURIComponent(tit.slice(0, 20)); }
console.log("Image: " + img.slice(0, 80) + "...");
const product = { id: uid(), marketerId: "admin", title: tit.slice(0, 90), description: "Trending " + tit + " - viral beauty tool", image: img, affiliateUrl: itemUrl, category: "beauty", price: pr, commission: Math.round(pr * 0.9 * 100) / 100, status: "approved", clicks: 0, createdAt: Date.now() };
console.log("Product:", JSON.stringify(product, null, 2));
const mks = await kvGet("marketplace:marketers", []);
let mk = Array.isArray(mks) && mks.length ? mks[0] : null;
let nm = Array.isArray(mks) ? mks : [];
if (!mk) { mk = { id: uid(), name: "Likelink Official", email: "hello@likelink.com", slug: "likelink-official", createdAt: Date.now() }; nm = [mk]; await kvSet("marketplace:marketers", nm); product.marketerId = mk.id; }
const prods = await kvGet("marketplace:products", []);
await kvSet("marketplace:products", [...(Array.isArray(prods) ? prods : []), product]);
console.log("Added! Feed: " + ORIGIN + "/?product=" + product.id);
console.log("Story: " + ORIGIN + "/story/" + product.id);