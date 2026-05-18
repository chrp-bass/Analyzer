"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

const sampleScores = [
  { name: "Focus", score: 79 },
  { name: "Balance", score: 71 },
  { name: "Motivation", score: 88 },
  { name: "Calm", score: 42 },
];

export function LandingHero() {
  return (
    <section className="px-6 md:px-12 mt-12 md:mt-20">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16 items-center"
      >
        <div className="md:col-span-8 flex flex-col gap-6 md:gap-8">
          <motion.div
            variants={item}
            className="font-sans font-bold text-[11px] tracking-wider uppercase text-ink-soft"
          >
            CHRP &nbsp;//&nbsp; Emotional Intelligence
          </motion.div>

          <motion.h1
            variants={item}
            className="font-display font-bold display-tight text-[52px] sm:text-[78px] md:text-[104px] text-balance"
          >
            Your music has a signature.
          </motion.h1>

          <motion.p
            variants={item}
            className="font-display italic text-[20px] md:text-[28px] text-ink-soft max-w-[44ch] leading-[1.35]"
          >
            A briefing memo for the room that books your music — not a
            dashboard. Verdict by line three.
          </motion.p>

          <motion.div
            variants={item}
            className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8 mt-2"
          >
            <Link
              href="/scan"
              className="group inline-flex items-center gap-3 px-6 py-3 bg-chrp-black text-chrp-white hover:bg-magenta transition-colors font-sans font-bold text-[12px] tracking-wider uppercase"
            >
              <span>Score your first track</span>
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
            <div className="font-sans text-[12px] text-ink-soft max-w-[44ch] leading-relaxed">
              Your first scan is on us. Because we want your music to find its
              place.
            </div>
          </motion.div>
        </div>

        <motion.div
          variants={item}
          className="md:col-span-4 flex flex-col items-center"
        >
          <SignaturePreview />
        </motion.div>
      </motion.div>
    </section>
  );
}

function SignaturePreview() {
  const k = 0.9;
  const points = `0,${-sampleScores[0].score * k} ${
    sampleScores[1].score * k
  },0 0,${sampleScores[2].score * k} ${-sampleScores[3].score * k},0`;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="-128 -120 256 240" width="220" height="220" className="block">
        <circle cx="0" cy="0" r="25" fill="none" stroke="rgba(15,14,14,0.18)" strokeWidth="0.4" />
        <circle cx="0" cy="0" r="50" fill="none" stroke="rgba(15,14,14,0.18)" strokeWidth="0.4" />
        <circle cx="0" cy="0" r="75" fill="none" stroke="rgba(15,14,14,0.18)" strokeWidth="0.4" />
        <circle cx="0" cy="0" r="90" fill="none" stroke="rgba(15,14,14,0.3)" strokeWidth="0.7" />
        <line x1="0" y1="-90" x2="0" y2="90" stroke="rgba(15,14,14,0.1)" strokeWidth="0.4" />
        <line x1="-90" y1="0" x2="90" y2="0" stroke="rgba(15,14,14,0.1)" strokeWidth="0.4" />
        <motion.polygon
          points={points}
          fill="rgba(230,215,79,0.55)"
          stroke="var(--chrp-black)"
          strokeWidth="1.2"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.4, ease: EASE }}
          style={{ transformOrigin: "center" }}
        />
        <circle cx="0" cy={-sampleScores[0].score * k} r="2.6" fill="var(--chrp-black)" />
        <circle cx={sampleScores[1].score * k} cy="0" r="2.6" fill="var(--chrp-black)" />
        <circle cx="0" cy={sampleScores[2].score * k} r="2.6" fill="var(--chrp-black)" />
        <circle cx={-sampleScores[3].score * k} cy="0" r="2.6" fill="var(--chrp-black)" />
        <text x="0" y="-100" textAnchor="middle" fontFamily="var(--font-lato), sans-serif" fontSize="8" fontWeight={700} fill="var(--ink-soft)">Focus</text>
        <text x="104" y="3" textAnchor="start" fontFamily="var(--font-lato), sans-serif" fontSize="8" fontWeight={700} fill="var(--ink-soft)">Balance</text>
        <text x="0" y="110" textAnchor="middle" fontFamily="var(--font-lato), sans-serif" fontSize="8" fontWeight={700} fill="var(--ink-soft)">Motivation</text>
        <text x="-104" y="3" textAnchor="end" fontFamily="var(--font-lato), sans-serif" fontSize="8" fontWeight={700} fill="var(--ink-soft)">Calm</text>
        <text x="0" y="-4" textAnchor="middle" fontFamily="var(--font-lato), sans-serif" fontSize="6" fontWeight={700} fill="var(--ink-soft)" letterSpacing="0.5">EPI SCORE</text>
        <text x="0" y="28" textAnchor="middle" fontFamily="var(--font-cormorant), Georgia, serif" fontSize="42" fontWeight={700} fill="var(--chrp-black)">84</text>
      </svg>
      <div className="mt-3 px-3 py-1.5 bg-chrp-yellow text-chrp-black font-sans font-bold text-[12px]">
        Ready mode
      </div>
      <div className="mt-2 font-sans text-[11px] text-ink-soft text-center">
        <span className="font-bold text-kelly-green">Top 12%</span> of catalog
        in Ready mode
      </div>
    </div>
  );
}
