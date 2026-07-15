import Link from "next/link";

const CTA_FREE = "Scan your first track — free";
const CTA_FREE_LONG = "Scan your first track — free through August 31";

export function MarketingLanding() {
  return (
    <>
      <Nav />
      <Hero />
      <Manifesto />
      <RecognitionMoment />
      <Pillars />
      <ConversationAndWalkaway />
      <Pricing />
      <Audience />
      <Kicker />
      <Closing />
      <Marquee />
      <Footer />
    </>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="nav">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="CHRP home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/chrp-logo.svg" alt="CHRP" />
        </Link>
        <Link href="/scan" className="btn-nav">
          Scan your song &rarr;
        </Link>
      </div>
    </header>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="hero grain">
      <div className="hero-bg">
        <span className="g1" />
        <span className="g2" />
      </div>
      <div className="wrap">
        <div className="hero-left">
          <div className="hero-eyebrow fu d1">
            <span className="eyebrow">Sync Intelligence</span>
          </div>
          <h1 className="fu d2">
            Your song is ready.
            <br />
            The room <em>doesn&rsquo;t know it yet.</em>
          </h1>
          <p className="sub fu d3">
            Give it a position. Give it a language. <b>Give it a shot.</b>
          </p>
          <div className="hero-cta fu d4">
            <Link href="/scan" className="btn btn-y">
              {CTA_FREE}
            </Link>
            <span className="hero-note">
              Free through August 31 &middot; one 10-second scan
            </span>
          </div>
        </div>
        <div className="reveal fu d5">
          <div className="photo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/graphics/hero-artist-aura.png"
              alt=""
              aria-hidden
            />
          </div>
          <div className="epi-card">
            <div className="epi-top">
              <span className="epi-lab">EPI Score</span>
              <span className="chip chip-ready">Ready</span>
            </div>
            <div className="epi-num">
              87<span>/100</span>
            </div>
            <div className="epi-rows">
              <div className="epi-row">
                <span className="k">Verdict</span>
                <span className="v">Pitch now</span>
              </div>
              <div className="epi-row">
                <span className="k">Sync demand</span>
                <span className="v">Athletic &middot; High</span>
              </div>
              <div className="epi-row">
                <span className="k">Closest sibling</span>
                <span className="v">Sigur R&oacute;s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Manifesto ──────────────────────────────────────────────────────────────
function Manifesto() {
  return (
    <section className="cream manifesto gap-1">
      <div className="wrap col">
        <span className="eyebrow">The gap</span>
        <h2
          className="shead"
          style={{
            margin: "14px 0 28px",
            fontSize: "clamp(28px,3.2vw,40px)",
            lineHeight: 1.1,
          }}
        >
          You can see the numbers move. You can&rsquo;t see the brief that&rsquo;s
          looking for you.
        </h2>
        <p className="lead">
          Streams, playlists, trail-runners who found your track, gym-goers who
          added it. The numbers are moving. What you can&rsquo;t see is the
          brief actively hunting for exactly this sound right now &mdash; or the
          forty words that make the supervisor running it write your name down.
        </p>
        <p className="pull">
          Supervisors don&rsquo;t pass on bad music. They pass on music they
          can&rsquo;t place.
        </p>
        <p className="lead close">
          That intelligence has always lived inside labels, publishers, and sync
          agencies. <b>CHRP puts it in your hands.</b>
        </p>
      </div>
    </section>
  );
}

// ─── Recognition Moment ─────────────────────────────────────────────────────
function RecognitionMoment() {
  return (
    <section className="cream moment gap-2">
      <div className="wrap">
        <span className="eyebrow">The recognition moment</span>
        <p className="intro">
          You&rsquo;ve said some version of this about your own track. Every
          artist has.
        </p>
        <div className="qgrid">
          <div className="qbox before">
            <span className="qlabel">Without CHRP</span>
            <p className="qtext">
              &ldquo;It&rsquo;s kind of cinematic. Kind of indie. It has this
              melancholy-but-hopeful feeling &mdash; maybe a TV show, maybe a
              car commercial?&rdquo;
            </p>
          </div>
          <div className="qbox after">
            <span className="qlabel">With CHRP</span>
            <p className="qtext">
              &ldquo;Ready mode. Top 6% Motivation. Strongest active brief
              demand in athletic and performance right now. Closest sync sibling
              to Sigur R&oacute;s in prestige sport documentary. Here&rsquo;s
              the throughline.&rdquo;
            </p>
          </div>
        </div>
        <p className="verdict">One of these gets written down.</p>
      </div>
    </section>
  );
}

// ─── Pillars ─────────────────────────────────────────────────────────────────
function Pillars() {
  return (
    <section className="pillars grain">
      <div className="wrap">
        <div className="shead">
          <span className="eyebrow">Why position matters</span>
          <h2>CHRP doesn&rsquo;t analyze your song. It positions it.</h2>
        </div>
        <div className="pcards">
          <div className="pcard c1">
            <span className="n">01</span>
            <div className="h3wrap">
              <h3>Your song has a position.</h3>
              <p>
                Not a vibe &mdash; a coordinate. Scored against a corpus mapped
                to real commercial outcomes. The number isn&rsquo;t an opinion.
                It&rsquo;s where your song lives in the market right now.
              </p>
            </div>
          </div>
          <div className="pcard c2">
            <span className="n">02</span>
            <div className="h3wrap">
              <h3>Your catalog has a signature.</h3>
              <p>
                Scan eight tracks and your pattern emerges &mdash; emotional
                consistency, signature shape, reliability across your body of
                work. The intelligence that defines a career, not a release.
              </p>
            </div>
          </div>
          <div className="pcard c3">
            <span className="n">03</span>
            <div className="h3wrap">
              <h3>The market is live.</h3>
              <p>
                Active briefs. Real demand signals. Refreshed weekly. Stop
                pitching last quarter&rsquo;s market and start pitching the one
                that&rsquo;s open right now.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Conversation + Walkaway ────────────────────────────────────────────────
function ConversationAndWalkaway() {
  const items: { bold: string; rest: string }[] = [
    {
      bold: "Mode & EPI Score",
      rest: "exactly what kind of track you made.",
    },
    {
      bold: "Pitch-readiness verdict",
      rest: "Pitch now, Develop, or Hold, with the reasoning.",
    },
    {
      bold: "Dr. Rhodes' analysis",
      rest: "where it lives commercially and what to avoid.",
    },
    {
      bold: "Three placements",
      rest: "written in the language supervisors actually use.",
    },
    {
      bold: "A throughline",
      rest: "you can paste into any pitch email today.",
    },
    {
      bold: "Live market signal",
      rest: "on where active brief demand sits right now.",
    },
  ];
  return (
    <section className="deep">
      <div className="wrap">
        <div className="conv">
          <span className="eyebrow">The next conversation</span>
          <p style={{ marginTop: 16 }}>
            Picture the next call you have with a music supervisor. They ask
            what the track is for. You don&rsquo;t reach for genre labels or
            &ldquo;it has that cinematic feel.&rdquo;
          </p>
          <div className="spoken">
            &ldquo;Ready mode. Top 8% Motivation &mdash; Develop or Hold, with
            the reasoning. Three placements written in the language supervisors
            use. A throughline I can paste into any pitch email today. Live
            signal on where active brief demand is right now.&rdquo;
          </div>
          <p>
            <b>They write something down.</b>
          </p>
        </div>
        <p className="namestmt">
          That feeling has a name. It&rsquo;s called knowing what you have
          &mdash; <em>and CHRP gives it to you.</em>
        </p>

        <div className="walk">
          <span className="eyebrow">
            One scan &middot; ten seconds &middot; you walk away with
          </span>
          <div className="wgrid">
            {items.map((it) => (
              <div key={it.bold} className="witem">
                <span className="ck">&#10003;</span>
                <span>
                  <b>{it.bold}</b> &mdash; {it.rest}
                </span>
              </div>
            ))}
          </div>
          <p className="close">
            Everything you need to walk into any room like you already know the
            answer.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing (5 tiers) ──────────────────────────────────────────────────────
function Pricing() {
  return (
    <section className="cream pricing gap-2">
      <div className="wrap">
        <div className="shead">
          <span className="eyebrow">Pricing</span>
          <h2>Price one track. Or position the whole catalog.</h2>
        </div>
        <div className="tiers">
          <div className="tier">
            <span className="teyebrow">Single scan</span>
            <div className="tprice">$29</div>
            <p className="tdesc">
              One track. Know exactly what it is, where it belongs, and how to
              pitch it.
            </p>
            <ul className="tfeat">
              <li>Full report, 60-day access</li>
              <li>Pitch verdict &amp; analysis</li>
              <li>Live market signal</li>
            </ul>
            <Link href="/scan" className="btn btn-ghost">
              Start a scan
            </Link>
          </div>
          <div className="tier feat">
            <span className="tbadge">Most chosen</span>
            <span className="teyebrow">Catalog</span>
            <div className="tprice">
              <span className="pre">from</span>$149
            </div>
            <p className="tdesc">
              Scan eight tracks and your creator profile unlocks &mdash; the
              intelligence managers have, without one.
            </p>
            <ul className="tfeat">
              <li>Per-track catalog rate</li>
              <li>Signature &amp; consistency notes</li>
              <li>Creator profile</li>
            </ul>
            <Link href="/scan" className="btn btn-y">
              {CTA_FREE}
            </Link>
          </div>
          <div className="tier">
            <span className="teyebrow">Extended catalog</span>
            <div className="tprice">$299</div>
            <p className="tdesc">
              Full discography. Forty tracks. Complete catalog positioning.
            </p>
            <ul className="tfeat">
              <li>Up to 40 tracks</li>
              <li>Full profile</li>
              <li>Career-arc view</li>
            </ul>
            <Link href="/scan" className="btn btn-ghost">
              Position my catalog
            </Link>
          </div>
          <div className="tier">
            <span className="teyebrow">Manager roster</span>
            <div className="tprice">$499</div>
            <p className="tdesc">
              Scan your full roster and see who to lead with this quarter
              &mdash; against which active briefs.
            </p>
            <ul className="tfeat">
              <li>Multiple artists</li>
              <li>Ranked pitch priorities</li>
              <li>Brief matching</li>
            </ul>
            <Link href="/scan" className="btn btn-ghost">
              Scan the roster
            </Link>
          </div>
          <div className="tier">
            <span className="teyebrow">Annual unlimited</span>
            <div className="tprice">
              $999<small>/yr</small>
            </div>
            <p className="tdesc">
              For labels, agencies, and sync-active firms. Unlimited scans,
              white-label exports.
            </p>
            <ul className="tfeat">
              <li>Unlimited scans</li>
              <li>White-label exports</li>
              <li>Priority engine access</li>
            </ul>
            <Link href="/contact" className="btn btn-ghost">
              Talk to us
            </Link>
          </div>
        </div>
        <p className="pnote">Free through August 31. Pricing starts September 1.</p>
      </div>
    </section>
  );
}

// ─── Audience ────────────────────────────────────────────────────────────────
function Audience() {
  return (
    <section className="cream aud">
      <div className="wrap">
        <span className="eyebrow">You&rsquo;re not the only one who scans</span>
        <div className="acols">
          <div className="acol">
            <h4>Producers</h4>
            <p>
              Scan during the creative process &mdash; not after. Know where a
              track is headed before it&rsquo;s finished.
            </p>
          </div>
          <div className="acol">
            <h4>Managers</h4>
            <p>
              Ranked pitch priorities across your full roster against live
              briefs. See who to lead with this quarter.
            </p>
          </div>
          <div className="acol">
            <h4>A&amp;R</h4>
            <p>
              Pre-commitment intelligence before the signing meeting.{" "}
              <Link href="/contact">
                Let&rsquo;s talk about bulk access &rarr;
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Kicker band ─────────────────────────────────────────────────────────────
function Kicker() {
  return (
    <section className="kick">
      <div className="wrap">
        <p>
          Every week you pitch without this, you&rsquo;re asking supervisors to
          do your positioning work for you. <b>Most won&rsquo;t.</b>
        </p>
      </div>
    </section>
  );
}

// ─── Closing ─────────────────────────────────────────────────────────────────
function Closing() {
  return (
    <section className="close-sec grain">
      <span className="g" />
      <div className="wrap">
        <h2>
          You already know your music is good.
          <br />
          Now know what it&rsquo;s worth.
        </h2>
        <Link href="/scan" className="btn btn-y">
          {CTA_FREE_LONG}
        </Link>
        <p className="hero-note">No credit card. One 10-second scan.</p>
      </div>
    </section>
  );
}

// ─── Marquee with chrp-icon separator ────────────────────────────────────────
function Marquee() {
  const segments = [
    "Score your song",
    "Find Your Frequency",
    "Let music move you",
    "Score your song",
    "Find Your Frequency",
    "Let music move you",
  ];
  return (
    <div className="mq" aria-hidden>
      <div className="mq-t">
        {segments.map((s, i) => (
          <span key={i}>
            {s}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/icon/chrp-icon.png"
              alt=""
              className="mq-icon"
            />
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <Link href="/" className="logo">
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
