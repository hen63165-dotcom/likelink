/**
 * LunaStatusCard — truthful cloud execution panel ("AI command center").
 *
 * Every value rendered here is a value the cloud actually reported:
 *   • scheduler state  → POST /api/autopilot { mode:"status" } built from the
 *                        real autonomous job queue (never a fixed string)
 *   • publications     → POST /api/autopilot { mode:"public-feed" } reading the
 *                        server publish log (one row per real channel attempt,
 *                        carrying the provider's own message id when it accepted)
 *   • connections      → the channels the platform really has credentials for
 *   • retry            → POST /api/autopilot { mode:"retry-publication" }
 *
 * If a source does not answer, the card says so (OFFLINE / אין חיבור) instead of
 * showing a green dot. There is no demo data and no optimistic status.
 */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../lib/LangContext";
import {
  PLATFORM_STATE,
  PLATFORM_STATE_LABEL,
  PLATFORM_STATE_COLOR,
  PUBLICATION_STATE,
  LUNA_STATE,
  fetchPlatformStatus,
  retryPublication,
  recordLunaHeartbeat,
  schedulerReasonFor,
  isRetryableChannel,
  timeAgo,
} from "../../lib/cloud/lunaStatus.js";
import { Activity, AlertTriangle, RefreshCw, Repeat, ShieldAlert, CheckCircle2, Clock } from "lucide-react";

const REASON_TEXT = {
  jobs_due_or_running: { he: "משימות בתור או רצות ממש עכשיו", en: "Jobs due or running now" },
  jobs_registered: { he: "תור משימות רשום בענן", en: "Job queue registered in cloud" },
  queue_empty: { he: "התור ריק — אין עדיין משימות רשומות", en: "Queue empty — no jobs registered yet" },
  job_failed: { he: "משימה נכשלה — נדרש בירור", en: "A job failed — needs review" },
  persistence_not_configured: { he: "אין הגדרת אחסון בענן — אף משימה לא יכולה לרוץ", en: "No cloud persistence configured — nothing can run" },
  scheduler_unreachable: { he: "לוח הזמנים לא הגיב", en: "Scheduler did not answer" },
};

const LUNA_TEXT = {
  [LUNA_STATE.NEVER_RUN]: { he: "לונה מעולם לא רצה — אין עדיין שום עדות לפעילות", en: "Luna never ran — no evidence of any run yet" },
  [LUNA_STATE.WAITING]: { he: "לונה ממתינה — התור רשום אך אין עבודה פעילה", en: "Luna waiting — queue registered, no active work" },
  [LUNA_STATE.RUNNING]: { he: "לונה מריצה עבודה ממש עכשיו", en: "Luna is running work right now" },
  [LUNA_STATE.ACTIVE]: { he: "לונה פעילה — האות האחרון אומת מהענן", en: "Luna active — last signal verified from the cloud" },
  [LUNA_STATE.STALE]: { he: "האות האחרון התיישן — ייתכן שהפעילות נפסקה", en: "Last signal is stale — activity may have stopped" },
  [LUNA_STATE.OVERDUE]: { he: "התזמון באיחור — ריצת cron צפויה לא הגיעה", en: "Schedule overdue — an expected cron run did not arrive" },
  [LUNA_STATE.UNREACHABLE]: { he: "לונה אינה נגישה — אין תשובה מהענן", en: "Luna unreachable — no answer from the cloud" },
  [LUNA_STATE.ERROR]: { he: "שגיאה — נדרש בירור לפני המשך", en: "Error — needs review before continuing" },
};

const PUB_LABEL = {
  [PUBLICATION_STATE.PUBLISHED]: { he: "פורסם", en: "Published" },
  [PUBLICATION_STATE.PENDING]: { he: "ממתין", en: "Pending" },
  [PUBLICATION_STATE.FAILED]: { he: "נכשל", en: "Failed" },
  [PUBLICATION_STATE.REQUIRES_CONNECTION]: { he: "דורש חיבור", en: "Needs connection" },
};

function pubColor(state) {
  if (state === PUBLICATION_STATE.PUBLISHED) return "var(--success)";
  if (state === PUBLICATION_STATE.FAILED) return "var(--danger)";
  return "var(--warning, #f59e0b)";
}

function Chip({ color, children, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: "var(--bg-subtle)", border: `1px solid ${color}`, color }}
    >
      {children}
    </span>
  );
}

function Metric({ value, label, color }) {
  return (
    <div className="text-center">
      <div className="text-lg font-extrabold" style={{ color: color || "var(--text)" }}>{value}</div>
      <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>{label}</div>
    </div>
  );
}

export default function LunaStatusCard({ status: externalStatus = null, onStatusChange, refreshMs = 60000 } = {}) {
  const { lang } = useI18n();
  const t = (he, en) => (lang === "he" ? he : en);
  const [ownStatus, setOwnStatus] = useState(null);
  const [loading, setLoading] = useState(!externalStatus);
  const [busyId, setBusyId] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const status = externalStatus || ownStatus;

  const load = useCallback(async () => {
    setLoading(true);
    try { recordLunaHeartbeat('tick'); } catch {}
    const next = await fetchPlatformStatus();
    setOwnStatus(next);
    setLoading(false);
    onStatusChange?.(next);
  }, [onStatusChange]);

  // Self-fetching only when the parent does not already poll the same truth.
  useEffect(() => {
    if (externalStatus) return undefined;
    let cancelled = false;
    const run = async () => {
      const next = await fetchPlatformStatus();
      if (!cancelled) { setOwnStatus(next); setLoading(false); onStatusChange?.(next); }
    };
    run();
    const id = setInterval(run, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalStatus, refreshMs]);

  const handleRetry = async (record) => {
    if (!isRetryableChannel(record) || busyId) return;
    setBusyId(record.id);
    setActionMsg(null);
    const res = await retryPublication(record);
    if (res?.ok) {
      const p = res.publication;
      setActionMsg({
        ok: true,
        text: p?.externalId
          ? t(`הפורסם מחדש אושר בענן · מזהה ${p.externalId}`, `Republished and confirmed by the provider · id ${p.externalId}`)
          : t("הפורסם מחדש בוצע בענן", "Retry executed in the cloud"),
      });
    } else {
      setActionMsg({ ok: false, text: t(`הניסיון חזר עם כשל: ${res?.error || "unknown"}`, `Retry came back failed: ${res?.error || "unknown"}`) });
    }
    await load();
    setBusyId(null);
  };

  const state = status?.state || PLATFORM_STATE.OFFLINE;
  const stateLabel = PLATFORM_STATE_LABEL[state]?.[lang === "he" ? "he" : "en"] || state;
  const stateColor = PLATFORM_STATE_COLOR[state] || "var(--text-faint)";
  const jobs = status?.jobs || { jobs: [], total: 0, success: 0, failed: 0, running: 0, pending: 0, skipped: 0, lastRunAt: null, nextRunAt: null };
  const groups = status?.publicationsByContent || [];
  const connections = status?.connections || [];
  const cron = status?.cron;

  return (
    <div className="ll-card rounded-2xl p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: "var(--accent)" }} />
          <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>
            {t("מרכז הבקרה של לונה", "Luna command center")}
          </h3>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
            style={{ background: "var(--bg-subtle)", border: `1px solid ${stateColor}`, color: stateColor }}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full${state === PLATFORM_STATE.ACTIVE ? " animate-pulse" : ""}`}
              style={{ background: stateColor }}
            />
            {stateLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="ll-tap inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold"
          style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {t("רענון", "Refresh")}
        </button>
      </div>

      {/* Why this state — Luna lifecycle first, scheduler reason second. Never a
          bare colour with no explanation, and never a neutral excuse beside a
          red or grey light. */}
      <p className="mb-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        {LUNA_TEXT[status?.luna]?.[lang === "he" ? "he" : "en"]
          || t("ממתין לתשובה מהענן", "Waiting for the cloud answer")}
        {status?.error ? ` · ${status.error}` : ""}
      </p>
      <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        {REASON_TEXT[schedulerReasonFor(state, status?.scheduler)]?.[lang === "he" ? "he" : "en"]
          || t("ממתין לתשובה מהענן", "Waiting for the cloud answer")}
      </p>
      {/* Scheduler surfaces — queue-derived truth: last fire, age, overdue,
          next fire, and tab heartbeat freshness. Null means "never/unknown",
          never a guess. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
        <span>
          {t("ירי אחרון", "Last fire")}: {status?.scheduler?.lastFireAt || status?.queue?.lastFireAt
            ? timeAgo(status.scheduler?.lastFireAt || status.queue?.lastFireAt, lang)
            : t("מעולם לא", "never")}
        </span>
        <span>·</span>
        <span>
          {t("באיחור", "Overdue")}: {(status?.scheduler?.overdue || status?.queue?.overdue || status?.jobs?.overdue)
            ? t("כן", "yes")
            : t("לא", "no")}
        </span>
        <span>·</span>
        <span>
          {t("הטאב", "Tab")}: {status?.browserHeartbeatFresh
            ? t("פעיל", "active")
            : t("אין עדות", "no evidence")}
        </span>
      </div>


      <div className="mb-4 grid grid-cols-5 gap-2">
        <Metric value={jobs.success} label={t("הצליחו", "Success")} color="var(--success)" />
        <Metric value={jobs.failed} label={t("נכשלו", "Failed")} color={jobs.failed ? "var(--danger)" : "var(--text-secondary)"} />
        <Metric value={jobs.running} label={t("פועלים", "Running")} color={jobs.running ? "var(--warning, #f59e0b)" : "var(--text-secondary)"} />
        <Metric value={jobs.pending} label={t("ממתינים", "Pending")} color="var(--text-secondary)" />
        <Metric value={jobs.total} label={t("סה״כ משימות", "Total jobs")} />
      </div>

      {/* Channels the platform really has credentials for. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold" style={{ color: "var(--text-faint)" }}>
          {t("ערוצים מחוברים:", "Connected channels:")}
        </span>
        {connections.length === 0 && (
          <Chip color="var(--text-faint)" title={t("הענן לא דיווח על ערוצים", "The cloud reported no channels")}>
            {t("אין דיווח ענן", "No cloud report")}
          </Chip>
        )}
        {connections.map((c) => (
          <Chip
            key={`${c.provider}-${c.channelLabel || ""}`}
            color={c.state === "CONNECTED" ? "var(--success)" : "var(--warning, #f59e0b)"}
            title={c.state === "CONNECTED"
              ? t("הענן אישר שיש עבורו credentials", "The cloud has credentials for it")
              : t("אין לענן credentials עבורו — לא תתבצע הפצה דרכו", "The cloud has no credentials — nothing can be delivered through it")}
          >
            {c.state === "CONNECTED" ? <CheckCircle2 size={11} /> : <ShieldAlert size={11} />}
            {c.label}
          </Chip>
        ))}
      </div>

      {/* ── What really went out: the server-side publish log ── */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-extrabold" style={{ color: "var(--text)" }}>
          {t("מה פורסם בפועל", "What actually got published")}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          {t(
            `${status?.publicationSummary?.published ?? 0} פורסם · ${status?.publicationSummary?.failed ?? 0} נכשל · ${status?.publicationSummary?.requiresConnection ?? 0} דורש חיבור`,
            `${status?.publicationSummary?.published ?? 0} published · ${status?.publicationSummary?.failed ?? 0} failed · ${status?.publicationSummary?.requiresConnection ?? 0} needs connection`
          )}
        </span>
      </div>

      {actionMsg && (
        <p
          className="mb-2 rounded-lg px-3 py-2 text-[11px] font-bold"
          style={{ background: "var(--bg-subtle)", color: actionMsg.ok ? "var(--success)" : "var(--danger)" }}
        >
          {actionMsg.text}
        </p>
      )}

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {groups.length === 0 && (
          <div className="rounded-lg px-3 py-3 text-xs" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
            {loading && !status
              ? t("טוען מיומן הפרסומים בענן…", "Loading the cloud publication log…")
              : t(
                "אין עדיין רשומת פרסום בענן. כל ניסיון אמיתי — כולל כשל — יופיע כאן במלואו.",
                "No publication record in the cloud yet. Every real attempt — including failures — will appear here in full."
              )}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.contentId} className="rounded-lg px-3 py-2" style={{ background: "var(--bg-subtle)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold" style={{ color: pubColor(g.status) }}>
                {PUB_LABEL[g.status]?.[lang === "he" ? "he" : "en"] || g.status}
              </span>
              <span className="text-xs font-bold" style={{ color: "var(--text)" }}>{g.contentId}</span>
              {g.latestAt && (
                <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  <Clock size={9} />{timeAgo(Date.parse(g.latestAt), lang)}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {g.channels.map((c) => (
                <Chip key={c.id || `${c.channel}-${c.at}`} color={pubColor(c.status)} title={c.error || undefined}>
                  {c.label} · {PUB_LABEL[c.status]?.[lang === "he" ? "he" : "en"] || c.status}
                  {c.externalId ? ` · #${c.externalId}` : ""}
                  {c.attempts > 1 ? ` · ×${c.attempts}` : ""}
                </Chip>
              ))}
              {g.channels.filter(isRetryableChannel).map((c) => (
                <button
                  key={`retry-${c.id}`}
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => handleRetry(c)}
                  className="ll-tap inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ border: "1px solid var(--danger)", color: "var(--danger)" }}
                >
                  <Repeat size={10} className={busyId === c.id ? "animate-spin" : ""} />
                  {t("פרסם שוב בענן", "Retry in cloud")}
                </button>
              ))}
            </div>
            {g.channels.filter((c) => c.error).map((c) => (
              <div key={`err-${c.id || c.channel}`} className="mt-1 flex items-start gap-1 text-[10px]" style={{ color: "var(--danger)" }}>
                <AlertTriangle size={10} style={{ marginTop: 2, flex: "0 0 10px" }} />
                {c.label}: {c.error}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Per-job truth from the real queue ── */}
      {(jobs.jobs || []).length > 0 && (
        <div className="mt-3 space-y-1.5">
          <span className="text-[10px] font-extrabold" style={{ color: "var(--text-faint)" }}>
            {t("משימות בתור הענן", "Jobs in the cloud queue")}
          </span>
          {(jobs.jobs || []).slice(0, 8).map((j) => (
            <div key={j.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5" style={{ background: "var(--bg-subtle)" }}>
              <span className="truncate text-xs font-bold" style={{ color: "var(--text)" }}>{j.id}</span>
              <Chip
                color={j.state === "success" ? "var(--success)" : j.state === "failed" ? "var(--danger)" : j.state === "running" ? "var(--warning, #f59e0b)" : "var(--text-faint)"}
                title={j.result ? String(j.result) : undefined}
              >
                {j.state}
                {j.lastRunAt ? ` · ${timeAgo(j.lastRunAt, lang)}` : ""}
              </Chip>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        {!status?.ok
          ? t(
            "אין תשובה מהענן — המצב המוצג הוא המצב הידוע האחרון, ולא הבטחה לפעילות.",
            "No answer from the cloud — what is shown is the last known state, not a promise of activity."
          )
          : !cron || !cron.everRun
            ? t(
              "אין עדיין עדות לריצת cron מתוזמנת בענן — ייתכן שעדיין לא יצאה לפועל. נקרא ישירות מהענן, ללא נתוני דמו.",
              "No evidence of a scheduled cron run yet — it may not have executed. Read directly from the cloud, no demo data."
            )
            : cron.stale
              ? t(
                `ריצת ה-cron המתוזמנת האחרונה הייתה ${timeAgo(cron.lastBeatAt, lang)} — ייתכן שהתזמון הפסיק לרוץ.`,
                `The last scheduled cron run was ${timeAgo(cron.lastBeatAt, lang)} — the schedule may have stopped firing.`
              )
              : t(
                `תזמון ה-cron האחרון: ${timeAgo(cron.lastBeatAt, lang)} · נקרא ישירות מהענן, ללא נתוני דמו.`,
                `The cron schedule last ran ${timeAgo(cron.lastBeatAt, lang)} ago · read directly from the cloud, no demo data.`
              )}
        {jobs.nextRunAt
          ? ` · ${t("משימה הבאה", "Next job")}: ${new Date(jobs.nextRunAt).toLocaleString(lang === "he" ? "he-IL" : "en-GB")}`
          : ""}
      </p>
    </div>
  );
}
