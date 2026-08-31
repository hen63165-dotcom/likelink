import React, { useState, lazy, Suspense } from "react";
import {
  TrendingUp, Plus, X, LogOut, Share2, ArrowLeft, ShoppingBag, MousePointerClick,
  DollarSign, Layers, Pencil, Trash2, Check, Rocket, CircleAlert, ImageOff,
  Upload, Loader2, Receipt, Megaphone, Eye, EyeOff,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { money, groupByDay, isSafeHttpUrl, isSafeImageUrl, nextPayoutDate, formatDate } from "../../utils/helpers";
import { CATEGORY_KEYS } from "../../lib/i18n";
import { PLATFORM_FEE_PERCENT_DEFAULT, MIN_PAYOUT_THRESHOLD, BOOST_PRICE } from "../../constants/keys";
import { uploadProductImage } from "../../lib/uploadImage";
import { getSellerPayoutSummary } from "../../lib/payments";
import { resetPassword, authConfigured } from "../../lib/auth";
import { fetchProductInfo } from "../../lib/productInfo";
import { buildSellerAIInsights } from "../../lib/aiAssistant";
import { getPaymentReadiness, buildBusinessPayPalFlow } from "../../lib/paymentFlow";
import { suggestPrice, generateHebrewDescription, scoreStoreHealth } from "../../lib/aiStudio";
import { checkSecurityBaseline } from "../../lib/security";
import AutoSetupWizard from "../AutoSetupWizard";
import AuthGate from "../AuthGate";
import { isSetupComplete } from "../../lib/autoSetup";
import {
  EmptyState, StatChip, Button, LabeledInput, LabeledTextarea, SheetModal,
} from "../ui";
import { ProductThumb } from "../product/ProductComponents";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import CampaignBuilder from "./CampaignBuilder";
import SellerEngagement from "./SellerEngagement";
import AutoPilot from "./AutoPilot";
import MarketingHub from "../MarketingHub";

// Loaded on demand so the heavy charting library stays out of the main bundle
// and doesn't load for shoppers just browsing the public feed.
const EarningsChart = lazy(() => import("../charts/EarningsChart").then(m => ({ default: m.EarningsChart })));

export default function SellView({ navigate }) {
  const { t, lang } = useI18n();
  const mp = useMarketplace();
  const {
    currentMarketer: marketer, marketers, products, sales, payouts, settings, charges, notifications,
    introSeen, dismissIntro, collections, showToast,
    onLogin, onSignup, onLogout, onAddProduct, onDeleteProduct, onLogSale,
    onAddCollection, onUpdateCollection, onDeleteCollection, onUpdateMarketer, onBuyBoost,
  } = mp;

  const [showForm, setShowForm] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  const [showMarketingHub, setShowMarketingHub] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const handleSetupComplete = (configured) => {
    onUpdateMarketer(configured);
    setShowSetupWizard(false);
    showToast?.("ההגדרה הושלמה בהצלחה! 🎉");
  };

  // Show setup wizard for new sellers
  if (showSetupWizard && marketer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <AutoSetupWizard profile={marketer} onComplete={handleSetupComplete} />
      </div>
    );
  }
  const [showReports, setShowReports] = useState(false);
  const [showCopyGen, setShowCopyGen] = useState(false);

  if (!introSeen) return <OnboardingIntro onDismiss={dismissIntro} />;
  if (!marketer) return <AuthGate marketers={marketers} onLogin={onLogin} onSignup={onSignup} />;

  const mine = (products || []).filter((p) => p.marketerId === marketer.id).sort((a, b) => b.createdAt - a.createdAt);
  const myClicks = mine.reduce((s, p) => s + (p.clicks || 0), 0);
  const mySales = (sales || []).filter((s) => s.marketerId === marketer.id);
  const myNet = mySales.reduce((s, x) => s + (x.marketerNet || 0), 0);
  const myGross = mySales.reduce((s, x) => s + (x.commissionAmount || 0), 0);
  const myFees = mySales.reduce((s, x) => s + (x.platformFee || 0), 0);
  const feeRate = settings?.platformFeePercent ?? PLATFORM_FEE_PERCENT_DEFAULT;
  const myLink = `${window.location.origin}/u/${typeof marketer.slug === "string" && marketer.slug ? marketer.slug : typeof marketer.id === "string" ? marketer.id : ""}`;
  const myCollections = (collections || []).filter((c) => c.marketerId === marketer.id);
  const chartData = groupByDay(mySales, "marketerNet");
  const payout = getSellerPayoutSummary(sales || [], payouts || [], marketer.id, charges);
  const isBoosted = (p) => ((p && p.boostedUntil) || 0) > Date.now();
  const myNotifs = (notifications || []).filter((n) => n.marketerId === marketer.id).slice(0, 5);
  const myPayouts = [...(payouts || [])].filter((p) => p.marketerId === marketer.id).sort((a, b) => b.ts - a.ts);
  const nextPayout = nextPayoutDate();
  const thresholdMet = payout.pendingPayout >= MIN_PAYOUT_THRESHOLD;
  const thresholdLeft = Math.max(0, MIN_PAYOUT_THRESHOLD - payout.pendingPayout);
  const aiInsights = buildSellerAIInsights({ marketer, products: mine, sales: mySales, notifications: myNotifs });
  const monetization = calculateMonetizationPotential(marketer, mine, mySales, Math.max(100, myClicks * 2));
  const monetizationEligibility = checkMonetizationEligibility(marketer, mine, mySales, Math.max(100, myClicks * 2));
  const paymentReadiness = getPaymentReadiness({ marketer, hasGateway: false });
  const securityBaseline = checkSecurityBaseline();
  const paypalFlow = buildBusinessPayPalFlow({ sellerName: marketer?.name || "Seller", email: marketer?.payPalEmail || "", amount: payout.pendingPayout || 0 });
  const storeHealth = scoreStoreHealth({ marketer, products, sales, paypalConnected: Boolean(marketer?.payPalEmail) });

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: typeof marketer.name === "string" ? marketer.name : String(marketer.name ?? marketer.email ?? ""), url: myLink });
        return;
      } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(myLink);
      showToast(t("sell.linkCopied"));
    } catch {
      showToast(myLink);
    }
  }

  return (
    <div className="pt-4 pb-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="disp text-lg font-semibold">{t("sell.studioTitle")} {marketer.name.split(" ")[0]}</p>
          <p className="text-xs text-muted mt-0.5">{marketer.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="tap w-9 h-9 rounded-xl flex items-center justify-center surface"
          aria-label={t("common.logOut")}
        >
          <LogOut size={15} />
        </button>
      </div>

      <LabeledInput
        label={t("sell.trackingIdLabel")}
        value={marketer.trackingId || ""}
        onChange={(v) => onUpdateMarketer(marketer.id, { trackingId: String(v).trim() })}
        placeholder={t("sell.trackingIdPh")}
      />
      <LabeledInput
        label={t("sell.payPalEmail")}
        value={marketer.payPalEmail || ""}
        onChange={(v) => onUpdateMarketer(marketer.id, { payPalEmail: String(v).trim() })}
        placeholder={t("sell.payPalPh")}
      />

      <button
        onClick={handleShare}
        className="tap w-full rounded-2xl p-4 flex items-center gap-3 mb-5 transition-shadow hover:shadow-card"
        style={{ background: "var(--text)" }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent)" }}>
          <Share2 size={16} color="#fff" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-white">{t("sell.sharePage")}</p>
          <p className="text-[11px] truncate opacity-60 text-white">{myLink.replace(/^https?:\/\//, "")}</p>
        </div>
        <ArrowLeft size={15} className="shrink-0 opacity-40 text-white" style={{ transform: "scaleX(var(--flip,1))" }} />
      </button>

      <button
        onClick={() => setShowCampaign(true)}
        className="tap w-full rounded-2xl p-4 flex items-center gap-3 mb-5 transition-shadow hover:shadow-card"
        style={{ background: "linear-gradient(135deg, #C9A86C 0%, #B78F4F 55%, #9C7437 100%)" }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.18)" }}>
          <Megaphone size={16} color="#fff" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-white">{t("sell.campaignTitle")}</p>
          <p className="text-[11px] truncate opacity-70 text-white">{t("sell.campaignTagline")}</p>
        </div>
        <ArrowLeft size={15} className="shrink-0 opacity-40 text-white" style={{ transform: "scaleX(var(--flip,1))" }} />
      </button>

      <div className="grid gap-3 mb-5">
        <div className="surface rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>AI Studio</p>
            <span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>{aiInsights.scoreLabel}</span>
          </div>
          <p className="text-sm font-semibold mb-2">{aiInsights.title}</p>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] mb-3">
            <div className="rounded-xl p-2" style={{ background: "var(--bg-subtle)" }}><div className="text-muted">Clicks</div><div className="font-bold mt-1">{aiInsights.clicks}</div></div>
            <div className="rounded-xl p-2" style={{ background: "var(--bg-subtle)" }}><div className="text-muted">Revenue</div><div className="font-bold mt-1">₪{Math.round(aiInsights.revenue)}</div></div>
            <div className="rounded-xl p-2" style={{ background: "var(--bg-subtle)" }}><div className="text-muted">Top</div><div className="font-bold mt-1">{aiInsights.topCategory}</div></div>
          </div>
          <div className="rounded-xl p-3 mb-3" style={{ background: "var(--bg-subtle)" }}>
            <div className="flex items-center justify-between text-[11px] mb-1"><span>Monetization potential</span><strong>₪{Math.round(monetization.total || 0)}</strong></div>
            <div className="flex items-center justify-between text-[11px] text-muted"><span>Live shopping</span><span>₪{Math.round(monetization.live_shopping || 0)}</span></div>
            <div className="flex items-center justify-between text-[11px] text-muted"><span>Sponsored</span><span>₪{Math.round(monetization.sponsored || 0)}</span></div>
          </div>
          <ul className="space-y-2 text-[12px] text-muted">
            {aiInsights.actions.map((action) => (
              <li key={action} className="flex items-start gap-2">
                <span className="mt-1 w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                <span>{action}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-xl p-2 text-[11px]" style={{ background: "var(--accent-subtle)" }}>
            {Object.entries(monetizationEligibility).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-2 py-1">
                <span className="capitalize">{key.replace("_", " ")}</span>
                <span style={{ color: value.enabled ? "var(--success)" : "var(--text-muted)" }}>{value.enabled ? "ready" : value.reason || "not yet"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="surface rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Payments</p>
            <span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: "var(--success-subtle)", color: "var(--success)" }}>{paymentReadiness.mode}</span>
          </div>
          <p className="text-sm font-semibold mb-2">Business PayPal-ready · ✨ ציון חנות {storeHealth.score}/100 ({storeHealth.grade})</p>
          <p className="text-[12px] text-muted mb-2">{paymentReadiness.recommended}</p>
          {storeHealth.todos.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1">
              {storeHealth.todos.map((tip) => (
                <li key={tip} className="text-[11.5px] flex items-start gap-1.5" style={{ color: "var(--accent)" }}>
                  <span className="shrink-0">✨</span> {tip}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl p-3 text-[11px]" style={{ background: "var(--bg-subtle)" }}>
            <div className="flex items-center justify-between"><span>Seller</span><strong>{paypalFlow.sellerName}</strong></div>
            <div className="flex items-center justify-between mt-1"><span>PayPal</span><strong>{paypalFlow.email || "pending setup"}</strong></div>
            <div className="flex items-center justify-between mt-1"><span>Pending</span><strong>₪{Math.round(paypalFlow.amount || 0)}</strong></div>
          </div>
        </div>

        <div className="surface rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Security</p>
            <span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: securityBaseline.hasValidOrigin ? "var(--success-subtle)" : "var(--danger-subtle)", color: securityBaseline.hasValidOrigin ? "var(--success)" : "var(--danger)" }}>{securityBaseline.hasValidOrigin ? "secure" : "review"}</span>
          </div>
          <p className="text-[12px] text-muted">Self-healing runtime active and payload protections enabled.</p>
        </div>
      </div>

      {/* Real-time buyer activity — who just clicked my deals */}
      {myNotifs.length > 0 && (
        <div className="surface rounded-2xl p-4 mb-5 shadow-sm">
          <p className="text-xs font-semibold flex items-center gap-1.5 mb-3" style={{ color: "var(--accent)" }}>
            <MousePointerClick size={14} /> {lang === "he" ? "פעילות בזמן אמת" : "Real-time activity"}
          </p>
          <div className="flex flex-col gap-2.5">
            {myNotifs.map((n) => {
              const target = products.find((p) => p.id === n.productId);
              return (
                <div key={n.id} className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 mt-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                  <p className="text-[12px] leading-snug">
                    {lang === "he" ? "קליק חדש" : "New click"}
                    {target?.title ? <> — <span className="font-medium">{target.title}</span></> : null}
                    <span className="text-muted"> • {formatDate(n.ts)}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Why sell here — persuasive pitch, low commission, built for a quick yes */}
      <div className="rounded-2xl p-4 mb-5 brand-gradient text-white">
        <p className="disp text-[15px] font-bold">{t("sell.whyTitle")}</p>
        <p className="text-[12.5px] mt-1 opacity-90 leading-relaxed">{t("sell.whySub")}</p>
        <ul className="mt-3 flex flex-col gap-2">
          <li className="flex items-start gap-2 text-[12.5px] leading-snug">
            <Check size={14} className="mt-0.5 shrink-0" />
            {t("sell.whyPoint1", { fee: feeRate, keep: 100 - feeRate })}
          </li>
          <li className="flex items-start gap-2 text-[12.5px] leading-snug">
            <Check size={14} className="mt-0.5 shrink-0" />
            {t("sell.whyPoint2")}
          </li>
          <li className="flex items-start gap-2 text-[12.5px] leading-snug">
            <Check size={14} className="mt-0.5 shrink-0" />
            {t("sell.whyPoint3")}
          </li>
          <li className="flex items-start gap-2 text-[12.5px] leading-snug">
            <Check size={14} className="mt-0.5 shrink-0" />
            {t("sell.whyPoint4")}
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <StatChip icon={ShoppingBag} label={t("sell.statListings")} value={mine.length} />
        <StatChip icon={MousePointerClick} label={t("sell.statClicks")} value={myClicks} />
        <StatChip icon={DollarSign} label={t("sell.statNet")} value={money(myNet, lang)} accent />
      </div>

      {/* Earnings dashboard: total sales, commission paid, net, pending payout */}
      <div className="surface rounded-2xl p-4 mb-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("sell.statSales")}</span>
          <div className="flex items-center gap-3">
            <span className="mono text-sm font-bold">{mySales.length}</span>
            <span className="mono text-sm font-bold">{money(mySales.reduce((s, x) => s + (x.saleAmount || 0), 0), lang)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 py-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("form.fromYourCommission")}</span>
          <span className="mono text-sm font-medium">{money(myGross, lang)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("sell.statCommissionPaid")} ({feeRate}%)</span>
          <span className="mono text-sm font-medium" style={{ color: "var(--danger)" }}>− {money(myFees, lang)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("sell.statNet")}</span>
          <span className="mono text-sm font-bold" style={{ color: "var(--success)" }}>{money(myNet, lang)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>{t("sell.pendingPayouts")}</span>
          <span className="mono text-base font-bold" style={{ color: "var(--accent)" }}>{money(payout.pendingPayout, lang)}</span>
        </div>
      </div>
      <p className="text-[11px] -mt-3 mb-4" style={{ color: "var(--text-muted)" }}>{t("sell.payoutNote")}</p>

      <div className="surface rounded-2xl p-4 mb-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>{t("sell.payoutBalance")}</span>
          <span className="mono text-lg font-bold" style={{ color: "var(--accent)" }}>{money(payout.pendingPayout, lang)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-2">
          <span className="text-[11px] text-muted">{t("sell.payoutNext")}</span>
          <span className="mono text-xs font-semibold">{formatDate(nextPayout.getTime())}</span>
        </div>
        <div className="rounded-xl px-3 py-2 text-[11px] font-medium" style={{ background: thresholdMet ? "var(--success-subtle)" : "var(--bg-subtle)", color: thresholdMet ? "var(--success)" : "var(--text-muted)" }}>
          {thresholdMet ? t("sell.payoutMet") : t("sell.payoutLeft", { left: thresholdLeft.toFixed(0) })}
        </div>
      </div>

      <div className="mb-5">
        <p className="text-xs font-semibold mb-2">{t("sell.payoutHistory")}</p>
        {myPayouts.length === 0 ? (
          <p className="text-xs text-muted">{t("sell.payoutNone")}</p>
        ) : (
          <div className="surface rounded-2xl overflow-hidden">
            {myPayouts.map((pay, i) => (
              <div key={pay.id} className={`flex items-center justify-between gap-2 px-3.5 py-2.5 ${i !== 0 ? "border-t" : ""}`} style={{ borderColor: "var(--border)" }}>
                <div>
                  <p className="mono text-xs font-semibold">{money(typeof pay.amount === "number" && Number.isFinite(pay.amount) ? pay.amount : 0, lang)}</p>
                  <p className="text-[10px] text-muted">{formatDate(typeof pay.ts === "number" ? pay.ts : null)}</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: pay.status === "paid" ? "var(--success-subtle)" : "var(--accent-subtle)", color: pay.status === "paid" ? "var(--success)" : "var(--accent)" }}>
                  {pay.status === "paid" ? t("sell.payoutPaid") : t("sell.payoutPending")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analytics Dashboard */}
      <AnalyticsDashboard marketerId={marketer?.id} products={mine} />

      <Suspense fallback={null}>
        <EarningsChart title={t("sell.earningsChart")} data={chartData} lang={lang} />
      </Suspense>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Layers size={14} style={{ color: "var(--accent)" }} /> {t("sell.collectionsTitle")}
        </p>
        <button
          onClick={() => setShowNewCollection(true)}
          className="tap text-[11px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
        >
          <Plus size={12} /> {t("sell.newCollection")}
        </button>
      </div>

      {myCollections.length === 0 ? (
        <p className="text-xs text-muted mb-5">{t("sell.emptyCollections")}</p>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {myCollections.map((c) => (
            <div key={c.id} className="surface rounded-2xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-subtle)" }}>
                <Layers size={16} style={{ color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{c.title}</p>
                <p className="text-[11px] text-muted">{c.productIds.length} {t("sell.statListings")}</p>
              </div>
              <button onClick={() => setEditingCollection(c)} className="tap w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-subtle)" }}>
                <Pencil size={12} style={{ color: "var(--accent)" }} />
              </button>
              <button onClick={() => onDeleteCollection(c.id)} className="tap w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-subtle)" }}>
                <Trash2 size={12} style={{ color: "var(--danger)" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button onClick={() => setShowForm(true)} variant="dark" className="mb-5">
        <Plus size={17} /> {t("sell.postProduct")}
      </Button>

      {mine.length === 0 ? (
        <EmptyState icon={TrendingUp} title={t("sell.emptyTitle")} body={t("sell.emptyBody")} />
      ) : (
        <div className="flex flex-col gap-3">
          {mine.map((p) => (
            <div key={p.id} className="mb-2">
              <CreatorProductRow
                p={p}
                lang={lang}
                feeRate={settings?.platformFeePercent ?? PLATFORM_FEE_PERCENT_DEFAULT}
                onDelete={() => onDeleteProduct(p.id)}
                onLogSale={(amt, comm) => onLogSale(p, amt, comm)}
              />
              {isBoosted(p) ? (
                <p className="text-[10px] font-semibold mt-1.5 px-1 flex items-center gap-1" style={{ color: "var(--accent)" }}>
                  <Megaphone size={11} /> {t("sell.boostedUntil", { time: formatDate(p.boostedUntil) })}
                </p>
              ) : (
                <button
                  onClick={() => onBuyBoost(p.id)}
                  disabled={payout.pendingPayout < BOOST_PRICE}
                  className="tap w-full mt-1.5 py-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5"
                  style={{
                    background: payout.pendingPayout >= BOOST_PRICE ? "var(--accent-subtle)" : "var(--bg-subtle)",
                    color: payout.pendingPayout >= BOOST_PRICE ? "var(--accent)" : "var(--text-faint)",
                  }}
                >
                  <Megaphone size={12} /> {t("sell.boostBtn", { price: BOOST_PRICE })}
                </button>
              )}
            </div>
          ))}
        </div>
            )}

      {/* Seller Reports Dashboard */ }
      <div className="mt-6">
        <button
          onClick={() => setShowReports((v) => !v)}
          className="tap w-full text-left text-sm font-medium px-4 py-3 rounded-xl surface"
          style={{ color: "var(--text)" }}
        >
          <div className="flex items-center justify-between">
                        <span>📊 {lang === "he" ? "דוחות מוכיחים" : "Seller Reports"}</span>
            <span style={{ color: "var(--text-muted)" }}>{showReports ? "−" : "+"}</span>
          </div>
        </button>
        {showReports && (
          <div className="mt-3">
            <SellerReportsDashboard
              marketer={marketer}
              sales={sales}
              products={products}
                            onExport={() => exportSellerCSV(marketer, sales, products, lang)}
            />
          </div>
        )}
      </div>

      {/* Creative Copy Enhancement */ }
      {mine.length > 0 && (
        <div className="mt-6">
          <CreativeCopyEnhancement
            product={mine[0]}
            onGenerate={(text) => {}}
          />
        </div>
      )}

      {/* Seller Engagement — healthy competition, streaks, badges, leaderboard */ }
      <div className="mt-6">
        <SellerEngagement
          marketer={marketer}
          sales={sales}
          products={products}
          marketers={marketers}
        />
      </div>

      {/* AutoPilot — built-in self-publishing automation (premium) */ }
      <AutoPilot marketer={marketer} products={mine} showToast={showToast} />

      <AnimatePresence>
        {showForm && (
          <ProductForm onClose={() => setShowForm(false)} onSubmit={(d) => { onAddProduct(d); setShowForm(false); }} />
        )}
        {showNewCollection && (
          <NewCollectionModal
            onClose={() => setShowNewCollection(false)}
            onCreate={(title) => { onAddCollection(title); setShowNewCollection(false); }}
          />
        )}
        {showCampaign && (
          <CampaignBuilder
            marketer={marketer}
            products={mine}
            link={myLink}
            lang={lang}
            onClose={() => setShowCampaign(false)}
            showToast={showToast}
          />
        )}
        {editingCollection && (
          <CollectionEditorModal
            collection={editingCollection}
            myProducts={mine}
            onClose={() => setEditingCollection(null)}
            onSave={(productIds) => { onUpdateCollection(editingCollection.id, productIds); setEditingCollection(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function OnboardingIntro({ onDismiss }) {
  const { t } = useI18n();
  const steps = [t("onboarding.step1"), t("onboarding.step2"), t("onboarding.step3")];
  return (
    <div className="pt-8 flex flex-col items-center text-center px-2">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--accent)" }}>
        <Rocket size={28} color="#fff" />
      </div>
      <p className="disp text-xl font-semibold">{t("onboarding.title")}</p>
      <p className="text-sm text-muted mt-2">{t("onboarding.subtitle")}</p>
      <div className="w-full mt-6 flex flex-col gap-3 text-left">
        {steps.map((s, i) => (
          <div key={i} className="surface rounded-2xl p-4 flex items-start gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mono text-xs font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {i + 1}
            </div>
            <p className="text-sm leading-snug text-secondary">{s}</p>
          </div>
        ))}
      </div>
      <Button onClick={onDismiss} className="mt-6">{t("onboarding.cta")}</Button>
    </div>
  );
}

function AuthGate({ marketers, onLogin, onSignup }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");

  function submit() {
    if (!email.trim() || !email.includes("@")) return setErr(t("auth.errEmail"));
    if (password.trim().length < 6) return setErr(t("auth.errPassword"));
    if (mode === "signup") {
      if (!name.trim()) return setErr(t("auth.errName"));
      onSignup(name.trim(), email.trim(), password.trim());
    } else {
      onLogin(email.trim(), password.trim());
    }
  }

  const handleForgot = async () => {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) return setErr(t("auth.errEmail"));
    if (authConfigured) {
      const res = await resetPassword(cleanEmail);
      if (!res.ok) return setErr(res.error || "Reset failed");
      return setErr("✓ Password reset email sent");
    }
    setErr("No account found for this email");
  };

  return (
    <div className="pt-8 flex flex-col items-center text-center px-2">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--accent-subtle)" }}>
        <TrendingUp size={28} style={{ color: "var(--accent)" }} />
      </div>
      <p className="disp text-xl font-semibold">{t("auth.title")}</p>
      <p className="text-sm text-muted mt-2 max-w-[300px]">{t("auth.subtitle")}</p>
      <div className="w-full mt-6 flex rounded-full p-1 surface-subtle">
        {["signup", "login"].map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setErr(""); }}
            className="tap flex-1 py-2 rounded-full text-sm font-semibold transition-colors"
            style={{
              background: mode === m ? "var(--bg-elevated)" : "transparent",
              color: mode === m ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {m === "signup" ? t("auth.createStudio") : t("auth.login")}
          </button>
        ))}
      </div>
      <div className="w-full mt-5 flex flex-col gap-3 text-left">
        {mode === "signup" && <LabeledInput label={t("auth.yourName")} value={name} onChange={setName} placeholder={t("auth.yourNamePh")} />}
        <LabeledInput label={t("auth.email")} value={email} onChange={setEmail} placeholder={t("auth.emailPh")} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-secondary">{t("auth.password")}</span>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.passwordPh")}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="input-field w-full px-3.5 py-2.5 text-sm pe-10"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "hide password" : "show password"}
              className="tap absolute inset-y-0 end-2 flex items-center px-2 text-muted"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {mode === "login" && (
            <button type="button" onClick={handleForgot} className="tap self-end text-[11px] font-medium" style={{ color: "var(--accent)" }}>
              {t("auth.forgot")}
            </button>
          )}
        </div>
        {err && <p className="text-xs flex items-center gap-1" style={{ color: "var(--danger)" }}><CircleAlert size={13} /> {err}</p>}
        <Button onClick={submit}>{mode === "signup" ? t("auth.createBtn") : t("auth.enterBtn")}</Button>
      </div>
      <p className="text-[11px] text-muted mt-4 max-w-[280px]">{t("auth.note")}</p>
    </div>
  );
}

function NewCollectionModal({ onClose, onCreate }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  return (
    <SheetModal onClose={onClose} title={t("sell.newCollection")}>
      <div className="flex flex-col gap-3 p-5 pt-2">
        <LabeledInput label={t("sell.newCollection")} value={title} onChange={setTitle} placeholder={t("sell.collectionTitlePh")} />
        <Button onClick={() => title.trim() && onCreate(title.trim())}>{t("sell.newCollection")}</Button>
      </div>
    </SheetModal>
  );
}

function CollectionEditorModal({ collection, myProducts, onClose, onSave }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(collection.productIds);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <SheetModal onClose={onClose} title={collection.title} maxHeight="85vh">
      <div className="p-5 pt-2 overflow-y-auto">
        {myProducts.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">{t("sell.noProductsForCollection")}</p>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {myProducts.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="tap w-full flex items-center gap-3 rounded-xl p-2.5 transition-colors"
                  style={{
                    background: on ? "var(--accent-subtle)" : "var(--bg-subtle)",
                    border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0"><ProductThumb p={p} /></div>
                  <p className="text-sm font-medium flex-1 text-left truncate">{p.title}</p>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: on ? "var(--accent)" : "var(--border)" }}>
                    {on && <Check size={12} color="#fff" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <Button onClick={() => onSave(selected)}>{t("sell.done")}</Button>
      </div>
    </SheetModal>
  );
}

function ProductForm({ onClose, onSubmit }) {
  const { t, lang, categoryLabel } = useI18n();
  const { settings } = useMarketplace();
  const [d, setD] = useState({ title: "", description: "", image: "", affiliateUrl: "", category: CATEGORY_KEYS[0], price: "", commission: "" });
  const feeRate = settings?.platformFeePercent ?? PLATFORM_FEE_PERCENT_DEFAULT;
  const commNum = Math.max(0, Number(d?.commission) || 0);
  const priceNum = Math.max(0, Number(d?.price) || 0);
  const platformFee = Math.round(commNum * (feeRate / 100) * 100) / 100;
  const youKeep = Math.round((commNum - platformFee) * 100) / 100;
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const set = (k) => (v) => setD((s) => ({ ...s, [k]: v }));

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      set("image")(await uploadProductImage(file));
    } catch (e2) {
      console.error(e2);
    } finally {
      setUploading(false);
    }
  }

  async function autoFetchLink() {
    const u = d.affiliateUrl.trim();
    if (!isSafeHttpUrl(u)) return;
    setInfoLoading(true);
    try {
      const info = await fetchProductInfo(u);
      setD((s) => ({
        ...s,
        title: s.title.trim() ? s.title : info.title || s.title,
        image: s.image.trim() ? s.image : info.image || s.image,
        price: s.price ? s.price : info.price || s.price,
      }));
    } catch {
      /* never block saving — leave fields for manual entry */
    } finally {
      setInfoLoading(false);
    }
  }

  function submit() {
    if (!d.title.trim()) return setErr(t("form.errTitle"));
    if (!isSafeHttpUrl(d.affiliateUrl)) return setErr(t("form.errLink"));
    if (!isSafeImageUrl(d.image)) return setErr(t("form.errImage"));
    onSubmit(d);
  }

  return (
    <SheetModal onClose={onClose} title={t("form.newListing")} maxHeight="92vh">
      <div className="flex flex-col gap-3 p-5 pt-2 overflow-y-auto">
        <LabeledInput label={t("form.title")} value={d.title} onChange={set("title")} placeholder={t("form.titlePh")} />
        <LabeledTextarea label={t("form.description")} value={d.description} onChange={set("description")} placeholder={t("form.descriptionPh")} />
        <button
          type="button"
          onClick={() =>
            set("description")(
              generateHebrewDescription({ title: d.title.trim() || "המוצר שלי", category: categoryLabel(d.category), price: priceNum })
            )
          }
          disabled={!d.title.trim()}
          className="tap self-start text-[11px] font-semibold rounded-lg px-2.5 py-1.5"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
        >
          ✨ כתיבת תיאור בלחיצה
        </button>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-secondary">{t("form.imageSection")}</span>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 surface">
              {d.image ? <img src={d.image} alt="" className="w-full h-full object-cover" /> : (
                <div className="w-full h-full flex items-center justify-center"><ImageOff size={16} style={{ color: "var(--accent)", opacity: 0.5 }} /></div>
              )}
            </div>
            <label className="tap flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold cursor-pointer" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? t("form.uploading") : t("form.uploadFromDevice")}
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
          </div>
          <input value={d.image} onChange={(e) => set("image")(e.target.value)} placeholder={t("form.orPasteUrl")} className="input-field w-full px-3.5 py-2.5 text-xs mt-1" />
        </div>
        <LabeledInput label={t("form.link")} value={d.affiliateUrl} onChange={set("affiliateUrl")} onBlur={autoFetchLink} placeholder={t("form.linkPh")} />
        {infoLoading && (
          <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--accent)" }}>
            <Loader2 size={12} className="animate-spin" /> {t("form.fetching")}
          </p>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-secondary">{t("form.category")}</span>
          <select value={d.category} onChange={(e) => set("category")(e.target.value)} className="input-field w-full px-3.5 py-2.5 text-sm">
            {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label={t("form.price")} value={d.price} onChange={set("price")} placeholder="24.99" type="number" />
          <LabeledInput label={t("form.commission")} value={d.commission} onChange={set("commission")} placeholder="3.50" type="number" />
        </div>

        {priceNum > 0 && (
          <button
            type="button"
            onClick={() => {
              const s = suggestPrice({ price: priceNum });
              if (s.direction !== "hold") set("price")(String(s.suggested));
            }}
            title={(() => { try { return suggestPrice({ price: priceNum }).reason; } catch { return ""; } })()}
            className="tap self-start text-[11px] font-semibold rounded-lg px-2.5 py-1.5"
            style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
          >
            ✨ הצעת מחיר חכמה
          </button>
        )}
        {(commNum > 0 || priceNum > 0) && (
          <div className="rounded-xl p-3.5 surface-subtle flex flex-col gap-2">
            <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{t("form.earningsTitle")}</p>
            {priceNum > 0 && (
              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">{t("form.buyerPays")}</span>
                  <span className="mono font-bold">{money(priceNum, lang)}</span>
                </div>
                <p className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>{t("form.buyerPaysNote")}</p>
              </div>
            )}
            {commNum > 0 ? (
              <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">{t("form.fromYourCommission")}</span>
                  <span className="mono font-medium">{money(commNum, lang)}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <span>{t("form.platformFeeOut")} ({feeRate}%)</span>
                  <span className="mono">− {money(platformFee, lang)}</span>
                </div>
                <div className="flex items-center justify-between text-[14px] font-semibold pt-1">
                  <span style={{ color: "var(--success)" }}>{t("form.youKeepOut")}</span>
                  <span className="mono" style={{ color: "var(--success)" }}>{money(youKeep, lang)}</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t("form.enterCommissionHint")}</p>
            )}
          </div>
        )}

        {err && <p className="text-xs flex items-center gap-1" style={{ color: "var(--danger)" }}><CircleAlert size={13} /> {err}</p>}
        <Button onClick={submit}>{t("form.publish")}</Button>
      </div>
    </SheetModal>
  );
}

function CreatorProductRow({ p, lang, feeRate, onDelete, onLogSale }) {
  const { t, categoryLabel } = useI18n();
  const [logging, setLogging] = useState(false);
  const [amount, setAmount] = useState(typeof p.price === "number" && Number.isFinite(p.price) ? String(p.price) : "");
  const [comm, setComm] = useState(typeof p.commission === "number" && Number.isFinite(p.commission) ? String(p.commission) : "");
  const [receipt, setReceipt] = useState(null);
  const statusColor = { approved: "var(--success)", pending: "var(--warning)", flagged: "var(--danger)" }[p.status] || "var(--text-muted)";

  async function submitSale() {
    const a = Number(amount), c = Number(comm);
    if (!a || !c) return;
    setReceipt(await onLogSale(a, c));
  }

  return (
    <div className="surface rounded-2xl p-3 flex gap-3">
      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0"><ProductThumb p={p} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate">{p.title}</p>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} title={t(`status.${p.status}`)} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted">
          <span className="flex items-center gap-1"><MousePointerClick size={12} /> {p.clicks || 0}</span>
          <span>{categoryLabel(p.category)}</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setLogging((v) => !v)} className="tap text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            {t("sell.logSale")}
          </button>
          <button onClick={onDelete} className="tap text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}>
            <Trash2 size={11} /> {t("sell.remove")}
          </button>
        </div>
        {logging && (
          <div className="mt-3 p-3 rounded-xl surface-subtle">
            <div className="grid grid-cols-2 gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder={t("sell.saleAmountPlaceholder")} className="input-field rounded-lg px-2.5 py-2 text-xs" />
              <input value={comm} onChange={(e) => setComm(e.target.value)} type="number" placeholder={t("sell.saleCommissionPlaceholder")} className="input-field rounded-lg px-2.5 py-2 text-xs" />
            </div>
            <button onClick={submitSale} className="tap w-full mt-2 rounded-lg py-2 text-xs font-semibold text-white" style={{ background: "var(--text)" }}>
              {t("sell.confirmSale")}
            </button>
            {receipt && <CommissionTicker s={receipt} lang={lang} feeRate={feeRate} />}
          </div>
        )}
      </div>
    </div>
  );
}

function CommissionTicker({ s, lang, feeRate }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 rounded-xl overflow-hidden surface">
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        <Receipt size={13} style={{ color: "var(--accent)" }} />
        <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>{t("ticker.title")}</span>
      </div>
      <div className="px-3 pb-3 pt-1.5 flex flex-col gap-1 mono text-xs">
        <Row label={t("ticker.saleAmount")} value={money(s.saleAmount, lang)} />
        <Row label={t("ticker.yourCommission")} value={money(s.commissionAmount, lang)} />
        <Row label={`${t("ticker.platformFee")} (${feeRate}%)`} value={`− ${money(s.platformFee, lang)}`} muted />
        <div className="h-px my-1" style={{ background: "var(--border)" }} />
        <Row label={t("ticker.youKeep")} value={money(s.marketerNet, lang)} strong />
      </div>
    </div>
  );
}

function Row({ label, value, muted, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-sans" style={{ color: muted ? "var(--text-faint)" : "var(--text-muted)" }}>{label}</span>
      <span style={{ color: strong ? "var(--success)" : muted ? "var(--text-faint)" : "var(--text)", fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}

/** Seller Reports Dashboard */
function SellerReportsDashboard({ marketer, sales, products }) {
  const { t, lang } = useI18n();
  const [timeRange, setTimeRange] = useState("weekly");

  // Bilingual labels for seller reports
  const labels = lang === "he" ? {
    dashboardTitle: "דוחות מוכיחים",
    weekly: "שבועי",
    monthly: "חודשי",
    totalSales: "סה\"כ מכירות",
    totalEarnings: "הכנסה כוללת",
    totalFees: "דמי פלטפורמה",
    noSales: "אין מכירות",
    sales: "מכירות",
    totalClicks: "סה\"כ לחיצות",
    salesByProduct: "מכירות לפי מוצר",
    monthlyTrend: "גמירה חודשית",
    exportCSV: "ייצוא ל-CSV",
  } : {
    dashboardTitle: "Seller Reports",
    weekly: "Weekly",
    monthly: "Monthly",
    totalSales: "Total Sales",
    totalEarnings: "Total Earnings",
    totalFees: "Platform Fees",
    noSales: "No sales",
    sales: "Sales",
    totalClicks: "Total Clicks",
    salesByProduct: "Sales by Product",
    monthlyTrend: "Monthly Trend",
    exportCSV: "Export to CSV",
  };

  const filteredSales = (() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    return (sales || [])
      .filter((s) => s.marketerId === marketer.id)
      .filter((s) => timeRange === "weekly" ? s.ts >= weekAgo : s.ts >= monthAgo);
  })();

  const totalSales = filteredSales.reduce((sum, s) => sum + (s.saleAmount || 0), 0);
  const totalEarnings = filteredSales.reduce((sum, s) => sum + (s.marketerNet || 0), 0);
  const totalFees = filteredSales.reduce((sum, s) => sum + (s.platformFee || 0), 0);
  const totalClicks = (products || [])
    .filter((p) => p.marketerId === marketer.id)
    .reduce((sum, p) => sum + (p.clicks || 0), 0);

  return (
    <div className="surface rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{labels.dashboardTitle}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange("weekly")}
            className="tap text-sm font-medium rounded-lg px-3 py-1.5"
          >
                        {labels.weekly}
          </button>
          <button
            onClick={() => setTimeRange("monthly")}
            className="tap text-sm font-medium rounded-lg px-3 py-1.5"
          >
                        {labels.monthly}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="surface rounded-xl p-4">
                    <p className="text-sm text-muted mb-2">{labels.totalSales}</p>
          <p className="text-2xl font-bold">{totalSales > 0 ? `${totalSales}+` : labels.noSales}</p>
        </div>
        <div className="surface rounded-xl p-4">
                    <p className="text-sm text-muted mb-2">{labels.totalEarnings}</p>
          <p className={`text-2xl font-bold ${totalEarnings > 0 ? "text-success" : "text-text-muted"}`}>
            {money(totalEarnings, lang)}
          </p>
        </div>
        <div className="surface rounded-xl p-4">
                    <p className="text-sm text-muted mb-2">{labels.totalFees}</p>
          <p className="text-xl font-bold">{money(totalFees, lang)}</p>
        </div>
        <div className="surface rounded-xl p-4">
                    <p className="text-sm text-muted mb-2">{labels.totalClicks}</p>
          <p className="text-xl font-bold">{totalClicks}+</p>
                </div>
      </div>

      <div className="mt-6 pt-6 border-t">
        <button
          onClick={() => exportSellerCSV(marketer, sales, products, lang)}
          className="tap w-full py-2 rounded-lg bg-gradient-to-r from-accent to-accent-subtle text-white text-sm font-medium"
        >
          {labels.exportCSV}
        </button>
      </div>
    </div>
  );
}

/** Export seller data to CSV */
function exportSellerCSV(marketer, sales, products, lang) {
  const headers = ["Date", "Product Title", "Sale Amount", "Commission", "Platform Fee", "Net Earnings"];

  const rows = (sales || [])
    .filter((s) => s.marketerId === marketer.id)
    .sort((a, b) => b.ts - a.ts)
    .map((s) => {
      const product = (products || []).find((p) => p.id === s.productId);
      const date = new Date(s.ts).toLocaleDateString();
      return [
        date,
        product?.title || "Unknown",
        money(s.saleAmount, lang),
        money(s.commissionAmount, lang),
        money(s.platformFee, lang),
        money(s.marketerNet, lang),
      ];
    });

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.setAttribute(
    "href",
    "data:text/csv;charset=utf-8," + encodeURI(csvContent)
  );
  link.setAttribute("download", `seller-reports-${marketer.slug || marketer.id}.csv`);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Creative Copy Enhancement - AI prompt for luxury minimalist descriptions */
function CreativeCopyEnhancement({ product, onGenerate }) {
  const { t, lang } = useI18n();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");

  // Bilingual labels for creative enhancement
  const labels = lang === "he" ? {
    generateDescription: "יצירת תיאור מותאם",
    generate: "יצירה",
    generating: "יוצר...",
    generatingPleaseWait: "אנא המתינו בזמן יצירה...",
    preview: "תצוגה מוקדמת",
    descriptionWillAppearHere: "תיאור מותאם יופיע כאן",
  } : {
    generateDescription: "Generate Product Description",
    generate: "Generate",
    generating: "Generating...",
    generatingPleaseWait: "Please wait while we generate...",
    preview: "Preview",
    descriptionWillAppearHere: "Your luxury description will appear here",
  };

  const generateDescription = () => {
    setIsGenerating(true);

    // Luxury Minimalist prompt structure (simulated AI response)
    const simulatedResponse = `${product.title || "Premium Selection"}
Crafted with meticulous attention to detail, this piece embodies the essence of quiet luxury. 
Premium materials selected for durability and timeless appeal. 
The design language embraces clean lines and refined simplicity. 
An experience of understated elegance for the discerning collector.`;

    setIsGenerating(false);
    setGeneratedText(simulatedResponse);
  };

  return (
    <div className="surface rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">{labels.generateDescription}</h4>
        <button
          onClick={generateDescription}
          className="tap text-sm text-accent hover:underline"
          disabled={isGenerating}
        >
          {isGenerating ? labels.generating : labels.generate}
        </button>
      </div>

      {isGenerating && (
        <p className="text-sm text-faint mb-3">{labels.generatingPleaseWait}</p>
      )}

      {generatedText && (
        <div>
          <p className="text-sm text-muted mb-3">{labels.preview}:</p>
          <p className="text-sm leading-relaxed break-all">{generatedText}</p>
        </div>
      )}

      {!generatedText && !isGenerating && (
        <p className="text-xs text-muted">{labels.descriptionWillAppearHere}</p>
      )}
    </div>
  );
}
