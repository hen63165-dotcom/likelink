// Creatives, publications and proof — the Studio view of the publishing
// orchestrator (GET /api/store?mode=discovery&action=media-ledger).
//
// Every value comes from the server ledger: the asset's provider, style,
// truth (animation / UGC-style / real), generation status, each destination's
// publication id, verification evidence, and tracking. A destination without
// credentials shows "דורש חיבור" — never a success. Nothing is simulated.
import React, { useCallback, useEffect, useState } from "react";
import { Clapperboard, Loader2, ExternalLink, CheckCircle2, ShieldAlert, Link2 } from "lucide-react";
import { getSessionToken } from "../../lib/auth.js";
import { toHebrewError } from "../../lib/errorMessages.js";

const API = "/api/store?mode=discovery";
const STAGES = [["CREATED", "נוצר"], ["GENERATED", "רונדר"], ["STORED", "נשמר"], ["PUBLISHED", "פורסם"], ["VERIFIED", "אומת"], ["TRACKED", "במעקב"]];
const STATE = {
  VERIFIED: ["מאומת", "var(--success, #16a34a)"],
  UNVERIFIED: ["לא אומת", "var(--warning, #d97706)"],
  BLOCKED: ["חסום לקידום", "var(--danger, #dc2626)"],
  READY: ["מוכן", "var(--text-secondary)"],
  PENDING_CHECK: ["ממתין לבדיקה", "var(--text-secondary)"],
};
const PUB = {
  VERIFIED: "אומת",
  PUBLISHED_UNVERIFIED: "פורסם · לא אומת",
  NOT_LISTED: "לא מוצג",
  BLOCKED: "חסום",
  NEEDS_CONNECTION: "דורש חיבור",
  READY: "מחובר · עוד לא פורסם",
  FAILED: "נכשל",
};
const when = (at) => (at ? new Date(at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "");

async function load() {
  const token = await getSessionToken().catch(() => null);
  if (!token) return { ok: false, error: "authentication_required" };
  try {
    const res = await fetch(`${API}&action=media-ledger`, { headers: { Authorization: `Bearer ${token}` } });
    return await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
  } catch {
    return { ok: false, error: "network_error" };
  }
}

function Pill({ color, children }) {
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color, border: `1px solid ${color}` }}>{children}</span>;
}

export default function CreativeProofCard() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    const data = await load();
    setState(data.ok ? { loading: false, data, error: "" } : { loading: false, data: null, error: toHebrewError(data.error, "יומן הקריאייטיבים לא זמין כרגע") });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const d = state.data;
  const proofs = new Map((d?.proofs || []).map((p) => [p.assetId, p]));
  const ledger = d?.ledger || [];
  const verified = ledger.filter((e) => e.state === "VERIFIED").length;
  return (
    <details className="rounded-xl p-3" style={{ border: "1px solid var(--border)" }}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-extrabold" style={{ color: "var(--text)" }}>
          <Clapperboard size={13} style={{ color: "var(--accent)" }} /> קריאייטיב, פרסום והוכחות
        </span>
        {state.loading ? <Loader2 size={13} className="animate-spin" style={{ color: "var(--text-faint)" }} />
          : d ? <span className="flex flex-wrap gap-1"><Pill color="var(--text-secondary)">{ledger.length} קריאייטיבים</Pill><Pill color={STATE.VERIFIED[1]}>{verified} מאומתים</Pill></span> : null}
      </summary>
      {state.error ? <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{state.error}</p> : null}
      {d ? (
        <div className="mt-2 space-y-2">
          {!ledger.length ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>עדיין לא נבדק אף קריאייטיב. הבדיקה רצה אחרי כל רינדור וגם בטייס האוטומטי.</p>
          ) : null}
          {ledger.slice(0, 10).map((e) => {
            const p = proofs.get(e.assetId);
            const [label, color] = STATE[e.state] || [e.state, "var(--text-secondary)"];
            return (
              <div key={e.assetId} className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-subtle)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold" style={{ color: "var(--text)" }}>{e.productTitle || e.productId}</span>
                  <Pill color={color}>{label}</Pill>
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {p?.asset?.styleLabel?.he || e.style} · {p?.truth?.label?.he || e.truth}{p?.truth?.ugcMode && p.truth.ugcMode !== "NOT_UGC" ? ` · ${p.truth.ugcLabel?.he}` : ""} · ספק: {e.provider || p?.asset?.provider || "—"}
                  {p?.asset?.createdAt ? ` · נוצר ${when(p.asset.createdAt)}` : ""}
                </div>
                {p?.asset?.creativePrompt ? <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>בריף: {p.asset.creativePrompt}</div> : null}
                {p?.stages ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {STAGES.map(([k, he]) => (
                      <span key={k} className="flex items-center gap-0.5 text-[10px]" style={{ color: p.stages[k]?.ok ? STATE.VERIFIED[1] : "var(--text-faint)" }}>
                        {p.stages[k]?.ok ? <CheckCircle2 size={11} /> : <ShieldAlert size={11} />} {he}
                      </span>
                    ))}
                  </div>
                ) : null}
                {p ? (
                  <ul className="mt-1 space-y-0.5">
                    {p.publications.map((x) => (
                      <li key={x.destination} className="flex flex-wrap items-center gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        <span className="font-bold">{x.he}:</span> {PUB[x.status] || x.status}
                        {x.providerId ? <span> · מזהה: {x.providerId}</span> : null}
                        {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-bold" style={{ color: "var(--accent)" }}>פתיחה <ExternalLink size={10} /></a> : null}
                        {x.status === "NEEDS_CONNECTION" && x.missing?.length ? <span style={{ color: "var(--text-faint)" }}> · חסר: {x.missing.join(", ")}</span> : null}
                        {x.reason ? <span style={{ color: "var(--text-faint)" }}> · {x.reason === "catalog_integrity" ? "קישור משותף או תמונת אווירה" : x.reason}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  <span>קליקים מהקריאייטיב: {e.clicksFromCreative ?? 0}</span>
                  {p?.tracking?.link ? <span className="inline-flex items-center gap-0.5"><Link2 size={10} /> קישור מעקב קיים</span> : null}
                  {e.checkedAt ? <span>נבדק {when(e.checkedAt)}</span> : null}
                  <a href={`${API}&action=publication-proof&asset=${encodeURIComponent(e.assetId)}`} target="_blank" rel="noopener noreferrer" className="font-bold" style={{ color: "var(--accent)" }}>ההוכחה (JSON)</a>
                </div>
              </div>
            );
          })}
          {d.destinations?.length ? (
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span className="font-bold">יעדים חיצוניים: </span>
              {d.destinations.map((x) => `${x.he} — ${x.status === "CONNECTED" ? "מחובר" : "דורש חיבור"}`).join(" · ")}
            </div>
          ) : null}
          <div className="flex justify-end">
            <button type="button" className="ll-tap text-[10px] font-bold" style={{ color: "var(--accent)" }} onClick={refresh} disabled={state.loading}>רענון</button>
          </div>
        </div>
      ) : null}
    </details>
  );
}
