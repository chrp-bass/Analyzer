import { ScanInput } from "@/components/ScanInput";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader showCta={false} />
      <section className="flex-1 px-6 md:px-10 py-12 md:py-20 max-w-[680px] mx-auto w-full">
        <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-3">
          Step 1 of 3
        </div>
        <h1 className="font-display font-bold text-[36px] md:text-[56px] leading-[0.98] text-chrp-black display-tight">
          Paste a Spotify link.
        </h1>
        <p className="font-display italic text-[16px] md:text-[18px] text-ink-soft mt-4 max-w-[40ch]">
          We&rsquo;ll resolve the track, read its emotional fingerprint, and
          place it on the CHRP grid in about ten seconds.
        </p>
        <div className="mt-10">
          <ScanInput />
        </div>
        <p className="mt-8 font-sans text-[11px] text-ink-light">
          Don&rsquo;t have a link handy? Try{" "}
          <span className="text-ink-soft">thunderstruck</span>,{" "}
          <span className="text-ink-soft">metallica nothing else matters</span>,
          or paste any text — the demo will pick a sample track.
        </p>
      </section>
    </div>
  );
}
