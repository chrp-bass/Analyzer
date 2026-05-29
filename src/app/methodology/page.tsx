import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export default function MethodologyPage() {
  return (
    <div className="page-shell">
      <SiteHeader />
      <main>
        {/* Dark editorial intro — same atmosphere as the homepage hero. */}
        <section className="page-hero">
          <div className="wrap">
            <span className="eyebrow">Methodology</span>
            <h1>How the score is set.</h1>
            <p className="sub">
              Four CHRP scores, four human-performance variables, four modes.
              One briefing memo for the room that books your music.
            </p>
          </div>
        </section>

        {/* Cream "document" — long-form editorial body. */}
        <section className="page-document">
          <div className="col">
            <span className="eyebrow">What we listen for</span>
            <h2>The fingerprint, then the mode.</h2>
            <p>
              CHRP listens for the emotional behavior of a song along two
              parallel axes. The first is the song&rsquo;s signature &mdash;
              four CHRP scores: Focus, Balance, Motivation, and Calm. The
              second is the set of human-performance variables it supports
              &mdash; Focus, Recovery, Flow, and Rest. None of these are about
              genre. They are about what the song <em>does</em> to the body
              and attention of a listener.
            </p>
            <p>
              We translate that fingerprint into one of four modes: Ready,
              Flow, Recharge, or Recover. Mode is shorthand for what the song
              is built to support &mdash; performance, sustained attention,
              restoration, or reflection. Inside each mode, the polygon shape
              gives the specific character of the song.
            </p>

            <h2>Why it matters for your music.</h2>
            <p>
              Brand directors, supervisors, and creative leads do not pitch
              each other with vibes. They pitch with comps, with mode, with
              the specific moment a song is built to score. The page they are
              looking for is the one that already speaks their language
              &mdash; the one that names the mode, gives the comp, suggests
              the moment, and leaves the creative call to them.
            </p>
            <p>
              The CHRP report is that page. It is built to be the cleanest
              translation between an artist&rsquo;s intuition and an
              operator&rsquo;s brief. Your job is to make the music. Our job
              is to make sure the right room hears it the way you meant it to
              be heard.
            </p>

            <h2>What you get in a scan.</h2>
            <ul>
              <li>Mode &amp; EPI Score &mdash; exactly what kind of track you made.</li>
              <li>Pitch-readiness verdict &mdash; Pitch now, Develop, or Hold, with the reasoning.</li>
              <li>Dr. Rhodes&rsquo; analysis &mdash; where it lives commercially and what to avoid.</li>
              <li>Three placements written in the language supervisors use.</li>
              <li>A throughline you can paste into any pitch email today.</li>
              <li>Live market signal on where active brief demand sits right now.</li>
            </ul>

            <div style={{ marginTop: 48, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Link href="/scan" className="btn btn-y">
                Score a track &rarr;
              </Link>
              <Link href="/" className="btn btn-ghost">
                &larr; Back home
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
