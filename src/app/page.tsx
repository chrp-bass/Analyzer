import Link from "next/link";
import { LandingHero } from "@/components/LandingHero";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 pt-6 md:pt-8 flex items-center justify-between">
        <div className="font-sans font-black text-[16px] tracking-wider">
          CHRP
        </div>
        <nav className="flex items-center gap-6 md:gap-8 font-sans text-[12px] text-ink-soft">
          <Link href="/methodology" className="hover:text-chrp-black transition-colors">
            Methodology
          </Link>
          <Link
            href="/scan"
            className="font-bold uppercase tracking-wider text-chrp-black hover:text-magenta transition-colors"
          >
            Scan a track →
          </Link>
        </nav>
      </header>

      <LandingHero />

      <section className="px-6 md:px-12 mt-20 md:mt-32 pb-20 md:pb-28">
        <div className="hairline mb-10" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
          <Column
            label="01 · Verdict"
            headline="Pitch now, develop, or hold."
            body="A pitch-readiness call at the top of the page. A manager reads it in two seconds and knows what to do this week."
          />
          <Column
            label="02 · Signature"
            headline="An emotional fingerprint, not a vibe."
            body="Four CHRP scores and four human-performance variables, anchored to operational language sync agents and brand directors recognize on sight."
          />
          <Column
            label="03 · Demand signal"
            headline="Where this music actually lives."
            body="Active brief signal across verticals — with a concrete sample brief alongside, never a number on its own."
          />
        </div>
      </section>

      <footer className="mt-auto px-6 md:px-12 pb-10">
        <div className="hairline mb-5" />
        <div className="flex flex-col md:flex-row justify-between gap-4 font-sans text-[11px] text-ink-soft">
          <div>CHRP &nbsp;//&nbsp; 2026 &nbsp;//&nbsp; scan.chrp.ai</div>
          <div className="flex gap-6">
            <Link href="/methodology" className="hover:text-chrp-black">
              Methodology
            </Link>
            <Link href="/scan" className="hover:text-chrp-black">
              Scan
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Column({
  label,
  headline,
  body,
}: {
  label: string;
  headline: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-magenta">
        {label}
      </div>
      <h3 className="font-display font-bold text-[24px] md:text-[28px] leading-[1.15]">
        {headline}
      </h3>
      <p className="font-sans text-ink-soft leading-relaxed text-[14px] max-w-[34ch]">
        {body}
      </p>
    </div>
  );
}
