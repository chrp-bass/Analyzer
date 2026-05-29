import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ContactForm } from "@/components/ContactForm";

export const dynamic = "force-dynamic";

export default function ContactPage() {
  return (
    <div className="product-shell">
      <SiteHeader />
      <main>
        <section className="page-hero">
          <div className="wrap">
            <span className="eyebrow">Bulk access</span>
            <h1>Tell us about your catalog needs.</h1>
            <p className="sub">
              Labels, agencies, A&amp;R teams, and sync-active management
              firms. Leave your email and we&rsquo;ll get back to you about
              volume pricing and white-label exports.
            </p>
          </div>
        </section>

        <section className="page-band" style={{ paddingBottom: 96 }}>
          <div className="wrap" style={{ maxWidth: 560 }}>
            <ContactForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
