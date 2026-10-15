// StudioEntrance — what /studio shows before a creator signs in.
//
// One clear page, the way creator platforms explain themselves: what the
// Studio is, the three steps, a way to try pasting an affiliate link right
// now (checked in the browser, nothing saved), the sign-up form, and short
// answers. No menu of twenty tools before there is an account. While the
// cloud refuses (sign-in paused) it says so and offers the contact mail.
import React, { useState } from "react";
import { Link2, Store, Share2, Sparkles, CheckCircle2, AlertTriangle, ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { cloudStatus } from "../../lib/storage.js";
import { CLOUD_PAUSED_HE, snapshotTakenAt } from "../../lib/catalogSnapshot.js";
import { linkStatusOf, linkStatusLabel, linkErrorText, networkOf, AFFILIATE_NETWORKS, LINK_STATUS } from "../../lib/affiliateLink.js";
import { joinMailto } from "../../lib/growth/join.js";
import { landingAttribution } from "../../lib/attribution.js";
import { withBase } from "../../lib/basePath.js";
import AuthGate from "../sell/AuthGate.jsx";

const STEPS = [
  { icon: Store, he: ["פותחים חשבון", "שם, מייל וסיסמה. בחינם, בלי כרטיס אשראי."], en: ["Open an account", "Name, e-mail and password. Free, no card."] },
  { icon: Link2, he: ["מדביקים קישור שותפים", "מכל תוכנית: AliExpress, Amazon, Awin, CJ, impact.com או תוכנית של מותג. הקישור נשמר בדיוק כמו שהדבקת."], en: ["Paste an affiliate link", "From any programme. The link is kept exactly as you pasted it."] },
  { icon: Share2, he: ["משתפים קישור אחד", "החנות שלך מקבלת כתובת משלה לשים בביו. כל מוצר מסומן #פרסומת · קישור שותפים."], en: ["Share one link", "Your shop gets its own address for your bio. Every product is labelled as an affiliate ad."] },
];

const FAQ = [
  ["מאיזה תוכניות שותפים אפשר להוסיף קישור?", "מכל תוכנית: AliExpress, Amazon Associates, Awin, CJ, impact.com, Rakuten, Partnerize, ShareASale, תוכנית של מותג, או קישור מוצר רגיל. מדביקים את הקישור שקיבלת מהתוכנית, והוא נשמר כמו שהוא."],
  ["כמה זה עולה?", "פתיחת חנות בחינם. מה כלול בכל מסלול מפורט בעמוד המסלולים והמחירים."],
  ["צריך הרבה עוקבים?", "לא. מתחילים עם מוצר אחד שאת באמת ממליצה עליו, וקישור אחד בביו."],
  ["איך הקהל יודע שזה קישור שותפים?", "כל מוצר בחנות מסומן #פרסומת · קישור שותפים, וליד כל סרטון כתוב של מי הוא."],
];

function TryALink({ he }) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState(null);
  function check(e) {
    e?.preventDefault();
    const st = linkStatusOf(raw, { claimed: true });
    setResult(st.status === LINK_STATUS.INVALID ? { error: st.error } : { ...st, network: networkOf(raw) });
  }
  const tone = result?.status === LINK_STATUS.VALIDATED ? "var(--success)" : result?.status ? "var(--warning)" : "var(--danger)";
  return (
    <section id="try" className="ll-card rounded-3xl p-5 sm:p-7" aria-labelledby="try-title">
      <h2 id="try-title" className="text-lg font-extrabold" style={{ color: "var(--text)" }}>
        {he ? "נסי עכשיו: הדביקי קישור שותפים" : "Try it: paste an affiliate link"}
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        {he ? "בדיקה בדפדפן בלבד, שום דבר לא נשמר. ככה בדיוק עובד המסך „הוספת קישור” בסטודיו." : "Checked in your browser only; nothing is saved. This is how “Add a link” works in the Studio."}
      </p>
      <form onSubmit={check} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          dir="ltr"
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setResult(null); }}
          placeholder="https://s.click.aliexpress.com/e/…"
          className="input-field min-w-0 flex-1 px-3.5 py-3 text-sm"
          aria-label={he ? "קישור שותפים לבדיקה" : "Affiliate link to check"}
          inputMode="url"
        />
        <button type="submit" className="ll-tap rounded-xl px-5 py-3 text-sm font-bold text-white" style={{ background: "var(--gradient-brand)" }}>
          {he ? "בדיקה" : "Check"}
        </button>
      </form>
      {result ? (
        result.error ? (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm" style={{ color: "var(--danger)" }}>
            <AlertTriangle size={15} /> {linkErrorText(result.error, he ? "he" : "en")}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2" role="status">
            <div className="rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
              <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: tone }}>
                {result.status === LINK_STATUS.VALIDATED ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {linkStatusLabel(result.status, he ? "he" : "en")}
              </p>
              <dl className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                <div className="flex gap-1"><dt>{he ? "חנות:" : "Store:"}</dt><dd dir="ltr">{result.host}</dd></div>
                <div className="flex gap-1"><dt>{he ? "תוכנית:" : "Programme:"}</dt><dd>{result.network?.label || (he ? "לא זוהתה — אפשר לבחור ידנית" : "Not recognised — pick it by hand")}</dd></div>
              </dl>
              {result.status !== LINK_STATUS.VALIDATED ? (
                <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {he ? "לא מצאנו בקישור סימן מעקב של שותפים. אם זה הקישור שהתוכנית נתנה לך, אפשר לשמור אותו כמו שהוא." : "No affiliate tracking marker found. If your programme gave you this link, you can keep it as is."}
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
              <p className="text-[11px] font-bold" style={{ color: "var(--text-faint)" }}>{he ? "ככה זה ייראה בחנות שלך" : "How it looks in your shop"}</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl" style={{ background: "var(--bg-elevated)", color: "var(--text-faint)" }}><Store size={20} /></div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>{he ? "המוצר שלך" : "Your product"}</p>
                  <p className="truncate text-xs" dir="ltr" style={{ color: "var(--text-secondary)" }}>{result.host}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>#פרסומת · קישור שותפים</p>
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
          {he ? "התוכניות שהסטודיו מכיר: " : "Programmes the Studio knows: "}
          {AFFILIATE_NETWORKS.filter((n) => n.kind !== "manual" && n.id !== "other" && n.id !== "brand").map((n) => n.label).join(" · ")}
          {he ? " · וכל קישור אחר." : " · and any other link."}
        </p>
      )}
    </section>
  );
}

export default function StudioEntrance() {
  const { lang } = useI18n();
  const he = lang === "he";
  const { loading, marketers, onLogin, onSignup } = useMarketplace();
  const paused = !loading && (Boolean(snapshotTakenAt()) || cloudStatus().state !== "ok");
  const attr = landingAttribution();
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div dir={he ? "rtl" : "ltr"} className="mx-auto max-w-3xl space-y-5">
      <section className="ll-card rounded-3xl p-6 text-center sm:p-9">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          <Sparkles size={14} /> LikeLink2 Studio · {he ? "חינם" : "free"}
        </p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl" style={{ color: "var(--text)" }}>
          {he ? "החנות שלך, מההמלצות שלך" : "Your shop, from your recommendations"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 sm:text-base" style={{ color: "var(--text-secondary)" }}>
          {he
            ? "מדביקים קישור שותפים מכל תוכנית, ומקבלים דף חנות בעברית עם קישור אחד לשים בביו. הקונים רואים את המוצר, ולוחצים ישר לחנות."
            : "Paste an affiliate link from any programme and get a Hebrew shop page with one link for your bio. Shoppers see the product and tap straight to the store."}
        </p>
        {paused ? (
          <p role="status" className="mx-auto mt-4 max-w-xl rounded-xl px-3.5 py-3 text-xs leading-5 surface-subtle">
            {he ? CLOUD_PAUSED_HE : "Opening a Studio and signing in are back soon (short maintenance). You can still try a link below."}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => go("signup")} className="ll-tap rounded-full px-6 py-3 text-sm font-bold text-white" style={{ background: "var(--gradient-brand)" }}>
            {he ? "פתיחת חשבון / כניסה" : "Open an account / sign in"}
          </button>
          <button type="button" onClick={() => go("try")} className="ll-tap rounded-full px-6 py-3 text-sm font-bold" style={{ background: "var(--bg-subtle)", color: "var(--text)", border: "1px solid var(--border)" }}>
            {he ? "לנסות להדביק קישור" : "Try pasting a link"}
          </button>
        </div>
      </section>

      <ol className="grid gap-3 sm:grid-cols-3" aria-label={he ? "איך זה עובד" : "How it works"}>
        {STEPS.map((s, i) => {
          const [title, body] = he ? s.he : s.en;
          return (
            <li key={title} className="ll-card rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>{i + 1}</span>
                <s.icon size={17} style={{ color: "var(--accent)" }} aria-hidden="true" />
              </div>
              <h2 className="mt-3 text-sm font-extrabold" style={{ color: "var(--text)" }}>{title}</h2>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{body}</p>
            </li>
          );
        })}
      </ol>

      <TryALink he={he} />

      <section id="signup" className="ll-card rounded-3xl p-5 sm:p-7" aria-label={he ? "פתיחת חשבון" : "Open an account"}>
        <AuthGate marketers={marketers} onLogin={onLogin} onSignup={onSignup} />
        {paused ? (
          <p className="mt-4 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
            <a className="inline-flex items-center gap-1 underline" href={joinMailto({ source: attr.src, campaign: attr.camp })}>
              <Mail size={13} /> {he ? "רוצה שנעדכן אותך כשהפתיחה חוזרת? כתבי לנו" : "Want a note when sign-up is back? Write to us"}
            </a>
          </p>
        ) : null}
      </section>

      <section className="ll-card rounded-3xl p-5 sm:p-7" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-lg font-extrabold" style={{ color: "var(--text)" }}>{he ? "שאלות קצרות" : "Quick answers"}</h2>
        <div className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
          {FAQ.map(([q, a]) => (
            <details key={q} className="py-3">
              <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--text)" }}>{q}</summary>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          <a className="underline" href={withBase("/pricing")}>{he ? "מסלולים ומחירים" : "Plans & pricing"}</a>
          <a className="underline" href={withBase("/join")}>{he ? "למה לפתוח חנות" : "Why open a shop"}</a>
          <a className="inline-flex items-center gap-1 underline" href={withBase("/")}><ArrowLeft size={12} /> {he ? "חזרה לאתר" : "Back to the site"}</a>
        </p>
      </section>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
        <ShieldCheck size={13} /> {he ? "בלי דירוגים מומצאים ובלי מונים מזויפים. כל מוצר מסומן #פרסומת · קישור שותפים." : "No invented ratings or counters. Every product is labelled as an affiliate ad."}
      </p>
    </div>
  );
}
