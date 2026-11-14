// /radar — the trend radar (src/lib/growth/trendRadar.js): what is starting to rise abroad, read
// every day from AliExpress's own numbers, each with its evidence, and the radar's public record of
// its own calls, plus the Israel gap (src/lib/growth/israelGap.js: is it already searched in
// Hebrew here?) and the opportunity window. The board comes from .github/workflows/trend-radar.yml
// (board.json next to the site) and passes radarBoard.js sanitizeBoard before anything renders.
// Free during the trial. The store buttons are LikeLink2's tracked links, with the
// disclosure above them; an exit is one click event (med "radar") in the owner's numbers.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock, ExternalLink, Radar, ShieldCheck, Sparkles } from "lucide-react";
import { BASE } from "../../lib/basePath.js";
import { BOT_UA } from "../../lib/funnel.js";
import { landingAttribution } from "../../lib/attribution.js";
import { storage } from "../../lib/storage.js";
import { sanitizeBoard } from "../../lib/growth/radarBoard.js";
import { accessOf } from "../../lib/growth/radarPlans.js";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Go, Img, Spinner, TelegramJoin, useL } from "./kit";

export const RADAR_BOARD_HOME = "https://hen63165-dotcom.github.io/likelink/radar/board.json";

const KINDS = {
  kids: "ילדים", kitchen: "מטבח", home: "בית", hair: "שיער", makeup: "איפור וטיפוח", bracelets: "צמידים", rings: "טבעות",
  earrings: "עגילים", necklaces: "שרשראות", bags: "תיקים", gadgets: "גאדג׳טים", car: "לרכב", pets: "חיות מחמד",
  fitness: "כושר", clothing: "בגדים", watches: "שעונים",
};

const STAGE_STYLE = {
  EMERGING: { bg: "#dcfce7", fg: "#166534", dot: "#16a34a" },
  RISING: { bg: "#dbeafe", fg: "#1e40af", dot: "#2563eb" },
  STEADY: { bg: "#f3f4f6", fg: "#374151", dot: "#9ca3af" },
  PEAK: { bg: "#ffedd5", fg: "#9a3412", dot: "#ea580c" },
  COOLING: { bg: "#f3f4f6", fg: "#6b7280", dot: "#9ca3af" },
  UNVERIFIED: { bg: "#ffffff", fg: "#6b7280", dot: "#d1d5db" },
};

const dm = (d) => (typeof d === "string" && d.length >= 10 ? `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}` : "");
/** The first day a direction can be measured: two days after the first reading. */
const nextDay = (d) => { const t = Date.parse(`${d}T00:00:00Z`); return Number.isFinite(t) ? new Date(t + 2 * 86_400_000).toISOString().slice(0, 10) : ""; };

const automated = () => {
  try { return navigator.webdriver === true || BOT_UA.test(String(navigator.userAgent || "")); } catch { return false; }
};

/** The exit to the store, as one click event (append-only; never blocks the buyer). */
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
export async function loadBoard() {
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

/** The Israel gap line under a concept: is it already searched in Hebrew here? */
function IsraelLine({ gap }) {
  const { L } = useL();
  const st = GAP_STYLE[gap?.state] || GAP_STYLE.UNKNOWN;
  if (!gap || gap.state === "UNKNOWN") return null;
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: st.bg, color: st.fg }}>
      <p className="text-[14px] font-extrabold">{st.icon} {L("בישראל:", "In Israel:")} {gap.he}{gap.confidenceHe ? <span className="text-[12px] font-bold" style={{ opacity: 0.8 }}> · {gap.confidenceHe}</span> : null}</p>
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
        <p className="text-[16px] font-extrabold">{L("מדד אלפא", "Alpha")}: {a.score !== null ? <>{a.score}<span className="text-[12px] font-bold">/100</span></> : <span className="text-[13px]">{L("אין ציון עדיין (חסר מומנטום עולמי נמדד)", "no score yet (no measured global momentum)")}</span>}</p>
        <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: a.verified ? "#dcfce7" : "#fef0c7", color: a.verified ? "#166534" : "#93370d" }}>{a.verified ? L("הזדמנות מאומתת", "Verified") : L("לא מאומת עדיין", "Not verified yet")} · {a.confidenceHe}</span>
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
      <IsraelLine gap={c.gap} />
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
        <p className="mt-3 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L("עוד אין פריט שעובר את הכללים שלנו (95% שביעות רצון, 300 הזמנות, בלי חיקויים).", "No item passes our rules yet (95% satisfaction, 300 orders, no imitations).")}</p>
      ) : null}
      {c.opportunity ? (
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer font-bold">{L(`בדיקת הזדמנות: ${c.opportunity.passed} מתוך ${c.opportunity.measured} בדיקות שנמדדו עברו`, `Opportunity check: ${c.opportunity.passed} of ${c.opportunity.measured} measured checks passed`)}</summary>
          <ul className="mt-2 grid gap-1">
            {c.opportunity.checks.map((x) => <li key={x.id}>{x.ok === true ? "✅" : x.ok === false ? "❌" : "⏳"} {x.he}{x.ok === null ? L(" (עוד לא נמדד)", " (not measured yet)") : ""}</li>)}
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
  const groups = ["SMALL", "MID", "BIG"].map((k) => [k, list.filter((c) => c.size === k).sort((a, b) => (a.today?.orders || 0) - (b.today?.orders || 0))]).filter(([, l]) => l.length);
  return (
    <>
      <h3 className="mt-8 text-[18px] font-extrabold">{L("מפת השוק של היום", "Today's market map")}</h3>
      <p className="mt-1 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L("גודל זה לא כיוון: הוא אומר כמה גדול השוק היום. הכיוון (עולה או יורד) יופיע אחרי המדידה הבאה. לחיצה על שורה פותחת את כל הבדיקה: בישראל, הפריט לקנייה, בדיקת ההזדמנות וההמלצה.", "Size is not direction: it says how big the market is today. The direction (up or down) shows after the next reading. Tap a row for the full check.")}</p>
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
                      {c.gap?.state && c.gap.state !== "UNKNOWN" ? <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: (GAP_STYLE[c.gap.state] || GAP_STYLE.UNKNOWN).bg, color: (GAP_STYLE[c.gap.state] || GAP_STYLE.UNKNOWN).fg }}>{L("בישראל:", "Israel:")} {c.gap.he}</span> : null}
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
      ) : <p className="mt-3 text-[14px]">{L("השבוע אין באתר מוצר שההזמנות שלו מאיצות. זה מידע אמיתי, לא תקלה.", "No product on the site is accelerating this week. That is real information, not a fault.")}</p>}
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
        ? L(`תקופת ניסיון חינם: עוד ${a.daysLeft} ימים (עד ${dm(a.endsAt.slice(0, 10))}). המחירים של Basic ו־Pro עוד לא נקבעו.`, `Free trial: ${a.daysLeft} days left (until ${dm(a.endsAt.slice(0, 10))}). Basic and Pro prices are not set yet.`)
        : L("תקופת הניסיון הסתיימה. הרדאר נשאר פתוח עד שייקבעו המסלולים; אפשר להצטרף לרשימת ההמתנה.", "The trial has ended. The radar stays open until the tiers are set; you can join the waitlist.")}{" "}
      <Go to="/radar-pro" className="font-bold underline">{L("למסלולים", "See the tiers")}</Go>
    </p>
  );
}

export function RadarPage() {
  const { L } = useL();
  const [board, setBoard] = useState(undefined);
  const [kind, setKind] = useState("");
  const [shown, setShown] = useState(false);
  const [hashId, setHashId] = useState("");
  const results = useRef(null);

  useEffect(() => {
    let live = true;
    loadBoard().then((b) => {
      if (!live) return;
      setBoard(b);
      // A link from the magic button (/radar#<concept>) opens on that concept.
      const id = typeof location !== "undefined" ? decodeURIComponent(location.hash.slice(1)) : "";
      if (b && /^[a-z0-9-]{2,42}$/.test(id) && b.concepts.some((c) => c.id === id)) {
        setShown(true);
        setHashId(id);
        setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    });
    return () => { live = false; };
  }, []);

  const concepts = board?.concepts || [];
  const kinds = useMemo(() => [...new Set(concepts.map((c) => c.kind).filter((k) => KINDS[k]))], [concepts]);
  const list = concepts.filter((c) => !kind || c.kind === kind);
  const early = list.filter((c) => c.stage === "EMERGING" || c.stage === "RISING");
  const measuring = list.filter((c) => c.stage === "UNVERIFIED");
  const rest = list.filter((c) => !early.includes(c) && !measuring.includes(c));
  const record = board?.record;
  const clock = board?.clock;
  const open = list.filter((c) => c.window === "OPEN");
  const firstResults = concepts.length && concepts.every((c) => c.stage === "UNVERIFIED");

  const press = () => {
    setShown(true);
    setTimeout(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <>
      <section className="lx-profile">
        <div className="lx-wrap py-10 md:py-16">
          <p className="lx-kicker mb-3"><Radar size={14} aria-hidden="true" /> {L("חדש ב־LikeLink2 · חינם בתקופת הניסיון", "New on LikeLink2 · free during the trial")}</p>
          <h1 className="lx-profile-name">{L("רדאר הטרנדים ✨", "The trend radar ✨")}</h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-7">
            {L("מה מתחיל לעלות בעולם, לפני שזה מגיע לארץ. כל יום אנחנו מודדים באליאקספרס כמה מהר קונים מזמינים וכמה מוכרים חדשים נכנסים, ומראים לך את המספרים.", "What is starting to rise abroad, before it reaches Israel. Every day we measure on AliExpress how fast buyers order and how many new sellers rush in, and show you the numbers.")}
          </p>
          <button type="button" onClick={press} className="lx-btn lx-btn-ink mt-6" style={{ minHeight: 56, fontSize: 18, padding: "10px 28px" }}>
            <Sparkles size={18} aria-hidden="true" /> {L("מה הולך להיות להיט?", "What's about to be a hit?")}
          </button>
          <p className="mt-2 text-[12px]" style={{ color: "var(--lx-muted)" }}>{L("הרדאר לא מבטיח להיט. הוא מראה סימנים מוקדמים, עם המספרים והתאריכים.", "The radar never promises a hit. It shows early signs, with the numbers and dates.")}</p>
          <TrialBanner />
        </div>
      </section>

      <section className="lx-wrap mt-8">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            [L("1. מודדים כל יום", "1. Measured daily"), L("כ־60 סוגי מוצרים באליאקספרס: ההזמנות של 20 הפריטים המובילים, מספר המודעות והמחיר.", "About 60 kinds of products on AliExpress: the top 20 items' orders, the number of listings and the price.")],
            [L("2. מהירות, לא גודל", "2. Speed, not size"), L("להיט מתחיל כשההזמנות מאיצות ברוב הפריטים, ומוכרים חדשים ממהרים להציע את אותו מוצר. פריט ויראלי אחד לא מספיק.", "A hit starts when orders speed up across most items and new sellers rush to list it. One viral item is not enough.")],
            [L("3. פער ישראל", "3. The Israel gap"), L("כל יום בודקים בגוגל אם ישראלים כבר מחפשים את זה בעברית. עולה בעולם ועוד לא מחפשים כאן? זה חלון פתוח.", "Every day we check on Google whether Israelis already search for it in Hebrew. Rising abroad and not searched here yet? That's an open window.")],
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
              <p>{record?.pending ? L(`${record.pending} סימונים מחכים לבדיקה. הבדיקה הראשונה: ${dm(record.nextDue)}.`, `${record.pending} calls are waiting. The first check: ${dm(record.nextDue)}.`) : L("עוד אין סימונים לבדוק. כשהרדאר יסמן טרנד ראשון, הוא ייבדק אחרי 14 יום והתוצאה תופיע כאן.", "No calls to check yet. When the radar flags its first trend, it is checked 14 days later and the result shows here.")}</p>
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
      </section>

      <section ref={results} className="lx-wrap mt-8 md:mt-12" style={{ scrollMarginTop: 80 }} aria-labelledby="radar-results">
        <h2 id="radar-results" className="lx-display text-[26px] md:text-[34px]">{L("מה הרדאר רואה עכשיו", "What the radar sees now")}</h2>
        {board === undefined ? <div className="mt-6"><Spinner /></div> : null}
        {board === null ? <p className="mt-4">{L("הרדאר מתחיל למדוד. התוצאות הראשונות יופיעו כאן בקרוב.", "The radar is starting to measure. The first results will show here soon.")}</p> : null}
        {board ? (
          <>
            <p className="mt-2 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L(`עודכן ${dm(board.at.slice(0, 10))} · ${concepts.length} סוגי מוצרים על הרדאר · מקור: אליאקספרס`, `Updated ${dm(board.at.slice(0, 10))} · ${concepts.length} kinds on the radar · source: AliExpress`)}</p>
            {kinds.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={L("סינון לפי סוג", "Filter by kind")}>
                {[["", L("הכול", "All")], ...kinds.map((k) => [k, KINDS[k]])].map(([k, label]) => (
                  <button key={k || "all"} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`lx-btn ${kind === k ? "lx-btn-ink" : "lx-btn-ghost"}`} style={{ minHeight: 38, padding: "4px 14px", fontSize: 14 }}>{label}</button>
                ))}
              </div>
            ) : null}
            {firstResults ? (
              <p className="lx-card mt-4 p-4 text-[14px] leading-6" style={{ boxShadow: "none", border: "1px dashed var(--lx-line)" }}>
                {L(`הרדאר התחיל למדוד ב־${dm(concepts[0]?.since)}. כדי לראות כיוון צריך שתי מדידות בהפרש של יומיים לפחות, אז התוצאות הראשונות יופיעו בעוד יומיים. בינתיים: אלה סוגי המוצרים שעל הרדאר.`, `The radar started measuring on ${dm(concepts[0]?.since)}. A direction needs two readings at least two days apart, so the first results come in two days. Meanwhile: the kinds on the radar.`)}
              </p>
            ) : null}
            {open.length ? (
              <>
                <h3 className="mt-6 text-[20px] font-extrabold">{L("✨ חלון פתוח: עולה בעולם, עוד לא בארץ", "✨ Open window: rising abroad, not here yet")}</h3>
                <p className="mt-1 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L("ההזמנות באליאקספרס מאיצות, ובגוגל בעברית עוד אין חיפושים. זה הזמן שבו מי שמגיע ראשונה מגיעה לפני כולם.", "Orders on AliExpress are speeding up and nobody searches it in Hebrew on Google yet. That's when whoever arrives first is ahead of everyone.")}</p>
                <ul className="mt-3 grid gap-3 md:grid-cols-2">{open.map((c) => <ConceptCard key={c.id} c={c} />)}</ul>
              </>
            ) : null}
            {(shown || early.length) && early.filter((c) => c.window !== "OPEN").length ? (
              <>
                <h3 className="mt-6 text-[20px] font-extrabold">{L("מתחיל לעלות ובעלייה", "Starting to rise and rising")}</h3>
                <ul className="mt-3 grid gap-3 md:grid-cols-2">{early.filter((c) => c.window !== "OPEN").map((c) => <ConceptCard key={c.id} c={c} />)}</ul>
              </>
            ) : shown && !firstResults && !open.length ? (
              <p className="mt-6">{L("היום אין סוג מוצר שעובר את הסף של הרדאר. זה גם מידע: אין כרגע טרנד חדש ברור.", "Today no kind passes the radar's threshold. That is information too: no clear new trend right now.")}</p>
            ) : null}
            {rest.length ? (
              <>
                <h3 className="mt-8 text-[18px] font-extrabold">{L("יציב, בשיא או דועך", "Steady, at peak or cooling")}</h3>
                <ul className="mt-3 grid gap-3 md:grid-cols-2">{rest.map((c) => <ConceptCard key={c.id} c={c} />)}</ul>
              </>
            ) : null}
            <SiteHot site={board.site} />
            {measuring.length ? <MarketMap list={measuring} openId={hashId} /> : null}
            <p className="mt-6 text-[12px] leading-5" style={{ color: "var(--lx-muted)" }}>
              {L("#פרסומת · קישורי שותפים: הכפתורים לחנות הם קישורים של LikeLink2, ואם קונים דרכם נקבל עמלה קטנה מהחנות. המחיר שלך לא משתנה. המספרים הם של אליאקספרס (הזמנות ב־30 הימים האחרונים ומספר המודעות), נמדדים פעם ביום. ״בישראל״ נמדד בהשלמה האוטומטית הציבורית של גוגל ושל יוטיוב בישראל בעברית (ובגוגל בארה״ב באנגלית), בטרנדים היומיים של Google Trends לישראל ובכניסות של מבקרי LikeLink2 לחנות: זה סימן לחיפושים, לא מספר חיפושים. ״עוד לא בארץ״ נקבע רק כששני מקורות החיפוש מסכימים. הרדאר מראה סימנים ולא מבטיח מכירות.", "#ad · affiliate links: the store buttons are LikeLink2's links; if you buy through them we get a small commission from the store. Your price doesn't change. The numbers are AliExpress's (orders in the last 30 days and the number of listings), measured once a day. “In Israel” is measured with Google's and YouTube's public autocomplete in Israel in Hebrew (and Google in the US in English), Google Trends' daily Israel feed and LikeLink2 visitors' exits to the store: a sign of searches, not a count. “Not here yet” needs both search sources to agree. The radar shows signs and never promises sales.")}
            </p>
          </>
        ) : null}
      </section>

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
