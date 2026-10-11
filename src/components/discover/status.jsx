// /status — what LikeLink checked in its catalog, when, and what is still
// missing, from the record the skills write at every build (/ops/skills.json,
// scripts/skills/run.mjs), plus what every label on the site means. Public-safe:
// product ids, states and reasons only — no environment names, no private data.
import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { withBase } from "../../lib/basePath.js";
import { Go, useL } from "./kit";
import { productPath } from "../../lib/acquisition.js";

const SKILL_HE = {
  "product-integrity": "תקינות מוצר",
  "link-health": "קישורי רכישה",
  "price-freshness": "עדכניות מחיר",
  "media-matching": "התאמת תמונות וסרטונים למוצר",
  "discovery-ranking": "סדר המוצרים",
  "content-production": "טקסטים ותסריטים לסרטונים",
};
const STATUS_HE = { ok: "תקין", warn: "יש מה להשלים", failed: "נכשל", blocked: "חסום", skipped: "לא רץ" };
const NEED_HE = {
  aliexpress_api_connection: "חיבור לממשק הרשמי של AliExpress (בעלת האתר מוסיפה את המפתחות)",
  reels_feed_unreachable: "פיד הסרטונים לא נקרא בזמן הבנייה",
};
const VERDICT_HE = { MATCHED: "מתאים", REJECTED: "נפסל", UNCERTAIN: "לא נבדק עדיין", LABELLED_SYNTHETIC: "אנימציה מסומנת" };
const KIND_HE = { seller_video: "סרטון המוכר", own_footage: "צילום שלנו", luna_animation: "סרטון של לונה (AI)", clean_frame: "תמונה מתוך סרטון" };

/** What each label on the site means, and when it appears. */
export const LABELS = [
  ["סרטון המוכר · בעריכת LikeLink2", "הסרטון של המוכר מעמוד המוצר, שערכנו. לא צילום שלנו ולא UGC. מופיע רק אחרי שאדם בדק שהמוצר הוא נושא הסרטון."],
  ["מתוך סרטון המוכר", "תמונה שנחתכה מסרטון המוכר שנבדק, במקום תמונת חנות עם באנרים."],
  ["לונה מסבירה · דמות וקול AI", "אנימציה שיצרנו: הדמות והקול מלאכותיים, תמונת המוצר אמיתית."],
  ["אנימציה ממוחשבת (לא צילום)", "מופיע על כל סרטון שלא צולם במצלמה."],
  ["צילום אמיתי · UGC", "רק סרטון שאדם צילם בעצמו עם המוצר, והועלה עבור המוצר הזה."],
  ["בחירה של …", "היוצר/ת בחר/ה את המוצר. זה לא אומר שהוא/היא מופיע/ה בסרטון."],
  ["המחיר המעודכן בחנות", "אין לנו מחיר שנבדק מול החנות; המחיר הקובע מופיע בחנות עצמה."],
  ["נבדק מול החנות ב־…", "מחיר שנקרא מהממשק הרשמי של החנות, עם תאריך הבדיקה."],
  ["#פרסומת · קישור שותפים", "קנייה דרך הקישור עשויה להעניק עמלה. המחיר שלך לא משתנה."],
  ["ייחוס יוצר/ת נבדק", "נבדק שהמוצר שייך לחנות של מי שהוסיף/ה אותו."],
  ["יוצר/ת מאומת/ת", "מופיע רק כשהרשומה של היוצר/ת סומנה כמאומתת. כרגע אין כזו."],
];

function Chip({ status }) {
  const tone = status === "ok" ? "lx-badge-mint" : status === "warn" ? "lx-badge-amber" : "lx-badge-line";
  return <span className={`lx-badge ${tone}`}>{STATUS_HE[status] || status}</span>;
}

export function StatusPage({ graph }) {
  const { L } = useL();
  const [state, setState] = useState({ phase: "loading", doc: null, version: null });
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(withBase("/ops/skills.json"), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(withBase("/version.json"), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([doc, version]) => { if (alive) setState({ phase: doc?.stages ? "ready" : "missing", doc, version }); });
    return () => { alive = false; };
  }, []);
  const { phase, doc, version } = state;
  const stage = (name) => doc?.stages?.find((s) => s.skill === name);
  const title = (id) => graph.byId.get(id)?.displayTitle || id;
  const when = doc?.finishedAt ? new Date(doc.finishedAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "";

  return (
    <div className="lx-wrap pb-10 pt-8 md:pt-12">
      <p className="lx-kicker"><ShieldCheck size={14} /> {L("שקיפות", "Transparency")}</p>
      <h1 className="lx-display mt-2 text-[32px] leading-tight md:text-[44px]">{L("מה נבדק, מתי, ומה עוד חסר.", "What was checked, when, and what is missing.")}</h1>
      <p className="lx-mute mt-3 max-w-[62ch] text-[14.5px] leading-7">
        {L("בכל בנייה של האתר רצות בדיקות אוטומטיות על הקטלוג: קישורי רכישה, מחירים, והתאמה בין כל תמונה וסרטון למוצר שהם מציגים. מה שלא הוכח לא מוצג כעובדה.", "Every build runs automatic checks on the catalog: purchase links, prices, and whether each image and video shows the product it names. What is not proven is not shown as fact.")}
      </p>

      {phase === "loading" ? <p className="lx-mute mt-8" role="status">{L("טוען את הדוח…", "Loading the report…")}</p> : null}
      {phase === "missing" ? <p className="mt-8 rounded-xl border p-4 text-[14px]" style={{ borderColor: "var(--lx-line)" }} role="status">{L("הדוח לא זמין בבנייה הזאת.", "The report is not available in this build.")}</p> : null}

      {phase === "ready" ? (
        <>
          <p className="lx-mute mt-5 text-[13px]">
            {L(`נבדק ב־${when}`, `Checked ${when}`)}
            {version?.commit ? ` · ${L("גרסה", "build")} ${version.commit.slice(0, 7)}` : ""}
            {doc.snapshotTakenAt ? ` · ${L("עותק הקטלוג מ־", "catalog copy from ")}${new Date(doc.snapshotTakenAt).toLocaleDateString("he-IL")}` : ""}
          </p>

          <section className="mt-6" aria-labelledby="h-checks">
            <h2 id="h-checks" className="text-[20px] font-bold">{L("הבדיקות", "The checks")}</h2>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {doc.stages.map((s) => (
                <li key={s.skill} className="lx-card flex flex-col gap-1.5 p-4" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
                  <div className="flex items-center justify-between gap-2"><b className="text-[15px]">{SKILL_HE[s.skill] || s.skill}</b><Chip status={s.status} /></div>
                  <span className="lx-mute text-[13px]">{L(`${s.processed ?? 0} נבדקו · ${s.errorCount ?? 0} לטיפול`, `${s.processed ?? 0} checked · ${s.errorCount ?? 0} to fix`)}</span>
                  {s.blockedBy ? <span className="text-[13px]">{L("חסר: ", "Needs: ")}{NEED_HE[s.blockedBy] || s.blockedBy}</span> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-9" aria-labelledby="h-media">
            <h2 id="h-media" className="text-[20px] font-bold">{L("כל תמונה וסרטון, והמוצר שלהם", "Every image and video, and its product")}</h2>
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--lx-line)" }}>
              {(stage("media-matching")?.output?.items || []).map((m) => (
                <li key={`${m.media}-${m.productId}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-[14px]">
                  <span className="min-w-0"><Go to={productPath(m.productId)} className="font-semibold hover:underline">{title(m.productId)}</Go> <span className="lx-mute">· {KIND_HE[m.kind] || m.kind}</span></span>
                  <span><b>{VERDICT_HE[m.verdict] || m.verdict}</b> <span className="lx-mute">— {m.he}</span></span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-9 grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-[20px] font-bold">{L("מחירים", "Prices")}</h2>
              <ul className="mt-3 space-y-2 text-[14px]">
                {(stage("price-freshness")?.output?.prices || []).map((p) => <li key={p.id}><b>{title(p.id)}</b> <span className="lx-mute">— {p.he}</span></li>)}
              </ul>
            </div>
            <div>
              <h2 className="text-[20px] font-bold">{L("קישורי רכישה", "Purchase links")}</h2>
              <ul className="mt-3 space-y-2 text-[14px]">
                {(stage("link-health")?.output?.links || []).map((l) => <li key={l.id}><b>{title(l.id)}</b> <span className="lx-mute">— {l.host} · {l.state === "FORMAT_OK" ? L("קישור משלו לחנות", "its own store link") : l.state === "SHARED" ? L("משותף לכמה מוצרים: לא מקודם", "shared by several products: not promoted") : L("לא תקין", "invalid")}</span></li>)}
              </ul>
              <p className="lx-mute mt-3 text-[12.5px] leading-6">{L("הבדיקה לא פותחת את הקישורים עצמם: פתיחה הייתה נספרת כקליק, והחנות עלולה לענות ב־CAPTCHA שאנחנו לא עוקפים.", "The check does not open the links: that would count as a click, and the store may answer with a CAPTCHA, which we never work around.")}</p>
            </div>
          </section>
        </>
      ) : null}

      <section className="mt-10" aria-labelledby="h-labels">
        <h2 id="h-labels" className="text-[20px] font-bold">{L("מה כל תווית באתר אומרת", "What every label on the site means")}</h2>
        <dl className="mt-3 grid gap-3 md:grid-cols-2">
          {LABELS.map(([label, meaning]) => (
            <div key={label} className="rounded-xl border p-4" style={{ borderColor: "var(--lx-line)" }}>
              <dt className="text-[14px] font-bold">{label}</dt>
              <dd className="lx-mute mt-1 text-[13.5px] leading-6">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
