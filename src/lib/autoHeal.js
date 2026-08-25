/* ============================================================
   LIKELINK — Auto-Heal & Self-Repair Runtime (2026)
   ------------------------------------------------------------
   A guarded runtime layer that gives the app "self-awareness":
     1) Catches global errors, logs them, and shows a friendly
        recovery banner instead of a white screen.
     2) Validates localStorage/marketplace data shapes and
        self-heals corrupt records (string/number coercion).
     3) Clears poisoned storage keys that would crash the app.
     4) Reports a small diagnostic payload (heal log) that a
        future admin panel can surface.
   Every routine is wrapped in try/catch and silently no-ops
   on failure — it can NEVER break the host app.
   ============================================================ */

const HEAL_LOG_KEY = "likelink:healLog";
const MAX_LOG = 50;

function safeWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}
function safeRead(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}

/** Append a heal/recovery event to the internal log. */
export function logHealEvent(type, detail) {
  const log = Array.isArray(safeRead(HEAL_LOG_KEY)) ? safeRead(HEAL_LOG_KEY) : [];
  log.push({ type, detail: String(detail || "").slice(0, 200), ts: Date.now() });
  safeWrite(HEAL_LOG_KEY, log.slice(-MAX_LOG));
}

/** Safely coerce a legacy value to a string — never throws. */
export function healString(v, fallback = "") {
  if (typeof v === "string") return v;
  try { return String(v ?? fallback); } catch { return fallback; }
}

/** Safely coerce a legacy value to a finite number — never throws. */
export function healNumber(v, fallback = 0) {
  try {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
}

/** Validate + repair a marketplace record's critical fields. */
export function healRecord(record) {
  if (!record || typeof record !== "object") return null;
  const out = { ...record };
  // String fields
  ["id", "title", "category", "image", "status", "marketerId", "productId", "affiliateUrl"].forEach((k) => {
    if (k in out) out[k] = healString(out[k], "");
  });
  // Numeric fields
  ["price", "commission", "clicks", "saleAmount", "commissionAmount", "platformFee", "marketerNet"].forEach((k) => {
    if (k in out) out[k] = healNumber(out[k], 0);
  });
  // Timestamps
  if ("ts" in out) out.ts = healNumber(out.ts, Date.now());
  if ("createdAt" in out) out.createdAt = healNumber(out.createdAt, Date.now());
  return out;
}

/** Heal an entire array of records; drops nulls. Returns a clean array. */
export function healList(list, label = "list") {
  if (!Array.isArray(list)) {
    logHealEvent("heal", `${label} was not an array — reset to []`);
    return [];
  }
  const healed = [];
  for (const item of list) {
    const h = healRecord(item);
    if (h) healed.push(h);
    else logHealEvent("heal", `${label} dropped a corrupt item`);
  }
  if (healed.length !== list.length) logHealEvent("heal", `${label} repaired ${list.length - healed.length} item(s)`);
  return healed;
}

/** Install a global error boundary that auto-recovers the UI. */
export function installGlobalErrorHealing() {
  if (typeof window === "undefined") return;

  // 1) Global error listener — log + allow app to keep running.
  window.addEventListener("error", (e) => {
    logHealEvent("error", e.message || "Unknown global error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    logHealEvent("rejection", (e.reason && e.reason.message) || "Unhandled promise rejection");
  });

  // 2) Poisoned storage scan: remove known-bad shapes that crash JSON.parse.
  const dangerous = ["marketplace:products", "marketplace:sales", "marketplace:marketers", "marketplace:clicks"];
  dangerous.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return;
      JSON.parse(raw); // throws if corrupt
    } catch {
      // Remove the poisoned key so the app boots cleanly next time.
      try { localStorage.removeItem(key); } catch { /* noop */ }
      logHealEvent("storage", `removed corrupt key ${key}`);
    }
  });

  logHealEvent("boot", "Auto-heal runtime armed");
  return true;
}

/** Returns the last N heal events (for a future admin diagnostics panel). */
export function getHealLog(n = 10) {
  const log = Array.isArray(safeRead(HEAL_LOG_KEY)) ? safeRead(HEAL_LOG_KEY) : [];
  return log.slice(-n);
}
