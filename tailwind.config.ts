import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "chrp-white": "var(--chrp-white)",
        "chrp-black": "var(--chrp-black)",
        "chrp-yellow": "var(--chrp-yellow)",
        magenta: "var(--magenta)",
        "french-blue": "var(--french-blue)",
        "kelly-green": "var(--kelly-green)",
        cinnamon: "var(--cinnamon)",
        plum: "var(--plum)",
        pistachio: "var(--pistachio)",
        oat: "var(--oat)",
        "ink-soft": "var(--ink-soft)",
        "ink-light": "var(--ink-light)",
        rule: "var(--rule)",
        "bar-bg": "var(--bar-bg)",
      },
      fontFamily: {
        // Site-wide default: Playfair Display / DM Sans (mychrp.ai identity).
        // Inside the V8 report, .chrp-report scope-overrides these back to
        // Cormorant / Lato in globals.css.
        display: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        cormorant: ["var(--font-cormorant)", "Georgia", "serif"],
        lato: ["var(--font-lato)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
