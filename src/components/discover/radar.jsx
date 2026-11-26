// /radar — the trend radar (src/lib/growth/trendRadar.js): what is starting to rise abroad, read
// every day from AliExpress's own numbers, each with its evidence, and the radar's public record of
// its own calls, plus the Israel gap (src/lib/growth/israelGap.js: is it already searched in
// Hebrew here?) and the opportunity window. The board comes from .github/workflows/trend-radar.yml
// (board.json next to the site) and passes radarBoard.js sanitizeBoard before anything renders.
// Free during the trial. The store buttons are LikeLink2's tracked links, with the
// disclosure above them; an exit is one click event (med "radar") in the owner's numbers.
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { AREA_HE } from "../../lib/growth/radarAreas.js";
import { PARTNER_NAMES } from "../../lib/growth/tradeSignal.js";
import { Clock, ExternalLink, Radar, Search, ShieldCheck, Sparkles } from "lucide-react";
import { BASE } from "../../lib/basePath.js";
import { BOT_UA } from "../../lib/funnel.js";
import { landingAttribution } from "../../lib/attribution.js";
import { storage } from "../../lib/storage.js";
import { sanitizeBoard } from "../../lib/growth/radarBoard.js";
import { RADAR_CLAIM } from "../../lib/growth/radarStatic.js";
import { CAPABILITY_CLASSES, EXIT_LABELS, EXIT_WHY, INSTRUMENTS, NEXT_DOORS, SECTION_TABS, SOURCE_STATES, capabilityMap, findFacts, recordView, resultText, sourcesView } from "../../lib/growth/radarCore.js";
import { EXPORT, exportable, wixCsv } from "../../lib/growth/radarExport.js";
import { WIX_PRODUCTS_URL } from "../../lib/growth/wixRadar.js";
import { COUNTRY_NAMES, MEASURES, israelDay, israelTime, receiptTotals, searchCountries } from "../../lib/growth/runReceipt.js";
import { GAP_STATES } from "../../lib/growth/israelGap.js";
import { REGIONS, worldGapLine } from "../../lib/growth/worldGap.js";
import { supplyLine } from "../../lib/growth/supplyGap.js";
import { WORLD_STATES, nextReadingAt, verdictOf } from "../../lib/growth/worldPulse.js";
import { accessOf } from "../../lib/growth/radarPlans.js";
import { getSessionToken } from "../../lib/auth.js";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Go, Img, ShareButton, Spinner, TelegramJoin, useL } from "./kit";
import { STUDIO_LOGIN, STUDIO_SIGNUP } from "./PublicShell";

export const RADAR_BOARD_HOME = "https://hen63165-dotcom.github.io/likelink/radar/board.json";

const KINDS = {
  kids: "ילדים", kitchen: "מטבח", home: "בית", hair: "שיער", makeup: "איפור וטיפוח", bracelets: "צמידים", rings: "טבעות",
  earrings: "עגילים", necklaces: "שרשראות", bags: "תיקים", gadgets: "גאדג׳טים", car: "לרכב", pets: "חיות מחמד",
  fitness: "כושר", clothing: "בגדים", watches: "שעונים", style: "סגנונות",
};

const STAGE_STYLE = {
  EMERGING: { bg: "#dcfce7", fg: "#166534", dot: "#16a34a" },
  RISING: { bg: "#dbeafe", fg: "#1e40af", dot: "#2563eb" },
  STEADY: { bg: "#f3f4f6", fg: "#374151", dot: "#9ca3af" },
  PEAK: { bg: "#ffedd5", fg: "#9a3412", dot: "#ea580c" },
  COOLING: { bg: "#f3f4f6", fg: "#6b7280", dot: "#9ca3af" },
  UNVERIFIED: { bg: "#ffffff", fg: "#6b7280", dot: "#d1d5db" },
};

/** The Israel label by state, from the code: a board written before a wording fix keeps its old text. */
const gapHe = (gap) => GAP_STATES[gap?.state]?.he || gap?.he || "";
/** Opportunities first: not searched in Hebrew yet, then first signs, then the rest. */
const GAP_ORDER = { GAP: 0, QUIET: 1, ARRIVING: 2, UNCERTAIN: 3, UNKNOWN: 4, ARRIVED: 5 };
const dm = (d) => (typeof d === "string" && d.length >= 10 ? `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}` : "");
const dmy = (d) => `${dm(d)}.${String(d).slice(0, 4)}`;
/** The first day a direction can be measured: two days after the first reading. */
const nextDay = (d) => { const t = Date.parse(`${d}T00:00:00Z`); return Number.isFinite(t) ? new Date(t + 2 * 86_400_000).toISOString().slice(0, 10) : ""; };

const automated = () => {
  try { return navigator.webdriver === true || BOT_UA.test(String(navigator.userAgent || "")); } catch { return false; }
};

/** The exit to the store, as one click event (append-only; never blocks the buyer). */

// 📚 A kind's Wikipedia readers (wikiSignal.js): this week against last week, Hebrew too, the history
// since 2016. Wikimedia's own public numbers: anyone can check them on its pageviews tool.
function WikiLine({ w, L }) {
  const n = (x) => Number(x).toLocaleString("he-IL");
  const pct = (x) => (x > 0 ? `+${x}` : `${x}`);
  const week = Number.isFinite(w.a.weekPct) ? L(` (${pct(w.a.weekPct)}% מהשבוע הקודם)`, ` (${pct(w.a.weekPct)}% vs the week before)`) : "";
  const he = w.ah ? L(` · בעברית: ${n(w.ah.last7)}`, ` · Hebrew: ${w.ah.last7}`) : "";
  const since = w.h?.peak ? L(` · שיא מאז ${w.h.since}: ${w.h.peak.month}`, ` · peak since ${w.h.since}: ${w.h.peak.month}`) : "";
  return (
    <p className="text-[12px] font-bold" style={{ color: w.rising ? "#166534" : "var(--lx-muted)" }} dir="rtl">
      {L(`📚 ויקיפדיה, "${w.en}": ${n(w.a.last7)} קוראים השבוע`, `📚 Wikipedia, "${w.en}": ${w.a.last7} readers this week`)}{week}{he}{since}
    </p>
  );
}

function recordExit(concept, link) {
  if (automated()) return;
  let attr = {};
  try { attr = landingAttribution() || {}; } catch { attr = {}; }
  const m = /\/item\/(\d{6,20})/.exec(link || "") || [];
  const ev = { id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, productId: m[1] ? `ae-${m[1]}` : `radar-${concept}`, ts: Date.now(), ...attr, med: "radar", camp: concept };
  storage.set("marketplace:clicks", JSON.stringify([ev]), true, { keepalive: true }).catch(() => {});
}

/** The board: the site's own address first (proxied to GitHub Pages), then GitHub Pages itself.
 *  Untrusted input from another host: only what sanitizeBoard keeps is ever rendered. */
/** The server's last answer about this visitor's access (radarGate.boardAccess), for the page. */
export let radarAccess = null;
export async function loadBoard() {
  // The server first (radarGate.js): the full board during the launch trial, her own trial or her
  // subscription; a 402 brings the teaser and why (sign in for a trial / subscribe).
  try {
    const token = await getSessionToken().catch(() => null);
    const res = await fetch("/api/store?mode=radar-board", { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok || res.status === 402) {
      const body = await res.json();
      radarAccess = res.ok ? { reason: body?.access || "open", daysLeft: Number.isFinite(body?.daysLeft) ? body.daysLeft : null } : { reason: body?.error === "subscription_required" ? "subscription_required" : "sign_in_for_trial", trialDays: Number(body?.trialDays) || 7 };
      const doc = sanitizeBoard(res.ok ? body?.board : body?.teaser);
      if (doc) return doc;
    }
  } catch { /* no server answer: the public file */ }
  const urls = [...new Set([typeof location !== "undefined" ? `${location.origin}${BASE}/radar/board.json` : "", RADAR_BOARD_HOME].filter(Boolean))];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const doc = sanitizeBoard(await res.json());
      if (doc) return doc;
    } catch { /* an SPA fallback page or a network error: try the next address */ }
  }
  return null;
}

function Spark({ series = [] }) {
  const pts = series.map((p) => Number(p?.[1])).filter((n) => Number.isFinite(n));
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts);
  const w = 120, h = 34;
  const xy = pts.map((v, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / (max - min || 1)) * (h - 6)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ direction: "ltr" }}>
      <polyline points={xy} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StageBadge({ stage, label }) {
  const s = STAGE_STYLE[stage] || STAGE_STYLE.UNVERIFIED;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, background: s.bg, color: s.fg, fontWeight: 800, fontSize: 13, border: stage === "UNVERIFIED" ? "1px dashed #d1d5db" : "none" }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: s.dot }} />
      {label}
    </span>
  );
}

const GAP_STYLE = {
  GAP: { bg: "#ecfdf3", fg: "#067647", icon: "🇮🇱" },
  QUIET: { bg: "#f2f4f7", fg: "#475467", icon: "🇮🇱" },
  ARRIVING: { bg: "#fffaeb", fg: "#b54708", icon: "🇮🇱" },
  ARRIVED: { bg: "#fef3f2", fg: "#b42318", icon: "🇮🇱" },
  UNCERTAIN: { bg: "#f9fafb", fg: "#475467", icon: "🇮🇱" },
  UNKNOWN: { bg: "#ffffff", fg: "#667085", icon: "🇮🇱" },
};

const WORLD_STYLE = {
  VIRAL_NOW: { bg: "#fef3f2", fg: "#b42318" },
  SPREADING: { bg: "#ecfdf3", fg: "#067647" },
  EARLY: { bg: "#eff8ff", fg: "#175cd3" },
  WIDE: { bg: "#f2f4f7", fg: "#344054" },
  NONE: { bg: "#f9fafb", fg: "#475467" },
  UNVERIFIED: { bg: "#ffffff", fg: "#667085" },
};
/** Early signals worth showing on a row: spreading, first searches, or in today's trends. */
const WORLD_SIGNAL = new Set(["SPREADING", "EARLY", "VIRAL_NOW"]);
const earlyScore = (c) => (c.early?.count || 0) * 10 + (c.world?.state === "SPREADING" || c.world?.state === "VIRAL_NOW" ? 2 : c.world?.state === "EARLY" ? 1 : 0) + (c.gap?.state === "GAP" ? 1 : 0);

/** The world line under a concept: Google and YouTube in four countries, and Google's daily trends. */
function WorldLine({ world }) {
  const { L } = useL();
  if (!world || world.state === "UNVERIFIED") return null;
  const st = WORLD_STYLE[world.state] || WORLD_STYLE.NONE;
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: st.bg, color: st.fg }}>
      <p className="text-[14px] font-extrabold">🌍 {L("בעולם:", "Worldwide:")} {WORLD_STATES[world.state]?.he || world.he}</p>
      {(world.evidence || []).map((e, i) => <p key={i} className="mt-1 text-[12px] leading-5">{e}</p>)}
    </div>
  );
}

// 🌍 The world gap under a concept (worldGap.js): the same English store words in Google's suggestions
// from every country measured, by region, with the day of the reading.
const WORLD_GAP_STYLE = {
  WORLD_QUIET: { bg: "#ecfdf3", fg: "#067647" },
  FIRST_SIGNS: { bg: "#ecfdf3", fg: "#067647" },
  SPREADING: { bg: "#fffaeb", fg: "#b54708" },
  KNOWN: { bg: "#fef3f2", fg: "#b42318" },
};
function WorldGapLine({ g }) {
  const { L } = useL();
  if (!g || !WORLD_GAP_STYLE[g.state]) return null;
  const st = WORLD_GAP_STYLE[g.state];
  const regions = Object.entries(g.regions || {}).filter(([k]) => REGIONS[k]);
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: st.bg, color: st.fg }}>
      <p className="text-[14px] font-extrabold">🌍 {L("מול העולם:", "Against the world:")} {L(worldGapLine(g, "he"), worldGapLine(g, "en"))}</p>
      {regions.length ? <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--lx-ink, #101828)" }}>{regions.map(([k, r]) => L(`${REGIONS[k].he}: ${r.searched ? `מחפשים ב־${r.searched} מתוך ${r.measured}` : `שקט ב־${r.measured}`}`, `${REGIONS[k].en}: ${r.searched ? `searched in ${r.searched} of ${r.measured}` : `quiet in ${r.measured}`}`)).join(" · ")}</p> : null}
      <p className="mt-1 text-[11px]" style={{ color: "var(--lx-muted)" }}>{L(`נמדד ב־${dm(g.d)} · מילות החנות באנגלית, בהשלמות של גוגל בכל מדינה`, `Measured ${dm(g.d)} · the store's English words, in Google's suggestions in each country`)}</p>
    </div>
  );
}

/** The Israel gap line under a concept: is it already searched in Hebrew here? */
function IsraelLine({ gap }) {
  const { L } = useL();
  const st = GAP_STYLE[gap?.state] || GAP_STYLE.UNKNOWN;
  if (!gap || gap.state === "UNKNOWN") return null;
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: st.bg, color: st.fg }}>
      <p className="text-[14px] font-extrabold">{st.icon} {L("בישראל:", "In Israel:")} {gapHe(gap)}{gap.confidenceHe ? <span className="text-[12px] font-bold" style={{ opacity: 0.8 }}> · {gap.confidenceHe}</span> : null}</p>
      {gap.evidence?.length ? (
        <ul className="mt-1 grid gap-0.5 text-[13px] leading-6" style={{ color: "var(--lx-ink, #101828)" }}>
          {gap.evidence.map((e) => <li key={e.k}>• {e.text}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function WindowBadge({ window, label }) {
  if (!window) return null;
  const s = window === "OPEN" ? { bg: "#101828", fg: "#ffffff" } : window === "CLOSING" ? { bg: "#fef0c7", fg: "#93370d" } : { bg: "#fee4e2", fg: "#912018" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, background: s.bg, color: s.fg, fontWeight: 800, fontSize: 13 }}>{window === "OPEN" ? "✨ " : ""}{label}</span>;
}

/** The Alpha evidence block: the score, its confidence apart, each component with its evidence or why it is missing, and the explanation written from that evidence. */
function AlphaBlock({ c }) {
  const { L } = useL();
  const a = c.alpha;
  if (!a) return null;
  const COMP = [["global", L("מומנטום עולמי", "Global momentum")], ["israel", L("פער ישראל", "Israel gap")], ["private", L("סימן מהאתר", "Site signal")]];
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: "#f8fafc", border: "1px solid var(--lx-line)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[16px] font-extrabold">{L("מדד אלפא", "Alpha")}: {a.score !== null ? <>{a.score}<span className="text-[12px] font-bold">/100</span></> : <span className="text-[13px]">{L("הציון יופיע אחרי מדידת המומנטום העולמי", "no score yet (no measured global momentum)")}</span>}</p>
        <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: a.verified ? "#dcfce7" : "#fef0c7", color: a.verified ? "#166534" : "#93370d" }}>{a.verified ? L("הזדמנות מאומתת", "Verified") : L("בבדיקה", "Not verified yet")} · {a.confidenceHe}</span>
        {c.lifecycleHe ? <span className="text-[12px] font-bold" style={{ color: "var(--lx-muted)" }}>{L("שלב:", "Stage:")} {c.lifecycleHe}</span> : null}
        {c.accel?.he ? <span className="text-[12px] font-bold" style={{ color: "var(--lx-muted)" }}>{L("תאוצה:", "Acceleration:")} {c.accel.he}</span> : null}
      </div>
      <ul className="mt-2 grid gap-1 text-[13px] leading-6">
        {COMP.map(([k, label]) => {
          const x = a.components?.[k];
          if (!x) return null;
          return <li key={k}>{x.missing ? "⏳" : "•"} <strong>{label}</strong>{x.missing ? `: ${L("חסר", "missing")} — ${x.missing}` : ` (${Math.round((x.score ?? 0) * 100)}/100): ${x.evidence}`}</li>;
        })}
      </ul>
      {c.explain ? (
        <details className="mt-2 text-[13px] leading-6">
          <summary className="cursor-pointer font-bold">{L("למה זה כאן, למה עכשיו, ומה הסיכון", "Why here, why now, and the risks")}</summary>
          {c.explain.why.length ? <p className="mt-1"><strong>{L("למה נבחר:", "Why selected:")}</strong> {c.explain.why.join(" ")}</p> : null}
          {c.explain.now.length ? <p><strong>{L("למה עכשיו:", "Why now:")}</strong> {c.explain.now.join(" ")}</p> : null}
          {c.explain.audience ? <p><strong>{L("למי:", "Audience:")}</strong> {c.explain.audience.text} <span style={{ color: "var(--lx-muted)" }}>({c.explain.audience.basis})</span></p> : null}
          {c.explain.positioning ? <p><strong>{L("מיצוב:", "Positioning:")}</strong> {c.explain.positioning}</p> : null}
          {c.explain.angle ? <p><strong>{L("זווית מכירה:", "Sales angle:")}</strong> {c.explain.angle}</p> : null}
          {c.explain.risks.length ? <p><strong>{L("סיכונים:", "Risks:")}</strong> {c.explain.risks.join(" ")}</p> : null}
          {c.explain.missing.length ? <p><strong>{L("מה עוד חסר:", "Still missing:")}</strong> {c.explain.missing.join(" · ")}</p> : null}
          <p style={{ color: "var(--lx-muted)" }}>{L(`חישוב ${a.version}: מומנטום 35% · ישראל 30% · אתר 35%, רק מרכיבים שנמדדו (${a.coverage}); הוודאות נפרדת מהציון.`, `${a.version}: momentum 35% · Israel 30% · site 35%, measured components only (${a.coverage}); confidence is separate from the score.`)}</p>
        </details>
      ) : null}
    </div>
  );
}

/** Where else to see it, as plain public search pages (no tracking, nothing read by us). */
const EVERYWHERE = [
  ["AliExpress", (q) => `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(q.replace(/\s+/g, "-"))}.html`],
  ["Amazon", (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`],
  ["Temu", (q) => `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}`],
  ["eBay", (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`],
  ["TikTok", (q) => `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`],
  ["YouTube", (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`],
  ["Pinterest", (q) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`],
];
function Everywhere({ q }) {
  const { L } = useL();
  if (!q) return null;
  return (
    <div className="mt-3">
      <p className="text-[13px] font-extrabold">{L("לראות את זה בכל מקום:", "See it everywhere:")}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {EVERYWHERE.map(([name, url]) => <a key={name} href={url(q)} target="_blank" rel="noopener nofollow" className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ border: "1px solid var(--lx-line)", background: "#fff" }}>{name} ↗</a>)}
      </div>
    </div>
  );
}

/** How many independent signals agree (worldPulse.earlyCall): a call needs three, demand among them. */
const SIGNAL_HE = { world: "🌍 חיפושים מתפשטים בעולם", demand: "📈 קונים יותר מהר", supply: "🏭 מוכרים חדשים נכנסים", israel: "🔓 בעברית עוד לא מחפשים" };
function EarlyLine({ early }) {
  const { L } = useL();
  if (!early || early.level === "NONE") return null;
  const on = Object.entries(early.signals || {}).filter(([, v]) => v).map(([k]) => SIGNAL_HE[k]);
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: early.level === "CALL" ? "#fef3c7" : "#f2f4f7", color: "#0b0b0b" }}>
      <p className="text-[14px] font-extrabold">{early.level === "CALL" ? L(`🎯 התראה מוקדמת: ${early.count} סימנים מסכימים`, `🎯 Early call: ${early.count} signals agree`) : L(`👀 במעקב: ${early.count} סימנים`, `👀 Watching: ${early.count} signals`)}</p>
      <p className="mt-1 text-[12px] leading-5">{on.join(" · ")}</p>
      {early.aheadOf?.length ? <p className="mt-1 text-[12px] font-bold">{L(`🚀 הרדאר מקדים את: ${early.aheadOf.map((k) => FINISH_HE[k]).join(", ")}. ביום שזה יקרה, נכתוב כאן בכמה ימים הוא הקדים.`, `🚀 Ahead of: ${early.aheadOf.join(", ")}. The day each one happens, we write here how many days ahead the call was.`)}</p> : null}
      {early.buzz?.length ? <p className="mt-1 text-[12px]">{L(`📣 כבר יש באז: ${early.buzz.map((k) => BUZZ_HE[k]).join(", ")}. זה סימן מאוחר, ולכן הוא נספר בנפרד.`, `📣 Already buzzing: ${early.buzz.join(", ")}. A late sign, never counted as an early one.`)}</p> : null}
    </div>
  );
}
const BUZZ_HE = { tiktok: "טיקטוק/ויראלי", amazon: "אמזון", douyin: "דואין (סין)", korea: "טרנד בקוריאה" };
/** The public finish lines a call is timed against (worldPulse.FINISH_LINES). */
const FINISH_LINES_ORDER = ["buzz", "israel", "trends", "wide", "ads"];
const FINISH_HE = { buzz: "הבאז ברשתות", israel: "החיפושים בעברית בארץ", trends: "החיפושים החמים של גוגל", wide: "החיפוש בהרבה מדינות", ads: "הפרסומות של המוכרים" };

export function ConceptCard({ c }) {
  const { L } = useL();
  const strong = c.stage === "EMERGING" || c.stage === "RISING";
  return (
    <li id={c.id} className="lx-card p-4 md:p-5" style={{ scrollMarginTop: 90, boxShadow: "none", border: `1px solid ${strong ? "#bbf7d0" : "var(--lx-line)"}` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <StageBadge stage={c.stage} label={c.stageHe} />
            <WindowBadge window={c.window} label={c.windowHe} />
          </div>
          <h3 className="mt-2 text-[19px] font-extrabold leading-7" dir={c.auto ? "ltr" : undefined} style={c.auto ? { textAlign: "right" } : undefined}>{c.he}</h3>
          {KINDS[c.kind] || c.auto ? <p className="text-[13px]" style={{ color: "var(--lx-muted)" }}>{[KINDS[c.kind], c.auto ? L(`התגלה אוטומטית ב־${dm(c.found)} · המילים של החנות`, `Found automatically ${dm(c.found)} · the store's words`) : ""].filter(Boolean).join(" · ")}</p> : null}
        </div>
        <div className="text-left" style={{ color: STAGE_STYLE[c.stage]?.dot || "#9ca3af" }}>
          <Spark series={c.series} />
          {c.stage !== "UNVERIFIED" ? <p className="text-[11px]" style={{ color: "var(--lx-muted)" }}>{L("עוצמת האות", "Signal strength")}: {c.score}/100</p> : null}
        </div>
      </div>
      <ul className="mt-3 grid gap-1.5 text-[14px] leading-6">
        {c.evidence.map((e) => <li key={e.k}>• {e.text}</li>)}
      </ul>
      <EarlyLine early={c.early} />
      <WorldLine world={c.world} />
      <IsraelLine gap={c.gap} />
      <WorldGapLine g={c.worldGap} />
      {c.supply ? <p className="mt-2 text-[13px] font-bold" style={{ color: c.supply.state === "UNDERSUPPLIED" ? "#067647" : "var(--lx-muted)" }}>{L(supplyLine(c.supply, "he"), supplyLine(c.supply, "en"))}</p> : null}
      <Everywhere q={c.en} />
      <AlphaBlock c={c} />
      {c.actionHe ? <p className="mt-3 text-[15px] font-extrabold">👉 {c.actionHe}{c.action === "WAIT" && c.measured ? L(` (${dm(nextDay(c.since))})`, "") : ""}</p> : null}
      {c.pick ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl p-3" style={{ background: "var(--lx-sky)" }}>
          {c.pick.image ? <div style={{ width: 64, height: 64, flex: "0 0 64px", borderRadius: 12, overflow: "hidden", background: "#fff" }}><Img src={c.pick.image} alt={c.pick.title} loading="lazy" style={{ width: 64, height: 64, objectFit: "cover" }} /></div> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold">{c.pick.title}</p>
            {c.pick.price ? <p className="text-[13px]" style={{ color: "var(--lx-muted)" }}>{L(`מ־₪${c.pick.price} בחנות · נבדק ב־${dm(c.pick.checkedAt)}`, `from ₪${c.pick.price} · checked ${dm(c.pick.checkedAt)}`)}</p> : null}
            {c.pick.momentum ? <p className="text-[12px] font-bold" style={{ color: c.pick.momentum.state === "HOT" ? "#166534" : "var(--lx-muted)" }}>{c.pick.momentum.state === "HOT" ? "🔥 " : ""}{c.pick.momentum.he}{Number.isFinite(c.pick.momentum.weekPct) ? ` (${c.pick.momentum.weekPct > 0 ? "+" : ""}${c.pick.momentum.weekPct}% בשבוע)` : ""}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <a href={c.pick.buy} target="_blank" rel="noopener sponsored" onClick={() => recordExit(c.id, c.pick.buy)} className="lx-btn lx-btn-ink" style={{ minHeight: 38, padding: "6px 14px", fontSize: 13 }}>
              {L("לחנות", "Store")} <ExternalLink size={13} aria-hidden="true" />
            </a>
            {c.pick.check ? <Go to={c.pick.check} className="lx-btn lx-btn-ghost" style={{ minHeight: 34, padding: "4px 12px", fontSize: 12 }}>{L("מה לבדוק", "What to check")}</Go> : null}
          </div>
        </div>
      ) : c.stage !== "UNVERIFIED" ? (
        <p className="mt-3 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L("פריט יופיע כאן כשיעבור את הכללים שלנו: 95% שביעות רצון, 300 הזמנות, מוצר מקורי.", "No item passes our rules yet (95% satisfaction, 300 orders, no imitations).")}</p>
      ) : null}
      {c.opportunity ? (
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer font-bold">{L(`בדיקת הזדמנות: ${c.opportunity.passed} מתוך ${c.opportunity.measured} בדיקות שנמדדו עברו`, `Opportunity check: ${c.opportunity.passed} of ${c.opportunity.measured} measured checks passed`)}</summary>
          <ul className="mt-2 grid gap-1">
            {c.opportunity.checks.map((x) => <li key={x.id}>{x.ok === true ? "✅" : x.ok === false ? "❌" : "⏳"} {x.he}{x.ok === null ? L(" (נמדד בקרוב)", " (not measured yet)") : ""}</li>)}
          </ul>
          {c.pick?.momentum?.line ? <p className="mt-2" style={{ color: "var(--lx-muted)" }}>{c.pick.momentum.line}</p> : null}
        </details>
      ) : null}
      <p className="mt-3 text-[11px]" style={{ color: "var(--lx-muted)" }}>{L(`על הרדאר מ־${dm(c.since)} · נמדד לאחרונה ${dm(c.measured)} · נתוני אליאקספרס`, `On the radar since ${dm(c.since)} · last measured ${dm(c.measured)} · AliExpress data`)}</p>
    </li>
  );
}

const SIZE = {
  SMALL: { he: "שוק קטן: שווה לעקוב", color: "#166534" },
  MID: { he: "שוק בינוני", color: "#1e40af" },
  BIG: { he: "שוק גדול ועמוס: כבר יש לכולם", color: "#9a3412" },
};
const n = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString("he-IL") : "?");

/**
 * Before a second reading: today's size of each concept (never a direction). Small markets first,
 * because that is where a rise would show early.
 */
function MarketMap({ list, openId = "" }) {
  const { L } = useL();
  const groups = ["SMALL", "MID", "BIG"].map((k) => [k, list.filter((c) => c.size === k).sort((a, b) => earlyScore(b) - earlyScore(a) || (GAP_ORDER[a.gap?.state] ?? 4) - (GAP_ORDER[b.gap?.state] ?? 4) || (a.today?.orders || 0) - (b.today?.orders || 0))]).filter(([, l]) => l.length);
  return (
    <>
      <h3 className="mt-8 text-[18px] font-extrabold">{L("מפת השוק של היום", "Today's market map")}</h3>
      <p className="mt-1 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L("הגודל אומר כמה גדול השוק היום. הכיוון (עולה או יורד) יופיע אחרי המדידה הבאה. לחיצה על שורה פותחת את כל הבדיקה: בישראל, הפריט לקנייה, בדיקת ההזדמנות וההמלצה.", "Size is not direction: it says how big the market is today. The direction (up or down) shows after the next reading. Tap a row for the full check.")}</p>
      {groups.map(([k, l]) => (
        <div key={k} className="mt-4">
          <p className="text-[15px] font-extrabold" style={{ color: SIZE[k].color }}>{SIZE[k].he} · {l.length}</p>
          <ul className="mt-2 grid gap-1.5">
            {l.map((c) => (
              <li key={c.id} id={c.id} className="min-w-0" style={{ scrollMarginTop: 90 }}>
                <details open={openId === c.id} style={{ minWidth: 0, maxWidth: "100%" }}>
                  <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-[14px]" style={{ background: "var(--lx-sky)", listStyle: "none" }}>
                    <span className="font-bold" dir={c.auto ? "ltr" : undefined}>{c.he}</span>
                    <span className="flex flex-wrap items-baseline gap-2">
                      {c.early && c.early.level !== "NONE" ? <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: c.early.level === "CALL" ? "#fef3c7" : "#f2f4f7", color: "#0b0b0b" }}>{c.early.level === "CALL" ? "🎯" : "👀"} {c.early.count}/4</span> : null}
                      {c.early?.beforeAll ? <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: "#dbeafe", color: "#0b0b0b" }}>🚀 {L("לפני כולם", "before everyone")}</span> : c.early?.aheadOf?.includes("buzz") ? <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: "#dbeafe", color: "#0b0b0b" }}>🚀 {L("לפני הרשתות", "before the networks")}</span> : null}
                      {WORLD_SIGNAL.has(c.world?.state) ? <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: WORLD_STYLE[c.world.state].bg, color: WORLD_STYLE[c.world.state].fg }}>🌍 {WORLD_STATES[c.world.state].he}</span> : null}
                      {["GAP", "QUIET", "ARRIVING"].includes(c.gap?.state) ? <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: (GAP_STYLE[c.gap.state] || GAP_STYLE.UNKNOWN).bg, color: (GAP_STYLE[c.gap.state] || GAP_STYLE.UNKNOWN).fg }}>{c.gap.state === "GAP" ? "🔓 " : ""}{gapHe(c.gap)}</span> : null}
                      {c.pick?.momentum?.state === "HOT" ? <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: "#dcfce7", color: "#166534" }}>🔥 {c.pick.momentum.he}</span> : null}
                      <span className="whitespace-nowrap text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`${n(c.today?.orders)} הזמנות בחודש · ${n(c.today?.listings)} מודעות`, `${n(c.today?.orders)} orders a month · ${n(c.today?.listings)} listings`)}</span>
                    </span>
                  </summary>
                  <ul className="mt-2"><ConceptCard c={c} /></ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-3 text-[11px]" style={{ color: "var(--lx-muted)" }}>{L("״בישראל״: האם בגוגל בישראל מציעים השלמות לחיפוש הזה בעברית (סימן שמחפשים אותו), נמדד היום. ההזמנות: סכום 30 הימים האחרונים של 20 הפריטים המובילים בכל סוג. המודעות: כמה מוצרים תואמים יש באליאקספרס. נתוני אליאקספרס, נמדדו היום.", "\"In Israel\": whether Google in Israel suggests completions for this search in Hebrew (a sign people search it), measured today. Orders: the last 30 days of the top 20 items of each kind. Listings: how many matching products AliExpress has. AliExpress data, measured today.")}</p>
    </>
  );
}

/** The site's own products whose AliExpress orders are accelerating this week (board.site). */
function SiteHot({ site }) {
  const { L } = useL();
  if (!site?.checked) return null;
  return (
    <div className="lx-card mt-8 p-4 md:p-5" style={{ boxShadow: "none", border: "1px solid #bbf7d0" }}>
      <h3 className="text-[18px] font-extrabold">{L("🔥 באתר עכשיו: מה באמת חם השבוע", "🔥 On the site now: what is really hot this week")}</h3>
      <p className="mt-1 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L(`בדקנו ${site.checked} מוצרים מהאתר מול ההזמנות באליאקספרס, כל יום. חם = ההזמנות של הפריט עלו ב־10% ומעלה בשבוע.`, `We check ${site.checked} of the site's products against AliExpress orders every day. Hot = the item's orders rose 10%+ in a week.`)}</p>
      {site.hot.length ? (
        <ul className="mt-3 grid gap-2">
          {site.hot.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl px-3 py-2 text-[14px]" style={{ background: "#ecfdf3" }}>
              <Go to={`/p/${r.id}`} className="font-bold underline">{r.title || r.id}</Go>
              {(() => { const k = (site.keep || []).find((x) => x.id === r.id); return k ? <span className="text-[12px] font-bold">{L(`אלפא ${k.alpha ?? "—"} · ${k.accel?.he || ""}${k.israelHe ? ` · בישראל: ${k.israelHe}` : ""}`, `Alpha ${k.alpha ?? "—"}`)}</span> : null; })()}
              <span className="text-[12px]" style={{ color: "#166534" }}>{L(`+${r.weekPct}% בשבוע · ${n(r.ordersBefore)} ← ${n(r.orders)} הזמנות ב־30 יום (${dm(r.from)}–${dm(r.to)})`, `+${r.weekPct}%/week · ${n(r.ordersBefore)} → ${n(r.orders)} orders in 30 days (${dm(r.from)}–${dm(r.to)})`)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-[14px]">{L("השבוע הרדאר מחכה למוצר באתר שההזמנות שלו מאיצות, ומודד כל בוקר.", "No product on the site is accelerating this week. That is real information, not a fault.")}</p>}
    </div>
  );
}

/** The trial line the owner's settings call for (accessOf); nothing when the radar is simply open. */
export function TrialBanner() {
  const { L } = useL();
  const { settings } = useMarketplace();
  const a = accessOf(settings);
  if (a.state === "OPEN") return null;
  return (
    <p className="lx-card mt-4 p-3 text-[14px] leading-6" role="status" style={{ boxShadow: "none", border: "1px solid var(--lx-line)", background: "var(--lx-sky-soft, var(--lx-sunk))" }}>
      {a.state === "TRIAL"
        ? L(`תקופת ניסיון חינם: עוד ${a.daysLeft} ימים (עד ${dm(a.endsAt.slice(0, 10))}). המחירים של Basic ו־Pro ייקבעו בהמשך.`, `Free trial: ${a.daysLeft} days left (until ${dm(a.endsAt.slice(0, 10))}). Basic and Pro prices are not set yet.`)
        : L("תקופת הניסיון הסתיימה. הרדאר נשאר פתוח עד שייקבעו המסלולים; אפשר להצטרף לרשימת ההמתנה.", "The trial has ended. The radar stays open until the tiers are set; you can join the waitlist.")}{" "}
      <Go to="/radar-pro" className="font-bold underline">{L("למסלולים", "See the tiers")}</Go>
    </p>
  );
}

/**
 * "מה הרדאר קבע היום" — the one place to check every morning: the calls sealed today, or the honest
 * line that there is none (no call without its signals), and the public ledger of every call with its
 * grade and the days it was ahead. Shareable as text that only states what was sealed (never a promise).
 */
const RESULT_HE = { HIT: "✅ פגע", MISS: "❌ לא פגע" };
function Countdown({ lastDaily = null }) {
  const { L } = useL();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Anchored on when the last daily reading really ran (GitHub starts scheduled runs hours late).
  const next = nextReadingAt(now, { lastDaily });
  if (next === null) return <p className="text-[13px] font-bold">{L("⏰ הקריאה של היום בדרך", "⏰ Today's reading is on its way")}</p>;
  const left = Math.max(0, next - now);
  const hh = String(Math.floor(left / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");
  return <p className="text-[13px] font-bold" dir="rtl">{L("⏰ הקריאה הבאה של הרדאר בעוד כ־", "⏰ The radar's next reading in about ")}<span dir="ltr" style={{ fontVariantNumeric: "tabular-nums" }}>{hh}:{mm}:{ss}</span></p>;
}

/** The card for a visitor without access: sign in for her own free trial, or subscribe. */
function AccessCard({ acc }) {
  const { L } = useL();
  if (acc?.reason === "subscription_required") {
    return (
      <div className="lx-card p-5" style={{ boxShadow: "none", border: "2px solid #0b0b0b" }}>
        <p className="text-[22px] font-black">{L("⏳ תקופת הניסיון שלך הסתיימה", "⏳ Your trial has ended")}</p>
        <p className="mt-1 text-[15px] leading-7">{L("הקביעות החיות, \"אולי מחר\" ו\"נולד עכשיו\" פתוחים למנויות. ההוכחה וספר הקביעות נשארים פתוחים לכולם.", "Live calls, 'maybe tomorrow' and 'born now' are for subscribers. The proof and the ledger stay open to everyone.")}</p>
        <Go to="/radar-pro#radar-tiers" className="lx-btn lx-btn-ink mt-3" style={{ minHeight: 52, fontSize: 17 }}>{L("👉 למנוי", "👉 Subscribe")}</Go>
      </div>
    );
  }
  return (
    <div className="lx-card p-5" style={{ boxShadow: "none", border: "2px solid #0b0b0b" }}>
      <p className="text-[22px] font-black">{L(`🎁 ${acc?.trialDays || 7} ימים חינם`, `🎁 ${acc?.trialDays || 7} days free`)}</p>
      <p className="mt-1 text-[15px] leading-7">{L("פותחים חשבון חינם ומקבלים את הרדאר המלא. בלי כרטיס אשראי. אחרי ההרשמה חוזרים לכאן.", "Open a free account and get the full radar. No card. After signing up, come back here.")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Go to={STUDIO_SIGNUP} className="lx-btn lx-btn-ink" style={{ minHeight: 52, fontSize: 17 }}>{L("👉 פתיחת חשבון חינם", "👉 Open a free account")}</Go>
        <Go to={STUDIO_LOGIN} className="underline">{L("כבר יש לי חשבון", "I have an account")}</Go>
      </div>
    </div>
  );
}

// The duel from the server (radarPicks.js duelOf), numbers and ids only.
const DUEL_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const side = (x) => ({ hits: n0(x?.hits), graded: n0(x?.graded), open: n0(x?.open), players: n0(x?.players) });
function cleanDuel(d) {
  if (!d || typeof d !== "object") return null;
  const dayOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
  return {
    radar: side(d.radar), crowd: side(d.crowd),
    leader: ["radar", "crowd", "tie"].includes(d.leader) ? d.leader : null,
    firstDue: dayOk(d.firstDue),
    recent: (Array.isArray(d.recent) ? d.recent : []).filter((r) => DUEL_ID.test(String(r?.concept || "")) && dayOk(r?.at)).slice(0, 14).map((r) => ({ concept: r.concept, at: dayOk(r.at), due: dayOk(r.due), result: r.result === "HIT" || r.result === "MISS" ? r.result : null, growth: Number.isFinite(Number(r.growth)) ? Number(r.growth) : null, rid: /^[0-9a-f]{16}$/.test(String(r.rid || "")) ? r.rid : null })),
  };
}
// A sealed receipt from the server (radarPicks.js receiptView), text capped, ids checked.
function cleanReceipt(r) {
  if (!r || typeof r !== "object") return null;
  const dayOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
  if (!dayOk(r.at)) return null;
  const txt = (v, n) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);
  return { concept: DUEL_ID.test(String(r.concept || "")) ? r.concept : null, he: txt(r.he, 60), at: dayOk(r.at), due: dayOk(r.due), nick: txt(r.nick, 20), result: r.result === "HIT" || r.result === "MISS" ? r.result : null, growth: Number.isFinite(Number(r.growth)) ? Number(r.growth) : null, sealed: r.sealed === true, sealDay: dayOk(r.sealDay) };
}

/** "מי זיהתה ראשונה" (radarPicks.js): pick a concept, sealed with the day, graded after 14 days. */
const PICK_ERR = { invalid_nickname: "כינוי של 2–20 אותיות או מספרים", already_picked: "כבר בחרת את זה", too_many_open: "אפשר עד 3 בחירות פתוחות", concept_not_measured: "עוד אין מדידה למוצר הזה", subscription_required: "הבחירה פתוחה בניסיון או במנוי", unauthenticated: "צריך להתחבר" };
function PicksBox({ board }) {
  const { L } = useL();
  const [table, setTable] = useState([]);
  const [pickSeal, setPickSeal] = useState(null);
  const [mine, setMine] = useState(null);
  const [duel, setDuel] = useState(null);
  const [beat, setBeat] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [lastPick, setLastPick] = useState(null);
  const box = useRef(null);
  const [token, setToken] = useState(null);
  const [concept, setConcept] = useState("");
  const [nick, setNick] = useState("");
  const [show, setShow] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (t) => {
    fetch("/api/store?mode=radar-board&op=leaderboard").then((r) => r.json()).then((b) => { setTable(Array.isArray(b?.table) ? b.table.slice(0, 10) : []); setDuel(cleanDuel(b?.duel)); const s = b?.seal; setPickSeal(s && /^[0-9a-f]{64}$/.test(String(s.sha256 || "")) ? { d: s.d, sha256: s.sha256, text: typeof s.text === "string" && /^[\p{L}\p{N} |._\n-]*$/u.test(s.text) ? s.text : null, ots: (Array.isArray(s.ots) ? s.ots : []).filter((o) => ["a.pool.opentimestamps.org", "b.pool.opentimestamps.org"].includes(o?.cal) && /^[A-Za-z0-9+/]+=*$/.test(String(o?.b64 || ""))).slice(0, 2) } : null); }).catch(() => {});
    if (t) fetch("/api/store?mode=radar-board&op=mine", { headers: { Authorization: `Bearer ${t}` } }).then((r) => r.json()).then((b) => { setMine(Array.isArray(b?.picks) ? b.picks : []); setBeat(b?.beat === true); }).catch(() => {});
  };
  useEffect(() => {
    let live = true;
    getSessionToken().catch(() => null).then((t) => { if (!live) return; setToken(t || null); load(t); });
    const rid = typeof location !== "undefined" ? new URLSearchParams(location.search).get("r") : null;
    if (rid && /^[0-9a-f]{16}$/.test(rid)) fetch(`/api/store?mode=radar-board&op=receipt&r=${rid}`).then((r) => r.json()).then((b) => { if (live) setReceipt(cleanReceipt(b?.receipt)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const options = (board?.concepts || []).filter((c) => Number(c.today?.orders) > 0).sort((a, b) => (b.early?.count || 0) - (a.early?.count || 0)).slice(0, 80);
  const submit = async (e) => {
    e.preventDefault();
    if (!concept || busy) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/store?mode=radar-board&op=pick", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ concept, nick, show }) });
      const b = await res.json().catch(() => ({}));
      if (b?.ok) { setMsg(L("🔮 נשמר! הבחירה תיחתם בביטקוין בקריאת הבוקר, והציון ב־" + dm(b.pick?.due), "🔮 Saved! Sealed in Bitcoin with the morning reading; graded " + dm(b.pick?.due))); setLastPick(b.pick && /^[0-9a-f]{16}$/.test(String(b.pick.rid || "")) ? b.pick : null); setConcept(""); load(token); }
      else setMsg(L(PICK_ERR[b?.error] || "לא נשמר, נסי שוב", "Not saved, try again"));
    } catch { setMsg(L("נסי שוב בעוד רגע", "Not saved, try again")); }
    setBusy(false);
  };
  const name = (id) => (board?.concepts || []).find((c) => c.id === id)?.he || null;
  const today = String(board?.at || "").slice(0, 10);
  const radarToday = (duel?.recent || []).find((r) => r.at === today && !r.result);
  const lead = !duel ? null : duel.leader === "radar" ? L("🤖 הרדאר מוביל כרגע", "🤖 The radar leads") : duel.leader === "crowd" ? L("✨ החוש השישי של ישראל מוביל כרגע", "✨ Israel's sixth sense leads") : duel.leader === "tie" ? L("🤝 תיקו כרגע", "🤝 A tie for now") : duel.firstDue ? L(`⏳ הציונים הראשונים ב־${dm(duel.firstDue)}`, `⏳ The first grades land on ${dm(duel.firstDue)}`) : L("⏳ מתחילים עם הבחירה הראשונה של הרדאר בבוקר", "⏳ It starts with the radar's first pick in the morning");
  return (
    <>
    <div className="mt-4 rounded-2xl p-4" id="duel" style={{ background: "#0b0b0b", color: "#fff" }}>
      {receipt ? (
        <div className="mb-3 rounded-xl p-3" style={{ background: "#fffbeb", color: "#0b0b0b" }}>
          <p className="text-[13px] font-bold" style={{ color: "#92400e" }}>{L("🧾 קבלה חתומה", "🧾 Sealed receipt")}</p>
          <p className="mt-1 text-[16px] font-black">{receipt.he || receipt.concept ? L(`${receipt.nick || "מישהי"} בחרה ב־${dm(receipt.at)}: ${receipt.he || receipt.concept}`, `${receipt.nick || "Someone"} picked on ${dm(receipt.at)}: ${receipt.he || receipt.concept}`) : L(`בחירה מ־${dm(receipt.at)}, השם נחשף ביום הציון`, `A pick from ${dm(receipt.at)}; revealed on grading day`)}</p>
          <p className="mt-1 text-[14px]">{receipt.result ? `${RESULT_HE[receipt.result]} (${receipt.growth > 0 ? "+" : ""}${receipt.growth}%)` : L(`⏳ הציון בפומבי ב־${dm(receipt.due)}`, `⏳ Graded in public on ${dm(receipt.due)}`)} · {receipt.sealed ? L(`⛓️ חתום בביטקוין (${dm(receipt.sealDay)})`, `⛓️ Sealed in Bitcoin (${dm(receipt.sealDay)})`) : L("⛓️ נחתם בביטקוין בקריאת הבוקר", "⛓️ Sealed in Bitcoin with the morning reading")}</p>
          <p className="mt-1 text-[14px] font-extrabold">{L("ומה החוש השישי שלך אומר?", "And what does your sixth sense say?")}</p>
        </div>
      ) : null}
      <p className="text-[18px] font-black">{L("🔮 יש לך חוש שישי לטרנדים?", "🔮 Do you have a sixth sense for trends?")}</p>
      <p className="mt-1 text-[13px]" style={{ opacity: 0.85 }}>{L("הרדאר כבר בחר להיום, חתום מראש בביטקוין. עכשיו תורך: בוחרים מוצר שמתחיל לעלות, ואחרי 14 יום כולם מקבלים ציון בפומבי באותם כללים (פגיעה = +15% הזמנות).", "The radar has picked for today, sealed in advance in Bitcoin. Now it's your turn: pick a product that is starting to rise; after 14 days everyone is graded in public by the same rules (hit = +15% orders).")}</p>
      {duel ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[14px] font-bold">
          <div className="rounded-xl p-3" style={{ background: "#1f2937" }}>{L("🤖 הרדאר", "🤖 The radar")}<br /><span className="text-[22px] font-black">{duel.radar.hits}/{duel.radar.graded}</span><br /><span className="text-[12px]" style={{ opacity: 0.8 }}>{L(`פגיעות · ${duel.radar.open} פתוחות`, `hits · ${duel.radar.open} open`)}</span></div>
          <div className="rounded-xl p-3" style={{ background: "#1f2937" }}>{L(`✨ החוש השישי של ישראל (${duel.crowd.players})`, `✨ Israel's sixth sense (${duel.crowd.players})`)}<br /><span className="text-[22px] font-black">{duel.crowd.hits}/{duel.crowd.graded}</span><br /><span className="text-[12px]" style={{ opacity: 0.8 }}>{L(`פגיעות · ${duel.crowd.open} פתוחות`, `hits · ${duel.crowd.open} open`)}</span></div>
        </div>
      ) : null}
      <p className="mt-2 text-[14px] font-extrabold" style={{ color: "#fbbf24" }}>{lead}</p>
      {radarToday && name(radarToday.concept) ? <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px]">{L(`🤖 הבחירה של הרדאר היום: ${name(radarToday.concept)} · הציון ב־${dm(radarToday.due)}`, `🤖 The radar's pick today: ${name(radarToday.concept)} · graded ${dm(radarToday.due)}`)}{radarToday.rid ? <ShareButton path={`/radar?r=${radarToday.rid}#duel`} title={L(`🤖 הרדאר של LikeLink2 בחר היום את ${name(radarToday.concept)}, חתום מראש בביטקוין. הציון בפומבי ב־${dm(radarToday.due)}. יש לך חוש שישי לטרנדים?`, `LikeLink2's radar picked ${name(radarToday.concept)} today, sealed in advance in Bitcoin; graded in public on ${dm(radarToday.due)}.`)} /> : null}</p> : null}
      {(duel?.recent || []).filter((r) => r.result).slice(0, 3).map((r) => <p key={r.at + r.concept} className="mt-1 text-[13px]" style={{ opacity: 0.9 }}>{dm(r.at)} · {name(r.concept) || r.concept} · {RESULT_HE[r.result]} ({r.growth > 0 ? "+" : ""}{r.growth}%)</p>)}
      <button type="button" onClick={() => { if (box.current) { box.current.open = true; box.current.scrollIntoView({ behavior: "smooth", block: "start" }); } }} className="lx-btn mt-3" style={{ minHeight: 48, background: "#fbbf24", color: "#0b0b0b", fontWeight: 900 }}>{L("🔮 לבחור את שלי", "🔮 Make my pick")}</button>
    </div>
    <details ref={box} id="picks" className="mt-4 rounded-2xl p-3" style={{ background: "#fff", border: "1px solid var(--lx-line)" }}>
      <summary className="cursor-pointer text-[15px] font-extrabold">{L("🏆 מי זיהתה ראשונה? תבחרי ותראי אם צדקת", "🏆 Who spotted it first? Pick, and see if you were right")}</summary>
      {token ? (
        <form onSubmit={submit} className="mt-3 grid gap-2 text-[14px]">
          <select value={concept} onChange={(e) => setConcept(e.target.value)} className="rounded-xl p-2" style={{ border: "1px solid var(--lx-line)", minHeight: 44 }} aria-label={L("מוצר", "Product")}>
            <option value="">{L("בחרי מוצר שלדעתך יעלה", "Pick a product you think will rise")}</option>
            {options.map((c) => <option key={c.id} value={c.id}>{c.he}</option>)}
          </select>
          <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder={L("הכינוי שלך בטבלה", "Your nickname on the board")} maxLength={20} className="rounded-xl p-2" style={{ border: "1px solid var(--lx-line)", minHeight: 44 }} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> {L("להופיע בטבלה בכינוי הזה", "Show me on the board by this nickname")}</label>
          <button type="submit" disabled={!concept || busy} className="lx-btn lx-btn-ink" style={{ minHeight: 48 }}>{L("🏆 אני בוחרת", "🏆 I pick this")}</button>
          {msg ? <p className="font-bold">{msg}</p> : null}
          {lastPick ? <p className="flex flex-wrap items-center gap-2 font-bold">{L("🧾 לשתף את הקבלה, ובעוד 14 יום כולם יראו אם צדקת:", "🧾 Share the receipt; in 14 days everyone sees if you were right:")} <ShareButton path={`/radar?r=${lastPick.rid}#duel`} title={L(`🔮 בחרתי היום את ${name(lastPick.concept) || lastPick.concept} כמוצר שמתחיל לעלות. הבחירה נחתמת מראש בביטקוין, והציון בפומבי ב־${dm(lastPick.due)}. יש לך חוש שישי לטרנדים?`, `🔮 Today I picked ${name(lastPick.concept) || lastPick.concept} as starting to rise, sealed in advance; graded in public on ${dm(lastPick.due)}.`)} /></p> : null}
          <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("הבחירה נשמרת עם התאריך, ונבדקת אחרי 14 יום כמו הקביעות של הרדאר (פגיעה = +15% הזמנות). עד 3 בחירות פתוחות.", "Saved with the day and graded after 14 days like the radar's calls (hit = +15% orders). Up to 3 open picks.")}</p>
        </form>
      ) : (
        <p className="mt-2 text-[14px]"><Go to={STUDIO_LOGIN} className="font-bold underline">{L("התחברי", "Sign in")}</Go>{L(" כדי לבחור ולהיכנס לטבלה.", " to pick and join the board.")}</p>
      )}
      {mine?.length ? (
        <ul className="mt-3 grid gap-1 text-[13px]">
          {mine.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2">{name(p.concept) || p.concept} · {dm(p.at)} · {p.result ? `${RESULT_HE[p.result]} (${p.growth > 0 ? "+" : ""}${p.growth}%)` : L(`⏳ הציון ב־${dm(p.due)}`, `⏳ graded ${dm(p.due)}`)}{!p.result && /^[0-9a-f]{16}$/.test(String(p.rid || "")) ? <ShareButton path={`/radar?r=${p.rid}#duel`} title={L(`🔮 בחרתי ב־${dm(p.at)} את ${name(p.concept) || p.concept} כמוצר שמתחיל לעלות, חתום מראש בביטקוין. הציון בפומבי ב־${dm(p.due)}. יש לך חוש שישי לטרנדים?`, `🔮 On ${dm(p.at)} I picked ${name(p.concept) || p.concept}, sealed in advance; graded in public on ${dm(p.due)}.`)} /> : null}{p.result === "HIT" ? <ShareButton path={/^[0-9a-f]{16}$/.test(String(p.rid || "")) ? `/radar?r=${p.rid}#duel` : "/radar#duel"} title={beat ? L(`🔮 החוש השישי שלי עקף את הרדאר! זיהיתי את ${name(p.concept) || p.concept} ב־${dm(p.at)}, הבחירה חתומה מראש בביטקוין, ותוך 14 יום: +${p.growth}% הזמנות. יש לך חוש שישי לטרנדים?`, `🔮 My sixth sense passed the radar! I spotted ${name(p.concept) || p.concept} on ${dm(p.at)}, sealed in advance in Bitcoin: +${p.growth}% orders in 14 days.`) : L(`🔮 יש לי חוש שישי לטרנדים: זיהיתי את ${name(p.concept) || p.concept} ב־${dm(p.at)} לפני כולם, הבחירה חתומה מראש בביטקוין, ותוך 14 יום: +${p.growth}% הזמנות. ולך יש?`, `🔮 I have a sixth sense for trends: I spotted ${name(p.concept) || p.concept} on ${dm(p.at)}, sealed in advance in Bitcoin: +${p.growth}% orders in 14 days.`)} /> : null}</li>)}
        </ul>
      ) : null}
      {beat ? (
        <p className="mt-2 text-[15px] font-black">{L("🔮 החוש השישי שלך עקף את הרדאר: הדיוק שלך גבוה משלו, בבחירות שנחתמו מראש.", "🔮 Your sixth sense passed the radar: your accuracy is higher than its, on picks sealed in advance.")}</p>
      ) : null}
      <p className="mt-3 text-[14px] font-extrabold">{L("הטבלה", "The board")}</p>
      {table.length ? (
        <ol className="mt-1 grid gap-1 text-[13px]">
          {table.map((r) => <li key={r.rank}>{r.rank}. {r.bot ? "🤖 " : ""}{r.nick}{r.verified ? L(" ✅ צופה מאומתת", " ✅ verified scout") : ""} · {L(`פגעה ${r.hits} מתוך ${r.graded}`, `hit ${r.hits} of ${r.graded}`)}{r.accuracy !== null && r.accuracy !== undefined ? ` (${r.accuracy}%)` : ""}{r.open ? L(` · ${r.open} פתוחות`, ` · ${r.open} open`) : ""}</li>)}
        </ol>
      ) : <p className="mt-1 text-[13px]">{L("הראשונה שתבחר תופיע כאן, בראש הטבלה.", "Nobody on the board yet. The first to pick shows here.")}</p>}
      <p className="mt-2 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("✅ צופה מאומתת: לפחות 3 פגיעות ו־60% דיוק, רק מבחירות שנחתמו מראש. אי אפשר לזייף את זה.", "✅ Verified scout: at least 3 hits at 60%+, only from picks sealed in advance. It cannot be faked.")}</p>
      {pickSeal ? (
        <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>
          {L(`⛓️ כל הבחירות נחתמו בביטקוין (${dm(pickSeal.d)}, ${pickSeal.sha256.slice(0, 12)}…). לבדיקה: מורידים את שני הקבצים וגוררים ל־opentimestamps.org. `, `⛓️ Every pick is sealed in Bitcoin (${dm(pickSeal.d)}, ${pickSeal.sha256.slice(0, 12)}…). To check: download both files and drop them on opentimestamps.org. `)}
          {pickSeal.text ? <a className="underline" download={`radar-picks-${pickSeal.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(pickSeal.text)}`}>{L("הבחירות החתומות", "the sealed picks")}</a> : null}
          {pickSeal.ots.map((o) => <span key={o.cal}> · <a className="underline" download={`radar-picks-${pickSeal.d}.txt.ots`} href={`data:application/octet-stream;base64,${o.b64}`}>{L(`הוכחה (${o.cal.split(".")[0]})`, `proof (${o.cal.split(".")[0]})`)}</a></span>)}
        </p>
      ) : null}
    </details>
    </>
  );
}

function Verdict({ board, gated = false }) {
  const { L } = useL();
  if (!board?.early) return null;
  if (gated) {
    const open = board.early.open || 0;
    return (
      <section className="lx-wrap mt-6" id="verdict">
        <div className="lx-card lx-rdr-panel p-5">
          <p className="text-[18px] font-black">{open ? L(`🔒 יש עכשיו ${open} קביעות פתוחות`, `🔒 ${open} open calls right now`) : L("🔒 הקביעות החיות למנויות", "🔒 Live calls are for subscribers")}</p>
          <p className="mt-1 text-[14px]">{L("מה הרדאר קבע נשאר חתום עד הציון. כאן למטה: ההוכחה, ספר הקביעות שכבר קיבלו ציון.", "What the radar called stays sealed until graded. Below: the proof and the graded calls.")}</p>
        </div>
      </section>
    );
  }
  // On the brink: three of the four signals today. Tomorrow's reading decides (never a promise).
  const brink = (board.concepts || []).filter((c) => c.early?.level === "WATCH" && c.early.count === 3).slice(0, 5);
  // Born now: sellers rush in (listings +25%/week from a small base) before buyers search.
  const born = (board.concepts || []).filter((c) => c.factory?.born && c.early?.level !== "CALL").sort((a, b) => b.factory.weekPct - a.factory.weekPct).slice(0, 5);
  const day = String(board.at || "").slice(0, 10);
  const v = verdictOf({ ledger: board.early.ledger || [], concepts: board.concepts || [], day });
  const ledger = board.early.ledger || [];
  const name = (id) => (board.concepts || []).find((c) => c.id === id)?.he || id;
  const shareTitle = (e) => L(`הרדאר של LikeLink2 קבע ב־${dm(e.at)}: ${e.concept.he} מתחיל לעלות. הקביעה חתומה מראש בביטקוין, והציון יתפרסם בפומבי ב־${dm(e.due)}.`, `LikeLink2's radar called it on ${dm(e.at)}: ${e.concept.he} is starting to rise. Sealed in advance in Bitcoin; graded in public on ${dm(e.due)}, hit or miss.`);
  return (
    <section className="lx-wrap mt-8" id="verdict">
      <div className="lx-card lx-rdr-panel p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-bold" style={{ color: "var(--lx-muted)" }}>{L(`📣 מה הרדאר קבע היום · ${dm(day)}`, `📣 What the radar called today · ${dm(day)}`)}</p>
          <Countdown lastDaily={board.lastDaily || null} />
        </div>
        {v.calls.length ? (
          <ul className="mt-3 grid gap-3">
            {v.calls.map((e) => (
              <li key={e.concept.id}>
                <p className="text-[16px] font-extrabold">{L("🟢 היום הרדאר קבע:", "🟢 Today the radar called:")}</p>
                <p className="mt-1 text-[30px] font-black leading-9">{e.concept.he}</p>
                <p className="mt-1 text-[16px] leading-7">{L("מתחיל לעלות בעולם, ובעברית עוד שקט.", "Rising worldwide, barely searched in Hebrew yet.")}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Go to={`/radar#${e.concept.id}`} className="lx-btn lx-btn-ink" style={{ minHeight: 52, fontSize: 17 }}>{L("👉 מה לעשות עכשיו", "👉 What to do now")}</Go>
                  <ShareButton path="/radar" title={shareTitle(e)} variant="button" />
                </div>
                <p className="mt-2 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`${e.concept.early?.count || 4} מתוך 4 סימנים · חתום היום · הציון ב־${dm(e.due)}`, `${e.concept.early?.count || 4} of 4 signals · sealed today · graded ${dm(e.due)}`)}{e.concept.early?.beforeAll ? L(" · 🚀 לפני כולם", " · 🚀 before everyone") : ""}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2">
            <p className="text-[22px] font-black leading-8">{L("🔎 היום הרדאר במעקב צמוד", "⚪ No new call today")}</p>
            <p className="mt-1 text-[15px] leading-7">{L("הרדאר קובע רק כשכל 4 הסימנים מסכימים. בודקים שוב מחר בבוקר.", "The radar calls only when all four signals agree. Check again tomorrow morning.")}</p>
            {v.latestOpen ? <p className="mt-1 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L(`הקביעה האחרונה: ${v.latestOpen.concept.he} (${dm(v.latestOpen.at)}${v.latestOpen.progress !== null ? `, ${v.latestOpen.progress > 0 ? "+" : ""}${v.latestOpen.progress}% מאז` : ""}).`, `Latest call: ${v.latestOpen.concept.he} (${dm(v.latestOpen.at)}${v.latestOpen.progress !== null ? `, ${v.latestOpen.progress > 0 ? "+" : ""}${v.latestOpen.progress}% since` : ""}).`)}</p> : null}
          </div>
        )}
        {brink.length ? (
          <div className="mt-4">
            <p className="text-[14px] font-extrabold">{L("🟡 אולי מחר: חסר רק סימן אחד", "🟡 Maybe tomorrow: one signal missing")}</p>
            <ul className="mt-1 grid gap-1 text-[13px]">
              {brink.map((c) => {
                const missing = Object.entries(c.early.signals || {}).filter(([, v]) => !v).map(([k]) => SIGNAL_HE[k]).join(", ");
                return <li key={c.id}><Go to={`/radar#${c.id}`} className="font-bold underline">{c.he}</Go>{L(` · חסר: ${missing}`, ` · missing: ${missing}`)}</li>;
              })}
            </ul>
          </div>
        ) : null}
        {born.length ? (
          <div className="mt-4">
            <p className="text-[14px] font-extrabold">{L("🐣 נולד עכשיו: המוכרים כבר ממהרים, הקונים עוד לא", "🐣 Born now: sellers rush in, buyers not yet")}</p>
            <ul className="mt-1 grid gap-1 text-[13px]">
              {born.map((c) => <li key={c.id}><Go to={`/radar#${c.id}`} className="font-bold underline">{c.he}</Go>{L(` · ${c.factory.weekPct > 0 ? "+" : ""}${c.factory.weekPct}% מודעות בשבוע (${c.factory.from.toLocaleString("he-IL")} → ${c.factory.to.toLocaleString("he-IL")} ב־${c.factory.days} ימים)`, ` · ${c.factory.weekPct > 0 ? "+" : ""}${c.factory.weekPct}% listings a week (${c.factory.from} → ${c.factory.to} in ${c.factory.days} days)`)}</li>)}
            </ul>
            <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("מפעלים ומוכרים מעלים מוצר חדש לפני שמחפשים אותו. זה הסימן הכי מוקדם שהרדאר מודד.", "Factories and sellers list a new product before people search for it: the earliest sign the radar measures.")}</p>
          </div>
        ) : null}
        <PicksBox board={board} />
        {board.early.calibration ? (
          <details className="mt-4 rounded-2xl p-3 text-[13px] leading-6" style={{ background: "#fff", border: "1px solid var(--lx-line)" }}>
            <summary className="cursor-pointer font-extrabold">{L("📏 ההוכחה: כמה פעמים הרדאר פגע", "📏 The proof: how often the radar hit")}</summary>
            
            {[["sniper", L("🎯 קביעת צלף (כל 4 הסימנים)", "🎯 Sniper call (all four signals)")], ["signal", L("📈 סימון רגיל (ביקוש בלבד)", "📈 Ordinary signal (demand only)")]].map(([k, label]) => {
              const r = board.early.calibration[k];
              return <p key={k}>{label}: {r.graded ? L(`פגע ${r.hits} מתוך ${r.graded} (${r.accuracy}%)`, `hit ${r.hits} of ${r.graded} (${r.accuracy}%)`) : L(`הציונים יופיעו כאן${r.pending ? ` (${r.pending} מחכות לבדיקה)` : ""}`, `no grades yet${r.pending ? ` (${r.pending} awaiting)` : ""}`)}</p>;
            })}
            <p style={{ color: "var(--lx-muted)" }}>{L("הרדאר מבדיל בין סימון רגיל לקביעת צלף, וכאן רואים כמה פעמים כל אחד מהם באמת פגע. כל קביעה נמדדת כל יום, והציון הסופי נכתב אחרי 14 יום ונשאר גלוי.", "The radar tells an ordinary signal from a sniper call, and here you see how often each really hit. Every call is measured daily; the final grade is written after 14 days and stays public.")}</p>
          </details>
        ) : null}
        {ledger.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-[14px] font-extrabold">{L(`📖 ספר הקביעות: כל ${ledger.length} הקביעות, עם הציון`, `📖 The ledger: all ${ledger.length} calls, with their grade`)}</summary>
            <ul className="mt-2 grid gap-1 text-[13px]">
              {ledger.map((e) => {
                const ahead = Object.entries(e.firsts || {}).map(([k, d]) => [k, Math.round((Date.parse(d) - Date.parse(e.at)) / 86_400_000)]).filter(([, n]) => n > 0);
                return (
                  <li key={`${e.concept}-${e.at}`} className="flex flex-wrap gap-x-3">
                    <span className="font-bold">{dm(e.at)}</span>
                    <span>{name(e.concept)}</span>
                    <span>{e.result ? `${RESULT_HE[e.result]}${e.growth !== null ? ` (${e.growth > 0 ? "+" : ""}${e.growth}%)` : ""}` : e.progress !== null ? L(`⏳ יום ${e.dayN} מתוך 14 · ${e.progress > 0 ? "+" : ""}${e.progress}% מאז הקביעה (פגיעה = +15%)`, `⏳ day ${e.dayN} of 14 · ${e.progress > 0 ? "+" : ""}${e.progress}% since the call (hit = +15%)`) : L(`⏳ הציון ב־${dm(e.due)}`, `⏳ graded ${dm(e.due)}`)}</span>
                    {ahead.length ? <span>{L(`🚀 הקדים: ${ahead.map(([k, n]) => `${FINISH_HE[k]} ב־${n} ימים`).join(", ")}`, `🚀 ahead: ${ahead.map(([k, n]) => `${k} by ${n} days`).join(", ")}`)}</span> : null}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

/** New listings that start to run (freshRisers.js): measured, dated, the store's own words. */
// 🏭 For factories and sellers (supplyGap.js): the kinds whose orders grow faster than the listings.
/** 🏭 The factories that jump (factorySignal.js): stores whose new listings run together, by the store's own numbers. */
function Factories({ f }) {
  const { L } = useL();
  return (
    <section className="lx-wrap mt-8" id="factories">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🏭 מפעלים שקופצים עכשיו", "🏭 Factories jumping now")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L(`לפני שמוצר הופך לטרנד, המפעל מתחיל למכור אותו. מתוך ${f.factories} חנויות של מפעלים עם מוצרים חדשים, ב־${f.jumping} כמה מוצרים חדשים רצים יחד (לפי החציון, כך שרק כמה מוצרים יחד קובעים). המספרים של אליאקספרס עצמה.`, `Before a product is a trend, the factory starts selling it. Of ${f.factories} factory stores with new listings, in ${f.jumping} several new listings run together (by the median, so one listing cannot mislead). AliExpress's own numbers.`)}</p>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {f.top.map((r) => (
            <li key={r.shop} className="lx-card lx-rdr-item p-3">
              <p className="text-[15px] font-extrabold">{L(`חנות מפעל ${r.shop}`, `Factory store ${r.shop}`)}</p>
              <p className="mt-1 text-[13px] font-bold" style={{ color: "#067647" }}>{L(`${r.listings} מוצרים חדשים · החציון +${r.medianWeekPct}% בשבוע`, `${r.listings} new listings · median +${r.medianWeekPct}% a week`)}</p>
              <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`ההזמנות שלהם יחד ב־30 יום: ${r.ordersBefore?.toLocaleString("he-IL")} ← ${r.orders?.toLocaleString("he-IL")}`, `Their orders in 30 days together: ${r.ordersBefore?.toLocaleString("en-US")} → ${r.orders?.toLocaleString("en-US")}`)}</p>
              <p className="mt-1 text-[13px]">{L(`המוביל: ${r.lead.title}`, `Leading: ${r.lead.title}`)}</p>
              <a className="underline text-[12px]" href={`https://www.aliexpress.com/store/${r.shop}`} target="_blank" rel="noopener noreferrer">{L("לחנות של המפעל", "The factory's store")}</a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** ✉️ The sealed envelopes (radarGate.envelopesOf): the open calls behind the lock, never what is inside. */
const ENVELOPE_BOOK = { early: ["🚀 קביעה לפני כולם", "🚀 A before-everyone call"], fresh: ["🆕 מוצר חדש", "🆕 A new product"], kinds: ["🧬 סוג חדש", "🧬 A new kind"] };
// The time left to an envelope's opening: the grading run reads the morning of its due day (05:37 UTC).
function opensIn(due, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due || ""))) return null;
  const ms = Date.parse(`${due}T05:37:00Z`) - now;
  if (!Number.isFinite(ms) || ms <= 0) return { d: 0, h: 0, m: 0, today: true };
  return { d: Math.floor(ms / 86_400_000), h: Math.floor((ms % 86_400_000) / 3_600_000), m: Math.floor((ms % 3_600_000) / 60_000), today: false };
}

function Envelopes({ list, onOpen }) {
  const { L } = useL();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const moving = list.filter((e) => Number.isFinite(e.change) && e.change > 0).length;
  // The hottest envelope: the biggest measured change since its seal (a measurement, never a promise).
  const hot = list.reduce((best, e, i) => (Number.isFinite(e.change) && e.change > 0 && (best < 0 || e.change > list[best].change) ? i : best), -1);
  const next = list.map((e) => opensIn(e.due, now)).filter(Boolean).sort((a, b) => a.d * 1440 + a.h * 60 + a.m - (b.d * 1440 + b.h * 60 + b.m))[0];
  const left = (o) => (o.today ? L("נפתחת הבוקר", "Opens this morning") : L(`נפתחת בעוד ${o.d ? `${o.d} ימים ו־` : ""}${o.h} שעות ו־${o.m} דקות`, `Opens in ${o.d ? `${o.d} days, ` : ""}${o.h} h ${o.m} min`));
  const shareText = (e) => {
    const what = L(ENVELOPE_BOOK[e.book][0].replace(/^\S+\s/, ""), ENVELOPE_BOOK[e.book][1].replace(/^\S+\s/, ""));
    const where = e.area && AREA_HE[e.area] ? L(` בתחום ${AREA_HE[e.area]}`, "") : "";
    const moved = Number.isFinite(e.change) && e.change > 0 ? L(` ומאז ההזמנות עלו +${e.change}%`, ` and its orders are up +${e.change}% since`) : "";
    return L(`✉️ ברדאר של LikeLink2 יש מעטפה חתומה: ${what}${where}. הרדאר חתם עליה בביטקוין ב־${dm(e.sealed)}${moved}. היא נפתחת לכולם ב־${dm(e.due)}. מה לדעתך יש בפנים?`, `✉️ LikeLink2's radar holds a sealed envelope: ${what}. Sealed in Bitcoin on ${dm(e.sealed)}${moved}. It opens to everyone on ${dm(e.due)}. What do you think is inside?`);
  };
  return (
    <section className="lx-wrap mt-6" id="envelopes">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L(`✉️ ${list.length} מעטפות חתומות${moving ? `. ב־${moving} ההזמנות כבר זזות` : ""}`, `✉️ ${list.length} sealed envelopes${moving ? `. ${moving} already moving` : ""}`)}</h2>
        <p className="mt-1 text-[14px] leading-6">{L("בכל מעטפה קביעה שהרדאר כבר חתם בביטקוין, והיא נשארת בדיוק כמו שנחתמה. מה שרואים מבחוץ הם רק הרמזים שהרדאר מדד ביום החתימה: התחום, הקצב, כמה מעט מוכרים יש בעולם, ובכמה מדינות מחפשים. מה בפנים? המנויות רואות עכשיו. כולם רואים ביום הציון, פגיעה או פספוס.", "Each envelope holds a call the radar already sealed in Bitcoin; it stays exactly as sealed. From outside you see only the clues the radar measured on the day of the seal: the area, the pace, how few sellers the world has, how many countries search it. What's inside? Members see it now. Everyone sees it on grading day, hit or miss.")}</p>
        {next ? <p className="mt-2 text-[14px] font-extrabold">{L("⏳ המעטפה הבאה: ", "⏳ The next envelope: ")}{left(next)}</p> : null}
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {list.map((e, i) => {
            const o = opensIn(e.due, now);
            return (
              <li key={`${e.book}-${e.sealed}-${i}`} className="lx-card lx-rdr-item p-3" style={i === hot ? { outline: "2px solid #067647" } : undefined}>
                {i === hot ? <p className="text-[12px] font-extrabold" style={{ color: "#067647" }}>{L("🔥 המעטפה הכי חמה עכשיו", "🔥 The hottest envelope right now")}</p> : null}
                <p className="text-[15px] font-extrabold">{L(ENVELOPE_BOOK[e.book][0], ENVELOPE_BOOK[e.book][1])} · 🔒</p>
                <p className="mt-1 text-[13px]">{L(`נחתם ב־${dm(e.sealed)}${e.dayN ? ` · יום ${e.dayN} מתוך 14` : ""}`, `Sealed on ${dm(e.sealed)}${e.dayN ? ` · day ${e.dayN} of 14` : ""}`)}</p>
                {e.area && AREA_HE[e.area] ? <p className="text-[13px]">{L(`📍 רמז: בתחום ${AREA_HE[e.area]}`, `📍 Clue: in ${e.area}`)}</p> : null}
                {Number.isFinite(e.pace) && e.pace > 0 ? <p className="text-[13px]">{L(`⚡ רמז: רץ בקצב של +${e.pace}% בשבוע`, `⚡ Clue: running at +${e.pace}% a week`)}</p> : null}
                {Number.isFinite(e.similar) ? <p className="text-[13px]">{L(`🏪 רמז: רק ${e.similar.toLocaleString("he-IL")} מודעות דומות בכל העולם`, `🏪 Clue: only ${e.similar.toLocaleString("en-US")} similar listings worldwide`)}</p> : null}
                {Number.isFinite(e.countries) && Number.isFinite(e.measured) ? <p className="text-[13px]">{L(`🌍 רמז: מחפשים אותו ב־${e.countries} מתוך ${e.measured} מדינות`, `🌍 Clue: searched in ${e.countries} of ${e.measured} countries`)}</p> : null}
                {Number.isFinite(e.change) ? <p className="text-[13px] font-bold" style={{ color: e.change > 0 ? "#067647" : "var(--lx-muted)" }}>{L(`ההזמנות מאז החתימה: ${e.change > 0 ? "+" : ""}${e.change}%`, `Orders since the seal: ${e.change > 0 ? "+" : ""}${e.change}%`)}</p> : null}
                <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{o ? `${left(o)} · ${dm(e.due)}` : L("נפתחת ביום הציון", "Opens on grading day")}</p>
                <div className="mt-2"><ShareButton path="/radar" title={shareText(e)} variant="button" /></div>
              </li>
            );
          })}
        </ul>
        <button type="button" className="lx-btn lx-btn-ink mt-4" onClick={onOpen}>{L("לפתוח את המעטפות עכשיו", "Open the envelopes now")}</button>
      </div>
    </section>
  );
}

/** 🚢 What the factories ship (tradeSignal.js): EU customs lines that doubled, against the same months a year earlier. */
function Trade({ t }) {
  const { L } = useL();
  const months = (t.months || []).slice().sort();
  const span = months.length ? `${months[0].slice(5)}–${months.at(-1).slice(5)}.${months.at(-1).slice(0, 4)}` : t.latest;
  const rows = (t.partners || []).flatMap((p) => p.top.map((r) => ({ ...r, partner: p.id })));
  const total = (t.partners || []).reduce((s, p) => s + (p.measured || 0), 0);
  const jumping = (t.partners || []).reduce((s, p) => s + (p.jumping || 0), 0);
  const eur = (x) => `€${(x / 1e6).toLocaleString("he-IL", { maximumFractionDigits: 1 })}M`;
  return (
    <section className="lx-wrap mt-8" id="trade">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🚢 מה המפעלים בעולם שולחים יותר", "🚢 What the world's factories ship more of")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L(`כל מוצר שנכנס לאירופה מוצהר במכס, ונתוני המכס פתוחים לכולם. הרדאר קורא אותם לכל סוג מוצר, מ${(t.partners || []).map((p) => PARTNER_NAMES[p.id]?.he).filter(Boolean).join(", ")}: ${total.toLocaleString("he-IL")} סוגי מוצרים לקונים שנמדדו, וב־${jumping} מהם המשלוחים של המפעלים לפחות הוכפלו (${span} מול אותם חודשים לפני שנה, גם בשווי וגם במשקל). נתוני Eurostat הרשמיים, שמתפרסמים כשישה שבועות אחרי סוף החודש.`, `Every product entering Europe is declared at customs, and the customs records are open to all. The radar reads them for every product line, from ${(t.partners || []).map((p) => PARTNER_NAMES[p.id]?.en).filter(Boolean).join(", ")}: ${total.toLocaleString("en-US")} consumer lines measured, and in ${jumping} the factories' shipments at least doubled (${span} against the same months a year earlier, in value and in weight). Eurostat's official data, published about six weeks after each month.`)}</p>
        {rows.length ? (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {rows.sort((a, b) => b.valuePct - a.valuePct).slice(0, 12).map((r) => (
              <li key={`${r.partner}-${r.code}`} className="lx-card lx-rdr-item p-3">
                <p className="text-[13px] font-bold">{L(`מ${PARTNER_NAMES[r.partner]?.he || r.partner} · קוד מכס ${r.code}`, `From ${PARTNER_NAMES[r.partner]?.en || r.partner} · customs line ${r.code}`)}</p>
                <p className="mt-1 text-[14px]" dir="ltr" style={{ textAlign: "start" }}>{r.label}</p>
                <p className="mt-1 text-[13px] font-bold" style={{ color: "#067647" }}>{L(`+${r.valuePct}% בשווי${Number.isFinite(r.kgPct) ? ` · +${r.kgPct}% במשקל` : ""}`, `+${r.valuePct}% in value${Number.isFinite(r.kgPct) ? ` · +${r.kgPct}% in weight` : ""}`)}</p>
                <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`${eur(r.prev)} ← ${eur(r.value)} בשלושה חודשים`, `${eur(r.prev)} → ${eur(r.value)} in three months`)}</p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-[14px]">{L("החודש המשלוחים יציבים: עוד שקט.", "This month the shipments are steady: still quiet.")}</p>}
        <p className="mt-3 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("התיאור הוא המילים של המכס עצמו. כל אחד יכול לבדוק את אותו קוד באתר של Eurostat.", "The description is the customs' own words. Anyone can check the same line on Eurostat's site.")} <a className="underline" href="https://ec.europa.eu/eurostat/comext/newxtweb/" target="_blank" rel="noopener noreferrer">Eurostat Comext</a></p>
      </div>
    </section>
  );
}

/** 🔤 The names new shops pick (shopSignal.js): product words in the names of every new domain in the world. */
function ShopWords({ s }) {
  const { L } = useL();
  return (
    <section className="lx-wrap mt-8" id="shopwords">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🔤 על מה פותחים חנויות חדשות בעולם", "🔤 What the world's new shops are named after")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L(`לפני שמוצר הופך לטרנד, אנשים פותחים לו חנות ובוחרים לה שם (לסקווישי היו buttersquishy.com ו־tabasquishy.com). הרדאר קורא כל בוקר את הרשימה הציבורית של כל האתרים שנרשמו בעולם ביום הקודם, ישר מהשמות עצמם: הוא מוצא בהם ${s.vocab.toLocaleString("he-IL")} מילים של מוצרים, ומחפש מילה או צמד מילים שהרבה יותר חנויות חדשות נקראות על שמם השבוע.`, `Before a product is a trend, people open a shop for it and name it (the squishy had buttersquishy.com and tabasquishy.com). Every morning the radar reads the public list of every website registered in the world the day before, with no list prepared in advance: it finds ${s.vocab.toLocaleString("en-US")} product words in the names and looks for a word or pair that many more new shops took this week.`)}</p>
        {s.measuring ? (
          <p className="mt-2 text-[14px] font-bold">{L(`נמדד: ${s.days} ימים של רשימות. ההשוואה של שבוע מול השבועות שלפניו מתחילה מ־10 ימים.`, `Measured: ${s.days} days of lists. The week-against-the-weeks-before comparison starts at 10 days.`)}</p>
        ) : s.rising.length ? (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {s.rising.map((r) => (
              <li key={r.key} className="lx-card lx-rdr-item p-3">
                <p className="text-[16px] font-extrabold" dir="ltr" style={{ textAlign: "start" }}>{r.key}</p>
                <p className="mt-1 text-[13px] font-bold" style={{ color: "#067647" }}>{L(`${r.week} חנויות חדשות השבוע · פי ${r.times} מהקצב שלפני`, `${r.week} new shops this week · ×${r.times} the rate before`)}</p>
                {r.added ? <p className="text-[12px]">{L("📡 הצטרף לרדאר: מהבוקר הבא הוא נמדד כמו כל סוג", "📡 Joined the radar: measured like every kind from tomorrow morning")}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-[14px]">{L("השבוע שמות החנויות החדשות יציבים: עוד שקט.", "This week the new shops' names are steady: still quiet.")}</p>}
      </div>
    </section>
  );
}

function SupplyList({ board }) {
  const { L } = useL();
  const top = (board?.supply?.top || []).map((id) => (board.concepts || []).find((c) => c.id === id)).filter((c) => c?.supply);
  if (!top.length) return null;
  return (
    <section className="lx-wrap mt-8" id="supply">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🏭 איפה הביקוש רץ מהר מהמוכרים", "🏭 Where demand outruns the sellers")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L(`למפעלים ולמוכרים: מתוך ${board.supply.measured} סוגים שנמדדו הבוקר, ב־${board.supply.under} ההזמנות גדלות מהר יותר ממספר המודעות. המספרים של אליאקספרס, עם תאריכים.`, `For factories and sellers: of ${board.supply.measured} kinds measured this morning, in ${board.supply.under} the orders grow faster than the listings. AliExpress's own numbers, dated.`)}</p>
        {board.supply.record ? (
          <p className="mt-2 text-[13px] font-bold leading-6">
            {(() => {
              const r = board.supply.record;
              const head = L(`📦 כל "מקום לייצר" נחתם מראש בביטקוין, ואחרי ${r.gradeDays} יום בודקים אם מוכרים ומפעלים חדשים נכנסו בעקבות הרדאר (מודעות +${r.followPct}%).`, `📦 Every "room to make it" is sealed in Bitcoin in advance; after ${r.gradeDays} days we check whether new sellers and factories followed the radar (listings +${r.followPct}%).`);
              const rec = r.graded
                ? L(` עד היום: ב־${r.followed} מתוך ${r.graded} נכנסו מוכרים ומפעלים חדשים${r.control.graded ? `, לעומת ${r.control.followed} מתוך ${r.control.graded} בסוגים המאוזנים` : ""}.`, ` So far: new sellers came in ${r.followed} of ${r.graded}${r.control.graded ? `, against ${r.control.followed} of ${r.control.graded} in the balanced kinds` : ""}.`)
                : r.nextDue ? L(` הבדיקה הראשונה: ${dm(r.nextDue)}.`, ` The first check: ${dm(r.nextDue)}.`) : "";
              return head + rec;
            })()}
          </p>
        ) : null}
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {top.map((c) => (
            <li key={c.id} className="lx-card lx-rdr-item p-3">
              <p className="text-[15px] font-extrabold">{c.he}</p>
              <p className="mt-1 text-[13px] font-bold" style={{ color: "#067647" }}>{L(supplyLine(c.supply, "he"), supplyLine(c.supply, "en"))}</p>
              <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`${c.supply.orders?.toLocaleString("he-IL")} הזמנות ב־30 יום · ${c.supply.listings?.toLocaleString("he-IL")} מודעות · על פני ${c.supply.days} ימים`, `${c.supply.orders?.toLocaleString("en-US")} orders in 30 days · ${c.supply.listings?.toLocaleString("en-US")} listings · over ${c.supply.days} days`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FreshRisers({ fresh, world = null, gap = null, day = null }) {
  const { L } = useL();
  if (!fresh) return null;
  return (
    <section className="lx-wrap mt-8" id="fresh">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🆕 מוצרים חדשים שמתחילים לרוץ", "🆕 New products starting to run")}</h2>
        <p className="mt-1 text-[15px] leading-7">{L("מוצרים קטנים שההזמנות שלהם רצות, לפני שכולם מוכרים אותם.", "Small products whose orders run, before everyone sells them.")}</p>
        <details className="lx-rdr-how mt-1">
          <summary>{L("איך הרדאר בוחר", "How the radar picks")}</summary>
          <p className="mt-2 text-[13px] leading-6">{L("הרדאר מוצא לבד: כל בוקר הוא עובר על המודעות החדשות של השנה בכל הקטגוריות, ומציג רק מוצר שעוד קטן (עד 3,000 הזמנות בחודש), שההזמנות שלו גדלות ב־40% בשבוע או יותר וההאצה החזיקה שתי מדידות ברצף, ושעוד שקט סביבו: פחות מ־2,000 מודעות דומות באליאקספרס, ובגוגל בארה״ב עוד שקט סביב ״טיקטוק״, ״ויראלי״ ו״אמזון״. ואז מול כל העולם: אותן מילים בהשלמות החיפוש של גוגל בכל המדינות שהרדאר קורא, בכל היבשות, ומוצג רק מוצר שבפחות ממחצית מהן מחפשים אותו, ובאף אחת מהן אין סביבו ״טיקטוק״, ״ויראלי״ או ״אמזון״. כאן מופיעים רק מוצרים טריים. המספרים של אליאקספרס, עם תאריכים.", "The radar finds these on its own, with no list: every morning it goes through this year's new listings in every category and shows only a product that is still small (up to 3,000 orders a month), whose orders grow 40% a week or more, with the acceleration held over two readings, and that nobody talks about yet: under 2,000 similar listings on AliExpress and no 'tiktok', 'viral' or 'amazon' in Google's US suggestions. Then against the whole world: the same words in Google's suggestions in every country the radar reads, on every continent, shown only when fewer than half of them search it and none has 'tiktok', 'viral' or 'amazon'. What the market is saturated with never shows here. AliExpress's own numbers, dated.")}</p>
        </details>
        {world?.categories ? <p className="mt-1 text-[13px] font-bold">{L(`🌍 בכל הקטגוריות בעולם: הרדאר עובר על כל ${world.categories.toLocaleString("he-IL")} הקטגוריות של אליאקספרס, ${world.readToday} בכל בוקר${world.fashionDaily ? `: ${world.fashionDaily} קטגוריות האופנה כל יום, והשאר` : ","} בסבב של ${world.fullRoundDays} ימים.`, `🌍 Every category: the radar goes through all ${world.categories.toLocaleString("en-US")} AliExpress categories, ${world.readToday} every morning${world.fashionDaily ? `: the ${world.fashionDaily} fashion categories every day, the rest` : ","} in a ${world.fullRoundDays}-day round.`)}</p> : null}
        {gap?.measured ? <p className="mt-1 text-[13px] font-bold">{L(`🌍 הפער מול כל העולם: הבוקר נבדקו ${gap.measured} סוגים ומוצרים בהשלמות החיפוש של גוגל, עד ${gap.maxAnswered} מדינות לכל אחד, ב־${gap.regions} אזורים. ${gap.states.WORLD_QUIET + gap.states.FIRST_SIGNS} מהם עוד שקטים כמעט בכל העולם.`, `🌍 The gap against the whole world: this morning ${gap.measured} kinds and products were checked in Google's search suggestions, up to ${gap.maxAnswered} countries each, in ${gap.regions} regions. ${gap.states.WORLD_QUIET + gap.states.FIRST_SIGNS} of them are still quiet almost everywhere.`)}</p> : null}
        <p className="mt-2 text-[13px] font-bold">{fresh.record?.graded ? L(`📏 הציון בפומבי: מתוך ${fresh.record.graded} מוצרים שהרדאר הצביע עליהם, ${fresh.record.hits} עלו ב־50% או יותר תוך 14 יום (${fresh.record.accuracy}%).`, `📏 Public grade: of ${fresh.record.graded} products the radar pointed to, ${fresh.record.hits} grew 50%+ within 14 days (${fresh.record.accuracy}%).`) : fresh.record?.pending ? L(`📏 כל מוצר שמוצג כאן נשמר עם תאריך ונבדק אחרי 14 יום: פגע אם ההזמנות שלו עלו ב־50% או יותר. ${fresh.record.pending} מחכים לבדיקה, הראשונה ב־${dm(fresh.record.nextDue)}.`, `📏 Every product shown is saved with its date and graded after 14 days: a hit if its orders grew 50%+. ${fresh.record.pending} waiting, the first on ${dm(fresh.record.nextDue)}.`) : L("📏 כל מוצר שיוצג כאן יישמר עם תאריך וייבדק אחרי 14 יום, בפומבי: פגע אם ההזמנות שלו עלו ב־50% או יותר, וגם החטאות יישארו כאן.", "📏 Every product shown here is saved with its date and graded after 14 days, in public: a hit if its orders grew 50%+; misses stay here too.")}</p>
        {fresh.recent?.length ? <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>{fresh.recent.map((c) => `${c.result === "HIT" ? "✅" : "❌"} ${c.title.slice(0, 40)} (${dm(c.at)}, ${c.growth > 0 ? "+" : ""}${c.growth}%)`).join(" · ")}</p> : null}
        {fresh.risers.length ? (
          <>
            <p className="mt-2 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("#פרסומת · כפתור החנות הוא קישור שותפים", "#ad · the store button is an affiliate link")}</p>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {fresh.risers.map((r) => (
                <li key={r.id} className="lx-card lx-rdr-item p-3">
                  <div className="flex items-start gap-3">
                    <div style={{ width: 64, height: 64, flex: "0 0 64px", borderRadius: 12, overflow: "hidden", background: "#fff" }}><Img src={r.image} alt={r.title} loading="lazy" style={{ width: 64, height: 64, objectFit: "cover" }} /></div>
                    <p className="min-w-0 flex-1 text-[13px] font-bold leading-5" dir="ltr" style={{ textAlign: "start" }}>{r.title}</p>
                  </div>
                  <FindFacts f={r} kind="fresh" day={day} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <a href={r.buy} target="_blank" rel="noopener sponsored" onClick={() => recordExit(`fresh-${r.category || "new"}`, r.buy)} className="lx-btn lx-btn-ink" style={{ minHeight: 34, padding: "4px 12px", fontSize: 12 }}>{L("לחנות", "Store")} <ExternalLink size={12} aria-hidden="true" /></a>
                    {r.check ? <Go to={r.check} className="lx-btn lx-btn-ghost" style={{ minHeight: 34, padding: "4px 12px", fontSize: 12 }}>{L("מה לבדוק", "What to check")}</Go> : null}
                    <Go to={`/studio/add-product?from=radar&u=${encodeURIComponent(`https://www.aliexpress.com/item/${r.id}.html`)}`} className="lx-btn lx-btn-ghost" style={{ minHeight: 34, padding: "4px 12px", fontSize: 12 }} data-tip={L("פותח את הסטודיו עם המוצר, ואת מדביקה את קישור השותפים שלך", "Opens your studio with the item; you paste your own affiliate link")}>{L("📲 לחנות שלי", "📲 To my store")}</Go>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px]" style={{ color: "var(--lx-muted)" }}>{L("קצב של שבוע הוא הסימן המוקדם, והציון אחרי 14 יום מראה אם פגע. השם הוא המילים של המוכר באליאקספרס.", "A week's pace is the early sign; the grade after 14 days shows whether it hit. The name is the seller's own words on AliExpress.")}</p>
          </>
        ) : (
          <p className="mt-3 text-[14px] font-bold">{fresh.tracking ? L(`הרדאר עוקב מ־${dm(fresh.since)} אחרי ${fresh.tracking} מודעות חדשות של השנה. מוצר יופיע כאן רק כשההאצה שלו תחזיק שתי מדידות ברצף, אז הראשונים יופיעו בעוד כמה ימים. עד אז הרדאר מודד.`, `Tracking ${fresh.tracking} new listings since ${dm(fresh.since)}. Fast risers show here once two readings are at least 3 days apart.`) : L("הרדאר מתחיל לעקוב אחרי מודעות חדשות של השנה מהבדיקה הבאה.", "The radar starts tracking this year's new listings from the next reading.")}</p>
        )}
        <FindsWatch watch={fresh.watch || []} />
        <StoreExport finds={[...(fresh.risers || []), ...(fresh.watch || []).filter((w) => w.exit !== "EXIT")]} />
      </div>
    </section>
  );
}

/**
 * New kinds found by meaning (src/lib/growth/newKinds.js; the owner, 2026-11-20: "כן לשתיהן"): an open
 * AI model reads every new listing's title each morning and groups them by meaning, so a new kind
 * shows here before it has one name. Only what was measured: the median weekly growth of its new
 * listings, their orders, the store's own words; every kind shown is sealed and graded in public.
 */
function NewKinds({ kinds, day = null }) {
  const { L } = useL();
  if (!kinds) return null;
  const rec = kinds.record || {};
  return (
    <section className="lx-wrap mt-8" id="kinds">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🧬 סוגים חדשים שהבינה המלאכותית של הרדאר מצאה", "🧬 New kinds the radar's AI found")}</h2>
        <p className="mt-1 text-[15px] leading-7">{L("סוגים חדשים של מוצרים, שהבינה המלאכותית של הרדאר מצאה לפי משמעות.", "New kinds of products the radar's AI found by meaning.")}</p>
        <details className="lx-rdr-how mt-1">
          <summary>{L("איך הבינה המלאכותית מוצאת", "How the AI finds them")}</summary>
          <p className="mt-2 text-[13px] leading-6">{L(`כל בוקר מודל בינה מלאכותית פתוח קורא את הכותרות של ${(kinds.tracked || 0).toLocaleString("he-IL")} מודעות חדשות של השנה ומקבץ אותן לפי משמעות, גם כשכל מוכר קורא למוצר בשם אחר. סוג חדש מופיע כאן כששלוש מודעות חדשות שלו או יותר גדלות יחד: החציון שלהן עולה ב־25% בשבוע או יותר, והסוג עוד קטן, ושעוד שקט סביבו בעולם: פחות מ־2,000 מודעות בשם הזה, ובגוגל בארה״ב עוד שקט. מודעה אחת שהתפוצצה לבד נשארת בחוץ. השם הוא המילים של המוכרים.`, `Every morning an open AI model reads the titles of ${(kinds.tracked || 0).toLocaleString("en-US")} new listings of the year and groups them by meaning, even when every seller names the product differently. A new kind shows here when three or more of its new listings grow together: their median grows 25% a week or more, and the kind is still small and quiet worldwide: under 2,000 listings by its name and quiet in Google's US suggestions. One listing that took off alone stays out. The name is the sellers' own words.`)}</p>
        </details>
        <p className="mt-2 text-[13px] font-bold">{rec.graded ? L(`📏 הציון בפומבי: מתוך ${rec.graded} סוגים שהרדאר הצביע עליהם, ${rec.hits} עלו ב־50% או יותר תוך 14 יום (${rec.accuracy}%).`, `📏 Public grade: of ${rec.graded} kinds the radar pointed to, ${rec.hits} grew 50%+ within 14 days (${rec.accuracy}%).`) : rec.pending ? L(`📏 כל סוג שמוצג כאן נחתם ונבדק אחרי 14 יום על אותן מודעות: פגע אם ההזמנות שלהן יחד עלו ב־50% או יותר. ${rec.pending} מחכים לבדיקה, הראשונה ב־${dm(rec.nextDue)}.`, `📏 Every kind shown here is sealed and graded after 14 days on the same listings: a hit if their orders together grew 50%+. ${rec.pending} waiting, the first on ${dm(rec.nextDue)}.`) : L("📏 כל סוג שיוצג כאן ייחתם וייבדק אחרי 14 יום על אותן מודעות, בפומבי: פגע אם ההזמנות שלהן יחד עלו ב־50% או יותר, וגם החטאות יישארו כאן.", "📏 Every kind shown here is sealed and graded after 14 days on the same listings, in public: a hit if their orders together grew 50%+; misses stay here too.")}</p>
        {kinds.recent?.length ? <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }} dir="ltr">{kinds.recent.map((c) => `${c.result === "HIT" ? "✅" : "❌"} ${c.en} (${dm(c.at)}, ${c.growth > 0 ? "+" : ""}${c.growth}%)`).join(" · ")}</p> : null}
        {kinds.list?.length ? (
          <>
            <p className="mt-2 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("#פרסומת · כפתורי החנות הם קישורי שותפים", "#ad · the store buttons are affiliate links")}</p>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {kinds.list.map((k) => (
                <li key={k.en} className="lx-card lx-rdr-item p-3">
                  <p className="text-[17px] font-black" dir="ltr" style={{ textAlign: "start" }}>{k.en}</p>
                  <p className="text-[12px] font-bold" style={{ color: "var(--lx-muted)" }}>{k.via === "look" ? L("👁️ נמצא לפי המראה בתמונות החנות: אותו עיצוב בכמה מודעות", "👁️ Found by look in the store photos: the same design across listings") : L("🧬 נמצא לפי המשמעות של השמות", "🧬 Found by the meaning of the titles")}</p>
                  <FindFacts f={k} kind="kinds" day={day} />
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {k.samples.map((m) => (
                      <a key={m.id} href={m.buy} target="_blank" rel="noopener sponsored" onClick={() => recordExit(`kind-${k.category || "new"}`, m.buy)} title={m.title} style={{ display: "block", borderRadius: 10, overflow: "hidden", border: "1px solid var(--lx-line)" }}>
                        <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#fff" }}><Img src={m.image} alt={m.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
                        <span className="block px-1 py-0.5 text-center text-[11px] font-bold">{m.weekPct !== null ? `+${m.weekPct}%` : ""} <ExternalLink size={10} aria-hidden="true" /></span>
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-[14px] font-bold">{L(`עוד שקט 🤫 הבינה המלאכותית קוראת ${(kinds.tracked || 0).toLocaleString("he-IL")} מודעות חדשות כל בוקר. סוג חדש יופיע כאן ביום ששלוש מודעות שלו יגדלו יחד.`, `Still quiet 🤫 The AI reads ${(kinds.tracked || 0).toLocaleString("en-US")} new listings every morning. A new kind shows here on the day three of its listings grow together.`)}</p>
        )}
      </div>
    </section>
  );
}

/**
 * The radar's brain (src/lib/growth/radarBrain.js; the owner, 2026-11-20: "כן למוח"): what it learned
 * from every graded call that recorded its signals the day it was made — each signal's record with and
 * without it, and the weekly learning curve. History only; its state is sealed every day.
 */
/**
 * 🚪 After the radar found it (radarCore.js exitSignal): every earlier find still in its 14 days, read
 * again today, with its own numbers and one state — still running, slowing, or time to exit.
 */
function FindsWatch({ watch = [] }) {
  const { L } = useL();
  if (!watch.length) return null;
  const tone = { RUNNING: "is-run", SLOWING: "is-slow", EXIT: "is-exit", MEASURING: "is-slow" };
  return (
    <div className="mt-6" id="watch">
      <h3 className="text-[18px] font-black">{L("🚪 אחרי שהרדאר מצא: מתי לעצור", "🚪 After the radar found it: when to stop")}</h3>
      <p className="mt-1 text-[13px] leading-6" style={{ color: "var(--lx-muted)" }}>{L("הרדאר ממשיך לקרוא כל מוצר שמצא, כל יום, 14 יום, ואומר לפי המספרים שלו: עדיין רץ, מאט, או זמן לצאת.", "The radar keeps reading every product it found, every day for 14 days, and says from its own numbers: still running, slowing, or time to exit.")}</p>
      <ul className="mt-3 grid gap-2">
        {watch.map((w) => (
          <li key={w.id} className="lx-card lx-rdr-item flex items-center gap-3 p-3">
            {w.image ? <div style={{ width: 48, height: 48, flex: "0 0 48px", borderRadius: 10, overflow: "hidden" }}><Img src={w.image} alt={w.title} loading="lazy" style={{ width: 48, height: 48, objectFit: "cover" }} /></div> : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold" dir="ltr" style={{ textAlign: "start" }}>{w.title}</p>
              <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`נמצא ב־${dm(w.called)} · יום ${w.dayN} מתוך 14`, `Found ${dm(w.called)} · day ${w.dayN} of 14`)}{w.progress !== null ? L(` · הזמנות \u2066${w.progress > 0 ? "+" : ""}${w.progress}%\u2069 מאז`, ` · orders ${w.progress > 0 ? "+" : ""}${w.progress}% since`) : ""}{w.weekPct !== null ? L(` · קצב \u2066${w.weekPct > 0 ? "+" : ""}${w.weekPct}%\u2069 בשבוע`, ` · pace ${w.weekPct > 0 ? "+" : ""}${w.weekPct}% a week`) : ""}</p>
            </div>
            <span className={`lx-rdr-pill ${tone[w.exit]}`} data-tip={w.why ? L(EXIT_WHY[w.why].he, EXIT_WHY[w.why].en) : undefined}>{L(EXIT_LABELS[w.exit].he, EXIT_LABELS[w.exit].en)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * ⬇️ The radar's finds into a Wix store in one file (radarExport.js): Wix's own import format,
 * every product hidden until the merchant checks it, the store's price × her markup.
 */
function StoreExport({ finds = [] }) {
  const { L } = useL();
  const [markup, setMarkup] = useState(EXPORT.markup);
  const ok = finds.filter(exportable);
  if (!ok.length) return null;
  const download = () => {
    const { csv } = wixCsv(ok, { markup });
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `radar-wix-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* a browser without Blob downloads keeps the page as it is */ }
  };
  return (
    <div className="lx-card lx-rdr-item mt-6 p-4" id="export">
      <h3 className="text-[17px] font-black">{L("⬇️ מהרדאר לחנות Wix שלך, בקובץ אחד", "⬇️ From the radar to your Wix store, in one file")}</h3>
      <p className="mt-1 text-[13px] leading-6">{L(`${ok.length} מוצרים בפורמט הייבוא של Wix. כולם נכנסים מוסתרים, כך ששום דבר עולה לאוויר לפני שבדקת. בעלות: המחיר בחנות היום; במחיר: כפול המכפיל שבחרת.`, `${ok.length} products in Wix's import format. All are imported hidden, so nothing goes live before you check. Cost: today's store price; price: times the markup you choose.`)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-[13px] font-bold" htmlFor="rdr-markup">{L("מכפיל מחיר", "Markup")}</label>
        <select id="rdr-markup" value={markup} onChange={(e) => setMarkup(Number(e.target.value))} className="rounded-lg border px-2 py-1 text-[13px]" style={{ borderColor: "var(--lx-line-strong)", background: "var(--lx-paper)" }}>
          {[1.5, 2, 2.5, 3].map((m) => <option key={m} value={m}>×{m}</option>)}
        </select>
        <button type="button" onClick={download} className="lx-btn lx-btn-ink" style={{ minHeight: 40, padding: "6px 16px", fontSize: 14 }}>{L("להוריד קובץ ל־Wix", "Download the Wix file")}</button>
        <a href={WIX_PRODUCTS_URL} target="_blank" rel="noopener noreferrer" className="lx-btn lx-btn-ghost" style={{ minHeight: 40, padding: "6px 16px", fontSize: 14 }}>{L("למוצרים בחנות Wix", "Your Wix products")}</a>
      </div>
      <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--lx-muted)" }}>{L("ב־Wix: מוצרים בחנות ← פעולות נוספות ← ייבוא ← העלאת קובץ. המחירים בשקלים, ו־Wix מציגים את המספר במטבע של החנות שלך. השם והתמונות הם של המוכר באליאקספרס.", "In Wix: Store Products → More Actions → Import → Upload CSV File. Prices are in shekels, and Wix shows the number in your store's currency. The name and photos are the seller's on AliExpress.")}</p>
    </div>
  );
}

/** One card body for every find (radarCore.js findFacts): the same rows in the same order, each a measurement with its source. */
function FindFacts({ f, kind, day }) {
  const { L } = useL();
  return (
    <dl className="lx-rdr-dl">
      {findFacts(f, { kind, day }).map((r) => (
        <div key={r.key} className={r.tone ? `is-${r.tone}` : undefined}>
          <dt>{L(r.labelHe, r.labelEn)}</dt>
          <dd>{L(r.he, r.en)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The radar's whole record in one table (radarCore.js recordView): every instrument, the same
 * columns, the result as it is. Each row opens its own section below.
 */
/**
 * 🗺️ The capability map (radarCore.js capabilityMap; the owner's mission, 21.11, phase 2): every source,
 * instrument and missing door in five classes, computed from the latest run's board, never declared.
 */
function CapabilityMap({ board }) {
  const { L } = useL();
  const map = capabilityMap(board);
  if (!map.rows.length) return null;
  const why = (r) => {
    if (!r.why) return "";
    if (typeof r.why === "string") return r.kind === "door" ? r.why : SOURCE_STATES[r.why] ? L(SOURCE_STATES[r.why].he, SOURCE_STATES[r.why].en) : "";
    if (r.why.firstCheck) return L(`הבדיקה הראשונה ב־${dm(r.why.firstCheck)}`, `first check on ${dm(r.why.firstCheck)}`);
    if (r.why.errors !== undefined) return L(`${r.why.errors} שגיאות מתוך ${r.why.of} שאלות`, `${r.why.errors} errors of ${r.why.of} requests`);
    return "";
  };
  return (
    <section className="lx-wrap mt-8" id="capabilities">
      <div className="lx-card lx-rdr-panel p-5 md:p-6">
        <h2 className="text-[22px] font-black">{L("🗺️ מפת היכולות, מהריצה האחרונה", "🗺️ The capability map, from the latest run")}</h2>
        <p className="mt-1 text-[14px] leading-6" style={{ color: "var(--lx-muted)" }}>{L("כל מקור וכל כלי של הרדאר, בחמש קבוצות. המפה מחושבת מהנתונים של הריצה האחרונה: מה ענה, מה נשמר ומה כבר קיבל ציון.", "Every source and instrument of the radar, in five groups, computed from the latest run's data: what answered, what was kept, what has been graded.")}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {Object.entries(CAPABILITY_CLASSES).map(([k, c]) => {
            const rows = map.rows.filter((r) => r.cls === k);
            if (!rows.length) return null;
            return (
              <div key={k} className="lx-rdr-item p-3">
                <p className="text-[14px] font-black">{c.n}. {L(c.he, c.en)} · {rows.length}</p>
                <ul className="mt-1 grid gap-0.5 text-[12px] leading-5">
                  {rows.map((r) => <li key={`${r.kind}-${r.key}`}><b>{L(r.he, r.en)}</b>{why(r) ? <span style={{ color: "var(--lx-muted)" }}> · {why(r)}</span> : null}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// 📰 Who said it first (newsSignal.js): every sealed call against the world's news (GDELT), per book.
const NEWS_BOOK = { stages: ["קביעות שלב", "Stage calls"], early: ["לפני כולם", "Before everyone"], fresh: ["מוצרים חדשים", "New products"], kinds: ["סוגים חדשים", "New kinds"] };
function NewsRace({ news }) {
  const { L } = useL();
  const a = news.all;
  return (
    <section className="lx-card lx-rdr-panel mt-4 p-5" id="news">
      <h2 className="text-[20px] font-black">{L("📰 מי אמר ראשון: הרדאר או החדשות בעולם", "📰 Who said it first: the radar or the world's news")}</h2>
      <p className="mt-1 text-[14px] leading-6">{L(`כל קביעה חתומה נבדקת מול מאגר החדשות הפתוח GDELT, שקורא אתרי חדשות ב־65 שפות. נרשם היום הראשון שבו החדשות הזכירו את המוצר לפחות ${news.minPerDay} פעמים ביום, ואחרי שנרשם הוא נשאר כמו שהוא.`, `Every sealed call is checked against GDELT, the open news database that reads news sites in 65 languages. The first day the news named it at least ${news.minPerDay} times a day is stamped and stays as stamped.`)}</p>
      <dl className="lx-rdr-dl mt-3">
        <div><dt>{L("קביעות שנבדקו", "Calls checked")}</dt><dd>{a.read} / {a.calls}</dd></div>
        <div><dt>{L("הרדאר אמר ראשון", "The radar said it first")}</dt><dd>{a.ahead}{a.medianAheadDays !== null ? L(` · חציון ${a.medianAheadDays} ימים לפני החדשות`, ` · median ${a.medianAheadDays} days before the news`) : ""}</dd></div>
        <div><dt>{L("עוד שקט בחדשות", "Still quiet in the news")}</dt><dd>{a.quiet}</dd></div>
        <div><dt>{L("החדשות אמרו ראשונות", "The news said it first")}</dt><dd>{a.newsFirst}</dd></div>
      </dl>
      <p className="mt-2 text-[13px]" style={{ color: "var(--lx-muted)" }}>{Object.entries(news.books).map(([k, b]) => L(`${NEWS_BOOK[k][0]}: ${b.ahead} ראשון, ${b.quiet} בשקט, ${b.newsFirst} אחרי החדשות`, `${NEWS_BOOK[k][1]}: ${b.ahead} first, ${b.quiet} quiet, ${b.newsFirst} after the news`)).join(" · ")}</p>
      <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`נבדק ב־${dm(news.d)}. כל אחד יכול לבדוק את אותו ביטוי ב־GDELT.`, `Checked on ${dm(news.d)}. Anyone can check the same phrase on GDELT.`)} <a className="underline" href="https://api.gdeltproject.org/api/v2/summary/summary" target="_blank" rel="noopener noreferrer">GDELT</a></p>
    </section>
  );
}

function RecordTable({ board }) {
  const { L } = useL();
  const v = recordView(board || {});
  if (!v.rows.length) return null;
  return (
    <section className="lx-wrap mt-8" id="record">
      <div className="lx-card lx-rdr-panel p-5 md:p-6">
        <h2 className="text-[22px] font-black">{L("הרקורד של הרדאר, כמו שהוא", "The radar's record, as it is")}</h2>
        <p className="mt-1 text-[14px] leading-6" style={{ color: "var(--lx-muted)" }}>{L("כל כלי של הרדאר, באותן עמודות: כמה אמר, כמה נבדק, מה יצא. כל שורה חתומה בביטקוין מראש, גם הטעויות.", "Every instrument of the radar, in the same columns: how many it said, how many were checked, what came out. Every row is sealed in Bitcoin in advance, misses included.")}</p>
        <div className="lx-rdr-record mt-4">
          <table>
            <thead>
              <tr>
                <th scope="col">{L("הכלי", "Instrument")}</th>
                <th scope="col">{L("אמר", "Said")}</th>
                <th scope="col">{L("נבדק", "Checked")}</th>
                <th scope="col">{L("התוצאה", "Result")}</th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => {
                const t = resultText(r);
                return (
                  <tr key={r.id}>
                    <th scope="row">
                      <a href={`#${r.section}`} className="font-extrabold">{L(r.he, r.en)}</a>
                      <span className="block text-[12px] font-normal" style={{ color: "var(--lx-muted)" }}>{L(r.whatHe, r.whatEn)}</span>
                    </th>
                    <td data-label={L("אמר", "Said")}>{r.given === null ? "·" : r.given.toLocaleString("he-IL")}</td>
                    <td data-label={L("נבדק", "Checked")}>{r.graded === null ? "·" : r.graded.toLocaleString("he-IL")}</td>
                    <td className={r.result ? "is-result" : "is-pending"}>{r.sealed ? <span className="lx-rdr-seal" aria-label={L("חתום היום", "Sealed today")}>🔏</span> : null}{L(t.he, t.en)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(board?.fresh?.byCategory || []).some((c) => c.graded > 0) ? (
          <div className="mt-4">
            <p className="text-[14px] font-black">{L("מוצרים חדשים, לפי קטגוריה", "New products, by category")}</p>
            <ul className="mt-1 grid gap-1 text-[13px] md:grid-cols-2">
              {board.fresh.byCategory.filter((c) => c.graded > 0).map((c) => <li key={c.category} className="flex justify-between gap-3"><span dir="ltr">{c.category}</span><span className="tabular-nums font-bold">{L(`פגעו ${c.hits} מתוך ${c.graded}`, `${c.hits} of ${c.graded} hit`)}</span></li>)}
            </ul>
          </div>
        ) : null}
        {v.root ? <p className="mt-3 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`🔏 החתימה של ${dm(v.day)}: ${v.books} ספרים תחת שורש אחד`, `🔏 The ${dm(v.day)} seal: ${v.books} books under one root`)} <span dir="ltr">SHA-256 {v.root.slice(0, 16)}…</span>{v.block ? L(` · בתוך בלוק ביטקוין #${v.block.height.toLocaleString("he-IL")}`, ` · inside Bitcoin block #${v.block.height}`) : ""} · <a className="underline" href="#ledger">{L("לבדיקה בעצמך", "Check it yourself")}</a></p> : null}
      </div>
    </section>
  );
}

/**
 * 📡 What the radar read today (radarCore.js sourcesView): every source the run asked, its state as
 * the run reported it and the official door it goes through; then the doors the radar opens next.
 */
// The four stages of one source, apart (the owner, 21.11): asked → a valid answer → with data → kept
// after the radar's checks; then every refusal and failure with its code.
function StageCounts({ c, countryNames }) {
  const { L } = useL();
  const n = (v) => Number(v || 0).toLocaleString("he-IL");
  const cat = c.unit === "categories";
  const errors = (c.refused || 0) + (c.failed || 0);
  const codes = c.codes ? Object.entries(c.codes).map(([k, v]) => `${k} ×${v}`).join(", ") : "";
  return (
    <span className="block text-[11px] leading-5">
      <span className="block">{L(
        `${cat ? "נשאלו" : "שאלות"} ${n(c.asked)} · ${cat ? "נסרקו" : "ענו תקין"} ${n(c.scanned)} · ${cat ? "עם מוצרים" : "עם נתונים"} ${n(c.withData)}${c.kept !== null && c.kept !== undefined ? ` · נקלטו אחרי בדיקה ${n(c.kept)}` : ""}`,
        `${cat ? "asked" : "requests"} ${n(c.asked)} · ${cat ? "scanned" : "valid answers"} ${n(c.scanned)} · ${cat ? "with items" : "with data"} ${n(c.withData)}${c.kept !== null && c.kept !== undefined ? ` · kept after checks ${n(c.kept)}` : ""}`,
      )}</span>
      {errors ? <span className="block font-bold" style={{ color: "#b42318" }}>{L(`שגיאות: ${cat ? `${n(c.failed)} נכשלו` : `${n(c.refused)} סירובים, ${n(c.failed)} בלי תשובה`}`, `Errors: ${cat ? `${n(c.failed)} failed` : `${n(c.refused)} refused, ${n(c.failed)} no answer`}`)}{codes ? <> (<bdi dir="ltr">{codes}</bdi>)</> : null}</span> : null}
      {c.countries?.length ? <span className="block">{L(`ענו מ: ${countryNames(c.countries)}`, `answered from: ${countryNames(c.countries)}`)}</span> : null}
    </span>
  );
}

// 📒 One source over the last runs (runReceipt.js healthOf): what it measures, its share of valid
// answers, when it last gave valid data, and its reliability from those numbers only.
const HEALTH_LEVELS = { HIGH: ["אמינות גבוהה", "high reliability"], MEDIUM: ["אמינות בינונית", "medium reliability"], LOW: ["אמינות נמוכה", "low reliability"], MEASURING: ["אמינות: נמדדת (פחות מ־3 ריצות)", "reliability: measuring (under 3 runs)"] };
function SourceHealth({ m, h }) {
  const { L } = useL();
  const when = (t) => (t ? `${dm(israelDay(t))} ${israelTime(t)}` : "");
  return (
    <span className="block text-[11px] leading-5" style={{ color: "var(--lx-muted)" }}>
      {m ? <span className="block">{L(`מודד: ${m.he}`, `Measures: ${m.en}`)}</span> : null}
      {h ? <span className="block">{L(
        `${h.runs} ריצות: ${h.validRate ?? 0}% תשובות תקינות · נתונים תקינים לאחרונה: ${h.lastValid ? when(h.lastValid) : "בהמתנה"} · ${HEALTH_LEVELS[h.level][0]}`,
        `${h.runs} runs: ${h.validRate ?? 0}% valid answers · last valid data: ${h.lastValid ? when(h.lastValid) : "none yet"} · ${HEALTH_LEVELS[h.level][1]}`,
      )}</span> : null}
    </span>
  );
}

// Every kind of unit the run scans, its four stages apart, and every failed or empty unit by name.
function ScanTable({ scan }) {
  const { L } = useL();
  const n = (v) => Number(v || 0).toLocaleString("he-IL");
  const LABELS = { concepts: ["סוגים ברשימת המדידה", "Kinds on the measuring list"], fresh: ["תחומי מוצרים חדשים", "New-product areas"], world: ["קטגוריות העולם", "World categories"], siteItems: ["מוצרי האתר", "The site's products"] };
  const rows = Object.keys(LABELS).filter((k) => scan[k]?.asked);
  if (!rows.length) return null;
  return (
    <div className="mt-4">
      <p className="text-[14px] font-black">{L("🔎 הסריקה בארבעה שלבים", "🔎 The scan in four stages")}</p>
      <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("ניסיון ← תשובה תקינה ← נתונים ← נקלט אחרי הבדיקות של הרדאר. יחידה נספרת כנסרקה רק כשהתשובה שלה תקינה.", "Attempt → a valid answer → data → kept after the radar's checks. A unit counts as scanned only when its answer is valid.")}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead><tr style={{ color: "var(--lx-muted)" }}>{[L("מה", "What"), L("נוסו", "Asked"), L("נסרקו", "Scanned"), L("עם נתונים", "With data"), L("נקלטו", "Kept"), L("נכשלו", "Failed")].map((h) => <th key={h} className="py-1 text-start font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((k) => {
              const t = scan[k];
              return (
                <tr key={k} className="border-t" style={{ borderColor: "var(--lx-line)" }}>
                  <td className="py-1 font-bold">{L(LABELS[k][0], LABELS[k][1])}</td>
                  <td>{n(t.asked)}</td><td>{n(t.scanned)}</td><td>{n(t.withData)}</td><td>{n(t.kept)}</td>
                  <td style={t.asked - t.scanned ? { color: "#b42318", fontWeight: 700 } : null}>{n(t.asked - t.scanned)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.filter((k) => scan[k].failed?.length || scan[k].empty?.length).map((k) => (
        <details key={k} className="lx-rdr-how mt-1">
          <summary>{L(`${LABELS[k][0]}: מה נכשל ומה חזר ריק`, `${LABELS[k][1]}: what failed and what came back empty`)}</summary>
          {scan[k].failed?.length ? <p className="mt-1 text-[12px]" style={{ color: "#b42318" }}>{L("נכשלו: ", "Failed: ")}<span dir="ltr">{scan[k].failed.map((f) => `${f.name || f.id} (${f.code})`).join(" · ")}</span></p> : null}
          {scan[k].empty?.length ? <p className="mt-1 text-[12px]">{L("ענו ריק: ", "Answered empty: ")}<span dir="ltr">{scan[k].empty.map((f) => f.name || f.id).join(" · ")}</span></p> : null}
        </details>
      ))}
    </div>
  );
}

/**
 * 📡 What the radar read, and 🧾 the run receipt (runReceipt.js; the owner, 21.11: "the transparency
 * area must show real data from actual runs"): every number here was counted by the run's one metered
 * fetch from real answers, the run's public GitHub log prints the same receipt, and its text is sealed
 * in Bitcoin as the book "run". The date is the run's own; "today" only when the run is today's.
 */
function SourcesToday({ sources, receipt, scan = null, health = null }) {
  const { L } = useL();
  const list = sourcesView(sources || {}, receipt);
  if (!list.length) return null;
  const tone = { run: "is-run", slow: "is-slow", exit: "is-exit" };
  const day = receipt?.started ? israelDay(receipt.started) : null;
  const isToday = day && day === israelDay(Date.now());
  const when = day ? `${dm(day)}, ${israelTime(receipt.started)}–${israelTime(receipt.finished || receipt.started)}` : "";
  const t = receipt ? receiptTotals(receipt) : null;
  const n = (v) => Number(v || 0).toLocaleString("he-IL");
  const run = receipt?.run;
  const countryNames = (cs) => (cs || []).map((c) => L(COUNTRY_NAMES[c]?.[0] || c.toUpperCase(), COUNTRY_NAMES[c]?.[1] || c.toUpperCase())).join(", ");
  return (
    <section className="lx-wrap mt-8" id="sources">
      <div className="lx-card lx-rdr-panel p-5 md:p-6">
        <h2 className="text-[22px] font-black">{receipt ? L(`📡 מה הרדאר קרא ${isToday ? "היום" : `ב־${dm(day)}`}`, `📡 What the radar read ${isToday ? "today" : `on ${dm(day)}`}`) : L("📡 המקורות של הרדאר", "📡 The radar's sources")}</h2>
        {receipt && t ? (
          <div className="mt-2 rounded-2xl p-3 text-[14px] leading-6" style={{ border: "1px solid var(--lx-line)" }}>
            <p className="font-black">{L("🧾 קבלת הריצה", "🧾 The run receipt")} · <span dir="ltr">{when}</span> {L("(שעון ישראל)", "(Israel time)")}</p>
            {!isToday ? <p className="font-bold">{L(`זו הריצה האחרונה שהסתיימה. הריצה של היום מתעדכנת כאן כשהיא מסתיימת.`, `This is the latest finished run. Today's run shows here once it finishes.`)}</p> : null}
            <p>{L(`הרדאר שלח ${n(t.asked)} שאלות למקורות. ${n(t.answered)} ענו עם נתונים, ${n(t.empty)} ענו ריק, ${n(t.refused)} סירבו, ${n(t.failed)} נשארו בלי תשובה.`, `The radar sent ${n(t.asked)} requests to its sources: ${n(t.answered)} answered with data, ${n(t.empty)} answered empty, ${n(t.refused)} refused, ${n(t.failed)} never arrived.`)}</p>
            <p className="text-[13px]" style={{ color: "var(--lx-muted)" }}>{L("כל המספרים כאן נספרו מהתשובות שבאמת הגיעו בריצה. מקור שלא ענה מסומן ככה, גם אם התוכנה ציפתה לו.", "Every number here was counted from the answers that really arrived in the run. A source that gave no answer is marked so, whatever the code expected.")}</p>
            <ul className="mt-2 grid gap-1 text-[13px]">
              {run ? <li>{L("היומן הציבורי של הריצה, מ־GitHub:", "The run's public log, by GitHub:")} <a className="underline" href={run.url} target="_blank" rel="noopener noreferrer">{L("ריצה", "run")} <bdi dir="ltr">#{run.id}</bdi></a>{run.sha ? <>{L(" · הקוד שרץ: ", " · the code that ran: ")}<a className="underline" href={`https://github.com/hen63165-dotcom/likelink/commit/${run.sha}`} target="_blank" rel="noopener noreferrer"><bdi dir="ltr">{run.sha.slice(0, 7)}</bdi></a></> : null}</li> : <li>{L("הריצה הזו רצה מחוץ ל־GitHub, ולכן בלי יומן ציבורי.", "This run ran outside GitHub, so it has no public log.")}</li>}
              {receipt.seal ? <li>{L("טביעת האצבע של הקבלה, חתומה בביטקוין עם שאר הספרים:", "The receipt's fingerprint, sealed in Bitcoin with the other books:")} <span dir="ltr" className="font-mono text-[12px]">SHA-256 {receipt.seal.sha256.slice(0, 16)}…</span></li> : null}
            </ul>
            {receipt.seal?.text ? (
              <details className="lx-rdr-how mt-2">
                <summary>{L("הטקסט המדויק של הקבלה (אותו טקסט ביומן של GitHub)", "The receipt's exact text (the same text is in GitHub's log)")}</summary>
                <pre dir="ltr" className="mt-2 overflow-x-auto whitespace-pre text-[11px] leading-5">{receipt.seal.text}</pre>
                <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("כל שורה: מקור | נשאל | ענה עם נתונים | ענה ריק | סירב | בלי תשובה. SHA-256 של הטקסט הזה הוא טביעת האצבע שלמעלה.", "Each line: source | asked | answered with data | answered empty | refused | never arrived. The SHA-256 of this text is the fingerprint above.")}</p>
              </details>
            ) : null}
          </div>
        ) : null}
        {[
          ["read", "מה הרדאר קרא בריצה", "What the radar read in the run", null],
          ["connect", "דלתות שנפתחות בחיבור של בעלת האתר", "Doors the owner's connection opens", "הן נספרות רק מהיום שהחיבור קיים, ועד אז הרדאר קורא בלעדיהן.", "They count only from the day the connection exists; until then the radar reads without them."],
          ["closed", "סגור לפי הכללים של האתר עצמו", "Closed by the site's own rules", "הרדאר מכבד את robots.txt של כל אתר, ובודק כל יום אם הדלת נפתחה. את אותן מדינות הוא קורא בדלת פתוחה אחרת:", "The radar respects every site's robots.txt and checks each day whether the door opened. It reads the same countries through another open door:"],
        ].map(([g, he, en, noteHe, noteEn]) => {
          const rows = list.filter((x) => x.group === g);
          if (!rows.length) return null;
          return (
            <div key={g} className="mt-3">
              <p className="text-[14px] font-black">{L(he, en)}</p>
              {noteHe ? <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(noteHe, noteEn)}</p> : null}
              <ul className="mt-1 grid gap-1.5 md:grid-cols-2">
                {rows.map((x) => (
                  <li key={x.key} className="flex items-center justify-between gap-3 border-b py-1.5 text-[13px]" style={{ borderColor: "var(--lx-line)" }}>
                    <span>
                      <b>{L(x.he, x.en)}</b>
                      <span className="block text-[11px]" style={{ color: "var(--lx-muted)" }}>{x.door}</span>
                      {x.insteadHe ? <span className="block text-[12px] font-bold">{L(x.insteadHe, x.insteadEn)}</span> : null}
                      {x.counts ? <StageCounts c={x.counts} countryNames={countryNames} /> : null}
                      {MEASURES[x.key] || health?.sources?.[x.key] ? <SourceHealth m={MEASURES[x.key]} h={health?.sources?.[x.key] || null} /> : null}
                    </span>
                    <span className={`lx-rdr-pill ${tone[SOURCE_STATES[x.state].tone]}`}>{L(SOURCE_STATES[x.state].he, SOURCE_STATES[x.state].en)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {scan ? <ScanTable scan={scan} /> : null}
        <p className="mt-4 text-[14px] font-black">{L("הדלתות הבאות", "The next doors")}</p>
        <ul className="mt-1 grid gap-1 text-[13px]">
          {NEXT_DOORS.map((d) => <li key={d.key}><b>{L(d.he, d.en)}</b> · <span style={{ color: "var(--lx-muted)" }}>{d.door}</span></li>)}
        </ul>
      </div>
    </section>
  );
}

/** ⏳ The window clock (radarWindow.js): how long a find stays ahead of the crowd, as a graded chance. */
function WindowClock({ win }) {
  const { L } = useL();
  const graded = (win.record || []).filter((c) => c.n > 0);
  const ready = (win.horizons || []).filter((h) => h.state === "READY");
  const line = (win.line || 2000).toLocaleString("he-IL");
  return (
    <section className="lx-wrap mt-8" id="window">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("⏳ שעון החלון: כמה זמן נשאר לפני שכולם מוכרים", "⏳ The window clock: how long until everyone sells it")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L(`לכל מוצר חדש ולכל סוג שהרדאר מוצא, הוא סופר כל בוקר כמה מודעות יש לו באליאקספרס. מ־${line} מודעות הרדאר קורא לזה רוויה: כבר הרבה מוכרים. שעון החלון נותן סיכוי מכויל שהמודעות יעברו את הקו בעוד 3, 7 ו־14 יום, כלומר שהחלון ייסגר. כל סיכוי נחתם בביטקוין ביום שניתן, נבדק ביום שלו ומקבל ציון Brier.`, `For every new product and every new kind it finds, the radar counts its AliExpress listings every morning. From ${line} listings it calls it saturated: many sellers already. The window clock gives a calibrated chance that the listings are past that line in 3, 7 and 14 days: that the window has closed. Every chance is sealed in Bitcoin the day it is given, checked on its day, and given a Brier score.`)}</p>
                <details className="lx-rdr-how mt-1">
          <summary>{L("איך זה עובד", "How it works")}</summary>
          <p className="mt-2 text-[13px] leading-6">{L("איך: אותו מודל של הטווח המוכח, על מספרי המודעות שהרדאר קורא כל יום, והסיכוי נקבע רק מהטעויות של ביטויים באותו גודל, כך שביטוי קטן נמדד מול ביטויים קטנים.", "How: the proven range's own model, on the listing counts the radar reads every day, and the chance comes only from the errors of phrases of the same size, so a small phrase is judged against small phrases.")}</p>
        </details>
        <ul className="mt-3 grid gap-1.5">
          {(win.horizons || []).map((h) => (
            <li key={h.h} className="text-[13px] font-bold">{h.state === "READY" ? L(`✅ ${h.h} ימים: מוכן, לומד מ־${h.n} דוגמאות (${h.small} בגודל של מוצר חדש)`, `✅ ${h.h} days: ready, learning from ${h.n} examples (${h.small} the size of a new product)`) : L(`⏳ ${h.h} ימים: בכיול, ${h.n} מתוך ${h.need} דוגמאות, ${h.small} מתוך ${h.smallNeed} בגודל של מוצר חדש`, `⏳ ${h.h} days: calibrating, ${h.n} of ${h.need} examples, ${h.small} of ${h.smallNeed} the size of a new product`)}</li>
          ))}
        </ul>
        {graded.length ? (
          <ul className="mt-3 grid gap-2">
            {graded.map((c) => (
              <li key={c.h} className="text-[13px] leading-6">
                <b>{L(`${c.h} ימים:`, `${c.h} days:`)}</b> {L(`${c.n} סיכויים נבדקו, ציון Brier ${c.brier}`, `${c.n} chances graded, Brier ${c.brier}`)}{c.skill !== null ? L(`, ${c.skill > 0 ? "טוב" : "חלש"} ב־${Math.abs(c.skill)}% מניחוש לפי שיעור הבסיס (${c.baseRate}%)`, `, ${Math.abs(c.skill)}% ${c.skill > 0 ? "better" : "worse"} than guessing the base rate (${c.baseRate}%)`) : ""}.
                {c.bins.filter((b) => b.n >= 5).length ? <span className="block text-[12px]" style={{ color: "var(--lx-muted)" }}>{c.bins.filter((b) => b.n >= 5).map((b) => L(`כשאמר ${b.from}–${b.to}%: קרה ב־${b.happened}% (${b.n})`, `said ${b.from}–${b.to}%: happened ${b.happened}% (${b.n})`)).join(" · ")}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] font-bold">{win.open ? L(`${win.open} סיכויים חתומים מחכים ליום שלהם${win.nextDue ? `. הבדיקה הראשונה ב־${dm(win.nextDue)}` : ""}.`, `${win.open} sealed chances are waiting for their day${win.nextDue ? `. The first check is on ${dm(win.nextDue)}` : ""}.`) : L("הסיכויים הראשונים ניתנים כשאופק אחד מסיים כיול.", "The first chances are given once a horizon finishes calibrating.")}</p>
        )}
        {ready.length && win.issued ? <p className="mt-2 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`היום ניתנו ${win.issued} סיכויים חדשים, כולם בספר החתימות.`, `Today ${win.issued} new chances were given, all in the sealed ledger.`)}</p> : null}
        {win.recent?.length ? <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>{win.recent.slice(0, 6).map((g) => `${g.hit === 1 ? "🔒" : "🔓"} ${g.h}${L(" ימים", "d")}: ${g.p}% → ${g.v}`).join(" · ")}</p> : null}
      </div>
    </section>
  );
}

/** 📐 The proven range (radarPromise.js): what the radar commits to, and how often it held. */
function ProvenRange({ promise }) {
  const { L } = useL();
  const graded = (promise.coverage || []).filter((c) => c.n > 0);
  const ready = (promise.horizons || []).filter((h) => h.state === "READY");
  return (
    <section className="lx-wrap mt-8" id="promise">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("📐 הטווח המוכח: מה הרדאר כן מתחייב עליו", "📐 The proven range: what the radar does commit to")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L("כל בוקר הרדאר נותן למוצרים שהוא מודד טווח להזמנות שלהם בעוד 3, 7 ו־14 יום, ברמת כיסוי של 80% ו־90%. כל טווח נחתם בביטקוין ביום שניתן, נבדק ביום שלו, ונספר כאן: החזיק או החטיא.", "Every morning the radar gives the products it measures a range for their orders in 3, 7 and 14 days, at 80% and 90% coverage. Every range is sealed in Bitcoin the day it is given, checked on its day, and counted here: held or missed.")}</p>
                <details className="lx-rdr-how mt-1">
          <summary>{L("איך זה עובד", "How it works")}</summary>
          <p className="mt-2 text-[13px] leading-6">{L("איך: מודל שלומד כל בוקר מההיסטוריה של הרדאר עצמו, ו־Conformal Prediction שקובע את רוחב הטווח לפי הטעויות של המודל על נתונים ששמר בצד. כל טווח שנבדק מזיז את הרמה של הטווחים הבאים (ACI), ולכן לאורך זמן אחוז הטווחים שמחזיקים מתכנס לרמה שהוצהרה, גם כשהשוק משתנה.", "How: a model that learns every morning from the radar's own history, and conformal prediction, which sets each range's width from the model's errors on data held aside. Every checked range moves the level of the next ones (ACI), so over time the share of ranges that hold converges to the stated level, even when the market shifts.")}</p>
        </details>
        <ul className="mt-3 grid gap-1.5">
          {(promise.horizons || []).map((h) => (
            <li key={h.h} className="text-[13px] font-bold">{h.state === "READY" ? L(`✅ ${h.h} ימים: מוכן, לומד מ־${h.n} דוגמאות`, `✅ ${h.h} days: ready, learning from ${h.n} examples`) : L(`⏳ ${h.h} ימים: בכיול, ${h.n} מתוך ${h.need} דוגמאות`, `⏳ ${h.h} days: calibrating, ${h.n} of ${h.need} examples`)}</li>
          ))}
        </ul>
        {graded.length ? (
          <div className="mt-3">
            <p className="text-[15px] font-black">{L("הרקורד, כמו שהוא:", "The record, as it is:")}</p>
            <ul className="mt-1 grid gap-1">
              {graded.map((c) => <li key={`${c.h}-${c.level}`} className="text-[13px]">{L(`${c.h} ימים, כיסוי ${c.level}%: ${c.held} מתוך ${c.n} טווחים החזיקו (${c.rate}%)`, `${c.h} days, ${c.level}% coverage: ${c.held} of ${c.n} ranges held (${c.rate}%)`)}</li>)}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-[13px] font-bold">{promise.nextDue ? L(`${promise.open} טווחים חתומים מחכים ליום שלהם. הבדיקה הראשונה ב־${dm(promise.nextDue)}.`, `${promise.open} sealed ranges are waiting for their day. The first check is on ${dm(promise.nextDue)}.`) : L(`הטווחים הראשונים ניתנים כשאופק אחד מסיים כיול.`, `The first ranges are given once a horizon finishes calibrating.`)}</p>
        )}
        {ready.length && promise.issued ? <p className="mt-2 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`היום ניתנו ${promise.issued} טווחים חדשים, כולם בספר החתימות.`, `Today ${promise.issued} new ranges were given, all in the sealed ledger.`)}</p> : null}
        {promise.recent?.length ? <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>{promise.recent.slice(0, 6).map((g) => `${g.held[1] === 1 ? "✅" : g.held[1] === 0 ? "❌" : "·"} ${g.h}${L(" ימים", "d")}: ${g.r90 ? `${g.r90[0]}–${g.r90[1]}` : "-"} → ${g.v}`).join(" · ")}</p> : null}
        <div className="mt-4 rounded-[14px] p-4" style={{ background: "#fff", border: "1px solid #99f6e4" }}>
          <p className="text-[16px] font-black">{L("🎯 הסיכוי המכויל", "🎯 The calibrated chance")}</p>
          <p className="mt-1 text-[13px] leading-6">{L("כמו במזג האוויר: כשאומרים 30% גשם, יורד גשם בערך ב־3 ימים מתוך 10. כך כאן: לכל מוצר הרדאר נותן סיכוי לעלות (ב־10% תוך 3 ימים, ב־25% תוך 7, ב־50% תוך 14), וכשהוא אומר 30%, זה צריך לקרות בערך 3 פעמים מתוך 10. כל סיכוי נחתם מראש, נבדק ביום שלו, ומקבל ציון Brier מול ניחוש לפי שיעור הבסיס.", "Like the weather: when it says 30% rain, it rains on about 3 days in 10. Here, for every product the radar gives a chance to grow (10% within 3 days, 25% within 7, 50% within 14). When it says 30%, it should happen about 3 times in 10. Every chance is sealed in advance, checked on its day, and given a Brier score against guessing the base rate.")}</p>
          {(promise.chance || []).filter((c) => c.n > 0).length ? (
            <ul className="mt-2 grid gap-2">
              {(promise.chance || []).filter((c) => c.n > 0).map((c) => (
                <li key={c.h} className="text-[13px] leading-6">
                  <b>{L(`${c.h} ימים (+${c.line}%):`, `${c.h} days (+${c.line}%):`)}</b> {L(`${c.n} סיכויים נבדקו, ציון Brier ${c.brier}`, `${c.n} chances graded, Brier ${c.brier}`)}{c.skill !== null ? L(`, ${c.skill > 0 ? "טוב" : "חלש"} ב־${Math.abs(c.skill)}% מניחוש לפי שיעור הבסיס (${c.baseRate}%)`, `, ${Math.abs(c.skill)}% ${c.skill > 0 ? "better" : "worse"} than guessing the base rate (${c.baseRate}%)`) : ""}.
                  {c.bins.filter((b) => b.n >= 5).length ? <span className="block text-[12px]" style={{ color: "var(--lx-muted)" }}>{c.bins.filter((b) => b.n >= 5).map((b) => L(`כשאמר ${b.from}–${b.to}%: קרה ב־${b.happened}% (${b.n})`, `said ${b.from}–${b.to}%: happened ${b.happened}% (${b.n})`)).join(" · ")}</span> : null}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[13px] font-bold">{L(`הסיכויים הראשונים נבדקים יחד עם הטווחים${promise.nextDue ? `, מ־${dm(promise.nextDue)}` : ""}.`, `The first chances are graded with the ranges${promise.nextDue ? `, from ${dm(promise.nextDue)}` : ""}.`)}</p>}
        </div>
      </div>
    </section>
  );
}

function Brain({ brain }) {
  const { L } = useL();
  const books = [["fresh", L("מוצרים חדשים", "New products")], ["kinds", L("סוגים חדשים", "New kinds")]].filter(([k]) => brain.books?.[k]);
  const waiting = books.reduce((t, [k]) => t + (brain.books[k].waiting || 0), 0);
  const nextDue = books.map(([k]) => brain.books[k].nextDue).filter(Boolean).sort()[0] || null;
  return (
    <section className="lx-wrap mt-8" id="brain">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🧠 המוח של הרדאר: מה הוא למד", "🧠 The radar's brain: what it learned")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L("כל קביעה נשמרת עם הסימנים שהיו לה ביום שנעשתה: הקצב, כמה מוכרים, מה קורה ביוטיוב, המחיר. אחרי הציון המוח בודק אילו סימנים הובילו לפגיעה ואילו לטעות, ומסדר לפי זה את מה שעבר את הרף. הרף עצמו נשאר כמו שהוא. כל מספר כאן הוא מה שכבר קרה, עם כמה קביעות הוא נשען עליו.", "Every call is saved with the signals it had the day it was made: the pace, how many sellers, what is happening on YouTube, the price. After the grade, the brain checks which signals led to hits and which to misses, and orders what passed the bar by it. The bar itself stays as it is. Every number here is what already happened, with how many calls it rests on.")}</p>
        {!brain.ready ? (
          <p className="mt-3 text-[14px] font-bold">{waiting ? L(`המוח לומד מהציון הראשון: ${waiting} קביעות עם הסימנים שלהן מחכות לציון${nextDue ? `, הראשונה ב־${dm(nextDue)}` : ""}. הוא מסיק מסקנה על סימן אחרי 5 ציונים עם הסימן ו־5 בלעדיו.`, `The brain learns from the first grade: ${waiting} calls with their signals are waiting${nextDue ? `, the first on ${dm(nextDue)}` : ""}. It draws a conclusion about a signal after 5 grades with it and 5 without.`) : L("המוח מתחיל לאסוף מהקביעה הבאה.", "The brain starts collecting from the next call.")}</p>
        ) : null}
        {books.map(([k, label]) => {
          const b = brain.books[k];
          const ready = b.signals.filter((x) => x.ready);
          if (!b.graded) return null;
          return (
            <div key={k} className="mt-4">
              <p className="text-[15px] font-black">{L(`${label}: ${b.hits} מתוך ${b.graded} קביעות שקיבלו ציון פגעו`, `${label}: ${b.hits} of ${b.graded} graded calls hit`)}</p>
              {ready.length ? (
                <ul className="mt-2 grid gap-1.5">
                  {ready.map((x) => (
                    <li key={x.key} className="text-[13px] leading-5">{x.lift > 0 ? "⬆️" : x.lift < 0 ? "⬇️" : "➖"} <b>{L(x.he, x.en)}</b>{L(`: עם הסימן ${x.with.hits} מתוך ${x.with.n} פגעו, בלעדיו ${x.without.hits} מתוך ${x.without.n}.`, `: with it ${x.with.hits} of ${x.with.n} hit, without it ${x.without.hits} of ${x.without.n}.`)}</li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-[13px]">{L("עוד מעט: כל סימן צריך 5 ציונים איתו ו־5 בלעדיו.", "Soon: each signal needs 5 grades with it and 5 without.")}</p>}
              {b.curve.length ? <p className="mt-2 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("עקומת הלמידה, לפי שבוע: ", "Learning curve, by week: ")}{b.curve.map((c) => `${dm(c.week)} ${c.hits}/${c.graded}`).join(" · ")}</p> : null}
            </div>
          );
        })}
        <div className="mt-4 rounded-[14px] p-3" style={{ background: "#0b0b0b", color: "#fff" }}>
          <p className="text-[16px] font-black">{L("🎯 הקול המוכח של הרדאר", "🎯 The radar's proven voice")}</p>
          <p className="mt-1 text-[13px] leading-6">{L("הרדאר מדבר בקול המוכח רק כשהעבר שלו מוכיח את זה. המוח בוחר תבנית סימנים, נועל וחותם אותה ביום שבחר, ומאותו יום כל פגיעה וכל טעות של קביעות בתבנית הזאת נספרות. רמה (80%, 90%, 95%, 99%) נפתחת רק כשהגבול התחתון של הדיוק, בביטחון של 95%, מגיע אליה. ההגדרה של פגיעה נשארת אותה הגדרה.", "The radar speaks in its proven voice only when its own past proves it. The brain picks a pattern of signals, locks and seals it the day it picks it, and from that day every hit and miss of calls in that pattern counts. A level (80%, 90%, 95%, 99%) opens only when the lower bound of the accuracy, at 95% confidence, reaches it. The definition of a hit stays the same.")}</p>
          {books.map(([k, label]) => {
            const x = brain.sure?.[k];
            if (!x) return null;
            return (
              <p key={k} className="mt-2 text-[13px] font-bold">{label}: {x.pattern?.length
                ? (x.level
                  ? L(`🎯 מוכח לפחות ${x.level}%: ${x.live.hits} מתוך ${x.live.n} פגעו מאז ${dm(x.since)}.`, `🎯 Proven at least ${x.level}%: ${x.live.hits} of ${x.live.n} hit since ${dm(x.since)}.`)
                  : L(`התבנית נבחרה ונחתמה ב־${dm(x.since)}. מאז: ${x.live.hits} מתוך ${x.live.n} פגעו. כדי להוכיח 99% צריך ${x.toProve?.[99] ?? 381} פגיעות ברצף, ל־90%: ${x.toProve?.[90] ?? 35}.`, `Pattern chosen and sealed on ${dm(x.since)}. Since then: ${x.live.hits} of ${x.live.n} hit. Proving 99% takes ${x.toProve?.[99] ?? 381} hits in a row; 90% takes ${x.toProve?.[90] ?? 35}.`))
                : L(`המוח יבחר תבנית אחרי 5 ציונים לכל צד. כדי להוכיח 99% צריך ${x.toProve?.[99] ?? 381} פגיעות ברצף, ל־90%: ${x.toProve?.[90] ?? 35}.`, `The brain picks a pattern after 5 grades on each side. Proving 99% takes ${x.toProve?.[99] ?? 381} hits in a row; 90% takes ${x.toProve?.[90] ?? 35}.`)}</p>
            );
          })}
        </div>
        <p className="mt-3 text-[11px]" style={{ color: "var(--lx-muted)" }}>{L(`גרסה ${brain.version} של המוח. כל יום המצב שלו נחתם בביטקוין יחד עם כל הספרים, כדי שכל אחד יראה מה הוא ידע ומתי. גרסה חדשה תפורסם כאן, וכל קביעה שומרת את הגרסה שבה נעשתה.`, `Brain version ${brain.version}. Every day its state is sealed in Bitcoin with all the books, so anyone can see what it knew and when. A new version is announced here, and every call keeps the version it was made under.`)}</p>
      </div>
    </section>
  );
}

/**
 * The styles radar (the owner, 2026-11-17: "the look everyone wants from the big brands, without
 * the brand's name"): every look is one generic store search, measured every morning like every kind
 * (the top 20 items' orders, the listings, Hebrew searches in Israel) and its calls are sealed and
 * graded like every call. Strongest stage first; a first reading shows today's size only.
 */
const STYLE_ORDER = { EMERGING: 0, RISING: 1, STEADY: 2, UNVERIFIED: 3, PEAK: 4, COOLING: 5 };
function Styles({ concepts = [] }) {
  const { L } = useL();
  const list = concepts.filter((c) => c.kind === "style").sort((a, b) => (STYLE_ORDER[a.stage] ?? 9) - (STYLE_ORDER[b.stage] ?? 9) || (b.score || 0) - (a.score || 0));
  if (!list.length) return null;
  return (
    <section className="lx-wrap mt-8" id="styles">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("👗 רדאר הסגנונות", "👗 The styles radar")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L(`הלוק שכולם רוצים מהמותגים הגדולים, במילים כלליות בלבד: ${list.length} סגנונות נמדדים כל בוקר כמו כל מוצר. ההזמנות של 20 הפריטים המובילים באליאקספרס, כמה מוכרים מציעים אותו, והאם בישראל כבר מחפשים אותו בעברית. כל קביעה נחתמת מראש ונבדקת אחרי 14 יום, בפומבי.`, `The look everyone wants from the big brands, in generic words only: ${list.length} styles measured every morning like every product. The top 20 items' orders on AliExpress, how many sellers list it, and whether Israelis already search it in Hebrew. Every call is sealed in advance and graded after 14 days, in public.`)}</p>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {list.map((c) => (
            <li key={c.id} className="lx-card lx-rdr-item p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-extrabold">{c.he}</p>
                <StageBadge stage={c.stage} label={c.stageHe} />
              </div>
              {c.stage === "UNVERIFIED" ? (
                <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`נמדד מ־${dm(c.since)}${c.today?.orders ? ` · היום ${c.today.orders.toLocaleString("he-IL")} הזמנות ב־30 יום` : ""} · הכיוון יופיע ב־${dm(nextDay(c.since))}`, `Measured since ${dm(c.since)}${c.today?.orders ? ` · today ${c.today.orders.toLocaleString("en-US")} orders in 30 days` : ""} · the direction shows on ${dm(nextDay(c.since))}`)}</p>
              ) : c.evidence?.[0]?.text ? (
                <p className="mt-1 text-[12px] leading-5">{c.evidence[0].text}</p>
              ) : null}
              {c.factory ? <p className="text-[12px] font-bold" style={{ color: c.factory.weekPct >= 25 ? "#166534" : "var(--lx-muted)" }}>{L(`🏭 מודעות חדשות: ${c.factory.weekPct > 0 ? "+" : ""}${c.factory.weekPct}% בשבוע`, `🏭 New listings: ${c.factory.weekPct > 0 ? "+" : ""}${c.factory.weekPct}% a week`)}</p> : null}
              {c.wiki ? <WikiLine w={c.wiki} L={L} /> : null}
              {c.social?.bsky ? <p className="text-[12px] font-bold" style={{ color: "var(--lx-muted)" }}>{L(`🗣️ בלוסקיי: ${c.social.bsky.week}${c.social.bsky.capped ? "+" : ""} פוסטים השבוע (${c.social.bsky.prev} בשבוע הקודם)`, `🗣️ Bluesky: ${c.social.bsky.week}${c.social.bsky.capped ? "+" : ""} posts this week (${c.social.bsky.prev} the week before)`)}</p> : null}
              {c.shops?.week ? <p className="text-[12px] font-bold" style={{ color: c.shops.rising ? "#067647" : "var(--lx-muted)" }}>{L(`🏪 אתרים חדשים שנפתחו בשם הזה: ${c.shops.week} השבוע (${c.shops.prev} בשבוע הקודם)`, `🏪 New sites opened under this name: ${c.shops.week} this week (${c.shops.prev} the week before)`)}</p> : null}
              {c.social?.ads ? <p className="text-[12px] font-bold" style={{ color: "var(--lx-muted)" }}>{L(`📢 מודעות חדשות באירופה השבוע: ${c.social.ads.week}${c.social.ads.more ? "+" : ""} (ספריית הפרסומות של מטא)`, `📢 New EU ads this week: ${c.social.ads.week}${c.social.ads.more ? "+" : ""} (Meta Ad Library)`)}</p> : null}
              {c.gap?.he ? <p className="text-[12px]" style={{ color: "#1d4ed8" }}>{L(`🇮🇱 ${gapHe(c.gap)}`, `🇮🇱 ${gapHe(c.gap)}`)}</p> : null}
              {c.supply?.state === "UNDERSUPPLIED" ? <p className="text-[12px] font-bold" style={{ color: "#067647" }}>{L(supplyLine(c.supply, "he"), supplyLine(c.supply, "en"))}</p> : null}
              {worldGapLine(c.worldGap, "he") ? <p className="text-[12px]" style={{ color: c.worldGap.before ? "#067647" : "var(--lx-muted)" }}>{L(`🌍 ${worldGapLine(c.worldGap, "he")}`, `🌍 ${worldGapLine(c.worldGap, "en")}`)}</p> : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px]" style={{ color: "var(--lx-muted)" }}>{L("המילים הן חיפוש כללי באליאקספרס, כמו ״סוודר אולד מאני״: שם של מותג נשאר מחוץ לרדאר.", "The words are a generic AliExpress search, like \"old money sweater\": brand names stay off the radar.")}</p>
      </div>
    </section>
  );
}

/**
 * The complete sealed ledger (radarLedger.js; the owner, 2026-11-17: "a million levels above
 * everyone"). The worldwide check that day found the big trend companies publishing accuracy they
 * measured themselves; here every book of calls, misses included, is sealed daily under one root,
 * and anyone can recompute it. Public behind the lock too: the root names no call.
 */
const BOOK_HE = Object.fromEntries(INSTRUMENTS.map((i) => [i.book, i.he]));
const BOOK_EN = Object.fromEntries(INSTRUMENTS.map((i) => [i.book, i.en]));

/**
 * "How do you know it's real?" (the owner, 17.11: "how will people understand there is nothing else
 * like it in the world?" — then "כן" to building it and to the sentence). People are shown how to
 * check, never asked to trust: the steps, the difference from accuracy a company measures itself,
 * and the record as it stands today. The sentence rests on the worldwide check of 17.11
 * (docs/research/radar-gap-map.md) and is dated, so it reads as what was found, never as a promise.
 */
/** The radar's open evidence (radarEvidence.js): every graded new-product call with the daily store readings behind it. */
const EVIDENCE_URL = "https://github.com/hen63165-dotcom/likelink/releases/download/radar/evidence-public.json";

function Proof({ record, hasLedger = false }) {
  const { L } = useL();
  const graded = Number(record?.graded) || 0;
  const hits = Number(record?.hits) || 0;
  const next = record?.nextDue || null;
  const steps = [
    L("📝 ביום הקביעה: הרדאר כותב אותה בספר, עם התאריך ומספר ההזמנות של אותו יום.", "📝 On the day of the call: the radar writes it in the book, with the date and that day's order count."),
    L("⛓️ באותו יום: טביעת האצבע של הספר נחתמת בביטקוין. מהרגע הזה הספר קבוע, וכל שינוי בו היה נראה מיד.", "⛓️ The same day: the book's fingerprint is sealed in Bitcoin. From then on the book is fixed, and any change would show at once."),
    L("⚖️ אחרי 14 יום: ציון בפומבי, פגיעה או פספוס. שניהם נשארים בספר לתמיד.", "⚖️ After 14 days: a public grade, hit or miss. Both stay in the book for good."),
    L("🔍 כל אחד בודק בעצמו: מורידים את הקבצים מספר החתימות וגוררים אותם לאתר החינמי opentimestamps.org.", "🔍 Anyone checks it themselves: download the files from the sealed ledger and drop them on the free site opentimestamps.org."),
    L("📂 והנתונים עצמם פתוחים: לכל קביעה על מוצר חדש, מספר ההזמנות של החנות כפי שהרדאר קרא אותו בכל יום, והציון שקיבלה.", "📂 And the data itself is open: for every call on a new product, the store's order count as the radar read it each day, and the grade it got."),
  ];
  return (
    <section className="lx-wrap mt-6" id="proof">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🔍 איך יודעים שזה אמיתי?", "🔍 How do you know it's real?")}</h2>
        <p className="mt-2 text-[16px] font-black leading-7">{L(RADAR_CLAIM.he, RADAR_CLAIM.en)}</p>
        <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`לפי בדיקה עולמית מ־${dmy(RADAR_CLAIM.checked)} · כל הספרים נחתמים יחד מ־18.11.2026`, `Per a worldwide check on ${dmy(RADAR_CLAIM.checked)} · every book sealed together since 18 Nov 2026`)}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="lx-card lx-rdr-item p-3">
            <p className="text-[13px] font-black">{L("בכלי טרנדים אחרים", "In other trend tools")}</p>
            <p className="mt-1 text-[14px] leading-6">{L("אחוז דיוק שהחברה מדדה ומפרסמת בעצמה.", "An accuracy figure the company measured and publishes itself.")}</p>
          </div>
          <div className="lx-card lx-rdr-item is-ours p-3">
            <p className="text-[13px] font-black">{L("ברדאר", "In the radar")}</p>
            <p className="mt-1 text-[14px] leading-6">{L("כל קביעה כתובה מראש, עם תאריך חתום בביטקוין, כולל הפספוסים. כל אחד בודק בעצמו.", "Every call written in advance, with a date sealed in Bitcoin, misses included. Anyone checks it themselves.")}</p>
          </div>
        </div>
        <ol className="mt-4 grid gap-2 text-[14px] leading-6">{steps.map((t) => <li key={t}>{t}</li>)}</ol>
        <p className="mt-3 text-[14px] font-bold">
          {graded
            ? L(`עד היום: ${graded} קביעות קיבלו ציון, ${hits} מהן פגיעות.`, `So far: ${graded} calls graded, ${hits} of them hits.`)
            : next ? L(`הציון הראשון בפומבי: ${dm(next)}.`, `The first public grade: ${dm(next)}.`) : null}
          {hasLedger ? <> <a className="underline" href="#ledger">{L("לספר החתימות המלא ←", "To the complete sealed ledger →")}</a></> : null}
          {" "}<a className="underline" href={EVIDENCE_URL} target="_blank" rel="noopener noreferrer">{L("לקובץ הקריאות היומיות ←", "To the daily readings file →")}</a>
        </p>
      </div>
    </section>
  );
}

/**
 * 🎲 The radar vs luck (radarLuck.js; the owner, 19.11: "כן"). A timestamp proves a call was not
 * changed, never that it was good; so each day one kind is drawn at random (seeded by the hash of
 * that day's sealed store prices) and graded by the same rule. The page prints both records, and
 * the difference only once both sides have three grades.
 */
function Luck({ luck, concepts = [] }) {
  const { L } = useL();
  if (!luck) return null;
  const name = (id) => (concepts.find((c) => c.id === id) || {}).he || id;
  const v = luck.versus || {};
  const line = (s, he, en) => (s?.graded ? L(`${he}: ${s.hits} מתוך ${s.graded} פגעו (${s.rate}%)`, `${en}: ${s.hits} of ${s.graded} hit (${s.rate}%)`) : null);
  const r = line(v.radar, "הרדאר", "The radar");
  const k = line(v.luck, "המזל", "Luck");
  return (
    <section className="lx-wrap mt-6" id="luck">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[20px] font-black">{L("🎲 הרדאר מול המזל", "🎲 The radar vs luck")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L("חותמת זמן מוכיחה שקביעה לא שונתה, אבל לא שהיא טובה. לכן כל יום נבחר באקראי סוג מוצר אחד מכל מה שהרדאר מדד, והוא מקבל ציון באותו כלל בדיוק: ‎+15% הזמנות בתוך 14 יום. ככה רואים במספרים כמה הרדאר טוב יותר ממזל.", "A timestamp proves a call was not changed, not that it was good. So each day one kind of product is drawn at random from everything the radar measured, and graded by exactly the same rule: +15% orders within 14 days. The numbers then show how much better than luck the radar is.")}</p>
        {luck.today ? <p className="mt-2 text-[14px] font-bold">{L(`הבחירה האקראית של היום: ${name(luck.today.concept)} (אחד מתוך ${luck.today.pool}). היא נקבעה לפי טביעת האצבע של מחירי החנות של היום, שנחתמו בביטקוין, כך שאיש לא בחר אותה.`, `Today's random draw: ${name(luck.today.concept)} (1 of ${luck.today.pool}). It was set by the fingerprint of today's store prices, sealed in Bitcoin, so nobody chose it.`)}</p> : null}
        {r || k ? <p className="mt-2 text-[15px] font-black">{[r, k].filter(Boolean).join(" · ")}</p> : null}
        {Number.isFinite(v.edge) ? <p className="text-[14px] font-bold">{v.edge >= 0 ? L(`הרדאר מעל המזל ב־${v.edge} נקודות אחוז.`, `The radar is ${v.edge} percentage points above luck.`) : L(`המזל לפני הרדאר ב־${-v.edge} נקודות אחוז. גם זה נשאר בספר.`, `Luck is ${-v.edge} percentage points ahead of the radar. That stays in the ledger too.`)}</p>
          : luck.nextDue ? <p className="mt-1 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L(`הציון הראשון של הבחירה האקראית: ${dm(luck.nextDue)}. ההשוואה מופיעה כשלשני הצדדים יש 3 ציונים.`, `The first grade of a random draw: ${dm(luck.nextDue)}. The comparison shows once both sides have 3 grades.`)}</p> : null}
        {luck.seal?.text ? <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}><a className="underline" download={`radar-luck-${luck.seal.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(luck.seal.text)}`}>{L(`כל ${luck.seal.count} הבחירות האקראיות, חתומות`, `all ${luck.seal.count} random draws, sealed`)}</a></p> : null}
      </div>
    </section>
  );
}

// 📏 The radar vs the simple ranking and chance (radarBaseline.js): the same pool, the same rule, sealed.
function Baseline({ baseline }) {
  const { L } = useL();
  if (!baseline?.versus) return null;
  const v = baseline.versus;
  const rule = baseline.rule || {};
  const line = (s, he, en) => (s?.graded ? L(`${he}: ${s.hits} מתוך ${s.graded} פגעו (${s.rate}%)`, `${en}: ${s.hits} of ${s.graded} hit (${s.rate}%)`) : null);
  const lines = [line(v.radar, "הרדאר", "The radar"), line(v.naive, "הדירוג הפשוט", "The simple ranking"), line(v.random, "ההגרלה", "Chance")].filter(Boolean);
  const edge = (x, he, en) => (Number.isFinite(x) ? (x >= 0 ? L(`הרדאר מעל ${he} ב־${x} נקודות אחוז.`, `The radar is ${x} percentage points above ${en}.`) : L(`${he} לפני הרדאר ב־${-x} נקודות אחוז, וזה נשאר בספר.`, `${en} is ${-x} percentage points ahead of the radar, and that stays in the ledger.`)) : null);
  const edges = [edge(v.edgeNaive, "הדירוג הפשוט", "the simple ranking"), edge(v.edgeRandom, "ההגרלה", "chance")].filter(Boolean);
  const picks = (list = []) => list.map((x) => `${x.title}${Number.isFinite(x.weekPct) ? ` (${x.weekPct > 0 ? "+" : ""}${x.weekPct}%)` : ""}`).join(" · ");
  return (
    <section className="lx-wrap mt-6" id="baseline">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[20px] font-black">{L("📏 הרדאר מול הדירוג הפשוט ומול הגרלה", "📏 The radar vs the simple ranking and chance")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L(`כדי לדעת כמה הבדיקות של הרדאר שוות, הוא נמדד כל יום מול שתי דרכים פשוטות, מאותם מוצרים קטנים שהוא קורא (${rule.minOrders ?? 30} עד ${(rule.maxOrders ?? 3000).toLocaleString("en-US")} הזמנות בחודש): ${rule.perDay ?? 3} המוצרים שההזמנות שלהם צומחות הכי מהר השבוע, בלי אף בדיקה של הרדאר, ו־${rule.perDay ?? 3} מוצרים בהגרלה, לפי טביעת האצבע של מחירי החנות של היום שנחתמו בביטקוין. כולם נבדקים באותו כלל של המוצרים החדשים: ‎+${rule.hitPct ?? 50}% הזמנות בתוך ${rule.days ?? 14} יום, וכולם נחתמים כל יום.`, `To know what the radar's checks are worth, it is measured every day against two simple ways, from the same small listings it reads (${rule.minOrders ?? 30} to ${(rule.maxOrders ?? 3000).toLocaleString("en-US")} orders a month): the ${rule.perDay ?? 3} listings whose orders grow fastest this week, with none of the radar's checks, and ${rule.perDay ?? 3} listings drawn by the fingerprint of today's store prices, sealed in Bitcoin. All are graded by the new products' own rule: +${rule.hitPct ?? 50}% orders within ${rule.days ?? 14} days, and all are sealed every day.`)}</p>
        {lines.length ? <p className="mt-2 text-[15px] font-black">{lines.join(" · ")}</p> : null}
        {edges.length ? <p className="text-[14px] font-bold">{edges.join(" ")}</p>
          : baseline.nextDue ? <p className="mt-1 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L(`הציון הראשון: ${dm(baseline.nextDue)}. ההשוואה מופיעה כשלכל צד יש ${v.minGraded ?? 3} ציונים, על אותם ימים${v.since ? ` (מ־${dm(v.since)})` : ""}.`, `The first grade: ${dm(baseline.nextDue)}. The comparison shows once each side has ${v.minGraded ?? 3} grades, on the same days${v.since ? ` (from ${dm(v.since)})` : ""}.`)}</p> : null}
        {v.radar?.calls ? <p className="mt-1 text-[13px]">{L(`${v.overlap} מתוך ${v.radar.calls} הקביעות של הרדאר היו גם בבחירה של הדירוג הפשוט באותו יום.`, `${v.overlap} of the radar's ${v.radar.calls} calls were also the simple ranking's pick that day.`)}</p> : null}
        {baseline.today?.naive?.length ? <p className="mt-2 text-[13px]"><b>{L("הדירוג הפשוט היום: ", "The simple ranking today: ")}</b><bdi dir="ltr">{picks(baseline.today.naive)}</bdi></p> : null}
        {baseline.today?.random?.length ? <p className="mt-1 text-[13px]"><b>{L("ההגרלה היום: ", "Chance today: ")}</b><bdi dir="ltr">{picks(baseline.today.random)}</bdi></p> : null}
        {baseline.rebuilt?.length ? <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`הבחירות של ${baseline.rebuilt.map(dm).join(", ")} נבנו בכלל הקבוע מהקריאות של אותו יום, ונחתמו לפני שאפשר היה לבדוק אותן.`, `The picks of ${baseline.rebuilt.map(dm).join(", ")} were rebuilt by the fixed rule from that day's readings, and sealed before any of them could be graded.`)}</p> : null}
        {baseline.seal?.text ? <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}><a className="underline" download={`radar-baseline-${baseline.seal.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(baseline.seal.text)}`}>{L(`כל ${baseline.seal.count} הבחירות של הדירוג וההגרלה, חתומות`, `all ${baseline.seal.count} ranking and chance picks, sealed`)}</a></p> : null}
      </div>
    </section>
  );
}

function Ledger({ ledger, freshBook = null, stagesBook = null, kindsBook = null, brainBook = null, promiseBook = null, windowBook = null, anchors = null }) {
  const { L } = useL();
  if (!ledger?.sha256) return null;
  const anchored = anchors?.list || [];
  const books = String(ledger.text || "").split("\n").map((l) => l.split("=")[0]).filter((k) => BOOK_HE[k]);
  return (
    <section className="lx-wrap mt-6" id="ledger">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[20px] font-black">{L("🧾 ספר החתימות המלא", "🧾 The complete sealed ledger")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L("כל מה שהרדאר אמר, כולל החטאות, נחתם כל יום בביטקוין תחת חתימה אחת, כך שכל אחד יכול לבדוק שהכול נשאר בדיוק כמו שנחתם. חברות הטרנדים הגדולות מפרסמות אחוזי דיוק שהן מדדו בעצמן; כאן כל קביעה חתומה מראש ופתוחה לבדיקה של כל אחד.", "Everything the radar said, misses included, is sealed in Bitcoin every day under one root, so anyone can check that it all stayed exactly as sealed. The big trend companies publish accuracy they measured themselves; here every call is sealed in advance and open for anyone to check.")}</p>
        {books.length ? <p className="mt-2 text-[13px] font-bold">{L(`בחתימה של ${dm(ledger.d)}: ${books.map((k) => BOOK_HE[k]).join(" · ")}`, `In the ${dm(ledger.d)} seal: ${books.map((k) => BOOK_EN[k]).join(" · ")}`)}</p> : null}
        <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>
          <span dir="ltr">🔏 SHA-256 {ledger.sha256.slice(0, 24)}…</span>
          {ledger.text ? <> · <a className="underline" download={`radar-ledger-${ledger.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(ledger.text)}`}>{L("השורש (טקסט)", "the root (text)")}</a></> : null}
          {stagesBook?.text ? <> · <a className="underline" download={`radar-stages-${stagesBook.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(stagesBook.text)}`}>{L(`כל ${stagesBook.count} קביעות השלב`, `all ${stagesBook.count} stage calls`)}</a></> : null}
          {freshBook?.text ? <> · <a className="underline" download={`radar-fresh-${freshBook.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(freshBook.text)}`}>{L(`כל ${freshBook.count} המוצרים החדשים שהוצגו`, `all ${freshBook.count} new products shown`)}</a></> : null}
          {kindsBook?.text ? <> · <a className="underline" download={`radar-kinds-${kindsBook.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(kindsBook.text)}`}>{L(`כל ${kindsBook.count} הסוגים החדשים שהוצגו`, `all ${kindsBook.count} new kinds shown`)}</a></> : null}
          {brainBook?.text ? <> · <a className="underline" download={`radar-brain-${brainBook.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(brainBook.text)}`}>{L("מה המוח למד", "what the brain learned")}</a></> : null}
          {promiseBook?.text ? <> · <a className="underline" download={`radar-ranges-${promiseBook.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(promiseBook.text)}`}>{L(`כל ${promiseBook.count} הטווחים של היום`, `all ${promiseBook.count} ranges of the day`)}</a></> : null}
          {windowBook?.text ? <> · <a className="underline" download={`radar-window-${windowBook.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(windowBook.text)}`}>{L(`כל ${windowBook.count} הסיכויים של שעון החלון`, `all ${windowBook.count} window-clock chances`)}</a></> : null}
          {(ledger.ots || []).map((o) => <span key={o.cal}> · <a className="underline" download={`radar-ledger-${ledger.d}.txt.ots`} href={`data:application/octet-stream;base64,${o.b64}`}>{L(`הוכחה (${o.cal.split(".")[0]})`, `proof (${o.cal.split(".")[0]})`)}</a></span>)}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "var(--lx-muted)" }}>{L("לבדיקה: מורידים את השורש ואת ההוכחה וגוררים אותם ל־opentimestamps.org. כל שורה בשורש היא טביעת האצבע של ספר אחד, וכל ספר מתפרסם כאן בטקסט מלא.", "To check: download the root and the proof and drop them on opentimestamps.org. Each line of the root is one book's fingerprint, and each book is published here in full text.")}</p>
        {anchored.length ? (
          <div className="mt-3" id="anchors">
            <p className="text-[15px] font-black">{L("⛓️ בתוך הבלוקצ׳יין של ביטקוין", "⛓️ Inside the Bitcoin blockchain")}</p>
            <p className="text-[12px] leading-5">{L("כל יום הרדאר בודק שהחתימה של היום הקודם נכנסה לבלוק ביטקוין: הוא משווה את שורש המרקל שההוכחה מגיעה אליו לשורש של הבלוק עצמו, אצל סייר בלוקים ציבורי. רק התאמה מוצגת כאן.", "Every day the radar checks that the previous day's seal entered a Bitcoin block: it compares the Merkle root the proof arrives at with the block's own, at a public block explorer. Only a match is shown here.")}</p>
            <ul className="mt-1 grid gap-1 text-[12px]">
              {anchored.map((a) => (
                <li key={a.d}>
                  {L(`ספר החתימות של ${dm(a.d)} נמצא בבלוק `, `The ${dm(a.d)} ledger is in block `)}
                  <a className="underline font-bold" dir="ltr" href={`https://mempool.space/block/${a.block}`} rel="noopener noreferrer" target="_blank">#{a.height.toLocaleString("en-US")}</a>
                  {a.time ? L(`, שנכרה ב־${new Date(a.time * 1000).toLocaleDateString("he-IL")}`, `, mined ${new Date(a.time * 1000).toLocaleDateString("en-GB")}`) : null}
                  {a.b64 ? <> · <a className="underline" download={`radar-ledger-${a.d}.txt.ots`} href={`data:application/octet-stream;base64,${a.b64}`}>{L("ההוכחה המלאה", "the complete proof")}</a></> : null}
                </li>
              ))}
            </ul>
            {anchors.pending ? <p className="mt-1 text-[11px]" style={{ color: "var(--lx-muted)" }}>{L(`עוד ${anchors.pending} ימים בדרך לבלוק (זה לוקח כמה שעות).`, `${anchors.pending} more days on their way into a block (it takes a few hours).`)}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Waves the radar measures but never sells (brandWaves.js): the copy has no buy button; the legal alternative does. */
function Waves({ waves }) {
  const { L } = useL();
  if (!waves?.list?.length) return null;
  const pct = (v) => (v > 0 ? `+${v}%` : `${v}%`);
  return (
    <section className="lx-wrap mt-8" id="waves">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🌊 גלים שהרדאר רואה, ולא מקדם", "🌊 Waves the radar sees, and does not promote")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L("ברשימות המוצרים החמים של אליאקספרס יש הרבה מוצרים עם שם של מותג, דמות או כלי להעתקת כרטיסים. הרדאר מודד כל גל כזה, ומקדם רק את החלופה החוקית: כמה מוצרים חמים נושאים את השם, כמה מודעות יש לו וכמה הן גדלו בשבוע, מה משלימים בגוגל בארה״ב, וכמה סרטונים קצרים עלו עליו השבוע. לצידו, כשנמצאה: החלופה החוקית שעונה על אותו צורך, בשם משלה.", "AliExpress's hot lists are full of items named after a brand, a character or a card-copying tool. We don't promote them, but the radar measures every such wave: how many hot items carry the name, how many listings it has and their weekly change, what Google suggests in the US, and how many short videos came out this week. Beside it, when found: the legal alternative that answers the same need, without the name.")}</p>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {waves.list.map((w) => (
            <li key={w.token} className="lx-card lx-rdr-item p-3">
              <p className="text-[16px] font-black" dir="ltr" style={{ textAlign: "start" }}>{w.token}</p>
              <p className="text-[12px] font-bold" style={{ color: "#b91c1c" }}>{L(`🔒 ${w.reasonHe}: מקדמים רק את החלופה החוקית`, `🚫 Not promoted: ${w.reason === "TOOL" ? "a card and remote copying tool" : "a brand or character name: on AliExpress, an imitation or unlicensed"}`)}</p>
              <p className="mt-1 text-[12px]">{L(`${w.items} מוצרים חמים עם השם · ${w.orders.toLocaleString("he-IL")} הזמנות ב־30 יום (אליאקספרס)`, `${w.items} hot items carry the name · ${w.orders.toLocaleString("en-US")} orders in 30 days (AliExpress)`)}</p>
              {w.listings !== null ? <p className="text-[12px]">{L(`${w.listings.toLocaleString("he-IL")} מודעות באליאקספרס${w.listingsWeekPct !== null ? ` · ${pct(w.listingsWeekPct)} בשבוע` : ""}`, `${w.listings.toLocaleString("en-US")} AliExpress listings${w.listingsWeekPct !== null ? ` · ${pct(w.listingsWeekPct)} a week` : ""}`)}</p> : null}
              {w.buzz?.length ? <p className="text-[12px]">{L(`🔊 בגוגל בארה״ב כבר משלימים: ${w.buzz.join(", ")}`, `🔊 Google in the US already suggests: ${w.buzz.join(", ")}`)}</p> : w.buzz ? <p className="text-[12px]">{L("🤫 בגוגל בארה״ב עוד שקט סביבו", "🤫 Google in the US doesn't suggest 'tiktok' or 'viral' yet")}</p> : null}
              {w.yt ? <p className="text-[12px]">{L(`▶️ ביוטיוב: ${w.yt.videos} סרטונים קצרים חדשים ב־${w.yt.days} ימים${w.yt.views ? `, ${w.yt.views.toLocaleString("he-IL")} צפיות` : ""}`, `▶️ YouTube: ${w.yt.videos} new short videos in ${w.yt.days} days${w.yt.views ? `, ${w.yt.views.toLocaleString("en-US")} views` : ""}`)}</p> : null}
              {w.ig ? <p className="text-[12px]">{L(`📸 באינסטגרם: ${w.ig.capped ? "50+" : w.ig.posts} פוסטים עם #${w.token.replace(/[^a-z0-9]/gi, "")} ב־24 השעות האחרונות`, `📸 Instagram: ${w.ig.capped ? "50+" : w.ig.posts} posts on #${w.token.replace(/[^a-z0-9]/gi, "")} in the last 24 hours`)}</p> : null}
              {w.firstSeen ? <p className="text-[11px]" style={{ color: "var(--lx-muted)" }}>{L(`הרדאר מודד את הגל מ־${dm(w.firstSeen)}`, `Measured since ${dm(w.firstSeen)}`)}</p> : null}
              {w.alt ? (
                <div className="mt-2 flex gap-2 rounded-xl p-2" style={{ background: "#f0fdf4" }}>
                  <div style={{ width: 64, height: 64, flex: "0 0 64px", borderRadius: 10, overflow: "hidden" }}><Img src={w.alt.image} alt={w.alt.title} loading="lazy" style={{ width: 64, height: 64, objectFit: "cover" }} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black" style={{ color: "#166534" }}>{L("✅ החלופה החוקית", "✅ The legal alternative")}</p>
                    <p className="text-[12px] leading-5">{w.alt.title}{w.alt.price ? L(` · מ־₪${w.alt.price}`, ` · from ₪${w.alt.price}`) : ""}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <a href={w.alt.buy} target="_blank" rel="noopener sponsored" onClick={() => recordExit(`wave-${w.token}`, w.alt.buy)} className="lx-btn lx-btn-ink" style={{ minHeight: 30, padding: "2px 10px", fontSize: 12 }}>{L("לחנות", "Store")} <ExternalLink size={12} aria-hidden="true" /></a>
                      <Go to={w.alt.check} className="lx-btn lx-btn-ghost" style={{ minHeight: 30, padding: "2px 10px", fontSize: 12 }}>{L("מה לבדוק", "What to check")}</Go>
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px]" style={{ color: "var(--lx-muted)" }}>{L("#פרסומת · כפתור החנות של החלופה הוא קישור שותפים. כל המספרים נמדדו.", "#ad · the alternative's store button is an affiliate link. Measured numbers, nothing guessed.")}</p>
      </div>
    </section>
  );
}

/** The global trend clock (worldClock.js): the day each product reached each country, Israel's lag, the sealed "next country" calls. */
function Globe({ globe }) {
  const { L } = useL();
  if (!globe?.countries?.length) return null;
  const C = Object.fromEntries(globe.countries.map((c) => [c.id, c]));
  const il = globe.israel || { n: 0, medianDays: null };
  const base = C[globe.base]?.he || "ארה״ב";
  const lagText = (d) => (d > 0 ? L(`${d} ימים אחרי ${base}`, `${d} days after the US`) : d < 0 ? L(`${-d} ימים לפני ${base}`, `${-d} days before the US`) : L(`באותו יום כמו ${base}`, "the same day as the US"));
  const measured = globe.table.filter((r) => r.medianDays !== null);
  return (
    <section className="lx-wrap mt-8" id="globe">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🌍 השעון העולמי של הטרנדים", "🌍 The global trend clock")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L(`בכל בוקר הרדאר בודק בחיפוש של גוגל ב־${globe.countries.length - 1} מדינות ובעברית בישראל אם כבר מחפשים כל מוצר. היום הראשון שבו מופיעים חיפושים, אחרי יום שקט, הוא יום ההגעה למדינה. כך רואים את הגל עובר ממדינה למדינה, עם תאריכים.`, `Every morning the radar checks Google search in ${globe.countries.length - 1} countries, and Hebrew search in Israel, for every product. The first day searches show up after a quiet day is its arrival there, so you watch the wave move from country to country, with dates.`)}</p>
        <div className="mt-3 rounded-2xl p-4" style={{ background: "#0b0b0b", color: "#fff" }}>
          <p className="text-[13px] font-bold" style={{ color: "#93c5fd" }}>{L("🇮🇱 המספר של ישראל", "🇮🇱 Israel's number")}</p>
          {il.medianDays !== null ? (
            <p className="mt-1 text-[20px] font-black leading-7">{L(`מוצר טרנדי מגיע לישראל בדרך כלל ${lagText(il.medianDays)}`, `A trending product typically reaches Israel ${lagText(il.medianDays)}`)}</p>
          ) : (
            <p className="mt-1 text-[18px] font-black leading-7">{L(`נמדד עכשיו: ${il.n} מתוך ${globe.minPairs} מוצרים שהרדאר ראה מגיעים גם ל${base} וגם לישראל`, `Measuring now: ${il.n} of ${globe.minPairs} products the radar saw arrive in both the US and Israel`)}</p>
          )}
          <p className="mt-1 text-[12px]" style={{ color: "#cbd5e1" }}>{L(`חציון של ${il.n} מוצרים שהגעתם נצפתה בשתי המדינות. המספר מופיע מ־${globe.minPairs} מוצרים.`, `The median of ${il.n} products whose arrival was observed in both countries. It shows from ${globe.minPairs}.`)}</p>
        </div>
        {measured.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {measured.map((r) => <li key={r.id} className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: "#fff", border: "1px solid var(--lx-line)" }}>{C[r.id]?.flag} {C[r.id]?.he}: {lagText(r.medianDays)} ({r.n})</li>)}
          </ul>
        ) : null}
        {globe.waves?.length ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {globe.waves.map((w) => {
              const arrived = w.countries.filter((c) => c.status === "ARRIVED").sort((a, b) => (a.on < b.on ? -1 : 1));
              const present = w.countries.filter((c) => c.status === "PRESENT");
              const quiet = w.countries.filter((c) => c.status === "QUIET");
              const name = w.he || w.en;
              return (
                <li key={w.id} className="lx-card lx-rdr-item p-3">
                  <p className="text-[16px] font-black">{name}</p>
                  {arrived.length ? (
                    <ol className="mt-2 flex flex-wrap items-center gap-1 text-[12px] font-bold">
                      {arrived.map((c, i) => <li key={c.id} className="flex items-center gap-1">{i ? <span aria-hidden="true">←</span> : null}<span className="rounded-full px-2 py-0.5" style={{ background: "#dbeafe" }}>{C[c.id]?.flag} {C[c.id]?.he} {dm(c.on)}</span></li>)}
                    </ol>
                  ) : null}
                  {present.length ? <p className="mt-2 text-[12px]">{L(`כבר חיפשו כשהרדאר התחיל למדוד: ${present.map((c) => `${C[c.id]?.flag} ${C[c.id]?.he}`).join(" · ")}`, `Already searched when the radar began: ${present.map((c) => `${C[c.id]?.flag} ${C[c.id]?.he}`).join(" · ")}`)}</p> : null}
                  {quiet.length ? <p className="mt-1 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L(`עוד שקט: ${quiet.map((c) => `${C[c.id]?.flag} ${C[c.id]?.he}`).join(" · ")}`, `Still quiet: ${quiet.map((c) => `${C[c.id]?.flag} ${C[c.id]?.he}`).join(" · ")}`)}</p> : null}
                  {w.israelAfterUs !== null ? <p className="mt-2 text-[13px] font-black">{L(`🇮🇱 הגיע לישראל ${lagText(w.israelAfterUs)}`, `🇮🇱 Reached Israel ${lagText(w.israelAfterUs)}`)}</p> : null}
                  <p className="mt-2 text-[11px] leading-5" style={{ color: "var(--lx-muted)" }}>{L("מה נבדק: ", "Checked: ")}<span dir="ltr">“{w.en}”</span>{w.q ? <> · {L("בעברית", "Hebrew")}: “{w.q}”</> : null}{w.zh ? <> · <span dir="ltr">{w.zh}</span></> : null}{w.ko ? <> · <span dir="ltr">{w.ko}</span></> : null}</p>
                  {w.israelAfterUs !== null ? <div className="mt-2"><ShareButton path="/radar#globe" title={L(`השעון העולמי של הרדאר: ${name} הגיע לישראל ${lagText(w.israelAfterUs)}. נמדד בחיפושי גוגל, עם תאריכים.`, `The radar's global clock: ${name} reached Israel ${lagText(w.israelAfterUs)}. Measured in Google searches, with dates.`)} variant="button" /></div> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="mt-4 rounded-2xl p-3" style={{ background: "#fff", border: "1px solid var(--lx-line)" }}>
          <p className="text-[14px] font-black">{L("🎯 איזו מדינה הבאה?", "🎯 Which country is next?")}</p>
          {globe.calls?.open?.length ? (
            <ul className="mt-1 grid gap-1 text-[13px]">
              {globe.calls.open.map((c) => <li key={`${c.concept}-${c.at}`}>{L(`${c.concept}: הרדאר קבע ב־${dm(c.at)} שהבאה בתור היא ${C[c.country]?.flag} ${C[c.country]?.he}. הציון בפומבי ב־${dm(c.due)}.`, `${c.concept}: on ${dm(c.at)} the radar called ${C[c.country]?.flag} ${C[c.country]?.he} next. Graded in public on ${dm(c.due)}.`)}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] leading-6">{L(`הרדאר קובע את המדינה הבאה, חתום מראש בביטקוין, מהרגע שיש לו פער מדוד לפחות מ־${globe.minPairs} מוצרים במדינה. עד אז הוא אוסף הגעות: ${globe.observed} נצפו עד היום.`, `The radar calls the next country, sealed in advance in Bitcoin, once it has a measured lag from at least ${globe.minPairs} products in that country. Until then it collects arrivals: ${globe.observed} observed so far.`)}</p>
          )}
          {globe.calls?.graded ? <p className="mt-1 text-[12px] font-bold">{L(`${globe.calls.hits} מתוך ${globe.calls.graded} קביעות פגעו`, `${globe.calls.hits} of ${globe.calls.graded} calls hit`)}</p> : null}
          {globe.seal ? <p className="mt-1 text-[11px]" style={{ color: "var(--lx-muted)" }} dir="ltr">SHA-256 {globe.seal.sha256.slice(0, 16)}… · {dm(globe.seal.d)}</p> : null}
        </div>
        <p className="mt-2 text-[11px] leading-5" style={{ color: "var(--lx-muted)" }}>{L("המקורות: ההשלמות הציבוריות של גוגל בכל מדינה (השם באנגלית מהחנות), באידו ונייבר כשהכללים שלהם מאפשרים, וחיפוש בעברית בגוגל וביוטיוב בישראל. נמדדות רמות (כמה השלמות לחיפוש), וכל מדידה עם תאריך. מה ענה בכל ריצה: בקבלת הריצה, בלשונית ההוכחה.", "Sources: Google's public suggestions in each country (the store's English words), Baidu and Naver when their rules allow, and Hebrew search on Google and YouTube in Israel. Levels (how many search suggestions), every measurement dated. What answered in each run: the run receipt, in the proof tab.")}</p>
      </div>
    </section>
  );
}

/** 🔮 The weekly challenge (radarChallenge.js): four measured products, the radar's sealed choice, the live scoreboard, the results. */
function Challenge({ ch }) {
  const { L } = useL();
  if (!ch || (!ch.open && !ch.recent?.length)) return null;
  const o = ch.open;
  const pct = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}%`);
  const live = (id) => o?.progress?.find((p) => p.concept === id)?.pct ?? null;
  return (
    <section className="lx-wrap mt-8" id="challenge" style={{ scrollMarginTop: 80 }}>
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("🔮 האתגר השבועי: מה החוש השישי שלך אומר?", "🔮 This week's challenge: what does your sixth sense say?")}</h2>
        {o ? (
          <>
            <p className="mt-1 text-[14px] leading-6">{L(`${o.source === "fresh" ? "4 מוצרים חדשים שהרדאר מצא בעצמו: מעט מוכרים, ההזמנות גדלות מהר, ובחו״ל עוד שקט סביבם. " : ""}איזה מהם יזנק הכי הרבה בהזמנות באליאקספרס עד ${dm(o.due)}? הרדאר כבר בחר, והבחירה שלו חתומה מראש. ב־${dm(o.due)} החתימה נפתחת וההזמנות האמיתיות קובעות, בפומבי.`, `${o.source === "fresh" ? "Four new listings the radar found on its own: few sellers, fast-growing orders, no buzz abroad yet. " : ""}Which will grow the most in AliExpress orders by ${dm(o.due)}? The radar already chose, sealed in advance. On ${dm(o.due)} the seal opens and the real orders decide, in public.`)}</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {o.options.map((x, i) => (
                <li key={x.concept} className="lx-card overflow-hidden" style={{ boxShadow: "none", border: "1px solid var(--lx-line)", background: "#fff" }}>
                  {x.image ? <div style={{ aspectRatio: "1 / 1", overflow: "hidden" }}><Img src={x.image} alt={x.label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div> : null}
                  <div className="p-2">
                    <p className="text-[12px] font-bold" style={{ color: "var(--lx-muted)" }}>{i + 1}</p>
                    <p className="text-[14px] font-black leading-5">{x.label}</p>
                    <p className="mt-1 text-[12.5px] font-bold">{L(`עד עכשיו: ${pct(live(x.concept))}`, `So far: ${pct(live(x.concept))}`)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px]">{L(`יום ${o.dayN} מתוך 14. "עד עכשיו" הוא השינוי בהזמנות מאז שהאתגר נפתח.`, `Day ${o.dayN} of 14. "So far" is the change in orders since the challenge opened.`)}</p>
            {o.seal ? <p className="mt-1 text-[11px]" style={{ color: "var(--lx-muted)" }} dir="ltr">🔒 SHA-256 {o.seal.sha256.slice(0, 24)}… · {dm(o.seal.d)}{o.seal.ots?.length ? " · OpenTimestamps" : ""}</p> : null}
            <div className="mt-2"><ShareButton path="/radar#challenge" title={L(`🔮 האתגר השבועי של רדאר הטרנדים: איזה מוצר יזנק הכי הרבה עד ${dm(o.due)}? הרדאר כבר בחר, חתום מראש. מה החוש השישי שלך אומר?`, `🔮 The trend radar's weekly challenge: which product grows most by ${dm(o.due)}? The radar already chose, sealed in advance. What does your sixth sense say?`)} variant="button" /></div>
          </>
        ) : <p className="mt-1 text-[14px] leading-6">{L("האתגר הבא נפתח ביום שהרדאר מוצא בעצמו 4 מוצרים חדשים שעוברים את כל הבדיקות: מעט מוכרים, הזמנות שגדלות מהר בשתי מדידות ברצף, ובחו״ל עוד שקט סביבם. עד אז, עוד שקט.", "The next challenge opens on the day the radar finds 4 new listings that pass every check on its own: few sellers, orders growing fast in two readings in a row, no buzz abroad yet. Until then, quiet.")}</p>}
        {ch.recent?.length ? (
          <div className="mt-4">
            <p className="text-[14px] font-black">{L(`📖 תוצאות (${ch.record.radarHits} מתוך ${ch.record.graded} פעמים הבחירה של הרדאר ניצחה)`, `📖 Results (the radar's choice won ${ch.record.radarHits} of ${ch.record.graded})`)}</p>
            <ul className="mt-2 grid gap-2">
              {ch.recent.map((r) => r.result === "CANCELLED" ? (
                <li key={r.id} className="rounded-xl p-3 text-[13px]" style={{ background: "#fff", border: "1px solid var(--lx-line)" }}>
                  <p className="font-black">{L(`האתגר של ${dm(r.at)} נסגר: ארבעת המוצרים בו היו מוצרים מוכרים (${r.options.map((x) => x.label).join(", ")}). מעכשיו האתגר נבנה רק ממוצרים שהרדאר גילה בעצמו.`, `The ${dm(r.at)} challenge was closed: its four products were already well known (${r.options.map((x) => x.label).join(", ")}). From now on the challenge is built only from what the radar found on its own.`)}</p>
                  {r.text ? <p className="mt-1 text-[11px]" style={{ color: "var(--lx-muted)", wordBreak: "break-all" }} dir="ltr">{r.text}</p> : null}
                </li>
              ) : (
                <li key={r.id} className="rounded-xl p-3 text-[13px]" style={{ background: "#fff", border: "1px solid var(--lx-line)" }}>
                  <p className="font-black">{L(`האתגר של ${dm(r.at)}: המנצח ${r.winnerLabels.join(" / ")}`, `${dm(r.at)}: the winner was ${r.winnerLabels.join(" / ")}`)}</p>
                  <p>{r.options.map((x) => `${x.label} ${pct(x.growth)}`).join(" · ")}</p>
                  <p className="mt-1">{L(`הבחירה החתומה של הרדאר: ${r.radarLabel} ${r.result === "HIT" ? "🎯" : "· הפעם ניצח מוצר אחר"}`, `The radar's sealed choice: ${r.radarLabel} ${r.result === "HIT" ? "🎯" : "· another product won this time"}`)}</p>
                  {r.text ? <p className="mt-1 text-[11px]" style={{ color: "var(--lx-muted)", wordBreak: "break-all" }} dir="ltr">{r.text}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** The crowd sensor (crowdSensor.js): what different people checked in the magic button this week. */
function Crowd({ crowd }) {
  const { L } = useL();
  if (!crowd) return null;
  return (
    <section className="lx-wrap mt-8" id="crowd">
      <div className="lx-card lx-rdr-panel p-5">
        <h2 className="text-[22px] font-black">{L("👥 מה בודקים בארץ השבוע", "👥 What people in Israel check this week")}</h2>
        <p className="mt-1 text-[14px] leading-6">{L("מי שרואה מוצר ברילס מדביקה את הקישור בכפתור הקסם. כשכמה אנשים שונים בודקים את אותו מוצר באותו שבוע, הוא כנראה מסתובב עכשיו ברשתות בארץ. הרדאר סופר רק את מספר המוצר, והזהות של מי שבדק נשארת פרטית.", "People who see a product in a reel paste its link into the magic button. When several different people check the same item in a week, it is probably going around Israeli feeds right now. The radar counts only the item number, nothing about who checked.")}</p>
        {crowd.kinds?.length ? (
          <div className="mt-3">
            <p className="text-[15px] font-black">{L("📸 מה מצלמים בארץ השבוע", "📸 What people in Israel photograph this week")}</p>
            <p className="text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("צילומי מסך שאנשים שונים העלו לכפתור הקסם. הבינה המלאכותית זיהתה את הסוג בטלפון של כל אחת, והתמונה נשארה אצלה: לרדאר מגיע רק שם הסוג.", "Screenshots different people gave the magic button. The AI recognized the kind on each person's own phone and the picture stayed there: the radar gets only the kind's name.")}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {crowd.kinds.map((k) => (
                <li key={k.id}><Go to={k.id.startsWith("category-") ? `/magic?q=${encodeURIComponent(k.he)}` : `/radar#${k.id}`} className="lx-btn lx-btn-ghost" style={{ minHeight: 34, padding: "4px 12px", fontSize: 13 }}>{L(`${k.he} · ${k.people} אנשים`, `${k.he} · ${k.people} people`)}</Go></li>
              ))}
            </ul>
          </div>
        ) : null}
        {crowd.list.length ? (
          <>
            <p className="mt-2 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("#פרסומת · כפתור החנות הוא קישור שותפים", "#ad · the store button is an affiliate link")}</p>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {crowd.list.map((c) => (
                <li key={c.id} className="lx-card flex gap-3 p-3" style={{ boxShadow: "none", border: "1px solid var(--lx-line)", background: "#fff" }}>
                  <div style={{ width: 76, height: 76, flex: "0 0 76px", borderRadius: 12, overflow: "hidden" }}><Img src={c.image} alt={c.title} loading="lazy" style={{ width: 76, height: 76, objectFit: "cover" }} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold leading-5">{c.title}</p>
                    <p className="mt-1 text-[15px] font-black" style={{ color: "#a16207" }}>{L(`👥 ${c.people} אנשים שונים בדקו אותו ב־${crowd.days} ימים`, `👥 ${c.people} different people checked it in ${crowd.days} days`)}</p>
                    {c.momentum ? <p className="text-[12px]">{L(`באליאקספרס: ${c.momentum.weekPct > 0 ? "+" : ""}${c.momentum.weekPct}% הזמנות בשבוע`, `On AliExpress: ${c.momentum.weekPct > 0 ? "+" : ""}${c.momentum.weekPct}% orders a week`)}</p> : null}
                    {c.blocked ? <p className="text-[12px] font-bold" style={{ color: "#b91c1c" }}>{L(c.blocked === "TOOL" ? "🔒 כלי להעתקת כרטיסים ושלטים: מקדמים רק חלופה חוקית" : "🔒 שם של מותג או דמות: מקדמים רק חלופה חוקית", c.blocked === "TOOL" ? "🚫 Not promoted: a card and remote copying tool" : "🚫 Not promoted: a brand or character name")}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.buy ? <a href={c.buy} target="_blank" rel="noopener sponsored" onClick={() => recordExit("crowd", c.buy)} className="lx-btn lx-btn-ink" style={{ minHeight: 32, padding: "2px 12px", fontSize: 12 }}>{L("לחנות", "Store")} <ExternalLink size={12} aria-hidden="true" /></a> : null}
                      <Go to={c.check} className="lx-btn lx-btn-ghost" style={{ minHeight: 32, padding: "2px 12px", fontSize: 12 }}>{L("מה לבדוק", "What to check")}</Go>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-[14px] font-bold">{L("כאן יופיע מוצר ברגע ששני אנשים שונים יבדקו אותו השבוע. כל בדיקה בכפתור הקסם מזינה את הרדאר.", "No item has been checked by two different people this week yet. Every magic-button check feeds the radar.")} <Go to="/magic" className="underline">{L("לכפתור הקסם", "To the magic button")}</Go></p>
        )}
      </div>
    </section>
  );
}

/** The radar's own symbol, drawn: rings, a cross and one sweeping beam
 *  (frontend-design: the page's single moment). Decoration only — no blips,
 *  so nothing on it reads as a measurement. */
function RadarScope() {
  return (
    <div className="lx-rdr-scope" aria-hidden="true">
      <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="100" cy="100" r="96" />
        <circle cx="100" cy="100" r="64" />
        <circle cx="100" cy="100" r="32" />
        <path d="M100 4v192M4 100h192" />
      </svg>
      <span className="lx-rdr-sweep" />
      <span className="lx-rdr-core" />
    </div>
  );
}

// The page's four tabs, and the tab each old #section link belongs to.
const RADAR_TABS = [
  { id: "today", he: "היום", en: "Today" },
  { id: "proof", he: "ההוכחה", en: "The proof" },
  { id: "tools", he: "כלי הרדאר", en: "Radar tools" },
  { id: "plans", he: "מסלולים ומחיר", en: "Plans & pricing" },
];
const TAB_OF = SECTION_TABS;
function tabFromHash() {
  if (typeof location === "undefined") return "today";
  let id = "";
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { id = ""; }
  return TAB_OF[id] || "today";
}
const RadarTiers = lazy(() => import("./radarPro").then((m) => ({ default: m.RadarTiers })));

/** The tab bar: one row, sticky under the site header; arrows move between tabs (RTL aware). */
function RadarTabs({ tab, onPick }) {
  const { L } = useL();
  const keys = (e) => {
    const i = RADAR_TABS.findIndex((t) => t.id === tab);
    const rtl = document.documentElement.dir !== "ltr";
    const step = e.key === "ArrowLeft" ? (rtl ? 1 : -1) : e.key === "ArrowRight" ? (rtl ? -1 : 1) : 0;
    if (!step) return;
    e.preventDefault();
    const next = RADAR_TABS[(i + step + RADAR_TABS.length) % RADAR_TABS.length];
    onPick(next.id, { scroll: false });
    setTimeout(() => document.getElementById(`rdr-tab-${next.id}`)?.focus(), 0);
  };
  return (
    <nav className="lx-rdr-tabs" id="rdr-tabs" aria-label={L("חלקי הרדאר", "Radar sections")}>
      <div className="lx-wrap">
        <div role="tablist" className="lx-rdr-tablist" onKeyDown={keys}>
          {RADAR_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`rdr-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`rdr-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} className="lx-rdr-tab" onClick={() => onPick(t.id)}>{L(t.he, t.en)}</button>
          ))}
        </div>
      </div>
    </nav>
  );
}

export function RadarPage() {
  const { L } = useL();
  const [board, setBoard] = useState(undefined);
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(false);
  const [hashId, setHashId] = useState("");
  const [tab, setTab] = useState(tabFromHash);
  const [plansSeen, setPlansSeen] = useState(() => tabFromHash() === "plans");
  const results = useRef(null);
  // One tab at a time (the owner, 20.11: "clear without explanations"); every old #section link
  // still opens its own tab, and the tab's name stays in the address so it can be shared.
  const pick = (t, { scroll = true } = {}) => {
    setTab(t);
    if (t === "plans") setPlansSeen(true);
    try { history.replaceState(null, "", `${location.pathname}${location.search}#${t}`); } catch { /* an old browser keeps the old address */ }
    if (scroll) setTimeout(() => document.getElementById("rdr-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  useEffect(() => {
    const onHash = () => { const t = tabFromHash(); setTab(t); if (t === "plans") setPlansSeen(true); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let live = true;
    loadBoard().then((b) => {
      if (!live) return;
      setBoard(b);
      // A link from the magic button (/radar#<concept>) opens on that concept.
      const id = typeof location !== "undefined" ? decodeURIComponent(location.hash.slice(1)) : "";
      if (TAB_OF[id] && !RADAR_TABS.some((t) => t.id === id)) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 160);
      if (b && /^[a-z0-9-]{2,42}$/.test(id) && b.concepts.some((c) => c.id === id)) {
        setShown(true);
        setHashId(id);
        setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    });
    return () => { live = false; };
  }, []);

  // After the owner's trial, while billing is on (accessOf.locked), the results are for subscribers;
  // everyone else gets the upgrade screen. The server decides who is subscribed (sub=radar-get).
  // The server decides (radarGate.boardAccess): the launch trial, her own trial, her subscription.
  const acc = board === undefined ? null : radarAccess;
  const gated = acc?.reason === "sign_in_for_trial" || acc?.reason === "subscription_required";

  const concepts = board?.concepts || [];
  const kinds = useMemo(() => [...new Set(concepts.map((c) => c.kind).filter((k) => KINDS[k]))], [concepts]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (c) => [c.he, c.en, KINDS[c.kind], ...(c.match || [])].join(" ").toLowerCase();
  const list = concepts.filter((c) => (!kind || c.kind === kind) && words.every((w) => hay(c).includes(w)));
  const early = list.filter((c) => c.stage === "EMERGING" || c.stage === "RISING");
  const measuring = list.filter((c) => c.stage === "UNVERIFIED");
  const rest = list.filter((c) => !early.includes(c) && !measuring.includes(c));
  const record = board?.record;
  const clock = board?.clock;
  const open = list.filter((c) => c.window === "OPEN");
  const firstResults = concepts.length && concepts.every((c) => c.stage === "UNVERIFIED");
  // The page shows what the radar found on its own (FreshRisers, the verdict); the measured kinds are
  // the radar's own instruments and open only with ?all=1.
  const showAll = typeof location !== "undefined" && /[?&]all=1\b/.test(location.search);

  const callsToday = (board?.early?.ledger || []).filter((e) => e.at === String(board?.at || "").slice(0, 10) && !e.result).length;
  // 🧾 What the latest run really asked and got back (runReceipt.js), for the hero and "how it works".
  const howCountries = searchCountries(board?.receipt);
  const receiptSum = board?.receipt ? receiptTotals(board.receipt) : null;
  const boardIsToday = board?.at ? israelDay(board.at) === israelDay(Date.now()) : false;
  const press = () => {
    setShown(true);
    setTab("today");
    setTimeout(() => (document.getElementById("fresh") || results.current)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <>
      <section className="lx-profile lx-rdr-hero">
        <div className="lx-wrap lx-rdr-grid py-10 md:py-14">
          <RadarScope />
          <div>
            <p className="lx-kicker mb-3"><Radar size={14} aria-hidden="true" /> {L("חינם בתקופת הניסיון", "Free during the trial")}</p>
            <h1 className="lx-profile-name">{L("רדאר הטרנדים", "The trend radar")}</h1>
            <p className="mt-3 max-w-2xl text-[17px] leading-7">{L("מה מתחיל לרוץ באליאקספרס, לפני שכולם מכירים. נמדד כל בוקר, נחתם מראש בביטקוין ומקבל ציון בפומבי.", "What starts to run on AliExpress, before everyone knows it. Measured every morning, sealed in advance in Bitcoin and graded in public.")}</p>
            {board ? (
              <dl className="lx-rdr-facts" aria-label={L("הרדאר עכשיו", "The radar now")}>
                <div><dt>{L(`הקריאה של ${dm(String(board.at).slice(0, 10))}`, `The reading of ${dm(String(board.at).slice(0, 10))}`)}</dt><dd>{callsToday ? L(`${callsToday} קביעות חדשות, חתומות`, `${callsToday} new calls, sealed`) : boardIsToday ? L("עוד שקט היום", "All quiet today") : L("עוד שקט", "All quiet")}</dd></div>
                {receiptSum?.asked ? <div><dt>{L("קבלת הריצה", "The run receipt")}</dt><dd><a className="underline" href="#sources" onClick={(e) => { e.preventDefault(); pick("proof", { scroll: false }); setTimeout(() => document.getElementById("sources")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }}>{L(`${receiptSum.answered.toLocaleString("he-IL")} מתוך ${receiptSum.asked.toLocaleString("he-IL")} ענו`, `${receiptSum.answered.toLocaleString("en-US")} of ${receiptSum.asked.toLocaleString("en-US")} answered`)}</a></dd></div> : null}
                {board.fresh?.tracking ? <div><dt>{L("מוצרים חדשים במעקב יומי", "New products tracked daily")}</dt><dd>{board.fresh.tracking.toLocaleString("en-US")}</dd></div> : null}
                {board.fresh?.risers?.length ? <div><dt>{L("מתחילים לרוץ עכשיו", "Starting to run now")}</dt><dd>{board.fresh.risers.length}</dd></div> : null}
                {board.ledger?.sha256 ? <div><dt>{L("חתום בביטקוין", "Sealed in Bitcoin")}</dt><dd>{board.anchors?.list?.[0] ? L(`בלוק ${board.anchors.list[0].height}`, `block ${board.anchors.list[0].height}`) : dm(board.ledger.d)}</dd></div> : null}
              </dl>
            ) : null}
            <div className="lx-rdr-ctas mt-6">
              <button type="button" onClick={press} className="lx-btn lx-btn-ink" style={{ minHeight: 52, fontSize: 17, padding: "10px 24px" }}>
                <Sparkles size={18} aria-hidden="true" /> {L("לקריאה של היום", "Today's reading")}
              </button>
              <button type="button" onClick={() => pick("plans")} className="lx-btn lx-btn-ghost" style={{ minHeight: 52, fontSize: 17, padding: "10px 24px" }}>{L("מסלולים ומחיר", "Plans & pricing")}</button>
            </div>
            <TrialBanner />
          </div>
        </div>
      </section>

      <RadarTabs tab={tab} onPick={pick} />

      <div role="tabpanel" id="rdr-panel-today" aria-labelledby="rdr-tab-today" hidden={tab !== "today"}>
        {acc?.reason === "trial" ? (
          <div className="lx-wrap mt-6"><p className="rounded-2xl p-3 text-[15px] font-bold" style={{ background: "#ecfdf3", border: "1px solid #abefc6" }}>{L(`🎁 את בניסיון חינם: נשארו לך ${acc.daysLeft} ימים.`, `🎁 You're on a free trial: ${acc.daysLeft} days left.`)} <button type="button" className="underline" onClick={() => pick("plans")}>{L("למסלולים", "See the plans")}</button></p></div>
        ) : null}
        {gated ? <div className="lx-wrap mt-6"><AccessCard acc={acc} /></div> : null}
        {gated && board?.envelopes?.length ? <Envelopes list={board.envelopes} onOpen={() => pick("plans")} /> : null}
        <Verdict board={board} gated={gated} />
        {!gated && board?.fresh ? <FreshRisers fresh={board.fresh} world={board.world} gap={board.worldGap} day={String(board.at || "").slice(0, 10)} /> : null}
        {!gated && board?.factories?.top?.length ? <Factories f={board.factories} /> : null}
        {board?.trade?.partners?.length ? <Trade t={board.trade} /> : null}
        {!gated && board?.shopWords ? <ShopWords s={board.shopWords} /> : null}
        {!gated && board?.supply ? <SupplyList board={board} /> : null}
        {!gated && board?.kinds ? <NewKinds kinds={board.kinds} day={String(board.at || "").slice(0, 10)} /> : null}
        <section ref={results} className="lx-wrap mt-8 md:mt-12" style={{ scrollMarginTop: 80 }} aria-labelledby="radar-results">
          {showAll ? <h2 id="radar-results" className="lx-display text-[26px] md:text-[34px]">{L("כל מה שהרדאר מודד", "Everything the radar measures")}</h2> : null}
          {!gated && board === undefined ? <div className="mt-6"><Spinner /></div> : null}
          {!gated && board === null ? <p className="mt-4">{L("הרדאר מתחיל למדוד. התוצאות הראשונות יופיעו כאן בקרוב.", "The radar is starting to measure. The first results will show here soon.")}</p> : null}
          {!gated && board && showAll ? (
            <>
              <p className="mt-2 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L(`עודכן ${dm(board.at.slice(0, 10))} · ${concepts.length} סוגי מוצרים על הרדאר · מקור: אליאקספרס`, `Updated ${dm(board.at.slice(0, 10))} · ${concepts.length} kinds on the radar · source: AliExpress`)}</p>
              <label className="mt-4 flex items-center gap-2 rounded-full px-4" style={{ border: "2px solid var(--lx-ink, #0d0d0f)", background: "#fff", minHeight: 50 }}>
                <Search size={18} aria-hidden="true" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("חיפוש ברדאר: למשל סקווישי, מטבח, שיער", "Search the radar: e.g. squishy, kitchen, hair")} aria-label={L("חיפוש ברדאר", "Search the radar")} className="w-full bg-transparent text-[16px] outline-none" style={{ minHeight: 46 }} />
              </label>
              {kinds.length > 1 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={L("סינון לפי סוג", "Filter by kind")} style={{ scrollbarWidth: "none" }}>
                  {[["", L("הכול", "All")], ...kinds.map((k) => [k, KINDS[k]])].map(([k, label]) => (
                    <button key={k || "all"} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`lx-btn ${kind === k ? "lx-btn-ink" : "lx-btn-ghost"}`} style={{ minHeight: 38, padding: "4px 14px", fontSize: 14, flex: "0 0 auto", whiteSpace: "nowrap" }}>{label}</button>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-[14px] font-bold" role="status">{list.length ? L(`מוצגים ${list.length} מתוך ${concepts.length} סוגי מוצרים${kind ? ` · ${KINDS[kind]}` : ""}`, `Showing ${list.length} of ${concepts.length}`) : L("נסי מילה אחרת או ״הכול״.", "Nothing like that on the radar. Try another word or All.")}</p>
              {firstResults ? (
                <p className="lx-card mt-4 p-4 text-[14px] leading-6" style={{ boxShadow: "none", border: "1px dashed var(--lx-line)" }}>
                  {L(`הרדאר התחיל למדוד ב־${dm(concepts[0]?.since)}. כדי לראות כיוון צריך שתי מדידות בהפרש של יומיים לפחות, אז התוצאות הראשונות יופיעו בעוד יומיים. בינתיים: אלה סוגי המוצרים שעל הרדאר.`, `The radar started measuring on ${dm(concepts[0]?.since)}. A direction needs two readings at least two days apart, so the first results come in two days. Meanwhile: the kinds on the radar.`)}
                </p>
              ) : null}
              {open.length ? (
                <>
                  <h3 className="mt-6 text-[20px] font-extrabold">{L("✨ חלון פתוח: עולה בעולם, ובעברית עוד שקט", "✨ Open window: rising abroad, not searched in Hebrew yet")}</h3>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L("ההזמנות באליאקספרס מאיצות, ובגוגל בעברית עוד שקט. זה הזמן שבו מי שמגיע ראשונה מגיעה לפני כולם.", "Orders on AliExpress are speeding up and nobody searches it in Hebrew on Google yet. That's when whoever arrives first is ahead of everyone.")}</p>
                  <ul className="mt-3 grid gap-3 md:grid-cols-2">{open.map((c) => <ConceptCard key={c.id} c={c} />)}</ul>
                </>
              ) : null}
              {(shown || early.length) && early.filter((c) => c.window !== "OPEN").length ? (
                <>
                  <h3 className="mt-6 text-[20px] font-extrabold">{L("מתחיל לעלות ובעלייה", "Starting to rise and rising")}</h3>
                  <ul className="mt-3 grid gap-3 md:grid-cols-2">{early.filter((c) => c.window !== "OPEN").map((c) => <ConceptCard key={c.id} c={c} />)}</ul>
                </>
              ) : shown && !firstResults && !open.length ? (
                <p className="mt-6">{L("היום הרדאר במעקב: הטרנד הבא יופיע כאן כשיעבור את הסף.", "Today no kind passes the radar's threshold. That is information too: no clear new trend right now.")}</p>
              ) : null}
              {rest.length ? (
                <details className="mt-8" open={Boolean(q || kind)}>
                  <summary className="cursor-pointer text-[18px] font-extrabold">{L(`📚 כבר מוכרים: יציב, בשיא או דועך (${rest.length})`, `📚 Already known: steady, at peak or cooling (${rest.length})`)}</summary>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L("את אלה השוק כבר מכיר. הרדאר ממשיך למדוד אותם כל יום, כדי לראות אם משהו מהם מתעורר שוב. את הדבר הבא מוצאים למעלה.", "The market already knows these. The radar keeps measuring them daily in case one wakes up again, but this is not where the next thing is.")}</p>
                  <ul className="mt-3 grid gap-3 md:grid-cols-2">{rest.map((c) => <ConceptCard key={c.id} c={c} />)}</ul>
                </details>
              ) : null}
              {(() => {
                const calls = list.filter((c) => c.early?.level === "CALL");
                const watch = list.filter((c) => c.early?.level === "WATCH");
                return (
                  <div className="lx-card mt-5 p-4" style={{ boxShadow: "none", border: "2px solid #0b0b0b" }}>
                    <h3 className="text-[20px] font-extrabold">{L("🎯 התראות מוקדמות", "🎯 Early calls")}</h3>
                    <p className="mt-1 text-[13px] leading-5" style={{ color: "var(--lx-muted)" }}>{L("הרדאר קורא טרנד רק כשכמה סימנים עצמאיים מסכימים: חיפושים שמתפשטים בעולם (ההשלמות של גוגל ויוטיוב במדינות שהרדאר מודד והחיפושים החמים של גוגל; מה ענה בכל ריצה מופיע בקבלת הריצה), קונים יותר מהר באליאקספרס, מוכרים חדשים שנכנסים, ובעברית עוד שקט, והסימנים חייבים להחזיק שתי מדידות ברצף (רק מה שמחזיק נחשב). פחות קריאות, יותר פגיעות. כל קריאה נבדקת אחרי 14 יום, בפומבי.", "The radar calls a trend only when independent signals agree: searches spreading worldwide (Google's and YouTube's suggestions in the countries the radar measures and Google's trending searches; what answered in each run is in the run receipt), faster AliExpress orders, new sellers rushing in, and no Hebrew searches yet. Fewer calls, more hits. Every call is graded after 14 days, in public.")}</p>
                    {calls.length ? <ul className="mt-3 grid gap-3 md:grid-cols-2">{calls.map((c) => <ConceptCard key={c.id} c={c} />)}</ul> : <p className="mt-3 text-[14px] font-bold">{L("היום הרדאר במעקב: מוצר יופיע כאן ברגע ש־3 סימנים יסכימו עליו.", "No product passed the three-signal bar today. The radar doesn't guess; it waits for the signals.")}</p>}
                    {board.early ? (
                      <p className="mt-3 text-[13px] leading-5" style={{ color: "var(--lx-muted)" }}>
                        {board.early.record.graded
                          ? L(`הדיוק של ההתראות המוקדמות: ${board.early.record.hits} פגיעות מתוך ${board.early.record.graded} שנבדקו (${board.early.record.accuracy}%).`, `Early-call accuracy: ${board.early.record.hits} hits of ${board.early.record.graded} graded (${board.early.record.accuracy}%).`)
                          : L(`התראות שמחכות לבדיקה: ${board.early.record.pending}. כל התראה נבדקת אחרי 14 יום, והתוצאה נכתבת כאן.`, `Calls awaiting their grade: ${board.early.record.pending}. Each is graded after 14 days, here.`)}
                        {board.early.lead ? <><br />{FINISH_LINES_ORDER.map((k) => { const l = board.early.lead[k]; return l?.ahead ? L(`🚀 לפני ${FINISH_HE[k]}: ${l.ahead} התראות, בחציון ${l.medianDays} ימים קודם. `, `🚀 Ahead of ${k}: ${l.ahead} calls, median ${l.medianDays} days. `) : ""; }).join("") || L("🚀 הרדאר קובע קודם. אחר כך נרשם היום שבו כל אחד מ־5 קווי הסיום מגיע: הבאז ברשתות, החיפושים בעברית בארץ, החיפושים החמים של גוגל, החיפוש בהרבה מדינות, והיום שבו המוכרים מתחילים לפרסם (ספריית הפרסומות של מטא, המקור שכלי ריגול הפרסומות קוראים). ככה רואים בכמה ימים הרדאר הקדים את כולם.", "🚀 The radar calls first. Then the day each of the 5 finish lines arrives is recorded: the networks' buzz, Hebrew searches in Israel, Google's trending searches, many countries, and the day sellers start advertising (Meta's Ad Library, the source ad-spy tools read). That shows by how many days the radar was ahead of everyone.")}</> : null}
                        {board.early.need === 5 ? L(" הדיוק ירד מתחת ל־80%, אז הרדאר מחמיר עוד: כל 4 הסימנים צריכים להופיע יומיים ברצף.", " Accuracy fell under 80%, so the bar rises: all four signals two readings in a row.") : L(" מצב צלף: הרדאר קובע רק כשכל 4 הסימנים מסכימים, ו־3 מהם הופיעו כבר בבדיקה הקודמת. פחות קביעות, כל אחת חזקה יותר.", " Sniper mode: a call only when all four signals agree and three already showed in the previous reading. Fewer calls, each stronger.")}
                        {board.early.seal ? <><br />{L(`🔏 חותמת ${dm(board.early.seal.d)}: ${board.early.seal.sha256.slice(0, 16)}… (טביעת אצבע של כל ${board.early.seal.count} ההתראות שנקראו, כדי שכל אחד יוכל לבדוק אחר כך שהן נקראו מראש)`, `🔏 Seal ${dm(board.early.seal.d)}: ${board.early.seal.sha256.slice(0, 16)}… (a fingerprint of all ${board.early.seal.count} calls, so anyone can check later they were made in advance)`)}{board.early.seal.ots?.length ? <><br />{L("⛓️ החותמת נשלחה ל־OpenTimestamps ונרשמת בבלוקצ'יין של ביטקוין, כך שהתאריך קבוע לתמיד, גם עבורנו. לבדיקה: מורידים את שני הקבצים וגוררים אותם ל־opentimestamps.org.", "⛓️ The seal was sent to OpenTimestamps and is being written into Bitcoin, so no one, not even us, can backdate it. To check: download both files and drop them on opentimestamps.org.")}{" "}
                          {board.early.seal.text ? <a className="underline" download={`radar-seal-${board.early.seal.d}.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(board.early.seal.text)}`}>{L("ההתראות החתומות", "the sealed calls")}</a> : null}
                          {board.early.seal.ots.map((o) => <span key={o.cal}> · <a className="underline" download={`radar-seal-${board.early.seal.d}.txt.ots`} href={`data:application/octet-stream;base64,${o.b64}`}>{L(`הוכחה (${o.cal.split(".")[0]})`, `proof (${o.cal.split(".")[0]})`)}</a></span>)}</> : null}</> : null}
                      </p>
                    ) : null}
                    {watch.length ? <p className="mt-3 text-[13px]">{L(`👀 במעקב (2 סימנים): ${watch.map((c) => c.he).join(" · ")}`, `👀 Watching (2 signals): ${watch.map((c) => c.he).join(" · ")}`)}</p> : null}
                  </div>
                );
              })()}
              {measuring.length ? <MarketMap list={measuring} openId={hashId} /> : null}
              <SiteHot site={board.site} />
              <p className="mt-6 text-[12px] leading-5" style={{ color: "var(--lx-muted)" }}>
                {L("#פרסומת · קישורי שותפים: הכפתורים לחנות הם קישורים של LikeLink2, ואם קונים דרכם נקבל עמלה קטנה מהחנות. המחיר שלך נשאר אותו מחיר. המספרים הם של אליאקספרס (הזמנות ב־30 הימים האחרונים ומספר המודעות), נמדדים פעם ביום. ״בישראל״ נמדד בהשלמה האוטומטית הציבורית של גוגל ושל יוטיוב בישראל בעברית (ובגוגל בארה״ב באנגלית), בטרנדים היומיים של Google Trends לישראל ובכניסות של מבקרי LikeLink2 לחנות: זה סימן לחיפושים. ״בעברית עוד שקט״ נקבע רק כששני מקורות החיפוש מסכימים, ובחנויות בארץ ייתכן שכבר יש. הרדאר מראה סימנים מדודים, וההחלטה מה לקנות ומה למכור היא שלכם.", "#ad · affiliate links: the store buttons are LikeLink2's links; if you buy through them we get a small commission from the store. Your price doesn't change. The numbers are AliExpress's (orders in the last 30 days and the number of listings), measured once a day. “In Israel” is measured with Google's and YouTube's public autocomplete in Israel in Hebrew (and Google in the US in English), Google Trends' daily Israel feed and LikeLink2 visitors' exits to the store: a sign of searches, not a count. “Not here yet” needs both search sources to agree. The radar shows measured signs; what to buy or sell is your call.")}
              </p>
            </>
          ) : null}
        </section>
      </div>

      <div role="tabpanel" id="rdr-panel-proof" aria-labelledby="rdr-tab-proof" hidden={tab !== "proof"}>
        {board ? <RecordTable board={board} /> : null}
        {board?.news?.all?.calls ? <NewsRace news={board.news} /> : null}
        {board ? <CapabilityMap board={board} /> : null}
        {board?.sourcesToday ? <SourcesToday sources={board.sourcesToday} receipt={board.receipt || null} scan={board.scan || null} health={board.sourceHealth || null} /> : null}
        {board?.promise ? <ProvenRange promise={board.promise} /> : null}
        {board?.window ? <WindowClock win={board.window} /> : null}
        <Proof record={board?.record} hasLedger={Boolean(board?.ledger?.sha256)} />
        {board?.ledger ? <Ledger ledger={board.ledger} freshBook={gated ? null : board.fresh?.seal} stagesBook={gated ? null : board.stagesSeal} kindsBook={gated ? null : board.kinds?.seal} brainBook={gated ? null : board.brain?.seal} promiseBook={gated ? null : board.promise?.seal} windowBook={gated ? null : board.window?.seal} anchors={board.anchors} /> : null}
        {board?.luck ? <Luck luck={board.luck} concepts={board.concepts || []} /> : null}
        {board?.baseline ? <Baseline baseline={board.baseline} /> : null}
        {!gated && board?.brain ? <Brain brain={board.brain} /> : null}
        {board?.challenge ? <Challenge ch={board.challenge} /> : null}
      </div>

      <div role="tabpanel" id="rdr-panel-tools" aria-labelledby="rdr-tab-tools" hidden={tab !== "tools"}>
        {!gated && board?.concepts?.length ? <Styles concepts={board.concepts} /> : null}
        {!gated && board?.waves ? <Waves waves={board.waves} /> : null}
        {!gated && board?.crowd ? <Crowd crowd={board.crowd} /> : null}
        {!gated && board?.globe ? <Globe globe={board.globe} /> : null}
        <section className="lx-wrap mt-6" id="how">
          <details className="lx-card p-4" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
            <summary className="cursor-pointer text-[16px] font-extrabold">{L("❓ איך הרדאר עובד? (4 צעדים, דקה קריאה)", "❓ How does the radar work? (4 steps, one minute)")}</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              [L("1. מודדים כל יום, בכל העולם", "1. Measured daily, worldwide"), L(`${howCountries.length ? `בריצה האחרונה גוגל ענה מ־${howCountries.length} מדינות` : "ההשלמות של גוגל ויוטיוב במדינות שהרדאר מודד"}, וגם החיפושים החמים של גוגל. מה שמתחיל לעלות שם, הרדאר מוצא באליאקספרס: ההזמנות של 20 הפריטים המובילים, מספר המודעות והמחיר. מה ענה בכל ריצה: בקבלת הריצה.`, `${howCountries.length ? `In the latest run Google answered from ${howCountries.length} countries` : "Google's and YouTube's suggestions in the countries the radar measures"}, and Google's trending searches; what starts rising there is found on AliExpress: the top 20 items' orders, the listings and the price. What answered in each run: the run receipt.`)],
              [L("2. מהירות לפני גודל", "2. Speed, not size"), L("להיט מתחיל כשההזמנות מאיצות ברוב הפריטים, ומוכרים חדשים ממהרים להציע את אותו מוצר. צריך שרוב הפריטים יאיצו יחד.", "A hit starts when orders speed up across most items and new sellers rush to list it. One viral item is not enough.")],
              [L("3. פער ישראל", "3. The Israel gap"), L("כל יום בודקים בגוגל אם ישראלים כבר מחפשים את זה בעברית. עולה בעולם ובארץ עוד שקט? זה חלון פתוח.", "Every day we check on Google whether Israelis already search for it in Hebrew. Rising abroad and not searched here yet? That's an open window.")],
              [L("4. הרדאר בודק את עצמו", "4. The radar grades itself"), L("כל סימון נשמר עם תאריך, ואחרי 14 יום בודקים אם באמת עלה. הדיוק מוצג כאן לכולם.", "Every call is saved with its date; 14 days later we check whether it really rose. The accuracy is shown here to everyone.")],
            ].map(([t, d]) => (
              <div key={t} className="lx-card p-4" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
                <p className="font-extrabold">{t}</p>
                <p className="mt-1 text-[14px] leading-6">{d}</p>
              </div>
            ))}
          </div>

          <div className="lx-card mt-3 flex items-start gap-3 p-4" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
            <ShieldCheck size={22} aria-hidden="true" style={{ flex: "0 0 22px", color: "#16a34a" }} />
            <div className="text-[14px] leading-6">
              <p className="font-extrabold">{L("הדיוק של הרדאר, בפומבי", "The radar's accuracy, in public")}</p>
              {record?.graded ? (
                <p>{L(`מתוך ${record.graded} סימונים שנבדקו אחרי 14 יום, ${record.hits} באמת עלו ב־${board.rules.hitPct}% או יותר (${record.accuracy}%).`, `Of ${record.graded} calls checked after 14 days, ${record.hits} really rose by ${board.rules.hitPct}% or more (${record.accuracy}%).`)}</p>
              ) : (
                <p>{record?.pending ? L(`${record.pending} סימונים מחכים לבדיקה. הבדיקה הראשונה: ${dm(record.nextDue)}.`, `${record.pending} calls are waiting. The first check: ${dm(record.nextDue)}.`) : L("כשהרדאר יסמן טרנד ראשון, הוא ייבדק אחרי 14 יום והתוצאה תופיע כאן.", "No calls to check yet. When the radar flags its first trend, it is checked 14 days later and the result shows here.")}</p>
              )}
            </div>
          </div>

          <div className="lx-card mt-3 flex items-start gap-3 p-4" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
            <Clock size={22} aria-hidden="true" style={{ flex: "0 0 22px", color: "#2563eb" }} />
            <div className="text-[14px] leading-6">
              <p className="font-extrabold">{L("שעון ההגעה לישראל", "The Israel arrival clock")}</p>
              {clock?.typicalDays !== null && clock?.typicalDays !== undefined ? (
                <p>{L(`עד היום נצפו ${clock.observed} הגעות: בדרך כלל עוברים ${clock.typicalDays} ימים מהסימון של הרדאר ועד שמתחילים לחפש את זה בעברית.`, `${clock.observed} arrivals observed so far: typically ${clock.typicalDays} days pass between the radar's call and the first Hebrew searches.`)}</p>
              ) : (
                <p>{L(`הרדאר מודד כמה ימים עוברים מהרגע שטרנד מתחיל לעלות באליאקספרס ועד שמתחילים לחפש אותו בגוגל בעברית. ${clock?.observed ? `עד היום נצפו ${clock.observed} הגעות;` : "עוד לא נצפתה הגעה;"} המספר יוצג מ־3 הגעות.`, `The radar measures how many days pass from a trend starting to rise on AliExpress to the first Hebrew searches on Google. ${clock?.observed ? `${clock.observed} arrivals observed so far;` : "No arrival observed yet;"} the number shows from 3 arrivals.`)}</p>
              )}
            </div>
          </div>
          </details>
        </section>
      </div>

      <div role="tabpanel" id="rdr-panel-plans" aria-labelledby="rdr-tab-plans" hidden={tab !== "plans"}>
        {plansSeen ? <Suspense fallback={<div className="lx-wrap mt-8"><Spinner /></div>}><RadarTiers withAccount /></Suspense> : null}
      </div>

      <section className="lx-wrap mt-10 mb-12 grid gap-3 md:grid-cols-2">
        <div className="lx-card p-5" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
          <p className="font-extrabold">{L("יוצרת או מוכרת?", "A creator or a seller?")}</p>
          <p className="mt-1 text-[14px] leading-6">{L("תפתחי סטודיו בחינם ותפרסמי טרנד בחנות שלך לפני כולם.", "Open a free studio and post a trend in your shop before everyone else.")}</p>
          <Go to="/join" className="lx-btn lx-btn-ink mt-3" style={{ minHeight: 44 }}>{L("פתיחת סטודיו בחינם", "Open a free studio")}</Go>
        </div>
        <div className="lx-card p-5" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
          <p className="font-extrabold">{L("כל יום מציאות חדשות", "New deals every day")}</p>
          <p className="mt-1 text-[14px] leading-6">{L("מצאת משהו באלי? תבדקי אותו בכפתור הקסם לפני שקונים.", "Found something on AliExpress? Check it with the magic button before you buy.")}</p>
          <div className="mt-3 grid gap-2">
            <Go to="/magic" className="lx-btn lx-btn-ghost" style={{ minHeight: 44 }}>{L("✨ לכפתור הקסם", "✨ The magic button")}</Go>
            <TelegramJoin />
          </div>
        </div>
      </section>
    </>
  );
}
