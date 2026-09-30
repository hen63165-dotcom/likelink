// Luna Discovery Center — the owner-facing face of Luna's operating system
// (/api/store?mode=discovery).
//
// A creator states a goal in her own words ("לונה, תכיני את המוצר לגוגל") or
// picks a named command; the server compiles it into an intent, resolves the
// gap against the real catalog into an action graph, executes only SAFE
// internal steps (each verified by read-back), and returns what needs the
// owner, what is blocked and why — with proof. Every value on screen comes
// from the server answer; nothing here is simulated.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Compass, Sparkles, Search, Rocket, Megaphone, Share2, Copy, CheckCircle2, ShieldAlert,
  Lock, Loader2, ExternalLink, ArrowUpRight, Link2, Send, Activity, History, RotateCcw, Lightbulb,
} from "lucide-react";
import { useMarketplace } from "../../context/MarketplaceContext";
import { getSessionToken } from "../../lib/auth.js";
import { toHebrewError } from "../../lib/errorMessages.js";
import { CHANNEL_STATE_LABEL, heCount } from "../../lib/discovery/engine.js";
import { MEDIA_TRUTH_LABEL } from "../../lib/discovery/mediaTruth.js";
import { COLOR_LABEL } from "../../lib/discovery/systemCheck.js";
import { EXPERIMENT_LABEL } from "../../lib/discovery/experiments.js";
import { Button, LabeledSelect } from "../ui/index.jsx";

const API = "/api/store?mode=discovery";
const WARN = "var(--warning, #f59e0b)";

const COMMANDS = [
  { id: "increase_exposure", he: "לונה, תגדילי את החשיפה", icon: Sparkles },
  { id: "promote_product", he: "לונה, קדמי את המוצר הזה", icon: Rocket, needsProduct: true },
  { id: "organic_discovery", he: "לונה, הגדילי גילוי אורגני", icon: Search },
  { id: "find_opportunities", he: "לונה, מצאי לי הזדמנויות", icon: Compass },
  { id: "prepare_distribution", he: "לונה, הכיני את המוצר להפצה", icon: Share2 },
  { id: "prepare_campaign", he: "לונה, הכיני קמפיין", icon: Megaphone },
];

const RESULT_LABEL = {
  executed: { he: "בוצע ואומת", color: "var(--success)" },
  up_to_date: { he: "כבר מעודכן", color: "var(--success)" },
  blocked: { he: "נדרש עדכון נתונים", color: WARN },
  failed: { he: "נכשל", color: "var(--danger)" },
};

// Action-graph node states (intent.js buildActionGraph).
const NODE_LABEL = {
  done: { he: "כבר מתקיים", color: "var(--success)" },
  safe: { he: "לונה מבצעת", color: "var(--accent)" },
  owner: { he: "פעולה שלך", color: WARN },
  approval: { he: "דורש אישור מפורש", color: WARN },
  client: { he: "את משתפת", color: "var(--text-secondary)" },
  entitlement: { he: "מעבר למסלול שלך", color: "var(--text-faint)" },
  blocked: { he: "חסום", color: "var(--danger)" },
};

const SYSTEM_COLOR = {
  GREEN: "var(--success)", YELLOW: WARN, RED: "var(--danger)", UNVERIFIED: "var(--text-faint)",
};

const PLAN_LABEL = { free: "חינמי", starter: "Starter", professional: "Professional", enterprise: "Enterprise" };

const SURFACE_LABEL = {
  live: { he: "פעיל", color: "var(--success)" },
  ready: { he: "מוכן", color: "var(--success)" },
  missing: { he: "חסר", color: WARN },
  stale: { he: "לא מעודכן", color: WARN },
  blocked: { he: "חסום", color: "var(--danger)" },
  not_applicable: { he: "לא רלוונטי", color: "var(--text-faint)" },
};

const CHANNEL_COLOR = {
  CONNECTED: "var(--success)", READY: "var(--success)", PUBLISHED: "var(--success)",
  REQUIRES_CONFIGURATION: WARN, REQUIRES_AUTH: WARN,
  NOT_CONNECTED: "var(--text-faint)", FAILED: "var(--danger)", RATE_LIMITED: WARN, PUBLISHING: "var(--accent)",
};

async function api(path, { method = "GET", body } = {}) {
  try {
    const token = await getSessionToken();
    const res = await fetch(`${API}&${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
  } catch (e) {
    return { ok: false, error: String(e?.message || "network") };
  }
}

const when = (at) => (at ? new Date(at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "");

function Pill({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ border: `1px solid ${color}`, color, background: "var(--bg-subtle)" }}>
      {children}
    </span>
  );
}

function SectionTitle({ icon: Icon, color = "var(--text-faint)", children }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold" style={{ color }}>
      {Icon ? <Icon size={12} /> : null} {children}
    </div>
  );
}

function ScoreRing({ score }) {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div
      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--bg-subtle) 0deg)` }}
      aria-label={`ציון גילוי ${pct} מתוך 100`}
    >
      <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full" style={{ background: "var(--bg-elevated, var(--bg))" }}>
        <span className="text-xl font-extrabold" style={{ color: "var(--text)" }}>{pct}</span>
        <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>מתוך 100</span>
      </div>
    </div>
  );
}

export function PassportView({ passport, assets, showToast, onRollback, rollingBack = false }) {
  if (!passport) return null;
  const share = assets?.share || null;
  const readiness = passport.merchant?.readiness || null;
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); showToast?.(done); } catch { showToast?.("ההעתקה נכשלה — אפשר לסמן ולהעתיק ידנית"); }
  }
  async function nativeShare() {
    if (!share) return;
    try {
      if (navigator.share) await navigator.share({ title: passport.title, text: share.text, url: share.url });
      else await copy(share.text, "טקסט השיתוף הועתק");
    } catch { /* the viewer closed the share sheet */ }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <ScoreRing score={passport.score.score} />
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold" style={{ color: "var(--text)" }}>{passport.title}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            ציון גילוי — {passport.score.meaning}
            {Number.isFinite(passport.scoreDelta) && passport.scoreDelta !== 0 ? ` · ${passport.scoreDelta > 0 ? "+" : ""}${passport.scoreDelta} מאז הבדיקה הקודמת` : ""}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Pill color="var(--text-secondary)">{MEDIA_TRUTH_LABEL[passport.media.state]?.he}{passport.media.synthetic ? " · סינתטית" : ""}</Pill>
            <Pill color={passport.merchant.eligible ? "var(--success)" : WARN}>
              Google Merchant: {passport.merchant.eligible ? "זכאי" : "לא זכאי"}{readiness ? ` · מוכנות ${readiness.score}/100` : ""}
            </Pill>
            <Pill color="var(--text-secondary)">{heCount(passport.signals.clicks, "קליק אמיתי אחד", "קליקים אמיתיים")}</Pill>
          </div>
        </div>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-3">
        {passport.score.components.map((c) => (
          <div key={c.id} className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: "var(--bg-subtle)" }} title={c.evidence}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold" style={{ color: "var(--text)" }}>{c.he}</span>
              <span style={{ color: c.met ? "var(--success)" : "var(--text-faint)" }}>{c.earned}/{c.max}</span>
            </div>
            <div className="truncate" style={{ color: "var(--text-faint)" }}>{c.evidence}</div>
          </div>
        ))}
      </div>

      {readiness && readiness.remediation?.length ? (
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "var(--bg-subtle)" }}>
          <span className="font-bold" style={{ color: "var(--text)" }}>מה חסר ל-Google Merchant: </span>
          <span style={{ color: "var(--text-muted)" }}>{readiness.remediation.join(" · ")}</span>
        </div>
      ) : null}

      <div>
        <SectionTitle>משטחי גילוי</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {passport.surfaces.map((s) => {
            const lab = SURFACE_LABEL[s.status] || SURFACE_LABEL.missing;
            const content = (<><span>{s.he}</span><span style={{ opacity: 0.75 }}>· {lab.he}</span></>);
            return s.url && ["live", "ready"].includes(s.status) && s.id !== "tracking" ? (
              <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" title={s.evidence}
                className="ll-tap inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold"
                style={{ border: `1px solid ${lab.color}`, color: lab.color }}>
                {content}<ExternalLink size={10} />
              </a>
            ) : (
              <span key={s.id} title={s.evidence} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ border: `1px solid ${lab.color}`, color: lab.color }}>
                {content}
              </span>
            );
          })}
        </div>
      </div>

      {share ? (
        <div className="rounded-xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <SectionTitle>
            חבילת שיתוף מוכנה · נבנתה מנתוני המוצר{assets?.restoredAt ? ` · שוחזרה ב-${when(assets.restoredAt)}` : ""}
          </SectionTitle>
          <p className="whitespace-pre-line text-xs" style={{ color: "var(--text-secondary)" }}>{share.text}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => copy(share.text, "טקסט השיתוף הועתק")}><Copy size={13} /> העתקת טקסט</Button>
            <a className="inline-block" href={share.whatsappUrl} target="_blank" rel="noopener noreferrer"><Button variant="secondary"><Share2 size={13} /> וואטסאפ</Button></a>
            <a className="inline-block" href={share.telegramUrl} target="_blank" rel="noopener noreferrer"><Button variant="secondary"><Share2 size={13} /> טלגרם</Button></a>
            <Button variant="secondary" onClick={nativeShare}><ArrowUpRight size={13} /> שיתוף</Button>
            {share.trackingLink ? <Button variant="secondary" onClick={() => copy(share.trackingLink, "לינק המעקב הועתק")}><Link2 size={13} /> לינק מעקב</Button> : null}
            {assets?.hasPrevious && onRollback ? (
              <Button variant="ghost" disabled={rollingBack} onClick={() => onRollback(passport.productId)}>
                {rollingBack ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} שחזור הגרסה הקודמת
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
            שיתוף מתבצע רק כשאת לוחצת — לונה לא מפרסמת בשמך. קליקים דרך לינק המעקב נרשמים כנתון אמיתי.
          </p>
          {share.variants?.length > 1 ? (
            <div className="mt-2 rounded-lg px-3 py-2" style={{ border: "1px dashed var(--border)" }}>
              <div className="text-[11px] font-extrabold" style={{ color: "var(--text-faint)" }}>{share.variants[1].he} · לינק מעקב נפרד לניסוי</div>
              <p className="mt-1 whitespace-pre-line text-xs" style={{ color: "var(--text-secondary)" }}>{share.variants[1].text}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => copy(share.variants[1].text, "הגרסה השנייה הועתקה")}><Copy size={13} /> העתקת גרסה ב׳</Button>
                {share.variants[1].trackingLink ? <Button variant="secondary" onClick={() => copy(share.variants[1].trackingLink, "לינק המעקב של גרסה ב׳ הועתק")}><Link2 size={13} /> לינק מעקב ב׳</Button> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {passport.commerce ? (
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "var(--bg-subtle)" }}>
          <div className="font-bold" style={{ color: "var(--text)" }}>
            מסלול המכירה: {passport.commerce.model === "direct" ? "מכירה ישירה באתר" : passport.commerce.model === "affiliate" ? `שותפים${passport.commerce.merchant?.host ? ` · ${passport.commerce.merchant.host}` : ""}` : "אין קישור רכישה"}
          </div>
          <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>
            {passport.commerce.price ? `מחיר מהקטלוג ₪${passport.commerce.price.amount} (לא אומת אצל המוכר)` : "אין מחיר"} · מלאי: לא אומת
            {` · ${heCount(passport.commerce.tracking.outboundClicks, "קליק יוצא אחד", "קליקים יוצאים")}`}
            {` · המרות מאומתות: ${passport.commerce.conversion.verified}`}
            {passport.commerce.conversion.selfReported ? ` · ${passport.commerce.conversion.selfReported} מדווחות עצמית` : ""}
          </div>
          {passport.commerce.disclosure?.required ? (
            <div className="mt-0.5" style={{ color: "var(--text-faint)" }}>גילוי נאות מופיע בעמוד המוצר ובכל חבילת שיתוף</div>
          ) : null}
          {passport.connections ? (
            <div className="mt-0.5" style={{ color: "var(--text-faint)" }}>
              קשרים אמיתיים: {passport.connections.sameCreator.length} מאותה יוצרת · {passport.connections.sameCategory.length} מאותה קטגוריה · {heCount(passport.connections.collections.length, "קולקציה אחת", "קולקציות")}
            </div>
          ) : null}
          {passport.experiment ? (
            <div className="mt-0.5" style={{ color: "var(--text-faint)" }}>
              ניסוי שיתוף א׳/ב׳: {EXPERIMENT_LABEL[passport.experiment.state] || "לא ידוע"} — {passport.experiment.reason}
              {` (א׳: ${passport.experiment.variants[0]?.clicks ?? 0} · ב׳: ${passport.experiment.variants[1]?.clicks ?? 0} קליקים)`}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OpportunityList({ title, icon: Icon, color, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <SectionTitle icon={Icon} color={color}>{title} ({items.length})</SectionTitle>
      <div className="space-y-1.5">
        {items.slice(0, 6).map((o) => (
          <div key={o.id || `${o.productId}-${o.kind}`} className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-subtle)" }}>
            <div className="font-bold" style={{ color: "var(--text)" }}>{o.what || o.result}</div>
            <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>
              {o.productTitle ? `${o.productTitle} · ` : ""}{o.action || o.result}
            </div>
            {o.priorityReasons?.length ? (
              <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>למה עכשיו: {o.priorityReasons.join(" · ")}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** How Luna understood the goal and the plan it derived — straight from the server. */
function IntentPlan({ intent, graph }) {
  if (!intent || !graph) return null;
  const s = graph.summary || {};
  const counts = Object.keys(NODE_LABEL).filter((k) => (s[k] || 0) > 0);
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-subtle)" }}>
      <div style={{ color: "var(--text)" }}>
        <span className="font-bold">איך לונה הבינה את המטרה: </span>{intent.desiredOutcome}
      </div>
      {intent.note ? <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>{intent.note}</div> : null}
      {counts.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {counts.map((k) => <Pill key={k} color={NODE_LABEL[k].color}>{NODE_LABEL[k].he}: {s[k]}</Pill>)}
        </div>
      ) : null}
      <div className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
        {heCount(graph.native || 0, "צעד אחד פועל על תשתית LikeLink בלבד", "צעדים פועלים על תשתית LikeLink בלבד")}
        {graph.external ? ` · ${heCount(graph.external, "צעד אחד דורש ספק חיצוני", "צעדים דורשים ספק חיצוני")}` : ""}
      </div>
    </div>
  );
}

/** The answer to one Luna goal/command — every line comes from the server result. */
export function DiscoveryResult({ result, passports = [], channels = [] }) {
  if (!result) return null;
  const titleOf = (id) => passports.find((p) => p.productId === id)?.title || "";
  const learned = (result.learning || []).filter((l) => l.source !== "none");
  return (
    <div className="space-y-3 rounded-xl p-3" style={{ border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-extrabold" style={{ color: "var(--text)" }}>{result.label}</span>
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{result.evidenceNote}</span>
      </div>
      <IntentPlan intent={result.intent} graph={result.graph} />
      {result.executed.length > 0 && (
        <div>
          <SectionTitle icon={CheckCircle2} color="var(--success)">מה לונה עשתה עכשיו</SectionTitle>
          <div className="space-y-1">
            {result.executed.slice(0, 8).map((e, i) => {
              const lab = RESULT_LABEL[e.status] || RESULT_LABEL.blocked;
              const title = titleOf(e.productId);
              return (
                <div key={`${e.productId}-${e.kind}-${i}`} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: "var(--bg-subtle)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <span style={{ color: "var(--text-secondary)" }}>{title ? `${title} · ` : ""}{e.result}</span>
                    <Pill color={lab.color}>{lab.he}</Pill>
                  </div>
                  {e.proof?.state === "VERIFIED" ? (
                    <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>הוכחה: {e.proof.evidence}</div>
                  ) : null}
                  {e.status === "failed" && e.next ? (
                    <div className="mt-0.5 text-[10px]" style={{ color: "var(--danger)" }}>מה הלאה: {e.next}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <OpportunityList title="דורש את האישור שלך" icon={ShieldAlert} color={WARN} items={result.approvals} />
      <OpportunityList title="את יכולה לעשות עכשיו" icon={Share2} color="var(--text-secondary)" items={result.suggestions} />
      <OpportunityList title="חסום — חסרה הגדרה או נתון" icon={Lock} color="var(--text-faint)" items={result.blocked} />
      {result.campaign && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-subtle)" }}>
          <div className="font-bold" style={{ color: "var(--text)" }}>טיוטת קמפיין · {result.campaign.title}</div>
          <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>
            ערוצים אורגניים זמינים: {result.campaign.organicChannels.length ? result.campaign.organicChannels.map((id) => channels.find((c) => c.provider === id)?.label || "ערוץ").join(", ") : "אין"} · {result.campaign.paid.requirement}
          </div>
        </div>
      )}
      {learned.length ? (
        <div>
          <SectionTitle icon={Lightbulb}>מה לונה למדה מהנתונים</SectionTitle>
          <ul className="space-y-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            {learned.slice(0, 4).map((l, i) => <li key={i}>• {l.he}</li>)}
          </ul>
        </div>
      ) : null}
      {result.next?.he && (
        <div className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: "var(--accent-subtle, var(--bg-subtle))", color: "var(--accent)" }}>
          הצעד הבא: {result.next.he}
        </div>
      )}
    </div>
  );
}

/** Channel registry chips — the real server state, never inferred from UI. */
export function ChannelChips({ channels = [] }) {
  if (!channels.length) return null;
  return (
    <div>
      <SectionTitle>ערוצי הפצה — מצב אמיתי מהשרת</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {channels.map((c) => (
          <span key={c.provider} title={c.requirement || undefined} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ border: `1px solid ${CHANNEL_COLOR[c.state] || "var(--text-faint)"}`, color: CHANNEL_COLOR[c.state] || "var(--text-faint)" }}>
            {c.label} · {CHANNEL_STATE_LABEL[c.state] || "לא ידוע"}
          </span>
        ))}
      </div>
    </div>
  );
}

/** LUNA SYSTEM CHECK — live probes; every color carries its evidence. */
function SystemCheckCard() {
  const [state, setState] = useState({ loading: true, check: null, audience: "public", error: "" });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    const data = await api("action=system-check");
    if (data.ok) setState({ loading: false, check: data.check, audience: data.audience, error: "" });
    else setState({ loading: false, check: null, audience: "public", error: toHebrewError(data.error, "בדיקת המערכת לא זמינה כרגע") });
  }, []);
  useEffect(() => { load(); }, [load]);
  const check = state.check;
  return (
    <details className="rounded-xl p-3" style={{ border: "1px solid var(--border)" }}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-extrabold" style={{ color: "var(--text)" }}>
          <Activity size={13} style={{ color: "var(--accent)" }} /> בדיקת מערכת של לונה
        </span>
        {state.loading ? <Loader2 size={13} className="animate-spin" style={{ color: "var(--text-faint)" }} />
          : check ? (
            <span className="flex flex-wrap gap-1">
              <Pill color={SYSTEM_COLOR[check.overall]}>מצב כולל: {COLOR_LABEL[check.overall]}</Pill>
              {["GREEN", "YELLOW", "RED", "UNVERIFIED"].filter((c) => check.counts[c]).map((c) => (
                <Pill key={c} color={SYSTEM_COLOR[c]}>{COLOR_LABEL[c]}: {check.counts[c]}</Pill>
              ))}
            </span>
          ) : null}
      </summary>
      {state.error ? <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{state.error}</p> : null}
      {check ? (
        <div className="mt-2 space-y-1.5">
          {check.areas.map((a) => (
            <div key={a.id} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: "var(--bg-subtle)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold" style={{ color: "var(--text)" }}>{a.he}</span>
                <Pill color={SYSTEM_COLOR[a.color]}>{COLOR_LABEL[a.color]}</Pill>
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{a.evidence.join(" · ")}</div>
              {a.ownerAction ? <div className="mt-0.5 text-[11px] font-bold" style={{ color: SYSTEM_COLOR[a.color] }}>מה צריך: {a.ownerAction}</div> : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
            <span>נבדק בשרת ב-{when(check.at)}{state.audience === "owner" ? " · תצוגת בעלים" : ""}</span>
            <button type="button" className="ll-tap font-bold" style={{ color: "var(--accent)" }} onClick={load} disabled={state.loading}>בדיקה מחדש</button>
          </div>
        </div>
      ) : null}
    </details>
  );
}

/** Structured memory: what Luna tried, what happened, what is blocked, what's next. */
function MemoryCard({ refreshKey }) {
  const [mem, setMem] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api("action=memory").then((data) => {
      if (!alive) return;
      if (data.ok) { setMem(data); setError(""); } else setError(toHebrewError(data.error, "הזיכרון של לונה לא זמין כרגע"));
    });
    return () => { alive = false; };
  }, [refreshKey]);
  if (error) return <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>{error}</p>;
  if (!mem || !mem.entries) return null;
  const Row = ({ title, items, render }) => (items?.length ? (
    <div>
      <div className="text-[10px] font-extrabold" style={{ color: "var(--text-faint)" }}>{title}</div>
      <ul className="mt-0.5 space-y-0.5">
        {items.slice(0, 4).map((x, i) => <li key={i} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{render(x)}</li>)}
      </ul>
    </div>
  ) : null);
  return (
    <details className="rounded-xl p-3" style={{ border: "1px solid var(--border)" }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-extrabold" style={{ color: "var(--text)" }}>
          <History size={13} style={{ color: "var(--accent)" }} /> הזיכרון של לונה
        </span>
        <Pill color="var(--text-secondary)">{heCount(mem.entries, "רשומה אחת", "רשומות")}</Pill>
      </summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Row title="מה ניסתה" items={mem.tried} render={(x) => `${when(x.at)} · ${x.text}`} />
        <Row title="מה קרה בפועל" items={mem.happened} render={(x) => `${x.type === "failure" ? "נכשל: " : ""}${x.text}${x.proof === "VERIFIED" ? " · אומת" : ""}`} />
        <Row title="מה חסום" items={mem.blocked} render={(x) => x.text} />
        <Row title="מה למדה" items={mem.learned} render={(x) => x.text} />
      </div>
      {mem.next?.he ? <div className="mt-2 text-[11px] font-bold" style={{ color: "var(--accent)" }}>הצעד הבא: {mem.next.he}</div> : null}
      {mem.why?.text ? <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>למה: {mem.why.text}{mem.why.evidence ? ` · ${mem.why.evidence}` : ""}</div> : null}
    </details>
  );
}

export default function LunaDiscoveryCenter({ onNavigate }) {
  const { currentMarketer: marketer, products, showToast } = useMarketplace();
  const mine = useMemo(
    () => (products || []).filter((p) => p && p.marketerId === marketer?.id && p.status === "approved"),
    [products, marketer?.id]
  );
  const [productId, setProductId] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState(0);

  const loadOverview = useCallback(async () => {
    if (!marketer) return;
    const data = await api("action=overview");
    if (data.ok) setOverview(data);
    else setError(toHebrewError(data.error, "טעינת נתוני הגילוי נכשלה"));
  }, [marketer]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  function finish(data) {
    setBusy("");
    if (!data.ok) {
      const msg = toHebrewError(data.error, "לונה לא הצליחה להשלים את הבקשה");
      setError(msg);
      showToast?.(msg);
      return;
    }
    setResult(data);
    const done = data.executed.filter((e) => e.status === "executed").length;
    showToast?.(done ? `לונה ביצעה ואימתה ${done} פעולות בטוחות` : "הניתוח הושלם — אין פעולה בטוחה חדשה לביצוע");
    setRuns((n) => n + 1);
    loadOverview();
  }

  async function run(command) {
    const def = COMMANDS.find((c) => c.id === command);
    if (def?.needsProduct && !productId) { showToast?.("בחרי מוצר כדי שלונה תקדם אותו"); return; }
    setBusy(command);
    setError("");
    finish(await api("action=command", { method: "POST", body: { command, productId: productId || undefined } }));
  }

  async function runGoal(e) {
    e?.preventDefault?.();
    const text = goal.trim();
    if (!text) { showToast?.("כתבי ללונה מה המטרה"); return; }
    setBusy("goal");
    setError("");
    finish(await api("action=goal", { method: "POST", body: { goal: text, productId: productId || undefined } }));
  }

  async function rollback(id) {
    setBusy(`rollback:${id}`);
    const data = await api("action=rollback", { method: "POST", body: { productId: id } });
    setBusy("");
    if (!data.ok) { showToast?.(toHebrewError(data.error, "השחזור נכשל")); return; }
    showToast?.("חבילת השיתוף שוחזרה לגרסה הקודמת ואומתה");
    setResult(null);
    setRuns((n) => n + 1);
    loadOverview();
  }

  if (!marketer) {
    return (
      <div className="ll-card rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <Compass size={16} style={{ color: "var(--accent)" }} />
          <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>לונה · שכבת הגילוי</h3>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          התחברי לסטודיו כדי שלונה תנתח את המוצרים שלך, תכין אותם לגילוי ותראה בדיוק מה דורש את האישור שלך.
        </p>
        <div className="mt-3 max-w-xs">
          <Button onClick={() => onNavigate?.("products")}>התחברות לסטודיו</Button>
        </div>
        <div className="mt-4"><SystemCheckCard /></div>
      </div>
    );
  }

  const passports = result?.passports || overview?.passports || [];
  const focus = passports.find((p) => p.productId === productId) || passports.slice().sort((a, b) => a.score.score - b.score.score)[0] || null;
  const focusAssets = overview?.assets?.[focus?.productId] || (result?.assets?.[focus?.productId] ? { ...result.assets[focus.productId], hasPrevious: Boolean(result.assets[focus.productId].previous?.share) } : null);
  const channels = result?.channels || overview?.channels || [];
  const avg = passports.length ? Math.round(passports.reduce((s, p) => s + p.score.score, 0) / passports.length) : null;
  const ent = overview?.entitlement || null;

  return (
    <div className="ll-card rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Compass size={16} style={{ color: "var(--accent)" }} />
            <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>לונה · שכבת הגילוי</h3>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            תגידי ללונה מה המטרה — היא בודקת את המוצרים האמיתיים שלך, מבצעת רק פעולות בטוחות ומראה מה דורש את האישור שלך.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {avg != null && <Pill color="var(--accent)">ציון גילוי ממוצע: {avg}/100 · {passports.length} מוצרים</Pill>}
          {ent ? (
            <Pill color={ent.plan === "free" ? "var(--text-secondary)" : "var(--success)"}>
              מסלול: {PLAN_LABEL[ent.plan] || "לא ידוע"}
              {ent.maxProductsPerRun != null ? ` · עד ${ent.maxProductsPerRun} מוצרים לבקשה` : ""}
            </Pill>
          ) : null}
        </div>
      </div>
      {ent?.reason ? (
        <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>{ent.reason}</p>
      ) : null}

      {mine.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין עדיין מוצרים מאושרים בסטודיו שלך — הוסיפי מוצר ולונה תכין אותו לגילוי.</p>
      ) : (
        <>
          <div className="max-w-md">
            <LabeledSelect
              label="על איזה מוצר לונה עובדת?"
              value={productId}
              options={[{ value: "", label: "כל המוצרים שלי" }, ...mine.map((p) => ({ value: p.id, label: p.title || p.id }))]}
              onChange={setProductId}
            />
          </div>
          <form onSubmit={runGoal} className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">המטרה ללונה</span>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                maxLength={300}
                placeholder="מה המטרה? למשל: לונה, תכיני את המוצר לגוגל"
                className="input-field w-full px-3.5 py-2.5 text-sm"
              />
            </label>
            <div className="sm:w-40">
              <Button type="submit" disabled={Boolean(busy) || !goal.trim()}>
                {busy === "goal" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} שליחה ללונה
              </Button>
            </div>
          </form>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {COMMANDS.map((c) => {
              const Icon = c.icon;
              const disabled = Boolean(busy) || (c.needsProduct && !productId);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => run(c.id)}
                  disabled={disabled}
                  title={c.needsProduct && !productId ? "בחרי מוצר קודם" : undefined}
                  className="ll-tap flex items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold disabled:opacity-50"
                  style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  {busy === c.id ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} style={{ color: "var(--accent)" }} />}
                  {c.he}
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && <p className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: "var(--bg-subtle)", color: "var(--danger)" }}>{error}</p>}

      {result && <DiscoveryResult result={result} passports={passports} channels={channels} />}

      {focus && (
        <PassportView
          passport={focus}
          assets={focusAssets}
          showToast={showToast}
          onRollback={rollback}
          rollingBack={busy === `rollback:${focus.productId}`}
        />
      )}

      <ChannelChips channels={channels} />

      <MemoryCard refreshKey={runs} />
      <SystemCheckCard />

      {!result && overview?.log?.length ? (
        <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          פעולה אחרונה של לונה: {when(overview.log[0].at)} · {heCount(overview.log[0].executed.filter((e) => e.status === "executed").length, "פעולה אחת בוצעה", "פעולות בוצעו")}
        </div>
      ) : null}
    </div>
  );
}
