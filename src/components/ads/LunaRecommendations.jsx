import React, { useMemo } from "react";
import { X, Sparkles, Zap, TrendingUp, Lightbulb, Target, AlertCircle, CheckCircle, ArrowRight, Play, Pause, Settings, Brain, BarChart3, DollarSign, MousePointer, Eye, ShoppingCart } from "lucide-react";
import { LUNA_DECISION, LUNA_DECISION_LABELS_HE } from "../../lib/ads/types.js";
import { EmptyState, Button } from "../ui/index.jsx";

function RecommendationCard({ insight, onApply, onDismiss }) {
  const decisionColors = {
    increase_exposure: "var(--success)",
    keep: "var(--accent)",
    test_variation: "var(--warning)",
    pause: "var(--danger)",
    insufficient_data: "var(--text-muted)",
  };

  const decisionIcons = {
    increase_exposure: TrendingUp,
    keep: CheckCircle,
    test_variation: Settings,
    pause: Pause,
    insufficient_data: Brain,
  };

  const Icon = decisionIcons[insight.decision] || Lightbulb;
  const color = decisionColors[insight.decision] || "var(--accent)";
  const label = LUNA_DECISION_LABELS_HE[insight.decision] || insight.decision;

  const actionLabels = {
    increase_budget_20_percent: "הגדל תקציב ב-20%",
    test_landing_page_variation: "בדוק וריאציית דף נחיתה",
    test_creative_hook: "בדוק הוק קריאייטיב חדש",
    test_new_creative: "צור קריאייטיב חדש",
    pause_campaign: "השהה קמפיין",
    test_bid_adjustment: "התאם הצעת מחיר",
  };

  return (
    <div className="ll-card rounded-xl p-4 relative" style={{ 
      border: `1px solid ${color}44`,
      background: `${color}08`,
    }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: `${color}22`, color }}>
            <Icon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold" style={{ color: "var(--text)" }}>
                {insight.campaignName ? `קמפיין: ${insight.campaignName}` : insight.creativeType ? `קריאייטיב: ${insight.creativeType}` : "קמפיין"}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}22`, color }}>
                {label}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                ביטחון: {insight.confidence}
              </span>
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{insight.reason}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {insight.action && actionLabels[insight.action] && (
            <Button size="sm" onClick={() => onApply(insight)}>
              <ArrowRight size={12} /> {actionLabels[insight.action]}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => onDismiss(insight)}>
            <X size={12} />
          </Button>
        </div>
      </div>

      {insight.metrics && (
        <div className="mt-3 pt-3 border-t flex flex-wrap gap-4" style={{ borderColor: "var(--border)" }}>
          {Object.entries(insight.metrics).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{k}</span>
              <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {insight.nextCheckAt && (
        <div className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
          בדיקה הבאה: {new Date(insight.nextCheckAt).toLocaleDateString("he-IL")}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ opportunity, onAction }) {
  const typeIcons = {
    new_campaign: Zap,
    creative_test: Sparkles,
    budget_increase: TrendingUp,
    placement_expand: Target,
    product_add: ShoppingCart,
  };

  const typeLabels = {
    new_campaign: "קמפיין חדש",
    creative_test: "בדיקת קריאייטיב",
    budget_increase: "הגדלת תקציב",
    placement_expand: "הרחבת מיקומים",
    product_add: "הוספת מוצר",
  };

  const Icon = typeIcons[opportunity.type] || Lightbulb;

  return (
    <div className="ll-card rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
            <Icon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold" style={{ color: "var(--text)" }}>{typeLabels[opportunity.type] || opportunity.type}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                פוטנציאל: {opportunity.potential || "בינוני"}
              </span>
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{opportunity.reason}</p>
            {opportunity.products?.length && (
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                מוצרים רלוונטיים: {opportunity.products.slice(0, 3).map(p => p.title).join(", ")}{opportunity.products.length > 3 ? "…" : ""}
              </p>
            )}
          </div>
        </div>
        <Button size="sm" onClick={() => onAction(opportunity)}>
          <ArrowRight size={12} /> פעולה
        </Button>
      </div>
    </div>
  );
}

export default function LunaRecommendations({ 
  campaigns = [], 
  creatives = [], 
  events = [],
  products = [],
  onApplyInsight,
  onDismissInsight,
  onActionOpportunity,
}) {
  const insights = useMemo(() => {
    // This would normally come from lunaAdsBrain.getLunaRecommendations
    // For now, we'll generate basic insights from campaign data
    const insights = [];
    
    for (const campaign of campaigns) {
      const m = campaign.metrics || {};
      const clicks = m.clicks || 0;
      const impressions = m.impressions || 0;
      const purchases = m.purchases || 0;
      const outboundClicks = m.outboundClicks || 0;
      const spend = m.spend || 0;
      const revenue = m.revenue || 0;
      const ctr = impressions > 0 ? clicks / impressions : 0;
      const conversionRate = outboundClicks > 0 ? purchases / outboundClicks : 0;
      const roas = spend > 0 ? revenue / spend : 0;

      if (clicks < 30) {
        insights.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          decision: "insufficient_data",
          reason: `צריך לפחות 30 קליקים להחלטה (יש ${clicks})`,
          confidence: "low",
          action: null,
          nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
          metrics: { impressions, clicks, ctr: `${(ctr * 100).toFixed(2)}%`, purchases },
        });
        continue;
      }

      if (ctr >= 0.0225 && conversionRate >= 0.03 && roas >= 2.4) {
        insights.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          decision: "increase_exposure",
          reason: "ביצועים מצוינים — CTR, המרות ו-ROAS מעל הממוצע",
          confidence: "high",
          action: "increase_budget_20_percent",
          nextCheckAt: Date.now() + 12 * 60 * 60 * 1000,
          metrics: { impressions, clicks, ctr: `${(ctr * 100).toFixed(2)}%`, roas: roas.toFixed(2), purchases },
        });
      } else if (ctr >= 0.015 && conversionRate >= 0.02) {
        insights.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          decision: "keep",
          reason: "ביצועים טובים — CTR והמרות מעל הממוצע",
          confidence: "high",
          action: null,
          nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
          metrics: { impressions, clicks, ctr: `${(ctr * 100).toFixed(2)}%`, roas: roas.toFixed(2), purchases },
        });
      } else if (ctr >= 0.015 && conversionRate < 0.01) {
        insights.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          decision: "test_variation",
          reason: "CTR טוב אבל המרות נמוכות — בדוק דף נחיתה/הצעה",
          confidence: "medium",
          action: "test_landing_page_variation",
          nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
          metrics: { impressions, clicks, ctr: `${(ctr * 100).toFixed(2)}%`, conversionRate: `${(conversionRate * 100).toFixed(2)}%` },
        });
      } else if (ctr < 0.0075 && conversionRate >= 0.02) {
        insights.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          decision: "test_variation",
          reason: "המרות טובות אבל CTR נמוך — בדוק קריאייטיב/הוק",
          confidence: "medium",
          action: "test_creative_hook",
          nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
          metrics: { impressions, clicks, ctr: `${(ctr * 100).toFixed(2)}%`, conversionRate: `${(conversionRate * 100).toFixed(2)}%` },
        });
      } else if (ctr < 0.0075 && conversionRate < 0.01) {
        if (campaign.luna?.decisionsCount >= 2) {
          insights.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            decision: "pause",
            reason: "ביצועים נמוכים באופן עקבי — השהה ובדוק מוצר/קהל",
            confidence: "high",
            action: "pause_campaign",
            nextCheckAt: Date.now() + 48 * 60 * 60 * 1000,
            metrics: { impressions, clicks, ctr: `${(ctr * 100).toFixed(2)}%`, conversionRate: `${(conversionRate * 100).toFixed(2)}%` },
          });
        } else {
          insights.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            decision: "test_variation",
            reason: "ביצועים נמוכים — נסה קריאייטיב/קהל חדש",
            confidence: "medium",
            action: "test_new_creative",
            nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
            metrics: { impressions, clicks, ctr: `${(ctr * 100).toFixed(2)}%`, conversionRate: `${(conversionRate * 100).toFixed(2)}%` },
          });
        }
      } else if (roas !== null && roas < 1.0 && purchases > 0) {
        insights.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          decision: "test_variation",
          reason: "ROAS מתחת ל-1x — בדוק מחיר/עלות או הצעה",
          confidence: "medium",
          action: "test_bid_adjustment",
          nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
          metrics: { impressions, clicks, ctr: `${(ctr * 100).toFixed(2)}%`, roas: roas.toFixed(2), purchases },
        });
      } else {
        insights.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          decision: "keep",
          reason: "ביצועים בטווח הנורמלי — המשך מעקב",
          confidence: "medium",
          action: null,
          nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
          metrics: { impressions, clicks, ctr: `${(ctr * 100).toFixed(2)}%`, roas: roas.toFixed(2), purchases },
        });
      }
    }

    return insights.sort((a, b) => {
      const priority = { pause: 4, increase_exposure: 3, test_variation: 2, keep: 1, insufficient_data: 0 };
      return (priority[b.decision] || 0) - (priority[a.decision] || 0);
    });
  }, [campaigns]);

  const opportunities = useMemo(() => {
    const opps = [];
    const activeCampaigns = campaigns.filter(c => c.status === "active");
    const pausedCampaigns = campaigns.filter(c => c.status === "paused");
    const draftCampaigns = campaigns.filter(c => c.status === "draft");

    if (draftCampaigns.length > 0) {
      opps.push({
        type: "new_campaign",
        reason: `${draftCampaigns.length} קמפיינים בטיוטה — אפשר להפעיל אותם`,
        potential: "גבוה",
        campaigns: draftCampaigns,
      });
    }

    const lowBudgetCampaigns = activeCampaigns.filter(c => c.dailyBudget && c.dailyBudget < 50);
    if (lowBudgetCampaigns.length > 0) {
      opps.push({
        type: "budget_increase",
        reason: `${lowBudgetCampaigns.length} קמפיינים פעילים עם תקציב יומי נמוך (< ₪50)`,
        potential: "בינוני",
        campaigns: lowBudgetCampaigns,
      });
    }

    const singlePlacementCampaigns = activeCampaigns.filter(c => (c.placements || []).length === 1);
    if (singlePlacementCampaigns.length > 0) {
      opps.push({
        type: "placement_expand",
        reason: `${singlePlacementCampaigns.length} קמפיינים רצים במיקום בודד — אפשר להרחיב`,
        potential: "בינוני",
        campaigns: singlePlacementCampaigns,
      });
    }

    const productsWithoutCampaigns = products.filter(p => 
      !campaigns.some(c => c.productId === p.id)
    ).slice(0, 5);
    
    if (productsWithoutCampaigns.length > 0) {
      opps.push({
        type: "product_add",
        reason: `${productsWithoutCampaigns.length} מוצרים מאושרים ללא קמפיין פעיל`,
        potential: "גבוה",
        products: productsWithoutCampaigns,
      });
    }

    const creativeTypes = [...new Set(creatives.map(c => c.type))];
    if (creativeTypes.length < 3 && creatives.length > 0) {
      opps.push({
        type: "creative_test",
        reason: `רק ${creativeTypes.length} סוגי קריאייטיב בשימוש — מומלץ לבדוק עוד`,
        potential: "בינוני",
      });
    }

    return opps;
  }, [campaigns, creatives, products]);

  const actionableInsights = insights.filter(i => i.action);
  const monitoringInsights = insights.filter(i => !i.action && i.decision !== "insufficient_data");
  const insufficientData = insights.filter(i => i.decision === "insufficient_data");

  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="לונה עדיין לא יכולה להמליץ"
        body="צרו קמפיינים ראשונים כדי שלונה תוכל לנתח ביצועים ולתת תובנות אמיתיות."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
          <Sparkles className="text-[var(--accent)]" size={18} />
          המלצות לונה
        </h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {insights.length} תובנות · {opportunities.length} הזדמנויות
        </span>
      </div>

      {actionableInsights.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <AlertCircle className="text-[var(--warning)]" size={14} />
            פעולות נדרשות ({actionableInsights.length})
          </h4>
          <div className="space-y-3">
            {actionableInsights.map((insight, i) => (
              <RecommendationCard
                key={insight.campaignId || i}
                insight={insight}
                onApply={onApplyInsight}
                onDismiss={onDismissInsight}
              />
            ))}
          </div>
        </div>
      )}

      {monitoringInsights.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <CheckCircle className="text-[var(--success)]" size={14} />
            למעקב ({monitoringInsights.length})
          </h4>
          <div className="space-y-3">
            {monitoringInsights.map((insight, i) => (
              <RecommendationCard
                key={insight.campaignId || i}
                insight={insight}
                onApply={onApplyInsight}
                onDismiss={onDismissInsight}
              />
            ))}
          </div>
        </div>
      )}

      {insufficientData.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <Brain size={14} />
            נדרשים עוד נתונים ({insufficientData.length})
          </h4>
          <div className="space-y-3">
            {insufficientData.map((insight, i) => (
              <RecommendationCard
                key={insight.campaignId || i}
                insight={insight}
                onApply={onApplyInsight}
                onDismiss={onDismissInsight}
              />
            ))}
          </div>
        </div>
      )}

      {opportunities.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Zap className="text-[var(--accent)]" size={14} />
            הזדמנויות צמיחה ({opportunities.length})
          </h4>
          <div className="space-y-3">
            {opportunities.map((opp, i) => (
              <OpportunityCard
                key={i}
                opportunity={opp}
                onAction={onActionOpportunity}
              />
            ))}
          </div>
        </div>
      )}

      {actionableInsights.length === 0 && monitoringInsights.length === 0 && insufficientData.length === 0 && opportunities.length === 0 && (
        <EmptyState
          icon={CheckCircle}
          title="הכל תקין"
          body="לונה לא מצאה פעולות דחופות או הזדמנויות כרגע. המשיכו לעקוב."
        />
      )}
    </div>
  );
}