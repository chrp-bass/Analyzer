import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "CHRP // Privacy",
};

export default function PrivacyPage() {
  return (
    <div className="product-shell">
      <SiteHeader />
      <main>
        <section className="page-hero">
          <div className="wrap">
            <span className="eyebrow">Privacy</span>
            <h1>What we hold, and what we don&rsquo;t.</h1>
            <p className="sub">
              CHRP&rsquo;s formal privacy policy is in review. This page will be
              updated before general availability on July 1.
            </p>
          </div>
        </section>

        <section className="page-band">
          <div className="wrap" style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 18 }}>
              While CHRP is in beta we collect only what&rsquo;s needed to
              return your report: the track identifier you submit, the email
              address you use to receive it, and the scan history tied to your
              browser. We do not sell or share that data. We do not run
              third-party analytics or ad trackers on the scan flow, the
              paywall, or the report itself.
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 18 }}>
              Scans live in your browser via localStorage until you clear them.
              You can reset your demo state at any time from the dashboard
              (&ldquo;Reset demo state&rdquo; at the bottom).
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.7 }}>
              Questions or requests?{" "}
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
