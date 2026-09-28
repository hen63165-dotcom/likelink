import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  LayoutDashboard, Package, Sparkles, Megaphone,
  TrendingUp, BarChart3, Target, MousePointer, Eye,
  ShoppingCart, Settings, LogOut, Menu, ChevronDown,
  ChevronUp, RefreshCw, Plus, Trash2, Edit, Eye as EyeIcon,
  AlertCircle, CheckCircle, XCircle, Loader2, Zap,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { CAMPAIGN_STATUS, STATUS_LABELS_HE, OBJECTIVE_LABELS_HE, TIER_LABELS_HE, CAMPAIGN_TIER } from "../../lib/ads/types.js";
import {
  calculateCampaignHealth,
  calculateROAS,
  calculateCTR,
  calculateCPC,
  calculateConversionRate,
  canTransitionStatus,
  getTierLimits,
} from "../../lib/ads/campaignManager.js";
import { generateCreative, buildCreativePack } from "../../lib/ads/creativeStudio.js";
import { makeLunaDecision, generateLunaInsights, analyzeCampaignPerformance } from "../../lib/ads/lunaAdsBrain.js";
import {
  getPlacementSpec, getAllNativePlacements, getAvailablePlacementsForTier, getPlacementLabels,
} from "../../lib/ads/nativeNetwork.js";
import { buildAttributionReport, calculateAttribution } from "../../lib/ads/tracking.js";
import { EmptyState, Button, LabeledInput, LabeledSelect, Toast } from "../ui/index.jsx";
import { getSessionToken } from "../../lib/auth.js";
import { toHebrewError } from "../../lib/errorMessages.js";
import CampaignList from "./CampaignList.jsx";
import CreativeStudio from "./CreativeStudio.jsx";
import AdsAnalytics from "./AdsAnalytics.jsx";
import CampaignCreator from "./CampaignCreator.jsx";
import LunaRecommendations from "./LunaRecommendations.jsx";

const API_BASE = "/api/ads";
const PLACEMENT_LABELS = getPlacementLabels("he");

// Every call carries the verified Supabase session; the server derives the
// marketer from it (x-marketer-id is ignored for non-admins).
async function apiFetch(path, options = {}) {
  const token = await getSessionToken();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  try {
    const res = await fetch(`${API_BASE}?mode=${path}`, { ...options, headers });
    return await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
  } catch (e) {
    return { ok: false, error: String(e?.message || "network") };
  }
}

// Server errors → one clear Hebrew sentence (validation lists are already Hebrew).
function adsErrorText(result, fallback) {
  if (Array.isArray(result?.errors) && result.errors.length) return result.errors.join(" · ");
  return toHebrewError(result?.error, fallback);
}

function useAdsApi() {
  const { currentMarketer } = useMarketplace();
  const marketerId = currentMarketer?.id || null;
  const tier = currentMarketer?.tier || "starter";

  const listCampaigns = useCallback(async () => {
    const data = await apiFetch("list", {
      headers: { "x-marketer-id": marketerId || "" },
    });
    return data.ok ? data.campaigns : [];
  }, [marketerId]);

  const getCampaign = useCallback(async (id) => {
    const data = await apiFetch(`get&id=${id}`, {
      headers: { "x-marketer-id": marketerId || "" },
    });
    return data.ok ? data.campaign : null;
  }, [marketerId]);

  const createCampaignAction = useCallback(async (data) => {
    const result = await apiFetch("create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
      },
      body: JSON.stringify(data),
    });
    return result;
  }, [marketerId]);

  const updateCampaignAction = useCallback(async (id, updates) => {
    const result = await apiFetch("update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
      },
      body: JSON.stringify({ id, ...updates }),
    });
    return result;
  }, [marketerId]);

  const deleteCampaignAction = useCallback(async (id) => {
    const result = await apiFetch("delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
      },
      body: JSON.stringify({ campaignId: id }),
    });
    return result;
  }, [marketerId]);

  const activateCampaign = useCallback(async (id) => {
    const result = await apiFetch("activate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
      },
      body: JSON.stringify({ campaignId: id }),
    });
    return result;
  }, [marketerId]);

  const pauseCampaign = useCallback(async (id) => {
    const result = await apiFetch("pause", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
      },
      body: JSON.stringify({ campaignId: id }),
    });
    return result;
  }, [marketerId]);

  const completeCampaign = useCallback(async (id) => {
    const result = await apiFetch("complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
      },
      body: JSON.stringify({ campaignId: id }),
    });
    return result;
  }, [marketerId]);

  const generateCreativeAction = useCallback(async (data) => {
    const result = await apiFetch("creative-generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
      },
      body: JSON.stringify(data),
    });
    return result;
  }, [marketerId]);

  const generateCreativePackAction = useCallback(async (data) => {
    const result = await apiFetch("creative-pack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
      },
      body: JSON.stringify(data),
    });
    return result;
  }, [marketerId]);

  const recordEventAction = useCallback(async (data) => {
    const result = await apiFetch("event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
      },
      body: JSON.stringify(data),
    });
    return result;
  }, [marketerId]);

  const getAnalytics = useCallback(async () => {
    const data = await apiFetch("analytics", {
      headers: { "x-marketer-id": marketerId || "" },
    });
    return data.ok ? data.analytics : null;
  }, [marketerId]);

  const getLuna = useCallback(async () => {
    const data = await apiFetch("luna", {
      headers: { "x-marketer-id": marketerId || "" },
    });
    return data.ok ? data.luna : null;
  }, [marketerId]);

  const getPlacements = useCallback(async () => {
    const data = await apiFetch("placements", {
      headers: { "x-tier": tier },
    });
    return data.ok ? data.placements : [];
  }, [tier]);

  const getContextual = useCallback(async (context) => {
    const result = await apiFetch("contextual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
    });
    return result.ok ? result.contextual : null;
  }, []);

  const getSponsoredUnit = useCallback(async (data) => {
    const result = await apiFetch("sponsored-unit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return result.ok ? result.unit : null;
  }, []);

  const getLunaDecision = useCallback(async (campaignId) => {
    const result = await apiFetch("luna-decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-marketer-id": marketerId || "",
        "x-campaign-id": campaignId,
      },
    });
    return result.ok ? result.luna : null;
  }, [marketerId]);

  const listCreatives = useCallback(async () => {
    const data = await apiFetch("creatives");
    return data.ok ? data.creatives : [];
  }, []);

  const getHealth = useCallback(async () => {
    const result = await apiFetch("health");
    return result.ok ? result.health : null;
  }, []);

  return {
    listCampaigns, getCampaign, createCampaign: createCampaignAction,
    updateCampaign: updateCampaignAction, deleteCampaign: deleteCampaignAction,
    activateCampaign, pauseCampaign, completeCampaign,
    generateCreative: generateCreativeAction, generateCreativePack: generateCreativePackAction,
    recordEvent: recordEventAction,
    getAnalytics, getLuna, getPlacements, getContextual,
    getSponsoredUnit, getLunaDecision, getHealth, listCreatives,
  };
}

export default function AdsStudio() {
  const { lang } = useI18n();
  const { currentMarketer, products } = useMarketplace();
  const marketerId = currentMarketer?.id || null;
  // The server assigns the tier; creators run on "starter".
  const tier = "starter";
  const myProducts = useMemo(
    () => (products || []).filter((p) => p && p.marketerId === marketerId),
    [products, marketerId]
  );

  const [activeTab, setActiveTab] = useState("campaigns");
  const [campaigns, setCampaigns] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [luna, setLuna] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showCreator, setShowCreator] = useState(false);
  const [showCreativeStudio, setShowCreativeStudio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const api = useAdsApi();

  useEffect(() => {
    if (marketerId) refreshData();
    else setLoading(false);
  }, [marketerId]);

  async function refreshData() {
    setRefreshing(true);
    try {
      const [campaignsData, analyticsData, lunaData, creativesData] = await Promise.all([
        api.listCampaigns(),
        api.getAnalytics(),
        api.getLuna(),
        api.listCreatives(),
      ]);
      setCampaigns(campaignsData);
      setAnalytics(analyticsData);
      setLuna(lunaData);
      setCreatives(creativesData);
    } catch (e) {
      setError(toHebrewError(e?.message, "טעינת נתוני המודעות נכשלה"));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  // Numbers typed into the form arrive as strings ("" = not set).
  function normalizeCampaignForm(data) {
    const num = (v) => (v === "" || v === null || v === undefined ? undefined : Number(v));
    const { tier: _ignoredTier, ...rest } = data || {};
    return { ...rest, budget: num(data?.budget), dailyBudget: num(data?.dailyBudget) };
  }

  async function handleCreateCampaign(data) {
    setError(null);
    const result = await api.createCampaign(normalizeCampaignForm(data));
    if (result.ok) {
      setToast({ type: "success", msg: "קמפיין נוצר בהצלחה" });
      setShowCreator(false);
      await refreshData();
    } else {
      const errMsg = adsErrorText(result, "שגיאה ביצירת קמפיין");
      result.error = errMsg;
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
    }
    return result;
  }

  async function handleUpdateCampaign(id, updates) {
    setError(null);
    setBusyId(id);
    const result = await api.updateCampaign(id, normalizeCampaignForm(updates));
    setBusyId(null);
    if (result.ok) {
      setToast({ type: "success", msg: "קמפיין עודכן" });
      setEditingCampaign(null);
      await refreshData();
    } else {
      const errMsg = adsErrorText(result, "שגיאה בעדכון קמפיין");
      result.error = errMsg;
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
    }
    return result;
  }

  async function handleDeleteCampaign(id) {
    setError(null);
    if (typeof window !== "undefined" && !window.confirm("למחוק את הקמפיין? הפעולה אינה הפיכה.")) return null;
    setBusyId(id);
    const result = await api.deleteCampaign(id);
    setBusyId(null);
    if (result.ok) {
      setToast({ type: "success", msg: "קמפיין נמחק" });
      await refreshData();
    } else {
      const errMsg = adsErrorText(result, "שגיאה במחיקת קמפיין");
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
    }
    return result;
  }

  async function handleToggleStatus(id, newStatus) {
    setError(null);
    let result;
    setBusyId(id);
    if (newStatus === "active") result = await api.activateCampaign(id);
    else if (newStatus === "paused") result = await api.pauseCampaign(id);
    else if (newStatus === "completed") result = await api.completeCampaign(id);
    else if (newStatus === "draft" || newStatus === "pending_review") result = await api.updateCampaign(id, { status: newStatus });
    else result = { ok: false, error: "bad_request" };
    setBusyId(null);

    if (result?.ok) {
      setToast({ type: "success", msg: "סטטוס עודכן" });
      await refreshData();
    } else {
      const errMsg = adsErrorText(result, "שגיאה בשינוי סטטוס");
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
    }
    return result;
  }

  async function handleGenerateCreative(productId, type, placementId, campaignId) {
    setError(null);
    const product = myProducts.find((p) => p.id === productId);
    if (!product) {
      const errMsg = "בחרי אחד מהמוצרים שלך";
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
      return null;
    }
    const result = await api.generateCreative({
      productId, type, placementId, campaignId,
    });
    if (result.ok) {
      setToast({ type: "success", msg: "קריאייטיב נוצר" });
      await refreshData();
      return result.creative;
    } else {
      const errMsg = adsErrorText(result, "שגיאה ביצירת קריאייטיב");
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
      return null;
    }
  }

  async function handleGenerateCreativePack(productId, placementId, types, campaignId) {
    setError(null);
    const result = await api.generateCreativePack({
      productId, placementId, types, campaignId,
    });
    if (result.ok) {
      setToast({ type: "success", msg: `חבילת ${result.pack?.creatives?.length || 0} קריאייטיבים נוצרה` });
      await refreshData();
      return result.pack;
    } else {
      const errMsg = adsErrorText(result, "שגיאה ביצירת חבילת קריאייטיבים");
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
      return null;
    }
  }

  // Luna insight → a real campaign action (or open the campaign to edit it).
  async function handleApplyInsight(insight) {
    const campaign = campaigns.find((c) => c.id === insight?.campaignId);
    if (!campaign) {
      setToast({ type: "error", msg: "הקמפיין של ההמלצה לא נמצא" });
      return;
    }
    if (insight.action === "pause_campaign") {
      await handleToggleStatus(campaign.id, "paused");
      return;
    }
    if (insight.action === "increase_budget_20_percent") {
      const current = Number(campaign.dailyBudget) || 0;
      if (current > 0) {
        await handleUpdateCampaign(campaign.id, { dailyBudget: Math.round(current * 1.2 * 100) / 100 });
        return;
      }
    }
    if (insight.action === "test_new_creative" || insight.action === "test_creative_hook") {
      setActiveTab("creative");
      setToast({ type: "info", msg: "בחרי מוצר וצרי קריאייטיב חדש לקמפיין" });
      return;
    }
    setEditingCampaign(campaign);
    setToast({ type: "info", msg: "הקמפיין נפתח לעריכה כדי ליישם את ההמלצה" });
  }

  function handleOpportunity(opportunity) {
    const type = opportunity?.type;
    if (type === "creative_test") {
      setActiveTab("creative");
      return;
    }
    if (type === "new_campaign" || type === "product_add") {
      setShowCreator(true);
      return;
    }
    setActiveTab("campaigns");
    setToast({ type: "info", msg: "בחרי קמפיין מהרשימה ולחצי \"עריכה\" כדי ליישם" });
  }

  async function handleRecordEvent(eventData) {
    try {
      await api.recordEvent(eventData);
    } catch (e) {
      // Silently fail - events are best-effort
      console.error("Event tracking failed:", e);
    }
  }

  const tabs = useMemo(() => [
    { id: "campaigns", label: "קמפיינים", icon: Package },
    { id: "creative", label: "קריאייטיב", icon: Sparkles },
    { id: "analytics", label: "אנליטיקס", icon: BarChart3 },
    { id: "luna", label: "לונה", icon: Zap },
    { id: "placements", label: "מיקומים", icon: Target },
  ], []);

  const tierLimits = getTierLimits(tier);
  const activeCount = campaigns.filter((c) => c.status === "active").length;
  // The server limit counts all of this marketer's campaigns.
  const canCreateNew = campaigns.length < tierLimits.maxCampaigns;

  if (!marketerId) {
    return (
      <EmptyState
        icon={Megaphone}
        title="נדרש חשבון מוכר"
        body="התחבר/י כדי לגשת למערכת המודעות."
      />
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>
          LikeLink2 Ads OS — Studio
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            דרגה: {TIER_LABELS_HE[tier]} · קמפיינים: {campaigns.length}/{tierLimits.maxCampaigns} · פעילים: {activeCount}
          </span>
          <Button variant="secondary" onClick={refreshData} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> רענן
          </Button>
          <Button
            onClick={() => setShowCreator(true)}
            disabled={!canCreateNew}
          >
            <Plus size={14} /> קמפיין חדש
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Honest scope note: campaigns are stored, but no buyer-facing ad
          surface serves them yet, so metrics stay at zero until it does. */}
      <div className="ll-card rounded-xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          שימי לב: הקמפיינים והקריאייטיבים נשמרים במערכת, אבל הצגת מודעות לקונים עדיין לא פעילה —
          לכן המדדים יישארו 0 עד שההצגה תופעל. שום נתון כאן אינו מדומה.
        </p>
      </div>

      {/* Content */}
      {error && (
        <div className="ll-card rounded-xl p-3" style={{ background: "var(--danger-subtle)", border: "1px solid var(--danger)" }}>
          <div className="flex items-center gap-2">
            <AlertCircle size={16} style={{ color: "var(--danger)" }} />
            <span className="text-sm" style={{ color: "var(--danger)" }}>{error}</span>
          </div>
        </div>
      )}

      {activeTab === "campaigns" && (
        <CampaignList
          campaigns={campaigns}
          onToggleStatus={handleToggleStatus}
          onEdit={(c) => (c ? setEditingCampaign(c) : setShowCreator(true))}
          onDelete={handleDeleteCampaign}
          onView={(c) => setSelectedCampaign((cur) => (cur?.id === c?.id ? null : c))}
          loadingAction={busyId}
        />
      )}

      {activeTab === "campaigns" && selectedCampaign && (
        <div className="ll-card rounded-xl p-4 space-y-2" style={{ border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm" style={{ color: "var(--text)" }}>{selectedCampaign.name}</h4>
            <Button variant="secondary" onClick={() => setSelectedCampaign(null)}>סגירה</Button>
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            סטטוס: {STATUS_LABELS_HE[selectedCampaign.status] || selectedCampaign.status} · מטרה: {OBJECTIVE_LABELS_HE[selectedCampaign.objective] || selectedCampaign.objective}
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            מוצר: {(myProducts.find((p) => p.id === selectedCampaign.productId) || {}).title || selectedCampaign.productId}
            {" · "}תקציב יומי: {selectedCampaign.dailyBudget ? `₪${selectedCampaign.dailyBudget}` : "לא הוגדר"}
            {" · "}קריאייטיבים: {(selectedCampaign.creatives || []).length}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            חשיפות: {selectedCampaign.metrics?.impressions || 0} · קליקים: {selectedCampaign.metrics?.clicks || 0} · רכישות: {selectedCampaign.metrics?.purchases || 0}
          </p>
        </div>
      )}

      {activeTab === "creative" && (
        <CreativeStudio
          products={myProducts}
          campaigns={campaigns}
          creatives={creatives}
          onCreate={handleGenerateCreative}
          onGeneratePack={handleGenerateCreativePack}
          onClose={() => setActiveTab("campaigns")}
        />
      )}

      {activeTab === "analytics" && (
        <AdsAnalytics
          campaigns={campaigns}
          events={[]}
          creatives={creatives}
          lunaInsights={analytics?.lunaInsights || []}
        />
      )}

      {activeTab === "luna" && (
        <LunaRecommendations
          campaigns={campaigns}
          creatives={creatives}
          products={myProducts}
          onApplyInsight={handleApplyInsight}
          onActionOpportunity={handleOpportunity}
        />
      )}

      {activeTab === "placements" && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>מיקומים מודעות</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {getAllNativePlacements().map((placement) => {
              const spec = getPlacementSpec(placement.id);
              return (
                <div key={placement.id} className="ll-card rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
                  <h4 className="font-bold text-sm" style={{ color: "var(--text)" }}>
                    {PLACEMENT_LABELS[placement.id] || placement.id}
                  </h4>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {spec?.description?.he || ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(spec?.formats || []).map((f) => (
                      <span key={f} className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                        {f}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    מינימום הצעה: ₪{spec?.minBid || "—"} · CTR בנקודה: {(spec?.ctrBenchmark || 0) * 100}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Creator Modal */}
      {showCreator && (
        <CampaignCreator
          product={null}
          campaign={null}
          marketerTier={tier}
          products={myProducts}
          onSave={handleCreateCampaign}
          onClose={() => setShowCreator(false)}
        />
      )}

      {editingCampaign && (
        <CampaignCreator
          product={null}
          campaign={editingCampaign}
          marketerTier={tier}
          products={myProducts}
          onSave={(data) => handleUpdateCampaign(editingCampaign.id, data)}
          onClose={() => setEditingCampaign(null)}
        />
      )}

      {/* Toast */}
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}