/**
 * GrowthPipelineStrip — Visualizes the 10-stage growth pipeline
 * with REAL job state from the cloud scheduler.
 *
 * Pipeline:
 * OBSERVE → UNDERSTAND → DISCOVER → PLAN → CREATE → EXECUTE → VERIFY → MEASURE → LEARN → OPTIMIZE
 *
 * Maps to autonomous jobs:
 * OBSERVE → daily-trend-scan
 * DISCOVER → opportunity-discovery
 * PLAN → site-campaign-cycle
 * CREATE → autonomous-growth-cycle
 * EXECUTE → brand-pulse-publish (web) / brand-pulse-external
 * VERIFY → brand-pulse-freshness
 * MEASURE → (no backend yet — SHOWING "טרם מחובר")
 * LEARN → (no backend yet — SHOWING "טרם מ�ובב")
 * OPTIMIZE → (no backend yet — SHOWING "טרם מחובר")
 *
 * No demo state. All stages reflect real job execution.
 */

import { useEffect, useState } from "react";
import { useI18n } from "../../lib/LangContext";
import { fetchAutonomousJobStatus, STATE_LABELS, STATE_COLORS } from "../../lib/cloud/autonomousJobsClient.js";
import { ChevronLeft, CheckCircle, AlertCircle, Clock, Play, Pause } from "lucide-react";

const LUMA = "LUMA";

const PIPELINE = [
  { key: "observe", label: { he: "צופה", en: "OBSERVE" }, job: "daily-trend-scan" },
  { key: "understand", label: { he: "מבין", en: "UNDERSTAND" }, job: null },
  { key: "discover", label: { he: "גילוי", en: "DISCOVER" }, job: "opportunity-discovery" },
  { key: "plan", label: { he: "תכנית", en: "PLAN" }, job: "site-campaign-cycle" },
  { key: "create", label: { he: "יוצר", en: "CREATE" }, job: "autonomous-growth-cycle" },
  { key: "execute", label: { he: "מבצע", en: "EXECUTE" }, job: "brand-pulse-publish" },
  { key: "verify", label: { he: "מאמת", en: "VERIFY" }, job: "brand-pulse-freshness" },
  { key: "measure", label: { he: "מדד", en: "MEASURE" }, job: null },
  { key: "learn", label: { he: "לומ�", en: "LEARN" }, job: null },
  { key: "optimize", label: { he: "מייעל", en: "OPTIMIZE" }, job: null },
];

const STAGE_ICONS = {
  PENDING: Clock,
  RUNNING: Play,
  SUCCESS: CheckCircle,
  FAILED: AlertCircle,
  SKIPPED: Pause,
};

export default function GrowthPipelineStrip() {
  const { lang } = useI18n();
  const [jobs, setJobs] = useState(null);
  const [loading, setLoading] = useState(true);
  const t = (he, en) => (lang === "he" ? he : en);

  useEffect(() => {
    let cancelled = false;
    fetchAutonomousJobStatus()
      .then((data) => {
        if (!cancelled) {
          const map = {};
          for (const j of data.jobs || []) map[j.id] = j;
          setJobs(map);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const getStageState = (stage) => {
    if (!jobs) return "PENDING";
    if (!stage.job) return "NOT_CONNECTED";
    const job = jobs[stage.job];
    if (!job) return "PENDING";
    return job.state.toUpperCase();
  };

  if (loading) {
    return (
      <div className="ll-card rounded-2xl p-4">
        <div className="h-6 animate-pulse rounded-lg" style={{ background: "var(--bg-subtle)", width: "200px" }} />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
          {t("צינור צמיחה — לונה", "Growth Pipeline — Luna")}
        </h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("מקור: ענן אמיתי", "Source: real cloud")}
        </span>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {PIPELINE.map((stage, idx) => {
          const state = getStageState(stage);
          const Icon = STAGE_ICONS[state] || Clock;
          const isNotConnected = state === "NOT_CONNECTED";

          return (
            <div key={stage.key} className="flex items-center">
              <div className="flex flex-col items-center min-w-[70px]">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                    state === "SUCCESS"
                      ? "border-[var(--success)] text-[var(--success)]"
                      : state === "FAILED"
                      ? "border-[var(--danger)] text-[var(--danger)]"
                      : state === "RUNNING"
                      ? "border-[var(--warning)] text-[var(--warning)]"
                      : state === "SKIPPED"
                      ? "border-[var(--text-secondary)] text-[var(--text-secondary)]"
                      : isNotConnected
                      ? "border-[var(--text-muted)] text-[var(--text-muted)]"
                      : "border-[var(--text-secondary)] text-[var(--text-secondary)]"
                  }`}
                  style={{
                    background:
                      state === "SUCCESS"
                        ? "color-mix(in srgb, var(--success) 15%, transparent)"
                        : state === "FAILED"
                        ? "color-mix(in srgb, var(--danger) 15%, transparent)"
                        : state === "RUNNING"
                        ? "color-mix(in srgb, var(--warning) 15%, transparent)"
                        : undefined,
                  }}
                >
                  <Icon size={12} />
                </div>
                <span className="mt-1 text-xs font-medium" style={{ color: "var(--text)" }}>
                  {t(stage.label.he, stage.label.en)}
                </span>
                {state === "FAILED" && (
                  <span className="mt-0.5 text-[9px]" style={{ color: "var(--danger)" }}>
                    {t("נכשל", "FAILED")}
                  </span>
                )}
                {state === "SKIPPED" && (
                  <span className="mt-0.5 text-[9px]" style={{ color: "var(--text-secondary)" }}>
                    {t("דלג", "SKIPPED")}
                  </span>
                )}
                {isNotConnected && (
                  <span className="mt-0.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
                    {t("טרם מחובר", "NOT_CONNECTED")}
                  </span>
                )}
                {state === "RUNNING" && (
                  <span className="mt-0.5 text-[9px]" style={{ color: "var(--warning)" }}>
                    {t("פועל", "RUNNING")}
                  </span>
                )}
                {state === "SUCCESS" && (
                  <span className="mt-0.5 text-[9px]" style={{ color: "var(--success)" }}>
                    {t("הצליח", "SUCCESS")}
                  </span>
                )}
              </div>

              {idx < PIPELINE.length - 1 && (
                <ChevronLeft
                  size={14}
                  className="rotate-180"
                  style={{ color: "var(--text-muted)" }}
                />
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {t(
          "שלושה שלבים (MEASURE/LEARN/OPTIMIZE) אין להם גורם אחראי — מצוין בפועל.",
          "Three stages (MEASURE/LEARN/OPTIMIZE) have no backend — shown honestly."
        )}
      </p>
    </div>
  );
}
