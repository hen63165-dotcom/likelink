// The radar's dashboard page for Wix stores (src/lib/growth/wixRadar.js holds the logic). It renders
// only what sanitizeBoard kept from the public board; links open in a new tab, outside the Wix frame.
import React, { useEffect, useMemo, useState } from "react";
import { nextReadingAt } from "../lib/growth/worldPulse.js";
import {
  WIX_RADAR, KIND_LABELS, SIGNAL_LABELS, WORLD_LABELS, conceptName, freshOf, kindLabel, kindsOf, newKindsOf,
  pct, proofOf, recordOf, rowsFor, shortDay, stageLabel, untilText, verdictOf,
} from "../lib/growth/wixRadar.js";

const KINDS_KEY = "likelink:wix-radar:kinds";
const readKinds = () => {
  try { const v = JSON.parse(localStorage.getItem(KINDS_KEY) || "[]"); return Array.isArray(v) ? v.filter((k) => Object.hasOwn(KIND_LABELS, k)) : []; } catch { return []; }
};
const saveKinds = (v) => { try { localStorage.setItem(KINDS_KEY, JSON.stringify(v)); } catch { /* a private window: the choice lasts this visit */ } };

const BOOK = {
  early: { he: "קביעות מוקדמות (כל 4 האותות)", en: "Early calls (all 4 signals)" },
  stages: { he: "קביעות שלב (עולה / מתחיל לעלות)", en: "Stage calls (rising / emerging)" },
  fresh: { he: "מוצרים חדשים שהוצגו", en: "New products shown" },
  kinds: { he: "סוגים חדשים שהבינה המלאכותית מצאה", en: "New kinds the AI found" },
};

/** A signed number, kept left-to-right inside Hebrew text ("+18%", never "18%+"). */
const Num = ({ children }) => <bdi dir="ltr" className="wr-num">{children}</bdi>;

function Stage({ stage, lang }) {
  return <span className={`wr-stage wr-stage--${stage.toLowerCase()}`}>{stageLabel(stage, lang)}</span>;
}

export default function WixRadar({ board, lang }) {
  const he = lang === "he";
  const L = (h, e) => (he ? h : e);
  const [kinds, setKinds] = useState(readKinds);
  const [all, setAll] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const verdict = useMemo(() => verdictOf(board), [board]);
  const fresh = useMemo(() => freshOf(board), [board]);
  const newKinds = useMemo(() => newKindsOf(board), [board]);
  const kindList = useMemo(() => kindsOf(board), [board]);
  const { rows, total } = useMemo(() => rowsFor(board, kinds, { limit: all ? 500 : WIX_RADAR.rows }), [board, kinds, all]);
  const record = useMemo(() => recordOf(board), [board]);
  const proof = useMemo(() => proofOf(board), [board]);

  const toggle = (k) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    setKinds(next);
    saveKinds(next);
  };
  const d = (x) => shortDay(x, lang);
  const arrow = he ? "←" : "→"; // from the earlier reading to the later one, in reading order

  return (
    <main className="wr" dir={he ? "rtl" : "ltr"} lang={he ? "he" : "en"}>
      <header className="wr-head">
        <div>
          <h1>{L("רדאר הטרנדים", "Trend Radar")}</h1>
          <p className="wr-sub">{L("מה מתחיל לרוץ באליאקספרס, נמדד כל בוקר. כל קביעה נחתמת מראש ומקבלת ציון בפומבי.", "What starts to run on AliExpress, measured every morning. Every call is sealed in advance and graded in public.")}</p>
        </div>
        <div className="wr-clock">
          <div>{L(`הקריאה של ${d(verdict.day)}`, `Reading of ${d(verdict.day)}`)}</div>
          <div className="wr-muted">{L(`הקריאה הבאה בעוד ${untilText(nextReadingAt(now) - now, lang)}`, `Next reading in ${untilText(nextReadingAt(now) - now, lang)}`)}</div>
        </div>
      </header>

      <section className="wr-card">
        <h2>{L("📣 מה הרדאר קבע היום", "📣 Today's call")}</h2>
        {verdict.quiet ? (
          <p className="wr-quiet">{L("עוד שקט. הקביעה הבאה נחתמת כשכל 4 האותות מסכימים.", "All quiet today. The next call is sealed when all 4 signals agree.")}</p>
        ) : (
          <ul className="wr-list">
            {verdict.calls.map((c) => (
              <li key={c.id}><b>{conceptName(c.concept, lang)}</b> · {L(`נחתם מראש, הציון ב־${d(c.due)} בפומבי`, `sealed in advance, graded in public on ${d(c.due)}`)}</li>
            ))}
          </ul>
        )}
        {verdict.brink.length ? (
          <div className="wr-brink">
            <div className="wr-label">{L("🔥 על סף קביעה: 3 מתוך 4 אותות. הקריאה של מחר מכריעה.", "🔥 On the brink: 3 of 4 signals. Tomorrow's reading decides.")}</div>
            <ul className="wr-list">
              {verdict.brink.map((b) => (
                <li key={b.id}>{conceptName(b.concept, lang)} · {L("חסר:", "missing:")} {b.missing.map((k) => SIGNAL_LABELS[k][lang]).join(", ")}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="wr-card">
        <h2>{L("🆕 מוצרים חדשים שמתחילים לרוץ", "🆕 New products starting to run")}</h2>
        <p className="wr-muted">{L("מוצרים של השנה, עדיין קטנים, שההזמנות שלהם גדלות מהר שתי קריאות ברצף, ופחות מ־2,000 מוצרים דומים בחנות.", "This year's listings, still small, whose orders grew fast in two readings in a row, with under 2,000 similar listings in the store.")}</p>
        {fresh.length ? (
          <div className="wr-grid">
            {fresh.map((r) => (
              <article className="wr-item" key={r.id}>
                <img src={r.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                <div className="wr-item-body">
                  <div className="wr-item-title" dir="ltr">{r.title}</div>
                  <div><b><Num>{pct(r.weekPct)}</Num></b> {L("בשבוע", "a week")}</div>
                  <div className="wr-muted">{L(`${r.ordersBefore ?? "?"} ${arrow} ${r.orders} הזמנות ב־30 יום (${d(r.from)} ${arrow} ${d(r.to)})`, `${r.ordersBefore ?? "?"} ${arrow} ${r.orders} orders in 30 days (${d(r.from)} ${arrow} ${d(r.to)})`)}</div>
                  {r.similar !== null ? <div className="wr-muted">{L(`${r.similar.toLocaleString("he-IL")} מוצרים דומים בחנות`, `${r.similar.toLocaleString("en-US")} similar listings in the store`)}</div> : null}
                  {r.window ? <div className="wr-muted">{L(`⏳ סיכוי מכויל שבעוד ${r.window.h} ימים יהיו מעל ${r.window.line.toLocaleString("he-IL")} מוצרים דומים: ${r.window.p}%`, `⏳ Calibrated chance of more than ${r.window.line.toLocaleString("en-US")} similar listings in ${r.window.h} days: ${r.window.p}%`)}</div> : null}
                  <a className="wr-btn" href={r.page} target="_blank" rel="noopener noreferrer">{L("לצפייה באליאקספרס", "View on AliExpress")}</a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="wr-quiet">{L("היום שקט. מוצר חדש מופיע כאן כשהוא עובר את כל הבדיקות.", "Quiet today. A new product shows here once it passes every check.")}</p>
        )}
        {newKinds.length ? (
          <div className="wr-kinds">
            <h3>{L("🧬 סוגים חדשים שהבינה המלאכותית של הרדאר מצאה", "🧬 New kinds the radar's AI found")}</h3>
            <ul className="wr-list">
              {newKinds.map((k) => (
                <li key={k.en}><b dir="ltr">{k.en}</b> · {L(`${k.members} מוצרים חדשים, חציון `, `${k.members} new listings, median `)}<Num>{pct(k.medianWeekPct)}</Num>{L(" בשבוע", " a week")}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="wr-card">
        <h2>{L("📊 הקטגוריות שלכם", "📊 Your categories")}</h2>
        <p className="wr-muted">{L("בחרו את מה שאתם מוכרים. כל סוג נמדד כל בוקר: ההזמנות ב־30 יום, כמה מוכרים מציעים אותו, ואיפה בעולם מחפשים אותו.", "Pick what you sell. Every kind is measured each morning: its 30-day orders, how many sellers list it, and where in the world people search for it.")}</p>
        <div className="wr-chips" role="group" aria-label={L("קטגוריות", "Categories")}>
          <button type="button" className={`wr-chip${kinds.length ? "" : " is-on"}`} aria-pressed={!kinds.length} onClick={() => { setKinds([]); saveKinds([]); }}>{L("הכל", "All")}</button>
          {kindList.map(({ kind, n }) => (
            <button type="button" key={kind} className={`wr-chip${kinds.includes(kind) ? " is-on" : ""}`} aria-pressed={kinds.includes(kind)} onClick={() => toggle(kind)}>{kindLabel(kind, lang)} <span className="wr-muted">{n}</span></button>
          ))}
        </div>
        <div className="wr-table" role="table">
          <div className="wr-tr wr-th" role="row">
            <span role="columnheader">{L("סוג מוצר", "Kind")}</span>
            <span role="columnheader">{L("שלב", "Stage")}</span>
            <span role="columnheader">{L("הזמנות: שינוי בשבוע", "Orders, weekly change")}</span>
            <span role="columnheader">{L("מוכרים: שינוי בשבוע", "Sellers, weekly change")}</span>
            <span role="columnheader">{L("בעולם", "Abroad")}</span>
          </div>
          {rows.map((r) => (
            <div className="wr-tr" role="row" key={r.id}>
              <span role="cell"><b>{conceptName(r, lang)}</b><span className="wr-muted wr-kind">{kindLabel(r.kind, lang)}</span></span>
              <span role="cell"><Stage stage={r.stage} lang={lang} /></span>
              <span role="cell">{r.ordersWeekPct !== null ? <Num>{pct(r.ordersWeekPct)}</Num> : "·"}</span>
              <span role="cell">{r.sellersWeekPct !== null ? <Num>{pct(r.sellersWeekPct)}</Num> : "·"}</span>
              <span role="cell" className="wr-muted">{r.world ? WORLD_LABELS[r.world][lang] : "·"}</span>
            </div>
          ))}
        </div>
        {total > rows.length ? <button type="button" className="wr-link" onClick={() => setAll(true)}>{L(`להצגת כל ${total}`, `Show all ${total}`)}</button> : null}
      </section>

      <section className="wr-card">
        <h2>{L("🧾 הרקורד הציבורי", "🧾 The public record")}</h2>
        <ul className="wr-list">
          {record.books.map((b) => (
            <li key={b.id}>{BOOK[b.id][lang]}: {L(`${b.calls} קביעות · ${b.graded} קיבלו ציון · ${b.hits} פגעו`, `${b.calls} calls · ${b.graded} graded · ${b.hits} hits`)}{b.accuracy !== null ? ` · ${b.accuracy}%` : ""}</li>
          ))}
        </ul>
        {record.graded === 0 ? <p className="wr-muted">{record.nextDue ? L(`הציונים הראשונים ב־${d(record.nextDue)}.`, `First grades on ${d(record.nextDue)}.`) : L("הציון הראשון מגיע 14 יום אחרי הקביעה הראשונה.", "The first grade comes 14 days after the first call.")}</p> : null}
        {proof.root ? (
          <div className="wr-seal">
            <div className="wr-label">{L(`🔏 החתימה של ${d(proof.root.d)}`, `🔏 The seal of ${d(proof.root.d)}`)}</div>
            <p className="wr-muted">{L("כל הקביעות של היום, גם הטעויות, בטביעת SHA-256 אחת שנשלחה ל־OpenTimestamps ונכנסת לבלוקצ׳יין של ביטקוין.", "Every call of the day, misses included, in one SHA-256 fingerprint sent to OpenTimestamps and anchored in Bitcoin.")}</p>
            <code dir="ltr">{proof.root.sha256}</code>
            <p className="wr-muted">{proof.anchored ? L(`⛓️ ${d(proof.anchored.d)} בתוך בלוק ${proof.anchored.height} של ביטקוין`, `⛓️ ${d(proof.anchored.d)} is inside Bitcoin block ${proof.anchored.height}`) : L("⛓️ ממתין לאישור בביטקוין (כמה שעות)", "⛓️ Waiting for Bitcoin to confirm (a few hours)")}</p>
          </div>
        ) : null}
        <a className="wr-btn wr-btn--ghost" href={`${WIX_RADAR.radarUrl}#ledger`} target="_blank" rel="noopener noreferrer">{L("לבדיקה בעצמכם", "Check it yourself")}</a>
      </section>

      <footer className="wr-foot">
        <span>{L("מדידה בלבד: כל מספר עם התאריך שלו. מקורות: ה־API הרשמי של אליאקספרס והחיפושים הציבוריים של גוגל ויוטיוב.", "Measured only: every number carries its date. Sources: AliExpress's official API and Google's and YouTube's public searches.")}</span>
        <a href={WIX_RADAR.radarUrl} target="_blank" rel="noopener noreferrer">{L("לרדאר המלא ←", "Open the full radar →")}</a>
      </footer>
    </main>
  );
}
