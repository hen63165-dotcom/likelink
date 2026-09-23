/**
 * LunaStatusCard — Cloud execution health summary.
 * Shows the real status of autonomous jobs (cloud cron + browser ticks).
 * No demo data. All values come from GET /api/autopilot mode=autonomous-jobs-status.
 */

import { useEffect, useState } from "react";
import { useI18n } from "../../lib/LangContext";
import {
  fetchAutonomousJobStatus,
  sortJobsByRecency,
  formatDuration,
  formatTime,
  STATE_LABELS,
  STATE_COLORS,
  STATE_BG,
} from "../../lib/cloud/autonomousJobsClient.js";
import { Activity } from "lucide-react";

export default function LunaStatusCard() {
  const { lang } = useI18n();
  const [jobs, setJobs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAutonomousJobStatus()
      .then((data) => {
        if (!cancelled) {
          setJobs(sortJobsByRecency(data.jobs || []));
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e.message || e));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const t = (he, en) => (lang === "he" ? he : en);

  if (loading) {
    return (
      <div className="ll-card rounded-2xl p-5">
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
          {t("סטטוס לונה — ענן", "Luna Status — Cloud")}
        </h3>
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded-lg" style={{ background: "var(--bg-subtle)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ll-card rounded-2xl p-5">
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
          {t("סטטוס לונה — ענן", "Luna Status — Cloud")}
        </h3>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {t("לא ניתן לטעון סטטוס ענן –", "Cannot load cloud status –")}{" "}
          {error}
        </p>
      </div>
    );
  }

  const successCount = jobs?.filter((j) => j.state === "success").length || 0;
  const failedCount = jobs?.filter((j) => j.state === "failed").length || 0;
  const runningCount = jobs?.filter((j) => j.state === "running").length || 0;
  const pendingCount = jobs?.filter((j) => j.state === "pending").length || 0;
  const skippedCount = jobs?.filter((j) => j.state === "skipped").length || 0;

  return (
    <div className="ll-card rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
          {t("סטטוס לונה — ענן", "Luna Status — Cloud")}
        </h3>
        <Activity size={16} style={{ color: "var(--accent)" }} />
      </div>

      <div className="mb-4 grid grid-cols-5 gap-2">
        <div className="text-center">
          <div className="text-xl font-bold text-[var(--success)]">{successCount}</div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("הצליחו", "Success")}</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-[var(--danger)]">{failedCount}</div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("נכשלו", "Failed")}</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-[var(--warning)]">{runningCount}</div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("פועלים", "Running")}</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-[var(--text-secondary)]">{skippedCount}</div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("נדלגו", "Skipped")}</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-[var(--text-secondary)]">{pendingCount}</div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("ממתינים", "Pending")}</div>
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {jobs.map((j) => (
          <div
            key={j.id}
            className="flex items-center justify-between rounded-lg px-3 py-2"
            style={{ background: STATE_BG[j.state] || "var(--bg-subtle)" }}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${STATE_COLORS[j.state] || ""}`}>
                  {STATE_LABELS[j.state] || j.state}
                </span>
                <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
                  {j.id}
                </span>
              </div>
              {j.result && j.state !== "success" && j.state !== "running" && j.state !== "pending" && (
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  {j.result}
                </div>
              )}
              <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {t("עודכן", "Updated")}: {formatTime(j.lastRunAt, lang)}
                {j.durationMs != null && ` · ${formatDuration(j.durationMs)}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        {t(
          "המידע מגיע מהענן האמיתי — ללא נתוני דמו.",
          "Data comes from real cloud execution — no demo data."
        )}
      </p>
    </div>
  );
}
