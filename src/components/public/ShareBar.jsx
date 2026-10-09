import React, { useState } from "react";
import { Link2, Check, MessageCircle, MoreHorizontal, Send, Twitter, Facebook, Mail } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { SHARE_ORDER, buildShareLink, shareTargetKey, publicUrl, withAttribution, utmFor } from "../../lib/acquisition.js";
import { trackAcquisition, trackSiteEvent } from "../../lib/acquisitionTrack.js";

const ICONS = {
  whatsapp: MessageCircle,
  telegram: Send,
  x: Twitter,
  facebook: Facebook,
  email: Mail,
};

const NAMES = {
  whatsapp: ["וואטסאפ", "WhatsApp"],
  telegram: ["טלגרם", "Telegram"],
  x: ["X", "X"],
  facebook: ["פייסבוק", "Facebook"],
  email: ["מייל", "Email"],
};

/**
 * ShareBar — the real share loop for every public LikeLink asset.
 * Uses the Web Share API when the browser supports it, plus explicit network
 * links. `share_completed` is recorded ONLY when navigator.share() actually
 * resolves; opening an external network tab is reported as `share_started`
 * (the browser cannot verify delivery there — we never claim it did).
 */
export default function ShareBar({ path, title, text, productId, marketerId, storyId, compact = false }) {
  const { lang } = useI18n();
  const L = (he, en) => (lang === "he" ? he : en);
  const [copied, setCopied] = useState(false);
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const attributedUrl = (target) =>
    withAttribution(publicUrl(path), {
      ...utmFor({ source: target || "share", medium: "social", campaign: "share_loop" }),
      ...(marketerId ? { ref: marketerId } : {}),
      ...(storyId ? { story_id: storyId } : {}),
    });

  const baseMeta = { page: path, productId, marketerId, storyId };

  async function handleNative() {
    trackSiteEvent("share_started", { ...baseMeta, target: "native" });
    try {
      await navigator.share({ title: title || document.title, text: text || "", url: attributedUrl("native") });
      // Resolved == the user actually completed a share sheet action.
      trackSiteEvent("share_completed", { ...baseMeta, target: "native" });
    } catch {
      // User cancelled or the sheet failed — nothing to report.
    }
  }

  function handleTarget(target) {
    const href = buildShareLink(target, attributedUrl(target), text || title || "");
    if (!href) return;
    trackSiteEvent("share_started", { ...baseMeta, target });
    trackAcquisition("share_target", `שיתפת תוכן ב-${target}`, { ...baseMeta, target });
    window.open(href, "_blank", "noopener,noreferrer");
  }

  async function handleCopy() {
    const url = attributedUrl("copy");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      trackSiteEvent("share_completed", { ...baseMeta, target: "copy" });
      trackAcquisition("share_copy", "העתקת קישור שיתוף", baseMeta);
    } catch {
      // Clipboard unavailable — the user can still copy manually.
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "mt-1"}`} data-testid="share-bar">
      {SHARE_ORDER.map((target) => {
        const Icon = ICONS[target];
        return (
          <button
            key={target}
            type="button"
            onClick={() => handleTarget(target)}
            aria-label={L(`שיתוף ב${NAMES[target]?.[0] || target}`, `Share on ${NAMES[target]?.[1] || target}`)}
            className="tap flex items-center justify-center rounded-full p-2"
            style={{ background: "var(--bg-subtle)", color: "var(--text)" }}
          >
            <Icon size={14} />
          </button>
        );
      })}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={L("העתקת קישור", "Copy link")}
        className="tap flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold"
        style={{ background: "var(--bg-subtle)", color: "var(--text)" }}
      >
        {copied ? <Check size={14} /> : <Link2 size={14} />}
        {copied ? L("הועתק", "Copied") : L("העתקה", "Copy")}
      </button>
      {/* The device's own dialog (on Windows: Microsoft's) is an extra, never the first choice. */}
      {canNative && (
        <button
          type="button"
          onClick={handleNative}
          className="tap flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold"
          style={{ background: "var(--bg-subtle)", color: "var(--text)" }}
        >
          <MoreHorizontal size={14} /> {L("עוד אפליקציות", "More apps")}
        </button>
      )}
    </div>
  );
}
