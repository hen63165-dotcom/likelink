// Studio Growth Mode: the studio's own Autonomous Marketing Engine. Everything
// shown comes from the server (mode=growth-engine): the plan, the quota, the
// verified publications (with their ids), the manual-share items, the activity
// log and the next actions. Nothing is assumed.
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/index.jsx";
import { engineStatus, engineControl, engineRun, engineErrorHe, ITEM_STATUS_HE } from "../../lib/marketingEngineClient.js";

const STAGE_HE = { INTENT: "כוונה", OPPORTUNITY: "הזדמנות", CREATIVE: "קריאייטיב", VIDEO: "סרטון", DISTRIBUTION: "הפצה", TRACKING: "מעקב", PROOF: "הוכחה", MEASUREMENT: "מדידה", LEARNING: "למידה", NEXT_ACTION: "הצעד הבא" };
const ACTION_HE = { REPAIR_DATA: "לתקן נתוני מוצר", CREATE_VIDEO: "סרטון בדרך", SHARE_MANUAL: "לשתף ידנית", MEASURE: "למדוד", EXPLOIT: "להגביר את המנצח", RETIRE_CREATIVE: "להוריד קריאייטיב חלש" };
const box = { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16 };

export default function MarketingEnginePanel() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => { const r = await engineStatus(); setS(r); }, []);
  useEffect(() => { load(); }, [load]);

  async function act(op) {
    setBusy(op); setMsg("");
    const r = op === "run" ? await engineRun() : await engineControl(op);
    if (!r.ok) setMsg(engineErrorHe(r.error));
    else if (op === "run") setMsg(`מחזור הסתיים: ${r.summary?.published ?? 0} פורסמו, ${r.summary?.manual ?? 0} מוכנים לשיתוף ידני, ${r.summary?.failed ?? 0} נכשלו.`);
    await load();
    setBusy("");
  }

  if (!s) return <div className="p-4 text-sm text-muted" dir="rtl">טוענת את מנוע השיווק…</div>;
  if (!s.ok) return <div className="p-4 text-sm" dir="rtl" style={box}>{engineErrorHe(s.error)}</div>;
  const q = s.quota || {};
  const included = q.limits?.included;
  const manual = (s.items || []).filter((x) => x.status === "MANUAL_SHARE_READY").slice(0, 6);
  const published = s.publishedProof || [];

  return (
    <section className="mb-6 p-4 flex flex-col gap-3" dir="rtl" style={box} aria-labelledby="engine-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="engine-h" className="text-[17px] font-extrabold">מנוע השיווק האוטונומי</h2>
          <p className="text-[12px] text-muted">
            מסלול: {s.plan}{included ? ` · מחזורים החודש: ${q.used ?? 0}/${q.limit === null ? "∞" : q.limit}` : ""} · מצב: {!s.enabled ? "כבוי" : s.paused ? "מושהה" : "פעיל"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!included ? null : !s.enabled ? <Button disabled={!!busy} onClick={() => act("enable")}>הפעלת המנוע</Button>
            : s.paused ? <Button disabled={!!busy} onClick={() => act("resume")}>המשך</Button>
            : <Button disabled={!!busy} onClick={() => act("pause")}>השהיה</Button>}
          {included && s.enabled && !s.paused ? <Button disabled={!!busy} onClick={() => act("run")}>{busy === "run" ? "מריצה…" : "הרצת מחזור עכשיו"}</Button> : null}
        </div>
      </div>
      {!included ? (
        <p className="text-[13px]">המנוע בוחר מוצרים לקידום, כותב הוק וכיתוב עם לינק מעקב, מצרף סרטון אנימציה מסומן ומפרסם בפיד של LikeLink. הוא כלול במסלולי Starter ו-Professional{s.upgrade ? ` (החל מ-₪${s.upgrade.price})` : ""}.</p>
      ) : null}
      {msg ? <p className="text-[13px] font-semibold">{msg}</p> : null}
      <p className="text-[11.5px] text-muted">{s.stages.map((x) => STAGE_HE[x]).join(" ← ")}</p>
      <div className="grid gap-2 sm:grid-cols-3 text-[13px]">
        <div style={box} className="p-3"><b>{published.length}</b> פרסומים עם מזהה שנקרא בחזרה</div>
        <div style={box} className="p-3"><b>{s.totals?.byStatus?.MANUAL_SHARE_READY || 0}</b> פריטי שיתוף ידני מוכנים</div>
        <div style={box} className="p-3">למידה: {s.learning?.status === "LEARNING" ? "יש מספיק נתונים" : `אין עדיין מספיק נתונים (${s.learning?.landings || 0}/${s.learning?.minEvidence || 30} כניסות)`}</div>
      </div>
      {published.length ? (
        <div>
          <p className="text-[12px] font-bold mb-1">פרסומים מאומתים</p>
          <ul className="text-[12px] text-muted">{published.slice(0, 5).map((x) => <li key={x.providerId}>{x.channel} · {x.providerId} · {new Date(x.at).toLocaleString("he-IL")}</li>)}</ul>
        </div>
      ) : null}
      {manual.length ? (
        <div>
          <p className="text-[12px] font-bold mb-1">לשיתוף ידני (הערוץ לא מחובר. הלינק נמדד)</p>
          <ul className="flex flex-col gap-2">
            {manual.map((x) => (
              <li key={x.id} className="p-2 text-[12px]" style={box}>
                <p className="font-semibold">{x.channel} · {ITEM_STATUS_HE[x.status] || x.status}</p>
                <p className="text-muted whitespace-pre-line line-clamp-3">{x.caption}</p>
                <div className="flex gap-2 mt-1">
                  <button type="button" className="underline" onClick={() => navigator.clipboard?.writeText(x.caption).then(() => setMsg("הכיתוב והלינק הועתקו"), () => setMsg("ההעתקה לא הצליחה"))}>העתקת כיתוב + לינק</button>
                  {x.shareUrl ? <a className="underline" href={x.shareUrl} target="_blank" rel="noopener noreferrer">פתיחת שיתוף</a> : null}
                </div>
                {x.missingConnection ? <p className="text-muted mt-1">כדי לפרסם אוטומטית: {x.missingConnection}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(s.nextActions || []).length ? (
        <div>
          <p className="text-[12px] font-bold mb-1">הצעדים הבאים (רק מנתונים אמיתיים)</p>
          <ul className="text-[12px]">{s.nextActions.slice(0, 6).map((a, i) => <li key={i}>{ACTION_HE[a.action] || a.action} · {a.reason}</li>)}</ul>
        </div>
      ) : null}
      {(s.activity || []).length ? (
        <details>
          <summary className="text-[12px] font-bold cursor-pointer">יומן פעילות</summary>
          <ul className="text-[11.5px] text-muted mt-1">{s.activity.slice(0, 25).map((a, i) => <li key={i}>{new Date(a.at).toLocaleString("he-IL")} · {STAGE_HE[a.stage] || a.stage} · {a.type} · {a.status}</li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}
