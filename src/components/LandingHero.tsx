"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { AnimatedWaveform } from "@/components/AnimatedWaveform";

const EASE = [0.22, 1, 0.36, 1] as const;

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE },
  },
};

export function LandingHero() {
  return (
    <section className="px-6 md:px-12 mt-16 md:mt-24">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16 items-center"
      >
        <div className="md:col-span-8 flex flex-col gap-6 md:gap-8">
          <motion.div variants={item} className="smallcaps-mono text-accent">
            CHRP // SYNC INTELLIGENCE
          </motion.div>

          <motion.h1
            variants={item}
            className="font-serif font-black display-tight text-[56px] sm:text-[80px] md:text-[112px] text-balance"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Your music has a signature.
          </motion.h1>

          <motion.p
            variants={item}
            className="font-serif italic text-[20px] md:text-[28px] text-ink-soft max-w-[40ch] leading-[1.35]"
          >
            Here&rsquo;s the page you can hand to a supervisor.
          </motion.p>

          <motion.div
            variants={item}
            className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8 mt-2"
          >
            <Link
              href="/scan"
              className="group inline-flex items-center gap-3 px-6 py-3 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors smallcaps tracking-[0.18em]"
            >
              <span>Score your first track</span>
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
            <div className="smallcaps-mono text-ink-soft max-w-[42ch] leading-relaxed">
              Your first scan is on us. Because we want your music to find its
              place.
            </div>
          </motion.div>
        </div>

        <motion.div variants={item} className="md:col-span-4">
          <AnimatedWaveform />
        </motion.div>
      </motion.div>
    </section>
  );
}
