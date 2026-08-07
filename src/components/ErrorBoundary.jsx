import React from "react";

/**
 * Likelink ErrorBoundary — a professional safety net.
 *
 * If any child throws during render, we show a calm, on-brand recovery screen
 * instead of a blank white page. The message respects the user's current
 * language (he/en) and offers a one-tap refresh.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Likelink error boundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      const en = typeof document !== "undefined" && document.documentElement.lang === "en";
      const title = en ? "Something went wrong" : "משהו השתבש";
      const body = en
        ? "Something went wrong on this page. Please refresh or try again in a moment."
        : "משהו השתבש בדף הזה. אפשר לרענן או לנסות שוב בעוד רגע.";
      const cta = en ? "Refresh" : "רענון";
      const dir = en ? "ltr" : "rtl";
      return (
        <div
          dir={dir}
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
            color: "var(--text)",
            padding: 24,
            fontFamily: "var(--font-sans)",
          }}
        >
          <div style={{ maxWidth: 360, textAlign: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                margin: "0 auto 18px",
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                background: "var(--accent-subtle)",
              }}
            >
              😅
            </div>
            <p style={{ fontWeight: 700, fontSize: 18, margin: "0 0 6px" }}>{title}</p>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)", margin: "0 0 18px" }}>{body}</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "var(--text)",
                color: "var(--bg)",
                border: "none",
                borderRadius: 12,
                padding: "12px 22px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {cta}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
