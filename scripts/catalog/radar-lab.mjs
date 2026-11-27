// 🧪 The radar lab (the owner, 26.11: "make it start now, so we can know, not always wait"): the
// head-to-head (radarBacktest.js) on the radar's REAL item histories, in minutes, from any branch.
// It reads the encrypted state of the main `radar` release (read only: nothing is written back or
// uploaded) and prints only totals — never an item id, title or link.
//   node scripts/catalog/radar-lab.mjs <dir with the unpacked state>
// The contenders are compared on every day, then on the earlier half of the days (where a choice
// would be made) and on the later half (days the choice never saw).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { backtest } from "../../src/lib/growth/radarBacktest.js";
import { VARIANTS, labRun, labTotals } from "../../src/lib/growth/radarLab.js";

const dir = process.argv[2] || "lab-state";
const file = join(dir, "items.json");
if (!existsSync(file)) { console.log("lab: no items.json in the state"); process.exit(0); }
const items = JSON.parse(readFileSync(file, "utf8"));
const today = process.env.LAB_TODAY || new Date().toISOString().slice(0, 10);
const readings = Object.values(items).reduce((s, r) => s + (Array.isArray(r) ? r.length : 0), 0);
const days = [...new Set(Object.values(items).flatMap((r) => (Array.isArray(r) ? r.map((x) => x[0]) : [])))].sort();
console.log(`lab: ${Object.keys(items).length} items · ${readings} readings · ${days[0]} → ${days[days.length - 1]} (${days.length} days)`);
const t0 = Date.now();
const bt = backtest(items, today);
console.log(`lab: the head-to-head took ${Math.round((Date.now() - t0) / 1000)} s`);
const C = ["model", "learn", "radar", "rank"];
const NAME = { model: "chance model", learn: "learning model", radar: "noise-checked order", rank: "simple ranking" };
for (const h of bt.horizons) {
  console.log(`\n=== ${h.h} days, growth ≥ ${h.line}% · ${h.days} days tested (${h.skipped} without enough history) · ${h.cases} cases · ${h.from} → ${h.to}`);
  console.log(`top ${h.k} hit share: ${C.map((c) => `${NAME[c]} ${h[c].rate}%`).join(" · ")} · a random pick ${h.random.rate}%`);
  console.log(`AUC: ${C.map((c) => `${NAME[c]} ${h.auc[c]}`).join(" · ")}`);
  console.log(`Brier: chance model ${h.brier.model} · learning model ${h.brier.learn} · simple ranking ${h.brier.rank} · constant ${h.brier.base}`);
  console.log(`days vs the simple ranking: chance model ${h.dayDuel.wins}-${h.dayDuel.losses}-${h.dayDuel.ties} (p ${h.dayDuel.p}) · learning model ${h.learnDuel.wins}-${h.learnDuel.losses}-${h.learnDuel.ties} (p ${h.learnDuel.p}) · noise-checked ${h.radarDuel.wins}-${h.radarDuel.losses}-${h.radarDuel.ties} (p ${h.radarDuel.p})`);
  const rows = bt.daily.filter((x) => x.h === h.h);
  const half = Math.floor(rows.length / 2);
  for (const [label, part] of [["earlier half", rows.slice(0, half)], ["later half", rows.slice(half)]]) {
    if (!part.length) continue;
    const of = part.reduce((s, x) => s + x.k, 0);
    const rate = (c) => Math.round((part.reduce((s, x) => s + x[c], 0) / of) * 1000) / 10;
    const rnd = Math.round((part.reduce((s, x) => s + x.rate * x.k, 0) / of) * 1000) / 10;
    console.log(`${label} (${part[0].d} → ${part[part.length - 1].d}, ${part.length} days): ${C.map((c) => `${NAME[c]} ${rate(c)}%`).join(" · ")} · random ${rnd}%`);
  }
  for (const x of rows) console.log(`  ${x.d}: pool ${x.n}, grew ${Math.round(x.rate * 1000) / 10}% · top ${x.k}: chance ${x.model} · learning ${x.learn} · noise-checked ${x.radar} · ranking ${x.rank}`);
}

// The variants: chosen on the earlier half, checked on the later half (radarLab.js).
for (const h of [3, 7]) {
  const rows = labRun(items, today, { h });
  if (!rows.length) { console.log(`\n--- variants ${h}d: no tested day yet`); continue; }
  const half = Math.floor(rows.length / 2);
  const early = labTotals(rows.slice(0, half));
  const late = labTotals(rows.slice(half));
  const all = labTotals(rows);
  console.log(`\n--- variants ${h}d · ${rows.length} days (${rows[0].d} → ${rows[rows.length - 1].d}) · base rate ${Math.round((rows.reduce((s, r) => s + r.rate, 0) / rows.length) * 1000) / 10}%`);
  for (const v of VARIANTS) console.log(`${v.id.padEnd(20)} all ${String(all[v.id].rate).padStart(5)}% auc ${all[v.id].auc} · earlier ${String(early[v.id].rate).padStart(5)}% auc ${early[v.id].auc} · later ${String(late[v.id].rate).padStart(5)}% auc ${late[v.id].auc}`);
  const pick = VARIANTS.map((v) => v.id).filter((id) => early[id].rate !== null).sort((a, b) => early[b].rate - early[a].rate || (early[b].auc ?? 0) - (early[a].auc ?? 0))[0];
  console.log(`chosen on the earlier half: ${pick} · on the later half it got ${late[pick]?.rate}% (the simple ranking ${late.ranking?.rate}%)`);
}

// 🚀 The takeoff test (the owner, 27.11: "something nobody has heard of, the next hit, live proof"):
// only small listings (10–300 orders in 30 days, where nobody has noticed them yet), and a hit is a
// doubling of their orders within h days. Walk-forward like the rest: chosen on the earlier half of
// the days, checked on the later half. Totals only.
for (const [h, lineT] of [[3, 100], [5, 100], [7, 100], [7, 50], [10, 100], [10, 50]]) {
  const rows = labRun(items, today, { h, line: lineT, minO: 10, maxO: 300, perDay: 3000 });
  if (!rows.length) { console.log(`\n--- takeoff ${h}d +${lineT}%: no tested day yet`); continue; }
  const half = Math.max(1, Math.floor(rows.length / 2));
  const early = labTotals(rows.slice(0, half));
  const late = labTotals(rows.slice(half));
  const all = labTotals(rows);
  const base = (part) => Math.round((part.reduce((s, r) => s + r.rate * r.n, 0) / Math.max(1, part.reduce((s, r) => s + r.n, 0))) * 1000) / 10;
  console.log(`\n--- takeoff ${h}d +${lineT}% (from 10–300 orders) · ${rows.length} days (${rows[0].d} → ${rows[rows.length - 1].d}) · pool per day ${rows.map((r) => r.n).join("/")} · base rate ${base(rows)}% (earlier ${base(rows.slice(0, half))}%, later ${base(rows.slice(half))}%)`);
  for (const v of VARIANTS) console.log(`${v.id.padEnd(20)} all ${String(all[v.id].rate).padStart(5)}% ×${all[v.id].mult} auc ${all[v.id].auc} · earlier ${String(early[v.id].rate).padStart(5)}% · later ${String(late[v.id].rate).padStart(5)}% ×${late[v.id].mult} auc ${late[v.id].auc}`);
  const pick = VARIANTS.map((v) => v.id).filter((id) => early[id].rate !== null).sort((a, b) => early[b].rate - early[a].rate || (early[b].auc ?? 0) - (early[a].auc ?? 0))[0];
  console.log(`takeoff ${h}d +${lineT}% chosen on the earlier half: ${pick} · later half ${late[pick]?.rate}% (×${late[pick]?.mult}) · simple ranking ${late.ranking?.rate}% · base ${base(rows.slice(half))}%`);
  for (const r of rows) console.log(`  ${r.d}: pool ${r.n}, doubled ${Math.round(r.rate * 1000) / 10}% · ${pick} ${r.v[pick]?.hits}/${r.v[pick]?.k} · ranking ${r.v.ranking?.hits}/${r.v.ranking?.k}`);
}
