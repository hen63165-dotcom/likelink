/**
 * ShareQR — QR-code sharing modal for Likelink 🖼️
 *
 * Generates a real QR code from a shareable URL entirely in the browser
 * (via the `qrcode` npm package — no external API, no server cost,
 * no secrets exposed to the client). The user can:
 *   • Preview the QR code at 256×256
 *   • Download it as a PNG
 *   • Share via the native share sheet (fallback to clipboard)
 *
 * Styled to match the app's dark-luxury / gold-accent design system.
 */
import { useState, useEffect } from "react";
import { X, Download, Share2, Loader2 } from "lucide-react";
import QRCode from "qrcode";

export default function ShareQR({ url, title, marketerName, showToast, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!url) {
      setError("אין קישור לשיתוף");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");

    // Generate PNG data-URI from the share URL.
    // Options match the mobile-friendly 9:16 scan ratio.
    QRCode.toDataURL(url, {
      width: 256,
      margin: 2,
      color: {
        dark: "#14121f",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.message || "שגיאה ביצירת קוד QR");
        setLoading(false);
      });
  }, [url]);

  async function handleDownload() {
    if (!qrDataUrl) return;
    try {
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = `likelink-qr-${Date.now()}.png`;
      a.click();
      showToast?.("הקוד QR התוודר בהצלחה 🔽");
    } catch {
      showToast?.("לא הצלחנו להוריד — נסי שוב");
    }
  }

  async function handleShare() {
    const text = title || marketerName || "מוצר מעוניין מלייקלינק";
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch { /* fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast?.("הקישור הועתק 📋");
    } catch {
      showToast?.("העתקי קישור ידנית");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 text-center"
        style={{
          background: "var(--bg, #ffffff)",
          border: "1px solid var(--border, #ECEAF3)",
          width: "100%",
          maxWidth: "340px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm" style={{ color: "var(--text, #14121F)" }}>
            {title || "שיתוף קוד QR"}
          </h3>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.04)" }}
          >
            <X size={13} />
          </button>
        </div>

        {/* QR code display */}
        <div className="flex items-center justify-center mb-4">
          {loading ? (
            <div className="w-48 h-48 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent, #6C4CF1)" }} />
            </div>
          ) : error ? (
            <div className="w-48 h-48 flex items-center justify-center">
              <p className="text-[11px]" style={{ color: "var(--danger, #E1483B)" }}>{error}</p>
            </div>
          ) : (
            <img
              src={qrDataUrl}
              alt="QR Code"
              className="w-48 h-48 rounded-xl object-contain"
              style={{ border: "1px solid var(--border, #ECEAF3)" }}
            />
          )}
        </div>

        {/* URL */}
        {url && (
          <p className="text-[10px] text-muted mb-3 truncate">
            {url.replace(/^https?:\/\//, "")}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={!qrDataUrl || loading}
            className="tap flex-1 rounded-xl py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5"
            style={{
              background: "var(--accent-subtle, rgba(108, 76, 241, 0.08))",
              color: "var(--accent, #6C4CF1)",
            }}
          >
            <Download size={13} /> הורדה
          </button>
          <button
            onClick={handleShare}
            disabled={loading}
            className="tap flex-1 rounded-xl py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5"
            style={{
              background: "var(--text, #14121F)",
              color: "#fff",
            }}
          >
            <Share2 size={13} /> שתף
          </button>
        </div>
      </div>
    </div>
  );
}
