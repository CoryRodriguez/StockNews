/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0d1117",
        panel: "#161b22",
        border: "#21262d",
        muted: "#8b949e",
        up: "#3fb950",
        down: "#f85149",
        accent: "#58a6ff",
        warn: "#d29922",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
