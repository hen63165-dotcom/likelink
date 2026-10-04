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
  Activity, Menu, Brain, AlertCircle, CheckCircle, MessageCircle, Users,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useTheme } from "../../context/ThemeContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import {
  verifyProduct, trustGateReport, TRUST_STATE,
} from "../../lib/cloud/trustVerification.js";
import { authConfigured, signOutSeller, getSessionToken } from "../../lib/auth.js";
import { toHebrewError } from "../../lib/errorMessages.js";
import { buildSocialPack } from "../../lib/media/reelPipeline.js";
import { catalogTruth, buildHookSet, TRUTH } from "../../lib/growth/likeloop.js";
import { rankCatalog } from "../../lib/growth/opportunity.js";
import {
  calculateMonetizationPotential, checkMonetizationEligibility,
} from "../../lib/monetization.js";
import { PAYOUT_METHODS, PAYOUT_LABELS } from "../../constants/keys.js";
import { money } from "../../utils/helpers.js";
import { buildActivityFeed, getActivity } from "../../lib/studioActivity.js";
import { EmptyState, Button, LabeledInput, Toast, LoadingScreen } from "../ui/index.jsx";
import { AnalyticsDashboard } from "../sell/AnalyticsDashboard";
import AutoPilot from "../sell/AutoPilot";
import SellerEngagement from "../sell/SellerEngagement";
import CampaignBuilder from "../sell/CampaignBuilder";
import MarketingEnginePanel from "./MarketingEnginePanel.jsx";
import StudioHub from "../sell/StudioHub";
import GrowthOS from "../growth/GrowthOS";
import LunaAssistant from "../ambassador/LunaAssistant";
import AvatarStudio from "../ambassador/AvatarStudio";
import AutoVideoStudio from "../video/AutoVideoStudio";
import { studioReelState, requestCinematicReel, reelErrorHe } from "../../lib/reelClient.js";
import CreativeLab from "./CreativeLab.jsx";
import MarketingHub from "../MarketingHub";
import LunaStatusCard from "./LunaStatusCard";
import StudioHome from "./StudioHome";
import StudioWelcome from "./StudioWelcome.jsx";
import { fetchPlatformStatus, PLATFORM_STATE, PLATFORM_STATE_LABEL, PLATFORM_STATE_COLOR } from "../../lib/cloud/lunaStatus.js";
import GrowthPipelineStrip from "./GrowthPipelineStrip";
import GrowthShowcaseDemo from "./GrowthShowcaseDemo";
import LunaOpportunityHero from "./LunaOpportunityHero";
import CreatorGrowthWorkspace from "./CreatorGrowthWorkspace";
import CreatorInbox from "./CreatorInbox";
import CreatorCommandCenter from "./CreatorCommandCenter";
import UGCCampaignStudio from "./UGCCampaignStudio";
import AdsStudio from "../ads/AdsStudio.jsx";

// The full real seller studio (products, collections, payouts, launch) is
// code-split so it never blocks the marketplace first paint.
const SellView = lazy(() => import("../sell/SellView"));

const VIEW_IDS = {
  OVERVIEW: "overview",
  LUNA: "luna",
  PRODUCTS: "products",
  PRODUCT_INTELLIGENCE: "product-intelligence",
  SELF_MARKETING: "self-marketing",
  INBOX: "inbox",
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
  ADS: "ads",
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
      aria-label={typeof item.label === "string" ? item.label : undefined}
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

/** Recent activity strip — REAL events only. */
function ActivityStrip() {
  const { lang } = useI18n();
  const { activityFeed, clicks, sales, notifications } = useMarketplace();
  // Read the device log fresh on mount (actions may have been logged by
  // components outside this provider, e.g. the floating Luna assistant).
  const [localLog, setLocalLog] = useState(() => getActivity(30));
  useEffect(() => { setLocalLog(getActivity(30)); }, [activityFeed]);
  const items = useMemo(
    () => buildActivityFeed({
      activity: [...(activityFeed || []), ...localLog],
      clicks, sales, notifications, limit: 8,
    }),
    [activityFeed, localLog, clicks, sales, notifications]
  );
  if (!items.length) return null;
  return (
    <div className="ll-card rounded-xl p-3">
      <p className="text-xs font-bold mb-2" style={{ color: "var(--text)" }}>
        {lang === "he" ? "תנועה אחרונה · פעולות אמיתיות" : "Recent activity"}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
            <span className="truncate">{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A signed-out visitor gets the Studio explainer, not an empty dashboard.
function OverviewPanel({ onNavigate }) {
  const { currentMarketer } = useMarketplace();
  if (!currentMarketer) return <StudioWelcome onSignup={() => onNavigate(VIEW_IDS.PRODUCTS)} />;
  return <StudioHome onNavigate={onNavigate} />;
}

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

// Luna Discovery Center (goal → analysis → safe actions → approvals) — lazy so
// the Studio shell stays light.
const LunaDiscoveryCenter = lazy(() => import("./LunaDiscoveryCenter.jsx"));

function LunaPanel({ onNavigate, platform }) {
  const { lang } = useI18n();
  // Luna works for visitors too (local Luna fallbacks + honest cloud state).
  // Only revenue/creation tools require login. AuthGate stays for those.
  const { currentMarketer: marketer } = useMarketplace();
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
      <Suspense fallback={null}>
        <LunaDiscoveryCenter onNavigate={onNavigate} />
      </Suspense>
      {/* Truthful execution panel: scheduler state, what really got published,
          real channel connections and a real cloud retry for failures. */}
      <LunaStatusCard status={platform} />
      <LunaAssistant
        marketer={marketer}
        onOpenStudio={() => onNavigate(VIEW_IDS.CREATOR_LAB)}
        onOpenCampaign={() => onNavigate(VIEW_IDS.CAMPAIGNS)}
      />
    </div>
  );
}

const REEL_STYLE_HE = {
  cinematic3d: "אנימציה תלת־ממדית מסוגננת",
  ugc_style: "UGC סינתטי · ממוחשב",
  animated_story: "סיפור מוצר מונפש",
  animated_unbox: "אנבוקסינג מונפש",
  likeloop_cinematic: "LikeLoop Cinematic",
  street_story: "סיפור רחוב מונפש",
  ai_story: "סיפור 3D עם דמות AI",
  ai_ugc: "יוצרת וירטואלית 3D (AI)",
  text_hook: "הוק טקסט על המוצר",
  studio: "קליפ מהסטודיו",
};

/**
 * Reels — one click per product. Every state shown here is what the server
 * verified (studio-state): a reel is "published" only with a registered,
 * read-back-verified asset; a request is "queued" until the native renderer
 * (GitHub Actions, every 3h) delivers it. All renders are disclosed
 * computer animation — never presented as filmed or human UGC.
 */
const SHARE_NETWORKS = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["youtube", "Shorts"],
  ["facebook", "Facebook"],
  ["x", "X"],
  ["pinterest", "Pinterest"],
];

/** Ready-to-post copy per network (real fields only, both disclosures), the MP4, and direct shares. */
function ShareKit({ product, marketer, reel, showToast, he }) {
  const pack = useMemo(() => buildSocialPack({ product, creator: marketer, style: reel?.style || "", hook: reel?.creative?.hook || "" }), [product, marketer, reel?.style, reel?.creative?.hook]);
  if (!pack || !reel) return null;
  const textOf = (n) => { const x = pack.networks[n]; return n === "youtube" ? `${x.title}\n\n${x.description}` : n === "pinterest" ? `${x.title}\n${x.description}\n${x.link}` : x.caption; };
  const copy = async (n) => {
    try { await navigator.clipboard.writeText(textOf(n)); showToast(he ? "הטקסט הועתק — הדביקי בפוסט" : "Copied — paste into your post"); }
    catch { showToast(he ? "ההעתקה נחסמה בדפדפן" : "Copy blocked by the browser"); }
  };
  const chip = "ll-tap rounded-lg px-2.5 py-1.5 text-[11px] font-bold";
  return (
    <details className="mt-3 rounded-xl p-2" style={{ background: "var(--bg-subtle)" }}>
      <summary className="cursor-pointer text-xs font-bold" style={{ color: "var(--text)" }}>{he ? "ערכת שיתוף לרשתות" : "Social share kit"}</summary>
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{he ? `פתיח: "${pack.hook}" · כולל #פרסומת וגילוי אנימציה` : `Hook: "${pack.hook}" · includes ad + animation disclosure`}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SHARE_NETWORKS.map(([n, label]) => (
          <button key={n} type="button" className={chip} style={{ background: "var(--bg)", color: "var(--text)" }} onClick={() => copy(n)}>{he ? `העתק ל־${label}` : `Copy for ${label}`}</button>
        ))}
        <a className={chip} style={{ background: "var(--bg)", color: "var(--text)" }} href={reel.videoUrl} download={`${product.id}-${reel.style || "reel"}.mp4`}>{he ? "הורדת MP4" : "Download MP4"}</a>
        <a className={chip} style={{ background: "#25d366", color: "#fff" }} href={`https://wa.me/?text=${encodeURIComponent(pack.networks.whatsapp.caption)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <a className={chip} style={{ background: "#229ed9", color: "#fff" }} href={`https://t.me/share/url?url=${encodeURIComponent(pack.networks.telegram.link)}&text=${encodeURIComponent(pack.hook + " " + (product.title || ""))}`} target="_blank" rel="noreferrer">Telegram</a>
      </div>
    </details>
  );
}

const ISSUE_HE = {
  shared_affiliate_link: "קישור משותף",
  stock_image: "תמונת מאגר",
  source_blocked: "החנות חסמה בדיקה",
  no_image: "אין תמונה",
  no_affiliate_url: "אין קישור",
};
const LIFECYCLE_HE = { DISCOVERED: "דורש נתונים", VALIDATED: "מאומת", CREATIVE_READY: "קריאייטיב מוכן", PUBLISHED: "פורסם", MEASURED: "נמדד", LEARNING: "בלמידה", OPTIMIZED: "ממוטב", PAUSED: "מושהה" };

/**
 * LikeLoop in the Studio: which of my products may be promoted, the exact data
 * each blocked one needs (DATA_REPAIR_QUEUE), and the 8 typed hooks of each
 * promotable product. Computed from the same pure engine the server runs.
 */
function GrowthLoopCard({ he, reels = [] }) {
  const { products, marketers, clicks, currentMarketer: marketer } = useMarketplace();
  const truth = useMemo(() => catalogTruth({ products: products || [], marketers: marketers || [], videos: reels.map((r) => ({ ...r, source: "likelink_native_render", productTags: [{ productId: r.productId }] })), clicks: clicks || [] }), [products, marketers, clicks, reels]);
  const mine = truth.rows.filter((r) => (products || []).some((p) => p.id === r.productId && p.marketerId === marketer?.id));
  const ok = mine.filter((r) => r.truthStatus === TRUTH.PROMOTABLE);
  // Opportunity per product (same engine as the server; scores carry their basis).
  const rank = useMemo(() => {
    const own = (products || []).filter((p) => p.marketerId === marketer?.id);
    const r = rankCatalog({ products: own, truthRows: mine, events: clicks || [], videos: reels.map((x) => ({ ...x, source: "likelink_native_render", public: true, productTags: [{ productId: x.productId }] })), marketers: marketers || [] });
    return new Map(r.ranked.map((x) => [x.productId, x]));
  }, [products, marketer, mine, clicks, reels, marketers]);
  const fix = mine.filter((r) => r.truthStatus === TRUTH.REQUIRES_PRODUCT_DATA);
  const [open, setOpen] = useState(null);
  if (!mine.length) return null;
  return (
    <div className="ll-card rounded-2xl p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        <span style={{ color: "var(--text)" }}>{he ? "LikeLoop — מוכנות לקידום" : "LikeLoop — promotion readiness"}</span>
        <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(52,211,153,.15)", color: "#6ee7b7" }}>{he ? `${ok.length} כשירים לקידום` : `${ok.length} promotable`}</span>
        <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(251,191,36,.15)", color: "#fcd34d" }}>{he ? `${fix.length} דורשים נתונים` : `${fix.length} need data`}</span>
      </div>
      <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {he ? "רק מוצר עם קישור שותפים משלו ותמונה אמיתית מקבל סרטונים ופרסום חיצוני. השאר מחכים לתיקון — לא מקודמים." : "Only a product with its own affiliate link and a real photo gets reels and external posts."}
      </p>
      {ok.map((r) => {
        const p = (products || []).find((x) => x.id === r.productId);
        const hooks = open === r.productId ? buildHookSet(p) : [];
        return (
          <div key={r.productId} className="mt-2 rounded-xl p-2" style={{ background: "var(--bg-subtle)" }}>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <b style={{ color: "var(--text)" }}>{r.title.slice(0, 40)}</b>
              <span style={{ color: "var(--accent)" }}>{LIFECYCLE_HE[r.lifecycle] || r.lifecycle}</span>
              {rank.get(r.productId) ? <span style={{ color: "var(--text-muted)" }} title={he ? "ציון הזדמנות מנתונים מתועדים בלבד" : "Opportunity from recorded data only"}>{he ? "הזדמנות" : "Opportunity"} {rank.get(r.productId).opportunity} · {rank.get(r.productId).trend.state} · {rank.get(r.productId).next.action}</span> : null}
              <button type="button" className="ll-tap rounded-lg px-2 py-1 font-bold" style={{ background: "var(--bg)", color: "var(--text)" }} onClick={() => setOpen(open === r.productId ? null : r.productId)}>{he ? "8 הוקים" : "8 hooks"}</button>
            </div>
            {hooks.length ? <ul className="mt-1 space-y-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{hooks.map((h) => <li key={h.id}><b>{h.type}</b> · {h.text}</li>)}</ul> : null}
          </div>
        );
      })}
      {fix.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-bold" style={{ color: "#fcd34d" }}>{he ? `תור תיקון נתונים (${fix.length})` : `Data repair queue (${fix.length})`}</summary>
          <ul className="mt-1 space-y-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {fix.map((r) => <li key={r.productId}><b style={{ color: "var(--text)" }}>{r.title.slice(0, 40)}</b> · {r.issues.map((i) => ISSUE_HE[i] || i).join(" · ")} — {r.repair[0]}</li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

const MEDIA_STATUS_HE = { GENERATED: "נוצר", STORED: "נשמר", PUBLICATION_READY: "מוכן לפרסום", PUBLISHED: "פורסם (טרם אומת)", VERIFIED: "פורסם ואומת", BLOCKED: "חסום" };
const SOURCE_HE = { NATIVE: "מנוע LikeLink", PROVIDER: "ספק חיצוני", SYNTHETIC: "סינתטי · אנימציה", EXTERNAL: "פורסם חיצונית" };
const TRUTH_HE = { VERIFIED: "VERIFIED", OBSERVED: "OBSERVED", STALE: "STALE", BLOCKED: "BLOCKED" };
const TRUTH_TONE = {
  VERIFIED: { background: "rgba(52,211,153,.15)", color: "#6ee7b7" },
  OBSERVED: { background: "rgba(255,255,255,.08)", color: "var(--text-muted)" },
  STALE: { background: "rgba(251,191,36,.15)", color: "#fcd34d" },
  BLOCKED: { background: "rgba(248,113,113,.15)", color: "#fca5a5" },
};

/** Per-reel state from the publishing ledger. Green only for a read-back VERIFIED. */
function ReelStatusChips({ status, count, verified, he }) {
  if (!status) return null;
  const tone = TRUTH_TONE[status.truth] || TRUTH_TONE.OBSERVED;
  const missing = (status.externalMissing || []).length;
  return (
    <>
      <span className="rounded-full px-2 py-0.5" style={tone} title={status.verifiedOn?.length ? status.verifiedOn.join(", ") : undefined}>
        {he ? MEDIA_STATUS_HE[status.media] || status.media : status.media} · {TRUTH_HE[status.truth] || status.truth}
      </span>
      <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(255,255,255,.08)", color: "var(--text-muted)" }}>
        {(status.source || []).map((x) => (he ? SOURCE_HE[x] || x : x)).join(" · ")}
      </span>
      <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(255,255,255,.08)", color: "var(--text-muted)" }}>
        {he ? `${verified}/${count} אומתו באתר` : `${verified}/${count} verified on site`}
      </span>
      {status.external?.length ? (
        <span className="rounded-full px-2 py-0.5" style={TRUTH_TONE.VERIFIED}>{status.external.map((x) => `${x.destination} #${x.providerId}`).join(" · ")}</span>
      ) : missing ? (
        <span className="rounded-full px-2 py-0.5" style={TRUTH_TONE.STALE}>{he ? "נדרש חיבור לערוץ · שיתוף ידני זמין" : "External: needs a channel connection — manual share available"}</span>
      ) : null}
    </>
  );
}

function VideoPanel({ onNavigate }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const { showToast, currentMarketer: marketer } = useMarketplace();
  const mine = useMyProducts();
  const [selected, setSelected] = useState(null);
  const [state, setState] = useState({ loading: true, reels: [], requests: [], error: null });
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    const r = await studioReelState();
    setState(r.ok ? { loading: false, reels: r.reels || [], requests: r.requests || [], error: null } : { loading: false, reels: [], requests: [], error: r.error });
  }, []);
  useEffect(() => { if (marketer) refresh(); }, [marketer, refresh]);

  if (!marketer) return <AuthGate onNavigate={onNavigate} feature={he ? "Reels" : "Reels"} />;
  if (selected) {
    return (
      <AutoVideoStudio
        product={selected}
        marketer={marketer}
        onClose={() => { setSelected(null); refresh(); }}
        onRegistered={refresh}
        showToast={showToast}
      />
    );
  }
  if (mine.length === 0) {
    return (
      <EmptyState
        icon={Clapperboard}
        title={he ? "אין מוצרים ליצירת Reel" : "No products for a reel"}
        body={he ? "הוסיפי מוצר מאושר עם תמונה ציבורית, ואז Reel נוצר בלחיצה אחת." : "Add an approved product with a public image, then a reel is one click away."}
        action={<Button onClick={() => onNavigate(VIEW_IDS.PRODUCTS)}>{he ? "למוצרים" : "Go to products"}</Button>}
      />
    );
  }

  async function requestReel(p) {
    setBusy(p.id);
    const r = await requestCinematicReel(p.id);
    setBusy("");
    if (r.ok && r.complete) {
      showToast(he ? "לכל הסגנונות של המוצר כבר יש סרטון מאומת — אין מה לרנדר שוב." : "Every style of this product already has a verified reel.");
    } else if (r.ok) {
      showToast(r.duplicate ? (he ? "כבר בתור — הריצה הבאה של מנוע הרינדור תיצור אותו." : "Already queued.") : (he ? "Luna קיבלה: בריצה הבאה (עד 3 שעות) היא תרנדר סרטון, תשמור, תפרסם באתר ותאמת. פרסום חיצוני — רק בערוץ מחובר." : "Luna queued it: on the next run (≤3h) it renders, stores, publishes on the site and verifies. External — only on a connected channel."));
      refresh();
    } else {
      showToast(reelErrorHe(r.error));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>{he ? "Reels — לחיצה אחת למוצר" : "Reels — one click per product"}</h3>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {he
            ? "כל Reel הוא אנימציה ממוחשבת שמסומנת ככזו (לא צילום, לא UGC של אדם). \"פורסם\" מוצג רק אחרי שהקובץ נקרא בחזרה מהאחסון הציבורי והפוסט נמצא בפיד."
            : "Every reel is disclosed computer animation (not filmed, not human UGC). \"Published\" shows only after the file reads back from public storage and the post is found in the feed."}
        </p>
        {state.error ? <p className="mt-2 text-xs" style={{ color: "#ff9b9b" }}>{reelErrorHe(state.error)}</p> : null}
      </div>
      <CreativeLab products={mine} he={he} onCreated={refresh} />
      <GrowthLoopCard he={he} reels={state.reels} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mine.map((p) => {
          const reels = state.reels.filter((r) => r.productId === p.id);
          const queued = state.requests.find((r) => r.productId === p.id && r.status === "QUEUED");
          const latest = reels[0];
          return (
            <div key={p.id} className="ll-card rounded-2xl p-3">
              {latest ? (
                <video src={latest.videoUrl} poster={latest.poster || undefined} muted playsInline loop controls preload="metadata" className="w-full rounded-xl" style={{ aspectRatio: "9 / 16", background: "#000", maxHeight: 320, objectFit: "cover" }} />
              ) : null}
              <div className="mt-2 text-sm font-bold" style={{ color: "var(--text)" }}>{p.title}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-bold">
                {reels.length ? (
                  <ReelStatusChips status={latest?.status} count={reels.length} verified={reels.filter((r) => r.status?.truth === "VERIFIED").length} he={he} />
                ) : (
                  <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(255,255,255,.08)", color: "var(--text-muted)" }}>{he ? "אין עדיין Reel" : "No reel yet"}</span>
                )}
                {queued ? <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(251,191,36,.15)", color: "#fcd34d" }}>{he ? "בתור לרינדור" : "Queued"}</span> : null}
                {latest?.style ? <span className="rounded-full px-2 py-0.5" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>{REEL_STYLE_HE[latest.style] || latest.style}</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => requestReel(p)} disabled={busy === p.id || Boolean(queued)}>
                  {busy === p.id ? (he ? "שולחת…" : "Sending…") : queued ? (he ? "בתור" : "Queued") : (he ? "צרי ופרסמי עם Luna" : "Create & publish with Luna")}
                </Button>
                <button type="button" onClick={() => setSelected(p)} className="ll-tap rounded-xl px-3 py-2 text-xs font-bold" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>
                  {he ? "קליפ מיידי בדפדפן" : "Instant clip in browser"}
                </button>
                {latest ? (
                  <a href={`/p/${encodeURIComponent(p.id)}`} target="_blank" rel="noreferrer" className="ll-tap rounded-xl px-3 py-2 text-xs font-bold" style={{ background: "var(--bg-subtle)", color: "var(--text)" }}>
                    {he ? "צפייה באתר" : "View on site"}
                  </a>
                ) : null}
              </div>
              <ShareKit product={p} marketer={marketer} reel={latest} showToast={showToast} he={he} />
            </div>
          );
        })}
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
    <>
      <MarketingEnginePanel />
      <CampaignBuilder
        marketer={marketer}
        products={mine}
        link={myLink}
        lang={lang}
        onClose={() => setClosed(true)}
        showToast={showToast}
      />
    </>
  );
}

// Publish outcome → honest Hebrew label. Only PUBLISHED means it is live.
const PUBLISH_STATUS_HE = {
  PUBLISHED: "פורסם ✅",
  ASSISTED: "מוכן לפרסום ידני — העתיקי את התוכן לערוץ",
  PROCESSING: "נשלח לערוצים המחוברים — ממתין לאישור",
  CONNECT_REQUIRED: "צריך לחבר ערוץ חיצוני בהגדרות",
  REQUIRES_CONNECTION: "צריך לחבר ערוץ חיצוני בהגדרות",
  FAILED: "הפרסום נכשל",
};

function publishOutcomeText(result, lang) {
  if (!result) return "";
  if (!result.ok) return lang === "he" ? toHebrewError(result.error, "הפרסום נכשל") : String(result.error || "Publish failed");
  if (lang !== "he") return `${result.status || "OK"}${result.provider ? ` · ${result.provider}` : ""}`;
  return PUBLISH_STATUS_HE[result.status] || "הבקשה התקבלה";
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
      const token = await getSessionToken();
      // mode must be in the query string — /api/store dispatches on ?mode=.
      const response = await fetch("/api/store?mode=publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ productId: product.id }),
      });
      const result = await response.json().catch(() => ({ ok: false, error: `http_${response.status}` }));
      setResults((r) => ({ ...r, [product.id]: result }));
      showToast(publishOutcomeText(result, lang));
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
                  <div className="mt-1 text-xs" style={{ color: r.ok && r.status === "PUBLISHED" ? "var(--success)" : r.ok ? "var(--text-muted)" : "var(--danger)" }}>
                    {publishOutcomeText(r, lang)}
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

function AdsPanel() {
  const { lang } = useI18n();
  const { currentMarketer: marketer } = useMarketplace();
  if (!marketer) return <AuthGate onNavigate={() => {}} feature={lang === "he" ? "מודעות LikeLink2" : "LikeLink2 Ads OS"} />;
  return <AdsStudio />;
}

function UgcPanel({ onNavigate }) {
  const { lang } = useI18n();
  const { products = [], currentMarketer } = useMarketplace();
  const community = useMemo(
    () => (products || []).filter((p) =>
      p && (p.status === "approved" || p.status === "active" || p.status === "published") &&
      (p.ugcImage || p.image || p.assets?.some?.((a) => a?.imageUrl || a?.videoUrl))
    ).slice(0, 6),
    [products]
  );

  // Visitors get a real community preview instead of an authentication dead-end.
  // Creation/publishing still requires the real seller flow inside UGCCampaignStudio.
  if (!currentMarketer) {
    return (
      <div className="space-y-4">
        <div className="ll-card rounded-2xl p-5">
          <div className="flex items-center gap-2 text-xs font-black" style={{ color: "var(--accent)" }}>
            <Users size={14} /> UGC · {lang === "he" ? "תוכן קהילה" : "Community content"}
          </div>
          <h3 className="mt-2 text-xl font-bold" style={{ color: "var(--text)" }}>
            {lang === "he" ? "תוכן UGC אמיתי מהקהילה" : "Real UGC from the community"}
          </h3>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {lang === "he"
              ? "מבקרות יכולות לצפות בתוכן קיים. יצירת תוכן חדש מתחילה רק אחרי התחברות לחשבון יוצר."
              : "Visitors can view existing content. New creation starts after signing in to a creator account."}
          </p>
        </div>
        {community.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {community.map((p) => {
              const media = p.ugcImage || p.image || p.assets?.find?.((a) => a?.imageUrl)?.imageUrl;
              return (
                <button key={p.id} onClick={() => onNavigate?.("products")} className="ll-card overflow-hidden text-start">
                  {media && <img src={media} alt="" className="aspect-video w-full object-cover" />}
                  <div className="p-3">
                    <strong className="block truncate" style={{ color: "var(--text)" }}>{p.title}</strong>
                    <span className="mt-1 block text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {lang === "he" ? "תוכן קהילה · מוצר אמיתי" : "Community content · real product"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="ll-card rounded-2xl p-6 text-center" style={{ color: "var(--text-secondary)" }}>
            {lang === "he" ? "אין עדיין תוכן קהילה אמיתי להצגה." : "No real community content is available yet."}
          </div>
        )}
      </div>
    );
  }

  return <UGCCampaignStudio onNavigate={onNavigate} />;
}

function TrendsPanel() {
  const { lang } = useI18n();
  const { products, clicks } = useMarketplace();
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
        {lang === "he" ? "טרנדים — מנוע צמיחה אמיתי" : "Trends — the real growth OS"}
      </h3>
      {/* Real first-party click/view events drive the trend states. */}
      <GrowthOS products={products || []} events={clicks || []} channels={["web"]} lang={lang} />
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

// PayPal payout email for the signed-in seller. Shows "saved" only after the
// server write resolves — a failed write surfaces a clear Hebrew message.
function PayPalPanel({ marketer, onUpdateMarketer, showToast }) {
  const { lang } = useI18n();
  const [email, setEmail] = useState(marketer?.payPalEmail || "");
  const [saving, setSaving] = useState(false);
  const he = lang === "he";

  if ((marketer?.paymentMethod || "paypal") !== "paypal") return null;

  async function save() {
    const clean = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      showToast(he ? "כתובת האימייל של PayPal לא תקינה" : "Invalid PayPal email");
      return;
    }
    setSaving(true);
    try {
      await onUpdateMarketer(marketer.id, { payPalEmail: clean });
      showToast(he ? "אימייל PayPal נשמר" : "PayPal email saved");
    } catch {
      showToast(he ? "השמירה נכשלה — נסי שוב בעוד רגע" : "Save failed — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <LabeledInput
        label={he ? "אימייל PayPal לקבלת תשלומים" : "PayPal email for payouts"}
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="name@example.com"
      />
      <Button variant="secondary" onClick={save} disabled={saving}>
        {saving ? (he ? "שומרת…" : "Saving…") : (he ? "שמירה" : "Save")}
      </Button>
    </div>
  );
}

function CloudHealthCard() {
  const { lang } = useI18n();
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // cloud-status is the real, read-only health endpoint of /api/store.
        const res = await fetch("/api/store?mode=cloud-status", { headers: { accept: "application/json" } });
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (!cancelled) setHealth(data || { ok: false, unreachable: true });
      } catch {
        if (!cancelled) setHealth({ ok: false, unreachable: true });
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const he = lang === "he";
  const ready = health && (health.ok === true || health.status === "ok" || health.cloud === "ok");
  return (
    <div className="ll-card rounded-xl p-3">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: health ? (ready ? "var(--success)" : "var(--warning, #f59e0b)") : "var(--text-faint)" }}
        />
        <span className="text-xs font-bold" style={{ color: "var(--text)" }}>
          {he ? "בריאות המערכת" : "System health"}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          {health
            ? (ready ? (he ? "תקין" : "OK") : health.unreachable ? (he ? "לא זמין כרגע" : "Unavailable") : (he ? "מוגבל" : "Limited"))
            : (he ? "בודק…" : "Checking…")}
        </span>
      </div>
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
      { view: VIEW_IDS.INBOX, icon: MessageCircle, he: "מסרים", en: "Messages" },
      { view: VIEW_IDS.CAMPAIGNS, icon: Send, he: "קמפיינים", en: "Campaigns" },
      { view: VIEW_IDS.TRENDS, icon: TrendingUp, he: "טרנדים", en: "Trends" },
      { view: VIEW_IDS.PUBLISHING, icon: Send, he: "פרסום", en: "Publishing" },
      { view: VIEW_IDS.PERFORMANCE, icon: BarChart3, he: "ביצועים", en: "Performance" },
      { view: VIEW_IDS.ADS, icon: Megaphone, he: "מודעות LikeLink2", en: "LikeLink2 Ads" },
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

// Short, truthful one-liners: they describe what the panel actually does and
// where its data comes from. No promises, no invented capability.
const VIEW_SUBTITLES = {
  [VIEW_IDS.OVERVIEW]: {
    he: "תמונת מצב מהנתונים האמיתיים שלך — מוצרים, מכירות ולחיצות.",
    en: "A snapshot of your real data — products, sales and clicks.",
  },
  [VIEW_IDS.LUNA]: {
    he: "בקשה בשפה חופשית — לונה מנתבת למנועים האמיתיים ומחזירה סטטוס אמיתי.",
    en: "Natural-language requests routed into the real engines, with real status.",
  },
  [VIEW_IDS.PRODUCTS]: {
    he: "סטודיו המוצרים המלא — יצירה, קטלוג, קישורים ותשלומים.",
    en: "The full product studio — creation, catalog, links and payouts.",
  },
  [VIEW_IDS.PRODUCT_INTELLIGENCE]: {
    he: "ניתוח מבוסס מערכות השיווק והתוכן האמיתיות — בלי נתוני דמו.",
    en: "Analysis from the real marketing and content engines — no demo data.",
  },
  [VIEW_IDS.SELF_MARKETING]: {
    he: "פרסום וקידום עצמי — מוצר אמיתי, אישור ושיתוף ללא הבדקות.",
    en: "Creator self-promotion — real products, approval and sharing without fake publication.",
  },
  [VIEW_IDS.INBOX]: {
    he: "שיחות משתתפים, ממוקדות ושמורות מקומית במכשיר.",
    en: "Participant-only conversations, focused and stored locally on this device.",
  },
  [VIEW_IDS.UGC]: {
    he: "ביצועי קהילה אמיתיים מהמכירות והמוצרים שלך.",
    en: "Real community performance from your own sales and products.",
  },
  [VIEW_IDS.VIDEO]: {
    he: "רנדור 9:16 בדפדפן — או מצב אמיתי של מה שחסר.",
    en: "9:16 in-browser rendering — or the truthful state of what is missing.",
  },
  [VIEW_IDS.CREATOR_LAB]: {
    he: "זהות היוצר והעולם המותגי — נשמר לחשבון האמיתי שלך.",
    en: "Creator identity and brand world — saved to your real account.",
  },
  [VIEW_IDS.CONTENT]: {
    he: "יצירה ופרסום תוכן דרך מערכת הפרסום האמיתית.",
    en: "Content creation and publishing through the real publishing system.",
  },
  [VIEW_IDS.CAMPAIGNS]: {
    he: "בניית קמפיין ושיתוף — קישורים אמיתיים בלבד.",
    en: "Campaign building and sharing — real links only.",
  },
  [VIEW_IDS.TRENDS]: {
    he: "מכ\"ם טרנדים והזדמנויות ממנוע הצמיחה האמיתי.",
    en: "Trend radar and opportunities from the real growth engine.",
  },
  [VIEW_IDS.PUBLISHING]: {
    he: "פרסום פנימי נשמר באמת; ערוץ חיצוני רק אם מחובר ומאושר.",
    en: "Internal publishing really persists; external only when connected and authorized.",
  },
  [VIEW_IDS.PERFORMANCE]: {
    he: "מדדים מחושבים מהלחיצות והמכירות שלך בלבד.",
    en: "Metrics computed from your own clicks and sales only.",
  },
  [VIEW_IDS.TRUST]: {
    he: "מצב האמון האמיתי לכל מוצר — כולל הסבר מדוע נחסם.",
    en: "The real trust state per product — including why it is blocked.",
  },
  [VIEW_IDS.AUTOPILOT]: {
    he: "פרסום מתוזמן וכללי גישה אמיתיים לחשבון.",
    en: "Scheduled publishing and real access gating for your account.",
  },
  [VIEW_IDS.RECOMMENDATIONS]: {
    he: "זכאות לחידוש הכנסה מחושבת מהנתונים האמיתיים שלך.",
    en: "Monetization eligibility computed from your real data.",
  },
  [VIEW_IDS.SETTINGS]: {
    he: "חשבון, שפה, ערכת נושא, תשלומים ובריאות המערכת.",
    en: "Account, language, theme, payouts and system health.",
  },
  [VIEW_IDS.ADS]: {
    he: "מערכת מודעות LikeLink2 עם אפשרויות מותאמות אישית — קמפיינים אוטונומיים וסטטוס בזמן אמת.",
    en: "LikeLink2 Ads OS with personalized campaigns and real-time status — autonomous ad management.",
  },
};

export function StudioShell({ view: initialView, onNavigate: externalNavigate }) {
  const { lang, setLang } = useI18n();
  const { setTheme } = useTheme();
  const {
    loading, toast, showToast,
    currentMarketer: marketer,
    onLogout,
  } = useMarketplace();

  const [view, setView] = useState(() =>
    Object.values(VIEW_IDS).includes(initialView) ? initialView : VIEW_IDS.OVERVIEW
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [platform, setPlatform] = useState(null);
  const [lastPlatformCheck, setLastPlatformCheck] = useState(0);

  // One truthful poll for the whole shell: real scheduler state, the real
  // autonomous job queue, the server publication log and the channel
  // connections the cloud actually has credentials for. Nothing is assumed —
  // while no answer arrived the header shows the OFFLINE state.
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      const next = await fetchPlatformStatus();
      if (!cancelled) {
        setPlatform(next);
        setLastPlatformCheck(Date.now());
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // poll every minute
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

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
      case VIEW_IDS.LUNA: return <LunaPanel onNavigate={navigate} platform={platform} />;
      case VIEW_IDS.PRODUCTS: return (
        <Suspense fallback={<LoadingScreen />}>
          <SellView />
        </Suspense>
      );
      case VIEW_IDS.PRODUCT_INTELLIGENCE: return <IntelligencePanel highlight="product" />;
      case VIEW_IDS.SELF_MARKETING: return <><CreatorGrowthWorkspace onNavigate={navigate} /><IntelligencePanel highlight="self" /></>;
      case VIEW_IDS.INBOX: return <CreatorInbox onNavigate={navigate} />;
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
      case VIEW_IDS.ADS: return <AdsPanel />;
      case VIEW_IDS.SETTINGS: return <SettingsPanel onExit={() => navigate(VIEW_IDS.OVERVIEW)} />;
      default: return <OverviewPanel onNavigate={navigate} />;
    }
  }

  return (
    <div dir={lang === "he" ? "rtl" : "ltr"} className="ll-studio min-h-screen">
      {/* Top bar */}
      <header className="ll-header sticky top-0 z-40 safe-top">
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
            <h1 className="ll-page-title truncate">
              {activeView ? (lang === "he" ? activeView.he : activeView.en) : ""}
            </h1>
          </div>
          <div className="mr-auto flex items-center gap-2">
            <span className="hidden text-[10px] sm:inline" style={{ color: "var(--text-faint)" }}>
              {lang === "he" ? "עברית · RTL" : "Hebrew-first"}
            </span>
            {/* Luna command-center state — reported by the cloud, never fixed */}
            {(() => {
              const pState = platform?.state || PLATFORM_STATE.OFFLINE;
              const pColor = PLATFORM_STATE_COLOR[pState] || "var(--text-faint)";
              const pLabel = PLATFORM_STATE_LABEL[pState]?.[lang === "he" ? "he" : "en"] || pState;
              const jobs = platform?.jobs;
              return (
                <button
                  type="button"
                  onClick={() => navigate(VIEW_IDS.LUNA)}
                  className="ll-stat-card hidden lg:flex items-center gap-2 px-3 py-1 rounded-xl"
                  style={{ border: `1px solid ${pColor}` }}
                  title={lang === "he"
                    ? `לונה · ${pLabel}${platform?.scheduler ? "" : " · עדיין אין תשובה מהענן"}`
                    : `Luna · ${pLabel}${platform?.scheduler ? "" : " · no cloud answer yet"}`}
                  aria-label={lang === "he" ? `מצב לונה: ${pLabel}` : `Luna status: ${pLabel}`}
                >
                  <span className="ll-stat-icon" style={{ width: 28, height: 28, marginBottom: 0, color: pColor }}><Activity size={13} /></span>
                  <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                    {lang === "he" ? "לונה" : "Luna"}
                  </span>
                  <span
                    className={`inline-block h-2 w-2 rounded-full${pState === PLATFORM_STATE.ACTIVE ? " animate-pulse" : ""}`}
                    style={{ background: pColor }}
                  />
                  <span className="text-[10px] font-extrabold" style={{ color: pColor }}>
                    {pLabel}
                  </span>
                  {jobs ? (
                    <>
                      <span className="ll-stat-value text-[10px]" style={{ fontSize: "0.75rem", marginBottom: 0 }}>
                        {jobs.total}
                      </span>
                      <span className="ll-stat-label" style={{ fontSize: "9px", marginBottom: 0 }}>
                        {jobs.failed > 0
                          ? (lang === "he" ? `משימות · ${jobs.failed} נכשלו` : `jobs · ${jobs.failed} failed`)
                          : (lang === "he" ? "משימות" : "jobs")}
                      </span>
                    </>
                  ) : null}
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {lastPlatformCheck ? new Date(lastPlatformCheck).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (lang === "he" ? "בודק…" : "checking…")}
                  </span>
                </button>
              );
            })()}
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
          ) : (
            <>
              {activeView && view !== VIEW_IDS.OVERVIEW && (
                <div className="mb-5 min-w-0">
                  <h2 className="ll-page-title">
                    {lang === "he" ? activeView.he : activeView.en}
                  </h2>
                  {VIEW_SUBTITLES[view] && (
                    <p className="ll-page-subtitle">
                      {lang === "he" ? VIEW_SUBTITLES[view].he : VIEW_SUBTITLES[view].en}
                    </p>
                  )}
                </div>
              )}
              {renderView()}
            </>
          )}
        </main>
      </div>

      <Toast message={toast?.msg} />
    </div>
  );
}
