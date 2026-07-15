import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "CHRP // Terms",
};

export default function TermsPage() {
  return (
    <div className="product-shell">
      <SiteHeader />
      <main>
        <section className="page-hero">
          <div className="wrap">
            <span className="eyebrow">Terms</span>
            <h1>The short version.</h1>
            <p className="sub">
              CHRP&rsquo;s formal terms of service are in review. This page
              will be updated before general availability on July 1.
            </p>
          </div>
        </section>

        <section className="page-band">
          <div className="wrap" style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 18 }}>
              CHRP is a behavioral scoring tool for working musicians and the
              professionals around them. Reports describe how a track behaves
              relative to the CHRP corpus and the live sync market. They are a
              decision aid, not a forecast &mdash; market conditions shift and
              a placement outcome depends on many things outside the score.
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 18 }}>
              During beta (through June 30), scans are free with the promo
              code. Paid tiers listed at{" "}
              <Link href="/scan">/scan</Link> take effect July 1. Refund
              requests within seven days of purchase are honored while beta
              is active.
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.7 }}>
              Questions?{" "}
              <Link href="/contact">Get in touch</Link>.
            </p>
            <div style={{ marginTop: 36 }}>
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
