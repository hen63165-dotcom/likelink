// The store's own product video for a short list of products, for a person to review before an
// edit (2026-11-14: the owner asked for a squishy video in the style of a hands-only "haul"). The
// sellers' clips are labelled as the seller's footage in anything made from them; nothing is posted
// from here. Uses the owner's affiliate account (productdetail.get product_video_url), the same call
// as Actions → "Studio videos". Output: store-out/ → the "store-videos-preview" pre-release.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cloudProducts, storeVideo } from "../../media/product-video/studio-videos.mjs";

const { ids = [] } = JSON.parse(readFileSync("scripts/marketing/store-videos/list.json", "utf8"));
mkdirSync("store-out", { recursive: true });
const products = await cloudProducts();
const report = [];
for (const id of ids) {
  const p = products.find((x) => x?.id === id);
  if (!p) { report.push({ id, status: "NOT_IN_CLOUD" }); continue; }
  try {
    const found = await storeVideo(p);
    if (found.status !== "FOUND") { report.push({ id, status: found.status, reason: found.reason || "" }); continue; }
    const file = `store-out/${id}.mp4`;
    execFileSync("curl", ["-fsSL", "--max-time", "120", "--max-filesize", "150000000", "-o", file, found.video]);
    execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "fps=1,scale=240:-2,tile=6x3", "-frames:v", "1", `store-out/${id}-sheet.jpg`, "-y"]);
    const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
    report.push({ id, status: "FOUND", seconds, title: found.title });
  } catch (e) {
    report.push({ id, status: "FAILED", reason: String(e.message || e).slice(0, 200) });
  }
}
writeFileSync("store-out/report.json", JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
