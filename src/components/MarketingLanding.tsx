import Link from "next/link";
import { HeroScanField } from "@/components/HeroScanField";
import { HeroSpecimen, type Specimen } from "@/components/HeroSpecimen";
import { TRACK_SLUGS, getFreeReportById } from "@/lib/fixtures/tracks";
import { polygonFromChrpScores } from "@/lib/polygon";

/**
 * scan.chrp.ai landing — CHRP Song Intelligence, locked design (Deliverable 05).
 *
 * Copy is governed by CHRP_SONG_INTELLIGENCE_LOCKED_SALES_ARCHITECTURE_FINAL.
 * Two rules bind every edit to this file:
 *
 *   1. Nothing on this page may claim active briefs, live demand, placement
 *      probability, percentiles, guaranteed outcomes, or "most chosen".
 *   2. The category is Song Intelligence. Sync is an application of it, not
 *      the product.
 *
 * Section grounds alternate ink / cream / yellow / plum deliberately — the
 * brand system is used in full, not collapsed to black + cream + yellow.
 */

const DIMENSIONS = [
  {
    name: "Focus",
    mode: "Flow mode",
    color: "var(--blue)",
    body: "How strongly the song supports directed attention and mental engagement.",
  },
  {
    name: "Calm",
    mode: "Recharge mode",
    color: "var(--pistachio)",
    body: "How strongly the song supports settling, regulation and lower activation.",
  },
  {
    name: "Motivation",
    mode: "Ready mode",
    color: "var(--yellow)",
    body: "How strongly the song supports energy, drive and forward movement.",
  },
  {
    name: "Balance",
    mode: "Recover mode",
    color: "var(--plum)",
    body: "How strongly the song supports emotional steadiness and equilibrium.",
  },
];

const FREE_ITEMS = [
  "EPI Score",
  "Primary mode",
  "Focus, Calm, Motivation, Balance",
  "Your four-dimension performance profile",
  "One emotional-signature statement",
];

/**
 * What the paid report actually contains today. Kept in lockstep with
 * ReportBody — the page must never promise a movement the report does not
 * ship. "Positioning language" from the approved hierarchy has no backing
 * engine output yet and is therefore not advertised.
 */
const PAID_ITEMS = [
  "Emotional signature, in full",
  "The CHRP reading",
  "Complete EPI profile",
  "What it’s built for",
  "Pitch throughline",
  "Comparable context",
];

const MOVEMENTS = [
  {
    n: "01",
    title: "Emotional signature",
    body: "What the song is doing emotionally.",
  },
  {
    n: "—",
    title: "The CHRP reading",
    body: "The interpretation of that position, in CHRP’s voice. No named analyst, no persona.",
  },
  {
    n: "02",
    title: "EPI profile",
    body: "Focus, Calm, Motivation and Balance, plus mode and score.",
  },
  {
    n: "03",
    title: "What it’s built for",
    body: "The moments, contexts and use cases the song naturally supports.",
  },
  {
    n: "04",
    title: "Pitch throughline",
    body: "Language you can adapt for a pitch, deck, metadata, campaign or conversation.",
  },
  {
    n: "05",
    title: "Comparable context",
    body: "Where supportable, references that help explain the emotional territory.",
  },
];

const STAGES = [
  {
    count: "One song",
    name: "Song Intelligence",
    question: "What does this song do?",
    body: "The emotional signature and position of one recording, with language for talking about it. Complete on its own — nothing here depends on scanning more.",
  },
  {
    count: "Three songs and up",
    name: "Project Intelligence",
    question: "What does this body of work do?",
    body: "An EP, an album, a run of demos. With several songs read together, consistencies and outliers start to be visible that no single report could show.",
  },
  {
    count: "Eight to ten songs",
    name: "Creator Intelligence",
    question: "What does the music I make begin to reveal about me?",
    body: "The position the work keeps returning to, stated only as far as the songs support it. Not a personality reading — an account of what you have actually been making.",
  },
];

const SINGLE_INCLUDES = [
  "Full EPI profile",
  "Emotional signature",
  "Positioning intelligence",
  "What it’s built for",
  "Pitch throughline",
];

const CATALOG_INCLUDES = [
  "Everything in Song Intelligence",
  "Up to 10 tracks",
  "Cross-song patterns as they emerge",
  "Creator profile",
  "Catalog signature",
];

export function MarketingLanding() {
  return (
    <>
      <Header />
      <Hero />
      <Recognition />
      <Statement />
      <Dimensions />
      <Difference />
      <Reveal />
      <Movements />
      <Sync />
      <Catalog />
      <Pricing />
      <Closing />
      <Footer />
    </>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────
// Primary action is SCAN A SONG. "My songs" is the quiet returning-user door —
// authentication is never the front door.
function Header() {
  return (
    <header className="si-nav">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="CHRP home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/chrp-logo.svg" alt="CHRP" />
        </Link>
        <nav>
          <a href="#how" className="si-desk">
            How it works
          </a>
          <a href="#pricing" className="si-desk">
            Pricing
          </a>
          <Link href="/dashboard" className="si-quiet">
            My songs
          </Link>
          <Link href="/scan" className="si-nav-cta">
            Scan your song &mdash; free
          </Link>
        </nav>
      </div>
    </header>
  );
}

/**
 * The six bundled demo tracks, reduced to only what the hero draws. Built
 * here — in a server component — so the fixture module never reaches the
 * browser. These are illustrative demo songs, labelled as such on the page;
 * no real artist is represented and no value is invented, the geometry is
 * the engine's own output format.
 */
function heroSpecimens(): Specimen[] {
  return TRACK_SLUGS.map((slug) => {
    const r = getFreeReportById(slug);
    if (!r) return null;
    return {
      title: r.track.title,
      artist: r.track.artist,
      vertices: polygonFromChrpScores(r.chrp_scores),
      score: r.epi.score,
      mode: r.epi.mode,
    };
  }).filter((x): x is Specimen => x !== null);
}

// ─── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section id="scan" className="si-hero">
      <div className="wrap">
        <div>
          <div className="si-hero-tick">
            <span />
            <p className="si-kicker" style={{ margin: 0 }}>
              CHRP Song Intelligence
            </p>
          </div>
          <h1>Know what your song does. Know where it belongs.</h1>
          <p className="si-hero-lede">
            Your song already creates an emotional response.
          </p>
          <p className="si-hero-lede">
            CHRP helps you understand that response, see the moments it is
            built for, and position the song with greater intelligence.
          </p>
          <HeroScanField />
        </div>

        {/* The aura stays — it is the brand's emotional field. What sat in
            front of it was a portrait of a person and an empty dial, on a
            page whose claim is that a SONG has a shape. Real songs sit
            there now, in turn, so the relationship is demonstrated rather
            than captioned. */}
        <div className="si-hero-art">
          <div aria-hidden className="si-hero-atmos" />
          <div aria-hidden className="si-hero-horizon" />
          <HeroSpecimen specimens={heroSpecimens()} />
          <p className="si-hero-caption">
            Six songs. Six shapes. Yours takes about ten seconds.
          </p>
          <p className="si-hero-note">
            Example output &mdash; illustrative values, not live scans.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Recognition ─────────────────────────────────────────────────────────────
function Recognition() {
  return (
    <section className="si-sec si-rule-top">
      <div className="wrap">
        <p className="si-kicker">You know the feeling</p>
        <div className="si-split">
          <h2 className="si-h2" style={{ color: "var(--paper)" }}>
            You know what the song feels like. Explaining it is harder.
          </h2>
          <div className="si-split-prose">
            <p className="si-body">
              Artists hear things other people cannot always name.
            </p>
            <p className="si-body">
              You know when a song feels urgent, reflective, cinematic,
              restrained, explosive or unresolved. But when someone asks:
            </p>
            <p className="si-quote">What is this song really built for?</p>
            <p className="si-body" style={{ marginTop: "clamp(20px,2.4vw,30px)" }}>
              The answer often becomes genre, references and adjectives. CHRP
              gives you another language.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Statement band ──────────────────────────────────────────────────────────
function Statement() {
  return (
    <section className="si-statement">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/graphics/hero-artist-aura.png" alt="" aria-hidden />
      <div aria-hidden className="scrim" />
      <div className="wrap">
        <p>Not just what it sounds like. What it does.</p>
      </div>
    </section>
  );
}

// ─── Four dimensions ─────────────────────────────────────────────────────────
function Dimensions() {
  return (
    <section id="how" className="si-sec si-paper">
      <div className="wrap">
        <div className="si-split si-split-end">
          <div>
            <p className="si-kicker">Four dimensions</p>
            <h2 className="si-h2" style={{ fontWeight: 400, maxWidth: "18ch" }}>
              Every song holds four things at once.
            </h2>
          </div>
          <p className="si-body" style={{ maxWidth: "46ch", margin: 0 }}>
            CHRP reads how strongly a song supports each one, then plots the
            four together. That shape is your song&rsquo;s performance profile, and no
            two are quite alike. Whichever dimension leads gives the song its
            mode, and its colour.
          </p>
        </div>

        <div className="si-dims">
          {DIMENSIONS.map((d) => (
            <div key={d.name} className="si-dim">
              <div className="si-dim-id">
                <span
                  className="si-dim-swatch"
                  style={{ background: d.color }}
                  aria-hidden
                />
                <div>
                  <p className="si-dim-name">{d.name}</p>
                  <p className="si-dim-mode">{d.mode}</p>
                </div>
              </div>
              <p className="si-body si-dim-body">{d.body}</p>
            </div>
          ))}
        </div>

        <p className="si-dims-note">
          The scan reads the recording. It does not listen to you, watch you, or
          ask you anything about yourself.
        </p>
      </div>
    </section>
  );
}

// ─── The difference ──────────────────────────────────────────────────────────
function Difference() {
  return (
    <section className="si-sec-tall si-yellow">
      <div className="wrap">
        <p className="si-kicker">The difference</p>
        <h2 className="si-h2" style={{ maxWidth: "18ch", fontSize: "clamp(2.3rem,5.4vw,4.6rem)" }}>
          Your song is more than genre.
        </h2>
        <div className="si-cols3">
          <div>
            <p className="si-colhead">What a song already comes with</p>
            <div className="si-plainlist">
              <p>Genre</p>
              <p>BPM</p>
              <p>Key</p>
              <p>Streams</p>
            </div>
            <p className="si-colnote" style={{ maxWidth: "34ch" }}>
              Genre tells someone what neighbourhood the song comes from.
            </p>
          </div>
          <div>
            <p className="si-colhead si-colhead-strong">What CHRP adds</p>
            <p className="si-epi-name">Emotional Performance Intelligence</p>
            <p className="si-colnote">
              CHRP helps describe what the song is capable of doing to the
              moment. The mechanics behind that stay behind the curtain.
            </p>
          </div>
          <div className="si-col-bottom">
            <p className="si-quote">
              Audio features describe the music. CHRP helps describe the effect.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── The free reveal ─────────────────────────────────────────────────────────
// The specimen below is a labelled example, not a customer record. The free /
// paid boundary is stated as two lists — never as blurred paid content.
function Reveal() {
  const axes = [
    { name: "Focus", score: 67, color: "#7A9FE8" },
    { name: "Calm", score: 46, color: "#A8D990" },
    { name: "Motivation", score: 84, color: "#E6D74F" },
    { name: "Balance", score: 54, color: "#C990B8" },
  ];
  return (
    <section id="reveal" className="si-sec">
      <div className="wrap">
        <p className="si-kicker">The first scan</p>
        <h2 className="si-h2" style={{ color: "var(--paper)", maxWidth: "20ch" }}>
          Meet your song&rsquo;s emotional signature.
        </h2>

        <div className="si-reveal-grid">
          <div className="si-specimen">
            <div className="si-specimen-head">
              <div className="si-artwork" aria-hidden>
                Artwork
              </div>
              <div>
                <p className="si-specimen-title">Long Way Down</p>
                <p className="si-specimen-artist">by Wren Adler</p>
                <p className="si-specimen-mode">Ready mode &middot; EPI 84</p>
              </div>
            </div>
            <div className="si-axes">
              {axes.map((a) => (
                <div key={a.name} className="si-axis">
                  <span className="si-axis-name">{a.name}</span>
                  <span className="si-axis-track">
                    <span
                      className="si-axis-fill"
                      style={{ width: `${a.score}%`, background: a.color, display: "block" }}
                    />
                  </span>
                  <span className="si-axis-score">{a.score}</span>
                </div>
              ))}
            </div>
            <p className="si-signature">
              A song that keeps pushing forward without ever getting loud about
              it.
            </p>
            <p
              className="si-dims-note"
              style={{ color: "rgba(251,251,244,0.45)", fontSize: "0.76rem", marginTop: 18 }}
            >
              Example output. Values shown are illustrative, not a real scan.
            </p>
          </div>

          <div>
            <div className="si-boundary">
              <div>
                <p className="si-boundary-head">Free, on the first scan</p>
                <ul>
                  {FREE_ITEMS.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
              <div className="si-boundary-paid">
                <p className="si-boundary-head si-boundary-head-y">
                  In the full report
                </p>
                <ul>
                  {PAID_ITEMS.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="si-transition">
              That tells you what the song is doing. The full report tells you
              what to do with it.
            </p>
            <Link href="/scan" className="btn btn-y" style={{ marginTop: 26 }}>
              Unlock the full Song Intelligence
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Six movements ───────────────────────────────────────────────────────────
function Movements() {
  return (
    <section className="si-sec si-paper">
      <div className="wrap">
        <p className="si-kicker">The full report</p>
        <div className="si-split si-split-end">
          <h2 className="si-h2" style={{ fontWeight: 400, maxWidth: "16ch" }}>
            Turn the signal into a position.
          </h2>
          <p className="si-body" style={{ maxWidth: "46ch", margin: 0 }}>
            The movements that take you from &ldquo;Here&rsquo;s my song&rdquo;
            to &ldquo;Here&rsquo;s what this song does, the moments it fits, and
            how I should talk about it.&rdquo;
          </p>
        </div>
        <div className="si-moves">
          {MOVEMENTS.map((m) => (
            <div key={m.n} className="si-move">
              <p className="si-move-n">{m.n}</p>
              <p className="si-move-title">{m.title}</p>
              <p className="si-move-body">{m.body}</p>
            </div>
          ))}
        </div>
        <p className="si-moves-note">
          It is built to be saved, screenshotted, and sent to someone who needs
          to understand the song in thirty seconds.
        </p>
      </div>
    </section>
  );
}

// ─── Sync application ────────────────────────────────────────────────────────
// Sync is framed as an application of the intelligence. No briefs, no demand,
// no claim about what any supervisor will choose.
function Sync() {
  return (
    <section className="si-sec si-plum si-sync">
      <div className="wrap">
        <p className="si-kicker">For sync</p>
        <div className="si-sync-grid">
          <h2 className="si-h2">
            Give people a reason to know where your song fits.
          </h2>
          <div className="si-split-prose">
            <p className="si-body">
              You know your business. We are not going to explain the room to
              you, or guess what anyone will say yes to.
            </p>
            <p className="si-body">
              CHRP gives creators a more precise way to explain the emotional
              job their music can do. What you do with that is your work, not
              ours.
            </p>
            <p className="si-quote">
              The easier a song is to understand and position, the easier it is
              to advocate for.
            </p>
            <Link href="/scan" className="btn btn-y" style={{ marginTop: 30 }}>
              Scan a song
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Catalog progression ─────────────────────────────────────────────────────
function Catalog() {
  return (
    <section className="si-sec si-rule-top">
      <div className="wrap">
        <p className="si-kicker">Creator Intelligence</p>
        <div className="si-split si-split-end">
          <h2 className="si-h2" style={{ color: "var(--paper)", maxWidth: "18ch" }}>
            One song tells you something. A catalog tells you who you are.
          </h2>
          <p className="si-body" style={{ maxWidth: "46ch", margin: 0 }}>
            Analyse multiple tracks and patterns can begin to emerge across a
            body of work. Each song you add changes what the others mean.
          </p>
        </div>
        <div className="si-stages">
          {STAGES.map((s, i) => (
            <div key={s.name} className={`si-stage si-stage-${i + 1}`}>
              <p className="si-stage-count">{s.count}</p>
              <p className="si-stage-name">{s.name}</p>
              <p className="si-stage-q">{s.question}</p>
              <p className="si-body si-stage-body">{s.body}</p>
            </div>
          ))}
        </div>
        <p
          className="si-body"
          style={{ margin: "clamp(28px,3.4vw,44px) 0 0", maxWidth: "56ch" }}
        >
          The catalog becomes something you understand, not something you have
          accumulated.
        </p>
        <Link href="/scan" className="btn btn-y" style={{ marginTop: 26 }}>
          Understand your catalog
        </Link>
      </div>
    </section>
  );
}

// ─── Pricing ─────────────────────────────────────────────────────────────────
// Two tiers, stated flat. No badges, no crossed-out pricing, no "most chosen",
// no subscription language — the catalog tier is a different product, not a
// volume discount.
function Pricing() {
  return (
    <section id="pricing" className="si-sec si-paper">
      <div className="wrap">
        <p className="si-kicker">Pricing</p>
        <h2 className="si-h2" style={{ fontWeight: 400, maxWidth: "20ch" }}>
          Price one song. Or understand the whole catalog.
        </h2>

        <div className="si-tiers">
          <div className="si-tier">
            <p className="si-tier-kicker">Single song</p>
            <p className="si-tier-name">Full Song Intelligence</p>
            <p className="si-tier-price">$19</p>
            <p className="si-tier-unit">One song</p>
            <ul>
              {SINGLE_INCLUDES.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <Link href="/scan" className="btn btn-ghost">
              Unlock this song
            </Link>
          </div>

          <div className="si-tier si-tier-dark">
            <p className="si-tier-kicker">Creator catalog &middot; up to 10 songs</p>
            <p className="si-tier-name">Creator Intelligence</p>
            <p className="si-tier-price">$149</p>
            <p className="si-tier-unit">Up to 10 songs</p>
            <ul>
              {CATALOG_INCLUDES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Link href="/scan" className="btn btn-y">
              Understand your catalog
            </Link>
          </div>
        </div>

        <p className="si-terms">
          First scan free. Report access runs 60 days on a single song and 12
          months on a catalog. Creator profile unlocks at eight scans within a
          catalog.
        </p>
      </div>
    </section>
  );
}

// ─── Closing ─────────────────────────────────────────────────────────────────
function Closing() {
  return (
    <section className="si-closing">
      <div className="wrap">
        <p className="si-closing-over">You cannot control who says yes.</p>
        <h2>You already made the song. Now understand what you made.</h2>
        <p>
          See its emotional signature. Understand where it belongs. Give
          yourself better language for what comes next.
        </p>
        <p className="si-quote">
          Give the song every chance to find its moment.
        </p>
        <Link href="/scan" className="btn btn-y">
          Scan your first song &mdash; free
        </Link>
        <p className="si-hero-note">No credit card.</p>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="CHRP home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/chrp-logo.svg" alt="CHRP" />
        </Link>
        <div className="links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/methodology">Methodology</Link>
        </div>
        <span className="cr">
          &copy; 2026 CHRP &middot; Let music move you.
        </span>
      </div>
    </footer>
  );
}
