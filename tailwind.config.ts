import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFAF9",
        ink: "#1B1F1D",
        line: "#E3E1E3",
        muted: "#8A8288",
        // Brand 1 - purple/magenta - PRIMARY brand color (active nav/tabs,
        // current-year emphasis in charts, primary UI accents)
        brand1: {
          DEFAULT: "#78227b",
          pastel: "#fef0ff",
          dark: "#4a084d"
        },
        // Brand 2 - teal/cyan - SECONDARY brand color (hover/secondary
        // accents, prior-year comparison lines)
        brand2: {
          DEFAULT: "#30c2c9",
          pastel: "#dcfbfc",
          dark: "#076d73"
        },
        // Accent - neutral grey - muted/tertiary UI, oldest-year lines
        accent: {
          DEFAULT: "#8b818b",
          pastel: "#f1f1f1",
          dark: "#504150"
        },
        // Semantic status colors - deliberately NOT brand colors, so
        // "on track" / "behind" / positive / negative deltas always read
        // as green/red regardless of brand palette changes.
        success: {
          DEFAULT: "#15803D",
          pastel: "#DCFCE7"
        },
        danger: {
          DEFAULT: "#B91C1C",
          pastel: "#FEE2E2"
        }
      },
      fontFamily: {
        head: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"]
      }
    }
  },
  plugins: []
};
export default config;
