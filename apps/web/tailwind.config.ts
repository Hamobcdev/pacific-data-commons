import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // PDC brand colours (matching SBP documents)
        navy: "#1a3c5e",
        ocean: "#0077b6",
        "light-bg": "#e8f4f8",
        // Session 12 — dark shell palette for the global nav/footer and the
        // Pacific image panels (dashboard, agents, onboarding). Deliberately
        // distinct from `navy` above: `navy` is used as text/accent colour on
        // light backgrounds throughout onboarding, this pair is a near-black
        // navy shell background meant to sit behind full-bleed imagery.
        "pacific-shell": "#0F2A3D",
        "pacific-shell-dark": "#071929",
        "pacific-green": "#1D9E75",
        "pacific-green-dark": "#0F6E56",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
