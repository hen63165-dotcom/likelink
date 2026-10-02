// Creative Lab — the Studio face of the Creative Engine
// (src/lib/media/creativeEngine.js + reelPublisher.createCreative).
// Everything shown comes from the server: provider states from recorded
// evidence, jobs from media:requests + the verified video records, counts from
// creative:events. A type the backend cannot run has no active button — it
// says why. A job is "ready" only with a stored, verified video URL.
import React, { useCallback, useEffect, useState } from "react";
import { creativeState, createCreative, creativeErrorHe } from "../../lib/reelClient.js";

const STATE_HE = {
  AVAILABLE: { label: "זמין · אומת", color: "#4ade80" },
  UNVERIFIED: { label: "זמין · טרם אומת (הניסיון הראשון יאמת)", color: "#fcd34d" },
  UNAVAILABLE: { label: "לא זמין כרגע", color: "#ff9b9b" },
};
const JOB_HE = {
  QUEUED: { label: "בתור לרינדור (עד 3 שעות)", color: "#fcd34d" },
  COMPLETED: { label: "מוכן · נשמר ואומת", color: "#4ade80" },
  FAILED: { label: "נכשל — לא פורסם ולא נספר", color: "#ff9b9b" },
  RENDERED_NOT_FOUND: { label: "רונדר אך הקובץ לא נמצא — לא מוצג", color: "#ff9b9b" },
};
const PROVIDER_HE = { AVAILABLE: "פעיל · הצלחה מתועדת", UNVERIFIED: "לא אומת עדיין", NOT_CONFIGURED: "לא מחובר (חסר מפתח)", NO_CREDITS: "אין קרדיטים", FAILED: "נכשל לאחרונה", DISABLED: "אין חיבור בקוד" };
const OUTPUT_HE = { RENDERED_VIDEO: "סרטון מרונדר", AI_STILLS_ANIMATED: "תמונות AI מונפשות (לא וידאו AI)", AI_VIDEO: "וידאו AI" };

const chip = (text, color) => (
  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(255,255,255,.07)", color }}>{text}</span>
);

export default function CreativeLab({ products = [], he = true, onCreated }) {
  const [data, setData] = useState({ loading: true });
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  const refresh = useCallback(async () => {
    const r = await creativeState();
    setData(r.ok ? { loading: false, ...r } : { loading: false, error: r.error });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!productId && products[0]) setProductId(products[0].id); }, [products, productId]);

  async function order(type) {
    if (!productId) return;
    setBusy(type);
    setResult(null);
    const r = await createCreative({ productId, creativeType: type, language: "he", platform: "instagram_reels", cta: "comment_keyword" });
    setBusy("");
    setResult(r.ok ? { ok: true, type, job: r.job, existing: r.existing, duplicate: r.duplicate } : { ok: false, type, error: r.error, upgrade: r.upgrade });
    if (r.ok) { refresh(); onCreated?.(); }
  }

  if (data.loading) return <div className="ll-card rounded-2xl p-4 text-xs" style={{ color: "var(--text-muted)" }}>{he ? "טוען את Creative Lab…" : "Loading Creative Lab…"}</div>;
  if (data.error) return <div className="ll-card rounded-2xl p-4 text-xs" style={{ color: "#ff9b9b" }}>{creativeErrorHe(data.error)}</div>;

  const quota = Object.values(data.quota?.byStudio || {})[0]?.check || null;
  const jobs = (data.jobs || []).filter((j) => !productId || j.productId === productId);
  const analytics = data.analytics?.byType || {};

  return (
    <section className="ll-card rounded-2xl p-4 space-y-3" aria-label="Creative Lab">
      <div>
        <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>Creative Lab</h3>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {he
            ? "בחרי מוצר וסוג סרטון. כל סרטון נבנה מהשדות האמיתיים של המוצר ומהתמונה האמיתית שלו, ומסומן כממוחשב/AI. דמויות ה-AI מקוריות (לא של אולפן קיים) ואינן אנשים אמיתיים. אין קריינות — הטקסט בעברית על המסך."
            : "Pick a product and a creative type. Built from the product's real fields and photo, labelled as computer-made/AI. AI characters are original and not real people. No voiceover — Hebrew captions on screen."}
        </p>
      </div>

      <label className="block text-xs font-bold" style={{ color: "var(--text)" }}>
        {he ? "מוצר" : "Product"}
        <select value={productId} onChange={(e) => { setProductId(e.target.value); setResult(null); }} className="mt-1 w-full rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        {(data.capabilities || []).map((c) => {
          const st = STATE_HE[c.state] || STATE_HE.UNAVAILABLE;
          const premiumBlocked = c.tier === "premium" && quota && !quota.allowed;
          const disabled = !c.available || !productId || Boolean(busy) || premiumBlocked;
          return (
            <div key={c.type} className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold" style={{ color: "var(--text)" }}>{c.he}</div>
                {chip(c.tier === "free" ? (he ? "כלול" : "Included") : (he ? "פרימיום" : "Premium"), c.tier === "free" ? "#4ade80" : "#c4b5fd")}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {chip(st.label, st.color)}
                {chip(OUTPUT_HE[c.videoGeneration] || c.videoGeneration, "var(--text-muted)")}
                {c.aiGenerated ? chip(he ? "מסומן כ-AI" : "AI-labelled", "#fcd34d") : null}
              </div>
              {!c.available ? (
                <p className="mt-1 text-[11px]" style={{ color: "#ff9b9b" }}>
                  {he ? "חסר: " : "Missing: "}{c.blocked.map((b) => b.states.map((s) => `${s.id} (${PROVIDER_HE[s.status] || s.status})`).join(", ")).join(" · ")}
                </p>
              ) : null}
              {premiumBlocked ? (
                <p className="mt-1 text-[11px]" style={{ color: "#fcd34d" }}>
                  {quota.error === "plan_required"
                    ? (he ? `כלול במסלול ${data.quota?.upgrade?.name || "בתשלום"}${data.quota?.upgrade ? ` (₪${data.quota.upgrade.price} לחודש)` : ""} — אפשר לשדרג במסך המנוי.` : "Included in a paid plan.")
                    : (he ? `ניצלת ${quota.used}/${quota.limit} החודש.` : `Used ${quota.used}/${quota.limit} this month.`)}
                </p>
              ) : c.tier === "premium" && quota?.limit != null ? (
                <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{he ? `נשארו ${quota.remaining} החודש (נספר רק סרטון שאומת)` : `${quota.remaining} left this month`}</p>
              ) : null}
              <button type="button" disabled={disabled} onClick={() => order(c.type)} className="ll-tap mt-2 w-full rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ background: disabled ? "rgba(255,255,255,.06)" : "var(--accent)", color: disabled ? "var(--text-muted)" : "#fff" }}>
                {busy === c.type ? (he ? "שולחת…" : "Sending…") : !c.available ? (he ? "לא זמין" : "Unavailable") : premiumBlocked ? (he ? "דורש מסלול" : "Plan required") : (he ? "צרי סרטון" : "Create")}
              </button>
            </div>
          );
        })}
      </div>

      {result ? (
        <div className="rounded-xl p-3 text-xs" role="status" style={{ background: result.ok ? "rgba(74,222,128,.08)" : "rgba(255,155,155,.08)", color: result.ok ? "#bbf7d0" : "#ff9b9b" }}>
          {result.ok
            ? result.existing
              ? (he ? "לסוג הזה כבר יש סרטון מאומת למוצר — מוצג למטה. לא נוצרה עבודה חדשה ולא נספר שימוש." : "This type already has a verified video — shown below.")
              : result.duplicate
                ? (he ? "כבר בתור — לא נוצרה עבודה כפולה." : "Already queued.")
                : (he ? `העבודה נוצרה (${result.job?.jobId}). הריצה הבאה של מנוע הרינדור בענן תיצור, תשמור, תאמת ותפרסם באתר. פרימיום נספר רק אחרי אימות.` : `Job created (${result.job?.jobId}).`)
            : creativeErrorHe(result.error)}
        </div>
      ) : null}

      {jobs.length ? (
        <div className="space-y-2">
          <div className="text-xs font-bold" style={{ color: "var(--text)" }}>{he ? "עבודות למוצר" : "Jobs for this product"}</div>
          {jobs.map((j) => {
            const st = JOB_HE[j.status] || JOB_HE.QUEUED;
            return (
              <div key={j.jobId} className="rounded-xl p-2" style={{ background: "var(--bg-subtle)" }}>
                <div className="flex flex-wrap items-center gap-1">
                  {chip((data.capabilities || []).find((c) => c.type === j.creativeType)?.he || j.creativeType, "var(--text)")}
                  {chip(st.label, st.color)}
                  {j.attempts ? chip(he ? `ניסיונות: ${j.attempts}` : `attempts: ${j.attempts}`, "var(--text-muted)") : null}
                </div>
                {j.error ? <p className="mt-1 text-[11px]" style={{ color: "#ff9b9b" }}>{j.error}</p> : null}
                {j.videoUrl ? <video src={j.videoUrl} poster={j.thumbnailUrl || undefined} muted playsInline controls preload="metadata" className="mt-2 w-full rounded-xl" style={{ aspectRatio: "9 / 16", maxHeight: 300, background: "#000" }} /> : null}
                {j.script?.beats?.length ? (
                  <details className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <summary>{he ? "התסריט שעל המסך" : "On-screen script"}</summary>
                    <ol className="mt-1 list-decimal ps-4">{j.script.beats.map((b, i) => <li key={i}>{b.beat}: {b.text}</li>)}</ol>
                    <p className="mt-1">{j.disclosure.join(" · ")}</p>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div>
        <div className="text-xs font-bold" style={{ color: "var(--text)" }}>{he ? "נתונים אמיתיים לפי סוג (מהאירועים שנרשמו)" : "Real counts by type"}</div>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-[11px]" style={{ color: "var(--text-muted)" }}>
            <thead><tr><th className="text-start">{he ? "סוג" : "Type"}</th><th>{he ? "בתור" : "Queued"}</th><th>{he ? "מוכנים" : "Ready"}</th><th>{he ? "נכשלו" : "Failed"}</th><th>{he ? "פורסמו באתר" : "On site"}</th><th>{he ? "קליקים" : "Clicks"}</th></tr></thead>
            <tbody>
              {Object.entries(analytics).map(([t, r]) => (
                <tr key={t}><td>{(data.capabilities || []).find((c) => c.type === t)?.he || t}</td><td className="text-center">{r.queued}</td><td className="text-center">{r.completed}</td><td className="text-center">{r.failed}</td><td className="text-center">{r.published}</td><td className="text-center">{r.clicks}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(data.providers || []).map((p) => <React.Fragment key={p.id}>{chip(`${p.he}: ${PROVIDER_HE[p.status] || p.status}`, p.status === "AVAILABLE" ? "#4ade80" : p.status === "UNVERIFIED" ? "#fcd34d" : "var(--text-muted)")}</React.Fragment>)}
      </div>
    </section>
  );
}
