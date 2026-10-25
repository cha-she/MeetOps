/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
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
          950: "#1e1b4b",
        },
        ink: {
          800: "#141a2e",
          900: "#0f1420",
          950: "#0a0e18",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        soft: "0 4px 16px -4px rgb(15 23 42 / 0.10), 0 2px 6px -2px rgb(15 23 42 / 0.06)",
        lift: "0 12px 32px -8px rgb(79 70 229 / 0.18), 0 6px 12px -6px rgb(15 23 42 / 0.10)",
        glow: "0 0 0 1px rgb(99 102 241 / 0.20), 0 8px 24px -6px rgb(99 102 241 / 0.35)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)",
        "sidebar-gradient":
          "linear-gradient(180deg, #141a2e 0%, #0f1420 60%, #0a0e18 100%)",
        "hero-gradient":
          "linear-gradient(120deg, #4f46e5 0%, #6d28d9 45%, #7c3aed 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};
