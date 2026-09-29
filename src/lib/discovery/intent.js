// Intent compiler + capability resolver + action graph — LikeLink-native.
//
// GOAL (free text, Hebrew or English) → INTENT (structured) → REQUIRED STATE
// → GAP against the real passports → CAPABILITIES that can close each gap
// (native first) → ACTION GRAPH with dependencies, permissions and status.
//
// Deterministic: a small intent grammar, set arithmetic over facts and a
// topological order — no AI provider is involved, so this keeps working if
// every AI API disappears (zero-AI-dependency core). The graph is derived
// from the real state every time; nothing here is a fixed workflow.
import { CAPABILITIES, FACTS, PERMISSION, EXECUTOR, capabilityForFact } from "./capabilities.js";

/** Intent grammar: each outcome says which facts must become true. */
export const OUTCOMES = Object.freeze({
  discovery: {
    he: "להגדיל גילוי וחשיפה", match: /חשיפ|גילוי|לגלות|נראות|discover|exposure|visib|reach/i,
    facts: ["page_live", "seo_complete", "structured_data", "share_ready", "tracking_ready", "content_ready"],
  },
  organic_search: {
    he: "גילוי אורגני בחיפוש", match: /אורגני|חיפוש|seo|organic|search|גוגל|google/i,
    facts: ["page_live", "seo_complete", "structured_data"],
  },
  merchant: {
    he: "הכנה ל-Google Merchant", match: /merchant|מרצ'נט|מרצנט|שופינג|shopping|חנות.*גוגל|גוגל.*חנות|store.*google|google.*store/i,
    facts: ["page_live", "structured_data", "merchant_eligible"],
  },
  distribution: {
    he: "הפצה בערוצים מורשים", match: /הפצ|פרסמ|לפרסם|שתפ|publish|distribut|share|everywhere|בכל מקום/i,
    facts: ["share_ready", "tracking_ready", "external_channel_connected", "published_external"],
  },
  campaign: {
    he: "הכנת קמפיין", match: /קמפיין|campaign|מבצע|promot|קדמ|לקדם/i,
    facts: ["content_ready", "share_ready", "tracking_ready", "media_video"],
  },
  repair: {
    he: "תיקון כל מה שחוסם גילוי", match: /תקנ|תקני|תקן|לתקן|חוסם|מונע|fix|repair|blocking|prevent/i,
    facts: ["page_live", "seo_complete", "structured_data", "share_ready", "tracking_ready", "content_ready", "merchant_eligible", "collection_member", "media_video"],
  },
  opportunities: {
    he: "איתור הזדמנויות", match: /הזדמנו|opportunit|biggest|הכי גדול/i,
    facts: [], analyzeOnly: true,
  },
  payments: {
    he: "בדיקת מצב התשלום והמנוי", match: /תשלום|מנוי|payment|subscription|reconcil|חיוב/i,
    facts: [], capabilityOnly: "reconcile_subscription",
  },
});

/**
 * Compile a goal into a structured Intent.
 * @param {string} text  the owner's goal (e.g. "לונה, תכיני את החנות לגוגל")
 * @param {object} ctx   { productId, scopeProductIds, deadline }
 */
export function compileIntent(text, { productId = null, scopeProductIds = [], deadline = null } = {}) {
  const goal = String(text || "").trim().slice(0, 300);
  const matched = Object.entries(OUTCOMES).filter(([, o]) => o.match.test(goal)).map(([id]) => id);
  // "fix everything" subsumes the others; otherwise keep every matched outcome.
  const outcomes = matched.includes("repair") ? ["repair", ...matched.filter((m) => m === "payments")] : matched;
  const understood = outcomes.length > 0;
  const final = understood ? outcomes : ["opportunities"];
  const facts = [...new Set(final.flatMap((id) => OUTCOMES[id].facts))];
  const subject = productId
    ? { type: "product", ids: [String(productId)] }
    : /מוצר הזה|this product/i.test(goal) && scopeProductIds.length === 1
      ? { type: "product", ids: scopeProductIds.slice(0, 1) }
      : { type: "store", ids: scopeProductIds.slice() };
  return {
    goal,
    understood,
    note: understood ? null : "לא זוהתה מטרה מוכרת — לונה מציגה את ההזדמנויות הקיימות במקום לנחש",
    outcomes: final,
    desiredOutcome: final.map((id) => OUTCOMES[id].he).join(" + "),
    subject,
    requiredFacts: facts,
    analyzeOnly: final.every((id) => OUTCOMES[id].analyzeOnly),
    capabilityOnly: final.map((id) => OUTCOMES[id].capabilityOnly).filter(Boolean),
    constraints: [
      "רק פעולות לגיטימיות: בלי ספאם, בלי תנועה או מעורבות מזויפות",
      "פרסום חיצוני, הוצאת כסף ושינויי אבטחה — רק באישור מפורש",
      "שום סטטוס חיובי בלי ראיה",
    ],
    permissions: { autonomous: [PERMISSION.SESSION], requiresOwner: [PERMISSION.OWNER, PERMISSION.OWNER_EXPLICIT], requiresAdmin: [PERMISSION.ADMIN] },
    priority: final.includes("repair") ? "high" : "normal",
    deadline,
    evidenceRequirements: ["כל פעולה פנימית מאומתת בקריאה חוזרת מהמאגר", "פרסום חיצוני נחשב רק עם אישור מהספק"],
  };
}

/**
 * Capability resolver + action graph for an intent over real passports.
 * Returns one node per (product, capability) with status:
 *   done | safe | owner | approval | blocked | client
 */
export function buildActionGraph(intent, passports = [], { externalConnected = false, entitlement = null } = {}) {
  const nodes = [];
  const gaps = [];
  const scoped = intent.subject.type === "product" ? passports.filter((p) => intent.subject.ids.includes(p.productId)) : passports;
  const maxRun = entitlement?.capabilities?.maxProductsPerRun;
  const limit = maxRun == null ? Infinity : maxRun;
  scoped.forEach((p, index) => {
    const entitled = index < limit;
    for (const fact of intent.requiredFacts) {
      const met = Boolean(FACTS[fact]?.read(p));
      if (met) {
        nodes.push({ id: `${p.productId}:${fact}`, productId: p.productId, productTitle: p.title, fact, factHe: FACTS[fact].he, capability: null, status: "done", evidence: "המצב הנדרש כבר מתקיים" });
        continue;
      }
      gaps.push({ productId: p.productId, fact });
      const capId = capabilityForFact(fact, p);
      const cap = capId ? CAPABILITIES[capId] : null;
      if (!cap) {
        nodes.push({ id: `${p.productId}:${fact}`, productId: p.productId, productTitle: p.title, fact, factHe: FACTS[fact].he, capability: null, status: "blocked", evidence: "אין יכולת שיכולה לספק את זה כרגע" });
        continue;
      }
      const pre = cap.preconditions(p, { externalConnected });
      const unmet = pre.filter((c) => !c.ok);
      let status;
      if (unmet.length) status = "blocked";
      else if (!entitled && cap.executor === EXECUTOR.INTERNAL) status = "entitlement";
      else if (cap.executor === EXECUTOR.INTERNAL && cap.permission === PERMISSION.SESSION) status = "safe";
      else if (cap.executor === EXECUTOR.CLIENT) status = "client";
      else if (cap.permission === PERMISSION.OWNER) status = "owner";
      else if (cap.permission === PERMISSION.ADMIN) status = "blocked";
      else status = "approval";
      nodes.push({
        id: `${p.productId}:${fact}`,
        productId: p.productId,
        productTitle: p.title,
        fact,
        factHe: FACTS[fact].he,
        capability: capId,
        capabilityHe: cap.he,
        native: cap.native,
        adapter: cap.adapter,
        risk: cap.risk,
        permission: cap.permission,
        status,
        preconditions: pre,
        expected: cap.expected,
        verification: cap.verification,
        rollback: cap.rollback,
        reason: status === "entitlement"
          ? `המסלול הנוכחי מאפשר לונה לפעול על ${maxRun} מוצרים בכל בקשה`
          : unmet.length ? unmet.map((c) => c.he).join(" · ") : cap.reason,
      });
    }
  });
  // LAW 10 — no dead ends: when external distribution is blocked, offer the
  // legitimate native alternative (manual share of the tracked asset).
  for (const n of nodes.filter((x) => (x.fact === "external_channel_connected" || x.fact === "published_external") && x.status !== "done")) {
    const already = nodes.some((x) => x.productId === n.productId && x.capability === "manual_share");
    if (!already) {
      const cap = CAPABILITIES.manual_share;
      nodes.push({
        id: `${n.productId}:shared_manually`, productId: n.productId, productTitle: n.productTitle, fact: "shared_manually", factHe: FACTS.shared_manually.he,
        capability: "manual_share", capabilityHe: cap.he, native: true, adapter: null, risk: cap.risk, permission: cap.permission,
        status: "client", preconditions: [], expected: cap.expected, verification: cap.verification, rollback: null,
        reason: "מסלול חלופי: הערוץ החיצוני חסום, אז השיתוף נעשה ידנית עם לינק מעקב", alternativeFor: n.id,
      });
    }
  }
  for (const capId of intent.capabilityOnly || []) {
    const cap = CAPABILITIES[capId];
    nodes.push({ id: `account:${capId}`, productId: null, productTitle: null, fact: "entitlement_verified", factHe: "מצב מנוי מאומת", capability: capId, capabilityHe: cap.he, native: cap.native, adapter: cap.adapter, risk: cap.risk, permission: cap.permission, status: "client", preconditions: [], expected: cap.expected, verification: cap.verification, rollback: null, reason: cap.reason });
  }
  // Dependency order: data fixes → internal work → sharing → external.
  const ORDER = { fix_product_data: 0, verify_product_seo: 1, create_share_asset: 2, record_passport: 3, create_collection: 4, create_real_video: 5, enable_direct_checkout: 6, manual_share: 7, connect_channel: 8, publish_external: 9, reconcile_subscription: 10, paid_campaign: 11 };
  const edges = [];
  for (const n of nodes) {
    if (n.capability === "publish_external") {
      for (const dep of nodes.filter((x) => x.productId === n.productId && ["connect_channel", "create_share_asset"].includes(x.capability))) {
        edges.push({ from: dep.id, to: n.id, type: "requires" });
      }
    }
    if (n.capability === "create_share_asset") {
      for (const dep of nodes.filter((x) => x.productId === n.productId && x.capability === "fix_product_data")) {
        edges.push({ from: dep.id, to: n.id, type: "improves" });
      }
    }
  }
  nodes.sort((a, b) => (ORDER[a.capability] ?? -1) - (ORDER[b.capability] ?? -1) || String(a.productId).localeCompare(String(b.productId)));
  const count = (st) => nodes.filter((n) => n.status === st).length;
  return {
    nodes,
    edges,
    gaps,
    summary: { done: count("done"), safe: count("safe"), owner: count("owner"), approval: count("approval"), blocked: count("blocked"), client: count("client"), entitlement: count("entitlement") },
    native: nodes.filter((n) => n.capability && n.native).length,
    external: nodes.filter((n) => n.capability && !n.native).length,
  };
}

/** Map the six named Luna commands onto goals — they are compiled, not scripted. */
export const COMMAND_GOALS = Object.freeze({
  increase_exposure: "לונה, תגדילי את החשיפה",
  promote_product: "לונה, קדמי את המוצר הזה וקמפיין",
  organic_discovery: "לונה, הגדילי גילוי אורגני בחיפוש",
  find_opportunities: "לונה, מצאי לי הזדמנויות",
  prepare_distribution: "לונה, הכיני את המוצר להפצה",
  prepare_campaign: "לונה, הכיני קמפיין",
});
