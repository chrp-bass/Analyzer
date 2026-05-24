import { ScanInput } from "@/components/ScanInput";
import { SiteHeader } from "@/components/SiteHeader";
import { trackOptions } from "@/lib/fixtures/tracks";

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

        <div className="mt-10">
          <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft mb-3">
            Try one of ours
          </div>
          <div className="hairline mb-4" />
          <ul className="flex flex-col">
            {trackOptions.map((t) => (
              <li
                key={t.id}
                className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-2.5 border-b border-rule"
              >
                <span className="font-display font-bold text-[18px] md:text-[20px] text-chrp-black">
                  {t.label}
                </span>
                <span className="font-sans text-[11px] text-ink-soft">
                  {t.hint}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 font-sans text-[11px] text-ink-light">
            Type any of the names above in the field, paste a Spotify URL, or
            paste any text — the demo will route to one of the six sample
            tracks.
          </p>
        </div>
      </section>
    </div>
  );
}
