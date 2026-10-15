// /join — where the creator-recruitment posts land (src/lib/growth/recruit.js).
// What a creator gets is read from plans.js (live features only); the example
// is a real post from the site; nothing here promises income, followers or a
// number of users. While Studio sign-up is paused (the cloud refuses), the
// button is a mail to the site's public contact address with where the visit
// came from, so the owner can answer every creator by hand.
import React from "react";
import { Check, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useMarketplace } from "../../context/MarketplaceContext";
import { cloudStatus } from "../../lib/storage.js";
import { CLOUD_PAUSED_HE, snapshotTakenAt } from "../../lib/catalogSnapshot.js";
import { landingAttribution } from "../../lib/attribution.js";
import { creatorPath } from "../../lib/acquisition.js";
import { withBase } from "../../lib/basePath.js";
import { FOOTAGE_RANK } from "../../lib/homeShowcase.js";
import { freePlanFeatures, joinMailto, JOIN_PATH } from "../../lib/growth/join.js";
import { Go, ReelCard, ShareButton, useL } from "./kit";

const HONEST = [
  ["כל סרטון מסומן", "צילום שלך, סרטון של המוכר או אנימציה: הקהל רואה מה הוא רואה."],
  ["#פרסומת אוטומטי", "כל קישור קנייה מסומן כקישור שותפים, כמו שהחוק מבקש."],
  ["בלי מספרים מומצאים", "אין דירוגים או מונים שלא נמדדו באמת."],
];

const STEPS = [
  "מדביקה קישור למוצר שאת ממליצה עליו",
  "מקבלת דף מוצר, קישור עם מעקב וטקסט מוכן לכל רשת",
  "שמה קישור אחד בביו, והעוקבות קונות מהפוסטים שלך",
];

export function JoinPage({ graph }) {
  const { L, lang } = useL();
  const he = lang === "he";
  const { loading } = useMarketplace();
  const paused = !loading && (Boolean(snapshotTakenAt()) || cloudStatus().state !== "ok");
  const attr = landingAttribution();
  const mail = joinMailto({ source: attr.src, campaign: attr.camp });
  const features = freePlanFeatures();
  // Real footage first (as on a creator page), and only a post whose product is listed.
  const example = graph.reels
    .filter((r) => graph.byId.get(r.productIds?.[0]))
    .sort((a, b) => (FOOTAGE_RANK[b.style] || 0) - (FOOTAGE_RANK[a.style] || 0))[0];
  const creator = graph.creators.find((c) => c.slug && c.productIds?.length);

  const cta = paused ? (
    <a href={mail} className="lx-btn lx-btn-ink" data-tip={L("נפתח מייל מוכן אלינו; עונות לכל אחת", "Opens a ready e-mail to us; we answer each one")}>
      <Mail size={16} aria-hidden="true" /> {L("רוצה דף? כתבי לנו", "Want a page? Write to us")}
    </a>
  ) : (
    <Go to="/studio" className="lx-btn lx-btn-ink">{L("פתיחת דף חינם", "Open a free page")}</Go>
  );

  return (
    <>
      <section className="lx-profile">
        <div className="lx-wrap py-10 md:py-16">
          <p className="lx-kicker mb-3"><Sparkles size={14} aria-hidden="true" /> {L("ליוצרות וליוצרים", "For creators")}</p>
          <h1 className="lx-profile-name">{L("הקישור בביו שלך, כחנות קטנה בעברית", "Your link in bio, as a small shop")}</h1>
          <p className="lx-profile-bio" style={{ fontSize: 16 }}>
            {L("ב־LikeLink2 כל מה שאת ממליצה עליו נכנס לדף אחד: פוסטים עם סרטון, וכל מוצר עם קישור ישיר לחנות. בעברית, ומתחילים בחינם.", "On LikeLink2 everything you recommend lives on one page: video posts, each product with a direct store link. In Hebrew, and free to start.")}
          </p>
          {paused ? <p role="status" className="lx-profile-facts" style={{ maxWidth: "52ch" }}>{he ? CLOUD_PAUSED_HE : "Opening a Studio is back soon. Write to us and we will open your page with you."}</p> : null}
          <div className="lx-profile-actions mt-6">
            {cta}
            <ShareButton path={JOIN_PATH} title={L("דף יוצרת ב־LikeLink2", "A creator page on LikeLink2")} variant="button" />
          </div>
        </div>
      </section>

      <section className="lx-wrap mt-12 md:mt-16" aria-labelledby="join-how">
        <h2 id="join-how" className="lx-display text-[28px] md:text-[38px]">{L("איך זה עובד", "How it works")}</h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s} className="lx-card flex items-start gap-3 p-5" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
              <span className="lx-chip shrink-0 font-extrabold" aria-hidden="true">{i + 1}</span>
              <span className="text-[15px] font-bold leading-7">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      {example ? (
        <section className="lx-wrap mt-12 md:mt-16" aria-labelledby="join-example">
          <h2 id="join-example" className="lx-display text-[28px] md:text-[38px]">{L("כך נראה פוסט בדף", "What a post looks like")}</h2>
          <p className="lx-mute mt-2 max-w-2xl text-[15px] leading-7">{L("פוסט אמיתי מהאתר: הסרטון למעלה, ומתחתיו מי בחרה, של מי הסרטון והמוצר עם הקישור לחנות.", "A real post from the site: the video, and under it who picked it, whose video it is, and the product with its store link.")}</p>
          <div className="mt-5 max-w-[340px]">
            <ReelCard reel={example} graph={graph} shoppable ratio="4 / 5" attribution={{ src: "likelink_join", camp: example.id }} />
          </div>
          {creator ? <Go to={creatorPath(creator.slug)} className="lx-btn lx-btn-ghost mt-4">{L("לדף יוצרת לדוגמה", "See a creator page")}</Go> : null}
        </section>
      ) : null}

      <section className="lx-wrap mt-12 md:mt-16" aria-labelledby="join-free">
        <h2 id="join-free" className="lx-display text-[28px] md:text-[38px]">{L("מה כלול בחינם", "What's free")}</h2>
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {features.map((f) => (
            <li key={f.id} className="flex items-start gap-3 text-[15px] leading-7">
              <Check size={18} className="mt-1 shrink-0" aria-hidden="true" />
              <span>{f.he}{f.note ? <span className="lx-mute"> · {f.note}</span> : null}</span>
            </li>
          ))}
        </ul>
        <a href={withBase("/pricing")} className="lx-mute mt-4 inline-block text-[13px] underline">{L("כל המסלולים והמחירים", "All plans and prices")}</a>
      </section>

      <section className="lx-wrap mt-12 md:mt-16" aria-labelledby="join-honest">
        <h2 id="join-honest" className="lx-display text-[28px] md:text-[38px]">{L("למה הקהל שלך יסמוך על הדף", "Why your audience can trust it")}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {HONEST.map(([t, b]) => (
            <div key={t} className="lx-card p-5" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
              <p className="flex items-center gap-2 text-[16px] font-extrabold"><ShieldCheck size={18} aria-hidden="true" /> {t}</p>
              <p className="lx-mute mt-2 text-[14.5px] leading-7">{b}</p>
            </div>
          ))}
        </div>
        <p className="lx-mute mt-4 text-[13px]"><Go to="/status" className="underline">{L("מה כל תווית באתר אומרת", "What every label on the site means")}</Go></p>
      </section>

      <section className="lx-wrap mt-12 mb-4 md:mt-16">
        <div className="lx-profile rounded-[28px] p-6 md:p-10">
          <h2 className="lx-profile-name" style={{ fontSize: "clamp(26px, 5vw, 40px)" }}>{L("רוצה דף כזה?", "Want a page like this?")}</h2>
          <p className="lx-profile-bio">{paused ? L("כתבי לנו מה את ממליצה ואיפה את מפרסמת, ונחזור אלייך כשהפתיחה חוזרת. המייל משמש רק כדי לענות לך.", "Tell us what you recommend and where you post; we will get back to you when opening is back. Your e-mail is used only to answer you.") : L("פותחים בדקה, בלי כרטיס אשראי.", "Open in a minute, no credit card.")}</p>
          <div className="lx-profile-actions mt-5">{cta}</div>
        </div>
      </section>
    </>
  );
}
