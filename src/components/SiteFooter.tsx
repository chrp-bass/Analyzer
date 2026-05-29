import Link from "next/link";

/**
 * Shared site footer. Mirrors the homepage's <Footer>: dark, logo on the
 * left, three text links (Privacy / Terms / Methodology), copyright tagline.
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
          <Link href="/methodology">Privacy</Link>
          <Link href="/methodology">Terms</Link>
          <Link href="/methodology">Methodology</Link>
        </div>
        <span className="cr">
          &copy; 2026 CHRP &middot; Let music move you.
        </span>
      </div>
    </footer>
  );
}
