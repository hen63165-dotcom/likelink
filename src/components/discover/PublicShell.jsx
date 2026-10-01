// Public site chrome: editorial header (desktop nav + inline search), mobile
// tab bar, full-menu drawer and footer. The Studio is a separate, dark
// surface — the header only links to it.
import React, { useEffect, useRef, useState } from "react";
import { Compass, Heart, Home, Menu, Play, Search, Sparkles, X, Languages } from "lucide-react";
import { Go, useL } from "./kit";

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
      <span className="flex h-9 w-9 items-center justify-center rounded-[11px] text-white" style={{ background: "linear-gradient(140deg, var(--lx-rose), var(--lx-apricot))" }} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M9.5 14.5l5-5M8 11l-1.6 1.6a3.4 3.4 0 004.8 4.8L13 15.8M16 13l1.6-1.6a3.4 3.4 0 00-4.8-4.8L11 8.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="lx-display text-[21px] tracking-tight" style={{ fontWeight: 900 }}>LikeLink<span style={{ color: "var(--lx-rose)" }}>2</span></span>
    </Go>
  );
}

function StudioLink({ compact = false }) {
  const { L } = useL();
  return (
    <Go to="/studio" className={`lx-btn lx-btn-primary ${compact ? "lx-btn-sm" : ""}`} style={{ background: "linear-gradient(135deg,#0b0d1a,#2b2350)" }}>
      <Sparkles size={15} style={{ color: "#b38dff" }} />
      {compact ? "Studio" : L("פתחו את ה־Studio", "Open the Studio")}
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
      className="hidden xl:flex items-center gap-2 rounded-full border px-3"
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

function Drawer({ open, onClose, routeType }) {
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
          <div><LangToggle /></div>
        </div>
      </div>
    </div>
  );
}

export function PublicShell({ routeType, navigate, children, immersive = false }) {
  const { L, he } = useL();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [routeType]);

  return (
    <div className="lx" dir={he ? "rtl" : "ltr"}>
      <a href="#lx-main" className="lx-sr lx-skip">{L("דילוג לתוכן", "Skip to content")}</a>
      <header className="lx-header">
        <div className="lx-wrap flex h-16 items-center gap-4">
          <Logo />
          <nav className="hidden flex-1 items-center justify-center gap-5 lg:flex" aria-label={L("ניווט ראשי", "Main navigation")}>
            {PUBLIC_NAV.map((n) => (
              <Go key={n.to} to={n.to} className="lx-nav-link" aria-current={routeType === n.type ? "page" : undefined}>{he ? n.he : n.en}</Go>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2 lg:ms-0">
            <HeaderSearch navigate={navigate} />
            <div className="xl:hidden"><Go to="/search" className="lx-icon-btn" aria-label={L("חיפוש", "Search")}><Search size={18} /></Go></div>
            <div className="hidden md:block"><LangToggle /></div>
            <div className="hidden sm:block"><StudioLink /></div>
            <div className="sm:hidden"><StudioLink compact /></div>
            <div className="lg:hidden"><button type="button" className="lx-icon-btn" onClick={() => setMenu(true)} aria-label={L("תפריט", "Menu")} aria-expanded={menu}><Menu size={18} /></button></div>
          </div>
        </div>
      </header>

      <main id="lx-main" className={immersive ? "" : "pb-24 lg:pb-0"}>{children}</main>

      {!immersive ? <Footer /> : null}

      <nav className="lx-tabbar lg:hidden" aria-label={L("ניווט מהיר", "Quick navigation")}>
        <div className="grid grid-cols-5">
          {TABS.map(({ to, type, icon: Icon, he: h, en }) => (
            <Go key={to} to={to} className="lx-tab" aria-current={routeType === type ? "page" : undefined}>
              <Icon size={21} strokeWidth={routeType === type ? 2.4 : 1.9} />
              {he ? h : en}
            </Go>
          ))}
        </div>
      </nav>

      <Drawer open={menu} onClose={() => setMenu(false)} routeType={routeType} />
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
      ],
    },
  ];
  return (
    <footer className="mt-16 border-t pb-28 pt-12 lg:pb-12" style={{ borderColor: "var(--lx-line)", background: "var(--lx-surface)" }}>
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
          <a key={href} href={href} className="lx-mute hover:underline">{he ? heLabel : enLabel}</a>
        ))}
      </nav>
      <div className="lx-wrap mt-6 flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <span className="lx-mute">© {year} LikeLink2</span>
        <LangToggle />
      </div>
    </footer>
  );
}
