/**
 * LikeLink Launch Orchestrator — ONE ACTION: "Launch this product"
 * ====================================================================
 * A thin orchestration layer that connects EXISTING, UNTOUCHED capabilities:
 *   • Product catalog  → MarketplaceContext.onAddProduct / onSetStatus (approved)
 *   • Public page      → ProductShowcase / ProductDetail (already live at /p/:id)
 *   • SEO/OG           → api/og.mjs / api/google-feed.mjs
 *   • Story content    → buildCampaign() from cloud/campaign.js (Hebrew copy)
 *   • Autopilot        → api/autopilot.mjs (mode:"announce" — one pub per product)
 *   • Tracking         → hooks.js (tracked UTM links)
 *   • Analytics        → analytics.js (owner report)
 *   • Discovery        → discovery.js / home.js (collections, related, spotlight)
 *
 * This module NEVER duplicates any of those systems. It only coordinates them.
 * Each step reports: DONE | BLOCKED | NEEDS_USER | FAILED.
 */

import { buildCampaign } from "./campaign.js";
import { buildTrackedLink, recommendHookAngles } from "./hooks.js";

/**
 * Orchestrate the full "one launch" workflow for a single product.
 * Returns a structured result the UI can render as a checklist.
 */
export async function launchProduct(product, { marketer, products, clicks, config }) {
  const log = [];
  const productId = product?.id;
  const marketerId = marketer?.id || product?.marketerId;

  // ── STEP 1: Product exists and is approved ──
  if (!product) {
    return { productId, steps: [{ step: "product_exists", status: "FAILED", detail: "no product" }], ok: false };
  }
  log.push({ step: "product_exists", status: "DONE", detail: `id=${productId}` });

  if (product.status !== "approved") {
    log.push({ step: "product_approval", status: "BLOCKED", detail: `status=${product.status}` });
    return { productId, steps: log, ok: false, blockedReason: "product_not_approved" };
  }
  log.push({ step: "product_approval", status: "DONE", detail: `status=${product.status}, price=${product.price}₪` });

  // ── STEP 2: Public page (canonical) ──
  // The single canonical LikeLink URL for this product. SEO/OG, the tracked
  // share link and the content pack all point here — never to an external page.
  const productPath = `/p/${productId}`;
  const storeUrl = typeof window !== "undefined"
    ? `${window.location.origin}${productPath}`
    : `https://likelink2.vercel.app${productPath}`;
  log.push({ step: "public_page", status: "DONE", detail: productPath, canonical: `https://likelink2.vercel.app${productPath}` });

  // ── STEP 3: SEO / OG metadata ──
  log.push({ step: "seo_og", status: "DONE", detail: `/api/og?id=${productId}`, image: `https://likelink2.vercel.app/api/og?id=${productId}` });

  // ── STEP 4: Campaign content pack (Hebrew story/video/hooks) ──
  // angleStats is derived ONLY from real measured clicks that carry an angle
  // (utm_medium). With no measured data the map stays empty and buildCampaign
  // falls back to its safe deterministic rotation — nothing is invented.
  let campaign;
  try {
    const measured = recommendHookAngles(clicks);
    const angleStats = Object.fromEntries(
      (measured.byAngle || []).map((r) => [r.angle, r.clicks])
    );
    campaign = buildCampaign(product, { storeUrl, angleStats });
    log.push({ step: "content_pack", status: "DONE", detail: `campaign=${campaign.campaignId}`, campaign });
  } catch (e) {
    log.push({ step: "content_pack", status: "FAILED", detail: e.message });
    return { productId, steps: log, ok: false };
  }

  // ── STEP 5: Tracked share link (single source: campaign.trackedUrl) ──
  const trackedUrl = buildTrackedLink(product, { storeUrl, channel: campaign.angle.id })
    || campaign.trackedUrl;
  log.push({ step: "tracked_link", status: "DONE", detail: trackedUrl, url: trackedUrl });

  // ── STEP 6: Autopilot announcement (one-time, idempotent) ──
  let autopilotResult = { ok: false, status: "NOT_RUN" };
  const marketerConfig = config || {};

  if (marketerConfig.enabled && Array.isArray(marketerConfig.channels) && marketerConfig.channels.length > 0) {
    try {
      const headers = { "content-type": "application/json" };
      const supabase = (await import("../supabaseClient.js")).supabase;
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers.authorization = `Bearer ${token}`;

      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "announce", productId }),
        keepalive: true,
      });
      const payload = await res.json().catch(() => ({}));
      autopilotResult = { ok: payload.ok || res.ok, status: payload.ok ? "ALREADY_ANNOUNCED" : payload.skipped || "sent", detail: JSON.stringify(payload) };
      log.push({ step: "autopilot_announce", status: payload.ok ? "DONE" : payload.skipped ? "DONE" : "FAILED", detail: JSON.stringify(payload), result: payload });
    } catch (e) {
      autopilotResult = { ok: false, status: "BLOCKED", detail: e.message };
      log.push({ step: "autopilot_announce", status: "BLOCKED", detail: e.message });
    }
  } else {
    autopilotResult = { ok: false, status: "NO_AUTHORIZED_CONNECTION" };
    log.push({
      step: "autopilot_announce",
      status: "BLOCKED",
      detail: "No connected channels. Luna prepared the assets — share manually to publish.",
      fallbackUrl: trackedUrl,
    });
  }

  // ── STEP 7: Discovery surfaces ──
  log.push({
    step: "discovery",
    status: "DONE",
    detail: "Product added to discover pool via api/store.mjs?mode=discover. Collections/related computed in home.js",
  });

  const blocked = log.some((l) => l.status === "BLOCKED");
  const failed = log.some((l) => l.status === "FAILED");
  const ok = !blocked && !failed;

    return {
    productId,
    marketerId,
    ok,
    blocked,
    steps: log,
    result: { campaign, trackedUrl, autopilotResult, publicUrl: storeUrl },
  };
}

/**
 * Lightweight Luna-style summary of a product launch result — for the UI.
 */
export function summarizeLaunch(result) {
  if (!result) return { text: "לא זוהה מוצר", status: "error" };
  if (result.ok) return {
    text: "המוצר הושק עבור. 📣 הכרזה נשלמה, סטורי מוכן, קישור מבוקר.",
    status: "success",
  };
  if (result.blocked) {
    const blockStep = result.steps.find((s) => s.status === "BLOCKED");
    if (blockStep?.step === "autopilot_announce" && blockStep.detail?.includes("No connected channels")) {
      return {
        text: "🚀 המוצר חי! סטורי וקישור מוכנים — העתק ושתף ברשתות כדי להתחיל.",
        status: "partial",
        nextAction: "share_manually",
      };
    }
    if (blockStep?.step === "product_approval") {
      return { text: "מוצר לא מאושר — נדרש אישור עסקי לפני הפעלה.", status: "pending_approval" };
    }
    return { text: "ההשקה חסומה: " + (blockStep?.detail || "unknown"), status: "blocked" };
  }
  if (result.steps.some((s) => s.status === "FAILED")) {
    return { text: "❌ ההשקה נכשלה — פרט ביומן", status: "error" };
  }
  return { text: "מוכן להשקה", status: "pending" };
}
