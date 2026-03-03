/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 4-level surface hierarchy
        base: "#0a0e14",
        surface: "#0d1117",
        panel: "#151b23",
        raised: "#1c2333",

        // 3-level border hierarchy
        "border-subtle": "#1b2130",
        border: "#252d3a",
        "border-strong": "#3d4757",

        // Desaturated semantic colors
        muted: "#636e7b",
        up: "#2ea043",
        down: "#da3633",
        accent: "#4c8dca",
        warn: "#c79316",

        // Soft tinted backgrounds for badges/states
        "green-soft": "#1a3a2a",
        "red-soft": "#3a1a1a",
        "blue-soft": "#1a2a3a",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
