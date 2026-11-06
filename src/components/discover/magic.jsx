// /magic — "כפתור הקסם" (src/lib/growth/magic.js; the server: api/_utils/magicHandler.mjs).
// One tap: paste an AliExpress link seen on TikTok, Instagram or in the app, and
// get the store's own price now, what to check before buying, a plain warning
// when the name carries a brand, and the buy button. A link from a creator stays
// hers. Nothing is stored; a check made here is one funnel step (magic_check)
// and the store button one exit (med "magic") in the owner's numbers.
import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ClipboardPaste, ExternalLink, Info, Octagon, Search, Smartphone, Sparkles } from "lucide-react";
import { MAGIC_FAQ, MAGIC_PATH, RECENT_KEY, addRecent, catalogMatch, firstLink, isStoreLink, shekel } from "../../lib/growth/magic.js";
import { trackFunnel, BOT_UA } from "../../lib/funnel.js";
import { landingAttribution } from "../../lib/attribution.js";
import { storage } from "../../lib/storage.js";
import { Go, Img, ProductCard, ShareButton, Spinner, useL } from "./kit";

const STEPS = [
  ["באפליקציה של אליאקספרס, בטיקטוק או באינסטגרם: „שיתוף” ← „העתקת קישור”", "In AliExpress, TikTok or Instagram: Share → Copy link"],
  ["כאן: לוחצים על כפתור הקסם", "Here: tap the magic button"],
  ["מקבלים מה לבדוק, את המחיר בחנות עכשיו וכפתור לחנות", "Get what to check, the store's price now and a store button"],
];

const ERRORS = {
  no_link: ["לא מצאנו קישור במה שהודבק. מעתיקים מהאפליקציה „שיתוף” ← „העתקת קישור” ומדביקים כאן.", "No link in what was pasted. In the app: Share → Copy link, then paste here."],
  not_aliexpress: ["כרגע כפתור הקסם עובד עם קישורים של אליאקספרס.", "For now the magic button works with AliExpress links."],
  no_item: ["לא הצלחנו לזהות לאיזה מוצר הקישור מוביל. נסי להעתיק אותו שוב מעמוד המוצר עצמו.", "We couldn't tell which product the link opens. Copy it again from the product page itself."],
  store_not_returned: ["החנות לא החזירה את המוצר הזה. אולי הקישור ישן, או שהמוצר לא נשלח לישראל.", "The store didn't return this product. The link may be old, or it doesn't ship to Israel."],
  rate_limited: ["הרבה בדיקות ברצף. נסי שוב בעוד דקה.", "Many checks in a row. Try again in a minute."],
  no_words: ["כתבי מה את מחפשת, למשל „עגילי זהב עד 30 ש״ח”.", "Write what you're looking for, e.g. \"gold earrings up to ₪30\"."],
  unavailable: ["הבדיקה לא זמינה כרגע. נסי שוב בעוד כמה דקות.", "The check isn't available right now. Try again in a few minutes."],
};

const TONE = {
  stop: { Icon: Octagon, color: "#b42318" },
  warn: { Icon: AlertTriangle, color: "#b54708" },
  info: { Icon: Info, color: "var(--lx-ink)" },
};

const automated = () => {
  try { return navigator.webdriver === true || BOT_UA.test(String(navigator.userAgent || "")); } catch { return false; }
};

/** The exit to the store, as one click event (append-only; never blocks the buyer). */
function recordExit(itemId, via) {
  if (automated()) return Promise.resolve();
  let attr = {};
  try { attr = landingAttribution() || {}; } catch { attr = {}; }
  const ev = { id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, productId: `ae-${itemId}`, ts: Date.now(), ...attr, med: "magic", camp: via };
  return storage.set("marketplace:clicks", JSON.stringify([ev]), true, { keepalive: true }).catch(() => {});
}

const inApp = () => {
  try { return /Instagram|FBAN|FBAV|TikTok|musical_ly|Line\//i.test(navigator.userAgent || ""); } catch { return false; }
};

/** What the page was opened with: ?u= (a shared check), or what an app shared to the site (?text= / ?url= / ?title=). */
function openedWith() {
  try {
    const q = new URLSearchParams(window.location.search);
    return firstLink([q.get("u"), q.get("url"), q.get("text"), q.get("title")].filter(Boolean).join(" "));
  } catch {
    return "";
  }
}

const EXAMPLES = ["עגילי זהב עד 30 ש״ח", "מתנה לילדים עד 20", "כיסוי לטלפון ורוד", "שמלה לבנה לחתונה", "חנוכייה"];

const startQuery = () => {
  try { return String(new URLSearchParams(window.location.search).get("q") || "").slice(0, 80); } catch { return ""; }
};

/** "מצאי לי באלי": Hebrew words → the store's items that pass the site's rules (src/lib/growth/findOnAli.js). */
function FindOnAli() {
  const { L, lang } = useL();
  const he = lang === "he";
  const [q, setQ] = useState(startQuery);
  const [state, setState] = useState({ phase: "idle" });
  const list = useRef(null);

  async function run(words) {
    const w = String(words || "").trim();
    setQ(w);
    if (!w) { setState({ phase: "error", reason: "no_words" }); return; }
    setState({ phase: "loading" });
    try {
      const res = await fetch(`/api/store?mode=magic&q=${encodeURIComponent(w)}`, { headers: { accept: "application/json" } });
      const body = await res.json().catch(() => null);
      if (!body?.ok) { setState({ phase: "error", reason: body?.reason && ERRORS[body.reason] ? body.reason : "unavailable" }); return; }
      setState({ phase: "done", items: Array.isArray(body.items) ? body.items : [], query: body.query || {} });
      trackFunnel("magic_check", "find");
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("u");
        u.searchParams.set("q", w);
        window.history.replaceState(window.history.state, "", u.toString());
      } catch { /* the address stays as it was */ }
      setTimeout(() => list.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch {
      setState({ phase: "error", reason: "unavailable" });
    }
  }

  useEffect(() => {
    const first = startQuery();
    if (first) run(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mt-6 grid max-w-xl gap-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(q); }}>
          <label htmlFor="magic-find" className="sr-only">{L("מה מחפשים באליאקספרס", "What to find on AliExpress")}</label>
          <input
            id="magic-find"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={80}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L("למשל: עגילי זהב עד 30 ש״ח", "e.g. gold earrings up to ₪30")}
            className="lx-input min-w-0 flex-1"
            style={{ minHeight: 56, borderRadius: 999, padding: "0 20px", border: "1px solid var(--lx-line)", background: "var(--lx-bg, #fff)", fontSize: 16 }}
          />
          <button type="submit" className="lx-btn lx-btn-ink" style={{ minHeight: 56 }} disabled={state.phase === "loading"}>
            {state.phase === "loading" ? <Spinner /> : <Search size={18} aria-hidden="true" />} {L("מצאי לי", "Find it")}
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="lx-chip !min-h-[34px] !text-[13px]" onClick={() => run(x)} disabled={state.phase === "loading"}>{x}</button>
          ))}
        </div>
        {state.phase === "error" ? <p role="alert" className="text-[14.5px] font-bold" style={{ color: "#b42318" }}>{(ERRORS[state.reason] || ERRORS.unavailable)[he ? 0 : 1]}</p> : null}
      </div>
      {state.phase === "done" ? (
        <div ref={list} className="mt-8" style={{ scrollMarginTop: 80 }}>
          {state.items.length ? (
            <>
              <p className="lx-mute max-w-[70ch] text-[13px] leading-6">
                {L("#פרסומת · קישורי שותפים: הכפתורים לחנות הם קישורים של LikeLink2, ואם תקני דרכם נקבל עמלה קטנה מהחנות. המחיר שלך לא משתנה. בחרנו לפי הנתונים של החנות: רק מוצרים עם הרבה הזמנות ושביעות רצון גבוהה, בלי חיקויים של מותגים. המחיר הוא „החל מ־”, נבדק עכשיו.", "#ad · affiliate links: the store buttons are LikeLink2's links, and if you buy through them we get a small commission. Your price does not change. Chosen by the store's own data: only items with many orders and high satisfaction, no brand imitations. Prices are \"from\", checked just now.")}
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {state.items.map((it) => (
                  <li key={it.id} className="lx-card overflow-hidden" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
                    <div style={{ aspectRatio: "1 / 1", background: "var(--lx-sky-50, #eef6fb)" }}>
                      <Img src={it.image} alt={it.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div className="p-3">
                      <p className="text-[13.5px] font-bold leading-5" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.title}</p>
                      <p className="mt-1 text-[16px] font-extrabold">{L(`מ־₪${shekel(it.price)}`, `from ₪${shekel(it.price)}`)}</p>
                      <div className="mt-2 grid gap-2">
                        <a
                          href={it.buy}
                          target={inApp() ? undefined : "_blank"}
                          rel="noopener noreferrer sponsored"
                          className="lx-btn lx-btn-ink lx-btn-sm"
                          style={{ justifyContent: "center" }}
                          onClick={(e) => {
                            const write = recordExit(it.id, "find");
                            if (!inApp()) return;
                            e.preventDefault();
                            const go = () => { window.location.href = it.buy; };
                            Promise.race([write, new Promise((r) => setTimeout(r, 400))]).then(go, go);
                          }}
                        >
                          {L("לחנות", "Shop")} <ExternalLink size={14} aria-hidden="true" />
                        </a>
                        <Go to={it.check} className="lx-btn lx-btn-ghost lx-btn-sm" style={{ justifyContent: "center" }}>
                          <Sparkles size={14} aria-hidden="true" /> {L("מה לבדוק", "What to check")}
                        </Go>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[15px] font-bold">{L("לא מצאנו בחנות מוצר שעובר את הכללים שלנו לחיפוש הזה. נסי מילה אחרת או תקציב גבוה יותר.", "Nothing in the store passed our rules for this search. Try another word or a higher budget.")}</p>
          )}
        </div>
      ) : null}
    </>
  );
}

const readRecent = () => {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
const writeRecent = (list) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private mode: the list lives for this visit only */ }
};

/** Keep the button one tap away: install on Android/desktop Chrome, the iPhone's own steps otherwise. */
function KeepIt() {
  const { L } = useL();
  const [hint, setHint] = useState(false);
  const standalone = (() => { try { return window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true; } catch { return false; } })();
  if (standalone) return null;
  const ios = (() => { try { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ""); } catch { return false; } })();
  return (
    <div className="mt-4 max-w-xl">
      <button
        type="button"
        className="lx-btn lx-btn-ghost"
        onClick={async () => {
          const pwa = typeof window !== "undefined" ? window.__likelinkPwa : null;
          if (pwa?.canInstall && pwa.install) { const r = await pwa.install().catch(() => "unavailable"); if (r === "accepted") return; }
          setHint(true);
        }}
      >
        <Smartphone size={16} aria-hidden="true" /> {L("לשמור את כפתור הקסם במסך הבית", "Keep the magic button on your home screen")}
      </button>
      {hint ? (
        <p className="lx-mute mt-2 text-[13.5px] leading-6">
          {ios
            ? L("באייפון: בספארי לוחצים על „שיתוף” (הריבוע עם החץ) ← „הוספה למסך הבית”.", "On iPhone: in Safari tap Share → Add to Home Screen.")
            : L("בתפריט הדפדפן (שלוש הנקודות) ← „הוספה למסך הבית” או „התקנת אפליקציה”. אחרי זה, באנדרואיד, אפשר לשתף מוצר מאליאקספרס ישר לכאן.", "In the browser menu (⋮) → Add to Home screen / Install app. Then, on Android, you can share a product from AliExpress straight here.")}
        </p>
      ) : null}
    </div>
  );
}

export function MagicPage({ graph }) {
  const { L, lang } = useL();
  const he = lang === "he";
  const [tab, setTab] = useState(() => (startQuery() ? "find" : "link"));
  const [text, setText] = useState("");
  const [state, setState] = useState({ phase: "idle" });
  const [pasteHint, setPasteHint] = useState(false);
  const [recent, setRecent] = useState(readRecent);
  const input = useRef(null);
  const result = useRef(null);

  async function check(raw) {
    const link = firstLink(raw);
    setText(link || String(raw || ""));
    if (!link) { setState({ phase: "error", reason: "no_link" }); return; }
    if (!isStoreLink(link)) { setState({ phase: "error", reason: "not_aliexpress" }); return; }
    setState({ phase: "loading", link });
    try {
      const res = await fetch(`/api/store?mode=magic&u=${encodeURIComponent(link)}`, { headers: { accept: "application/json" } });
      const body = await res.json().catch(() => null);
      if (!body?.ok || !body.report) { setState({ phase: "error", reason: body?.reason && ERRORS[body.reason] ? body.reason : "unavailable" }); return; }
      setState({ phase: "done", link, report: body.report });
      setRecent((list) => { const next = addRecent(list, { link, title: body.report.item?.title, image: body.report.item?.image }); writeRecent(next); return next; });
      trackFunnel("magic_check", body.report.buy?.via || "");
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.get("u") !== link || u.searchParams.has("q")) { u.searchParams.delete("q"); u.searchParams.set("u", link); window.history.replaceState(window.history.state, "", u.toString()); }
      } catch { /* the address stays as it was */ }
      setTimeout(() => result.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch {
      setState({ phase: "error", reason: "unavailable" });
    }
  }

  async function pasteAndCheck() {
    try {
      const clip = await navigator.clipboard?.readText?.();
      if (clip && firstLink(clip)) { check(clip); return; }
    } catch { /* the browser asked and was refused, or has no clipboard access */ }
    setPasteHint(true);
    input.current?.focus();
  }

  useEffect(() => {
    const link = openedWith();
    if (link) check(link);
    // Only once, with what the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = state.phase === "done" ? state.report : null;
  const listed = report ? catalogMatch(graph?.products || [], report.item.id) : null;
  const listedCreator = listed ? (graph?.creators || []).find((c) => c.id === listed.marketerId) || null : null;

  return (
    <>
      <section className="lx-profile">
        <div className="lx-wrap py-10 md:py-16">
          <p className="lx-kicker mb-3"><Sparkles size={14} aria-hidden="true" /> {L("חדש ב־LikeLink2 · בחינם, בלי הרשמה", "New on LikeLink2 · free, no sign-up")}</p>
          <h1 className="lx-profile-name">{L("כפתור הקסם ✨", "The magic button ✨")}</h1>
          <div role="tablist" aria-label={L("מה עושים", "What to do")} className="mt-4 flex flex-wrap gap-2">
            {[["link", L("🔗 יש לי קישור", "🔗 I have a link")], ["find", L("🔎 מצאי לי באלי", "🔎 Find it on AliExpress")]].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`lx-btn ${tab === id ? "lx-btn-ink" : "lx-btn-ghost"}`} style={{ minHeight: 44 }}>{label}</button>
            ))}
          </div>
          {tab === "find" ? (
            <>
              <p className="lx-profile-bio mt-4" style={{ fontSize: 16, maxWidth: "56ch" }}>
                {L("כתבי בעברית מה את מחפשת, ואפשר גם תקציב. נחפש באליאקספרס ונראה רק מוצרים שעוברים את הכללים שלנו: הרבה הזמנות, שביעות רצון גבוהה ובלי חיקויים.", "Write in Hebrew what you're looking for, with a budget if you like. We'll search AliExpress and show only items that pass our rules: many orders, high satisfaction, no imitations.")}
              </p>
              <FindOnAli />
            </>
          ) : (<>
          <p className="lx-profile-bio mt-4" style={{ fontSize: 16, maxWidth: "56ch" }}>
            {L("ראית מוצר בטיקטוק, באינסטגרם או באפליקציה של אליאקספרס? הדביקי כאן את הקישור, ותוך שנייה תדעי מה המחיר בחנות עכשיו, מה לבדוק לפני שקונים, ואם זה כנראה חיקוי של מותג.", "Saw something on TikTok, Instagram or in the AliExpress app? Paste the link here and see the store's price now, what to check before buying, and whether it's likely a brand imitation.")}
          </p>

          <div className="mt-6 grid max-w-xl gap-3">
            <button type="button" onClick={pasteAndCheck} className="lx-btn lx-btn-ink" style={{ minHeight: 60, fontSize: 18, justifyContent: "center" }} disabled={state.phase === "loading"}>
              {state.phase === "loading" ? <Spinner /> : <ClipboardPaste size={20} aria-hidden="true" />}
              {state.phase === "loading" ? L("בודקת בחנות…", "Checking the store…") : L("הדבקה ובדיקה", "Paste and check")}
            </button>
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); check(text); }}
            >
              <label htmlFor="magic-link" className="sr-only">{L("קישור מאליאקספרס", "An AliExpress link")}</label>
              <input
                id="magic-link"
                ref={input}
                dir="ltr"
                inputMode="url"
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => { const v = e.clipboardData?.getData("text"); if (v && firstLink(v)) { e.preventDefault(); check(v); } }}
                placeholder="https://a.aliexpress.com/…"
                className="lx-input min-w-0 flex-1"
                style={{ minHeight: 48, borderRadius: 999, padding: "0 18px", border: "1px solid var(--lx-line)", background: "var(--lx-bg, #fff)" }}
              />
              <button type="submit" className="lx-btn lx-btn-ghost" disabled={state.phase === "loading"} aria-label={L("בדיקה", "Check")}>
                <Search size={18} aria-hidden="true" /> {L("בדיקה", "Check")}
              </button>
            </form>
            {recent.length && state.phase !== "loading" ? (
              <div>
                <p className="lx-mute mb-2 text-[13px] font-bold">{L("הבדיקות האחרונות שלך (נשמרות רק במכשיר הזה)", "Your recent checks (kept on this device only)")}</p>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <button key={r.link} type="button" className="lx-chip !min-h-[36px] !text-[12.5px]" onClick={() => check(r.link)} style={{ maxWidth: "100%" }}>
                      {r.image ? <Img src={r.image} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover" }} /> : null}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{r.title || r.link}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {pasteHint ? <p className="lx-mute text-[13.5px]">{L("הדפדפן לא נתן לקרוא את ההעתקה. לחיצה ארוכה בתיבה ← „הדבקה”.", "The browser didn't allow reading the clipboard. Long-press the box → Paste.")}</p> : null}
            {state.phase === "error" ? <p role="alert" className="text-[14.5px] font-bold" style={{ color: "#b42318" }}>{(ERRORS[state.reason] || ERRORS.unavailable)[he ? 0 : 1]}</p> : null}
          </div>
          </>)}
          <KeepIt />
        </div>
      </section>

      {tab === "link" && report ? (
        <section ref={result} className="lx-wrap mt-8 md:mt-12" aria-labelledby="magic-result" style={{ scrollMarginTop: 80 }}>
          <div className="lx-card grid gap-5 p-4 md:grid-cols-[minmax(0,300px)_1fr] md:p-6" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
            <div className="overflow-hidden rounded-[20px]" style={{ aspectRatio: "1 / 1", background: "var(--lx-sky-50, #eef6fb)" }}>
              <Img src={report.item.image} alt={report.item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div className="min-w-0">
              <p className="lx-kicker">{L("תמונת המוכר · הנתונים מהחנות, עכשיו", "The seller's photo · the store's own data, now")}</p>
              <h2 id="magic-result" className="mt-2 text-[18px] font-extrabold leading-7 md:text-[21px]">{report.item.title || L("המוצר מהקישור", "The linked product")}</h2>
              {report.item.price ? (
                <p className="mt-2 text-[22px] font-extrabold">{L(`מ־₪${shekel(report.item.price)}`, `from ₪${shekel(report.item.price)}`)} <span className="lx-mute text-[13px] font-normal">{L("נבדק עכשיו בחנות", "checked just now")}</span></p>
              ) : <p className="lx-mute mt-2 text-[14px]">{L("המחיר המעודכן בחנות", "See the price in the store")}</p>}

              {report.verdict === "LOOK" ? <p className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13.5px] font-extrabold" style={{ background: "#fef0c7", color: "#7a2e0e" }}><AlertTriangle size={15} aria-hidden="true" /> {L("כדאי לשים לב", "Worth a closer look")}</p> : null}
              {report.verdict === "STOP" ? <p className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13.5px] font-extrabold" style={{ background: "#fee4e2", color: "#7a271a" }}><Octagon size={15} aria-hidden="true" /> {L("לא ממליצים", "Not recommended")}</p> : null}

              <ul className="mt-4 grid gap-3">
                {report.notes.map((n) => {
                  const { Icon, color } = TONE[n.tone] || TONE.info;
                  return (
                    <li key={n.id} className="flex items-start gap-2 text-[14.5px] leading-7">
                      <Icon size={17} className="mt-1 shrink-0" style={{ color }} aria-hidden="true" />
                      <span>
                        {n.title ? <strong>{he ? n.title.he : n.title.en}. </strong> : null}
                        {he ? n.text.he : n.text.en}
                        {n.to ? <> <Go to={n.to} className="underline">{L("עוד", "More")}</Go></> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {listed ? (
                <p className="mt-4 rounded-[14px] p-3 text-[14px] font-bold" style={{ background: "var(--lx-sky-50, #eef6fb)" }}>
                  {L("המוצר הזה כבר באתר, עם סרטון ובחירה של יוצרת:", "This product is already on the site, picked by a creator:")} <Go to={`/p/${listed.id}`} className="underline">{L("לעמוד המוצר", "Open it")}</Go>
                </p>
              ) : null}

              {report.buy?.url ? (
                <div className="mt-5">
                  <a
                    href={report.buy.url}
                    target={inApp() ? undefined : "_blank"}
                    rel="noopener noreferrer sponsored"
                    className="lx-btn lx-btn-ink"
                    style={{ minHeight: 52 }}
                    onClick={(e) => {
                      const write = recordExit(report.item.id, report.buy.via);
                      if (!inApp()) return;
                      e.preventDefault();
                      const go = () => { window.location.href = report.buy.url; };
                      Promise.race([write, new Promise((r) => setTimeout(r, 400))]).then(go, go);
                    }}
                  >
                    {L("לעמוד המוצר באליאקספרס", "Open it on AliExpress")} <ExternalLink size={16} aria-hidden="true" />
                  </a>
                  {report.buy.disclosure ? <p className="lx-mute mt-2 max-w-[60ch] text-[12.5px] leading-6">{he ? report.buy.disclosure.he : report.buy.disclosure.en}</p> : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <ShareButton path={`${MAGIC_PATH}?u=${encodeURIComponent(state.link)}`} title={L("בדקתי את זה בכפתור הקסם של LikeLink2", "I checked this with LikeLink2's magic button")} image={report.item.image || ""} variant="button" />
                <button type="button" className="lx-btn lx-btn-ghost" onClick={() => { setState({ phase: "idle" }); setText(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  {L("בדיקה של מוצר אחר", "Check another product")}
                </button>
              </div>
            </div>
          </div>
          {listed && listedCreator ? (
            <div className="mt-6 max-w-[300px]"><ProductCard product={listed} creator={listedCreator} /></div>
          ) : null}
        </section>
      ) : null}

      <section className="lx-wrap mt-12 md:mt-16" aria-labelledby="magic-how">
        <h2 id="magic-how" className="lx-display text-[28px] md:text-[38px]">{L("איך זה עובד", "How it works")}</h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {STEPS.map(([h, e], i) => (
            <li key={h} className="lx-card flex items-start gap-3 p-5" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
              <span className="lx-chip shrink-0 font-extrabold" aria-hidden="true">{i + 1}</span>
              <span className="text-[15px] font-bold leading-7">{he ? h : e}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            ["בלי מספרים מומצאים", "לא מציגים דירוגים, כמות הזמנות או „הנחות” שהמוכר כתב. רק את מה שהחנות החזירה עכשיו."],
            ["קישור של יוצרת נשאר שלה", "קיבלת קישור ממשפיענית? הכפתור משאיר אותו כמו שהוא, כדי שהעמלה תגיע אליה."],
            ["כתוב מתי יש עמלה", "כשהכפתור הוא הקישור של LikeLink2, כתוב מתחתיו #פרסומת. המחיר שלך לא משתנה."],
          ].map(([t, b]) => (
            <div key={t} className="lx-card p-5" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
              <p className="text-[16px] font-extrabold">{t}</p>
              <p className="lx-mute mt-2 text-[14.5px] leading-7">{b}</p>
            </div>
          ))}
        </div>
        <p className="lx-mute mt-4 text-[13.5px]">
          {L("עוד לפני שקונים:", "Before you buy:")} <Go to="/guide" className="underline">{L("8 הבדיקות של לונה", "Luna's 8 checks")}</Go> · <Go to="/size" className="underline">{L("המודד של לונה למידת טבעת וצמיד", "Luna's ring and bracelet size meter")}</Go>
        </p>
      </section>

      <section className="lx-wrap mt-12 mb-4 md:mt-16" aria-labelledby="magic-faq">
        <h2 id="magic-faq" className="lx-display text-[28px] md:text-[38px]">{L("שאלות ותשובות", "Questions and answers")}</h2>
        <div className="mt-5 grid gap-3">
          {MAGIC_FAQ.map((f) => (
            <details key={f.q} className="lx-card p-5" style={{ boxShadow: "none", border: "1px solid var(--lx-line)" }}>
              <summary className="cursor-pointer text-[16px] font-extrabold">{f.q}</summary>
              <p className="lx-mute mt-2 text-[14.5px] leading-7">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
