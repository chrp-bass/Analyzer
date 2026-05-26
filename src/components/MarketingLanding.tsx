import Link from "next/link";

export function MarketingLanding() {
  return (
    <div className="min-h-screen flex flex-col bg-chrp-white text-chrp-black">
      <LandingNav />
      <main className="flex-1">
        <Hero />
        <TheGap />
        <RecognitionMoment />
        <ThreePillars />
        <SuccessMoment />
        <WhatYouWalkAwayWith />
        <Pricing />
        <Segments />
        <Stakes />
        <FinalCta />
      </main>
      <Marquee />
      <LandingFooter />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function LandingNav() {
  return (
    <header className="landing-nav flex items-center justify-between px-5 md:px-10 py-4">
      <Link
        href="/"
        className="font-display font-bold text-[20px] tracking-[0.02em] text-chrp-black"
      >
        CHRP
      </Link>
      <Link
        href="/scan"
        className="font-sans font-bold text-[12px] tracking-[0.08em] uppercase px-4 py-2 transition-colors"
        style={{
          color: "var(--chrp-yellow)",
          border: "1px solid rgba(230, 215, 79, 0.40)",
          borderRadius: "2px",
        }}
      >
        Scan your song <span aria-hidden>→</span>
      </Link>
    </header>
  );
}

// ─── Section shells ──────────────────────────────────────────────────────────
function Section({
  children,
  pad = "py-16 md:py-24",
  className = "",
}: {
  children: React.ReactNode;
  pad?: string;
  className?: string;
}) {
  return (
    <section className={`${pad} px-5 md:px-10 ${className}`}>
      <div className="max-w-[720px] mx-auto w-full">{children}</div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-sans font-black text-[10px] tracking-[0.18em] uppercase text-ink-light mb-5">
      {children}
    </div>
  );
}

// ─── CTA button (used in 4 places) ───────────────────────────────────────────
// `accent` (CHRP Yellow on black text) is the hero treatment — the first
// moment of color on the page. Subsequent CTAs use the default chrp-black bg.
function CtaButton({ label, accent = false }: { label: string; accent?: boolean }) {
  const palette = accent
    ? "bg-chrp-yellow text-chrp-black hover:bg-[#d4c63d]"
    : "bg-chrp-black text-chrp-white hover:bg-ink-soft";
  return (
    <Link
      href="/scan"
      className={`block w-full md:w-auto md:inline-block md:min-w-[320px] md:max-w-[400px] text-center font-sans font-bold text-[13px] md:text-[14px] tracking-wider uppercase px-6 py-4 md:px-8 md:py-5 ${palette}`}
    >
      {label}
    </Link>
  );
}

// ─── 2. Hero ─────────────────────────────────────────────────────────────────
function Hero() {
  // .hero-section attaches the two atmospheric blobs via ::before / ::after
  // (coral lower-left, indigo upper-right) — see globals.css.
  return (
    <section className="hero-section px-5 md:px-10 pt-16 md:pt-24 pb-16 md:pb-24">
      <div className="max-w-[720px] mx-auto w-full">
        <h1 className="font-display font-bold text-[42px] leading-[1.0] md:text-[88px] md:leading-[0.98] text-chrp-black display-tight">
          Your song is ready.
          <br />
          The room doesn&rsquo;t know it yet.
        </h1>
        <div className="mt-8 md:mt-10 font-sans text-[16px] md:text-[18px] leading-[2.0] text-ink-soft font-light tracking-[0.02em]">
          <p>Give it a position.</p>
          <p>Give it a language.</p>
          <p>Give it a shot.</p>
        </div>
        <div className="mt-10 md:mt-12 md:flex md:justify-center">
          <CtaButton label="Get your EPI score — free now" accent />
        </div>
      </div>
    </section>
  );
}

// ─── 3. The gap ──────────────────────────────────────────────────────────────
function TheGap() {
  return (
    <Section className="border-t border-rule">
      <div className="font-sans text-[16px] md:text-[18px] leading-[1.6] text-ink-soft space-y-5">
        <p>You can see your streams.</p>
        <p>You can see your playlists.</p>
        <p>
          You know trail runners found your track. Gym-goers added it to their
          sets. The numbers are moving.
        </p>
        <p>
          What you can&rsquo;t see is the brief that&rsquo;s actively looking
          for exactly this sound right now. Or the forty words that make the
          supervisor running that brief write your name down.
        </p>
      </div>

      <div className="mt-10 md:mt-14 space-y-2">
        <p className="font-display font-bold italic text-[24px] md:text-[32px] leading-[1.2] text-chrp-black">
          Supervisors don&rsquo;t pass on bad music.
        </p>
        <p className="font-display font-bold italic text-[24px] md:text-[32px] leading-[1.2] text-chrp-black">
          They pass on music they can&rsquo;t place.
        </p>
      </div>

      <div className="mt-10 md:mt-14 font-sans text-[16px] md:text-[18px] leading-[1.6] text-ink-soft space-y-5">
        <p>
          The intelligence that closes that gap has always lived inside labels,
          publishing companies, and sync agencies.
        </p>
        <p className="font-bold text-chrp-black">CHRP puts it in your hands.</p>
      </div>
    </Section>
  );
}

// ─── 4. The recognition moment ───────────────────────────────────────────────
function RecognitionMoment() {
  return (
    <Section className="border-t border-rule">
      <SectionLabel>The recognition moment</SectionLabel>
      <p className="font-sans text-[15px] md:text-[16px] text-ink-soft leading-[1.55]">
        You&rsquo;ve said some version of this. Every artist has.
      </p>

      <div className="mt-8 space-y-5">
        <div
          className="p-5 md:p-7 bg-oat border-l-[3px]"
          style={{ borderLeftColor: "var(--ink-light)" }}
        >
          <div className="font-sans font-black text-[10px] tracking-[0.18em] uppercase text-ink-soft mb-3">
            Without CHRP
          </div>
          <p className="font-display italic text-[18px] md:text-[22px] leading-[1.4] text-chrp-black">
            &ldquo;It&rsquo;s kind of cinematic. Kind of indie. It has this
            melancholy but hopeful feeling &mdash; I think it could work for a
            TV show or maybe a car commercial.&rdquo;
          </p>
        </div>

        <div
          className="p-5 md:p-7 bg-oat border-l-[3px]"
          style={{ borderLeftColor: "var(--chrp-yellow)" }}
        >
          <div className="font-sans font-black text-[10px] tracking-[0.18em] uppercase text-ink-soft mb-3">
            With CHRP
          </div>
          <p className="font-display italic text-[18px] md:text-[22px] leading-[1.4] text-chrp-black">
            &ldquo;Ready mode. Top 6% Motivation. Strongest active brief demand
            in athletic and performance right now. Closest sync sibling to
            Sigur R&oacute;s in prestige sport documentary. Here&rsquo;s the
            throughline.&rdquo;
          </p>
        </div>
      </div>

      <p className="mt-12 md:mt-16 font-sans font-bold text-[18px] md:text-[22px] text-chrp-black text-center leading-[1.3]">
        One of these gets written down.
      </p>

      <div className="mt-10 md:mt-12 md:flex md:justify-center">
        <CtaButton label="Scan your first track — free now" />
      </div>
    </Section>
  );
}

// ─── 5. Three pillars ────────────────────────────────────────────────────────
function ThreePillars() {
  return (
    <Section className="border-t border-rule">
      <SectionLabel>Why the engine matters</SectionLabel>
      <h2 className="font-display font-bold text-[32px] md:text-[48px] leading-[1.05] text-chrp-black display-tight">
        CHRP doesn&rsquo;t analyze your song.
        <br />
        CHRP positions it.
      </h2>

      <div className="mt-12 md:mt-16 flex flex-col gap-5">
        <Pillar
          n="01"
          headline="Your song has a position."
          body="Not a vibe. A coordinate. Scored against a corpus of music mapped to real commercial outcomes. The number you see isn't an opinion. It's where your song lives in the market right now."
        />
        <Pillar
          n="02"
          headline="Your catalog has a signature."
          body="Scan eight tracks and your creative pattern emerges — emotional consistency, signature shape, reliability across your body of work. The intelligence that defines a career, not a single release."
        />
        <Pillar
          n="03"
          headline="The market is live."
          body="Active briefs. Real demand signals. Refreshed weekly. You stop pitching last quarter's market and start pitching the one that's open right now."
        />
      </div>
    </Section>
  );
}

function Pillar({
  n,
  headline,
  body,
}: {
  n: string;
  headline: string;
  body: string;
}) {
  // .pillar-card carries the per-pillar gradient via data-pillar in globals.css.
  return (
    <div className="pillar-card" data-pillar={n}>
      <div className="pillar-number">{n}</div>
      <h3 className="font-display font-bold text-[28px] md:text-[42px] leading-[1.1] mt-3 md:mt-4 max-w-[18ch]">
        {headline}
      </h3>
      <p className="mt-5 md:mt-6 font-sans text-[14px] md:text-[15px] font-light leading-[1.7] max-w-[480px]">
        {body}
      </p>
    </div>
  );
}

// ─── 6. The success moment ───────────────────────────────────────────────────
function SuccessMoment() {
  return (
    <Section className="border-t border-rule">
      <div className="font-sans text-[16px] md:text-[18px] leading-[1.6] text-ink-soft space-y-5">
        <p>Picture the next conversation you have with a music supervisor.</p>
        <p>They ask what the track is for.</p>
        <p>
          You don&rsquo;t reach for genre labels. You don&rsquo;t say &ldquo;it
          has kind of a cinematic feel.&rdquo;
        </p>
        <p>
          You tell them: Ready mode. Top 8% Motivation across the corpus.
          Strongest active brief demand in athletic content right now. Closest
          sync sibling to Sigur R&oacute;s for prestige sport documentary.
          Here&rsquo;s the throughline in one sentence.
        </p>
        <p>They write something down.</p>
      </div>

      <div className="mt-12 md:mt-16 text-center space-y-2 md:space-y-3">
        <p className="font-display font-bold text-[24px] md:text-[36px] leading-[1.15] text-chrp-black">
          That feeling has a name.
        </p>
        <p className="font-display font-bold text-[24px] md:text-[36px] leading-[1.15] text-chrp-black">
          It&rsquo;s called knowing what you have.
        </p>
        <p className="font-display font-bold text-[24px] md:text-[36px] leading-[1.15] text-chrp-black">
          CHRP gives you that.
        </p>
      </div>
    </Section>
  );
}

// ─── 7. What you walk away with ──────────────────────────────────────────────
function WhatYouWalkAwayWith() {
  const items = [
    "Mode and EPI score: exactly what kind of track you made",
    "Pitch readiness verdict: Pitch now, Develop, or Hold — with the reasoning",
    "Dr. Rhodes' analysis: where it lives commercially and what to avoid",
    "Three placements written in the language supervisors use",
    "A throughline you can paste into any pitch email today",
    "Live market signal on where active brief demand is right now",
  ];
  return (
    <Section className="border-t border-rule">
      <SectionLabel>What a scan returns</SectionLabel>
      <p className="font-sans text-[16px] md:text-[18px] text-ink-soft mb-6">
        One scan. Ten seconds. You walk away with:
      </p>
      <ul className="space-y-3 md:space-y-4 font-sans text-[15px] md:text-[16px] leading-[1.55] text-ink-soft">
        {items.map((line) => (
          <li
            key={line}
            className="grid grid-cols-[18px_1fr] gap-3"
          >
            <span aria-hidden className="text-ink-light">
              &mdash;
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-8 md:mt-10 font-sans font-bold text-[16px] md:text-[18px] text-chrp-black leading-[1.45]">
        Everything you need to walk into any room like you already know the
        answer.
      </p>
      <p className="mt-4 font-sans text-[12px] md:text-[13px] text-ink-light leading-[1.5]">
        Works on released tracks. Share privately for pre-release intelligence.
      </p>

      <div className="mt-10 md:mt-12 md:flex md:justify-center">
        <CtaButton label="Scan your first track — free now" />
      </div>
    </Section>
  );
}

// ─── 8. Pricing ──────────────────────────────────────────────────────────────
function Pricing() {
  return (
    <Section className="border-t border-rule">
      <SectionLabel>Pricing</SectionLabel>

      <div className="space-y-12 md:space-y-14">
        <TierBlock
          name="Single scan"
          price="$29"
          body={
            <>
              <p>
                One track. Know exactly what it is, where it belongs, and how
                to pitch it.
              </p>
              <p>
                Full report. Sixty-day access. Pitch verdict, analysis,
                placement intelligence, live market signal.
              </p>
            </>
          }
        />

        <div className="border-t border-rule pt-8 md:pt-10">
          <div className="flex flex-col md:flex-row md:items-baseline md:gap-6 mb-4">
            <div className="font-sans font-black text-[11px] tracking-[0.18em] uppercase text-ink-soft">
              Catalog
            </div>
            <div className="font-display font-bold text-[28px] md:text-[36px] leading-none mt-1 md:mt-0 text-chrp-black">
              from $149
            </div>
          </div>
          <div className="font-sans text-[15px] md:text-[16px] leading-[1.6] text-ink-soft space-y-4">
            <p>The intelligence that managers have. Now available without one.</p>
            <p>
              Score your catalog at a per-track rate. Scan eight tracks and
              your creator profile unlocks &mdash; emotional consistency,
              signature pattern, and reliability index that only emerge across
              a body of work.
            </p>
          </div>
          <div className="mt-6 space-y-1">
            <p className="font-display italic text-[18px] md:text-[22px] leading-[1.35] text-chrp-black">
              Your first scan tells you what you have.
            </p>
            <p className="font-display italic text-[18px] md:text-[22px] leading-[1.35] text-chrp-black">
              Your eighth tells you who you are as a creator.
            </p>
          </div>
        </div>

        <TierBlock
          name="Extended catalog"
          price="$299"
          body={
            <p>
              Full discography. Forty tracks. Complete catalog positioning.
            </p>
          }
        />

        <TierBlock
          name="Manager roster"
          price="$499"
          body={
            <p>
              Managing a roster? The catalog tier covers multiple artists.
              Scan your full roster and see who to lead with this quarter
              &mdash; and against which active briefs.
            </p>
          }
        />

        <TierBlock
          name="Annual unlimited"
          price="$999"
          body={
            <p>
              Labels, agencies, and sync-active management firms. Unlimited
              scans. White-label exports. Priority engine access.
            </p>
          }
        />
      </div>

      <p className="mt-12 md:mt-14 font-sans italic text-[13px] md:text-[14px] text-ink-soft text-center">
        Free through June 30. Pricing starts July 1.
      </p>
    </Section>
  );
}

function TierBlock({
  name,
  price,
  body,
}: {
  name: string;
  price: string;
  body: React.ReactNode;
}) {
  return (
    <div className="border-t border-rule pt-8 md:pt-10">
      <div className="flex flex-col md:flex-row md:items-baseline md:gap-6 mb-4">
        <div className="font-sans font-black text-[11px] tracking-[0.18em] uppercase text-ink-soft">
          {name}
        </div>
        <div className="font-display font-bold text-[28px] md:text-[36px] leading-none mt-1 md:mt-0 text-chrp-black">
          {price}
        </div>
      </div>
      <div className="font-sans text-[15px] md:text-[16px] leading-[1.6] text-ink-soft space-y-3">
        {body}
      </div>
    </div>
  );
}

// ─── 9. Segments ─────────────────────────────────────────────────────────────
function Segments() {
  return (
    <Section className="border-t border-rule">
      <SectionLabel>You&rsquo;re not the only one.</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
        <Segment
          name="Producers"
          line1="Scan during the creative process — not after."
          line2="Know where the track is headed before it's finished."
        />
        <Segment
          name="Managers"
          line1="Ranked pitch priorities across your full roster against live briefs."
          line2="See who to lead with this quarter."
        />
        <div>
          <div className="font-sans font-black text-[11px] tracking-[0.18em] uppercase text-ink-soft mb-3">
            A&amp;R
          </div>
          <p className="font-sans text-[15px] md:text-[15.5px] leading-[1.55] text-ink-soft">
            Pre-commitment intelligence before the signing meeting.
          </p>
          <Link
            href="/contact"
            className="mt-3 inline-block font-sans font-bold text-[13px] tracking-wider uppercase text-chrp-black underline underline-offset-4 hover:no-underline"
          >
            &rarr; Let&rsquo;s talk about bulk access
          </Link>
        </div>
      </div>
    </Section>
  );
}

function Segment({
  name,
  line1,
  line2,
}: {
  name: string;
  line1: string;
  line2: string;
}) {
  return (
    <div>
      <div className="font-sans font-black text-[11px] tracking-[0.18em] uppercase text-ink-soft mb-3">
        {name}
      </div>
      <p className="font-sans text-[15px] md:text-[15.5px] leading-[1.55] text-ink-soft">
        {line1}
      </p>
      <p className="font-sans text-[15px] md:text-[15.5px] leading-[1.55] text-ink-soft mt-1">
        {line2}
      </p>
    </div>
  );
}

// ─── 10. Stakes ──────────────────────────────────────────────────────────────
function Stakes() {
  return (
    <Section
      pad="py-20 md:py-32"
      className="border-t border-rule"
    >
      <div className="font-sans text-[17px] md:text-[20px] leading-[1.55] text-ink-soft space-y-4">
        <p>
          Every week you pitch without this is a week you&rsquo;re asking
          supervisors to do your positioning work for you.
        </p>
        <p className="font-bold text-chrp-black">Most won&rsquo;t.</p>
      </div>
    </Section>
  );
}

// ─── 11. Final CTA ───────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <Section className="border-t border-rule">
      <h2 className="font-display font-bold text-[32px] md:text-[56px] leading-[1.06] text-chrp-black display-tight">
        You already know your music is good.
        <br />
        Now know what it&rsquo;s worth.
      </h2>
      <div className="mt-8 md:mt-10 md:flex md:justify-center">
        <CtaButton label="Scan your first track — free through June 30" />
      </div>
      <p className="mt-4 font-sans text-[12px] md:text-[13px] text-ink-light text-center md:text-left">
        Pricing starts July 1. No credit card required.
      </p>
    </Section>
  );
}

// ─── Marquee — mychrp.ai signature. Purple→teal gradient, Cormorant italic
//     in gold, bird separators. Identical to the consumer site. ─────────────
function Marquee() {
  return (
    <div className="chrp-marquee-section" aria-hidden>
      <div className="chrp-marquee-track">
        Score your song. &nbsp;🐦&nbsp; Find Your Frequency. &nbsp;🐦&nbsp; Let
        music move you. &nbsp;🐦&nbsp; Score your song. &nbsp;🐦&nbsp; Find Your
        Frequency. &nbsp;🐦&nbsp; Let music move you. &nbsp;🐦&nbsp;
      </div>
    </div>
  );
}

// ─── 12. Footer ──────────────────────────────────────────────────────────────
function LandingFooter() {
  return (
    <footer className="border-t border-rule px-5 md:px-10 py-8 font-sans text-[12px] text-ink-light">
      <div className="max-w-[920px] mx-auto w-full flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-6">
        <div>Scored by CHRP &nbsp;//&nbsp; scan.chrp.ai</div>
        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-5">
          <a
            href="https://mychrp.ai"
            target="_blank"
            rel="noreferrer"
            className="hover:text-chrp-black"
          >
            mychrp.ai
          </a>
          <a
            href="https://chrp.ai"
            target="_blank"
            rel="noreferrer"
            className="hover:text-chrp-black"
          >
            chrp.ai
          </a>
          <Link href="/methodology" className="hover:text-chrp-black">
            Methodology
          </Link>
          <span>Behavioral scoring only.</span>
        </div>
      </div>
    </footer>
  );
}
