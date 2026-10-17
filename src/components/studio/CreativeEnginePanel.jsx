// Studio · Creative Engine: one product's whole video pipeline, from real evidence.
// Pick a product → the orchestrator (src/lib/creative/orchestrator.js) runs on
// the catalog record, the engine's job ledger and the site's reels feed (both
// read from GitHub Pages) and this studio's recorded clicks. Every status shown
// is the orchestrator's; nothing here marks anything done. Every button does a
// real thing: refresh the evidence, copy the caption, open the product page,
// download the MP4. Rendering itself runs on GitHub Actions (daily 04:20 UTC).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/index.jsx";
import { useMarketplace } from "../../context/MarketplaceContext.jsx";
import { orchestrate, STATUS, AVAILABILITY, STAGE_HE } from "../../lib/creative/orchestrator.js";
import { loadCreativeEvidence, feedVideoUrl } from "../../lib/creative/studioClient.js";
import { SELLER_REVIEWED } from "../../lib/reelsFeed.js";
import { withBase } from "../../lib/basePath.js";

const box = { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16 };
const STATUS_HE = {
  COMPLETED: ["הושלם", "#34d399"],
  PENDING: ["ממתין", "#fbbf24"],
  BLOCKED: ["חסום", "#f87171"],
  FAILED: ["נכשל", "#f87171"],
  SKIPPED: ["עוד לא", "#94a3b8"],
  INSUFFICIENT_DATA: ["אין מספיק נתונים", "#60a5fa"],
};
const AVAIL_HE = {
  AVAILABLE: ["זמין", "#34d399"],
  DELEGATED: ["רץ במנוע אחר", "#60a5fa"],
  UNAVAILABLE: ["לא זמין", "#94a3b8"],
  PAID_LOCKED: ["בתשלום · נעול בשרת", "#f87171"],
};
const SCENE_HE = { opening: "פתיחה", closeup: "תקריב", detail: "פרט", end: "סיום" };
// The orchestrator's validation checks, in the creator's words (unknown names show as they are).
const CHECK_HE = {
  own_https_affiliate_link: "קישור שותפים משלך (https)",
  title: "שם מוצר",
  price_has_source: "מחיר עם מקור",
  disclosure_on_every_frame: "גילוי על כל פריים",
  whose_media_named: "כתוב של מי הצילום",
  every_scene_has_an_available_method: "לכל סצנה יש שיטה זמינה",
  zero_paid_credits: "בלי קרדיטים בתשלום",
  file_exists: "הקובץ קיים",
  fingerprint_recorded: "טביעת אצבע נשמרה",
  made_from_this_plan: "נוצר מהתוכנית הזו",
  qc_ran: "בדיקת האיכות רצה",
  qc_passed: "בדיקת האיכות עברה",
  byte_proof: "הקובץ באתר זהה לשמור",
  still_in_site_feed: "עדיין בפיד האתר",
  disclosure_label_in_feed: "תווית גילוי בפיד",
  measured_events: "נמדדו אירועים אמיתיים",
};
const FALLBACK_HE = { luna_tip: "סרטון טיפ של לונה (דמות AI מקורית, מסומנת)" };

function Chip({ label, color }) {
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>{label}</span>;
}

function StageOutput({ stage, methodName, reasonOf }) {
  const o = stage.output;
  if (!o) return null;
  switch (stage.id) {
    case "ProductFacts":
      return <p className="text-[12.5px] text-muted">{o.title} · {o.price ? `מ־₪${o.price.value} (${o.price.source || "ללא מקור"})` : "בלי מחיר מאושר"} · {o.checkedPhotos} תמונות שנבדקו בעין</p>;
    case "ContentStrategy":
      return (
        <div className="flex flex-col gap-1.5 text-[12.5px]">
          <p><b>פתיחה:</b> {o.opening}</p>
          <p><b>שם בסוף:</b> {o.name}</p>
          <p className="text-muted">תוויות על כל פריים: {o.labels.join(" · ")}</p>
          <div className="mt-1 grid gap-1">
            {o.scenes.map((s) => (
              <p key={s.scene} className="text-[12px]">
                <b>{SCENE_HE[s.scene] || s.scene}:</b> {methodName(s.chosen)}
                {s.rejected.length ? <span className="text-muted"> (לא: {s.rejected.map((r) => `${methodName(r.id)} — ${reasonOf(r)}`).join("; ")})</span> : null}
              </p>
            ))}
          </div>
        </div>
      );
    case "CreativeGeneration":
      return <p className="text-[12.5px] text-muted">{o.file} · {(o.bytes / 1e6).toFixed(1)}MB · {o.seconds} שניות · טביעת אצבע {String(o.sha256 || "").slice(0, 12)}…</p>;
    case "QualityControl":
      return <p className="text-[12.5px] text-muted">{o.width}×{o.height} · {o.seconds} שניות · {o.checks.filter((c) => c.pass).length}/{o.checks.length} בדיקות עברו</p>;
    case "ProductPublishing":
      return <p className="text-[12.5px] text-muted">בעמוד <bdi>{o.page}</bdi> · <bdi>{(o.bytes / 1e6).toFixed(1)}MB</bdi> זהים לקובץ השמור · נבדק {o.checkedAt ? new Date(o.checkedAt).toLocaleString("he-IL") : ""}</p>;
    case "PerformanceFeedback":
      return <p className="text-[12.5px] text-muted">קליקים מהסרטון: {o.clicks} · צפיות: {o.views} · מסקנה רק מ־{o.minEvidence} אירועים</p>;
    default:
      return null;
  }
}

export default function CreativeEnginePanel() {
  const { products, currentMarketer, clicks } = useMarketplace();
  const mine = useMemo(() => (products || []).filter((p) => p && p.marketerId === currentMarketer?.id && p.status === "approved"), [products, currentMarketer]);
  const [productId, setProductId] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setMsg("");
    const e = await loadCreativeEvidence();
    setEvidence(e);
    setBusy(false);
    if (e.errors.ledger || e.errors.feed) setMsg(`לא כל הנתונים נקראו: ${[e.errors.ledger ? "יומן המשימות" : "", e.errors.feed ? "פיד הסרטונים" : ""].filter(Boolean).join(", ")}. השלבים שתלויים בהם מסומנים "ממתין".`);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!productId && mine[0]) setProductId(mine[0].id); }, [mine, productId]);

  const product = mine.find((p) => p.id === productId) || null;
  const result = useMemo(() => (product && evidence
    ? orchestrate(product, { products, sellerVideos: new Set(Object.keys(SELLER_REVIEWED)), ledger: evidence.ledger, feed: evidence.feed, events: clicks || [] })
    : null), [product, evidence, products, clicks]);
  const methodName = useCallback((id) => result?.availability.find((m) => m.id === id)?.he || id, [result]);
  const reasonOf = useCallback((r) => result?.availability.find((m) => m.id === r.id)?.blocker?.he || r.reason, [result]);

  async function copyCaption() {
    const caption = result?.stages.find((s) => s.id === "ContentStrategy")?.output?.caption;
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setMsg("הכיתוב הועתק.");
    } catch {
      setMsg("ההעתקה לא הצליחה בדפדפן הזה — אפשר לסמן את הכיתוב ולהעתיק ידנית.");
    }
  }

  if (!mine.length) {
    return <section className="p-4 text-[13px]" dir="rtl" style={box}>עוד אין מוצרים מאושרים בחנות שלך. אחרי שמוסיפים מוצר, המנוע מכין לו סרטון.</section>;
  }
  const caption = result?.stages.find((s) => s.id === "ContentStrategy")?.output?.caption || "";
  const videoUrl = result?.video ? feedVideoUrl(result.video.url) : "";

  return (
    <section className="mb-6 flex flex-col gap-3 p-4" dir="rtl" style={box} aria-labelledby="ce-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="ce-h" className="text-[17px] font-extrabold">מנוע הסרטונים · בלי קרדיטים בתשלום</h2>
          <p className="text-[12px] text-muted">כל מוצר עובר 6 שלבים. "הושלם" רק כשיש תוצר אמיתי שעבר בדיקה. הרינדור רץ אוטומטית כל יום ב־04:20 UTC.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-lg px-2 py-2 text-[13px]" style={{ background: "var(--bg-subtle)", color: "var(--text)" }} aria-label="בחירת מוצר">
            {mine.map((p) => <option key={p.id} value={p.id}>{String(p.title || p.id).slice(0, 48)}</option>)}
          </select>
          <div className="w-28"><Button variant="secondary" disabled={busy} onClick={refresh}>{busy ? "קוראת…" : "רענון"}</Button></div>
        </div>
      </div>
      {msg ? <p className="text-[13px] font-semibold" role="status">{msg}</p> : null}
      {!result ? <p className="text-[13px] text-muted">טוענת את הנתונים…</p> : (
        <>
          <p className="text-[13px]"><b>{result.completed}/{result.of}</b> שלבים הושלמו · מצב: אפס קרדיטים בתשלום</p>
          {videoUrl ? (
            <div className="flex flex-wrap items-start gap-3" style={box}>
              <video src={videoUrl} controls muted playsInline preload="metadata" className="w-[180px] rounded-xl" style={{ aspectRatio: "9 / 16", background: "#000" }} aria-label="הסרטון שבעמוד המוצר" />
              <div className="flex min-w-[200px] flex-1 flex-col gap-2 p-3 text-[12.5px]">
                <p className="text-muted">{(result.video.labels || []).join(" · ")}</p>
                <a className="font-bold underline" href={withBase(`/p/${result.productId}`)} target="_blank" rel="noopener noreferrer">לעמוד המוצר באתר</a>
                <a className="font-bold underline" href={videoUrl} download>הורדת הסרטון (MP4)</a>
              </div>
            </div>
          ) : null}
          <ol className="flex list-none flex-col gap-2 p-0">
            {result.stages.map((s, i) => {
              const [label, color] = STATUS_HE[s.status] || [s.status, "#94a3b8"];
              return (
                <li key={s.id} className="flex flex-col gap-1.5 p-3" style={box}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-muted">{i + 1}.</span>
                    <b className="text-[14px]">{STAGE_HE[s.id]}</b>
                    <Chip label={label} color={color} />
                  </div>
                  {s.blocker && s.status !== STATUS.COMPLETED ? <p className="text-[12.5px]">{s.blocker.he}</p> : null}
                  {s.fallback ? <p className="text-[12px] text-muted">חלופה: {FALLBACK_HE[s.fallback.template] || s.fallback.template} · רץ ב־{s.fallback.executor}</p> : null}
                  <StageOutput stage={s} methodName={methodName} reasonOf={reasonOf} />
                  {s.validation?.checks?.length ? (
                    <p className="text-[11.5px] text-muted">{s.validation.checks.map((c) => `${c.pass ? "✓" : "✗"} ${CHECK_HE[c.name] || c.name}`).join(" · ")}</p>
                  ) : null}
                  {s.id === "ContentStrategy" && caption ? <div className="w-full sm:w-64"><Button onClick={copyCaption}>העתקת הכיתוב לפוסט</Button></div> : null}
                </li>
              );
            })}
          </ol>
          <details className="p-3" style={box}>
            <summary className="cursor-pointer text-[13px] font-bold">שיטות הייצור ומה זמין עכשיו</summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {result.availability.map((m) => {
                const [label, color] = AVAIL_HE[m.state] || [m.state, "#94a3b8"];
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <Chip label={label} color={color} /> <span>{m.he}</span>
                    {m.state !== AVAILABILITY.AVAILABLE ? <span className="text-muted">— {m.blocker?.he || m.note || ""}</span> : null}
                  </li>
                );
              })}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
