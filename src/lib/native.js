// LikeLink — Creator-as-Channel (native distribution layer) 📱
// =============================================================
// The most innovative distribution channel is the one that needs NO OAuth,
// NO app review, NO tokens and NO secrets: the creator's own phone.
// Every share goes out as a native OS share (WhatsApp/Stories/Status/DM)
// carrying a fully tracked LikeLink URL — attribution survives the trip.
//
// Pure client module. No dependencies. No credentials. No fake success:
// if the platform has no share sheet, canNativeShare() returns false and
// callers fall back to copy-link (existing behavior).

export function canNativeShare() {
  try {
    return typeof navigator !== "undefined" && typeof navigator.share === "function";
  } catch {
    return false;
  }
}

// Tracked product URL — attribution: source=native_share, medium=<how>, campaign=<id?>
export function trackedProductUrl(product, { medium = "share", campaignId = null } = {}) {
  try {
    const base = `${window.location.origin}/p/${encodeURIComponent(product.id)}`;
    const params = new URLSearchParams({
      utm_source: "native_share",
      utm_medium: String(medium).slice(0, 40),
      ...(campaignId ? { utm_campaign: String(campaignId).slice(0, 80) } : {}),
    });
    return `${base}?${params.toString()}`;
  } catch {
    return null;
  }
}

// Native share of a single product (product pages, studio, QR modal fallback).
// Resolves { ok:true, method:'share' | 'clipboard' } — never throws.
export async function shareProduct(product, { medium = "share", campaignId = null } = {}) {
  const url = trackedProductUrl(product, { medium, campaignId });
  if (!url || !product) return { ok: false, reason: "no_url" };
  const title = String(product.title || "LikeLink").slice(0, 80);
  const text = `${title} — ב-LikeLink`;
  try {
    if (canNativeShare()) {
      await navigator.share({ title, text, url });
      return { ok: true, method: "share", url };
    }
    await navigator.clipboard.writeText(url);
    return { ok: true, method: "clipboard", url };
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "share_failed" };
  }
}

// Publish a PREPARED site campaign through the creator's own phone.
// The campaign content (hook) becomes the share text; the tracked URL
// carries the campaignId so analytics can measure THIS campaign.
export async function shareCampaign(campaign, product) {
  if (!campaign || !product) return { ok: false, reason: "missing_data" };
  const url = trackedProductUrl(product, { medium: "campaign", campaignId: campaign.campaignId });
  if (!url) return { ok: false, reason: "no_url" };
  const hook = String(campaign.content?.hook || campaign.content?.cta || product.title || "").slice(0, 140);
  try {
    if (canNativeShare()) {
      await navigator.share({ title: "LikeLink", text: hook, url });
      return { ok: true, method: "share", url };
    }
    await navigator.clipboard.writeText(`${hook} ${url}`);
    return { ok: true, method: "clipboard", url };
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "share_failed" };
  }
}
