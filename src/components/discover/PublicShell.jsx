// Public site chrome, on LTK's idea: a white header (the logo, a rounded
// search, "הרשמה" and "כניסה", a menu button), a white dropdown menu with
// every page in plain words, a quiet dock on mobile and a light footer. Light
// and carbon-dark themes follow the device until the visitor picks one. The
// Studio is a separate, dark surface — the header only links to it.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Compass, Heart, Home, LogIn, Menu, Moon, Play, Ruler, Search, Sun, UserPlus, X, Languages } from "lucide-react";
import { Go, HoverTips, useL } from "./kit";
import { withBase } from "../../lib/basePath.js";
import { PREFERRED_SOURCE, preferredSourceLive } from "../../lib/growth/preferredSource.js";

const THEME_KEY = "ll_theme";
const PAPER = { light: "#ffffff", dark: "#070709" };

// "הרשמה" and "כניסה" open the Studio's own form on the right tab
// (StudioEntrance reads ?auth=). Buying never needs an account.
export const STUDIO_SIGNUP = "/studio?auth=signup";
export const STUDIO_LOGIN = "/studio?auth=login";

function storedTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "";
  } catch {
    return "";
  }
}

function systemTheme() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** The visitor's choice, else the device's. Kept on this device only. */
function useTheme() {
  const [choice, setChoice] = useState(storedTheme);
  const [system, setSystem] = useState(systemTheme);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const theme = choice || system;
  // Overscroll, safe areas and the browser bar match the canvas.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = { bg: document.body.style.background, meta: meta?.getAttribute("content") };
    document.body.style.background = PAPER[theme];
    meta?.setAttribute("content", PAPER[theme]);
    return () => {
      document.body.style.background = prev.bg;
      if (meta && prev.meta) meta.setAttribute("content", prev.meta);
    };
  }, [theme]);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setChoice(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  };
  return { theme, toggle };
}

export const PUBLIC_NAV = [
  { to: "/", type: "landing", he: "בית", en: "Home" },
  { to: "/discover", type: "discover", he: "גילוי", en: "Discover" },
  { to: "/products", type: "products", he: "מוצרים", en: "Products" },
  { to: "/creators", type: "creators", he: "יוצרים", en: "Creators" },
  { to: "/reels", type: "reels", he: "סרטונים", en: "Reels" },
  { to: "/trends", type: "trends", he: "טרנדים", en: "Trends" },
  { to: "/collections", type: "collections", he: "אוספים", en: "Collections" },
  { to: "/deals", type: "deals", he: "דילים", en: "Deals" },
];

const TABS = [
  { to: "/", type: "landing", icon: Home, he: "בית", en: "Home" },
  { to: "/discover", type: "discover", icon: Compass, he: "גילוי", en: "Discover" },
  { to: "/search", type: "search", icon: Search, he: "חיפוש", en: "Search" },
  { to: "/reels", type: "reels", icon: Play, he: "סרטונים", en: "Reels" },
  { to: "/saved", type: "saved", icon: Heart, he: "שמורים", en: "Saved" },
];

export function Logo() {
  return (
    <Go to="/" className="flex shrink-0 items-center gap-2" aria-label="LikeLink2">
      <span className="lx-logo-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M9.5 14.5l5-5M8 11l-1.6 1.6a3.4 3.4 0 004.8 4.8L13 15.8M16 13l1.6-1.6a3.4 3.4 0 00-4.8-4.8L11 8.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-[20px] tracking-tight" style={{ fontFamily: "Inter, var(--lx-ui)", fontWeight: 800, letterSpacing: "-0.03em" }} dir="ltr">
        LikeLink<span className="lx-gradient-text">2</span>
      </span>
    </Go>
  );
}

function LangToggle() {
  const { lang, setLang } = useL();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "he" ? "en" : "he")}
      className="lx-chip"
      aria-label={lang === "he" ? "Switch to English" : "מעבר לעברית"}
    >
      <Languages size={15} /> {lang === "he" ? "EN" : "עב"}
    </button>
  );
}

function HeaderSearch({ navigate }) {
  const { L } = useL();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="lx-top-search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      }}
    >
      <Search size={17} aria-hidden="true" />
      <label className="lx-sr" htmlFor="lx-header-q">{L("חיפוש", "Search")}</label>
      <input id="lx-header-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("חיפוש מוצרים ויוצרות", "Search products and creators")} enterKeyHint="search" />
    </form>
  );
}

// The menu, like LTK's: a white panel under the header with every page in
// plain words, the deals in colour, sign-in and sign-up, and one clear
// button for creators. Esc, the ✕ or a tap outside closes it.
const MENU_PAGES = [
  { to: "/discover", type: "discover", he: "גילוי", en: "Discover" },
  { to: "/products", type: "products", he: "מוצרים", en: "Shop" },
  { to: "/reels", type: "reels", he: "סרטונים", en: "Videos" },
  { to: "/creators", type: "creators", he: "יוצרות", en: "Creators" },
  { to: "/collections", type: "collections", he: "אוספים", en: "Collections" },
  { to: "/trends", type: "trends", he: "טרנדים", en: "Trends" },
  { to: "/deals", type: "deals", he: "דילים", en: "Deals", sale: true },
];
const MENU_TOOLS = [
  { to: "/size", type: "size", icon: Ruler, he: "מודד מידת טבעת וצמיד", en: "Ring & bracelet size meter" },
  { to: "/guide", type: "guide", icon: BookOpen, he: "המדריך החינמי", en: "The free guide" },
  { to: "/saved", type: "saved", icon: Heart, he: "שמורים", en: "Saved" },
];

function MenuPanel({ open, onClose, routeType, theme, onTheme, opener }) {
  const { L, he, lang, setLang } = useL();
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      onClose();
      opener.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector("a")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, opener]);
  if (!open) return null;
  const label = (n) => (he ? n.he : n.en);
  return (
    <>
      {/* A tap outside closes the menu and lands nowhere else. */}
      <div className="lx-dd-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} id="lx-menu" className="lx-dd" role="dialog" aria-label={L("תפריט", "Menu")}>
        <nav aria-label={L("ניווט ראשי", "Main navigation")}>
          <ul className="lx-dd-list">
            {MENU_PAGES.map((n) => (
              <li key={n.to}>
                <Go to={n.to} onClick={onClose} aria-current={routeType === n.type ? "page" : undefined} className={`lx-dd-link${n.sale ? " is-sale" : ""}`}>{label(n)}</Go>
              </li>
            ))}
          </ul>
          <ul className="lx-dd-list lx-dd-sub">
            {MENU_TOOLS.map(({ icon: Icon, ...n }) => (
              <li key={n.to}>
                <Go to={n.to} onClick={onClose} aria-current={routeType === n.type ? "page" : undefined} className="lx-dd-link lx-dd-small"><Icon size={17} aria-hidden="true" /> {label(n)}</Go>
              </li>
            ))}
          </ul>
          <ul className="lx-dd-list lx-dd-sub">
            <li><Go to={STUDIO_LOGIN} onClick={onClose} className="lx-dd-link lx-dd-small"><LogIn size={17} aria-hidden="true" /> {L("כניסה", "Log in")}</Go></li>
            <li><Go to={STUDIO_SIGNUP} onClick={onClose} className="lx-dd-link lx-dd-small"><UserPlus size={17} aria-hidden="true" /> {L("הרשמה", "Sign up")}</Go></li>
          </ul>
        </nav>
        <Go to="/join" onClick={onClose} className="lx-dd-cta">{L("הצטרפות כיוצרת", "Apply to be a creator")}</Go>
        <p className="lx-dd-note">{L("ההרשמה והכניסה הן לסטודיו של היוצרות. כדי לקנות לא צריך להירשם.", "Sign-up and log-in are for the creators' Studio. You can shop without an account.")}</p>
        <div className="lx-dd-foot">
          <button type="button" className="lx-dd-pill" onClick={() => setLang(lang === "he" ? "en" : "he")} aria-label={lang === "he" ? "Switch to English" : "מעבר לעברית"}>
            <Languages size={16} aria-hidden="true" /> {lang === "he" ? "English" : "עברית"}
          </button>
          <button type="button" className="lx-dd-pill" onClick={onTheme}>
            {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />} {theme === "dark" ? L("מצב בהיר", "Light mode") : L("מצב כהה", "Dark mode")}
          </button>
        </div>
      </div>
    </>
  );
}

export function PublicShell({ routeType, navigate, children, immersive = false }) {
  const { L, he } = useL();
  const [menu, setMenu] = useState(false);
  const { theme, toggle } = useTheme();
  const opener = useRef(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  useEffect(() => setMenu(false), [routeType]);
  const authTip = L("הסטודיו של היוצרות. כדי לקנות לא צריך להירשם.", "The creators' Studio. You can shop without an account.");

  return (
    <div className="lx" dir={he ? "rtl" : "ltr"} data-theme={theme}>
      <a href="#lx-main" className="lx-sr lx-skip">{L("דילוג לתוכן", "Skip to content")}</a>
      <header className="lx-top">
        <div className="lx-top-bar">
          <Logo />
          <HeaderSearch navigate={navigate} />
          <div className="lx-top-actions">
            <Go to="/search" className="lx-top-icon lx-top-phone" aria-label={L("חיפוש", "Search")}><Search size={20} /></Go>
            <Go to={STUDIO_SIGNUP} className="lx-top-btn lx-top-btn-line lx-top-wide" data-tip={authTip}>{L("הרשמה", "Sign up")}</Go>
            <Go to={STUDIO_LOGIN} className="lx-top-btn lx-top-btn-dark" data-tip={authTip}>{L("כניסה", "Log in")}</Go>
            <button ref={opener} type="button" className="lx-top-icon" data-notip onClick={() => setMenu((m) => !m)} aria-label={menu ? L("סגירת התפריט", "Close menu") : L("תפריט", "Menu")} aria-expanded={menu} aria-controls="lx-menu">
              {menu ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        <MenuPanel open={menu} onClose={closeMenu} routeType={routeType} theme={theme} onTheme={toggle} opener={opener} />
      </header>

      <main id="lx-main" className={immersive ? "" : "pb-28 lg:pb-0"}>{children}</main>

      {!immersive ? <Footer /> : null}
      <HoverTips />

      {/* Floating dock: the active tab fills with colour and bounces once. On a
          product page the buy bar takes the bottom instead (two stacked bars
          covered a fifth of a phone's first screen); the header keeps menu and search. */}
      {routeType === "product" ? null : <div className="lg:hidden">
        <nav className="lx-dock" aria-label={L("ניווט מהיר", "Quick navigation")}>
          <div className="lx-dock-bar lx-glass-strong">
            {TABS.map(({ to, type, icon: Icon, he: h, en }) => (
              <Go key={to} to={to} className="lx-dock-tab" aria-current={routeType === type ? "page" : undefined}>
                <Icon size={21} strokeWidth={routeType === type ? 2.2 : 1.8} aria-hidden="true" />
                {he ? h : en}
              </Go>
            ))}
          </div>
        </nav>
      </div>}

    </div>
  );
}

function Footer() {
  const { L, he } = useL();
  const year = new Date().getFullYear();
  const cols = [
    { title: L("לגלות", "Discover"), links: PUBLIC_NAV.slice(1) },
    {
      title: L("ליוצרים ולסוחרים", "Creators & merchants"),
      links: [
        { to: "/join", he: "דף יוצרת בחינם", en: "A free creator page" },
        { to: "/studio", he: "פתיחת חנות / כניסה לסטודיו", en: "Open a shop / Studio sign-in" },
        { to: "/creators", he: "קהילת היוצרים", en: "Creator community" },
        { to: "/merchants", he: "יש לך מוצרים?", en: "Have products?" },
        { to: "/guide", he: "המדריך החינמי של לונה", en: "Luna's free guide" },
        { to: "/size", he: "מודד מידת טבעת וצמיד", en: "Ring & bracelet size meter" },
      ],
    },
  ];
  return (
    <footer className="lx-footer mt-16 pb-32 pt-12 lg:pb-12">
      <div className="lx-wrap grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="lx-display mt-4 max-w-sm text-[22px] leading-snug">
            {L("המקום שבו תוכן, אנשים, מוצרים וטרנדים נפגשים.", "Where content, people, products and trends meet.")}
          </p>
          <p className="lx-mute mt-3 max-w-sm text-[13px] leading-6">
            {L(
              "חלק מהקישורים באתר הם קישורי שותפים: היוצר/ת עשוי/ה לקבל עמלה על רכישה, בלי עלות נוספת לך. מחירים ומלאי נקבעים אצל החנות.",
              "Some links are affiliate links: the creator may earn a commission at no extra cost to you. Prices and stock are set by the store."
            )}
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="mb-3 text-sm font-bold">{c.title}</p>
            <ul className="space-y-2.5 text-[14px]">
              {c.links.map((l) => (
                <li key={l.to}>
                  <Go to={l.to} className="lx-mute hover:underline">{he ? l.he : l.en}</Go>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* Legal pack + pricing are static pages (public/legal/*, public/pricing.html) —
          plain links (full page load), not SPA routes. */}
      <nav aria-label={L("מסמכים משפטיים", "Legal")} className="lx-wrap mt-8 flex flex-wrap gap-x-4 gap-y-2 text-[12px]">
        {[
          ["/pricing", "מסלולים ומחירים", "Plans & pricing"],
          ["/legal/terms", "תנאי שימוש", "Terms"],
          ["/legal/privacy", "פרטיות", "Privacy"],
          ["/legal/cancellation", "ביטולים והחזרים", "Cancellations"],
          ["/legal/affiliate-disclosure", "גילוי נאות", "Disclosure"],
          ["/legal/accessibility", "נגישות", "Accessibility"],
          ["/legal", "כל המסמכים", "All documents"],
        ].map(([href, heLabel, enLabel]) => (
          <a key={href} href={withBase(href)} className="lx-mute hover:underline">{he ? heLabel : enLabel}</a>
        ))}
      </nav>
      {preferredSourceLive() ? (
        <p className="lx-wrap mt-6 text-[12.5px]">
          <a href={PREFERRED_SOURCE.url} target="_blank" rel="noopener" className="lx-mute hover:underline" data-tip={L("בגוגל אפשר לבחור אתרים מועדפים: התוכן שלהם יופיע לך יותר בחיפוש.", "In Google you can choose preferred sites: you will see more of them in Search.")}>
            {L("להוסיף את LikeLink2 כמקור מועדף בגוגל", "Add LikeLink2 as a preferred source on Google")}
          </a>
        </p>
      ) : null}
      <div className="lx-wrap mt-6 flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <span className="lx-mute">© {year} LikeLink · כל הזכויות שמורות</span>
        <LangToggle />
      </div>
    </footer>
  );
}
