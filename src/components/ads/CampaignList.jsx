import React, { useState, useMemo } from "react";
import { Plus, BarChart3, ChevronDown, ChevronUp, Play, Pause, Trash2, Edit, Eye, MoreVertical, AlertCircle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { CAMPAIGN_STATUS, STATUS_LABELS_HE, OBJECTIVE_LABELS_HE, TIER_LABELS_HE } from "../../lib/ads/types.js";
import { EmptyState, Button, LabeledInput } from "../ui/index.jsx";

function StatusBadge({ status }) {
  const labels = STATUS_LABELS_HE;
  const colors = {
    draft: "var(--text-faint)",
    pending_review: "var(--warning)",
    active: "var(--success)",
    paused: "var(--accent)",
    completed: "var(--text-secondary)",
    archived: "var(--text-faint)",
  };
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${colors[status]}22`, color: colors[status] }}>
      {labels[status] || status}
    </span>
  );
}

function ObjectiveBadge({ objective }) {
  const labels = OBJECTIVE_LABELS_HE;
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
      {labels[objective] || objective}
    </span>
  );
}

function TierBadge({ tier }) {
  const labels = TIER_LABELS_HE;
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
      {labels[tier] || tier}
    </span>
  );
}

function CampaignRow({ campaign, onToggle, onEdit, onDelete, onView, expanded, onExpand, loadingAction }) {
  const health = campaign.health || { score: 0, status: "unknown", issues: [] };
  const healthColors = {
    healthy: "var(--success)",
    needs_attention: "var(--warning)",
    needs_optimization: "var(--accent)",
    critical: "var(--danger)",
    unknown: "var(--text-faint)",
  };
  const healthLabels = {
    healthy: "תקין",
    needs_attention: "דורש תשומת לב",
    needs_optimization: "דורש אופטימיזציה",
    critical: "קריטי",
    unknown: "לא ידוע",
  };

  return (
    <div className="ll-card rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h4 className="font-bold truncate" style={{ color: "var(--text)" }}>{campaign.name}</h4>
              <StatusBadge status={campaign.status} />
              <ObjectiveBadge objective={campaign.objective} />
              <TierBadge tier={campaign.tier} />
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
              <span dir="ltr">ID: {campaign.id}</span>
              <span dir="ltr">מוצר: {campaign.productId}</span>
              <span dir="ltr">תקציב יומי: {campaign.dailyBudget ? `₪${campaign.dailyBudget}` : "ללא הגבלה"}</span>
              <span dir="ltr">נוצר: {new Date(campaign.createdAt).toLocaleDateString("he-IL")}</span>
            </div>
            {health.issues.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {health.issues.map((issue, i) => (
                  <span key={i} className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--danger-subtle)", color: "var(--danger)" }}>
                    {issue}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-[10px] font-bold" style={{ color: healthColors[health.status] }}>
                {healthLabels[health.status]}
              </span>
              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-subtle)" }}>
                <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, health.score))}%`, background: healthColors[health.status] }} />
              </div>
            </div>

            <div className="relative">
              <button onClick={onExpand} className="ll-tap p-2 rounded-lg" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {campaign.status === "draft" && (
            <Button size="sm" onClick={() => onToggle(campaign.id, "pending_review")} disabled={loadingAction === campaign.id}>
              <CheckCircle size={13} /> {loadingAction === campaign.id ? "שולח…" : "שלח לאישור"}
            </Button>
          )}
          {campaign.status === "pending_review" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => onToggle(campaign.id, "draft")} disabled={loadingAction === campaign.id}>
                <XCircle size={13} /> החזר לטיוטה
              </Button>
            </>
          )}
          {campaign.status === "active" && (
            <Button size="sm" variant="secondary" onClick={() => onToggle(campaign.id, "paused")} disabled={loadingAction === campaign.id}>
              <Pause size={13} /> השהה
            </Button>
          )}
          {campaign.status === "paused" && (
            <Button size="sm" onClick={() => onToggle(campaign.id, "active")} disabled={loadingAction === campaign.id}>
              <Play size={13} /> {loadingAction === campaign.id ? "מפעיל…" : "הפעל"}
            </Button>
          )}
          {["active", "paused"].includes(campaign.status) && (
            <Button size="sm" variant="secondary" onClick={() => onToggle(campaign.id, "completed")} disabled={loadingAction === campaign.id}>
              סיים קמפיין
            </Button>
          )}
          {["draft", "pending_review", "paused", "completed"].includes(campaign.status) && (
            <Button size="sm" variant="secondary" onClick={() => onEdit(campaign)}>
              <Edit size={13} /> עריכה
            </Button>
          )}
          {campaign.status !== "archived" && (
            <Button size="sm" variant="secondary" onClick={() => onDelete(campaign.id)} disabled={loadingAction === campaign.id}>
              <Trash2 size={13} /> ארכיון
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => onView(campaign)}>
            <Eye size={13} /> צפייה
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
            <MetricCard label="חשיפות" value={campaign.metrics?.impressions || 0} />
            <MetricCard label="צפיות" value={campaign.metrics?.creativeViews || 0} />
            <MetricCard label="קליקים" value={campaign.metrics?.clicks || 0} />
            <MetricCard label="צפיות מוצר" value={campaign.metrics?.productViews || 0} />
            <MetricCard label="קליקים יוצאים" value={campaign.metrics?.outboundClicks || 0} />
            <MetricCard label="רכישות" value={campaign.metrics?.purchases || 0} />
            <MetricCard label="הוצאות" value={campaign.metrics?.spend ? `₪${campaign.metrics.spend.toFixed(2)}` : "₪0"} />
            <MetricCard label="הכנסות" value={campaign.metrics?.revenue ? `₪${campaign.metrics.revenue.toFixed(2)}` : "₪0"} />
            <MetricCard label="CTR" value={campaign.metrics?.ctr ? `${(campaign.metrics.ctr * 100).toFixed(2)}%` : "0%"} />
            <MetricCard label="CPC" value={campaign.metrics?.cpc ? `₪${campaign.metrics.cpc.toFixed(2)}` : "—"} />
            <MetricCard label="ROAS" value={campaign.metrics?.roas ? `${campaign.metrics.roas.toFixed(2)}x` : "—"} />
            <MetricCard label="המרה" value={campaign.metrics?.outboundClicks > 0 ? `${((campaign.metrics.purchases / campaign.metrics.outboundClicks) * 100).toFixed(2)}%` : "—"} />
          </div>

          {campaign.luna && (
            <div className="mt-4 p-3 rounded-xl" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-sm" style={{ color: "var(--accent)" }}>לונה — החלטה אחרונה</span>
                {campaign.luna.lastDecision && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent)", color: "var(--bg)" }}>
                    {campaign.luna.lastDecision}
                  </span>
                )}
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {campaign.luna.lastDecisionAt ? `ב־${new Date(campaign.luna.lastDecisionAt).toLocaleString("he-IL")}` : "טרם התקבלה החלטה"}
              </p>
              {campaign.luna.reason && (
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{campaign.luna.reason}</p>
              )}
            </div>
          )}

          {campaign.targeting && Object.keys(campaign.targeting).length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-bold mb-2" style={{ color: "var(--text)" }}>טירגוט</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(campaign.targeting).map(([key, value]) => (
                  <span key={key} className="rounded px-2 py-0.5 text-[10px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                    {key}: {JSON.stringify(value)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="ll-card rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</p>
      <p className="mt-1 text-lg font-bold truncate" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}

export default function CampaignList({ campaigns, onToggleStatus, onEdit, onDelete, onView, loadingAction }) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const { lang } = { lang: "he" };

  const sortedCampaigns = useMemo(() => {
    const statusOrder = { active: 0, paused: 1, pending_review: 2, draft: 3, completed: 4, archived: 5 };
    return [...campaigns].sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));
  }, [campaigns]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="אין קמפיינים"
        body="צרו קמפיין ראשון כדי להתחיל לפרסם מוצרים ברשת המודעות של LikeLink."
        action={<Button onClick={onEdit}><Plus size={14} /> צור קמפיין חדש</Button>}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>קמפיינים ({campaigns.length})</h3>
        <Button onClick={() => onEdit(null)}>
          <BarChart3 size={14} /> קמפיין חדש
        </Button>
      </div>
      <div className="space-y-3">
        {sortedCampaigns.map((campaign) => (
          <CampaignRow
            key={campaign.id}
            campaign={campaign}
            expanded={expandedIds.has(campaign.id)}
            onExpand={() => toggleExpand(campaign.id)}
            onToggle={onToggleStatus}
            onEdit={onEdit}
            onDelete={onDelete}
            onView={onView}
            loadingAction={loadingAction}
          />
        ))}
      </div>
    </div>
  );
}