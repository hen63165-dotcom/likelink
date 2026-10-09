import React, { useState, useEffect, Suspense, lazy } from "react";
import { MarketplaceProvider, useMarketplace } from "./context/MarketplaceContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { LangProvider, useI18n } from "./lib/LangContext";
import { CartProvider, useCart } from "./context/CartContext";
import { VideoProvider } from "./context/VideoContext";
import { PLATFORM_FEE_PERCENT_DEFAULT } from "./constants/keys.js";
import { parsePath, PUBLIC_ROUTE_TYPES } from "./utils/routing.js";
import { updatePageSEO, getDefaultSEO, setNoIndex } from "./lib/seo.js";
import { initReferral } from "./lib/referral.js";

// Modern Layout & UI
import { AppShell, TopBar, BottomNav } from "./components/layout/AppShell";
import { StudioShell } from "./components/studio/StudioShell";
import { Toast, LoadingScreen } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Cart } from "./components/cart/Cart";
import { ScreenshotSearchModal } from "./components/search/ScreenshotSearchModal";
import { installGlobalErrorHealing } from "./lib/autoHeal.js";
import { startAutoPilotSwarm } from "./lib/autopilotTick.js";
import FloatingAIHelper from "./components/FloatingAIHelper";
import { capturePayPalCheckout } from "./lib/paymentFlow.js";
import { toHebrewError } from "./lib/errorMessages.js";
import PasswordRecovery from "./components/auth/PasswordRecovery.jsx";
// The public website (consumer experience) — separate from the Studio.
import PublicSite from "./components/site/PublicSite.jsx";

// View Components — lazy-loaded for faster first paint (code-splitting)
const SellView = lazy(() => import("./components/sell/SellView"));
const AdminView = lazy(() => import("./components/admin/AdminView"));
const CreatorAcquisition = lazy(() => import("./components/public/CreatorAcquisition"));
const MerchantAcquisition = lazy(() => import("./components/public/MerchantAcquisition"));

export default function AppRoot() {
  useEffect(() => {
    installGlobalErrorHealing();
    // Swarm scheduler: fires now + on every tab wake-up ("returning visitor"
    // is the strongest "a scheduled post is due now" signal). Throttled 5min
    // per device + jittered — hundreds of visitors = precise, distributed wakes.
    startAutoPilotSwarm();
  }, []);

  return (
    <LangProvider>
      <ThemeProvider>
        <MarketplaceProvider>
          <CartProvider>
            <VideoProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
              <Cart />
              {/* Completes the forgot-password e-mail flow (sets a new password). */}
              <PasswordRecovery />
            </VideoProvider>
          </CartProvider>
        </MarketplaceProvider>
      </ThemeProvider>
    </LangProvider>
  );
}

function App() {
  // Canonicalize project preview URLs in the live app. The browser can otherwise
  // stay on an old immutable Vercel deployment URL with different Preview env
  // values/code. Production is the single customer-facing surface.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    const isLikelinkPreviewHost =
      host.endsWith(".vercel.app") &&
      host !== "likelink2.vercel.app" &&
      (host.startsWith("likelink2-") || host.startsWith("likelink2-git-"));
    if (!isLikelinkPreviewHost) return;
    const target = `https://likelink2.vercel.app${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }, []);

  const { lang, setLang } = useI18n();
  const { loading, settings, toast, showToast, marketers, products, collections, favorites, following, toggleFavorite, toggleFollow, recordClick } = useMarketplace();
  const { clearCart } = useCart();
  const { setTheme, storedTheme } = useTheme();
  const [tab, setTab] = useState("feed");
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNav, setActiveNav] = useState("discover");
  const [screenshotOpen, setScreenshotOpen] = useState(false);

  useEffect(() => {
    initReferral();
  }, []);

  // The seller Studio is a dark premium surface — force dark whenever the Studio
  // is the active surface (/studio). The public site keeps its own light design.
  useEffect(() => {
    // Only the Studio is forced dark; the public site carries its own light design.
    const showStudio = route.type === "app" && tab === "sell";
    if (showStudio) setTheme("dark", false);
    else setTheme(storedTheme, false);
  }, [tab, route.type, storedTheme, setTheme]);

  // SEO: public pages indexable; studio/admin noindex. Never fabricate product attribution.
  useEffect(() => {
    // Public pages set their own title/description/canonical/JSON-LD.
    if (PUBLIC_ROUTE_TYPES.includes(route.type) || route.type === "merchants" || route.type === "join") return;
    if (tab === "admin") {
      updatePageSEO(getDefaultSEO("admin"));
      setNoIndex("admin");
      return;
    }
    if (tab === "sell") {
      updatePageSEO(getDefaultSEO("studio"));
      setNoIndex("studio");
      return;
    }
    updatePageSEO(getDefaultSEO(route.type === "home" ? "home" : tab === "feed" ? "feed" : "home"));
  }, [tab, route.type]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("token");
    if (params.get("paypal_return") !== "1" || !orderId) return;

    let pendingItems;
    try {
      pendingItems = JSON.parse(sessionStorage.getItem("likelink_pending_checkout") || "null");
    } catch {
      pendingItems = [];
    }
    if (!pendingItems || !Array.isArray(pendingItems.items) || pendingItems.items.length === 0) {
      showToast("לא נמצאו פריטי ההזמנה");
      return;
    }

    capturePayPalCheckout({ orderId })
      .then((result) => {
        if (!result.ok) throw new Error(result.error || "capture_failed");
        sessionStorage.removeItem("likelink_pending_checkout");
        clearCart();
        window.history.replaceState({}, "", "/");
        showToast(result.alreadyRecorded ? "ההזמנה כבר נקלטה" : "התשלום הצליח וההזמנה נקלטה");
      })
      // The exact reason: "not charged" and "charged but not recorded" are
      // very different situations for the buyer.
      .catch((e) => showToast(`${toHebrewError(e?.message, "קליטת התשלום נכשלה")} (הזמנה ${orderId})`));
  }, [clearCart, showToast]);

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Support deep links to an app tab (e.g. /admin, /studio, /feed) even though
  // the tabs themselves are switched through the hidden nav.
  useEffect(() => {
    if (route.type === "app" && route.tab) setTab(route.tab);
  }, [route]);

  // Reset scroll to top on navigation (tab switch or creator route) for a clean
  // premium feel — never leave the user halfway down a long feed.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [tab, route]);

  function navigate(path) {
    // Paths may carry a query (/search?q=…) — route on the pathname only.
    const u = new URL(path, window.location.origin);
    window.history.pushState({}, "", `${u.pathname}${u.search}${u.hash}`);
    setRoute(parsePath(u.pathname));
  }

  if (loading) return <LoadingScreen />;

  // PUBLIC WEBSITE — home, discover, products, creators, reels, deals,
  // collections, search, product and creator pages (real catalog only).
  if (PUBLIC_ROUTE_TYPES.includes(route.type)) {
    return (
      <>
        <PublicSite route={route} navigate={navigate} />
        <Toast message={toast?.msg} />
      </>
    );
  }

  // Acquisition pages for creators (/join) and merchants (/merchants).
  if (route.type === "join" || route.type === "merchants") {
    const PublicPage = route.type === "join" ? CreatorAcquisition : MerchantAcquisition;
    return (
      <AppShell>
        <Suspense fallback={<LoadingScreen />}>
          <PublicPage category={route.category} navigate={navigate} />
        </Suspense>
        <Toast message={toast?.msg} />
      </AppShell>
    );
  }

  // Seller Studio — the dark premium LikeLink2 Studio shell (2026 redesign).
  // Fully replaces the old cream marketplace shell for the studio tab.
  if (tab === "sell") {
    return (
      <>
        <StudioShell
          view={route.view}
          onNavigate={(v) => navigate(`/studio/${v}`)}
        />
        <Toast message={toast?.msg} />
      </>
    );
  }

  // Legacy /feed → the public products page.
  if (tab === "feed") {
    return (
      <>
        <PublicSite route={{ type: "products", category: null }} navigate={navigate} />
        <Toast message={toast?.msg} />
      </>
    );
  }

  // Main App Tabs (marketplace — keeps the existing light shell)
  return (
    <AppShell>
      <TopBar
        tab={tab}
        feeRate={settings?.platformFeePercent ?? PLATFORM_FEE_PERCENT_DEFAULT}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onScreenshotSearch={() => setScreenshotOpen(true)}
        activeNav={activeNav}
        onNavChange={setActiveNav}
      />

      <main className="flex-1 w-full max-w-app mx-auto pb-24 px-4">
        <Suspense fallback={<LoadingScreen />}>
          {tab === "admin" && <AdminView />}
        </Suspense>
      </main>

      <BottomNav tab={tab} setTab={setTab} />
      <Toast message={toast?.msg} />
      <ScreenshotSearchModal
        isOpen={screenshotOpen}
        onClose={() => setScreenshotOpen(false)}
      />
      <FloatingAIHelper />
    </AppShell>
  );
}
