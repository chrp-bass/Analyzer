import Link from "next/link";

/**
 * Shared site footer. Mirrors the homepage's <Footer>: dark, logo on the
 * left, three text links (Privacy / Terms / Methodology), copyright tagline.
 *
 * Privacy and Terms point to the canonical chrp.ai destinations, not to a
 * local copy. CHRP is one company with one legal source of truth; this
 * product does not maintain its own Privacy Policy or Terms of Service. See
 * chrp-footer-legal-governance.md. Methodology stays local — it explains
 * this report's own scores and modes, which chrp.ai does not cover.
 */
export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="CHRP home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/chrp-logo.svg" alt="CHRP" />
        </Link>
        <div className="links">
          <a href="https://chrp.ai/privacy">Privacy</a>
          <a href="https://chrp.ai/terms">Terms</a>
          <Link href="/methodology">Methodology</Link>
        </div>
        <span className="cr">
          &copy; 2026 CHRP &middot; Let music move you.
        </span>
      </div>
    </footer>
  );
}
