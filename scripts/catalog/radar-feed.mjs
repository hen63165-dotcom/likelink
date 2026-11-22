// 📣 node scripts/catalog/radar-feed.mjs <board.json> <feed.xml> — the radar's public Atom feed
// (src/lib/growth/radarFeed.js) from the public board; a missing or unreadable board writes nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { feedEntries, radarFeed } from "../../src/lib/growth/radarFeed.js";

const [src, out] = process.argv.slice(2);
try {
  const board = JSON.parse(readFileSync(src, "utf8"));
  writeFileSync(out, radarFeed(board));
  console.log(`radar feed: ${feedEntries(board).length} entries → ${out}`);
} catch (err) {
  console.log(`radar feed: skipped (${String(err?.message || err).slice(0, 80)})`);
}
