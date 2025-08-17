export const tailwind = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "brand-dark": "#0f172a", // slate‑900
        "brand-dark-light": "#1e293b", // slate‑800
        "brand-dark-lighter": "#334155", // slate‑700
        "brand-light": "#f9fafb", // gray‑50
        "brand-background": "#ffffff", // auto for inputs
        "brand-light-dark": "#f1f5f9", // slate‑100
        "brand-blue": "#2563eb", // blue‑600
        "brand-blue-light": "#3b82f6", // blue‑500
        "brand-red": "#ef4444", // red‑500
        "brand-text-dark": "#e2e8f0", // slate‑200
        "brand-text-light": "#334155", // slate‑700
        "brand-border": "#94a3b8", // slate‑400
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg,var(--tw-gradient-from),var(--tw-gradient-to))",
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out both",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: 0, transform: "translateY(4px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
