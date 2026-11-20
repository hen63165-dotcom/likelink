// The store's own product video for a short list of products, for a person to review before an
// edit (2026-11-14: the owner asked for a squishy video in the style of a hands-only "haul"). The
// sellers' clips are labelled as the seller's footage in anything made from them; nothing is posted
// from here. Uses the owner's affiliate account (productdetail.get product_video_url), the same call
// as Actions → "Studio videos". Output: store-out/ → the "store-videos-preview" pre-release.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cloudProducts, storeVideo } from "../../media/product-video/studio-videos.mjs";

const { ids: listed = [], all = false, keep = [], photos = false } = JSON.parse(readFileSync("scripts/marketing/store-videos/list.json", "utf8"));
mkdirSync("store-out", { recursive: true });
const products = await cloudProducts();
// all: every approved product in the cloud (to find which ones have a store video at all). Then only
// a contact sheet is kept per video, unless the id is in `keep` (the clips chosen by eye for an edit).
const ids = all ? products.filter((p) => p?.status === "approved" && /aliexpress\./i.test(String(p?.affiliateUrl || ""))).map((p) => p.id) : listed;
const keepAll = !all;
console.log("products to ask:", ids.length);
const report = [];
for (const id of ids) {
  // A bare store item number (not on the site yet) is asked by its store page address, to see whether
  // the seller has a video before the item is added; nothing is written anywhere.
  const p = products.find((x) => x?.id === id) || (/^\d{12,20}$/.test(id) ? { id, affiliateUrl: `https://www.aliexpress.com/item/${id}.html` } : null);
  if (!p) { report.push({ id, status: "NOT_IN_CLOUD" }); continue; }
  try {
    const found = await storeVideo(p);
    // photos: the store's gallery on one sheet per item, to check by eye (no logo, the real item) before adding it
    if (photos && found.images?.length) {
      try {
        const files = found.images.map((u, i) => {
          const f = `store-out/${id}-p${i}.jpg`;
          execFileSync("curl", ["-fsSL", "--max-time", "60", "--max-filesize", "15000000", "-o", f, u]);
          return f;
        });
        const inputs = files.flatMap((f) => ["-i", f]);
        const scaled = files.map((_, i) => `[${i}]scale=400:400:force_original_aspect_ratio=decrease,pad=400:400:(ow-iw)/2:(oh-ih)/2:white[s${i}]`).join(";");
        const stack = `${files.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${files.length}`;
        execFileSync("ffmpeg", ["-v", "error", ...inputs, "-filter_complex", files.length > 1 ? `${scaled};${stack}` : `${scaled.replace("[s0]", "")}`, "-frames:v", "1", `store-out/${id}-photos.jpg`, "-y"]);
        for (const f of files) rmSync(f);
      } catch (e) {
        console.log("photos failed", id, String(e.message || e).slice(0, 120));
      }
    }
    if (found.status !== "FOUND") { report.push({ id, status: found.status, reason: found.reason || "", seen: found.seen || "", title: found.title || "" }); continue; }
    const file = `store-out/${id}.mp4`;
    execFileSync("curl", ["-fsSL", "--max-time", "120", "--max-filesize", "150000000", "-o", file, found.video]);
    execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "fps=1,scale=240:-2,tile=6x3", "-frames:v", "1", `store-out/${id}-sheet.jpg`, "-y"]);
    const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
    report.push({ id, status: "FOUND", seconds, title: found.title, video: found.video });
    if (!keepAll && !keep.includes(id)) rmSync(file);
  } catch (e) {
    report.push({ id, status: "FAILED", reason: String(e.message || e).slice(0, 200) });
  }
}
writeFileSync("store-out/report.json", JSON.stringify(report, null, 1));
const counts = report.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
console.log("statuses:", JSON.stringify(counts));
for (const r of report.filter((x) => x.status === "FOUND")) console.log("FOUND", r.id, `${Math.round(r.seconds)}s`, String(r.title || "").slice(0, 70));
