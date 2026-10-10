// Public site chrome: floating glass header (desktop nav + inline search),
// floating dock on mobile, full-menu drawer and footer, over the aurora
// background. Light and carbon-dark themes follow the device until the visitor
// picks one. The Studio is a separate, dark surface — the header only links to it.
import React, { useEffect, useRef, useState } from "react";
import { Compass, Heart, Home, Menu, Moon, Play, Search, Sparkles, Sun, X, Languages } from "lucide-react";
import { Go, HoverTips, useL } from "./kit";
import { withBase } from "../../lib/basePath.js";

const THEME_KEY = "ll_theme";
const PAPER = { light: "#f6f6fb", dark: "#070709" };

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

function ThemeToggle({ theme, onToggle, withLabel = false }) {
  const { L } = useL();
  const dark = theme === "dark";
  const label = dark ? L("מצב בהיר", "Light mode") : L("מצב כהה", "Dark mode");
  if (withLabel) {
    return (
      <button type="button" onClick={onToggle} className="lx-chip" aria-label={label}>
        {dark ? <Sun size={15} /> : <Moon size={15} />} {label}
      </button>
    );
  }
  return (
    <button type="button" onClick={onToggle} className="lx-icon-btn" aria-label={label} title={label}>
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
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

// The Studio is LikeLink's AI side: the aura says "alive", the dot says "open now".
function StudioLink({ compact = false }) {
  const { L } = useL();
  return (
    <Go to="/studio" className="lx-studio">
      <Sparkles size={15} style={{ color: "#cbbcff" }} aria-hidden="true" />
      {compact ? "Studio" : L("פתחו את ה־Studio", "Open the Studio")}
      <span className="lx-dot" aria-hidden="true" />
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
      className="hidden xl:flex items-center gap-2 rounded-full border px-3 transition-[width,border-color] duration-300 focus-within:w-[280px]"
      style={{ borderColor: "var(--lx-line)", background: "var(--lx-surface)", height: 40, width: 220 }}
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      }}
    >
      <Search size={16} className="lx-mute shrink-0" />
      <label className="lx-sr" htmlFor="lx-header-q">{L("חיפוש", "Search")}</label>
      <input id="lx-header-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("מה מחפשים?", "What are you looking for?")} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
    </form>
  );
}

function Drawer({ open, onClose, routeType, theme, onTheme }) {
  const { L, he } = useL();
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector("a,button")?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={L("תפריט", "Menu")}>
      <button type="button" className="absolute inset-0 h-full w-full" style={{ background: "rgba(23,19,31,.42)" }} onClick={onClose} aria-label={L("סגירה", "Close")} />
      <div ref={panel} className="lx-sheet absolute inset-y-0 flex w-[min(86vw,360px)] flex-col overflow-y-auto p-5" style={{ background: "var(--lx-paper)", [he ? "right" : "left"]: 0 }}>
        <div className="mb-6 flex items-center justify-between">
          <span className="lx-display text-xl">{L("לאן הולכים?", "Where to?")}</span>
          <button type="button" className="lx-icon-btn" onClick={onClose} aria-label={L("סגירה", "Close")}><X size={18} /></button>
        </div>
        <nav className="flex flex-col" aria-label={L("ניווט ראשי", "Main navigation")}>
          {[...PUBLIC_NAV, { to: "/search", type: "search", he: "חיפוש", en: "Search" }, { to: "/saved", type: "saved", he: "שמורים", en: "Saved" }].map((n) => (
            <Go key={n.to} to={n.to} onClick={onClose} aria-current={routeType === n.type ? "page" : undefined} className="lx-display border-b py-3.5 text-[22px]" style={{ borderColor: "var(--lx-line)", color: routeType === n.type ? "var(--lx-rose)" : "var(--lx-ink)" }}>
              {he ? n.he : n.en}
            </Go>
          ))}
        </nav>
        <div className="mt-6 flex flex-col gap-3">
          <StudioLink />
          <Go to="/merchants" onClick={onClose} className="lx-btn lx-btn-ghost">{L("יש לך מוצרים? לסוחרים", "Have products? For merchants")}</Go>
          <div className="flex flex-wrap gap-2"><LangToggle /><ThemeToggle theme={theme} onToggle={onTheme} withLabel /></div>
        </div>
      </div>
    </div>
  );
}

export function PublicShell({ routeType, navigate, children, immersive = false }) {
  const { L, he } = useL();
  const [menu, setMenu] = useState(false);
  const { theme, toggle } = useTheme();
  useEffect(() => setMenu(false), [routeType]);

  return (
    <div className="lx" dir={he ? "rtl" : "ltr"} data-theme={theme}>
      <div className="lx-aurora" aria-hidden="true"><span /><span /><span /><span /></div>
      <a href="#lx-main" className="lx-sr lx-skip">{L("דילוג לתוכן", "Skip to content")}</a>
      <header className="lx-header">
        <div className="lx-header-bar lx-glass-strong flex h-[58px] items-center gap-3 px-2.5 md:h-[62px] md:gap-4 md:px-4">
          <Logo />
          <nav className="hidden flex-1 items-center justify-center gap-5 lg:flex" aria-label={L("ניווט ראשי", "Main navigation")}>
            {PUBLIC_NAV.map((n) => (
              <Go key={n.to} to={n.to} className="lx-nav-link" aria-current={routeType === n.type ? "page" : undefined}>{he ? n.he : n.en}</Go>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2 lg:ms-0">
            <HeaderSearch navigate={navigate} />
            <div className="hidden sm:block xl:hidden"><Go to="/search" className="lx-icon-btn" aria-label={L("חיפוש", "Search")}><Search size={18} /></Go></div>
            <div className="hidden sm:block"><ThemeToggle theme={theme} onToggle={toggle} /></div>
            <div className="hidden md:block"><LangToggle /></div>
            <div className="hidden sm:block"><StudioLink /></div>
            <div className="sm:hidden"><StudioLink compact /></div>
            <div className="lg:hidden"><button type="button" className="lx-icon-btn" onClick={() => setMenu(true)} aria-label={L("תפריט", "Menu")} aria-expanded={menu}><Menu size={18} /></button></div>
          </div>
        </div>
      </header>

      <main id="lx-main" className={immersive ? "" : "pb-28 lg:pb-0"}>{children}</main>

      {!immersive ? <Footer /> : null}
      <HoverTips />

      {/* Floating dock: the active tab fills with colour and bounces once. */}
      <div className="lg:hidden">
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
      </div>

      <Drawer open={menu} onClose={() => setMenu(false)} routeType={routeType} theme={theme} onTheme={toggle} />
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
        { to: "/studio", he: "פתיחת Studio", en: "Open the Studio" },
        { to: "/creators", he: "קהילת היוצרים", en: "Creator community" },
        { to: "/merchants", he: "יש לך מוצרים?", en: "Have products?" },
        { to: "/guide", he: "המדריך החינמי של לונה", en: "Luna's free guide" },
        { to: "/size", he: "מודד מידת טבעת וצמיד", en: "Ring & bracelet size meter" },
      ],
    },
  ];
  return (
    <footer className="mt-16 border-t pb-32 pt-12 lg:pb-12" style={{ borderColor: "var(--lx-line)", background: "var(--lx-surface)" }}>
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
      <div className="lx-wrap mt-6 flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <span className="lx-mute">© {year} LikeLink · כל הזכויות שמורות</span>
        <LangToggle />
      </div>
    </footer>
  );
}
