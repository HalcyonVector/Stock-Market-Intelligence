import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark-first, red/black gradient identity (see docs/DESIGN_SYSTEM.md)
        base: { 950: "#0a0506", 900: "#120709", 800: "#1a0b0e", 700: "#241015" },
        crimson: { 300: "#ff6b81", 400: "#ff3b5c", 500: "#e11d3a", 600: "#b01228", 700: "#7d0d1d" },
        ember: { 400: "#ff7849", 500: "#f5512e" },
        ink: { 100: "#f5eef0", 300: "#c9b8bd", 500: "#8a7479", 700: "#4a3b3f" },
      },
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace"],
      },
      backgroundImage: {
        "radial-ember": "radial-gradient(120% 120% at 0% 0%, #2a0d12 0%, #120709 45%, #0a0506 100%)",
        "crimson-grad": "linear-gradient(135deg, #e11d3a 0%, #7d0d1d 100%)",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
        glow: "0 0 24px rgba(225,29,58,0.35)",
      },
      keyframes: {
        pulseGlow: { "0%,100%": { opacity: "0.6" }, "50%": { opacity: "1" } },
      },
      animation: { pulseGlow: "pulseGlow 2s ease-in-out infinite" },
    },
  },
  plugins: [],
};
export default config;
