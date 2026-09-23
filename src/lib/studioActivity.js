/* ============================================================
   LikeLink Studio activity log (local, per-device).
   ------------------------------------------------------------
   Records REAL user-facing events that happened in THIS browser:
   Luna runs/resumes, product views/clicks, favorites, follows,
   product adds, sales, shares, video renders… Nothing is invented:
   every entry is appended by the code path that performed the action.
   Used by the Studio Overview "recent activity" strip so the Studio
   visibly reacts to what the user actually did.
   Pure + guarded: safe in node/test (no window/localStorage) too.
   ============================================================ */

const KEY = "ll:studio-activity:v1";
const CAP = 60;

function store() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readAll() {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e === "object") : [];
  } catch {
    return [];
  }
}

function writeAll(entries) {
  const s = store();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(entries.slice(-CAP)));
  } catch {
    // quota/private mode — activity is best-effort, never breaks the app
  }
}

/**
 * Append one activity entry. Returns the entry (or null when storage
 * is unavailable). type is a short machine key; label is user-facing text.
 */
export function recordActivity(type, label, meta = {}) {
  if (!type) return null;
  const entry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type: String(type),
    label: label ? String(label).slice(0, 160) : String(type),
    ts: Date.now(),
    ...(meta && typeof meta === "object" ? { meta } : {}),
  };
  try {
    const all = readAll();
    all.push(entry);
    writeAll(all);
  } catch {
    // best-effort
  }
  return entry;
}

/** Newest-first activity entries (capped). */
export function getActivity(limit = 20) {
  const n = Math.max(1, Math.min(CAP, Number(limit) || 20));
  return readAll().slice(-n).reverse();
}

/** Clear the local activity log (used by tests / settings reset). */
export function clearActivity() {
  const s = store();
  try { s?.removeItem(KEY); } catch { /* noop */ }
}

/**
 * Merge the local activity log with cloud/local marketplace events
 * (clicks, sales, notifications) into one newest-first feed for the
 * Overview "recent activity" strip. Every item is real: either an
 * action this device performed, or a marketplace record that exists.
 */
export function buildActivityFeed({ activity = [], clicks = [], sales = [], notifications = [], limit = 12 } = {}) {
  const items = [];
  const seen = new Set();
  const push = (item) => {
    if (!item) return;
    const id = String(item.id || `${item.kind}-${item.ts}-${item.label}`).slice(0, 120);
    if (seen.has(id)) return;
    seen.add(id);
    items.push(item);
  };
  for (const a of (Array.isArray(activity) ? activity : [])) {
    if (!a) continue;
    push({ id: a.id || `a-${a.ts}`, ts: a.ts || 0, label: a.label || a.type, kind: "action" });
  }
  for (const c of (Array.isArray(clicks) ? clicks : [])) {
    if (!c) continue;
    push({ id: c.id || `c-${c.ts}`, ts: c.ts || 0, label: c.label || "click", kind: "click" });
  }
  for (const s of (Array.isArray(sales) ? sales : [])) {
    if (!s) continue;
    push({ id: s.id || `s-${s.ts}`, ts: s.ts || 0, label: s.label || "sale", kind: "sale" });
  }
  for (const n of (Array.isArray(notifications) ? notifications : [])) {
    if (!n) continue;
    push({ id: n.id || `n-${n.ts}`, ts: n.ts || 0, label: n.title || n.message || "update", kind: "notice" });
  }
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const n = Math.max(1, Math.min(60, Number(limit) || 12));
  return items.slice(0, n);
}
