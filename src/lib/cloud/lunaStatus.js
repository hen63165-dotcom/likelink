/**
 * lunaStatus — the single truthful view of the autonomous platform.
 *
 * Every number on the public home page and in the CEO dashboard comes from here.
 * The rule is absolute: a state is only ever ACTIVE when the cloud scheduler can
 * prove it (registered jobs + persisted runs). Missing credentials, an empty
 * queue or a failed run are reported as REQUIRES_CONNECTION / WAITING / FAILED —
 * never as a green light.
 *
 * Layers (all existing, no new serverless function):
 *   • POST /api/autopilot { mode: "status" }         → scheduler + cloud cycle
 *   • POST /api/autopilot { mode: "public-feed" }    → real publication events
 *   • browser heartbeat                             → tab activity recorded only
 *     while real work (sweep/scroll/discovery/UGC/publish) is active
 */

export const LUNA_STATE = {
  NEVER_RUN: "NEVER_RUN",
  WAITING: "WAITING",
  RUNNING: "RUNNING",
  ACTIVE: "ACTIVE",
  STALE: "STALE",
  OVERDUE: "OVERDUE",
  UNREACHABLE: "UNREACHABLE",
  ERROR: "ERROR",
};

export const PLATFORM_STATE = {
  ACTIVE: "ACTIVE",
  WAITING: "WAITING",
  OVERDUE: "OVERDUE",
  FAILED: "FAILED",
  REQUIRES_CONNECTION: "REQUIRES_CONNECTION",
  OFFLINE: "OFFLINE",
};

export const PLATFORM_STATE_LABEL = {
  [PLATFORM_STATE.ACTIVE]: { he: "פעיל בענן", en: "Active in cloud" },
  [PLATFORM_STATE.WAITING]: { he: "ממתין לתור", en: "Waiting for queue" },
  [PLATFORM_STATE.OVERDUE]: { he: "באיחור · ממתין להפעלה", en: "Overdue · waiting to run" },
  [PLATFORM_STATE.FAILED]: { he: "נכשל — דורש בירור", en: "Failed — needs review" },
  [PLATFORM_STATE.REQUIRES_CONNECTION]: { he: "דורש חיבור", en: "Requires connection" },
  [PLATFORM_STATE.OFFLINE]: { he: "אינו זמין", en: "Unavailable" },
};

export const PLATFORM_STATE_COLOR = {
  [PLATFORM_STATE.ACTIVE]: "var(--success)",
  [PLATFORM_STATE.WAITING]: "var(--warning, #f59e0b)",
  [PLATFORM_STATE.OVERDUE]: "var(--warning, #f59e0b)",
  [PLATFORM_STATE.FAILED]: "var(--danger)",
  [PLATFORM_STATE.REQUIRES_CONNECTION]: "var(--warning, #f59e0b)",
  [PLATFORM_STATE.OFFLINE]: "var(--text-faint)",
};

const norm = (v) => String(v || "").toLowerCase();

/**
 * Derive the honest scheduler state from what the cloud actually reports.
 * `cloudConfigured` is false when the persistence layer has no credentials —
 * in that case nothing can run and we say so.
 *
 * Kept for backward compatibility — new code should prefer deriveLunaStatus()
 * which also distinguishes NEVER_RUN / RUNNING / STALE / OVERDUE /
 * UNREACHABLE / ERROR from the same evidence.
 */
export function deriveSchedulerState({ cloudConfigured = true, jobs = [], failedCount = null } = {}) {
  if (!cloudConfigured) return PLATFORM_STATE.REQUIRES_CONNECTION;
  const list = Array.isArray(jobs) ? jobs : [];
  if (!list.length) return failedCount > 0 ? PLATFORM_STATE.FAILED : PLATFORM_STATE.WAITING;
  if (list.some((j) => norm(j?.state) === "failed")) return PLATFORM_STATE.FAILED;
  return PLATFORM_STATE.ACTIVE;
}

// ── Luna autonomous truth ────────────────────────────────────────────────
// The scheduler report (server) only distinguishes REQUIRES_CONNECTION /
// WAITING / FAILED / ACTIVE. Luna's control room needs the full lifecycle,
// derived from the SAME evidence plus the cron beat and the browser
// heartbeat — never from a guess:
//
//   no answer from the cloud            → UNREACHABLE
//   answer flagged an exception         → ERROR
//   cloud has no persistence            → WAITING (with reason
//                                          persistence_not_configured; the
//                                          coarse PLATFORM_STATE maps this to
//                                          REQUIRES_CONNECTION for compat)
//   queue empty + cron never fired       → NEVER_RUN
//   queue empty + cron fired before      → WAITING
//   job running / due now                → RUNNING
//   cron beat overdue vs its own cadence → OVERDUE
//   last real signal older than STALE_MS → STALE
//   otherwise (jobs registered, fresh)   → ACTIVE
//
// Timing inputs are raw epoch-ms (or null when unknown). ACTIVE is returned
// only when at least one real signal exists — a missing heartbeat alone can
// never keep a stale ACTIVE alive.

/** A browser tab counts as "present" for this long after real work. */
export const LUNA_HEARTBEAT_FRESH_MS = 5 * 60 * 1000;
/** No real cloud signal for this long → the panel admits it is STALE. */
export const LUNA_STALE_AFTER_MS = 2 * 24 * 3600 * 1000;
/**
 * A job whose nextRunAt passed is "about to run" only within this window
 * (the cloud dispatcher fires every 15 min; two missed cycles = overdue).
 */
export const LUNA_DUE_GRACE_MS = 30 * 60 * 1000;

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function heartbeatFresh(heartbeatAt, now = Date.now()) {
  const beat = numOrNull(heartbeatAt);
  if (!beat) return false;
  return Number(now) - beat <= LUNA_HEARTBEAT_FRESH_MS;
}

/**
 * Full Luna lifecycle state from real evidence only.
 *
 * @param {object} input
 * @param {boolean} [input.ok]            cloud answered at all
 * @param {boolean} [input.error]         cloud answered with an exception
 * @param {boolean} [input.cloudConfigured] persistence layer present
 * @param {Array}   [input.jobs]          raw queue rows (state/lastRunAt/…)
 * @param {object}  [input.cron]          { everRun, stale, lastBeatAt }
 * @param {number}  [input.heartbeatAt]   browser heartbeat epoch-ms (null = none)
 * @param {number}  [input.now]           clock (injectable for tests)
 */
export function deriveLunaStatus({
  ok = true,
  error = false,
  cloudConfigured = true,
  jobs = [],
  cron = null,
  heartbeatAt = null,
  now = Date.now(),
} = {}) {
  if (!ok) return LUNA_STATE.UNREACHABLE;
  if (error) return LUNA_STATE.ERROR;
  if (!cloudConfigured) return LUNA_STATE.WAITING;
  const list = Array.isArray(jobs) ? jobs : [];
  const failed = list.some((j) => norm(j?.state) === "failed");
  if (failed) return LUNA_STATE.ERROR;
  const running = list.some((j) => norm(j?.state) === "running");
  if (running) return LUNA_STATE.RUNNING;
  const dueAt = list
    .map((j) => Number(j?.nextRunAt) || 0)
    .filter((next) => next > 0 && next <= Number(now));
  if (dueAt.length) {
    // Just became due → the next dispatch picks it up (RUNNING). Waiting past
    // the grace window means the expected trigger never came (OVERDUE).
    return Number(now) - Math.min(...dueAt) > LUNA_DUE_GRACE_MS ? LUNA_STATE.OVERDUE : LUNA_STATE.RUNNING;
  }
  const everRun = Boolean(cron?.everRun);
  const cronStale = cron ? Boolean(cron.stale) : true;
  if (!list.length && !everRun && !numOrNull(heartbeatAt)) return LUNA_STATE.NEVER_RUN;
  if (!list.length) return LUNA_STATE.WAITING;
  // A known cadence that stopped firing is OVERDUE — said only when the
  // beat itself is stale, never from a missing endpoint.
  if (cronStale && everRun) return LUNA_STATE.OVERDUE;
  const signals = [
    numOrNull(heartbeatAt),
    numOrNull(cron?.lastBeatAt),
    ...list.map((j) => numOrNull(j?.lastRunAt)),
  ].filter(Boolean);
  if (!signals.length) return LUNA_STATE.WAITING;
  const freshest = Math.max(...signals);
  if (Number(now) - freshest > LUNA_STALE_AFTER_MS) return LUNA_STATE.STALE;
  return LUNA_STATE.ACTIVE;
}

/**
 * Map the granular Luna state back onto the coarse 5-state platform badge
 * the existing card and header render. No information is invented: ERROR
 * collapses to FAILED, RUNNING/STALE/OVERDUE/NEVER_RUN collapse to the
 * closest honest coarse state.
 */
export function lunaToPlatformState(luna) {
  switch (luna) {
    case LUNA_STATE.ACTIVE:
    case LUNA_STATE.RUNNING:
      return PLATFORM_STATE.ACTIVE;
    case LUNA_STATE.ERROR:
      return PLATFORM_STATE.FAILED;
    case LUNA_STATE.OVERDUE:
    case LUNA_STATE.STALE:
      return PLATFORM_STATE.OVERDUE;
    case LUNA_STATE.WAITING:
    case LUNA_STATE.NEVER_RUN:
      return PLATFORM_STATE.WAITING;
    case LUNA_STATE.UNREACHABLE:
    default:
      return PLATFORM_STATE.OFFLINE;
  }
}

/**
 * Fallback reason code when the scheduler answered but gave no `reason`.
 * Derived from the derived state — the UI must never default to "queue idle"
 * beside a FAILED / REQUIRES_CONNECTION / OFFLINE light.
 * Keys match LunaStatusCard's REASON_TEXT vocabulary.
 */
export function schedulerReasonFor(state, scheduler = null) {
  // The server reason says "due or running" even hours after the trigger was
  // missed — once the badge is OVERDUE the reason must say so too.
  if (state === PLATFORM_STATE.OVERDUE) return "jobs_overdue";
  const explicit = scheduler?.reason;
  if (explicit) return explicit;
  switch (state) {
    case PLATFORM_STATE.REQUIRES_CONNECTION: return "persistence_not_configured";
    case PLATFORM_STATE.FAILED: return "job_failed";
    case PLATFORM_STATE.WAITING: return "queue_empty";
    case PLATFORM_STATE.ACTIVE: return "jobs_registered";
    default: return "scheduler_unreachable";
  }
}

/** Job state in the canonical (lowercase) form the scheduler writes. */
export function normalizeJobState(state) {
  const s = norm(state);
  if (s === "completed" || s === "ok" || s === "success") return "success";
  if (s === "pending" || s === "") return "pending";
  if (s === "running") return "running";
  if (s === "failed" || s === "error") return "failed";
  if (s === "skipped") return "skipped";
  return s || "pending";
}

export function summarizeJobs(jobs) {
  const list = (Array.isArray(jobs) ? jobs : []).map((j) => ({ ...j, state: normalizeJobState(j?.state) }));
  const count = (s) => list.filter((j) => j.state === s).length;
  const lastRunAt = list.map((j) => Number(j?.lastRunAt) || 0).filter(Boolean).reduce((a, b) => Math.max(a, b), 0) || null;
  const nextRunAt = list.map((j) => Number(j?.nextRunAt) || 0).filter(Boolean).reduce((a, b) => Math.min(a, b), 0) || null;
  const lastRuns = list.map((j) => Number(j?.lastRunAt) || 0).filter(Boolean);
  const nextRuns = list.map((j) => Number(j?.nextRunAt) || 0).filter(Boolean);
  const now = Date.now();
  const due = list.filter((j) => Number(j?.nextRunAt || 0) > 0 && Number(j.nextRunAt) <= now);
  const failed = count("failed");
  const running = count("running");
  return {
    jobs: list,
    total: list.length,
    success: count("success"),
    failed,
    running,
    pending: count("pending"),
    skipped: count("skipped"),
    lastRunAt,
    nextRunAt,
    // ── scheduler surfaces (queue-derived, never guessed) ──
    // lastFireAt: freshest real execution stamp in the queue (null = never).
    // lastFireAgeSec: its age in seconds (null when never fired).
    // overdue: jobs whose nextRunAt already passed (same rule the server uses).
    // nextFireAt: earliest upcoming execution (null when none scheduled).
    lastFireAt: lastRuns.length ? Math.max(...lastRuns) : null,
    lastFireAgeSec: lastRuns.length ? Math.max(0, Math.floor((now - Math.max(...lastRuns)) / 1000)) : null,
    overdue: due.length > 0,
    overdueCount: due.length,
    nextFireAt: nextRuns.length ? Math.min(...nextRuns) : null,
  };
}

// ── browser/tab heartbeat ───────────────────────────────────────────────
// Recorded ONLY while real sweep/scroll/discovery/UGC/publishing work is
// active in this tab: the caller must invoke recordLunaHeartbeat(kind) from
// the real work handler (scroll sweep, discovery run, UGC render, publish),
// never on a bare timer. Visibility-gated: a hidden tab never beats.
// Stored in-memory + localStorage so a reload keeps the last real signal
// without inventing a fresh one.

const LUNA_HEARTBEAT_KEY = "likelink:luna:heartbeat";
const LUNA_HEARTBEAT_KINDS = new Set(["sweep", "scroll", "discovery", "ugc", "publishing", "tick"]);

function readStoredHeartbeat() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(LUNA_HEARTBEAT_KEY);
    if (!raw) return null;
    const row = JSON.parse(raw);
    const at = Number(row?.at) || 0;
    return at > 0 ? { at, kind: String(row?.kind || "tick").slice(0, 24) } : null;
  } catch {
    return null;
  }
}

/** Last real-activity heartbeat ({ at, kind } or null = never). Never beats by itself. */
export function getBrowserHeartbeat() {
  return readStoredHeartbeat();
}

function tabVisible() {
  try {
    if (typeof document === "undefined" || !("visibilityState" in document)) return true;
    return document.visibilityState === "visible";
  } catch {
    return true;
  }
}

/**
 * Stamp a heartbeat for real work. No-op (returns null) when the tab is
 * hidden, when no DOM exists (SSR/tests), or for an unknown work kind —
 * so ACTIVE can never be held alive by a background timer.
 */
export function recordLunaHeartbeat(kind = "tick") {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    if (!LUNA_HEARTBEAT_KINDS.has(String(kind))) return readStoredHeartbeat();
    if (!tabVisible()) return readStoredHeartbeat();
    const row = { at: Date.now(), kind: String(kind) };
    window.localStorage.setItem(LUNA_HEARTBEAT_KEY, JSON.stringify(row));
    return row;
  } catch {
    return readStoredHeartbeat();
  }
}

async function postAutopilot(body, timeoutMs = 20000) {
  // ?mode=status is answered by autopilot's fast read-only path, which ignores
  // the body — so only a status request may use it; every other mode
  // (public-feed, …) must reach the main dispatcher.
  const endpoint = body?.mode === "status" ? "/api/autopilot?mode=status" : "/api/autopilot";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`autopilot_${res.status}`);
  return data;
}

/**
 * One call that answers: "is the autonomous system really running, and what has
 * it actually published?" — with truthful degradation on every failure path.
 */
export async function fetchPlatformStatus() {
  const out = {
    ok: false,
    state: PLATFORM_STATE.OFFLINE,
    luna: LUNA_STATE.UNREACHABLE,
    lunaReason: "scheduler_unreachable",
    scheduler: null,
    cloud: null,
    events: [],
    publications: [],
    publicationsByContent: [],
    publicationSummary: summarizePublications([]),
    connections: [],
    jobs: summarizeJobs([]),
    cron: null,
    heartbeat: null,
    browserHeartbeat: null,
    browserHeartbeatFresh: false,
    error: null,
  };
  let status = null;
  let feed = null;
  try {
    [status, feed] = await Promise.all([
      postAutopilot({ mode: "status" }).catch((e) => ({ __error: String(e?.message || e) })),
      postAutopilot({ mode: "public-feed" }).catch(() => null),
    ]);
  } catch (e) {
    out.error = String(e?.message || e);
    return out;
  }

  if (status && !status.__error) {
    out.ok = true;
    out.scheduler = status.scheduler || null;
    out.cloud = status.cloud || null;
    // The schedule's own evidence: a timestamp written by real cron runs only.
    out.cron = status.cron || null;
    // "growth:job:<id>:last" bookkeeping rows surface in the queue scan with an
    // id like "<id>:last" — they are not jobs, so they are never counted.
    out.jobs = summarizeJobs((status.queue?.jobs || []).filter((j) => !String(j?.id || "").includes(":")));
    out.state = deriveSchedulerState({
      cloudConfigured: status.cloudConfigured !== false,
      jobs: out.jobs.jobs,
      failedCount: out.jobs.failed,
    });
    // Granular Luna lifecycle from the same evidence + the tab heartbeat.
    // The heartbeat can only lift toward ACTIVE while real tab work happened;
    // without cloud evidence Luna stays honest (NEVER_RUN/WAITING/…).
    const beat = readStoredHeartbeat();
    out.browserHeartbeat = beat;
    out.browserHeartbeatFresh = heartbeatFresh(beat?.at, Date.now());
    out.luna = deriveLunaStatus({
      ok: true,
      error: false,
      cloudConfigured: status.cloudConfigured !== false,
      jobs: out.jobs.jobs,
      cron: out.cron,
      heartbeatAt: beat?.at ?? null,
    });
    // Surface the heartbeat's own freshness/overdue detail for the room:
    // overdue mirrors the queue, stale mirrors the cron beat.
    out.heartbeatFresh = out.browserHeartbeatFresh;
    out.cronOverdue = Boolean(out.cron?.everRun && out.cron?.stale);
    out.queueOverdue = out.jobs.overdue;
    // The coarse server state says ACTIVE whenever jobs exist; when the same
    // evidence shows the schedule stopped firing, the badge must not stay green.
    if (out.state === PLATFORM_STATE.ACTIVE && (out.luna === LUNA_STATE.OVERDUE || out.luna === LUNA_STATE.STALE)) {
      out.state = PLATFORM_STATE.OVERDUE;
    }
    out.lunaReason = schedulerReasonFor(out.state, out.scheduler);
  } else {
    out.error = (status && status.__error) || "status_unreachable";
    out.luna = LUNA_STATE.UNREACHABLE;
    out.lunaReason = "scheduler_unreachable";
  }
  // Keep a heartbeat view for the card, but built from real recorded beats —
  // never from the existence of an endpoint nobody implements.
  out.heartbeat = out.cron
    ? { reachable: true, lastBeatAt: out.cron.lastBeatAt, everRun: out.cron.everRun, stale: out.cron.stale }
    : { reachable: false, lastBeatAt: null, everRun: false, stale: true };

  if (feed && feed.ok) {
    out.events = Array.isArray(feed.events) ? feed.events : [];
    out.publications = Array.isArray(feed.publications) ? feed.publications : [];
    // The feed reports { provider, connected, channelLabel }; the card renders
    // { label, state }. Map explicitly — otherwise every chip is unnamed and a
    // connected channel (the site feed) is shown as not connected.
    out.connections = (Array.isArray(feed.connections) ? feed.connections : []).map((c) => ({
      ...c,
      label: c?.label || channelLabel(c?.provider),
      state: c?.state || (c?.connected === true ? "CONNECTED" : "REQUIRES_CONNECTION"),
    }));
    out.publicationSummary = summarizePublications(out.publications);
    out.publicationsByContent = publicationsByContent(out.publications);
    out.logEmpty = out.publications.length === 0;
  }
  // Nothing answered at all: the only honest label left is OFFLINE.
  if (!out.ok && !out.events.length) {
    out.state = PLATFORM_STATE.OFFLINE;
    out.luna = LUNA_STATE.UNREACHABLE;
    out.lunaReason = "scheduler_unreachable";
  }
  return out;
}

/**
 * Retry one FAILED publication in the cloud (the real endpoint, the real
 * channel). Resolves with the new truthful record — success is only reported
 * when the provider accepted the post, and the failure detail comes back
 * verbatim when it did not.
 */
export async function retryPublication(record) {
  const id = typeof record === "string" ? record : record?.id;
  if (!id) return { ok: false, error: "no_publication_id" };
  // The retry endpoint requires the creator's verified Supabase session.
  let token = "";
  if (typeof window !== "undefined") {
    try {
      const { getSessionToken } = await import("../auth.js");
      token = (await getSessionToken()) || "";
    } catch { token = ""; }
  }
  try {
    // Not ?mode=status: that fast path would answer with a status report and
    // never run the retry.
    const res = await fetch("/api/autopilot", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ mode: "retry-publication", publicationId: id }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: `retry_unreachable_${res.status}` };
    return data;
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Publication state vocabulary used by the cloud publish log. */
export const PUBLICATION_STATE = {
  PUBLISHED: "PUBLISHED",
  PENDING: "PENDING",
  FAILED: "FAILED",
  REQUIRES_CONNECTION: "REQUIRES_CONNECTION",
};

export function publicationLabel(state, lang = "he") {
  const he = lang === "he";
  switch (state) {
    case PUBLICATION_STATE.PUBLISHED: return he ? "פורסם" : "Published";
    case PUBLICATION_STATE.PENDING: return he ? "ממתין" : "Pending";
    case PUBLICATION_STATE.FAILED: return he ? "נכשל" : "Failed";
    case PUBLICATION_STATE.REQUIRES_CONNECTION: return he ? "דורש חיבור" : "Requires connection";
    default: return state || (he ? "לא ידוע" : "Unknown");
  }
}

export function publicationColor(state) {
  switch (state) {
    case PUBLICATION_STATE.PUBLISHED: return "var(--success)";
    case PUBLICATION_STATE.PENDING: return "var(--warning, #f59e0b)";
    case PUBLICATION_STATE.FAILED: return "var(--danger)";
    default: return "var(--warning, #f59e0b)";
  }
}

/** Human relative time without any invented precision. */
export function timeAgo(ts, lang = "he", now = Date.now()) {
  // The scheduler reports ISO strings (lastFireAt) while the queue uses epoch
  // ms — accept both, so a real run is never shown as "—".
  const t = typeof ts === "string" && !/^\d+$/.test(ts.trim()) ? Date.parse(ts) || 0 : Number(ts) || 0;
  if (!t) return "—";
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60000);
  const he = lang === "he";
  if (m < 1) return he ? "ממש עכשיו" : "just now";
  if (m < 60) return he ? `לפני ${m} דק׳` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return he ? `לפני ${h} שע׳` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return he ? "אתמול" : "1d ago";
  return he ? `לפני ${d} ימים` : `${d}d ago`;
}

// ── Publication log view ─────────────────────────────────────────────────────
// The log rows come from the cloud (publish:log) and carry the provider's own
// message id when a real external channel accepted the post. Nothing here is
// inferred: a row exists only because an attempt actually happened.

export const CHANNEL_LABEL = {
  web: "פיד האתר",
  telegram: "Telegram",
  webhook: "Webhook",
  x: "X",
  mastodon: "Mastodon",
  external: "ערוץ חיצוני",
  unknown: "ערוץ לא ידוע",
};

const PUB_WORST_FIRST = { FAILED: 0, REQUIRES_CONNECTION: 1, PENDING: 2, PUBLISHED: 3 };

export function channelLabel(channel) {
  return CHANNEL_LABEL[channel] || channel || CHANNEL_LABEL.unknown;
}

/** Counts per state and per channel — only ever from real records. */
export function summarizePublications(publications = []) {
  const rows = Array.isArray(publications) ? publications : [];
  const out = { total: rows.length, published: 0, failed: 0, pending: 0, requiresConnection: 0, byChannel: {} };
  for (const p of rows) {
    if (p?.status === PUBLICATION_STATE.PUBLISHED) out.published += 1;
    else if (p?.status === PUBLICATION_STATE.FAILED) out.failed += 1;
    else if (p?.status === PUBLICATION_STATE.REQUIRES_CONNECTION) out.requiresConnection += 1;
    else out.pending += 1;
    const ch = p?.channel || "unknown";
    const box = out.byChannel[ch] || (out.byChannel[ch] = { total: 0, published: 0, failed: 0, pending: 0, requiresConnection: 0 });
    box.total += 1;
    if (p?.status === PUBLICATION_STATE.PUBLISHED) box.published += 1;
    else if (p?.status === PUBLICATION_STATE.FAILED) box.failed += 1;
    else if (p?.status === PUBLICATION_STATE.REQUIRES_CONNECTION) box.requiresConnection += 1;
    else box.pending += 1;
  }
  return out;
}

/**
 * One card per content: its truthful status is the WORST channel outcome
 * (a post that failed on Telegram is not "published" just because the site
 * feed accepted it).
 */
export function publicationsByContent(publications = [], limit = 6) {
  const rows = (Array.isArray(publications) ? publications : [])
    .slice()
    .sort((a, b) => String(b?.publishedAt || "").localeCompare(String(a?.publishedAt || "")));
  const byId = new Map();
  for (const p of rows) {
    const key = p?.contentId || p?.id || "unknown";
    if (!byId.has(key)) byId.set(key, []);
    byId.get(key).push(p);
  }
  const groups = [];
  for (const [contentId, items] of byId) {
    const statuses = items.map((i) => i?.status).filter(Boolean);
    const status = statuses.length
      ? statuses.reduce((worst, s) => ((PUB_WORST_FIRST[s] ?? 99) < (PUB_WORST_FIRST[worst] ?? 99) ? s : worst), statuses[0])
      : PUBLICATION_STATE.PENDING;
    groups.push({
      contentId,
      contentType: items[0]?.contentType || null,
      productId: items.find((i) => i?.productId)?.productId || null,
      status,
      latestAt: items[0]?.publishedAt || null,
      channels: items.map((i) => ({
        id: i?.id || null,
        channel: i?.channel || "unknown",
        label: channelLabel(i?.channel),
        status: i?.status || PUBLICATION_STATE.PENDING,
        at: i?.publishedAt || null,
        externalId: i?.externalId || null,
        error: i?.error || null,
        attempts: Number(i?.attempts) || 1,
      })),
    });
  }
  return groups.slice(0, limit);
}

/** Retry is only meaningful for a FAILED record on a channel we can reach. */
export function isRetryableChannel(record) {
  return Boolean(
    record
    && record.status === PUBLICATION_STATE.FAILED
    && record.id
    && record.channel !== "external"
  );
}

