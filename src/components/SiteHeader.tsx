import Link from "next/link";

export function SiteHeader({
  ctaHref = "/scan",
  ctaLabel = "Scan your song",
  showCta = true,
}: {
  ctaHref?: string;
  ctaLabel?: string;
  showCta?: boolean;
}) {
  return (
    <header className="flex items-center justify-between px-6 md:px-10 py-4 border-b border-rule">
      <Link
        href="/"
        className="font-sans font-black text-[14px] tracking-wider text-chrp-black"
      >
        CHRP
      </Link>
      <nav className="flex items-center gap-4 md:gap-6">
        <Link
          href="/methodology"
          className="hidden md:inline font-sans text-[11px] tracking-wider uppercase text-ink-soft hover:text-chrp-black"
        >
          Methodology
        </Link>
        <Link
          href="/dashboard"
          className="font-sans text-[11px] tracking-wider uppercase text-ink-soft hover:text-chrp-black"
        >
          Dashboard
        </Link>
        {showCta && (
          <Link
            href={ctaHref}
            className="font-sans font-bold text-[11px] tracking-wider uppercase bg-chrp-black text-chrp-white px-4 py-2 hover:bg-ink-soft"
          >
            {ctaLabel}
          </Link>
        )}
      </nav>
    </header>
  );
}
