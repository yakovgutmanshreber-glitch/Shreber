import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Assistant", "Rubik", "system-ui", "sans-serif"],
      },
      colors: {
        // Rich CRM accent — indigo.
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgb(16 24 40/.04), 0 1px 3px rgb(16 24 40/.06)",
        card: "0 1px 2px rgb(16 24 40/.04), 0 4px 12px rgb(16 24 40/.05)",
        lift: "0 10px 30px -8px rgb(16 24 40/.15), 0 4px 10px -4px rgb(16 24 40/.08)",
        glow: "0 6px 16px -4px rgb(79 70 229/.35)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in .15s ease-out",
        "pop-in": "pop-in .18s cubic-bezier(.22,1,.36,1)",
      },
    },
  },
  plugins: [],
};

export default config;
