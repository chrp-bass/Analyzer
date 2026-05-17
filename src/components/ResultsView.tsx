"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Track, FINGERPRINT_ORDER } from "@/lib/fixtures/tracks";
import { ModeChip, PullQuote, Rule, SectionHead } from "@/components/primitives";
import { PaymentDialog } from "@/components/PaymentDialog";
import { Play, Copy, Check, ArrowDown } from "lucide-react";

export function ResultsView({ track }: { track: Track }) {
  const [now] = useState(() => formatTimestamp(new Date()));

  return (
    <article className="px-6 md:px-10 py-12 md:py-20 max-w-[760px] mx-auto w-full">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="smallcaps-mono text-accent mb-6">
          SYNC INTELLIGENCE REPORT
        </div>

        <h1
          className="font-serif font-black display-tight text-[56px] sm:text-[80px] md:text-[104px] text-balance"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          {track.title}
        </h1>
        <p className="font-serif italic text-[20px] md:text-[26px] text-ink-soft mt-3">
          by {track.artist}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <ModeChip mode={track.mode} />
          <span className="smallcaps-mono text-ink-soft">
            SCANNED {now}
          </span>
        </div>
      </motion.section>

      <SectionSpacer />

      <SignatureSection text={track.signature} />

      <SectionSpacer />

      <FingerprintSection track={track} />

      <SectionSpacer />

      <BuiltForSection track={track} />

      <SectionSpacer />

      <PitchLineSection pitchLine={track.pitchLine} />

      <SectionSpacer />

      <ComparableSection comparable={track.comparable} />

      <SectionSpacer />

      <DrRhodesSection text={track.drRhodes} />

      <SectionSpacer />

      <BrandMatchesSection matches={track.brandMatches} />

      <SectionSpacer />

      <Cta track={track} />

      <footer className="mt-24 pt-8 border-t border-rule flex flex-col md:flex-row justify-between gap-3 smallcaps-mono text-ink-soft">
        <div>CHRP // 2026 // scan.chrp.ai</div>
        <div>
          REPORT ID //{" "}
          <span className="text-ink">
            CHRP-{track.id.toUpperCase().slice(0, 4)}-2026
          </span>
        </div>
      </footer>
    </article>
  );
}

function SectionSpacer() {
  return <div className="h-16 md:h-24" />;
}

function SignatureSection({ text }: { text: string }) {
  return (
    <section>
      <SectionHead label="THE SIGNATURE" />
      <PullQuote size="lg">&ldquo;{text}&rdquo;</PullQuote>
    </section>
  );
}

function FingerprintSection({ track }: { track: Track }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <section ref={ref}>
      <SectionHead label="THE FINGERPRINT" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
        {FINGERPRINT_ORDER.map(({ key, label }, i) => {
          const v = track.fingerprint[key];
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="smallcaps text-ink">{label}</span>
                <span className="font-mono text-[18px] md:text-[20px] font-semibold tabular-nums text-ink">
                  {v}
                </span>
              </div>
              <div className="h-[2px] w-full bg-rule/40 overflow-hidden">
                <motion.div
                  className="h-full bg-ink"
                  initial={{ width: 0 }}
                  animate={inView ? { width: `${v}%` } : { width: 0 }}
                  transition={{
                    duration: 0.9,
                    delay: 0.05 * i,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BuiltForSection({ track }: { track: Track }) {
  return (
    <section>
      <SectionHead label="WHAT IT'S BUILT FOR" />
      <div className="flex flex-col gap-8">
        {track.builtFor.map((b, i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr] gap-x-6 md:gap-x-10 items-baseline"
          >
            <div className="font-mono text-[13px] text-ink-soft pt-2">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div>
              <h4 className="font-serif text-[22px] md:text-[26px] font-semibold leading-tight">
                {b.title}
              </h4>
              <p className="mt-2 text-ink-soft leading-relaxed max-w-[58ch]">
                {b.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PitchLineSection({ pitchLine }: { pitchLine: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard?.writeText(pitchLine);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section>
      <SectionHead label="THE PITCH LINE" />
      <div className="relative">
        <span
          aria-hidden
          className="absolute -left-2 md:-left-8 -top-6 md:-top-10 font-serif text-[80px] md:text-[140px] text-accent/30 leading-none select-none"
        >
          &ldquo;
        </span>
        <PullQuote size="xl">{pitchLine}</PullQuote>
      </div>
      <button
        onClick={onCopy}
        className="mt-6 inline-flex items-center gap-2 smallcaps text-ink-soft hover:text-accent transition-colors"
      >
        {copied ? (
          <>
            <Check size={14} /> Copied
          </>
        ) : (
          <>
            <Copy size={14} /> Copy to clipboard
          </>
        )}
      </button>
    </section>
  );
}

function ComparableSection({ comparable }: { comparable: string }) {
  return (
    <section>
      <SectionHead label="THE COMPARABLE" />
      <p className="font-serif text-[20px] md:text-[24px] leading-[1.45] font-medium">
        {comparable}
      </p>
    </section>
  );
}

function DrRhodesSection({ text }: { text: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <section>
      <SectionHead label="DR. RHODES — CHIEF SCIENTIST OF EMOTIONAL FREQUENCY" />
      <p className="font-serif text-[19px] md:text-[22px] leading-[1.55] text-ink max-w-[62ch]">
        {text}
      </p>
      <button
        onClick={() => setPlaying((p) => !p)}
        className="mt-6 inline-flex items-center gap-2 smallcaps text-ink-soft hover:text-accent transition-colors"
      >
        <Play size={14} />
        {playing ? "Playing voice memo…" : "Play audio"}
      </button>
    </section>
  );
}

function BrandMatchesSection({ matches }: { matches: string[] }) {
  return (
    <section>
      <SectionHead label="BRAND ALIGNMENT" />
      <div className="flex flex-wrap items-baseline gap-x-10 md:gap-x-16 gap-y-4">
        {matches.map((m) => (
          <div
            key={m}
            className="font-serif text-[28px] md:text-[36px] font-medium tracking-tight"
          >
            {m}
          </div>
        ))}
      </div>
    </section>
  );
}

function Cta({ track }: { track: Track }) {
  return (
    <section>
      <Rule />
      <Link
        href={`/scan/report/${track.id}`}
        className="group mt-8 flex items-center justify-between gap-6 px-6 py-6 md:py-8 border border-ink text-ink bg-ink text-paper hover:bg-paper hover:text-ink transition-colors"
      >
        <span className="font-serif text-[22px] md:text-[28px] font-medium">
          Download your one-page report
        </span>
        <span className="smallcaps-mono flex items-center gap-2">
          PDF <ArrowDown size={16} />
        </span>
      </Link>

      <div className="mt-8 flex flex-col md:flex-row md:items-baseline justify-between gap-4">
        <PaymentDialog
          trigger={
            <button className="smallcaps text-ink hover:text-accent transition-colors">
              Score another track — $29
            </button>
          }
          label="Single track scan"
          price="$29"
          body="Drop in another song and we'll send back a one-page report you can hand to a supervisor or paste into a pitch email."
        />

        <PaymentDialog
          trigger={
            <button className="smallcaps-mono text-ink-soft hover:text-accent transition-colors underline underline-offset-4 decoration-rule">
              Annual unlimited — $99
            </button>
          }
          label="Annual unlimited"
          price="$99 / yr"
          body="Score your entire catalog. Re-score after remasters. Built for working artists who pitch a lot."
        />
      </div>
    </section>
  );
}

function formatTimestamp(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} // ${h}:${min}`;
}
