import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export function MarketingLanding() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <section className="flex-1 px-6 md:px-10 py-12 md:py-24 max-w-[920px] mx-auto w-full">
        <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-4">
          Emotional intelligence for music
        </div>
        <h1 className="font-display font-bold text-[44px] md:text-[72px] leading-[0.95] text-chrp-black display-tight">
          Score the emotional fingerprint of any track in 10 seconds.
        </h1>
        <p className="font-display italic text-[18px] md:text-[22px] text-ink-soft mt-6 max-w-[34ch]">
          CHRP reads a song the way a sync supervisor or a wellness curator
          does — by what it makes a listener ready to do.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link
            href="/scan"
            className="inline-flex items-center justify-center font-sans font-bold text-[13px] tracking-wider uppercase bg-chrp-black text-chrp-white px-6 py-4"
          >
            Scan your song
          </Link>
          <Link
            href="/?stage=unlocked&track=glasshouse"
            className="inline-flex items-center justify-center font-sans text-[13px] tracking-wider uppercase text-chrp-black border border-rule px-6 py-4 hover:bg-oat"
          >
            See a sample report
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          <FeatureCard
            n="01"
            title="Behavioral, not vibey"
            body="CHRP scores what a song is built to do — focus, motivation, balance, calm — not what it sounds like."
          />
          <FeatureCard
            n="02"
            title="Locked to a brief"
            body="Every report ends with verticals the song lives in and active briefs the placement market is asking for."
          />
          <FeatureCard
            n="03"
            title="Catalog intelligence"
            body="Scan eight tracks and unlock a creator profile: aggregated signature, consistency, mode distribution, pitch priorities."
          />
        </div>
      </section>

      <footer className="px-6 md:px-10 py-6 border-t border-rule flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="font-sans text-[11px] text-ink-soft">
          Scored by CHRP &nbsp;//&nbsp; scan.chrp.ai
        </div>
        <div className="font-sans text-[11px] text-ink-light">
          Behavioral scoring only. Methodology at scan.chrp.ai/methodology.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="font-sans font-black text-[28px] leading-none"
        style={{
          color: "var(--chrp-yellow)",
          WebkitTextStroke: "0.2px var(--chrp-black)",
        }}
      >
        {n}
      </div>
      <div className="font-display font-bold text-[18px] md:text-[20px] text-chrp-black mt-1">
        {title}
      </div>
      <p className="font-sans text-[12px] md:text-[13px] leading-[1.5] text-ink-soft max-w-[36ch]">
        {body}
      </p>
    </div>
  );
}
