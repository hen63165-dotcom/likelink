// Adds one TikTok post's numbers to the results file the TikTok engine learns
// from (src/lib/growth/tiktok.js learnTikTok). Run by
// .github/workflows/tiktok-results.yml with the form's fields in the
// environment (never interpolated into a shell line):
//   POST_ID=tt-20261016-1-reveal VIEWS=1200 LIKES=80 COMMENTS=4 SHARES=3 SAVES=9 \
//     node scripts/marketing/tiktok-results.mjs <in.json> <out.json>
// A post logged again replaces its earlier numbers (the latest count wins in
// learnTikTok). Only a known post id and whole numbers are accepted.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseResult } from "../../src/lib/growth/tiktok.js";

export const KEEP = 1000;

export function addResult(list = [], input = {}, { now = Date.now() } = {}) {
  const parsed = parseResult(input, { now });
  if (!parsed.ok) return parsed;
  const rest = (Array.isArray(list) ? list : []).filter((r) => r?.id !== parsed.entry.id);
  return { ok: true, list: [...rest, parsed.entry].slice(-KEEP), entry: parsed.entry };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inFile, outFile] = process.argv.slice(2);
  // No file yet = no results yet. A file that exists but can't be read or
  // isn't a JSON list stops the run: starting from [] would erase every
  // logged result on the next save.
  let list = [];
  if (inFile && existsSync(inFile)) {
    try {
      list = JSON.parse(readFileSync(inFile, "utf8"));
    } catch (e) {
      console.log(`::error::the results file can't be read (${e.message}); nothing was saved`);
      process.exit(1);
    }
    if (!Array.isArray(list)) {
      console.log("::error::the results file is not a list; nothing was saved");
      process.exit(1);
    }
  }
  const env = process.env;
  const r = addResult(list, { id: env.POST_ID, views: env.VIEWS, likes: env.LIKES, comments: env.COMMENTS, shares: env.SHARES, saves: env.SAVES });
  if (!r.ok) {
    const what = { post_id: "מזהה הפוסט צריך להיות כמו בעמוד הטיקטוק, למשל tt-20261016-1-reveal" }[r.error] || `"${r.error}" צריך להיות מספר שלם`;
    console.log(`::error::${what}`);
    process.exit(1);
  }
  writeFileSync(outFile, `${JSON.stringify(r.list, null, 1)}\n`);
  console.log(`tiktok-results: ${r.entry.id} → ${r.entry.views} views (${r.list.length} post(s) logged)`);
}
