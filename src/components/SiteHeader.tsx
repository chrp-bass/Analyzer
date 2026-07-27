import Link from "next/link";
import { AuthNavLink } from "@/components/AuthNavLink";

/**
 * Shared site header. Mirrors the homepage's <Nav> exactly so the look of
 * every non-homepage marketing/utility page reads as one system: dark glass
 * background, real CHRP logo SVG, gold-outline "Scan your song" CTA.
 *
 * AuthNavLink adapts the third slot: "Sign in" for signed-out users,
 * "Dashboard" for signed-in users. Suppressed on the signin page itself
 * via showSignIn={false}.
 */
export function SiteHeader({
  showCta = true,
  ctaHref = "/scan",
  ctaLabel = "Scan your song",
  showSignIn = true,
}: {
  showCta?: boolean;
  ctaHref?: string;
  ctaLabel?: string;
  showSignIn?: boolean;
}) {
  return (
    <header className="nav">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="CHRP home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/chrp-logo.svg" alt="CHRP" />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {showSignIn && <AuthNavLink />}
          {showCta && (
            <Link href={ctaHref} className="btn-nav">
              {ctaLabel} <span aria-hidden>&rarr;</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
