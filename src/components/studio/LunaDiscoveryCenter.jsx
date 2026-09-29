// Luna Discovery Center — the owner-facing face of the Autonomous Discovery
// Engine (/api/store?mode=discovery).
//
// A creator states a goal ("לונה, תגדילי את החשיפה"); the server analyzes the
// real catalog, executes only SAFE internal actions (share assets, content
// drafts, SEO verification), and returns what needs the owner's approval and
// what is blocked — with the exact requirement. Every value on screen comes
// from the server answer; nothing here is simulated.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Compass, Sparkles, Search, Rocket, Megaphone, Share2, Copy, CheckCircle2, ShieldAlert,
  Lock, Loader2, ExternalLink, ArrowUpRight, Link2,
} from "lucide-react";
import { useMarketplace } from "../../context/MarketplaceContext";
import { getSessionToken } from "../../lib/auth.js";
import { toHebrewError } from "../../lib/errorMessages.js";
import { CHANNEL_STATE_LABEL, heCount } from "../../lib/discovery/engine.js";
import { MEDIA_TRUTH_LABEL } from "../../lib/discovery/mediaTruth.js";
import { Button, LabeledSelect } from "../ui/index.jsx";

const API = "/api/store?mode=discovery";

const COMMANDS = [
  { id: "increase_exposure", he: "לונה, תגדילי את החשיפה", icon: Sparkles },
  { id: "promote_product", he: "לונה, קדמי את המוצר הזה", icon: Rocket, needsProduct: true },
  { id: "organic_discovery", he: "לונה, הגדילי גילוי אורגני", icon: Search },
  { id: "find_opportunities", he: "לונה, מצאי לי הזדמנויות", icon: Compass },
  { id: "prepare_distribution", he: "לונה, הכיני את המוצר להפצה", icon: Share2 },
  { id: "prepare_campaign", he: "לונה, הכיני קמפיין", icon: Megaphone },
];

const RESULT_LABEL = {
  executed: { he: "בוצע", color: "var(--success)" },
  up_to_date: { he: "כבר מעודכן", color: "var(--success)" },
  blocked: { he: "נדרש עדכון נתונים", color: "var(--warning, #f59e0b)" },
  failed: { he: "נכשל", color: "var(--danger)" },
};

const SURFACE_LABEL = {
  live: { he: "פעיל", color: "var(--success)" },
  ready: { he: "מוכן", color: "var(--success)" },
  missing: { he: "חסר", color: "var(--warning, #f59e0b)" },
  stale: { he: "לא מעודכן", color: "var(--warning, #f59e0b)" },
  blocked: { he: "חסום", color: "var(--danger)" },
  not_applicable: { he: "לא רלוונטי", color: "var(--text-faint)" },
};

const CHANNEL_COLOR = {
  CONNECTED: "var(--success)", READY: "var(--success)", PUBLISHED: "var(--success)",
  REQUIRES_CONFIGURATION: "var(--warning, #f59e0b)", REQUIRES_AUTH: "var(--warning, #f59e0b)",
  NOT_CONNECTED: "var(--text-faint)", FAILED: "var(--danger)", RATE_LIMITED: "var(--warning, #f59e0b)", PUBLISHING: "var(--accent)",
};

async function api(path, { method = "GET", body } = {}) {
  const token = await getSessionToken();
  const res = await fetch(`${API}&${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
}

function Pill({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ border: `1px solid ${color}`, color, background: "var(--bg-subtle)" }}>
      {children}
    </span>
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

export function PassportView({ passport, assets, showToast }) {
  if (!passport) return null;
  const share = assets?.share || null;
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
            <Pill color={passport.merchant.eligible ? "var(--success)" : "var(--warning, #f59e0b)"}>Google Merchant: {passport.merchant.eligible ? "זכאי" : "לא זכאי"}</Pill>
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

      <div>
        <div className="mb-1 text-[11px] font-extrabold" style={{ color: "var(--text-faint)" }}>משטחי גילוי</div>
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
          <div className="mb-1 text-[11px] font-extrabold" style={{ color: "var(--text-faint)" }}>חבילת שיתוף מוכנה · נבנתה מנתוני המוצר</div>
          <p className="whitespace-pre-line text-xs" style={{ color: "var(--text-secondary)" }}>{share.text}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => copy(share.text, "טקסט השיתוף הועתק")}><Copy size={13} /> העתקת טקסט</Button>
            <a className="inline-block" href={share.whatsappUrl} target="_blank" rel="noopener noreferrer"><Button variant="secondary"><Share2 size={13} /> וואטסאפ</Button></a>
            <a className="inline-block" href={share.telegramUrl} target="_blank" rel="noopener noreferrer"><Button variant="secondary"><Share2 size={13} /> טלגרם</Button></a>
            <Button variant="secondary" onClick={nativeShare}><ArrowUpRight size={13} /> שיתוף</Button>
            {share.trackingLink ? <Button variant="secondary" onClick={() => copy(share.trackingLink, "לינק המעקב הועתק")}><Link2 size={13} /> לינק מעקב</Button> : null}
          </div>
          <p className="mt-1.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
            שיתוף מתבצע רק כשאת לוחצת — לונה לא מפרסמת בשמך. קליקים דרך לינק המעקב נרשמים כנתון אמיתי.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function OpportunityList({ title, icon: Icon, color, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold" style={{ color }}>
        <Icon size={12} /> {title} ({items.length})
      </div>
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


/** The answer to one Luna command — every line comes from the server result. */
export function DiscoveryResult({ result, passports = [], channels = [] }) {
  if (!result) return null;
  return (
    <div className="space-y-3 rounded-xl p-3" style={{ border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-extrabold" style={{ color: "var(--text)" }}>{result.label}</span>
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{result.evidenceNote}</span>
      </div>
      {result.executed.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold" style={{ color: "var(--success)" }}>
            <CheckCircle2 size={12} /> מה לונה עשתה עכשיו
          </div>
          <div className="space-y-1">
            {result.executed.slice(0, 8).map((e, i) => {
              const lab = RESULT_LABEL[e.status] || RESULT_LABEL.blocked;
              const title = passports.find((p) => p.productId === e.productId)?.title || "";
              return (
                <div key={`${e.productId}-${e.kind}-${i}`} className="flex items-start justify-between gap-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: "var(--bg-subtle)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{title ? `${title} · ` : ""}{e.result}</span>
                  <Pill color={lab.color}>{lab.he}</Pill>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <OpportunityList title="דורש את האישור שלך" icon={ShieldAlert} color="var(--warning, #f59e0b)" items={result.approvals} />
      <OpportunityList title="חסום — חסרה הגדרה או נתון" icon={Lock} color="var(--text-faint)" items={result.blocked} />
      {result.campaign && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-subtle)" }}>
          <div className="font-bold" style={{ color: "var(--text)" }}>טיוטת קמפיין · {result.campaign.title}</div>
          <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>
            ערוצים אורגניים זמינים: {result.campaign.organicChannels.length ? result.campaign.organicChannels.map((id) => channels.find((c) => c.provider === id)?.label || "ערוץ").join(", ") : "אין"} · {result.campaign.paid.requirement}
          </div>
        </div>
      )}
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
      <div className="mb-1 text-[11px] font-extrabold" style={{ color: "var(--text-faint)" }}>ערוצי הפצה — מצב אמיתי מהשרת</div>
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

export default function LunaDiscoveryCenter({ onNavigate }) {
  const { currentMarketer: marketer, products, showToast } = useMarketplace();
  const mine = useMemo(
    () => (products || []).filter((p) => p && p.marketerId === marketer?.id && p.status === "approved"),
    [products, marketer?.id]
  );
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    if (!marketer) return;
    const data = await api("action=overview");
    if (data.ok) setOverview(data);
    else setError(toHebrewError(data.error, "טעינת נתוני הגילוי נכשלה"));
  }, [marketer]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  async function run(command) {
    const def = COMMANDS.find((c) => c.id === command);
    if (def?.needsProduct && !productId) { showToast?.("בחרי מוצר כדי שלונה תקדם אותו"); return; }
    setBusy(command);
    setError("");
    const data = await api("action=command", { method: "POST", body: { command, productId: productId || undefined } });
    setBusy("");
    if (!data.ok) {
      const msg = data.error === "no_products" ? "אין עדיין מוצרים מאושרים בסטודיו שלך" : toHebrewError(data.error, "לונה לא הצליחה להשלים את הבקשה");
      setError(msg);
      showToast?.(msg);
      return;
    }
    setResult(data);
    const done = data.executed.filter((e) => e.status === "executed").length;
    showToast?.(done ? `לונה ביצעה ${done} פעולות בטוחות` : "הניתוח הושלם — אין פעולה בטוחה חדשה לביצוע");
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
      </div>
    );
  }

  const passports = result?.passports || overview?.passports || [];
  const focus = passports.find((p) => p.productId === productId) || passports.slice().sort((a, b) => a.score.score - b.score.score)[0] || null;
  const focusAssets = result?.assets?.[focus?.productId] || overview?.assets?.[focus?.productId] || null;
  const channels = result?.channels || overview?.channels || [];
  const avg = passports.length ? Math.round(passports.reduce((s, p) => s + p.score.score, 0) / passports.length) : null;

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
        {avg != null && <Pill color="var(--accent)">ציון גילוי ממוצע: {avg}/100 · {passports.length} מוצרים</Pill>}
      </div>

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

      {focus && <PassportView passport={focus} assets={focusAssets} showToast={showToast} />}

      <ChannelChips channels={channels} />

      {!result && overview?.log?.length ? (
        <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          פעולה אחרונה של לונה: {new Date(overview.log[0].at).toLocaleString("he-IL")} · {overview.log[0].executed.filter((e) => e.status === "executed").length} פעולות בוצעו
        </div>
      ) : null}
    </div>
  );
}
