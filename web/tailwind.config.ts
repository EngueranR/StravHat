import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        bg: "#f5f6ef",
        panel: "#fdfcf7",
        ink: "#131313",
        muted: "#7a7a72",
        accent: "#0f766e",
      },
      boxShadow: {
        panel: "0 8px 30px rgba(19, 19, 19, 0.08)",
      },
      backgroundImage: {
        grain:
          "radial-gradient(circle at 1px 1px, rgba(19,19,19,0.04) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
} satisfies Config;
