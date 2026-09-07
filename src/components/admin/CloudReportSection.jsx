import React, { useState, useEffect } from "react";
import { BarChart3, RefreshCw, ShieldAlert } from "lucide-react";
import { StatChip, EmptyState } from "../ui";
import { money } from "../../utils/helpers";

/**
 * Owner Cloud Report ☁️📊 — the ONLY place global system analytics are shown.
 * Numbers come from the SERVER (mode=cloud-report, admin token required) —
 * the source of truth. Unmeasured stages are labeled honestly, never faked.
 */
export default function CloudReportSection({ lang }) {
  const L = (he, en) => (lang === "he" ? he : en);
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [period, setPeriod] = useState("all"); // today | week | month | all

  async function load() {
    setStatus("loading");
    try {
      // Dual-token presentation: admin token when present, plus the verified
      // session token. The SERVER decides which path authorizes (admin token
      // OR Owner session matching OWNER_EMAIL) — never the client.
      const headers = { "content-type": "application/json" };
      const adminToken = sessionStorage.getItem("ll_admin_token") || "";
      if (adminToken) headers.authorization = `Bearer ${adminToken}`;
      try {
        const { supabase, supabaseConfigured } = await import("../../lib/supabaseClient");
        if (supabaseConfigured) {
          const { data } = await supabase.auth.getSession();
          const t = data?.session?.access_token;
          if (t) headers.authorization = `Bearer ${t}`;
        }
      } catch { /* session unavailable — admin token path still applies */ }
      const res = await fetch("/api/store?mode=cloud-report", {
        method: "POST",
        headers,
        body: "{}",
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setReport(data);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => { load(); }, []);

  if (status === "loading") {
    return <div className="surface rounded-2xl p-5 text-sm text-muted">{L("טוען דוח ענן…", "Loading cloud report…")}</div>;
  }
  if (status === "error" || !report) {
    return (
      <div className="surface rounded-2xl p-5 flex flex-col items-center text-center gap-3">
        <ShieldAlert size={22} style={{ color: "var(--danger)" }} />
        <p className="text-sm text-muted">{L("טעינת הדוח נכשלה — נסי שוב.", "Could not load the report — try again.")}</p>
        <button onClick={load} className="tap text-xs font-bold px-4 py-2 rounded-lg" style={{ background: "var(--bg-subtle)" }}>
          {L("רענון", "Retry")}
        </button>
      </div>
    );
  }

  const t = report.traffic?.[period] || report.traffic.all;
  const rev = report.revenue?.[period] || report.revenue.all;
  const vs = report.funnel.verifiedSales;
  const om = report.ownerMoney.lifetime;
  const noTraffic = !report.dataIntegrity.hasAnyTraffic;
  const noSales = !report.dataIntegrity.hasAnySales;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 size={16} /> {L("דוח ענן — נתוני אמת בלבד", "Cloud Report — verified data only")}
        </p>
        <button onClick={load} className="tap p-2 rounded-lg" style={{ background: "var(--bg-subtle)" }} aria-label="refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* TODAY / WEEK / MONTH / ALL */}
      <div className="flex rounded-full p-1 surface-subtle">
        {[
          { id: "today", l: L("היום", "Today") },
          { id: "week", l: L("שבוע", "Week") },
          { id: "month", l: L("חודש", "Month") },
          { id: "all", l: L("הכול", "All") },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className="tap flex-1 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: period === p.id ? "var(--bg-elevated)" : "transparent", color: period === p.id ? "var(--text)" : "var(--text-muted)" }}
          >
            {p.l}
          </button>
        ))}
      </div>

      {/* TRAFFIC — honest empty state, never a fake zero */}
      <div className="surface rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-semibold text-muted mb-3 uppercase tracking-wider">{L("תנועה", "Traffic")}</p>
        {noTraffic ? (
          <p className="text-sm text-muted">{L("לא נמדדה תנועה בתקופה שנבדקה.", "No traffic was measured in this period.")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatChip icon={BarChart3} label={L("קליקים", "Clicks")} value={t.clicks} />
            <StatChip icon={BarChart3} label={L("ערוצים פעילים", "Active channels")} value={report.traffic.channelsActive} />
          </div>
        )}
        {t?.sources?.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {t.sources.slice(0, 5).map((s) => (
              <div key={s.source} className="flex justify-between text-xs">
                <span className="text-muted">{L("מקור:", "Source:")} {s.source}</span>
                <span className="font-semibold">{s.count}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-faint mt-3">
          {L("מבקרים וצפיות במוצר טרם נמדדים — לא מוצגים כאן במכוון.", "Visitors and product views are not measured yet — intentionally not shown.")}
        </p>
      </div>

      {/* FUNNEL */}
      <div className="surface rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-semibold text-muted mb-3 uppercase tracking-wider">{L("משפך ההמרה", "Conversion funnel")}</p>
        <div className="flex justify-between text-xs font-mono mb-2">
          <span>{L("קליקים", "Clicks")}: {report.funnel.clicks[period]}</span>
          <span style={{ color: "var(--text-faint)" }}>→</span>
          <span>{L("Checkout", "Checkout")}: {L("לא נמדד", "not measured")}</span>
          <span style={{ color: "var(--text-faint)" }}>→</span>
          <span>{L("מכירות", "Sales")}: {vs[period]}</span>
        </div>
        <p className="text-[11px] text-faint">
          {L("התחלות Checkout טרם נמדדות במערכת. הפער בין השלבים הוא המידע האמיתי.", "Checkout starts are not measured yet. The gap between stages is the real information.")}
        </p>
      </div>

      {/* REVENUE — verified only */}
      <div className="surface rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-semibold text-muted mb-3 uppercase tracking-wider">{L("הכנסות (מכירות מאומתות בלבד)", "Revenue (verified sales only)")}</p>
        {noSales ? (
          <p className="text-sm text-muted">{L("עדיין אין נתונים.", "No data yet.")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatChip icon={BarChart3} label={L("הכנסות גולמיות", "Gross revenue")} value={money(rev.grossRevenue, lang)} />
            <StatChip icon={BarChart3} label={L("העמלה שלך", "Your commission")} value={money(rev.commission, lang)} accent />
            <StatChip icon={BarChart3} label={L("חלק היוצרות", "Creator share")} value={money(rev.creatorShare, lang)} />
            <StatChip icon={BarChart3} label={L("מכירות", "Verified sales")} value={rev.verifiedSales} />
          </div>
        )}
      </div>

      {/* OWNER MONEY — separated buckets, never mixed */}
      <div className="surface rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-semibold text-muted mb-3 uppercase tracking-wider">{L("מצב תשלומים (סה\"כ)", "Payout status (lifetime)")}</p>
        <div className="flex flex-col gap-1.5 text-xs">
          {[
            [L("נצבר (EARNED)", "EARNED"), om.earned],
            [L("ממתין (PENDING)", "PENDING"), om.pending],
            [L("בעיבוד (PROCESSING)", "PROCESSING"), om.processing],
            [L("שולם בפועל (PAID)", "PAID"), om.paid],
            [L("נכשל (FAILED)", "FAILED"), om.failed],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted">{label}</span>
              <span className="font-bold mono">{money(value, lang)}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-muted">{L("הוחזר (REFUNDED)", "REFUNDED")}</span>
            <span className="text-faint">{L("לא נתמך במערכת עדיין", "not supported yet")}</span>
          </div>
        </div>
      </div>

      {/* HEALTH */}
      <div className="surface rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-semibold text-muted mb-3 uppercase tracking-wider">{L("בריאות המערכת (שבוע אחרון)", "System health (last week)")}</p>
        <div className="flex justify-between text-xs">
          <span className="text-muted">{L("כשלי AutoPilot", "Autopilot failures")}</span>
          <span className="font-bold">{report.issues.autopilotFailuresLastWeek}</span>
        </div>
        <div className="flex justify-between text-xs mt-1.5">
          <span className="text-muted">{L("פעולות חסומות אבטחתית", "Security-blocked actions")}</span>
          <span className="font-bold">{report.issues.securityBlockedLastWeek}</span>
        </div>
        {report.topProduct && (
          <p className="text-xs text-muted mt-3">
            {L("מוצר מוביל:", "Top product:")} <b>{report.topProduct.title || report.topProduct.productId}</b>
          </p>
        )}
        {report.campaignLearning && (
          <p className="text-xs text-muted mt-2" style={{ borderTop: "1px solid var(--bg-subtle)", paddingTop: 8 }}>
            🎯 {L("הבדיקה הבאה:", "Next test:")} {report.campaignLearning.nextTest}
          </p>
        )}
        {report.googleStatus && (
          <p className="text-xs text-muted mt-2">
            🔍 {L("Google:", "Google:")} {report.googleStatus.status} · {L("מוצרים כשירים:", "Eligible:")} {report.googleStatus.eligibleProducts} · {L("תנועת Google:", "Google traffic:")} {report.googleStatus.googleTraffic === "MEASURED" ? report.googleStatus.googleClicksMeasured : L("טרם נמדדה", "not yet measured")}
          </p>
        )}
        {report.siteCampaigns && (
          <p className="text-xs text-muted mt-1">
            ☁️ {L("קמפייני אתר:", "Site campaigns:")} {report.siteCampaigns.total}
            {report.siteCampaigns.last ? ` · ${L("אחרון:", "last:")} ${report.siteCampaigns.last.product} (${report.siteCampaigns.last.status}, ${report.siteCampaigns.last.clicks} ${L("קליקים", "clicks")})` : ""}
          </p>
        )}
      </div>

      <EmptyState
        icon={BarChart3}
        title={L("הדוח מבוסס על נתוני שרת מאומתים בלבד", "Built from server-verified data only")}
        subtitle={L("לא נעשה שימוש במספרים משוערים או מדומים.", "No estimated or fake numbers are ever used.")}
      />
    </div>
  );
}
