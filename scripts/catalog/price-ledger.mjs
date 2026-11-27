// 🏷️ The public price ledger (src/lib/growth/realDeal.js), split for the magic button: the radar run
// publishes prices-public.json ({ ledger, seals }) on the "radar" release; deploy-frontend.yml calls
//   node scripts/catalog/price-ledger.mjs /tmp/radar-prices/prices-public.json dist/radar/prices
// which writes 00.json … 99.json (each item's daily ILS price, by its last two digits), days/<d>.txt
// (the exact text each day's SHA-256 seals, so anyone can recompute it and check the OpenTimestamps
// proof) and index.json (the days, how many items, the seals, today's honest tally).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dayText, honestTally, shardsOf } from "../../src/lib/growth/realDeal.js";

export function writeLedger(src, out) {
  if (!existsSync(src)) { console.log("price-ledger: no public ledger yet"); return null; }
  const { ledger = {}, seals = {} } = JSON.parse(readFileSync(src, "utf8"));
  mkdirSync(join(out, "days"), { recursive: true });
  const shards = shardsOf(ledger);
  for (let i = 0; i < 100; i++) {
    const k = String(i).padStart(2, "0");
    writeFileSync(join(out, `${k}.json`), JSON.stringify(shards[k] || {}));
  }
  const days = [...new Set(Object.values(ledger).flatMap((s) => (Array.isArray(s) ? s.map((r) => r[0]) : [])))].sort();
  for (const d of Object.keys(seals)) {
    const text = dayText(ledger, d);
    if (text) writeFileSync(join(out, "days", `${d}.txt`), text);
  }
  const last = days.at(-1) || null;
  const index = {
    at: last,
    first: days[0] || null,
    items: Object.keys(ledger).length,
    days: days.length,
    seals: Object.fromEntries(Object.entries(seals).map(([d, s]) => [d, { sha256: s.sha256, n: s.n, ots: (s.ots || []).map((o) => ({ cal: o.cal, b64: o.b64 })) }])),
    tally: last ? honestTally(ledger, last) : null,
  };
  writeFileSync(join(out, "index.json"), JSON.stringify(index));
  console.log(`price-ledger: ${index.items} items · ${index.days} days · ${Object.keys(seals).length} sealed${index.tally ? ` · today ${index.tally.sales} sales (${index.tally.real} real, ${index.tally.raised} raised first, ${index.tally.dropped} dropped earlier and held)` : ""}`);
  return index;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  writeLedger(process.argv[2] || "prices-public.json", process.argv[3] || "dist/radar/prices");
}
