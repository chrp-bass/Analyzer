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
        // Site-wide default: Tiempos Fine for display, Lato for sans. The V8
        // report scope (.chrp-report in globals.css) re-binds font-display
        // back to Cormorant so the report stays editorial.
        display: ["var(--font-tiempos)", "Georgia", "Times New Roman", "serif"],
        sans: ["var(--font-lato)", "system-ui", "sans-serif"],
        cormorant: ["var(--font-cormorant)", "Georgia", "serif"],
        tiempos: ["var(--font-tiempos)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
