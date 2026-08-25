import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send } from "lucide-react";
import { useI18n } from "../lib/LangContext";

/**
 * FloatingAIHelper — persistent floating AI assistant.
 *
 * A round, luxury-themed button fixed to the bottom-right of the viewport.
 * Clicking it expands a compact chat panel for quick AI assistance.
 *
 * Self-contained: all state is local, no external dependencies beyond the
 * shared i18n context and CSS variables. Guarded so it can never break the
 * host app.
 */
export default function FloatingAIHelper() {
  const { lang } = useI18n();
  const he = lang === "he";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  function handleSend() {
    // Stub — no backend wired yet. Clears input for a clean UX.
    if (input.trim()) setInput("");
  }

  return (
    <>
      {/* ── Chat panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-24 right-6 z-[100] w-80 max-w-[calc(100vw-48px)] rounded-2xl shadow-elevated flex flex-col"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-2 p-4 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <Sparkles size={16} style={{ color: "var(--accent)" }} />
              <span className="disp text-sm font-semibold">
                {he ? "עוזר AI" : "AI Assistant"}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="tap ms-auto w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: "var(--bg)",
                  color: "var(--text-muted)",
                }}
                aria-label={he ? "סגור" : "Close"}
              >
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div
              className="flex-1 p-4 overflow-y-auto text-sm"
              style={{ maxHeight: "220px", minWidth: "280px" }}
            >
              <p className="text-muted leading-relaxed">
                {he
                  ? "👋 שלום! אני כאן לעזור. איך אוכל לסייע? אשמח לעזור לך לגלות מוצרים, לנהל את החנות שלך, או לקבל רוח ליצירתיות."
                  : "👋 Hi! I'm your AI assistant. How can I help? I can help you discover products, manage your store, or get creative inspiration."}
              </p>
            </div>

            {/* Input */}
            <div
              className="p-3 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={he ? "שאל אותי משהו..." : "Ask me anything..."}
                  className="flex-1 px-3 py-2 text-sm rounded-xl"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="tap w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: input.trim()
                      ? "var(--accent-subtle)"
                      : "var(--bg-subtle)",
                    color: input.trim()
                      ? "var(--accent)"
                      : "var(--text-faint)",
                  }}
                  aria-label={he ? "שלח" : "Send"}
                >
                  <Send size={14} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating button ── */}
      <motion.button
        onClick={() => setOpen(!open)}
        whileTap={{ scale: 0.9 }}
        className="tap fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-2xl flex items-center justify-center shadow-elevated"
        style={{
          background: "linear-gradient(135deg, var(--accent) 0%, #C9A86C 100%)",
          color: "#fff",
        }}
        aria-label={he ? "עוזר AI" : "AI Assistant"}
      >
        {open ? <X size={20} /> : <Sparkles size={24} />}
      </motion.button>
    </>
  );
}
