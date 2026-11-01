/** @type {import('tailwindcss').Config} */

// Semantic colour tokens (canvas, surface, line, fg, muted ...) are CSS variables
// defined in src/index.css for the light and the dark theme, so every component
// switches theme without per-class dark: variants.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        subtle: token("subtle"),
        hover: token("hover"),
        line: token("line"),
        "line-strong": token("line-strong"),
        fg: token("fg"),
        muted: token("muted"),
        faint: token("faint"),
        accent: {
          DEFAULT: token("accent"),
          fg: token("accent-fg"),
          soft: token("accent-soft"),
          text: token("accent-text"),
        },
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        pop: "0 10px 38px -10px rgb(22 23 24 / 0.35), 0 10px 20px -15px rgb(22 23 24 / 0.2)",
        focus: "0 0 0 3px rgb(var(--accent) / 0.25)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(4px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        "slide-in": { from: { opacity: "0", transform: "translateX(12px)" }, to: { opacity: "1", transform: "none" } },
        pulse: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.45" } },
        flash: { "0%, 40%": { boxShadow: "0 0 0 3px rgb(var(--accent) / 0.55)" }, "100%": { boxShadow: "0 0 0 1px rgb(var(--accent) / 0.3)" } },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out both",
        "pop-in": "pop-in 0.16s ease-out both",
        "slide-in": "slide-in 0.2s ease-out both",
        pulse: "pulse 1.6s ease-in-out infinite",
        flash: "flash 1.4s ease-out both",
      },
    },
  },
  plugins: [],
};
