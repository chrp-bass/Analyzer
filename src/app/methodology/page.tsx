import Link from "next/link";

export default function MethodologyPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 pt-6 md:pt-8 flex items-center justify-between">
        <Link
          href="/"
          className="font-sans font-black text-[16px] tracking-wider hover:text-magenta"
        >
          CHRP
        </Link>
        <Link
          href="/scan"
          className="font-sans font-bold text-[12px] tracking-wider uppercase text-ink-soft hover:text-chrp-black"
        >
          Scan a track →
        </Link>
      </header>

      <article className="px-6 md:px-10 py-12 md:py-20 max-w-[720px] mx-auto w-full">
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-magenta mb-5">
          Methodology
        </div>
        <h1 className="font-display font-bold display-tight text-[44px] md:text-[68px] text-balance">
          How the score is set.
        </h1>
        <p className="font-display italic text-[20px] md:text-[24px] text-ink-soft mt-4 max-w-[42ch] leading-[1.4]">
          Four CHRP scores, four human-performance variables, four modes. One
          briefing memo for the room that books your music.
        </p>

        <div className="h-12 md:h-16" />

        <section>
          <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
            What we listen for
          </div>
          <div className="hairline mt-1" />
          <div className="mt-5 flex flex-col gap-5 font-display text-[18px] md:text-[20px] leading-[1.55] text-chrp-black max-w-[62ch]">
            <p>
              CHRP listens for the emotional behavior of a song along two
              parallel axes. The first is the song&rsquo;s signature — four
              CHRP scores: Focus, Balance, Motivation, and Calm. The second is
              the set of human-performance variables it supports — Focus,
              Recovery, Flow, and Rest. None of these are about genre. They
              are about what the song <em>does</em> to the body and attention
              of a listener.
            </p>
            <p>
              We translate that fingerprint into one of four modes: Ready,
              Flow, Recharge, or Recover. Mode is shorthand for what the song
              is built to support — performance, sustained attention,
              restoration, or reflection. Inside each mode, the polygon shape
              gives the specific character of the song.
            </p>
          </div>
        </section>

        <div className="h-12 md:h-16" />
        <div className="hairline" />
        <div className="h-12 md:h-16" />

        <section>
          <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
            Why it matters for your music
          </div>
          <div className="hairline mt-1" />
          <div className="mt-5 flex flex-col gap-5 font-display text-[18px] md:text-[20px] leading-[1.55] text-chrp-black max-w-[62ch]">
            <p>
              Brand directors, supervisors, and creative leads do not pitch
              each other with vibes. They pitch with comps, with mode, with
              the specific moment a song is built to score. The page they are
              looking for is the one that already speaks their language — the
              one that names the mode, gives the comp, suggests the moment,
              and leaves the creative call to them.
            </p>
            <p>
              The CHRP report is that page. It is built to be the cleanest
              translation between an artist&rsquo;s intuition and an operator&rsquo;s
              brief. Your job is to make the music. Our job is to make sure
              the right room hears it the way you meant it to be heard.
            </p>
          </div>
        </section>

        <div className="h-12 md:h-20" />

        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4">
          <Link
            href="/scan"
            className="inline-flex items-center gap-3 px-6 py-3 bg-chrp-black text-chrp-white hover:bg-magenta transition-colors font-sans font-bold text-[12px] tracking-wider uppercase"
          >
            Score a track →
          </Link>
          <Link
            href="/"
            className="font-sans text-[12px] text-ink-soft hover:text-chrp-black"
          >
            ← Back home
          </Link>
        </div>
      </article>

      <footer className="mt-auto px-6 md:px-12 pb-10">
        <div className="hairline mb-5" />
        <div className="font-sans text-[11px] text-ink-soft">
          CHRP &nbsp;//&nbsp; 2026 &nbsp;//&nbsp; scan.chrp.ai
        </div>
      </footer>
    </main>
  );
}
