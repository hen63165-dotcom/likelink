/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg)",
        elevated: "var(--bg-elevated)",
        subtle: "var(--bg-subtle)",
        ink: "var(--text)",
        muted: "var(--text-muted)",
        accent: "var(--accent)",
        border: "var(--border)",
      },
      boxShadow: {
        card: "var(--shadow-md)",
        elevated: "var(--shadow-lg)",
      },
      borderRadius: {
        card: "var(--radius-lg)",
      },
      maxWidth: {
        app: "640px",
        content: "1200px",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
