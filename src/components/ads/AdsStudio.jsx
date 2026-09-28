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
import CampaignList from "./CampaignList.jsx";
import CreativeStudio from "./CreativeStudio.jsx";
import AdsAnalytics from "./AdsAnalytics.jsx";
import CampaignCreator from "./CampaignCreator.jsx";
import LunaRecommendations from "./LunaRecommendations.jsx";

const API_BASE = "/api/ads";
const PLACEMENT_LABELS = getPlacementLabels("he");

function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  return fetch(`${API_BASE}?mode=${path}`, { ...options, headers }).then((r) => r.json());
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
    return result.ok ? data.contextual : null;
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
    getSponsoredUnit, getLunaDecision, getHealth,
  };
}

export default function AdsStudio() {
  const { lang } = useI18n();
  const { currentMarketer, products } = useMarketplace();
  const marketerId = currentMarketer?.id || null;
  const tier = currentMarketer?.tier || "starter";

  const [activeTab, setActiveTab] = useState("campaigns");
  const [campaigns, setCampaigns] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [luna, setLuna] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showCreator, setShowCreator] = useState(false);
  const [showCreativeStudio, setShowCreativeStudio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const api = useAdsApi();

  useEffect(() => {
    refreshData();
  }, []);

  async function refreshData() {
    setRefreshing(true);
    try {
      const [campaignsData, analyticsData, lunaData, healthData] = await Promise.all([
        api.listCampaigns(),
        api.getAnalytics(),
        api.getLuna(),
        api.getHealth(),
      ]);
      setCampaigns(campaignsData);
      setAnalytics(analyticsData);
      setLuna(lunaData);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCreateCampaign(data) {
    setError(null);
    const result = await api.createCampaign(data);
    if (result.ok) {
      setToast({ type: "success", msg: "קמפיין נוצר בהצלחה" });
      setShowCreator(false);
      await refreshData();
    } else {
      const errMsg = result.error || "שגיאה ביצירת קמפיין";
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
    }
    return result;
  }

  async function handleUpdateCampaign(id, updates) {
    setError(null);
    const result = await api.updateCampaign(id, updates);
    if (result.ok) {
      setToast({ type: "success", msg: "קמפיין עודכן" });
      await refreshData();
    } else {
      const errMsg = result.error || "שגיאה בעדכון קמפיין";
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
    }
    return result;
  }

  async function handleDeleteCampaign(id) {
    setError(null);
    const result = await api.deleteCampaign(id);
    if (result.ok) {
      setToast({ type: "success", msg: "קמפיין נמחק" });
      await refreshData();
    } else {
      const errMsg = result.error || "שגיאה במחיקת קמפיין";
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
    }
    return result;
  }

  async function handleToggleStatus(id, newStatus) {
    setError(null);
    let result;
    if (newStatus === "active") result = await api.activateCampaign(id);
    else if (newStatus === "paused") result = await api.pauseCampaign(id);
    else if (newStatus === "completed") result = await api.completeCampaign(id);

    if (result?.ok) {
      setToast({ type: "success", msg: "סטטוס עודכן" });
      await refreshData();
    } else {
      const errMsg = result?.error || "שגיאה בשינוי סטטוס";
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
    }
    return result;
  }

  async function handleGenerateCreative(productId, type, placementId, campaignId) {
    setError(null);
    const product = products.find((p) => p.id === productId);
    if (!product) {
      const errMsg = "מוצר לא נמצא";
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
      const errMsg = result.error || "שגיאה ביצירת קריאייטיב";
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
      const errMsg = result.error || "שגיאה ביצירת חבילת קריאייטיבים";
      setToast({ type: "error", msg: errMsg });
      setError(errMsg);
      return null;
    }
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
  const canCreateNew = activeCount < tierLimits.maxCampaigns;

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
            דרגה: {TIER_LABELS_HE[tier]} · קמפיינים: {activeCount}/{tierLimits.maxCampaigns}
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
          onEdit={setSelectedCampaign}
          onDelete={handleDeleteCampaign}
          onView={setSelectedCampaign}
          loadingAction={loading}
        />
      )}

      {activeTab === "creative" && (
        <CreativeStudio
          products={products}
          campaigns={campaigns}
          onCreate={handleGenerateCreative}
          onGeneratePack={handleGenerateCreativePack}
          onClose={() => setShowCreativeStudio(false)}
        />
      )}

      {activeTab === "analytics" && (
        <AdsAnalytics
          campaigns={campaigns}
          analytics={analytics}
          luna={luna}
          onRefresh={refreshData}
        />
      )}

      {activeTab === "luna" && (
        <LunaRecommendations
          campaigns={campaigns}
          creatives={creatives}
          products={products}
          insights={luna?.insights}
          onApplyInsight={() => refreshData()}
          onDismissInsight={() => refreshData()}
          onActionOpportunity={() => refreshData()}
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
          products={products}
          onSave={handleCreateCampaign}
          onClose={() => setShowCreator(false)}
        />
      )}

      {/* Toast */}
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}