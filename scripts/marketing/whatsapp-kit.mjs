// The WhatsApp group kit page (src/lib/growth/whatsappKit.js): every deploy GitHub Pages serves
// https://hen63165-dotcom.github.io/likelink/whatsapp/ — today's posts for the owner's own WhatsApp group
// or channel, each a collage of the store's photos + the text, with one button that hands both to the
// phone's share sheet (she picks the group; WhatsApp sends it). Nothing is posted from here: WhatsApp gives
// no program a legal way to post into a group.
//   node scripts/marketing/whatsapp-kit.mjs dist
// Reads the catalog copy merged with the live cloud (like the pins feed; WA_LIVE=0: the copy alone) and the
// radar's public board in dist/radar/board.json (its keep list = today's HOT site products).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { listedFromSnapshot } from "../prerender-products.mjs";
import { kitOf } from "../../src/lib/growth/whatsappKit.js";

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SAFE_FILE = /^[a-z0-9-]{1,60}$/i;

/** The page: plain HTML that works on a phone; every post has its picture, its text and the send button. */
export function kitPage(kit, { groupLink = "" } = {}) {
  const cards = kit.posts.map((p) => `
  <section class="card">
    <img src="${esc(p.file)}" alt="${esc(p.title)}" loading="lazy" width="540" height="540">
    <textarea readonly rows="9">${esc(p.text)}</textarea>
    <div class="row">
      <button type="button" class="send">📲 שליחה לוואטסאפ</button>
      <button type="button" class="copy">העתקת הטקסט</button>
      <a class="save" href="${esc(p.file)}" download>שמירת התמונה</a>
    </div>
    <p class="why">${p.why === "hot" ? "🔥 חם עכשיו לפי הרדאר" : "🆕 נוסף לחנות לאחרונה"}</p>
  </section>`).join("");
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>הפוסטים לקבוצת הוואטסאפ · ${esc(kit.day)}</title>
<style>
body{margin:0;background:#f4efe9;color:#1b1410;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Heebo,Arial,sans-serif}
main{max-width:560px;margin:0 auto;padding:16px}
h1{font-size:24px;margin:8px 0}
.note{background:#fff;border-radius:14px;padding:12px 14px;margin:10px 0;font-size:15px}
.card{background:#fff;border-radius:18px;padding:12px;margin:16px 0;box-shadow:0 4px 18px rgba(0,0,0,.07)}
.card img{width:100%;height:auto;border-radius:12px;display:block}
textarea{width:100%;box-sizing:border-box;margin-top:10px;border:1px solid #e5dccf;border-radius:10px;padding:8px;font:15px/1.5 inherit;resize:vertical}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
button,.save{border:0;border-radius:999px;padding:10px 16px;font:700 15px inherit;cursor:pointer;text-decoration:none}
.send{background:#1fa855;color:#fff;flex:1 1 100%}
.copy,.save{background:#efe6da;color:#3b2616}
.why{margin:8px 2px 0;font-size:14px;color:#6b5240}
</style></head><body><main>
<h1>הפוסטים להיום · ${esc(kit.day.slice(6, 8))}.${esc(kit.day.slice(4, 6))}</h1>
<p class="note">לוחצים <b>"שליחה לוואטסאפ"</b>, בוחרים את הקבוצה, ושולחים. הטקסט מועתק לבד: אם הוא לא מופיע מתחת לתמונה, מדביקים אותו. בכל פוסט כבר יש "#פרסומת · קישור שותפים" וקישור למוצר באתר.</p>
${groupLink ? `<p class="note">הקישור להצטרפות לקבוצה: <a href="${esc(groupLink)}">${esc(groupLink)}</a></p>` : ""}
${cards || '<p class="note">היום אין מוצרים חדשים לקבוצה. מחר בבוקר הרדאר בודק שוב.</p>'}
</main>
<script>
document.querySelectorAll(".card").forEach(function (card) {
  var text = card.querySelector("textarea").value;
  var img = card.querySelector("img");
  card.querySelector(".copy").addEventListener("click", function () {
    try { navigator.clipboard.writeText(text); this.textContent = "הועתק ✓"; } catch (e) {}
  });
  card.querySelector(".send").addEventListener("click", async function () {
    try { await navigator.clipboard.writeText(text); } catch (e) {}
    try {
      var blob = await (await fetch(img.src)).blob();
      var file = new File([blob], "post.jpg", { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    location.href = "https://wa.me/?text=" + encodeURIComponent(text);
  });
});
</script></body></html>`;
}

async function download(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok || !/^image\//.test(res.headers.get("content-type") || "")) throw new Error(`photo ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4000 || buf.length > 15_000_000) throw new Error("photo size");
  writeFileSync(file, buf);
}

export async function writeKit({ dist = "dist", catalog = null, now = Date.now(), groupLink = process.env.WA_GROUP_LINK || "" } = {}) {
  const snapshot = join(dist, "snapshot", "kv.json");
  const doc = catalog || (existsSync(snapshot) ? JSON.parse(readFileSync(snapshot, "utf8")) : null);
  if (!doc) return { posts: 0, reason: "no catalog" };
  const listed = new Set(listedFromSnapshot(doc).products.map((x) => x.product.id));
  const raw = (doc.keys?.["marketplace:products"] || []).filter((p) => listed.has(p?.id));
  const boardFile = join(dist, "radar", "board.json");
  const board = existsSync(boardFile) ? JSON.parse(readFileSync(boardFile, "utf8")) : null;
  const keepIds = (board?.site?.keep || []).map((k) => k?.id).filter(Boolean);
  const kit = kitOf({ products: raw, keepIds, now });
  const out = join(dist, "whatsapp");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "tmp"), { recursive: true });
  const done = [];
  for (const p of kit.posts) {
    const name = String(p.id).replace(/[^a-z0-9-]/gi, "-").slice(0, 60);
    if (!SAFE_FILE.test(name)) continue;
    const files = [];
    for (const [k, u] of p.images.entries()) {
      const f = join(out, "tmp", `${name}-${k}.img`);
      try { await download(u, f); files.push(f); } catch { /* a photo that does not download is left out */ }
    }
    if (!files.length) continue;
    try {
      execFileSync("python3", ["scripts/marketing/wa-collage.py", join(out, `${name}.jpg`), ...files]);
      done.push({ ...p, file: `${name}.jpg` });
    } catch (e) {
      console.log(`collage failed for ${p.id}: ${String(e.message || e).slice(0, 120)}`);
    }
  }
  rmSync(join(out, "tmp"), { recursive: true, force: true });
  const final = { day: kit.day, posts: done };
  writeFileSync(join(out, "index.html"), kitPage(final, { groupLink }));
  writeFileSync(join(out, "today.json"), JSON.stringify({ day: final.day, posts: done.map(({ images, safe, ...x }) => x) }, null, 1));
  return { posts: done.length, hot: done.filter((x) => x.why === "hot").length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv[2] || "dist";
  let catalog = null, note = "copy only";
  const snapshot = join(dist, "snapshot", "kv.json");
  if (process.env.WA_LIVE !== "0" && existsSync(snapshot)) {
    const { buildCatalog } = await import("../catalog/live-catalog.mjs");
    const built = await buildCatalog(JSON.parse(readFileSync(snapshot, "utf8")));
    catalog = built.doc;
    note = built.live === "ok" ? `copy + ${built.added} live products` : `copy only (live catalog: ${built.live})`;
  }
  const r = await writeKit({ dist, catalog });
  console.log(r.reason ? `whatsapp-kit: ${r.reason}` : `whatsapp-kit: ${r.posts} post(s), ${r.hot} hot (${note})`);
}
