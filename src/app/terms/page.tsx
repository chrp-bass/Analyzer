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
              will be updated before general availability.
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
              Your first scan is free. Additional single scans are $19; the
              catalog tier is $149 for up to ten tracks over twelve months.
              See <Link href="/scan">/scan</Link> to start. Refund requests
              within seven days of purchase are honored while beta is active.
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
