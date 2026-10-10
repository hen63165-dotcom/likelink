import React, { useState, useEffect, Suspense, lazy } from "react";
import { MarketplaceProvider, useMarketplace } from "./context/MarketplaceContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { LangProvider } from "./lib/LangContext";
import { CartProvider, useCart } from "./context/CartContext";
import { VideoProvider } from "./context/VideoContext";
import { parsePath } from "./utils/routing.js";
import { stripBase, withBase } from "./lib/basePath.js";
import { updatePageSEO, getDefaultSEO, setNoIndex } from "./lib/seo.js";
import { initReferral } from "./lib/referral.js";
import { trackLanding } from "./lib/funnel.js";

// Modern Layout & UI
import { AppShell } from "./components/layout/AppShell";
import { Toast, LoadingScreen } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Cart } from "./components/cart/Cart";
import { installGlobalErrorHealing } from "./lib/autoHeal.js";
import { startAutoPilotSwarm } from "./lib/autopilotTick.js";
import { capturePayPalCheckout } from "./lib/paymentFlow.js";
import { toHebrewError } from "./lib/errorMessages.js";
import PasswordRecovery from "./components/auth/PasswordRecovery.jsx";

// View Components — lazy-loaded for faster first paint (code-splitting)
// The Studio is its own surface — public visitors never download it.
const StudioShell = lazy(() => import("./components/studio/StudioShell").then((m) => ({ default: m.StudioShell })));
const AdminView = lazy(() => import("./components/admin/AdminView"));
const OwnerConsole = lazy(() => import("./components/admin/OwnerConsole"));
const MerchantAcquisition = lazy(() => import("./components/public/MerchantAcquisition"));
// The public LikeLink2 site (home, discover, products, creators, reels, trends,
// collections, deals, search, saved, product + creator pages) — one chunk.
const PublicSite = lazy(() => import("./components/discover/PublicSite"));
const PublicFrame = lazy(() => import("./components/discover/PublicSite").then((m) => ({ default: m.PublicFrame })));

// Route types served by the public discovery site.
const PUBLIC_TYPES = new Set(["landing", "discover", "products", "creators", "creator", "product", "reels", "trends", "collections", "deals", "guide", "size", "search", "saved"]);

/**
 * Initial route. Legacy deep links (`/?product=<id>` from the Google Merchant
 * feed and older share links, `/u/<slug>?product=<id>`) open the product page.
 */
function initialRoute() {
  if (typeof window === "undefined") return { type: "landing" };
  try {
    const id = new URLSearchParams(window.location.search).get("product");
    const route = parsePath(stripBase(window.location.pathname));
    if (id && (route.type === "landing" || route.type === "creator" || (route.type === "app" && route.tab === "feed"))) {
      const path = `/p/${encodeURIComponent(id)}`;
      window.history.replaceState({}, "", withBase(path));
      return parsePath(path);
    }
    return route;
  } catch {
    return parsePath(stripBase(window.location.pathname));
  }
}

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

  const { loading, toast, showToast } = useMarketplace();
  const { clearCart } = useCart();
  const { setTheme, storedTheme } = useTheme();
  const [stateTab, setTab] = useState("feed");
  const [route, setRoute] = useState(initialRoute);
  // Deep links decide the tab on the very first render (no flash of another
  // surface while the sync effect below catches up).
  const tab = route.type === "app" ? route.tab || stateTab : "public";

  useEffect(() => {
    initReferral();
    // A landing from a marketing-engine creative (cid mk_…) is measured once per session.
    trackLanding();
  }, []);

  // The seller Studio is a dark premium surface. The public site paints its own
  // light editorial canvas (.lx) on top of the dark root, which also keeps the
  // legacy cream overrides in luxury.css (scoped to non-dark) out of its way.
  useEffect(() => {
    const darkRoot = tab === "sell" || PUBLIC_TYPES.has(route.type) || route.type === "merchants" || tab === "feed";
    if (darkRoot) setTheme("dark", false);
    else setTheme(storedTheme, false);
  }, [tab, route.type, storedTheme, setTheme]);

  // SEO: public pages indexable; studio/admin noindex. Never fabricate product attribution.
  useEffect(() => {
    // Public pages set their own SEO (PublicSite / MerchantAcquisition).
    if (route.type !== "landing" && (PUBLIC_TYPES.has(route.type) || route.type === "merchants")) return;
    if (tab === "admin" || tab === "owner") {
      updatePageSEO(getDefaultSEO("admin"));
      setNoIndex("admin");
      return;
    }
    if (tab === "sell") {
      updatePageSEO(getDefaultSEO("studio"));
      setNoIndex("studio");
      return;
    }
    updatePageSEO(getDefaultSEO(route.type === "landing" ? "home" : tab === "feed" ? "feed" : "home"));
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
        window.history.replaceState({}, "", withBase("/"));
        showToast(result.alreadyRecorded ? "ההזמנה כבר נקלטה" : "התשלום הצליח וההזמנה נקלטה");
      })
      // The exact reason: "not charged" and "charged but not recorded" are
      // very different situations for the buyer.
      .catch((e) => showToast(`${toHebrewError(e?.message, "קליטת התשלום נכשלה")} (הזמנה ${orderId})`));
  }, [clearCart, showToast]);

  useEffect(() => {
    const onPop = () => setRoute({ ...parsePath(stripBase(window.location.pathname)), nav: Date.now() });
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
    // `path` is an app route ("/p/x"); the address bar also carries the base
    // path on the GitHub Pages copy ("/likelink/p/x").
    const url = new URL(path, window.location.origin);
    const route = stripBase(url.pathname);
    window.history.pushState({}, "", `${withBase(route)}${url.search}${url.hash}`);
    // `nav` makes every navigation a new route object, so a page that reads
    // its query string (search, filters) refreshes on same-path navigation.
    setRoute({ ...parsePath(route), nav: Date.now() });
  }

  if (loading) return <LoadingScreen />;

  // /feed (legacy shopper feed) is now the Discover experience.
  const publicRoute = route.type === "app" && route.tab === "feed" ? { type: "discover", category: null, nav: route.nav } : route;

  // Public LikeLink2 site — real catalog only (see src/lib/publicDiscovery.js).
  if (PUBLIC_TYPES.has(publicRoute.type)) {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          <PublicSite route={publicRoute} navigate={navigate} />
        </Suspense>
        <Toast message={toast?.msg} />
      </>
    );
  }

  if (route.type === "merchants") {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          <PublicFrame routeType="merchants" navigate={navigate}>
            <MerchantAcquisition category={route.category} navigate={navigate} />
          </PublicFrame>
        </Suspense>
        <Toast message={toast?.msg} />
      </>
    );
  }

  // Seller Studio — the dark premium LikeLink2 Studio shell, visually separate
  // from the public site.
  if (tab === "sell") {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          <StudioShell
            view={route.view}
            onNavigate={(v) => navigate(`/studio/${v}`)}
          />
        </Suspense>
        <Toast message={toast?.msg} />
      </>
    );
  }

  // The owner's private console: not linked publicly, noindex, rendered only
  // after the server confirms the owner (see OwnerConsole).
  if (tab === "owner") {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <OwnerConsole />
      </Suspense>
    );
  }

  if (tab !== "admin") {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PublicSite route={{ type: "landing" }} navigate={navigate} />
      </Suspense>
    );
  }

  // Admin keeps its own shell.
  return (
    <AppShell>
      <main className="flex-1 w-full max-w-app mx-auto pb-24 px-4">
        <Suspense fallback={<LoadingScreen />}>
          <AdminView />
        </Suspense>
      </main>
      <Toast message={toast?.msg} />
    </AppShell>
  );
}
