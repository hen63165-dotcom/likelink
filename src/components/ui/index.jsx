import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 10, x: "-50%" }}
          className="fixed left-1/2 bottom-24 z-[100] px-5 py-2.5 rounded-full text-sm font-medium shadow-elevated tap safe-bottom"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function LoadingScreen() {
  return (
    <div className="w-full h-full min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
        />
        <span className="disp text-sm text-muted">Loading…</span>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center py-16 px-6"
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: "var(--accent-subtle)" }}
      >
        <Icon size={28} style={{ color: "var(--accent)" }} />
      </div>
      <p className="disp text-lg font-semibold">{title}</p>
      <p className="text-sm text-muted mt-2 max-w-[300px] leading-relaxed">{body}</p>
      {action}
    </motion.div>
  );
}

export function StatChip({ icon: Icon, label, value, accent }) {
  return (
    <div className="surface rounded-2xl p-4 flex flex-col gap-2 transition-shadow hover:shadow-card">
      <Icon size={16} style={{ color: accent ? "var(--success)" : "var(--accent)" }} />
      <span className="mono text-base font-semibold leading-none" style={{ color: accent ? "var(--success)" : "var(--text)" }}>
        {value}
      </span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

export function Badge({ children, variant = "default" }) {
  const styles = {
    default: { background: "var(--accent-subtle)", color: "var(--accent)" },
    top: { background: "var(--warning-subtle)", color: "var(--warning)" },
    success: { background: "var(--success-subtle)", color: "var(--success)" },
    danger: { background: "var(--danger-subtle)", color: "var(--danger)" },
  }[variant];

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={styles}
    >
      {children}
    </span>
  );
}

export function IconButton({ onClick, children, label, active, className = "" }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`tap shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${className}`}
      style={{
        background: active ? "var(--accent-subtle)" : "var(--bg-elevated)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "var(--accent)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

export function Button({ children, onClick, variant = "primary", className = "", disabled, type = "button" }) {
  const base = "tap w-full py-3.5 font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50";
  const variants = {
    primary: "btn-primary rounded-xl",
    secondary: "btn-secondary rounded-xl",
    ghost: "bg-transparent text-muted hover:text-ink rounded-xl",
    dark: "rounded-xl text-white",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
      style={variant === "dark" ? { background: "var(--text)" } : undefined}
    >
      {children}
    </button>
  );
}

export function LabeledInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-secondary">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field w-full px-3.5 py-2.5 text-sm"
      />
    </label>
  );
}

export function LabeledTextarea({ label, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-secondary">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="input-field w-full px-3.5 py-2.5 text-sm resize-none"
      />
    </label>
  );
}

export function SheetModal({ onClose, title, children, maxHeight = "88vh" }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "var(--overlay)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0.8 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0.8 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-app rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-elevated"
        style={{ background: "var(--bg-elevated)", maxHeight }}
      >
        {title && (
          <div className="flex items-center justify-between p-5 pb-2 shrink-0">
            <p className="disp text-lg font-semibold">{title}</p>
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}
