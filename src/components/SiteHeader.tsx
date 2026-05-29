import Link from "next/link";

/**
 * Shared site header. Mirrors the homepage's <Nav> exactly so the look of
 * every non-homepage marketing/utility page reads as one system: dark glass
 * background, real CHRP logo SVG, gold-outline "Scan your song" CTA.
 */
export function SiteHeader({
  showCta = true,
  ctaHref = "/scan",
  ctaLabel = "Scan your song",
}: {
  showCta?: boolean;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <header className="nav">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="CHRP home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/chrp-logo.svg" alt="CHRP" />
        </Link>
        {showCta && (
          <Link href={ctaHref} className="btn-nav">
            {ctaLabel} <span aria-hidden>&rarr;</span>
          </Link>
        )}
      </div>
    </header>
  );
}
