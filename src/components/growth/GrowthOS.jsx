import React, { useState, useEffect, useMemo } from "react";
import { Brain, Target, Zap, Share2, Activity, ChevronRight } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { TREND_STATES, TREND_STATE_LABELS, TREND_STATE_COLORS, createTrend, trendIsActive, summarizeTrend } from "../../lib/cloud/trendRadar.js";
import { evaluateOpportunity, OPPORTUNITY_DECISIONS, OPPORTUNITY_DECISION_LABELS, selectBestOpportunity } from "../../lib/cloud/opportunityEngine.js";
import { createCreativeVariant, CREATIVE_TYPES, CREATIVE_STATUS } from "../../lib/cloud/creativeMutation.js";
import { resolveDistributionState, DISTRIBUTION_STATES, getBestFallback } from "../../lib/cloud/distributionIntelligence.js";
import { computeWinningPatterns, recordPerformanceEvent } from "../../lib/cloud/growthLearning.js";
import { getProviderConnectionState, CONNECTED_STATES } from "../../lib/cloud/connectionManager.js";
import { EmptyState } from "../ui/index.jsx";
import { money } from "../../utils/helpers.js";

const TABS = [
  { id: "overview", label: { he: "סקירה", en: "Overview" }, icon: Activity },
  { id: "opportunities", label: { he: "הזדמנויות", en: "Opportunities" }, icon: Target },
  { id: "creative", label: { he: "יצירה", en: "Creative" }, icon: Zap },
  { id: "distribution", label: { he: "הפצה", en: "Distribution" }, icon: Share2 },
  { id: "learning", label: { he: "למידה", en: "Learning" }, icon: Brain },
];

export default function GrowthOS({ products = [], events = [], channels = ["web"], lang = "he" }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || null);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || products[0] || null,
    [products, selectedProductId]
  );

  const approved = useMemo(
    () => products.filter((p) => p?.status === "approved"),
    [products]
  );

  const trends = useMemo(() => {
    if (!approved.length) return [];
    const now = Date.now();
    return approved.slice(0, 5).map((p, idx) =>
      createTrend({
        state: idx === 0 ? TREND_STATES.ACCELERATING : idx < 3 ? TREND_STATES.RISING : TREND_STATES.DETECTED,
        category: p.category,
        platform: "likelink_feed",
        signal: "category_momentum",
        keywords: [p.category],
        relatedProducts: [p.id],
        confidence: "ESTIMATED",
        evidence: `internal_catalog:${approved.length}`,
        expiresAt: now + 24 * 60 * 60 * 1000,
      })
    );
  }, [approved]);

  const opportunities = useMemo(() => {
    if (!selectedProduct || !trends.length) return [];
    const connStates = {};
    for (const ch of channels) connStates[ch] = getProviderConnectionState(ch);
    return trends
      .map((trend) =>
        evaluateOpportunity({
          product: selectedProduct,
          trend,
          creativeAvailability: true,
          connectionStates: connStates,
          recentContent: [],
          cooldownMs: 24 * 60 * 60 * 1000,
        })
      )
      .filter(Boolean);
  }, [selectedProduct, trends, channels]);

  const bestOpportunities = useMemo(() => selectBestOpportunity(opportunities, 3), [opportunities]);

  const creative = useMemo(() => {
    if (!selectedProduct || !bestOpportunities[0]?.trend) return null;
    return createCreativeVariant({
      product: selectedProduct,
      trend: bestOpportunities[0].trend,
      language: lang === "he" ? "he" : "en",
      creativeType: CREATIVE_TYPES.POST,
    });
  }, [selectedProduct, bestOpportunities, lang]);

  const distribution = useMemo(() => {
    if (!channels.length) return null;
    const provider = channels[0];
    const state = resolveDistributionState({ intent: "share", provider });
    return { state, channel: provider, fallback: state === DISTRIBUTION_STATES.READY ? null : getBestFallback(creative, channels) };
  }, [channels, creative]);

  const learning = useMemo(() => computeWinningPatterns(events || []), [events]);

  const handleRecordPerformance = (event) => {
    recordPerformanceEvent({ ...event, productId: selectedProduct?.id, trendId: bestOpportunities[0]?.trend?.trendId });
  };

  const L = (he, en) => (lang === "he" ? he : en);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Brain size={20} style={{ color: "var(--accent)" }} />
        <div>
          <p className="text-sm font-semibold">{L("מערכת Growth אוטונומית", "Autonomous Growth OS")}</p>
          <p className="text-[11px] text-muted">{L("SIGNALS → TREND → OPPORTUNITY → CREATIVE → DISTRIBUTION → MEASURE → LEARN → REPEAT", "SIGNALS → TREND → OPPORTUNITY → CREATIVE → DISTRIBUTION → MEASURE → LEARN → REPEAT")}</p>
        </div>
      </div>

      <div className="flex rounded-full p-1 surface-subtle overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="tap shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: activeTab === tab.id ? "var(--bg-elevated)" : "transparent",
                color: activeTab === tab.id ? "var(--text)" : "var(--text-muted)",
              }}
            >
              <Icon size={13} />
              {tab.label[lang] || tab.label.en}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={L("מוצרים מאושרים", "Approved products")} value={approved.length} accent />
            <StatCard label={L("טרנדים פעילים", "Active trends")} value={trends.filter(trendIsActive).length} />
            <StatCard label={L("הזדמנויות", "Opportunities")} value={bestOpportunities.length} />
            <StatCard label={L("ערוצים", "Channels")} value={channels.length} />
          </div>
          {!approved.length && (
            <EmptyState icon={Target} title={L("אין מוצרים מאושרים", "No approved products")} body={L("אשר מוצרים כדי ש-Growth OS יתחיל לפעול", "Approve products for Growth OS to start")} />
          )}
        </div>
      )}

      {activeTab === "opportunities" && (
        <div className="flex flex-col gap-3">
          {bestOpportunities.length === 0 && (
            <EmptyState icon={Target} title={L("אין הזדמנויות זמינות", "No opportunities available")} body={L("מערכת מחשבת התאמות בין מוצרים וטרנדים", "System computes product-trend matches")} />
          )}
          {bestOpportunities.map((opp, idx) => {
            const decisionColor = OPPORTUNITY_DECISION_COLORS[opp.decision] || "#6B7280";
            const decisionLabel = OPPORTUNITY_DECISION_LABELS[opp.decision]?.[lang] || opp.decision;
            return (
              <div key={idx} className="rounded-2xl p-4 surface" style={{ border: `1px solid ${decisionColor}30` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${decisionColor}20`, color: decisionColor }}>
                    {decisionLabel}
                  </span>
                  <span className="text-[10px] text-muted">{opp.confidence}</span>
                </div>
                <p className="text-sm font-semibold mb-1">{opp.trend?.category || L("טרנד כללי", "General trend")}</p>
                <p className="text-[11px] text-muted mb-2">{opp.reason} · {L("ציון", "score")}: {Math.round(opp.total || 0)}</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(opp.scores || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="font-semibold">{Math.round(v || 0)}</span></div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "creative" && (
        <div className="flex flex-col gap-3">
          {!creative ? (
            <EmptyState icon={Zap} title={L("אין יצירה זמינה", "No creative available")} body={L("בחרי הזדמנות כדי ליצור תוכן", "Select an opportunity to create content")} />
          ) : (
            <div className="rounded-2xl p-4 surface" style={{ border: "1px solid var(--border)" }}>
              <p className="text-xs font-semibold text-muted mb-2">CREATIVE</p>
              <p className="text-sm font-semibold mb-2">{creative.title}</p>
              <p className="text-xs italic mb-3" style={{ color: "var(--accent)" }}>"{creative.hooks?.[0]?.text || creative.script?.hook || ""}"</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {(creative.hashtags || []).slice(0, 8).map((tag, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>{tag}</span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-muted">type:</span> <span className="font-semibold">{creative.creativeType}</span></div>
                <div><span className="text-muted">aspect:</span> <span className="font-semibold">{creative.aspectRatio}</span></div>
                <div><span className="text-muted">platform:</span> <span className="font-semibold">{creative.platform || "-"}</span></div>
                <div><span className="text-muted">lang:</span> <span className="font-semibold">{creative.language}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "distribution" && (
        <div className="flex flex-col gap-3">
          {!distribution ? (
            <EmptyState icon={Share2} title={L("אין ערוצי הפצה", "No distribution channels")} body={L("חיברי ערוצים כדי להתחיל להפצה", "Connect channels to start distribution")} />
          ) : (
            <div className="rounded-2xl p-4 surface" style={{ border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold">{distribution.channel}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                  background: distribution.state === "READY" ? "#00C89620" : distribution.state === "ASSISTED" ? "#C9A86C20" : "#FEE2E2",
                  color: distribution.state === "READY" ? "#00C896" : distribution.state === "ASSISTED" ? "#C9A86C" : "#991B1B",
                }}>
                  {distribution.state}
                </span>
              </div>
              {distribution.fallback && (
                <p className="text-[11px] text-muted mb-2">fallback: {distribution.fallback.action} · {distribution.fallback.reason}</p>
              )}
              <p className="text-[11px] text-muted">{L("סטטוס הערוץ לפרסום אוטונומי", "Channel status for autonomous publishing")}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "learning" && (
        <div className="flex flex-col gap-3">
          {(!learning.hooks?.length && !learning.formats?.length && !learning.channels?.length) ? (
            <EmptyState icon={Brain} title={L("אין מספיק נתונים ללמידה", "Insufficient data for learning")} body={L("המערכת לומדת מהנתונים האמיתיים — פרסום, קליקים והמרות", "System learns from real data — publishes, clicks and conversions")} />
          ) : (
            <div className="flex flex-col gap-3">
              {learning.hooks?.[0] && (
                <div className="rounded-2xl p-4 surface" style={{ border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold text-muted mb-2">WINNING HOOKS</p>
                  {learning.hooks.slice(0, 3).map((h, i) => (
                    <div key={i} className="flex justify-between text-[11px] py-1"><span className="font-semibold">{h.key}</span><span className="text-muted">cvr: {h.cvr}% · {h.conversions} conv</span></div>
                  ))}
                </div>
              )}
              {learning.formats?.[0] && (
                <div className="rounded-2xl p-4 surface" style={{ border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold text-muted mb-2">WINNING FORMATS</p>
                  {learning.formats.slice(0, 3).map((f, i) => (
                    <div key={i} className="flex justify-between text-[11px] py-1"><span className="font-semibold">{f.key}</span><span className="text-muted">{f.conversions} conv · ctr: {f.ctr}%</span></div>
                  ))}
                </div>
              )}
              {learning.channels?.[0] && (
                <div className="rounded-2xl p-4 surface" style={{ border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold text-muted mb-2">WINNING CHANNELS</p>
                  {learning.channels.slice(0, 3).map((ch, i) => (
                    <div key={i} className="flex justify-between text-[11px] py-1"><span className="font-semibold">{ch.key}</span><span className="text-muted">{ch.conversions} conv · ctr: {ch.ctr}%</span></div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-2xl p-4 surface" style={{ border: "1px solid var(--border)" }}>
      <p className="text-[10px] text-muted mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: accent ? "var(--accent)" : "var(--text)" }}>{value}</p>
    </div>
  );
}
