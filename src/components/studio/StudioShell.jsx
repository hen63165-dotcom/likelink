/**
 * StudioShell — LikeLink2 dark premium Studio shell (2026 redesign).
 *
 * A Hebrew-first (RTL) command center that replaces the old cream marketplace
 * shell for the seller studio. Everything wired here reuses the REAL existing
 * systems — no mocks, no invented data:
 *   • MarketplaceContext  — the single live data layer (products/sales/clicks)
 *   • SellView            — the full working seller studio (products, launch…)
 *   • LunaAssistant       — the real cloud Luna command assistant
 *   • StudioHub           — product intelligence / content / launch / trends
 *   • SellerEngagement    — real UGC engagement (leaderboard, streaks, badges)
 *   • AutoVideoStudio     — real in-browser 9:16 video rendering engine
 *   • AvatarStudio        — real persona / brand-world editor (Creator Lab)
 *   • MarketingHub        — real multi-platform publishing
 *   • CampaignBuilder     — real shareable campaign builder
 *   • GrowthOS            — real trend radar / opportunity / distribution
 *   • AnalyticsDashboard  — real metrics computed from the seller's own data
 *   • AutoPilot           — real channel automation engine
 *   • trustVerification   — the real Trust verification engine
 * Every panel shows a truthful empty/permission/unavailable state when data
 * or integrations are missing. Nothing is fabricated.
 */
import React, { useEffect, useMemo, useState, useCallback, Suspense, lazy } from "react";
import {
  LayoutDashboard, Package, Sparkles, Clapperboard, UserCog, FileText,
  Megaphone, TrendingUp, Send, BarChart3, ShieldCheck, Bot, Lightbulb,
  Settings, LogOut, Moon, Sun, Languages, ChevronLeft, Store, Copy,
  Activity, Menu,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useTheme } from "../../context/ThemeContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import {
  verifyProduct, trustGateReport, TRUST_STATE,
} from "../../lib/cloud/trustVerification.js";
import { authConfigured, signOutSeller } from "../../lib/auth.js";
import {
  calculateMonetizationPotential, checkMonetizationEligibility,
} from "../../lib/monetization.js";
import { PAYOUT_METHODS, PAYOUT_LABELS } from "../../constants/keys.js";
import { money } from "../../utils/helpers.js";
import { EmptyState, Button, LabeledInput, Toast, LoadingScreen } from "../ui/index.jsx";
import { AnalyticsDashboard } from "../sell/AnalyticsDashboard";
import AutoPilot from "../sell/AutoPilot";
import SellerEngagement from "../sell/SellerEngagement";
import CampaignBuilder from "../sell/CampaignBuilder";
import StudioHub from "../sell/StudioHub";
import GrowthOS from "../growth/GrowthOS";
import LunaAssistant from "../ambassador/LunaAssistant";
import AvatarStudio from "../ambassador/AvatarStudio";
import AutoVideoStudio from "../video/AutoVideoStudio";
import MarketingHub from "../MarketingHub";

// The full real seller studio (products, collections, payouts, launch) is
// code-split so it never blocks the marketplace first paint.
const SellView = lazy(() => import("../sell/SellView"));

const VIEW_IDS = {
  OVERVIEW: "overview",
  LUNA: "luna",
  PRODUCTS: "products",
  PRODUCT_INTELLIGENCE: "product-intelligence",
  SELF_MARKETING: "self-marketing",
  UGC: "ugc",
  VIDEO: "video",
  CREATOR_LAB: "creator-lab",
  CONTENT: "content",
  CAMPAIGNS: "campaigns",
  TRENDS: "trends",
  PUBLISHING: "publishing",
  PERFORMANCE: "performance",
  TRUST: "trust",
  AUTOPILOT: "autopilot",
  RECOMMENDATIONS: "recommendations",
  SETTINGS: "settings",
};

const TIERS = {
  starter: { he: "מסלול Starter", en: "Starter plan" },
  pro: { he: "מסלול Pro", en: "Pro plan" },
  premium: { he: "מסלול Premium", en: "Premium plan" },
};

function SectionLabel({ children }) {
  return (
    <div className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
      {children}
    </div>
  );
}

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`ll-nav-item group relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium${active ? " ll-nav-active" : ""}`}
    >
      {active && (
        <span
          className="absolute right-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full"
          style={{ background: "var(--accent)" }}
        />
      )}
      <Icon size={17} strokeWidth={active ? 2.4 : 2} />
      <span className="truncate">{item.label}</span>
      {item.chip && (
        <span
          className="mr-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
        >
          {item.chip}
        </span>
      )}
    </button>
  );
}

const OverviewPanel = ({ onNavigate }) => {
  const { lang } = useI18n();
  const { products, sales, clicks, loading, error } = useMarketplace();
  const myProducts = Array.isArray(products) ? products : [];
  const mySales = Array.isArray(sales) ? sales : [];
  const myClicks = Array.isArray(clicks) ? clicks : [];
  const revenue = useMemo(
    () => mySales.reduce((s, x) => s + (Number(x.amount) || 0), 0),
    [mySales],
  );
  const liveCount = useMemo(
    () => myProducts.filter((p) => p.status === "active" || p.status === "published").length,
    [myProducts],
  );
  const trustReady = useMemo(
    () => myProducts.filter((p) => p.trust?.verified || p.trustLevel === TRUST_STATE.VERIFIED).length,
    [myProducts],
  );

  const stats = [
    { label: lang === "he" ? "מוצרים חיים" : "Live products", value: String(liveCount), icon: Package },
    { label: lang === "he" ? "הכנסות מאומתות" : "Verified revenue", value: money(revenue || 0, lang), icon: BarChart3 },
    { label: lang === "he" ? "לחיצות" : "Clicks", value: String(myClicks.length), icon: Activity },
    { label: lang === "he" ? "מוצרים מאומתים" : "Trust verified", value: `${trustReady}/${myProducts.length}`, icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}>
          {String(error.message || error)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="ll-card rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-faint)]">{s.label}</span>
                <Icon size={16} className="text-[var(--accent)]" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-[var(--text)]">
                {loading ? "…" : s.value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="ll-card rounded-2xl p-5">
          <h3 className="ll-grad-text text-lg font-bold">
            {lang === "he" ? "מרכז הפעולות שלך" : "Your action center"}
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {lang === "he"
              ? "הכל מחובר למערכות האמיתיות שלך — אין נתוני דמו."
              : "Everything wired to your real systems — no demo data."}
          </p>
          <div className="mt-4 space-y-2">
            {[
              { label: lang === "he" ? "לונה — מרכז הבקרה" : "Luna — command center", view: VIEW_IDS.LUNA, icon: Sparkles },
              { label: lang === "he" ? "מוצרים" : "Products", view: VIEW_IDS.PRODUCTS, icon: Package },
              { label: lang === "he" ? "AI Video" : "AI Video", view: VIEW_IDS.VIDEO, icon: Clapperboard },
              { label: lang === "he" ? "פרסום" : "Publishing", view: VIEW_IDS.PUBLISHING, icon: Send },
            ].map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.view}
                  onClick={() => onNavigate(a.view)}
                  className="ll-nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
                  style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
                >
                  <Icon size={16} className="text-[var(--accent)]" />
                  {a.label}
                  <ChevronLeft size={15} className="mr-auto rotate-180 text-[var(--text-faint)]" />
                </button>
              );
            })}
          </div>
        </div>
        <div className="ll-card rounded-2xl p-5">
          <h3 className="text-lg font-bold text-[var(--text)]">
            {lang === "he" ? "פעילות אחרונה" : "Recent activity"}
          </h3>
          {loading ? (
            <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg" style={{ background: "var(--bg-subtle)" }} />
            ))}</div>
          ) : mySales.length === 0 ? (
            <EmptyState
              icon={Activity}
              title={lang === "he" ? "אין עדיין הזמנות" : "No orders yet"}
              body={lang === "he" ? "כשיגיעו הזמנות אמיתיות הן יופיעו כאן מיד."
                : "Real orders will appear here the moment they arrive."}
            />
          ) : (
            <div className="mt-4 space-y-2">
              {mySales.slice(0, 5).map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-subtle)" }}>
                  <span className="truncate text-sm text-[var(--text-secondary)]">
                    {s.productName || s.productTitle || (lang === "he" ? "הזמנה" : "Order")}
                  </span>
                  <span className="text-sm font-bold text-[var(--accent)]">{money(Number(s.amount) || 0, lang)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Truthful auth gate — routes to the real login/registration flow (SellView). */
function AuthGate({ onNavigate, feature }) {
  const { lang } = useI18n();
  return (
    <EmptyState
      icon={ShieldCheck}
      title={lang === "he" ? "נדרש חשבון מוכר" : "Seller account required"}
      body={lang === "he"
        ? `כדי להשתמש ב${feature} צריך חשבון מוכר מאומת. עברו למסך המוצרים להרשמה או התחברות אמיתית.`
        : `${feature} requires a verified seller account. Open the products screen to sign in or register.`}
      action={
        <Button onClick={() => onNavigate(VIEW_IDS.PRODUCTS)}>
          {lang === "he" ? "להתחברות / הרשמה" : "Sign in / Register"}
        </Button>
      }
    />
  );
}

function LunaPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { currentMarketer: marketer } = useMarketplace();
  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "לונה" : "Luna"} />;
  return (
    <div className="space-y-4">
      <div className="ll-card rounded-2xl p-5">
        <h3 className="text-lg font-bold text-[var(--text)]">
          {lang === "he" ? "לונה — מרכז הבקרה החכם" : "Luna — the smart command center"}
        </h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {lang === "he"
            ? "לונה מחוברת לענן האמיתי שלך: רעיונות, משימות אינטליגנציה וסטטוס אמיתי — רק בלחיצה שלך."
            : "Luna is wired to your real cloud: ideas, intelligence tasks and real status — only on your click."}
        </p>
      </div>
      <LunaAssistant
        marketer={marketer}
        onOpenStudio={() => onNavigate(VIEW_IDS.CREATOR_LAB)}
        onOpenCampaign={() => onNavigate(VIEW_IDS.CAMPAIGNS)}
      />
    </div>
  );
}

function VideoPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { showToast, currentMarketer: marketer } = useMarketplace();
  const mine = useMyProducts();
  const [selected, setSelected] = useState(null);

  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "AI Video" : "AI Video"} />;
  if (selected) {
    return (
      <AutoVideoStudio
        product={selected}
        marketer={marketer}
        onClose={() => setSelected(null)}
        showToast={showToast}
      />
    );
  }
  if (mine.length === 0) {
    return (
      <EmptyState
        icon={Clapperboard}
        title={lang === "he" ? "אין מוצרים ליצירת וידאו" : "No products to render"}
        body={lang === "he"
          ? "הוסיפי מוצר מאושר (עם תמונת http) ואז תוכלי ליצור קליפ 9:16 אמיתי בדפדפן."
          : "Add an approved product (with an http image) and you can render a real 9:16 clip in the browser."}
        action={<Button onClick={() => onNavigate(VIEW_IDS.PRODUCTS)}>{lang === "he" ? "למוצרים" : "Go to products"}</Button>}
      />
    );
  }
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "AI Video — בחרי מוצר לקליפ" : "AI Video — pick a product to render"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mine.map((p) => (
          <button key={p.id} onClick={() => setSelected(p)} className="ll-card ll-tap rounded-2xl p-4 text-right">
            <div className="text-sm font-bold" style={{ color: "var(--text)" }}>{p.title}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{money(Number(p.price) || 0, lang)}</div>
            <span className="mt-3 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {lang === "he" ? "צרי קליפ עכשיו" : "Render clip"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CreatorLabPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { showToast, onUpdateMarketer, currentMarketer: marketer } = useMarketplace();
  const [closed, setClosed] = useState(false);
  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "מעבדת היוצרים" : "the Creator Lab"} />;
  if (closed) {
    return (
      <EmptyState
        icon={UserCog}
        title={lang === "he" ? "מעבדת היוצרים סגורה" : "Creator Lab closed"}
        body={lang === "he" ? "הדמות נשמרה לכל הפרסומים." : "Your persona was saved for all publications."}
        action={<Button onClick={() => setClosed(false)}>{lang === "he" ? "פתחי שוב" : "Reopen"}</Button>}
      />
    );
  }
  return (
    <AvatarStudio
      marketer={marketer}
      lang={lang}
      onClose={() => setClosed(true)}
      onSave={(brandWorld) => {
        onUpdateMarketer(marketer.id, { brandWorld });
        setClosed(true);
      }}
      showToast={showToast}
    />
  );
}

function ContentPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { showToast, currentMarketer: marketer } = useMarketplace();
  const mine = useMyProducts();
  const [product, setProduct] = useState(null);
  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "מרכז התוכן" : "the Content hub"} />;
  if (mine.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={lang === "he" ? "אין מוצרים ליצירת תוכן" : "No products yet"}
        body={lang === "he" ? "הוסיפי מוצר ואז תוכלי לפרסם אותו לכל הפלטפורמות." : "Add a product to publish it across platforms."}
        action={<Button onClick={() => onNavigate(VIEW_IDS.PRODUCTS)}>{lang === "he" ? "למוצרים" : "Go to products"}</Button>}
      />
    );
  }
  if (product) {
    return (
      <MarketingHub
        product={product}
        sellerId={marketer.id}
        onClose={() => setProduct(null)}
        showToast={showToast}
      />
    );
  }
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "מרכז תוכן — בחרי מוצר לפרסום" : "Content hub — pick a product"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mine.map((p) => (
          <button key={p.id} onClick={() => setProduct(p)} className="ll-card ll-tap rounded-2xl p-4 text-right">
            <div className="text-sm font-bold" style={{ color: "var(--text)" }}>{p.title}</div>
            <span className="mt-3 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {lang === "he" ? "פרסום" : "Publish"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CampaignsPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { showToast, currentMarketer: marketer } = useMarketplace();
  const mine = useMyProducts();
  const [closed, setClosed] = useState(false);
  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "הקמפיינים" : "Campaigns"} />;
  if (closed) {
    return (
      <EmptyState
        icon={Megaphone}
        title={lang === "he" ? "הקמפיין נסגר" : "Campaign closed"}
        body={lang === "he" ? "הקמפיין נבנה ושותף מהמערכת האמיתית." : "The campaign was built and shared from the real system."}
        action={<Button onClick={() => setClosed(false)}>{lang === "he" ? "קמפיין חדש" : "New campaign"}</Button>}
      />
    );
  }
  const slug = typeof marketer.slug === "string" && marketer.slug ? marketer.slug : marketer.id;
  const myLink = `${window.location.origin}/u/${encodeURIComponent(slug)}`;
  return (
    <CampaignBuilder
      marketer={marketer}
      products={mine}
      link={myLink}
      lang={lang}
      onClose={() => setClosed(true)}
      showToast={showToast}
    />
  );
}

/** Publishing — one-click publish per product through the REAL store API. */
function PublishingPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { showToast, currentMarketer: marketer } = useMarketplace();
  const mine = useMyProducts();
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState({});

  async function publish(product) {
    setBusy((b) => ({ ...b, [product.id]: true }));
    try {
      const response = await fetch("/api/store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${(typeof window !== "undefined" && window.__likelink?.token) || ""}`,
        },
        body: JSON.stringify({ mode: "publish", productId: product.id }),
      });
      const result = await response.json();
      setResults((r) => ({ ...r, [product.id]: result }));
      showToast(result.ok
        ? (result.status === "PUBLISHED" ? (lang === "he" ? "פורסם בהצלחה ✅" : "Published ✅") : String(result.status || "ok"))
        : (result.error || (lang === "he" ? "הפרסום נכשל" : "Publish failed")));
    } catch (e) {
      setResults((r) => ({ ...r, [product.id]: { ok: false, error: e?.message || "network_error" } }));
      showToast(lang === "he" ? "שגיאת רשת בפרסום" : "Network error while publishing");
    } finally {
      setBusy((b) => ({ ...b, [product.id]: false }));
    }
  }

  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "הפרסום" : "Publishing"} />;
  if (mine.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title={lang === "he" ? "אין מוצרים לפרסום" : "Nothing to publish"}
        body={lang === "he" ? "הוסיפי מוצר מאושר ואז פרסמי אותו בלחיצה אחת." : "Add an approved product, then publish it in one click."}
        action={<Button onClick={() => onNavigate(VIEW_IDS.PRODUCTS)}>{lang === "he" ? "למוצרים" : "Go to products"}</Button>}
      />
    );
  }
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "פרסום — ערוצים אמיתיים" : "Publishing — real channels"}
      </h3>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {lang === "he"
          ? "פרסום חד-פעמי כאן; פרסום מתוזמן מופעל דרך הטייס האוטומטי."
          : "One-off publishing here; scheduled publishing runs through AutoPilot."}
      </p>
      <div className="space-y-3">
        {mine.map((p) => {
          const r = results[p.id];
          return (
            <div key={p.id} className="ll-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>{p.title}</div>
                {r && (
                  <div className="mt-1 text-xs" style={{ color: r.ok ? "var(--success)" : "var(--danger)" }} dir="ltr">
                    {r.ok ? `${r.status || "OK"}${r.provider ? ` · ${r.provider}` : ""}` : String(r.error || "failed")}
                  </div>
                )}
              </div>
              <Button onClick={() => publish(p)} disabled={Boolean(busy[p.id])}>
                {busy[p.id] ? (lang === "he" ? "מפרסם…" : "Publishing…") : (lang === "he" ? "פרסום עכשיו" : "Publish now")}
              </Button>
            </div>
          );
        })}
      </div>
      <Button variant="secondary" onClick={() => onNavigate(VIEW_IDS.AUTOPILOT)}>
        {lang === "he" ? "לתזמון פרסומים — טייס אוטומטי" : "Schedule via AutoPilot"}
      </Button>
    </div>
  );
}

/** Trust — the REAL verification engine over the seller's own products. */
function TrustPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { showToast, currentMarketer: marketer, marketers } = useMarketplace();
  const mine = useMyProducts();
  const [records, setRecords] = useState({});

  const verify = useCallback((product) => {
    try {
      const record = verifyProduct({
        product,
        url: product.url || product.affiliateUrl,
        actor: marketer ? { id: marketer.id } : null,
        marketers: Array.isArray(marketers) ? marketers : [],
      });
      setRecords((prev) => ({ ...prev, [product.id]: record }));
    } catch (e) {
      showToast(lang === "he" ? `שגיאה בבדיקה: ${e?.message || "unknown"}` : `Verification error: ${e?.message || "unknown"}`);
    }
  }, [marketer, marketers, showToast, lang]);

  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "מנוע האמון" : "the Trust engine"} />;
  if (mine.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title={lang === "he" ? "אין מוצרים לאימות" : "No products to verify"}
        body={lang === "he" ? "רק מוצרים שעברו אימות אמון נכנסים לפיד הקונים." : "Only trust-verified products enter the buyer feed."}
        action={<Button onClick={() => onNavigate(VIEW_IDS.PRODUCTS)}>{lang === "he" ? "למוצרים" : "Go to products"}</Button>}
      />
    );
  }

  const STATE_COLORS = {
    [TRUST_STATE.VERIFIED]: "var(--success)",
    [TRUST_STATE.CHECK_REQUIRED]: "var(--warning)",
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "אמון — אימות מוצרים אמיתי" : "Trust — real product verification"}
      </h3>
      <div className="space-y-3">
        {mine.map((p) => {
          const rec = records[p.id];
          const report = rec ? trustGateReport(rec) : null;
          const color = rec ? (STATE_COLORS[rec.state] || "var(--danger)") : "var(--text-faint)";
          return (
            <div key={p.id} className="ll-card rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>{p.title}</div>
                  {rec && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--bg-subtle)", color }}>
                        {rec.state}
                      </span>
                      <span className="text-xs" style={{ color: report?.eligible ? "var(--success)" : "var(--warning)" }}>
                        {report?.eligible
                          ? (lang === "he" ? "זכאי לפיד קונים" : "Eligible for buyer discovery")
                          : (lang === "he" ? "לא זכאי לפרסום" : "Not eligible")}
                      </span>
                    </div>
                  )}
                </div>
                <Button variant="secondary" onClick={() => verify(p)}>
                  {rec ? (lang === "he" ? "בדיקה חוזרת" : "Re-verify") : (lang === "he" ? "בדיקת אמון" : "Run verification")}
                </Button>
              </div>
              {rec && report?.details?.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  {report.details.map((d, i) => (
                    <div key={i} className="text-xs" style={{ color: "var(--text-muted)" }}>
                      <span className="font-bold" dir="ltr">{d.stage}</span> · {String(d.reason || d.status)}
                      {d.fix ? ` — ${d.fix}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Recommendations — real monetization eligibility from the seller's own data. */
function RecommendationsPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { currentMarketer: marketer, products, sales } = useMarketplace();
  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "ההמלצות" : "Recommendations"} />;

  const eligibility = checkMonetizationEligibility(marketer, products, sales);
  const potential = calculateMonetizationPotential(marketer, products, sales);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "המלצות — זכאות מהנתונים האמיתיים שלך" : "Recommendations — eligibility from your real data"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(eligibility).map(([stream, info]) => (
          <div key={stream} className="ll-card rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold capitalize" style={{ color: "var(--text)" }} dir="ltr">{stream}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{
                background: info.enabled ? "var(--success-subtle)" : "var(--bg-subtle)",
                color: info.enabled ? "var(--success)" : "var(--text-faint)",
              }}>
                {info.enabled ? (lang === "he" ? "זכאי" : "Eligible") : (lang === "he" ? "לא זכאי עדיין" : "Not yet")}
              </span>
            </div>
            {!info.enabled && info.reason && (
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }} dir="ltr">{info.reason}</p>
            )}
            {potential?.[stream] != null && (
              <p className="mt-2 text-xs" style={{ color: "var(--text-faint)" }}>
                {lang === "he" ? "הערכה חודשית" : "Monthly estimate"}: {money(Math.round(potential[stream]), lang)}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        {lang === "he"
          ? "ההערכות מחושבות מהקליקים והמכירות האמיתיות שלך בלבד — אין נתונים מומצאים."
          : "Estimates are computed from your real clicks and sales only — no fabricated data."}
      </p>
    </div>
  );
}

function UgcPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { currentMarketer: marketer, sales, products, marketers } = useMarketplace();
  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "תוכן הקהילה" : "UGC"} />;
  const mine = (products || []).filter((p) => p.marketerId === marketer.id);
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "UGC — ביצועי תוכן קהילה אמיתיים" : "UGC — real community performance"}
      </h3>
      <SellerEngagement marketer={marketer} sales={sales || []} products={mine} marketers={marketers || []} />
    </div>
  );
}

function TrendsPanel() {
  const { lang } = useI18n();
  const { products } = useMarketplace();
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "טרנדים — מנוע צמיחה אמיתי" : "Trends — the real growth OS"}
      </h3>
      <GrowthOS products={products || []} channels={["web"]} lang={lang} />
    </div>
  );
}

function AutoPilotPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { showToast, currentMarketer: marketer } = useMarketplace();
  const mine = useMyProducts();
  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "הטייס האוטומטי" : "AutoPilot"} />;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "טייס אוטומטי — פרסום מתוזמן אמיתי" : "AutoPilot — real scheduled publishing"}
      </h3>
      <AutoPilot marketer={marketer} products={mine} showToast={showToast} />
    </div>
  );
}

/** The seller's own approved products — real MarketplaceContext data only. */
function useMyProducts() {
  const { products, currentMarketer } = useMarketplace();
  return useMemo(
    () => (products || []).filter((p) => p && p.marketerId === currentMarketer?.id && p.status === "approved"),
    [products, currentMarketer]
  );
}

/** Product Intelligence & Self-Marketing — the real StudioHub engine. */
function IntelligencePanel({ highlight }) {
  const { lang } = useI18n();
  const { currentMarketer: marketer, products, sales, clicks, showToast } = useMarketplace();
  const title = highlight === "self"
    ? (lang === "he" ? "שיווק עצמי · LikeLink2 — מנוע השיווק האמיתי" : "Self-Marketing · LikeLink2 — the real marketing engine")
    : (lang === "he" ? "תבונת מוצר — יכולות אמיתיות" : "Product Intelligence — real capabilities");
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>{title}</h3>
      <StudioHub
        marketer={marketer}
        products={products || []}
        sales={sales || []}
        clicks={clicks || []}
        showToast={showToast}
      />
    </div>
  );
}

/** Performance — real metrics only, computed from the seller's own clicks/sales. */
function PerformancePanel({ onNavigate }) {
  const { lang } = useI18n();
  const { currentMarketer: marketer } = useMarketplace();
  const mine = useMyProducts();
  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={lang === "he" ? "מסך הביצועים" : "the Performance screen"} />;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "ביצועים — מדדים אמיתיים בלבד" : "Performance — real metrics only"}
      </h3>
      <AnalyticsDashboard marketerId={marketer.id} products={mine} />
      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        {lang === "he"
          ? "כל המדדים מחושבים מהקליקים והמכירות האמיתיות שלך. אין נתוני דמו."
          : "All metrics are computed from your real clicks and sales. No demo data."}
      </p>
    </div>
  );
}

function SettingsPanel({ onExit }) {
  const { lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { showToast, currentMarketer: marketer, onUpdateMarketer, onLogout } = useMarketplace();
  const [copied, setCopied] = useState(false);

  const slug = marketer ? (typeof marketer.slug === "string" && marketer.slug ? marketer.slug : marketer.id) : "";
  const myLink = marketer ? `${window.location.origin}/u/${encodeURIComponent(slug)}` : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(myLink);
      setCopied(true);
      showToast(lang === "he" ? "הקישור הועתק 💜" : "Link copied 💜");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(myLink);
    }
  }

  async function handleLogout() {
    try {
      if (authConfigured) await signOutSeller();
    } catch { /* local-only account — still clear local session */ }
    onLogout?.();
    showToast(lang === "he" ? "התנתקת בהצלחה" : "Signed out");
    onExit?.();
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "הגדרות" : "Settings"}
      </h3>

      <div className="ll-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--text)" }}>
              {lang === "he" ? "שפת ממשק" : "Interface language"}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {lang === "he" ? "עברית (RTL) · English" : "Hebrew (RTL) · English"}
            </div>
          </div>
          <Button variant="secondary" onClick={() => setLang(lang === "he" ? "en" : "he")}>
            {lang === "he" ? "English" : "עברית"}
          </Button>
        </div>
      </div>

      <div className="ll-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--text)" }}>
              {lang === "he" ? "ערכת נושא" : "Theme"}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {lang === "he" ? "הסטודיו תמיד כהה; השוק הציבורי לבחירתך." : "The Studio is always dark; the marketplace follows your choice."}
            </div>
          </div>
          <Button variant="secondary" onClick={toggleTheme}>
            {theme === "dark"
              ? (lang === "he" ? "☀️ בהיר לשוק" : "☀️ Light marketplace")
              : (lang === "he" ? "🌙 כהה לשוק" : "🌙 Dark marketplace")}
          </Button>
        </div>
      </div>

      {marketer && (
        <div className="ll-card rounded-2xl p-4">
          <div className="text-sm font-bold" style={{ color: "var(--text)" }}>
            {lang === "he" ? "קישור החנות שלי" : "My store link"}
          </div>
          <div className="mt-1 truncate text-xs" dir="ltr" style={{ color: "var(--text-muted)" }}>
            {myLink.replace(/^https?:\/\//, "")}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copyLink}>
              <Copy size={14} /> {copied ? (lang === "he" ? "הועתק!" : "Copied!") : (lang === "he" ? "העתקה" : "Copy")}
            </Button>
            <a href={myLink} target="_blank" rel="noopener noreferrer" className="inline-block">
              <Button variant="secondary">
                <Store size={14} /> {lang === "he" ? "צפייה בחנות" : "View store"}
              </Button>
            </a>
          </div>
        </div>
      )}

      {marketer && (
        <div className="ll-card rounded-2xl p-4">
          <div className="text-sm font-bold" style={{ color: "var(--text)" }}>
            {lang === "he" ? "אמצעי תשלום" : "Payout method"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PAYOUT_METHODS.map((m) => {
              const active = (marketer.paymentMethod || "paypal") === m;
              return (
                <button
                  key={m}
                  onClick={() => onUpdateMarketer(marketer.id, { paymentMethod: m })}
                  className="ll-tap rounded-xl px-4 py-2 text-xs font-bold"
                  style={{
                    background: active ? "var(--accent-subtle)" : "var(--bg-subtle)",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  {PAYOUT_LABELS[m] || m}
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <PayPalPanel marketer={marketer} onUpdateMarketer={onUpdateMarketer} showToast={showToast} />
          </div>
        </div>
      )}

      <CloudHealthCard />
      {marketer && authConfigured && (
        <Button variant="secondary" onClick={handleLogout}>
          <LogOut size={14} /> {lang === "he" ? "התנתקות" : "Sign out"}
        </Button>
      )}
    </div>
  );
}

const NAV_SECTIONS = [
  {
    id: "core",
    items: [
      { view: VIEW_IDS.OVERVIEW, icon: LayoutDashboard, he: "סקירה כללית", en: "Overview" },
      { view: VIEW_IDS.LUNA, icon: Sparkles, he: "לונה · מרכז בקרה", en: "Luna · Command" },
      { view: VIEW_IDS.PRODUCTS, icon: Package, he: "מוצרים וסטודיו", en: "Products & Studio" },
      { view: VIEW_IDS.PRODUCT_INTELLIGENCE, icon: Brain, he: "תבונת מוצר", en: "Product Intelligence" },
    ],
  },
  {
    id: "create",
    items: [
      { view: VIEW_IDS.UGC, icon: Activity, he: "UGC · קהילה", en: "UGC" },
      { view: VIEW_IDS.VIDEO, icon: Clapperboard, he: "וידאו AI", en: "AI Video" },
      { view: VIEW_IDS.CREATOR_LAB, icon: UserCog, he: "מעבדת יוצרים", en: "Creator Lab" },
      { view: VIEW_IDS.CONTENT, icon: FileText, he: "תוכן", en: "Content" },
    ],
  },
  {
    id: "grow",
    items: [
      { view: VIEW_IDS.SELF_MARKETING, icon: Megaphone, he: "שיווק עצמי", en: "Self-Marketing" },
      { view: VIEW_IDS.CAMPAIGNS, icon: Send, he: "קמפיינים", en: "Campaigns" },
      { view: VIEW_IDS.TRENDS, icon: TrendingUp, he: "טרנדים", en: "Trends" },
      { view: VIEW_IDS.PUBLISHING, icon: Send, he: "פרסום", en: "Publishing" },
      { view: VIEW_IDS.PERFORMANCE, icon: BarChart3, he: "ביצועים", en: "Performance" },
    ],
  },
  {
    id: "operate",
    items: [
      { view: VIEW_IDS.TRUST, icon: ShieldCheck, he: "אמון", en: "Trust" },
      { view: VIEW_IDS.AUTOPILOT, icon: Bot, he: "טייס אוטומטי", en: "AutoPilot" },
      { view: VIEW_IDS.RECOMMENDATIONS, icon: Lightbulb, he: "המלצות", en: "Recommendations" },
      { view: VIEW_IDS.SETTINGS, icon: Settings, he: "הגדרות", en: "Settings" },
    ],
  },
];

const SECTION_LABELS = {
  core: { he: "ראשי", en: "Core" },
  create: { he: "יצירה", en: "Create" },
  grow: { he: "צמיחה", en: "Grow" },
  operate: { he: "תפעול", en: "Operate" },
};

export function StudioShell({ view: initialView, onNavigate: externalNavigate }) {
  const { lang, setLang } = useI18n();
  const { setTheme } = useTheme();
  const {
    loading, error, toast, showToast,
    currentMarketer: marketer,
    onLogout,
  } = useMarketplace();

  const [view, setView] = useState(() =>
    Object.values(VIEW_IDS).includes(initialView) ? initialView : VIEW_IDS.OVERVIEW
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Deep links & browser back/forward: follow the route's view segment.
  useEffect(() => {
    if (initialView && Object.values(VIEW_IDS).includes(initialView) && initialView !== view) {
      setView(initialView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);

  // The Studio is a dark-first premium surface — force the dark theme while it
  // is mounted (transient, non-persisted), restore on unmount.
  useEffect(() => {
    setTheme("dark", false);
    return () => setTheme("light", false);
  }, [setTheme]);

  function navigate(v) {
    setView(v);
    setDrawerOpen(false);
    externalNavigate?.(v);
  }

  const tier = marketer?.tier || marketer?.plan || null;
  const tierLabel = tier && TIERS[tier] ? TIERS[tier][lang === "he" ? "he" : "en"] : null;

  const navContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-3 pb-2 pt-4">
        <div className="ll-glow flex h-9 w-9 items-center justify-center rounded-xl text-lg" style={{ background: "var(--gradient-brand)" }}>
          ✦
        </div>
        <div className="leading-tight">
          <div className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
            LikeLink2 <span className="ll-grad-text">Studio</span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
            {lang === "he" ? "מרכז הבקרה ליוצרים" : "Creator command center"}
          </div>
        </div>
      </div>

      {/* Seller identity — real account only */}
      <div className="mx-3 mt-3 rounded-xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        {marketer ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {String(marketer.name || "S").slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-bold" style={{ color: "var(--text)" }}>
                {marketer.name || (lang === "he" ? "הסטודיו שלי" : "My studio")}
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                {tierLabel || (lang === "he" ? "מוכר/ת" : "Seller")}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {lang === "he" ? "מצב אורח — התחברי דרך מסך המוצרים" : "Guest mode — sign in via the products screen"}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-2 flex-1 overflow-y-auto px-2 pb-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.id}>
            <SectionLabel>{SECTION_LABELS[section.id][lang === "he" ? "he" : "en"]}</SectionLabel>
            {section.items.map((item) => (
              <NavItem
                key={item.view}
                item={{ ...item, label: lang === "he" ? item.he : item.en }}
                active={view === item.view}
                onClick={() => navigate(item.view)}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Utilities */}
      <div className="space-y-3 border-t p-3" style={{ borderColor: "var(--border)" }}>
        <CloudHealthCard />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="ll-tap flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
            aria-label={lang === "he" ? "Switch to English" : "עבור לעברית"}
          >
            <Languages size={16} />
          </button>
          {marketer && (
            <button
              onClick={async () => {
                try {
                  if (authConfigured) await signOutSeller();
                } catch { /* local-only session */ }
                onLogout?.();
                showToast(lang === "he" ? "התנתקת בהצלחה" : "Signed out");
              }}
              className="ll-tap flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: "var(--bg-subtle)", color: "var(--danger)" }}
              aria-label={lang === "he" ? "התנתקות" : "Sign out"}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const activeView = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.view === view);

  function renderView() {
    switch (view) {
      case VIEW_IDS.OVERVIEW: return <OverviewPanel onNavigate={navigate} />;
      case VIEW_IDS.LUNA: return <LunaPanel onNavigate={navigate} />;
      case VIEW_IDS.PRODUCTS: return (
        <Suspense fallback={<LoadingScreen />}>
          <SellView />
        </Suspense>
      );
      case VIEW_IDS.PRODUCT_INTELLIGENCE: return <IntelligencePanel highlight="product" />;
      case VIEW_IDS.SELF_MARKETING: return <IntelligencePanel highlight="self" />;
      case VIEW_IDS.UGC: return <UgcPanel onNavigate={navigate} />;
      case VIEW_IDS.VIDEO: return <VideoPanel onNavigate={navigate} />;
      case VIEW_IDS.CREATOR_LAB: return <CreatorLabPanel onNavigate={navigate} />;
      case VIEW_IDS.CONTENT: return <ContentPanel onNavigate={navigate} />;
      case VIEW_IDS.CAMPAIGNS: return <CampaignsPanel onNavigate={navigate} />;
      case VIEW_IDS.TRENDS: return <TrendsPanel />;
      case VIEW_IDS.PUBLISHING: return <PublishingPanel onNavigate={navigate} />;
      case VIEW_IDS.PERFORMANCE: return <PerformancePanel onNavigate={navigate} />;
      case VIEW_IDS.TRUST: return <TrustPanel onNavigate={navigate} />;
      case VIEW_IDS.AUTOPILOT: return <AutoPilotPanel onNavigate={navigate} />;
      case VIEW_IDS.RECOMMENDATIONS: return <RecommendationsPanel onNavigate={navigate} />;
      case VIEW_IDS.SETTINGS: return <SettingsPanel onExit={() => navigate(VIEW_IDS.OVERVIEW)} />;
      default: return <OverviewPanel onNavigate={navigate} />;
    }
  }

  return (
    <div dir={lang === "he" ? "rtl" : "ltr"} className="ll-studio min-h-screen">
      {/* Top bar */}
      <header
        className="sticky top-0 z-40 border-b safe-top"
        style={{
          background: "var(--header-blur)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => setDrawerOpen(true)}
            className="ll-tap flex h-9 w-9 items-center justify-center rounded-lg lg:hidden"
            style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
            aria-label={lang === "he" ? "תפריט" : "Menu"}
          >
            <Menu size={18} />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => navigate(VIEW_IDS.LUNA)}
              className="ll-tap flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
              aria-label={lang === "he" ? "לונה — מרכז הבקרה" : "Luna — command center"}
              title={lang === "he" ? "לונה — מרכז הבקרה" : "Luna — command center"}
            >
              <Sparkles size={15} />
            </button>
            {activeView && (() => { const Icon = activeView.icon; return <Icon size={17} style={{ color: "var(--accent)" }} />; })()}
            <h1 className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>
              {activeView ? (lang === "he" ? activeView.he : activeView.en) : ""}
            </h1>
          </div>
          <div className="mr-auto flex items-center gap-2">
            <span className="hidden text-[10px] sm:inline" style={{ color: "var(--text-faint)" }}>
              {lang === "he" ? "עברית · RTL" : "Hebrew-first"}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px]">
        {/* Desktop sidebar */}
        <aside
          className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 lg:block"
          style={{ background: "var(--bg-elevated)", borderInlineEnd: "1px solid var(--border)" }}
        >
          {navContent}
        </aside>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0"
              style={{ background: "var(--overlay)" }}
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <div
              className="absolute inset-y-0 w-72 shadow-2xl"
              style={{ background: "var(--bg-elevated)", borderInlineEnd: "1px solid var(--border)" }}
              role="dialog"
              aria-modal="true"
            >
              {navContent}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {loading ? (
            <LoadingScreen />
          ) : error ? (
            <EmptyState
              icon={Activity}
              title={lang === "he" ? "שגיאה בטעינת הנתונים" : "Failed to load data"}
              body={String(error.message || error)}
            />
          ) : (
            renderView()
          )}
        </main>
      </div>

      <Toast message={toast?.msg} />
    </div>
  );
}
