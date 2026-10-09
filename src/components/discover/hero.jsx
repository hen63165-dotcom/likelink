// LikeLink2 home hero: the gradient headline, the search (with a live
// suggestions panel), the bento grid and the trust marquee. Every number on
// these surfaces is computed from the public graph (real catalog records and
// recorded events); a cell with no evidence says what it is instead of
// showing a number.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpLeft, ArrowUpRight, BadgeCheck, Clapperboard, Eye, Flame, Lock, Search, ShieldCheck, Sparkles, Store, Tag, TrendingUp, Users } from "lucide-react";
import { useMarketplace } from "../../context/MarketplaceContext";
import { searchGraph, TREND_WINDOW_DAYS } from "../../lib/publicDiscovery.js";
import { creatorPath, productPath } from "../../lib/acquisition.js";
import { categoryName, CreatorAvatar, formatPrice, Go, Img, sized, useL } from "./kit";

/* ------------------------------------------------------------------ icons */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

export function SearchIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.6 15.6 20 20" />
    </svg>
  );
}

export function MicIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11.5" rx="3" />
      <path d="M5.6 11.2a6.4 6.4 0 0 0 12.8 0" />
      <path d="M12 17.6V21M9.2 21h5.6" />
    </svg>
  );
}

export function CameraIcon({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3.8 9a2.6 2.6 0 0 1 2.6-2.6h1.5l1.3-1.9a1.6 1.6 0 0 1 1.3-.7h3a1.6 1.6 0 0 1 1.3.7l1.3 1.9h1.5A2.6 2.6 0 0 1 20.2 9v7.4a2.6 2.6 0 0 1-2.6 2.6H6.4a2.6 2.6 0 0 1-2.6-2.6z" />
      <circle cx="12" cy="12.6" r="3.3" />
      <circle cx="17.1" cy="9.4" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ----------------------------------------------------------------- search */

const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/** A photo picked on the home page travels to /search in memory (never uploaded). */
export const imageHandoff = { file: null };

export function SearchBox({ value, onChange, onSubmit, autoFocus = false, big = false, onImage = null, inputProps = {} }) {
  const { L, lang } = useL();
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [listening, setListening] = useState(false);
  // Voice: the browser's own speech recognition (no provider, no upload by us).
  function listen() {
    if (!SpeechRec || listening) return;
    const rec = new SpeechRec();
    rec.lang = lang === "he" ? "he-IL" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { const t = e.results?.[0]?.[0]?.transcript || ""; if (t) { onChange(t); onSubmit?.(t); } };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <form
      role="search"
      className="lx-search"
      style={big ? { minHeight: 62 } : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
      }}
    >
      <span className="lx-mute shrink-0"><SearchIcon /></span>
      <label htmlFor="lx-q" className="lx-sr">{L("חיפוש", "Search")}</label>
      <input
        id="lx-q"
        ref={ref}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={L("מה מחפשים? מוצר, יוצר/ת, קטגוריה…", "Search products, creators, categories…")}
        {...inputProps}
      />
      {value ? (
        <button type="button" className="lx-search-tool" onClick={() => onChange("")} aria-label={L("ניקוי", "Clear")}>
          <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      ) : null}
      {big && SpeechRec ? (
        <button type="button" className="lx-search-tool" onClick={listen} aria-label={L("חיפוש קולי", "Voice search")} aria-pressed={listening} title={L("דברו — נחפש בשבילכם", "Speak — we'll search")}>
          <MicIcon />
        </button>
      ) : null}
      {big && onImage ? (
        <>
          <button type="button" className="lx-search-tool" onClick={() => fileRef.current?.click()} aria-label={L("חיפוש לפי תמונה", "Search by image")} title={L("תמונה או צילום מסך של מוצר", "A photo or screenshot of a product")}>
            <CameraIcon />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = ""; }} />
        </>
      ) : null}
      <button type="submit" className="lx-btn lx-btn-rose lx-search-go" aria-label={L("חיפוש", "Search")}>
        <span className="hidden sm:inline">{L("חיפוש", "Search")}</span>
        <span className="sm:hidden"><SearchIcon size={19} /></span>
      </button>
    </form>
  );
}

/** The home search: glows on focus and opens a panel of real tags and live matches. */
function HeroSearch({ graph, navigate }) {
  const { L, lang } = useL();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const go = (path) => {
    setOpen(false);
    navigate(path);
  };
  const submit = (v) => go(`/search${v.trim() ? `?q=${encodeURIComponent(v.trim())}` : ""}`);
  const live = useMemo(() => (q.trim().length >= 2 ? searchGraph(graph, q) : null), [graph, q]);
  const topCat = graph.categories[0];
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div
      ref={wrap}
      className="lx-search-wrap"
      onFocus={() => setOpen(true)}
      // Keyboard focus leaving the search closes the panel (a tap outside is handled above).
      onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
      onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); e.currentTarget.querySelector("input")?.blur(); } }}
    >
      <SearchBox
        value={q}
        onChange={(v) => { setQ(v); setOpen(true); }}
        big
        onSubmit={submit}
        onImage={(file) => { imageHandoff.file = file; go("/search"); }}
        inputProps={{ "aria-expanded": open, "aria-controls": "lx-suggest", "aria-autocomplete": "list" }}
      />
      {open ? (
        <div id="lx-suggest" className="lx-suggest lx-glass-strong">
          {live ? (
            <div>
              {live.products.slice(0, 4).map((p, i) => (
                <Go key={p.id} to={productPath(p.id)} onClick={() => setOpen(false)} className="lx-suggest-row" style={{ "--i": i }}>
                  <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-xl" style={{ background: "var(--lx-sunk)" }}><Img src={sized(p.media.image, 120)} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{p.displayTitle}</span>
                    <span className="lx-mute block text-[12px]">{[formatPrice(p.price, lang), p.merchant].filter(Boolean).join(" · ")}</span>
                  </span>
                </Go>
              ))}
              {live.creators.slice(0, 2).map((c, i) => (
                <Go key={c.id} to={creatorPath(c.slug)} onClick={() => setOpen(false)} className="lx-suggest-row" style={{ "--i": i + 4 }}>
                  <CreatorAvatar creator={c} size={44} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{c.name}</span>
                  <span className="lx-badge">{L("יוצר/ת", "Creator")}</span>
                </Go>
              ))}
              {!live.total ? <p className="lx-mute px-2 py-1 text-[13px]">{L("אין עדיין התאמה בקטלוג — אפשר לחפש בכל זאת.", "No catalog match yet — search anyway.")}</p> : null}
              <button type="button" className="lx-suggest-row mt-1 w-full text-start" onClick={() => submit(q)} style={{ "--i": 7 }}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--lx-luna-soft)", color: "var(--lx-luna)" }}><SearchIcon size={18} /></span>
                <span className="text-[14px] font-semibold">{L(`לכל התוצאות עבור „${q.trim()}”`, `All results for “${q.trim()}”`)}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {graph.trends.length ? (
                <div>
                  <p className="lx-suggest-title"><Flame size={13} /> {L(`עכשיו חם · לפי צפיות וקליקים ב־${TREND_WINDOW_DAYS} ימים`, `Trending · views and clicks, ${TREND_WINDOW_DAYS} days`)}</p>
                  <div className="flex flex-wrap gap-2">
                    {graph.trends.slice(0, 6).map((t, i) => (
                      <Go key={t.category} to={`/discover/${encodeURIComponent(t.category)}`} onClick={() => setOpen(false)} className="lx-tag" style={{ "--i": i }}>
                        <TrendingUp size={13} style={{ color: "var(--lx-rose)" }} /> {categoryName(t.category, lang)}
                      </Go>
                    ))}
                  </div>
                </div>
              ) : null}
              {graph.categories.length ? (
                <div>
                  <p className="lx-suggest-title"><Tag size={13} /> {L("קטגוריות בקטלוג", "Catalog categories")}</p>
                  <div className="flex flex-wrap gap-2">
                    {graph.categories.slice(0, 8).map((c, i) => (
                      <Go key={c.id} to={`/discover/${encodeURIComponent(c.id)}`} onClick={() => setOpen(false)} className="lx-tag" style={{ "--i": i + 2 }}>
                        {categoryName(c.id, lang)} <span className="lx-mute text-[11.5px]">{c.count}</span>
                      </Go>
                    ))}
                  </div>
                </div>
              ) : null}
              {topCat ? (
                <div>
                  <p className="lx-suggest-title"><Sparkles size={13} /> {L("אפשר לחפש גם ככה", "You can also search like this")}</p>
                  <div className="flex flex-wrap gap-2">
                    {[L(`${categoryName(topCat.id, "he")} עד 100 שקל`, `${categoryName(topCat.id, "en")} under 100`), L("מתנה עד 50 שקל", "gift under 50")].map((s, i) => (
                      <button key={s} type="button" className="lx-tag" style={{ "--i": i + 4 }} onClick={() => submit(s)}>„{s}”</button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ bento */

/** Aceternity-style spotlight: the glow follows the pointer across a cell. */
function spot(e) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

function Cell({ to, className = "", media = null, soft = false, children, i = 0, label }) {
  const onMedia = Boolean(media);
  return (
    <Go to={to} onPointerMove={spot} aria-label={label} className={`lx-cell ${onMedia ? "on-media" : ""} ${className}`} style={{ "--i": i }}>
      {media ? <span className={`lx-cell-media ${soft ? "is-soft" : ""}`} aria-hidden="true">{media}</span> : null}
      {media ? <span className="lx-cell-shade" aria-hidden="true" /> : null}
      {children}
    </Go>
  );
}

function Data({ children, dot = false }) {
  return <span className="lx-data">{dot ? <span className="lx-dot" aria-hidden="true" /> : null}{children}</span>;
}

function GoArrow() {
  const { he } = useL();
  const A = he ? ArrowUpLeft : ArrowUpRight;
  return <span className="lx-cell-go" aria-hidden="true"><A size={16} /></span>;
}

function Bento({ graph }) {
  const { L, lang } = useL();
  const { loading } = useMarketplace();
  const withImg = graph.products.filter((p) => p.media.image);
  const verified = graph.creators.filter((c) => c.verified).length;
  const [catA, catB] = graph.categories;
  const trend = graph.trends[0];
  const reel = graph.reels[0];
  const attention = graph.products.reduce((a, p) => ({ views: a.views + p.attention.views, clicks: a.clicks + p.attention.clicks }), { views: 0, clicks: 0 });

  if (loading && !graph.products.length) {
    return (
      <div className="lx-bento" aria-busy="true" aria-label={L("טוען את הקטלוג", "Loading the catalog")}>
        {["lx-b-2x2", "lx-b-wide", "", "", "", "", "lx-b-wide"].map((c, i) => <div key={i} className={`lx-cell lx-skel ${c}`} />)}
      </div>
    );
  }

  const collage = withImg.slice(0, 4);
  return (
    <div className="lx-bento lx-stagger">
      {/* 1 · Discover — a live collage of real catalog photos */}
      <Cell
        to="/discover"
        className="lx-b-2x2"
        i={0}
        media={collage.length ? (
          <span className="lx-collage">
            {collage.map((p) => <span key={p.id}><Img src={sized(p.media.image, 420)} /></span>)}
          </span>
        ) : null}
      >
        <Data dot>{L(`${graph.products.length} מוצרים בקטלוג`, `${graph.products.length} products in the catalog`)}</Data>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="lx-cell-title">{L("התחילו לגלות", "Start discovering")}</p>
            <p className="lx-cell-sub mt-1 max-w-xs">{L("מוצרים שיוצרים בחרו — עם מחיר, חנות ברורה וגילוי נאות.", "Products creators picked — with price, a clear store and honest disclosure.")}</p>
          </div>
          <GoArrow />
        </div>
      </Cell>

      {/* 2 · Creators — real avatars */}
      <Cell to="/creators" className="lx-b-wide" i={1} label={L("הכירו את היוצרים", "Meet the creators")}>
        <div className="flex items-center justify-between gap-3">
          <Data>
            {verified ? <BadgeCheck size={12} style={{ color: "var(--lx-mint)" }} /> : <Users size={12} />}
            {verified ? L(verified === 1 ? "פרופיל מאומת" : `${verified} פרופילים מאומתים`, verified === 1 ? "1 verified profile" : `${verified} verified profiles`) : L(`${graph.creators.length} יוצרים`, `${graph.creators.length} creators`)}
          </Data>
          <span className="lx-avatars">
            {graph.creators.slice(0, 5).map((c) => <CreatorAvatar key={c.id} creator={c} size={34} ring />)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="lx-cell-title">{L("הכירו את היוצרים", "Meet the creators")}</p>
            <p className="lx-cell-sub mt-1">{L("האנשים מאחורי הבחירות, והחנויות שלהם.", "The people behind the picks, and their shops.")}</p>
          </div>
          <GoArrow />
        </div>
      </Cell>

      {/* 3–4 · Top categories by real product count */}
      {[catA, catB].map((c, k) => (c ? (
        <Cell key={c.id} to={`/discover/${encodeURIComponent(c.id)}`} i={2 + k} soft={k === 1} media={c.cover ? <Img src={sized(c.cover, 420)} /> : null}>
          <Data>{L(`${c.count} מוצרים`, `${c.count} products`)}</Data>
          <div className="flex items-end justify-between gap-2">
            <p className="lx-cell-title min-w-0">{categoryName(c.id, lang)}</p>
            <GoArrow />
          </div>
        </Cell>
      ) : (
        <Cell key={`cat-${k}`} to="/discover" i={2 + k}>
          <Data>{L("קטגוריות", "Categories")}</Data>
          <p className="lx-cell-title">{L("כל הקטגוריות", "All categories")}</p>
        </Cell>
      )))}

      {/* 5 · Reels — counted only from playable media */}
      <Cell to="/reels" i={4} media={reel?.poster || withImg[4]?.media.image ? <Img src={sized(reel?.poster || withImg[4].media.image, 420)} /> : null}>
        <Data><Clapperboard size={12} /> {graph.reels.length ? L(`${graph.reels.length} סרטונים`, `${graph.reels.length} reels`) : L("סיפורי מוצר", "Product stories")}</Data>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="lx-cell-title">{L("סרטונים", "Reels")}</p>
            <p className="lx-cell-sub mt-0.5">{L("מסומנים: אמיתי או אנימציה", "Labelled: real or animation")}</p>
          </div>
          <GoArrow />
        </div>
      </Cell>

      {/* 6 · Attention — recorded events only; otherwise what's new */}
      {trend ? (
        <Cell to={`/discover/${encodeURIComponent(trend.category)}`} i={5} media={trend.cover ? <Img src={sized(trend.cover, 420)} /> : null} soft>
          <Data><Flame size={12} /> {L(`${trend.views} צפיות · ${trend.clicks} קליקים`, `${trend.views} views · ${trend.clicks} clicks`)}</Data>
          <div className="min-w-0">
            <p className="lx-cell-sub">{L(`עכשיו חם · ${trend.windowDays} ימים`, `Trending · ${trend.windowDays} days`)}</p>
            <p className="lx-cell-title">{categoryName(trend.category, lang)}</p>
          </div>
        </Cell>
      ) : (
        <Cell to="/products" i={5} media={withImg[0] ? <Img src={sized(withImg[0].media.image, 420)} /> : null} soft>
          <Data>{attention.views + attention.clicks ? <><Eye size={12} /> {L(`${attention.views} צפיות · ${TREND_WINDOW_DAYS} ימים`, `${attention.views} views · ${TREND_WINDOW_DAYS} days`)}</> : <><Sparkles size={12} /> {L("נוסף לאחרונה", "Just added")}</>}</Data>
          <div className="min-w-0">
            <p className="lx-cell-title">{L("חדש בקטלוג", "New in the catalog")}</p>
            {withImg[0] ? <p className="lx-cell-sub lx-clamp-2 mt-0.5">{withImg[0].displayTitle}</p> : null}
          </div>
        </Cell>
      )}

      {/* 7 · Studio — the creator side */}
      <Go to="/studio" onPointerMove={spot} className="lx-cell lx-cell-studio lx-b-wide" style={{ "--i": 6 }}>
        <Data dot>{L("סטודיו פתוח · חינם", "Studio open · free")}</Data>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="lx-cell-title">{L("ממליצה על מוצרים? פתחי סטודיו", "Recommend products? Open a Studio")}</p>
            <p className="lx-cell-sub mt-1">{L("עמוד אישי, קישור מעקב לכל מוצר וספירת קליקים אמיתית.", "Your page, a tracking link per product and real click counts.")}</p>
          </div>
          <span className="lx-cell-go" aria-hidden="true"><Sparkles size={16} /></span>
        </div>
      </Go>
    </div>
  );
}

/* ------------------------------------------------------------------- hero */

export function HomeHero({ graph, navigate }) {
  const { L, lang } = useL();
  const { loading } = useMarketplace();
  // When this catalog snapshot reached the page (it is read once per visit).
  const loadedAt = useMemo(() => new Date(), [graph]);
  const time = loadedAt.toLocaleTimeString(lang === "he" ? "he-IL" : "en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="relative" aria-labelledby="lx-hero-title">
      <div aria-hidden="true" className="lx-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
      <div className="lx-wrap relative pb-2 pt-7 md:pt-14">
        <div className="lx-stagger mx-auto max-w-3xl text-center">
          <div className="flex justify-center" style={{ "--i": 0 }}>
            <span className="lx-pill lx-glass" role="status">
              <span className="lx-dot" aria-hidden="true" />
              {loading && !graph.products.length
                ? L("טוען את הקטלוג מהענן…", "Loading the catalog from the cloud…")
                : L(`נתונים אמיתיים מהקטלוג · נטענו ב־${time}`, `Real catalog data · loaded at ${time}`)}
            </span>
          </div>
          <h1 id="lx-hero-title" className="lx-display mt-5 text-[44px] leading-[1.02] sm:text-[62px] lg:text-[84px]" style={{ "--i": 1, letterSpacing: "-0.035em" }}>
            {/* inline-block: each gradient spans its own words, so the short line gets the full colour range */}
            <span className="block"><span className="lx-gradient-text lx-gt-soft inline-block">{L("גלו מה שווה לקנות", "Discover what's worth buying")}</span></span>
            <span className="block"><span className="lx-gradient-text inline-block">{L("דרך אנשים.", "through people.")}</span></span>
          </h1>
          <p className="lx-mute mx-auto mt-4 max-w-xl text-[16px] leading-7 md:text-[18px]" style={{ "--i": 2 }}>
            {L(
              "מוצרים שיוצרים בחרו, אוספים, סרטונים וטרנדים — עם מחיר אמיתי, חנות ברורה וגילוי נאות.",
              "Creator-picked products, collections, reels and trends — with real prices, a clear store and honest disclosure."
            )}
          </p>
          <div className="relative z-10 mx-auto mt-7 max-w-2xl" style={{ "--i": 3 }}>
            <HeroSearch graph={graph} navigate={navigate} />
          </div>
        </div>
        <div className="mt-9 md:mt-14">
          <Bento graph={graph} />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- trust marquee */

/**
 * What a buyer can count on here — each line is something the site does today
 * — plus the stores the catalog's products actually come from (by name, from
 * the product records; no partner logos are implied).
 */
export function TrustMarquee({ graph }) {
  const { L } = useL();
  const stores = useMemo(() => [...new Set(graph.products.map((p) => p.merchant).filter(Boolean))].slice(0, 6), [graph]);
  const items = [
    { icon: ShieldCheck, text: L("קישור ישיר לחנות", "Direct store link") },
    { icon: BadgeCheck, text: L("כל תוצאה מראה למה היא כאן", "Every result shows why it's here") },
    { icon: Tag, text: L("גילוי נאות על כל קישור שותפים", "Disclosure on every affiliate link") },
    { icon: Clapperboard, text: L("סרטונים מסומנים: אמיתי או אנימציה", "Reels labelled: real or animation") },
    { icon: Eye, text: L("בלי ביקורות ודירוגים מומצאים", "No invented reviews or ratings") },
    { icon: Search, text: L("חיפוש בטקסט, בקול, בתמונה או בקישור", "Search by text, voice, photo or link") },
    { icon: Lock, text: L("חיפוש לפי תמונה נשאר במכשיר שלך", "Photo search stays on your device") },
    { icon: Sparkles, text: L("סטודיו חינם ליוצרות וליוצרים", "A free Studio for creators") },
  ];
  const group = (hidden) => (
    <div className="lx-marquee-group" aria-hidden={hidden || undefined}>
      {items.map(({ icon: Icon, text }) => (
        <span key={text} className="lx-trust" dir="auto">
          <span className="lx-trust-ico"><Icon size={14} /></span>
          {text}
        </span>
      ))}
      {stores.map((s) => (
        <span key={s} className="lx-trust lx-trust-store" dir="auto">
          <Store size={15} /> {L(`חנות בקטלוג: ${s}`, `Store in the catalog: ${s}`)}
        </span>
      ))}
    </div>
  );
  return (
    <section className="mt-10 md:mt-14" aria-label={L("למה אפשר לסמוך", "Why you can trust it")}>
      <p className="lx-kicker mb-3 flex justify-center"><ShieldCheck size={14} /> {L("למה אפשר לסמוך על LikeLink2", "Why you can trust LikeLink2")}</p>
      <div className="lx-marquee">
        <div className="lx-marquee-track">
          {group(false)}
          {group(true)}
        </div>
      </div>
    </section>
  );
}
