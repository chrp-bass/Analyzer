import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { TIERS } from "@/lib/payments";
import { pickRandomTrackSlug } from "@/lib/fixtures/tracks";

export function MarketingLanding() {
  // Picked fresh on every render. /app/page.tsx uses force-dynamic so each
  // visit gets a different featured sample track.
  const featuredSlug = pickRandomTrackSlug();
  const sampleHref = `/?stage=unlocked&track=${featuredSlug}`;
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <Hero sampleHref={sampleHref} />
      <WhyTheEngineMatters />
      <SampleStrip sampleHref={sampleHref} />
      <PricingSnapshot />
      <FinalCta />

      <footer className="px-6 md:px-10 py-6 border-t border-rule flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="font-sans text-[11px] text-ink-soft">
          Scored by CHRP &nbsp;//&nbsp; scan.chrp.ai
        </div>
        <div className="font-sans text-[11px] text-ink-light">
          Behavioral scoring only.{" "}
          <Link href="/methodology" className="underline-offset-4 hover:underline">
            Methodology
          </Link>
          .
        </div>
      </footer>
    </div>
  );
}

function Hero({ sampleHref }: { sampleHref: string }) {
  return (
    <section className="px-6 md:px-10 pt-12 md:pt-20 pb-10 md:pb-14 max-w-[920px] mx-auto w-full">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-4">
        Emotional intelligence for music
      </div>
      <h1 className="font-display font-bold text-[44px] md:text-[72px] leading-[0.95] text-chrp-black display-tight">
        Score the emotional fingerprint of any track in 10 seconds.
      </h1>
      <p className="font-display italic text-[18px] md:text-[22px] text-ink-soft mt-6 max-w-[42ch]">
        The emotional intelligence engine for working musicians. Trained on a
        living corpus of scored songs. Calibrated to the live sync market.
      </p>

      <div className="mt-10 flex flex-col sm:flex-row gap-3">
        <Link
          href="/scan"
          className="inline-flex items-center justify-center font-sans font-bold text-[13px] tracking-wider uppercase bg-chrp-black text-chrp-white px-6 py-4"
        >
          Scan your song
        </Link>
        <Link
          href={sampleHref}
          className="inline-flex items-center justify-center font-sans text-[13px] tracking-wider uppercase text-chrp-black border border-rule px-6 py-4 hover:bg-oat"
        >
          See a sample report
        </Link>
      </div>
    </section>
  );
}

function WhyTheEngineMatters() {
  return (
    <section className="px-6 md:px-10 py-12 md:py-20 max-w-[920px] mx-auto w-full border-t border-rule">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-6">
        Why the engine matters
      </div>
      <h2 className="font-display font-bold text-[28px] md:text-[40px] leading-[1.02] text-chrp-black display-tight max-w-[20ch]">
        CHRP doesn&rsquo;t analyze your song. CHRP positions it.
      </h2>

      <div className="mt-10 flex flex-col gap-10 md:gap-14">
        <EngineBlock
          n="01"
          headline="Most tools tell you what your song is. CHRP tells you where it sits."
          body={
            <>
              Every scan you run is positioned against the CHRP corpus &mdash;
              fingerprinted, scored, clustered, and mapped to commercial
              outcomes. The number you see isn&rsquo;t a guess. It&rsquo;s a
              coordinate. A song&rsquo;s emotional fingerprint only means
              something when you know what it&rsquo;s near, what it&rsquo;s far
              from, and which neighborhood predicts which kind of placement.
              That&rsquo;s a problem of corpus, not cleverness.
            </>
          }
        />
        <EngineBlock
          n="02"
          headline="A single song is a data point. The corpus is a behavior map."
          body={
            <>
              CHRP&rsquo;s engine has learned, across scored tracks at scale,
              which fingerprint patterns predict which placements, which
              signatures hold together across an artist&rsquo;s catalog, which
              clusters correlate with completion rates and sync receptivity.
              When CHRP tells you a song belongs in athletic and performance
              contexts &mdash; or that its Calm score will cost it placements
              in wellness and intimate categories &mdash; the claim rests on
              what comparable tracks have actually done in the market.
            </>
          }
        />
        <EngineBlock
          n="03"
          headline="A static analysis is a snapshot. CHRP is a signal."
          body={
            <>
              The corpus refreshes against active sync briefs, current listener
              behavior, and placement outcomes. Your song&rsquo;s score today
              reflects the market today &mdash; not last year&rsquo;s playlists
              or generic genre conventions. When the market shifts &mdash;
              toward calmer wellness tracks, toward higher-tempo athletic
              anthems, toward whatever the next quarter demands &mdash; your
              CHRP report shifts with it. The fingerprint stays. The position
              moves.
            </>
          }
        />
      </div>
    </section>
  );
}

function EngineBlock({
  n,
  headline,
  body,
}: {
  n: string;
  headline: string;
  body: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[48px_1fr] md:grid-cols-[72px_1fr] gap-4 md:gap-8 items-start border-t border-rule pt-8">
      <div
        className="font-sans font-black text-[32px] md:text-[44px] leading-none"
        style={{
          color: "var(--chrp-yellow)",
          WebkitTextStroke: "0.2px var(--chrp-black)",
        }}
      >
        {n}
      </div>
      <div>
        <p className="font-display font-bold text-[20px] md:text-[26px] leading-[1.12] text-chrp-black">
          {headline}
        </p>
        <p className="mt-3 font-sans text-[13px] md:text-[14px] leading-[1.55] text-ink-soft max-w-[58ch]">
          {body}
        </p>
      </div>
    </div>
  );
}

function SampleStrip({ sampleHref }: { sampleHref: string }) {
  return (
    <section className="px-6 md:px-10 py-10 md:py-14 max-w-[920px] mx-auto w-full border-t border-rule">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-4">
        What a scan returns
      </div>
      <p className="font-display italic text-[16px] md:text-[20px] text-ink-soft max-w-[52ch]">
        EPI score, mode, percentile rank in mode, four CHRP scores, four human
        performance variables, a pitch readiness verdict, Dr.&nbsp;Rhodes&rsquo;
        analysis, the placement brief, and where the music currently lives in
        the sync market.
      </p>
      <div className="mt-5">
        <Link
          href={sampleHref}
          className="font-sans text-[12px] tracking-wider uppercase text-chrp-black underline underline-offset-4 hover:no-underline"
        >
          Read a sample report &rarr;
        </Link>
      </div>
    </section>
  );
}

function PricingSnapshot() {
  const single = TIERS.single.priceUsd;
  const artist = TIERS.artist_catalog.priceUsd;
  return (
    <section className="px-6 md:px-10 py-10 md:py-14 max-w-[920px] mx-auto w-full border-t border-rule">
      <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-4">
        Pricing
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
        <div>
          <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
            Single scan
          </div>
          <div className="font-display font-bold text-[40px] leading-none mt-1 text-chrp-black">
            ${single}
          </div>
          <p className="mt-3 font-sans text-[13px] text-ink-soft leading-snug max-w-[44ch]">
            One track. The full report, 60-day access. Pitch verdict, analysis,
            placement intelligence, market signal.
          </p>
        </div>
        <div>
          <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
            Catalog scans
          </div>
          <div className="font-display font-bold text-[40px] leading-none mt-1 text-chrp-black">
            from ${artist}
          </div>
          <p className="mt-3 font-sans text-[13px] text-ink-soft leading-snug max-w-[44ch]">
            Score your catalog at a per-track rate. Scan eight tracks and the
            creator profile unlocks &mdash; signature pattern, emotional
            consistency, reliability across your body of work.
          </p>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-6 md:px-10 py-12 md:py-16 max-w-[920px] mx-auto w-full border-t border-rule">
      <h2 className="font-display font-bold text-[28px] md:text-[40px] leading-[1.05] text-chrp-black">
        Scan your song.
      </h2>
      <p className="mt-3 font-display italic text-[16px] md:text-[18px] text-ink-soft max-w-[44ch]">
        Ten seconds. A fingerprint, a position, and a pitch list ready to act
        on.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Link
          href="/scan"
          className="inline-flex items-center justify-center font-sans font-bold text-[13px] tracking-wider uppercase bg-chrp-black text-chrp-white px-6 py-4"
        >
          Scan your song
        </Link>
        <Link
          href="/methodology"
          className="inline-flex items-center justify-center font-sans text-[13px] tracking-wider uppercase text-chrp-black border border-rule px-6 py-4 hover:bg-oat"
        >
          Methodology
        </Link>
      </div>
    </section>
  );
}
