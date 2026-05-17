import Link from "next/link";
import { Rule, SectionHead } from "@/components/primitives";

export default function MethodologyPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 pt-8 md:pt-10 flex items-center justify-between">
        <Link href="/" className="smallcaps-mono text-ink hover:text-accent">
          CHRP // Sync Intelligence
        </Link>
        <Link
          href="/scan"
          className="smallcaps-mono text-ink-soft hover:text-accent"
        >
          Scan a track →
        </Link>
      </header>

      <article className="px-6 md:px-10 py-12 md:py-20 max-w-[720px] mx-auto w-full">
        <div className="smallcaps-mono text-accent mb-5">METHODOLOGY</div>
        <h1
          className="font-serif font-black display-tight text-[48px] md:text-[76px] text-balance"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          How the score is set.
        </h1>
        <p className="font-serif italic text-[20px] md:text-[24px] text-ink-soft mt-4 max-w-[42ch] leading-[1.4]">
          Twelve dimensions, four modes, one page you can hand to the room that
          books your music.
        </p>

        <div className="h-16 md:h-24" />

        <section>
          <SectionHead label="WHAT WE LISTEN FOR" />
          <div className="flex flex-col gap-6 font-serif text-[18px] md:text-[20px] leading-[1.6] text-ink max-w-[62ch]">
            <p>
              CHRP listens for twelve behavioral dimensions — valence, arousal,
              tension and release, motivational energy, emotional drift, focus,
              confidence, stress modulation, pacing, aggression, recovery, and
              behavioral resonance. None of these are about genre. They are
              about what a song <em>does</em> to the body and attention of a
              listener.
            </p>
            <p>
              We translate that fingerprint into one of four modes: Ready, Flow,
              Recharge, or Recover. Mode is shorthand for what the song is
              built to support — performance, focus, restoration, or
              reflection. Inside each mode, the fingerprint gives the specific
              shape: the same Recharge song can be soft and warm or vast and
              cinematic depending on where its scores land.
            </p>
          </div>
        </section>

        <div className="h-16 md:h-20" />
        <Rule />
        <div className="h-16 md:h-20" />

        <section>
          <SectionHead label="WHY IT MATTERS FOR YOUR MUSIC" />
          <div className="flex flex-col gap-6 font-serif text-[18px] md:text-[20px] leading-[1.6] text-ink max-w-[62ch]">
            <p>
              Music supervisors and brand directors do not pitch each other
              with vibes. They pitch with comps, with mood, with the specific
              moment a song is built to score. The page they are looking for is
              the one that already speaks their language — the one that names
              the mode, gives the comp, suggests the moment, and leaves the
              creative call to them.
            </p>
            <p>
              The CHRP report is that page. It is built to be the cleanest
              possible translation between an artist&rsquo;s intuition and a
              supervisor&rsquo;s brief. Your job is to make the music. Our job
              is to make sure the right room hears it the way you meant it to
              be heard.
            </p>
          </div>
        </section>

        <div className="h-16 md:h-24" />

        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4">
          <Link
            href="/scan"
            className="inline-flex items-center gap-3 px-6 py-3 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors smallcaps tracking-[0.18em]"
          >
            Score a track →
          </Link>
          <Link
            href="/"
            className="smallcaps-mono text-ink-soft hover:text-accent"
          >
            ← Back home
          </Link>
        </div>
      </article>

      <footer className="mt-auto px-6 md:px-12 pb-10">
        <Rule className="mb-5" />
        <div className="smallcaps-mono text-ink-soft">
          CHRP // 2026 // scan.chrp.ai
        </div>
      </footer>
    </main>
  );
}
