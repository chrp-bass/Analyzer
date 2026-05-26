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
        display: ["var(--font-cormorant)", "Georgia", "serif"],
        sans: ["var(--font-lato)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
