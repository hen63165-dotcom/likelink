import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, MousePointer, Eye, ShoppingCart, Target, BarChart3, LineChart, PieChart, Download, AlertCircle, CheckCircle } from "lucide-react";
import { EmptyState, Button } from "../ui/index.jsx";

function MetricCard({ label, value, change, icon: Icon, color = "var(--accent)", trend = "neutral" }) {
  const trendColors = {
    up: "var(--success)",
    down: "var(--danger)",
    neutral: "var(--text-muted)",
  };
  const trendIcons = {
    up: TrendingUp,
    down: TrendingDown,
    neutral: TrendingUp,
  };
  const TrendIcon = trendIcons[trend];

  return (
    <div className="ll-card rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--text)" }}>{value}</p>
          {change !== undefined && (
            <div className="mt-1 flex items-center gap-1">
              <TrendIcon size={12} style={{ color: trendColors[trend] }} />
              <span className="text-xs font-medium" style={{ color: trendColors[trend] }}>
                {change >= 0 ? "+" : ""}{change.toFixed(1)}%
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>מול תקופה קודמת</span>
            </div>
          )}
        </div>
        <div className="p-2 rounded-xl" style={{ background: `${color}22`, color }}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function ChartPlaceholder({ title, height = 200 }) {
  return (
    <div className="ll-card rounded-xl p-4 h-[200px] flex items-center justify-center" style={{ border: "1px solid var(--border)", height }}>
      <div className="text-center" style={{ color: "var(--text-muted)" }}>
        <BarChart3 size={32} className="mx-auto mb-2" style={{ opacity: 0.5 }} />
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs mt-1">התחברו לנתונים אמיתיים כדי לראות גרפים</p>
      </div>
    </div>
  );
}

function BreakdownTable({ title, data, keyLabel, valueLabel, formatValue = v => v }) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="ll-card rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
        <h4 className="text-sm font-bold mb-3" style={{ color: "var(--text)" }}>{title}</h4>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין נתונים לתקופה זו</p>
      </div>
    );
  }

  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);

  return (
    <div className="ll-card rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
      <h4 className="text-sm font-bold mb-3" style={{ color: "var(--text)" }}>{title}</h4>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {sorted.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <span className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{key}</span>
            <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>{formatValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthIndicator({ campaigns }) {
  const statuses = useMemo(() => {
    const counts = { healthy: 0, needs_attention: 0, needs_optimization: 0, critical: 0, unknown: 0 };
    for (const c of campaigns) {
      const h = c.health?.status || "unknown";
      counts[h] = (counts[h] || 0) + 1;
    }
    return counts;
  }, [campaigns]);

  const total = campaigns.length;
  const healthyPct = total > 0 ? Math.round((statuses.healthy / total) * 100) : 0;

  return (
    <div className="ll-card rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
      <h4 className="text-sm font-bold mb-3" style={{ color: "var(--text)" }}>בריאות קמפיינים</h4>
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-24 h-24">
          <svg viewBox="0 0 96 96" className="w-24 h-24 transform -rotate-90">
            <circle cx="48" cy="48" r="40" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="var(--success)"
              strokeWidth="8"
              strokeDasharray={`${(healthyPct / 100) * 251.2} 251.2`}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-2xl font-bold" style={{ color: "var(--text)" }}>{healthyPct}%</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>תקינים</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <HealthBar label="תקין" value={statuses.healthy} total={total} color="var(--success)" />
          <HealthBar label="דורש תשומת לב" value={statuses.needs_attention} total={total} color="var(--warning)" />
          <HealthBar label="דורש אופטימיזציה" value={statuses.needs_optimization} total={total} color="var(--accent)" />
          <HealthBar label="קריטי" value={statuses.critical} total={total} color="var(--danger)" />
        </div>
      </div>
    </div>
  );
}

function HealthBar({ label, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-28 truncate" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-subtle)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-12 text-right" style={{ color }}>{value}</span>
    </div>
  );
}

function LunaInsightsPanel({ insights }) {
  if (!insights || insights.length === 0) {
    return (
      <div className="ll-card rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
        <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: "var(--text)" }}>
          <Sparkles className="text-[var(--accent)]" size={14} />
          תובנות לונה
        </h4>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>לונה טרם ניתחה את הקמפיינים — נדרשים לפחות 30 קליקים לקבלת החלטות.</p>
      </div>
    );
  }

  const decisionColors = {
    increase_exposure: "var(--success)",
    keep: "var(--accent)",
    test_variation: "var(--warning)",
    pause: "var(--danger)",
    insufficient_data: "var(--text-muted)",
  };

  const decisionLabels = {
    increase_exposure: "הגבר חשיפה",
    keep: "השאר",
    test_variation: "בדוק וריאציה",
    pause: "השהה",
    insufficient_data: "נתונים לא מספיקים",
  };

  return (
    <div className="ll-card rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
      <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: "var(--text)" }}>
        <Sparkles className="text-[var(--accent)]" size={14} />
        תובנות לונה ({insights.length})
      </h4>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div key={i} className="p-3 rounded-xl" style={{ background: "var(--bg-subtle)", borderLeft: `3px solid ${decisionColors[insight.decision] || "var(--border)"}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold" style={{ color: "var(--text)" }}>{insight.campaignName || insight.creativeType ? `קריאייטיב: ${insight.creativeType}` : "קמפיין"}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${decisionColors[insight.decision]}22`, color: decisionColors[insight.decision] }}>
                    {decisionLabels[insight.decision] || insight.decision}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                    ביטחון: {insight.confidence}
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{insight.reason}</p>
                {insight.action && (
                  <p className="mt-1 text-xs font-medium" style={{ color: "var(--accent)" }}>פעולה מוצעת: {insight.action}</p>
                )}
                {insight.metrics && (
                  <div className="mt-2 flex flex-wrap gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {Object.entries(insight.metrics).map(([k, v]) => (
                      <span key={k}><strong>{k}:</strong> {v}</span>
                    ))}
                  </div>
                )}
              </div>
              {insight.nextCheckAt && (
                <span className="text-[10px] shrink-0" style={{ color: "var(--text-faint)" }}>
                  בדיקה הבאה: {new Date(insight.nextCheckAt).toLocaleDateString("he-IL")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdsAnalytics({ campaigns, events, creatives, lunaInsights }) {
  const overviewMetrics = useMemo(() => {
    const totals = campaigns.reduce((acc, c) => {
      const m = c.metrics || {};
      acc.impressions += m.impressions || 0;
      acc.creativeViews += m.creativeViews || 0;
      acc.clicks += m.clicks || 0;
      acc.productViews += m.productViews || 0;
      acc.outboundClicks += m.outboundClicks || 0;
      acc.purchases += m.purchases || 0;
      acc.spend += m.spend || 0;
      acc.revenue += m.revenue || 0;
      return acc;
    }, { impressions: 0, creativeViews: 0, clicks: 0, productViews: 0, outboundClicks: 0, purchases: 0, spend: 0, revenue: 0 });

    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    const conversionRate = totals.outboundClicks > 0 ? (totals.purchases / totals.outboundClicks) * 100 : 0;

    return { ...totals, ctr, cpc, roas, conversionRate };
  }, [campaigns]);

  const byPlacement = useMemo(() => {
    const acc = {};
    for (const c of campaigns) {
      for (const p of c.placements || []) {
        acc[p] = (acc[p] || 0) + 1;
      }
    }
    return acc;
  }, [campaigns]);

  const byObjective = useMemo(() => {
    const acc = {};
    for (const c of campaigns) {
      acc[c.objective] = (acc[c.objective] || 0) + 1;
    }
    return acc;
  }, [campaigns]);

  const byStatus = useMemo(() => {
    const acc = {};
    for (const c of campaigns) {
      acc[c.status] = (acc[c.status] || 0) + 1;
    }
    return acc;
  }, [campaigns]);

  const topProducts = useMemo(() => {
    const acc = {};
    for (const c of campaigns) {
      if (c.metrics?.purchases > 0) {
        acc[c.productId] = (acc[c.productId] || 0) + c.metrics.purchases;
      }
    }
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [campaigns]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>אנליטיקס מודעות</h3>
        <Button variant="secondary">
          <Download size={13} /> ייצוא דוח
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="חשיפות" value={overviewMetrics.impressions.toLocaleString("he-IL")} icon={Eye} />
        <MetricCard label="צפיות בקריאייטיב" value={overviewMetrics.creativeViews.toLocaleString("he-IL")} icon={Eye} color="var(--accent)" />
        <MetricCard label="קליקים" value={overviewMetrics.clicks.toLocaleString("he-IL")} icon={MousePointer} color="var(--success)" />
        <MetricCard label="צפיות מוצר" value={overviewMetrics.productViews.toLocaleString("he-IL")} icon={Target} color="var(--warning)" />
        <MetricCard label="קליקים יוצאים" value={overviewMetrics.outboundClicks.toLocaleString("he-IL")} icon={MousePointer} color="var(--accent)" />
        <MetricCard label="רכישות" value={overviewMetrics.purchases.toLocaleString("he-IL")} icon={ShoppingCart} color="var(--success)" />
        <MetricCard label="הוצאות" value={overviewMetrics.spend > 0 ? `₪${overviewMetrics.spend.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "₪0"} icon={DollarSign} color="var(--danger)" />
        <MetricCard label="הכנסות" value={overviewMetrics.revenue > 0 ? `₪${overviewMetrics.revenue.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "₪0"} icon={DollarSign} color="var(--success)" />
        <MetricCard label="CTR" value={`${overviewMetrics.ctr.toFixed(2)}%`} icon={TrendingUp} />
        <MetricCard label="CPC" value={overviewMetrics.cpc > 0 ? `₪${overviewMetrics.cpc.toFixed(2)}` : "—"} icon={DollarSign} color="var(--warning)" />
        <MetricCard label="ROAS" value={overviewMetrics.roas > 0 ? `${overviewMetrics.roas.toFixed(2)}x` : "—"} icon={TrendingUp} color="var(--success)" />
        <MetricCard label="שיעור המרה" value={`${overviewMetrics.conversionRate.toFixed(2)}%`} icon={Target} color="var(--accent)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPlaceholder title="חשיפות וקליקים לאורך זמן" />
        <ChartPlaceholder title="הוצאות והכנסות לאורך זמן" />
        <ChartPlaceholder title="התפלגות לפי מיקום" />
        <ChartPlaceholder title="התפלגות לפי מטרה" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="לפי מיקום" data={byPlacement} keyLabel="מיקום" valueLabel="קמפיינים" />
        <BreakdownTable title="לפי מטרה" data={byObjective} keyLabel="מטרה" valueLabel="קמפיינים" />
        <BreakdownTable title="לפי סטטוס" data={byStatus} keyLabel="סטטוס" valueLabel="קמפיינים" />
        <div className="ll-card rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
          <h4 className="text-sm font-bold mb-3" style={{ color: "var(--text)" }}>מוצרים מובילים (רכישות)</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {topProducts.length > 0 ? (
              topProducts.map(([productId, purchases]) => (
                <div key={productId} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
                  <span className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{productId}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--success)" }}>{purchases} רכישות</span>
                </div>
              ))
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>אין רכישות עדיין</p>
            )}
          </div>
        </div>
      </div>

      {campaigns.length > 0 && <HealthIndicator campaigns={campaigns} />}

      {lunaInsights && <LunaInsightsPanel insights={lunaInsights} />}
    </div>
  );
}