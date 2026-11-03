/**
 * ShareCenter — "פרסום לרשתות": every product in the creator's store, ready
 * to post on each network in one tap (src/lib/growth/shareCenter.js).
 *
 * Each button opens the network's own share window with the post and a
 * tracked link; the creator presses "post" there. LikeLink2 cannot post into
 * a personal profile, so nothing here says "published": a post is the
 * creator's own mark ("סימנת שפרסמת", kept on this device) until a network
 * returns an id. The clicks that come back show in "ביצועים וקליקים".
 */
import React, { useEffect, useMemo, useState } from "react";
import { Megaphone, Copy, Check, ExternalLink, Film, Store, CircleAlert, Sparkles, Loader2 } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Button } from "../ui/index.jsx";
import { loadReelsFeed } from "../../lib/reelsFeed.js";
import { lookOf } from "../../lib/looks.js";
import { safePreviewSrc } from "../../lib/uploadImage.js";
import { DEFAULT_PRODUCT_IMAGE } from "../../utils/helpers.js";
import { feedEntries, bestFeedReels, productShareKit, storeShareKit, todaysPick } from "../../lib/growth/shareCenter.js";
import { loadStudioVideos, studioVideoState, studioVideosUrls } from "../../lib/growth/studioVideos.js";
import { PRESENTERS, animatedState, animatedUrls, loadAnimated, makeRequest, requestOf } from "../../lib/growth/animatedReels.js";
import { toHebrewError } from "../../lib/errorMessages.js";
import { BASE } from "../../lib/basePath.js";

const BRAND = {
  whatsapp: "#25d366", facebook: "#1877f2", instagram: "#d62976", tiktok: "#111", telegram: "#229ed9",
  threads: "#111", pinterest: "#e60023", x: "#111", email: "#555",
};

// The creator's own mark that she posted (a per-device convenience, never "published").
const markKey = (mid, pid, net) => `ll-share:${mid}:${pid}:${net}`;
function readMark(key) {
  try { return window.localStorage.getItem(key) || ""; } catch { return ""; }
}
function writeMark(key, value) {
  try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch { /* private mode: the mark just isn't kept */ }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** One network's button: opens the share window, or copies first where the network can't take the text. */
function NetworkButton({ action, copied, onCopied, showToast }) {
  const style = { background: BRAND[action.id] || "var(--accent)", color: "#fff" };
  const cls = "ll-tap inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-bold";
  if (action.prefilled || copied) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
        {action.prefilled ? action.he : `פתיחת ${action.he}`} <ExternalLink size={11} />
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      style={style}
      onClick={async () => {
        const ok = await copyText(action.text);
        onCopied();
        showToast?.(ok ? `הטקסט הועתק. עכשיו "פתיחת ${action.he}" והדביקי` : `ההעתקה נחסמה. פתחי את ${action.he} והקלידי את הקישור`);
      }}
    >
      <Copy size={11} /> {action.he}
    </button>
  );
}

/**
 * The product's own ready video (Actions → "Studio videos": the store's video
 * from the owner's affiliate account, edited with a hook and the labels on
 * every frame), or where it stands. Nothing here posts: she watches it, saves
 * it and posts it herself.
 */
function StudioVideo({ product, entry, showToast }) {
  const line = studioVideoState(product, entry);
  if (line.state !== "ready") {
    return (
      <p className="mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[11.5px] leading-5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
        <Film size={13} className="mt-0.5 shrink-0" /> {line.he}
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
      <p className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: "var(--text)" }}>
        <Film size={13} /> {line.he}
      </p>
      <video
        className="mt-2 w-full max-w-[16rem] rounded-xl"
        style={{ aspectRatio: "9 / 16", background: "#000" }}
        src={entry.video}
        poster={entry.poster || undefined}
        controls
        playsInline
        preload="metadata"
      />
      <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--text-muted)" }}>
        צילום המוצר: המוכר, מעמוד המוצר בחנות · נערך ב־LikeLink2. על כל פריים כתוב #פרסומת · קישור שותפים.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
        <a href={entry.video} target="_blank" rel="noopener noreferrer" className="ll-tap inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
          פתיחת הסרטון לשמירה <ExternalLink size={11} />
        </a>
        <button
          type="button"
          className="ll-tap inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
          onClick={async () => showToast?.((await copyText(entry.caption)) ? "הכיתוב הועתק. הדביקי אותו בפוסט" : "ההעתקה נחסמה. הכיתוב מופיע מתחת לסרטון")}
        >
          <Copy size={11} /> העתקת הכיתוב
        </button>
      </div>
      {entry.variants?.length ? (
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
          עם הפתיח כתוב על המסך:{" "}
          {entry.variants.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline">{i ? " · " : ""}גרסה {i === 0 ? "ב" : "ג"}</a>
          ))}
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>הכיתוב המלא</summary>
        <p className="mt-1.5 whitespace-pre-line text-[11px] leading-5" style={{ color: "var(--text-secondary)" }}>{entry.caption}</p>
      </details>
    </div>
  );
}

/**
 * The animated character reel (the 3D studio, from a button): she picks a
 * presenter and presses once; her product carries the request, the cloud
 * makes the reel within about two hours and it appears here. Labelled AI on
 * every frame; the product only in the seller's real photo; nothing posts.
 */
function AnimatedReel({ product, entry, onRequest, showToast }) {
  const line = animatedState(product, entry);
  const req = requestOf(product);
  const [presenter, setPresenter] = useState(req?.presenter || entry?.presenter || PRESENTERS[0].id);
  const [sending, setSending] = useState(false);
  if (line.state === "unsupported") return null;
  const ready = line.state === "ready";
  const queued = line.state === "queued";
  const ask = async () => {
    setSending(true);
    try {
      await onRequest(product, presenter);
      showToast?.("הבקשה נשלחה. הסרטון נוצר בענן ויופיע כאן, בדרך כלל תוך כשעתיים");
    } catch (e) {
      showToast?.(toHebrewError(e?.message, "הבקשה לא נשמרה. נסי שוב"));
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
      <p className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: "var(--text)" }}>
        <Sparkles size={13} /> סרטון אנימציה עם דמות
      </p>
      <p className="mt-1 text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>{line.he}</p>
      {ready ? (
        <>
          <video
            className="mt-2 w-full max-w-[16rem] rounded-xl"
            style={{ aspectRatio: "9 / 16", background: "#000" }}
            src={entry.video}
            poster={entry.poster || undefined}
            controls
            playsInline
            preload="metadata"
          />
          <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--text-muted)" }}>
            דמות וקול AI, תמונת המוצר מהמוכר · על כל פריים כתוב #פרסומת · קישור שותפים ו"דמות וקול AI".
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
            <a href={entry.video} target="_blank" rel="noopener noreferrer" className="ll-tap inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
              פתיחת הסרטון לשמירה <ExternalLink size={11} />
            </a>
            <button
              type="button"
              className="ll-tap inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              onClick={async () => showToast?.((await copyText(entry.caption)) ? "הכיתוב הועתק. הדביקי אותו בפוסט" : "ההעתקה נחסמה. הכיתוב מופיע מתחת לסרטון")}
            >
              <Copy size={11} /> העתקת הכיתוב
            </button>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>הכיתוב המלא</summary>
            <p className="mt-1.5 whitespace-pre-line text-[11px] leading-5" style={{ color: "var(--text-secondary)" }}>{entry.caption}</p>
          </details>
        </>
      ) : null}
      {queued ? null : (
        <div className="mt-2">
          <p className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>מי מציגה?</p>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="מי מציגה">
            {PRESENTERS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={presenter === p.id}
                onClick={() => setPresenter(p.id)}
                className="ll-tap rounded-full px-3 py-1 text-[11.5px] font-semibold"
                style={{ background: presenter === p.id ? "var(--accent)" : "var(--bg)", color: presenter === p.id ? "#fff" : "var(--text)", border: "1px solid var(--border)" }}
              >
                {p.he}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={sending}
            onClick={ask}
            className="ll-tap mt-2 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold"
            style={{ background: "var(--accent)", color: "#fff", opacity: sending ? 0.7 : 1 }}
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {ready ? "יצירת סרטון חדש" : "יצירת סרטון אנימציה"}
          </button>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, kit, marketerId, showToast, highlight = false, studioVideo = null, animated = null, onAnimatedRequest = null }) {
  const [copied, setCopied] = useState({});
  const [marks, setMarks] = useState(() => Object.fromEntries(kit.actions.map((a) => [a.id, readMark(markKey(marketerId, product.id, a.id))])));
  const thumb = lookOf(product.id)?.src || product.image || "";
  const toggleMark = (net) => {
    const value = marks[net] ? "" : new Date().toISOString().slice(0, 10);
    writeMark(markKey(marketerId, product.id, net), value);
    setMarks((m) => ({ ...m, [net]: value }));
  };
  const marked = kit.actions.filter((a) => marks[a.id]);
  return (
    <article className="ll-card rounded-3xl p-4 sm:p-5" style={highlight ? { border: "1px solid var(--accent)" } : undefined}>
      <div className="flex items-start gap-3">
        <img
          src={safePreviewSrc(thumb, DEFAULT_PRODUCT_IMAGE)}
          alt=""
          className="ll-thumb shrink-0 object-cover"
          style={{ "--thumb": "4.5rem", "--thumb-r": "16px" }}
          onError={(e) => { e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
        />
        <div className="min-w-0 flex-1">
          {highlight ? <p className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>המוצר של היום</p> : null}
          <h3 className="line-clamp-2 text-sm font-extrabold" style={{ color: "var(--text)" }}>{kit.title}</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>פתיח: "{kit.hook}"</p>
          {kit.video ? (
            <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <Film size={12} /> יש סרטון · {kit.video.note}
            </p>
          ) : null}
        </div>
      </div>

      {kit.video ? null : <StudioVideo product={product} entry={studioVideo} showToast={showToast} />}
      {onAnimatedRequest ? <AnimatedReel product={product} entry={animated} onRequest={onAnimatedRequest} showToast={showToast} /> : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {kit.actions.map((a) => (
          <NetworkButton key={a.id} action={a} copied={Boolean(copied[a.id])} onCopied={() => setCopied((c) => ({ ...c, [a.id]: true }))} showToast={showToast} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {kit.video ? (
          <a href={kit.video.url} target="_blank" rel="noopener noreferrer" className="underline">
            פתיחת הסרטון לשמירה (לאינסטגרם ולטיקטוק)
          </a>
        ) : null}
        <button type="button" className="underline" onClick={async () => showToast?.((await copyText(kit.link)) ? "הקישור הועתק" : kit.link)}>
          העתקת הקישור
        </button>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          {marked.length ? `סימנת שפרסמת ב־${marked.map((a) => a.he).join(", ")}` : "פרסמת? סמני כאן כדי לזכור"}
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {kit.actions.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={Boolean(marks[a.id])}
              onClick={() => toggleMark(a.id)}
              className="ll-tap inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
              style={{ background: marks[a.id] ? "var(--accent-subtle)" : "var(--bg-subtle)", color: marks[a.id] ? "var(--accent)" : "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              {marks[a.id] ? <Check size={11} /> : null} {a.he}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--text-muted)" }}>
          הסימון נשמר רק במכשיר הזה, כדי שתזכרי איפה כבר פרסמת. הוא לא בדיקה מול הרשת.
        </p>
      </details>
    </article>
  );
}

export default function ShareCenter({ onNavigate }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const { currentMarketer: marketer, products, showToast, persistProducts } = useMarketplace();
  const [entries, setEntries] = useState([]);
  const [studioVideos, setStudioVideos] = useState(() => new Map());
  const [animated, setAnimated] = useState(() => new Map());

  useEffect(() => {
    let alive = true;
    loadReelsFeed().then((videos) => { if (alive) setEntries(feedEntries(videos)); }).catch(() => {});
    loadStudioVideos(fetch, studioVideosUrls(BASE)).then((map) => { if (alive) setStudioVideos(map); }).catch(() => {});
    loadAnimated(fetch, animatedUrls(BASE)).then((map) => { if (alive) setAnimated(map); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const mine = useMemo(() => (products || []).filter((p) => p.marketerId === marketer?.id && p.status === "approved"), [products, marketer]);
  const best = useMemo(() => bestFeedReels(entries), [entries]);
  const pick = useMemo(() => todaysPick({ products: mine, entries }), [mine, entries]);
  const ordered = useMemo(() => (pick ? [pick.product, ...mine.filter((p) => p.id !== pick.product.id)] : mine), [mine, pick]);
  const store = useMemo(() => storeShareKit({ marketer }), [marketer]);
  const [storeCopied, setStoreCopied] = useState({});
  // Her own product carries the request (an owner-writable field); the hourly cloud run makes the reel.
  const requestAnimated = async (product, presenter) => {
    if (typeof persistProducts !== "function") throw new Error("cloud_unavailable");
    const reelRequest = makeRequest(presenter);
    await persistProducts((list) => list.map((p) => (p.id === product.id && p.marketerId === marketer?.id ? { ...p, reelRequest } : p)));
  };

  if (!marketer) {
    return (
      <div className="ll-card rounded-3xl p-6 text-center">
        <h2 className="text-lg font-extrabold" style={{ color: "var(--text)" }}>{he ? "פרסום לרשתות דורש סטודיו" : "Sharing needs a studio"}</h2>
        <Button className="mt-4" onClick={() => onNavigate?.("products")}>{he ? "להרשמה / התחברות" : "Sign up / Sign in"}</Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-3xl space-y-5">
      <section className="ll-card rounded-3xl p-5 sm:p-6">
        <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--accent)" }}>
          <Megaphone size={14} /> פרסום לרשתות
        </p>
        <h2 className="mt-1 text-lg font-extrabold" style={{ color: "var(--text)" }}>כל מוצר מוכן לפרסום, בלחיצה</h2>
        <ol className="mt-3 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
          <li>1. לוחצים על הרשת. נפתח חלון הפרסום שלה עם הפוסט והקישור שלך.</li>
          <li>2. בפייסבוק, אינסטגרם וטיקטוק הטקסט מועתק קודם, ואז מדביקים בפוסט.</li>
          <li>3. לוחצים "פרסם" ברשת עצמה. כל קליק שיגיע נספר ב"ביצועים וקליקים", לפי הרשת.</li>
        </ol>
        <p className="mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2.5 text-[11.5px] leading-5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <CircleAlert size={14} className="mt-0.5 shrink-0" />
          פייסבוק, אינסטגרם וטיקטוק לא מאפשרים לאף אתר לפרסם בשמך בפרופיל אישי. לכן LikeLink2 לא כותב "פורסם" בשבילך: הפוסט עולה רק כשאת לוחצת "פרסם" ברשת. בכל פוסט כבר כתוב #פרסומת · קישור שותפים, כדי שיהיה ברור לקונים שזה קישור שותפים.
        </p>
      </section>

      {store ? (
        <section className="ll-card rounded-3xl p-5 sm:p-6">
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold" style={{ color: "var(--text)" }}>
            <Store size={15} /> שתפי את כל החנות
          </h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {store.actions.map((a) => (
              <NetworkButton key={a.id} action={a} copied={Boolean(storeCopied[a.id])} onCopied={() => setStoreCopied((c) => ({ ...c, [a.id]: true }))} showToast={showToast} />
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>
            הקישור לביו (שמים פעם אחת בפרופיל, וכל ביקור נספר לפי הרשת):
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[["instagram", "אינסטגרם"], ["tiktok", "טיקטוק"], ["facebook", "פייסבוק"]].map(([net, label]) => (
              <button
                key={net}
                type="button"
                className="ll-tap inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-semibold"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text)" }}
                onClick={async () => showToast?.((await copyText(store.bio[net])) ? `קישור הביו ל${label} הועתק` : store.bio[net])}
              >
                <Copy size={11} /> קישור ביו ל{label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {ordered.length === 0 ? (
        <section className="ll-card rounded-3xl p-5 text-sm" style={{ color: "var(--text-secondary)" }}>
          אין עדיין מוצר שמוצג בחנות. הוסיפי קישור אפילייט ופרסמי אותו בחנות, והוא יופיע כאן מוכן לרשתות.
          <div className="mt-3"><Button onClick={() => onNavigate?.("add-product")}>הוספת קישור</Button></div>
        </section>
      ) : (
        ordered.map((p) => {
          const kit = productShareKit({ product: p, reel: best.get(p.id) || null, image: p.image });
          const own = studioVideos.get(p.id);
          const anim = animated.get(p.id);
          return kit ? (
            <ProductCard
              key={p.id} product={p} kit={kit} marketerId={marketer.id} showToast={showToast} highlight={pick?.product?.id === p.id}
              studioVideo={own && own.marketerId === marketer.id ? own : null}
              animated={anim && anim.marketerId === marketer.id ? anim : null}
              onAnimatedRequest={requestAnimated}
            />
          ) : null;
        })
      )}

      <section className="ll-card rounded-3xl p-5 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
        רוצה לראות מאיפה הגיעו קליקים?{" "}
        <button type="button" className="font-bold underline" style={{ color: "var(--accent)" }} onClick={() => onNavigate?.("performance")}>ביצועים וקליקים</button>
        . עמוד עסקי בפייסבוק או חשבון עסקי באינסטגרם אפשר לחבר לפרסום אוטומטי ב"כלים מתקדמים" ← "טייס אוטומטי".
      </section>
    </div>
  );
}
