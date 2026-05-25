import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const dynamic = "force-dynamic";

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col bg-chrp-white text-chrp-black">
      <header className="flex items-center justify-between px-5 md:px-10 py-4 border-b border-rule">
        <Link
          href="/"
          className="font-sans font-black text-[14px] tracking-wider text-chrp-black"
        >
          CHRP
        </Link>
        <Link
          href="/scan"
          className="font-sans font-bold text-[11px] md:text-[12px] tracking-wider uppercase bg-chrp-black text-chrp-white px-4 py-2 hover:bg-ink-soft"
        >
          Scan your song <span aria-hidden>→</span>
        </Link>
      </header>

      <main className="flex-1 px-5 md:px-10 py-16 md:py-24">
        <div className="max-w-[560px] mx-auto w-full">
          <div className="font-sans font-black text-[10px] tracking-[0.18em] uppercase text-ink-light mb-5">
            Bulk access
          </div>
          <h1 className="font-display font-bold text-[36px] md:text-[52px] leading-[1.05] text-chrp-black display-tight">
            Tell us about your catalog needs.
          </h1>
          <p className="mt-5 font-sans text-[15px] md:text-[16px] leading-[1.6] text-ink-soft">
            Labels, agencies, A&amp;R teams, and sync-active management firms.
            Leave your email and we&rsquo;ll get back to you about volume
            pricing and white-label exports.
          </p>

          <div className="mt-10">
            <ContactForm />
          </div>
        </div>
      </main>

      <footer className="border-t border-rule px-5 md:px-10 py-6">
        <div className="max-w-[920px] mx-auto w-full font-sans text-[11px] md:text-[12px] text-ink-light">
          Scored by CHRP &nbsp;//&nbsp; scan.chrp.ai
        </div>
      </footer>
    </div>
  );
}
