// The image proxy's fence (api/_utils/safeUrl.mjs imageHostAllowed / fetchAllowedImage, used by
// /api/og?mode=image). 26.11 security pass: any *.supabase.co project and any redirect from an allowed
// host were fetched, so a stranger's server could serve anything through our address or send the proxy
// anywhere. Every hop must now stay on our own hosts and the store's image CDNs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchAllowedImage, imageHostAllowed } from "../api/_utils/safeUrl.mjs";

const ORIGIN = "https://likelink2.vercel.app";

test("allowed: the site itself, the store's image CDNs, our own Supabase project, the fixed photo CDN", () => {
  for (const u of [`${ORIGIN}/looks/a.jpg`, "https://ae01.alicdn.com/kf/S1.jpg", "https://ae-pic-a1.aliexpress-media.com/kf/S2.jpg", "https://vjitiuirqfysexsxdxqx.supabase.co/storage/v1/object/public/x.png", "https://images.unsplash.com/photo-1"]) {
    assert.equal(imageHostAllowed(u, ORIGIN), true, u);
  }
});

test("refused: a stranger's Supabase project, look-alike hosts, other ports, credentials, plain http, internal hosts", () => {
  for (const u of ["https://evilproject1234567890.supabase.co/functions/v1/x", "https://alicdn.com.evil.example/x.jpg", "https://ae01.alicdn.com:8443/x.jpg", "https://u:p@ae01.alicdn.com/x.jpg", "http://ae01.alicdn.com/x.jpg", "https://169.254.169.254/latest", "https://localhost/x.png", "not a url", "https://x.supabase-storage.com/a.png"]) {
    assert.equal(imageHostAllowed(u, ORIGIN), false, u);
  }
});

test("every redirect hop is fenced: a hop to another host is refused before it is asked", async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    if (url.includes("alicdn.com/hop")) return new Response(null, { status: 302, headers: { location: "https://ae02.alicdn.com/real.jpg" } });
    if (url.includes("alicdn.com/away")) return new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } });
    return new Response("img", { status: 200, headers: { "content-type": "image/jpeg" } });
  };
  const ok = await fetchAllowedImage("https://ae01.alicdn.com/hop", ORIGIN, {}, { fetchImpl });
  assert.equal(ok.status, 200);
  assert.deepEqual(asked, ["https://ae01.alicdn.com/hop", "https://ae02.alicdn.com/real.jpg"]);
  asked.length = 0;
  await assert.rejects(() => fetchAllowedImage("https://ae01.alicdn.com/away", ORIGIN, {}, { fetchImpl }), /image_host/);
  assert.deepEqual(asked, ["https://ae01.alicdn.com/away"], "the internal address was never asked");
  await assert.rejects(() => fetchAllowedImage("https://evilproject1234567890.supabase.co/x", ORIGIN, {}, { fetchImpl }), /image_host/);
});

test("wiring: /api/og?mode=image asks through the fence only", () => {
  const og = readFileSync("api/og.mjs", "utf8");
  const block = og.slice(og.indexOf('url.searchParams.get("mode") === "image"'), og.indexOf("/grow/:id"));
  assert.match(block, /imageHostAllowed\(target\.href, origin\)/);
  assert.match(block, /fetchAllowedImage\(target\.href, origin/);
  assert.doesNotMatch(block, /redirect: "follow"/);
});
