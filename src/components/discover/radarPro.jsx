// /radar-pro — the radar as its own product (Master Execution Order, item 7): what it is, real live
// examples from today's board (never a made-up one), the public self-grading record, the Basic and
// Pro tiers with NO price (radarPlans.js: pending the owner's approval, not for sale), the trial
// state the owner set in the admin panel, and a waitlist for a signed-in account. Bilingual (useL).
// No claim of uniqueness, no promised hit, no promised income.
import React, { useEffect, useMemo, useState } from "react";
import { BellRing, Check, Radar, ShieldCheck } from "lucide-react";
import { getSessionToken } from "../../lib/auth.js";
import { joinWaitlist } from "../../lib/legalConsent.js";
import { RADAR_FEATURES, RADAR_PLANS } from "../../lib/growth/radarPlans.js";
import { ConceptCard, TrialBanner, loadBoard } from "./radar";
import { STUDIO_SIGNUP } from "./PublicShell";
import { Go, Spinner, useL } from "./kit";

const dm = (iso) => (typeof iso === "string" && iso.length >= 10 ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}` : "");

function Waitlist({ planId }) {
  const { L } = useL();
  const [state, setState] = useState("idle");
  async function join() {
    setState("busy");
    const token = (await getSessionToken().catch(() => null)) || "";
    if (!token) { setState("signin"); return; }
    const r = await joinWaitlist(token, planId).catch(() => ({ ok: false }));
    setState(r?.ok ? "joined" : "error");
  }
  if (state === "joined") return <p className="mt-3 font-bold" role="status"><Check size={16} aria-hidden="true" /> {L("נרשמת לרשימת ההמתנה. נעדכן במייל לפני שמשהו משתנה.", "You're on the waitlist. We'll e-mail you before anything changes.")}</p>;
  return (
    <div className="mt-3">
      <button type="button" onClick={join} disabled={state === "busy"} className="lx-btn lx-btn-ink w-full" style={{ minHeight: 48 }}>
        <BellRing size={16} aria-hidden="true" /> {L("הצטרפות לרשימת ההמתנה", "Join the waitlist")}
      </button>
      {state === "signin" ? <p className="mt-2 text-[13px]">{L("צריך חשבון כדי להירשם. ", "An account is needed to join. ")}<Go to={STUDIO_SIGNUP} className="font-bold underline">{L("פתיחת חשבון חינם", "Open a free account")}</Go></p> : null}
      {state === "error" ? <p className="mt-2 text-[13px]" role="alert">{L("לא הצלחנו לרשום כרגע. נסו שוב בעוד רגע.", "We couldn't sign you up right now. Try again in a moment.")}</p> : null}
    </div>
  );
}

export function RadarProPage() {
  const { L, lang } = useL();
  const [board, setBoard] = useState(undefined);
  useEffect(() => {
    let live = true;
    loadBoard().then((b) => { if (live) setBoard(b); });
    return () => { live = false; };
  }, []);
  const examples = useMemo(() => {
    const cs = board?.concepts || [];
    const rank = (c) => (c.window === "OPEN" ? 0 : c.stage === "EMERGING" ? 1 : c.stage === "RISING" ? 2 : 3);
    return cs.filter((c) => c.stage !== "UNVERIFIED").sort((a, b) => rank(a) - rank(b) || (b.alpha?.score ?? -1) - (a.alpha?.score ?? -1)).slice(0, 3);
  }, [board]);
  const record = board?.record;
  const hot = board?.site?.hot || [];

  return (
    <>
      <section className="lx-profile">
        <div className="lx-wrap py-10 md:py-16">
          <p className="lx-kicker mb-3"><Radar size={14} aria-hidden="true" /> {L("רדאר הטרנדים של LikeLink2", "The LikeLink2 trend radar")}</p>
          <h1 className="lx-profile-name">{L("לראות מה מתחיל לעלות, עם המספרים", "See what is starting to rise, with the numbers")}</h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-7">{L("כל יום הרדאר מודד באליאקספרס את קצב ההזמנות, מוכרים חדשים ומחיר לכ־60 סוגי מוצרים, ובודק בגוגל וביוטיוב אם בישראל כבר מחפשים אותם בעברית. כל סימון נשמר עם תאריך ונבדק אחרי 14 יום, והתוצאה מוצגת לכולם.", "Every day the radar measures order speed, new sellers and price for about 60 kinds of products on AliExpress, and checks on Google and YouTube whether Israelis already search for them in Hebrew. Every call is saved with its date and graded 14 days later, in public.")}</p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L("הרדאר לא מבטיח להיט ולא מבטיח רווח. הוא מראה סימנים מוקדמים, עם המקור והתאריך של כל מספר.", "The radar never promises a hit or a profit. It shows early signs, with each number's source and date.")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Go to="/radar" className="lx-btn lx-btn-ink" style={{ minHeight: 52 }}>{L("לרדאר של היום", "Today's radar")}</Go>
            <a href="#radar-tiers" className="lx-btn lx-btn-ghost" style={{ minHeight: 52 }}>{L("המסלולים", "The tiers")}</a>
          </div>
          <TrialBanner />
        </div>
      </section>

      <section className="lx-wrap mt-8" aria-labelledby="rp-live">
        <h2 id="rp-live" className="lx-display text-[24px] md:text-[30px]">{L("דוגמאות חיות מהלוח של היום", "Live examples from today's board")}</h2>
        {board === undefined ? <div className="mt-6"><Spinner /></div> : null}
        {board === null ? <p className="mt-3">{L("הלוח של היום עוד לא זמין. אפשר לנסות שוב בעוד כמה דקות.", "Today's board isn't available yet. Try again in a few minutes.")}</p> : null}
        {board ? (
          <>
            <p className="mt-2 text-[13px]" style={{ color: "var(--lx-muted)" }}>{L(`עודכן ${dm(board.at)} · מקור: אליאקספרס, גוגל ויוטיוב`, `Updated ${dm(board.at)} · source: AliExpress, Google and YouTube`)}</p>
            {examples.length ? <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{examples.map((c) => <ConceptCard key={c.id} c={c} />)}</ul> : <p className="mt-3">{L("היום עוד אין סוג מוצר עם כיוון מדוד. הכיוון מופיע אחרי שתי מדידות בהפרש של יומיים.", "No kind has a measured direction yet today. A direction appears after two readings two days apart.")}</p>}
            {hot.length ? <p className="mt-4 text-[14px]">{L(`בנוסף: ${hot.length} מוצרים באתר שההזמנות שלהם מאיצות השבוע, לפי AliExpress.`, `Also: ${hot.length} products on the site whose orders are speeding up this week, per AliExpress.`)}</p> : null}
            <div className="lx-card mt-4 flex items-start gap-3 p-4" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
              <ShieldCheck size={22} aria-hidden="true" style={{ flex: "0 0 22px", color: "#16a34a" }} />
              <p className="text-[14px] leading-6">{record?.graded ? L(`הדיוק עד היום: מתוך ${record.graded} סימונים שנבדקו, ${record.hits} באמת עלו (${record.accuracy}%).`, `Accuracy so far: of ${record.graded} graded calls, ${record.hits} really rose (${record.accuracy}%).`) : L(`עוד אין סימונים שעברו 14 יום. ${record?.pending ? `${record.pending} מחכים לבדיקה.` : ""} התוצאה תוצג כאן, גם אם היא לא טובה.`, `No call has passed 14 days yet. ${record?.pending ? `${record.pending} are waiting.` : ""} The result will show here, good or bad.`)}</p>
            </div>
          </>
        ) : null}
      </section>

      <section id="radar-tiers" className="lx-wrap mt-10" aria-labelledby="rp-tiers" style={{ scrollMarginTop: 80 }}>
        <h2 id="rp-tiers" className="lx-display text-[24px] md:text-[30px]">{L("המסלולים", "The tiers")}</h2>
        <p className="mt-2 text-[14px]">{L("הרדאר פתוח היום לכולם בחינם. המסלולים בהכנה: המחיר עוד לא נקבע ואין עדיין אפשרות לשלם. רשימת ההמתנה לא מחייבת בכלום.", "The radar is free and open to everyone today. The tiers are in preparation: no price is set and nothing can be paid yet. The waitlist commits you to nothing.")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Object.values(RADAR_PLANS).map((p) => (
            <article key={p.id} className="lx-card p-5" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
              <h3 className="text-[20px] font-extrabold">{p.name[lang] || p.name.he}</h3>
              <p className="text-[14px]" style={{ color: "var(--lx-muted)" }}>{p.tagline[lang] || p.tagline.he}</p>
              <p className="mt-2 font-bold">{L("מחיר: עוד לא נקבע", "Price: not set yet")}</p>
              <ul className="mt-3 grid gap-1.5 text-[14px] leading-6">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check size={16} aria-hidden="true" style={{ flex: "0 0 16px", marginTop: 4 }} /> {L(RADAR_FEATURES[f].he, RADAR_FEATURES[f].en)}</li>)}
              </ul>
              <Waitlist planId={p.id} />
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
