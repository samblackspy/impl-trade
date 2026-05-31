import type { Config } from "tailwindcss";

export default {
  // `relative: true` resolves these globs against THIS config file's directory instead of
  // the process CWD — so `next dev/build app/web` works when launched from the repo root
  // (localnet.sh, CI), not only from inside app/web. Without it Tailwind scans nothing and
  // emits zero utility classes (theme tokens still apply → an unstyled, stacked layout).
  content: {
    relative: true,
    files: [
      "./app/**/*.{ts,tsx}",
      "./components/**/*.{ts,tsx}",
      "./lib/**/*.{ts,tsx}",
    ],
  },
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        long: "var(--long)",
        short: "var(--short)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
