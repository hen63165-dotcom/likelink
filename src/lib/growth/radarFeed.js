// 📣 The radar says it first (the owner, 22.11: "the trade reports named the squishy only after everyone
// knew; the radar must say it first, and everyone learns it because of the radar"). Every call the radar
// seals is published the same morning in a public Atom feed (/radar/feed.xml), the open format that news
// readers, aggregators, journalists' tools and AI engines follow, so the radar's call is the first public
// record of a trend, with its date, the Bitcoin-sealed ledger root it belongs to and its grading day.
// Built from the public board only: while the board is open (the trial) every call is in it; behind the
// lock, the graded calls and the day's seal (fingerprint only), never an open call's name. Pure: the
// deploy and the build write it. What IS only: a call is "sealed" and "graded on", never a promise.

import { sanitizeBoard } from "./radarBoard.js";

export const FEED = Object.freeze({ max: 60, path: "/radar/feed.xml" });

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const at = (d) => `${d}T05:37:00Z`;

/** The feed's entries from a board (newest first): every sealed call it carries, and every graded one. */
export function feedEntries(raw) {
  const b = sanitizeBoard(raw);
  if (!b) return [];
  const root = b.ledger?.sha256 || null;
  const name = (id) => (b.concepts || []).find((c) => c.id === id);
  const out = [];
  const add = (e) => { if (DAY.test(String(e.day || "")) && e.id && e.title) out.push({ ...e, root: e.day === b.ledger?.d ? root : null }); };
  for (const e of b.early?.ledger || []) {
    const c = name(e.concept);
    add({ id: `early/${e.concept}/${e.at}`, day: e.at, section: "verdict", title: `Before-everyone call: ${c?.en || e.concept}${c?.he ? ` (${c.he})` : ""}`, text: e.result ? `Sealed on ${e.at}; graded ${e.result} on ${e.due}${Number.isFinite(e.growth) ? ` (${e.growth > 0 ? "+" : ""}${e.growth}% orders)` : ""}.` : `Sealed on ${e.at}; graded in public on ${e.due}.` });
  }
  for (const r of b.fresh?.risers || []) {
    if (!r.called) continue;
    add({ id: `fresh/${r.id}/${r.called}`, day: r.called, section: "fresh", title: `New product starting to run: ${r.title}`, text: `Sealed on ${r.called}; ${r.ordersBefore ?? "?"} → ${r.orders} orders in 30 days (${r.from} → ${r.to}), ${r.weekPct}% a week; graded in public on ${r.due}. AliExpress item ${r.id}.` });
  }
  for (const r of b.fresh?.recent || []) {
    add({ id: `fresh-graded/${r.id}/${r.at}`, day: r.at, section: "fresh", title: `Graded ${r.result}: ${r.title}`, text: `A new-product call graded ${r.result}${Number.isFinite(r.growth) ? ` (${r.growth > 0 ? "+" : ""}${r.growth}% orders in 14 days)` : ""}. Every grade stays in the sealed ledger.` });
  }
  for (const k of b.kinds?.list || []) {
    if (!k.called) continue;
    add({ id: `kind/${k.en}/${k.called}`, day: k.called, section: "kinds", title: `New kind found by ${k.via === "look" ? "look" : "meaning"}: ${k.en}`, text: `Sealed on ${k.called}; ${k.members} new listings, median ${k.medianWeekPct}% a week, ${k.orders} orders together; graded in public on ${k.due}.` });
  }
  for (const c of b.prelaunch?.open || []) {
    add({ id: `prelaunch/${c.phrase}/${c.at}`, day: c.at, section: "prelaunch", title: `Before the first sale: ${c.phrase}`, text: `Sealed on ${c.at}; ${c.stores} different stores started listing it that week, ${c.base} orders together at the base; graded in public on ${c.due} (a hit at 300 orders and three times the base).` });
  }
  for (const c of b.prelaunch?.graded || []) {
    if (c.result !== "HIT" && c.result !== "MISS") continue;
    add({ id: `prelaunch-graded/${c.phrase}/${c.at}`, day: c.graded || c.due, section: "prelaunch", title: `Graded ${c.result}: before the first sale, ${c.phrase}`, text: `Sealed on ${c.at} at ${c.base} orders; ${c.orders} on ${c.graded || c.due}, against ${c.target}. Every grade stays in the sealed ledger.` });
  }
  const BOOK = { early: "a before-everyone call", fresh: "a new product", kinds: "a new kind" };
  (b.envelopes || []).forEach((e, i) => add({ id: `envelope/${e.book}/${e.sealed}/${i}`, day: e.sealed, section: "verdict", title: `Sealed envelope: ${BOOK[e.book]}, sealed on ${e.sealed}`, text: `Sealed in Bitcoin on ${e.sealed}${e.dayN ? `; day ${e.dayN} of 14` : ""}${Number.isFinite(e.change) ? `; orders ${e.change > 0 ? "+" : ""}${e.change}% since the seal` : ""}. Members see what is inside now; it opens to everyone on ${e.due || "its grading day"}.` }));
  const day = b.ledger?.d || String(b.at || "").slice(0, 10);
  for (const id of b.supply?.top || []) {
    const c = name(id);
    if (!c?.supply) continue;
    add({ id: `supply/${id}/${day}`, day, section: "supply", title: `Room to make it: ${c.en}${c.he ? ` (${c.he})` : ""}`, text: `Demand outruns the sellers: orders ${c.supply.demandWeekPct}% a week, listings ${c.supply.supplyWeekPct}%. Graded in 14 days by whether new sellers and factories come in.` });
  }
  if (root && day) add({ id: `ledger/${day}`, day, section: "ledger", title: `The day's sealed ledger, ${day}`, text: `Every book of ${day} under one SHA-256 root, ${root}, timestamped in Bitcoin through OpenTimestamps; misses included.` });
  const seen = new Set();
  return out.filter((e) => !seen.has(e.id) && seen.add(e.id)).sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : 0)).slice(0, FEED.max);
}

/** The Atom document. */
export function radarFeed(raw, { origin = "https://likelink2.vercel.app" } = {}) {
  const entries = feedEntries(raw);
  const updated = entries[0]?.day ? at(entries[0].day) : new Date(0).toISOString();
  const items = entries.map((e) => `  <entry>
    <id>tag:likelink2.vercel.app,2026:radar/${esc(e.id)}</id>
    <title>${esc(e.title)}</title>
    <updated>${at(e.day)}</updated>
    <link href="${esc(`${origin}/radar?utm_source=feed&utm_medium=atom#${e.section}`)}"/>
    <summary>${esc(e.text + (e.root ? ` Ledger root ${e.root}.` : ""))}</summary>
  </entry>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:likelink2.vercel.app,2026:radar</id>
  <title>LikeLink2 Trend Radar: sealed calls</title>
  <subtitle>Every product-trend call, sealed in Bitcoin the day it is made, graded in public, misses included.</subtitle>
  <link rel="self" href="${esc(origin + FEED.path)}"/>
  <link href="${esc(origin)}/radar"/>
  <updated>${updated}</updated>
  <author><name>LikeLink2 Trend Radar</name></author>
${items}
</feed>
`;
}
