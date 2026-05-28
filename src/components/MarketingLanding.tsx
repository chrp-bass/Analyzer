"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const CTA_LABEL = "Scan your first track — free through June 30";

export function MarketingLanding() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <GapSection />
        <RecognitionSection />
        <PillarsSection />
        <SuccessSection />
        <EpiInstrumentSection />
        <PricingSection />
        <SegmentsSection />
        <FinalCta />
      </main>
      <Marquee />
      <ReportTieBack />
      <SiteFooter />
    </div>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
function SiteNav() {
  return (
    <nav className="site-nav">
      <Link href="/" className="logo-slot" aria-label="CHRP home">
        {/* Real CHRP logo SVG served from public/brand/. */}
        <img src="/brand/logo/chrp-logo.svg" alt="CHRP" height={24} />
      </Link>
      <Link href="/scan" className="nav-cta">
        Scan your song <span aria-hidden>→</span>
      </Link>
    </nav>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="hero">
      <Aura />
      <div className="grain" />
      <div className="w hero-grid">
        <div>
          <span className="eyebrow reveal" style={{ animationDelay: "0.05s" }}>
            Emotional intelligence for music
          </span>
          <h1 className="display reveal" style={{ animationDelay: "0.15s" }}>
            Your song is ready.
            <br />
            The room doesn&rsquo;t <em>know it yet.</em>
          </h1>
          <p className="hero-sub reveal" style={{ animationDelay: "0.30s" }}>
            Give it a position. Give it a language. Give it a shot.
          </p>
          <p className="hero-def reveal" style={{ animationDelay: "0.40s" }}>
            Your EPI Score is your track&rsquo;s emotional signature, scored
            against a live commercial corpus. Not a vibe. A coordinate.
          </p>
          <div className="hero-ctas reveal" style={{ animationDelay: "0.50s" }}>
            <Link href="/scan" className="btn btn-y">
              {CTA_LABEL}
            </Link>
            <Link href="/?stage=unlocked&amp;track=redline" className="btn btn-ghost">
              See a sample report
            </Link>
          </div>
        </div>
        <div className="reveal" style={{ animationDelay: "0.35s" }}>
          <div className="portrait">
            {/* Real aura-treated hero photo. object-fit:cover + soft left mask
                applied in globals.css. Parent .portrait is position:relative. */}
            <img
              src="/brand/graphics/hero-artist-aura.png"
              alt=""
              className="photo"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// Blob positions are controlled by the parent's .hero or .final scope in
// globals.css, so the Aura component itself takes no props.
function Aura() {
  return (
    <div className="aura" aria-hidden>
      <span className="b-mag drift1" />
      <span className="b-blue drift2" />
      <span className="b-warm drift1" />
      <span className="b-gold drift2" />
    </div>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────
function GapSection() {
  return (
    <section className="band gap">
      <div className="w">
        <p>
          You can see your streams. You can see your playlists. You know trail
          runners found your track and gym-goers added it to their sets. The
          numbers are moving.
        </p>
        <div className="punch display">
          Supervisors don&rsquo;t pass on bad music. They pass on music they
          can&rsquo;t place.
        </div>
        <div className="close">
          The intelligence that closes that gap has always lived inside labels,
          publishing companies, and sync agencies.
          <br />
          <br />
          <b>CHRP puts it in your hands.</b>
        </div>
      </div>
    </section>
  );
}

function RecognitionSection() {
  return (
    <section className="band">
      <div className="w">
        <span className="eyebrow dim">The recognition moment</span>
        <p className="recog-intro">
          You&rsquo;ve said some version of this. Every artist has.
        </p>
        <div className="qbox before">
          <div className="qlabel">Without CHRP</div>
          <blockquote>
            &ldquo;It&rsquo;s kind of cinematic. Kind of indie. It has this
            melancholy but hopeful feeling, I think it could work for a TV show
            or maybe a car commercial.&rdquo;
          </blockquote>
        </div>
        <div className="qbox after">
          <div className="qlabel">With CHRP</div>
          <blockquote>
            &ldquo;Ready mode. Top 6% Motivation. Strongest active brief demand
            in athletic and performance right now. Closest sync sibling to Sigur
            R&oacute;s in prestige sport documentary. Here&rsquo;s the
            throughline.&rdquo;
          </blockquote>
        </div>
        <div className="recog-closer display">
          One of these gets written down.
        </div>
        <Link href="/scan" className="btn btn-y">
          {CTA_LABEL}
        </Link>
      </div>
    </section>
  );
}

function PillarsSection() {
  return (
    <section className="band pillars">
      <div className="w">
        <span className="eyebrow dim">Why the engine matters</span>
        <h2 className="display kicker">
          CHRP doesn&rsquo;t analyze your song. CHRP positions it.
        </h2>
        <div className="pgrid">
          <div className="pcard pc1">
            <div className="pn display">01</div>
            <h3>Your song has a position.</h3>
            <p>
              Not a vibe. A coordinate. Scored against a corpus mapped to real
              commercial outcomes. The number isn&rsquo;t an opinion, it&rsquo;s
              where your song lives in the market.
            </p>
          </div>
          <div className="pcard pc2">
            <div className="pn display">02</div>
            <h3>Your catalog has a signature.</h3>
            <p>
              Scan eight tracks and your creative pattern emerges: emotional
              consistency, signature shape, reliability across your body of
              work.
            </p>
          </div>
          <div className="pcard pc3">
            <div className="pn display">03</div>
            <h3>The market is live.</h3>
            <p>
              Active briefs. Real demand signals. Refreshed weekly. Stop
              pitching last quarter&rsquo;s market and start pitching the one
              open right now.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SuccessSection() {
  return (
    <section className="band success">
      <div className="w">
        <span className="eyebrow dim">The success moment</span>
        <div className="narrative">
          Picture the next conversation with a music supervisor. They ask what
          the track is for. You don&rsquo;t reach for genre labels. You
          don&rsquo;t say <em>&ldquo;it has kind of a cinematic feel.&rdquo;</em>{" "}
          You tell them the mode, the percentile, the live brief it fits.
        </div>
        <div className="pivot">They write something down.</div>
        <div className="closer">
          That feeling has a name.{" "}
          <b>It&rsquo;s called knowing what you have.</b> CHRP gives you that.
        </div>
      </div>
    </section>
  );
}

function EpiInstrumentSection() {
  const [epi, setEpi] = useState(0);
  const [arcOffset, setArcOffset] = useState(653);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const target = 91;
    const duration = 1600;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          const k = 1 - Math.pow(1 - p, 3);
          setEpi(Math.round(k * target));
          setArcOffset(653 - 653 * 0.91 * k);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <section className="band epi" ref={ref}>
      <div className="w">
        <div className="modes-label">Mode classification + EPI scoring</div>
        <div className="epi-wrap">
          <div className="gauge">
            <svg width="230" height="230" viewBox="0 0 230 230">
              <circle
                cx="115"
                cy="115"
                r="104"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="3"
              />
              <circle
                cx="115"
                cy="115"
                r="104"
                fill="none"
                stroke="#E6D74F"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="653"
                strokeDashoffset={arcOffset}
              />
            </svg>
            <div className="num">
              <b>{epi}</b>
              <small>EPI Score</small>
            </div>
          </div>
          <div>
            <div className="chips">
              <span className="chip ready">
                <i />
                Ready
              </span>
              <span className="chip flow">
                <i />
                Flow
              </span>
              <span className="chip recharge">
                <i />
                Recharge
              </span>
              <span className="chip recover">
                <i />
                Recover
              </span>
            </div>
            <p className="epi-detail">
              <b>Top 3% across the corpus. Top 4% in Ready mode.</b> Strongest
              active brief demand in athletic and performance right now. The
              score is the start of the conversation, not the end of it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section className="band">
      <div className="w">
        <span className="eyebrow dim">Pricing</span>
        <div className="prow">
          <div className="pcard2">
            <div className="ptier">Single scan</div>
            <div className="pprice display">$29</div>
            <div className="pdesc">
              One track. Know exactly what it is, where it belongs, and how to
              pitch it. Full report. Sixty-day access.
            </div>
          </div>
          <div className="pcard2 feat">
            <div className="ptier">Artist catalog</div>
            <div className="pprice display">$149</div>
            <div className="pdesc">
              The intelligence that managers have. Now available without one.
            </div>
            <div className="pital">
              Your first scan tells you what you have. Your eighth tells you who
              you are.
            </div>
          </div>
        </div>
        <p className="pnote">Free through June 30 &middot; Pricing starts July 1</p>
      </div>
    </section>
  );
}

function SegmentsSection() {
  return (
    <section className="band">
      <div className="w">
        <div className="seg">
          <div className="segc">
            <div className="segl">Producers</div>
            <p>
              Scan during the creative process, not after. Know where the track
              is headed before it&rsquo;s finished.
            </p>
          </div>
          <div className="segc">
            <div className="segl">Managers</div>
            <p>
              Ranked pitch priorities across your full roster against live
              briefs. See who to lead with this quarter.
            </p>
          </div>
          <div className="segc">
            <div className="segl">A&amp;R</div>
            <p>
              Pre-commitment intelligence. Walk into the signing meeting knowing
              what the catalog is worth commercially.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="final">
      <Aura />
      <div className="grain" />
      <div className="final-inner">
        <div className="stakes">
          Every week you pitch without this is a week you&rsquo;re asking
          supervisors to do your positioning work for you.{" "}
          <em>Most won&rsquo;t.</em>
        </div>
        <h2>
          You already know your music is good.
          <br />
          <em>Now know what it&rsquo;s worth.</em>
        </h2>
        <Link href="/scan" className="btn btn-y">
          {CTA_LABEL}
        </Link>
        <span className="fine">
          Pricing starts July 1 &middot; No credit card required
        </span>
      </div>
    </section>
  );
}

// ─── Marquee with chrp-icon separators ───────────────────────────────────────
function Marquee() {
  // Six segments + six separators per loop, doubled in the CSS via translate(-50%).
  const segments = [
    "Score your song",
    "Find Your Frequency",
    "Let music move you",
    "Score your song",
    "Find Your Frequency",
    "Let music move you",
  ];
  return (
    <div className="chrp-marquee-section" aria-hidden>
      <div className="chrp-marquee-track">
        {segments.map((s, i) => (
          <span key={i}>
            {s}
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

// ─── Report tie-back — cream paper bleed ─────────────────────────────────────
function ReportTieBack() {
  return (
    <>
      <div className="report-lead">
        <span className="eyebrow">The report — intentional contrast</span>
        <div className="sub">
          Moving from the dark instrument into the premium intelligence document
        </div>
      </div>
      <div className="report">
        <div className="report-in">
          <div className="report-meta">
            Emotional intelligence report // No. RDL-052026-VB // v1.0
          </div>
          <div className="report-h">Redline</div>
          <div className="report-by">by Voss Black</div>
          <div className="report-isrc">
            2026.05.20 // 09:14 CST // ISRC GBUM72600412
          </div>
          <span className="report-chip">Ready mode</span>
          <span className="report-sub">Top 4% of catalog in Ready mode</span>
          <div className="report-note">
            &uarr; The report stays cream and sets in Tiempos. The shift from
            dark instrument to light document is the deliberate tie-back to the
            CHRP brand.
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────
function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="ft">Scored by CHRP &nbsp;//&nbsp; scan.chrp.ai</span>
      <span className="ft">
        Behavioral scoring only &middot;{" "}
        <Link href="/methodology">
          Methodology at scan.chrp.ai/methodology
        </Link>
        {" "}&middot;{" "}
        <a href="https://mychrp.ai" target="_blank" rel="noreferrer">
          mychrp.ai
        </a>{" "}
        &middot;{" "}
        <a href="https://chrp.ai" target="_blank" rel="noreferrer">
          chrp.ai
        </a>
      </span>
    </footer>
  );
}
