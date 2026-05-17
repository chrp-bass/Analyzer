"use client";

import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { Track } from "@/lib/fixtures/tracks";
import { ReportDocument } from "@/components/ReportDocument";
import { Rule } from "@/components/primitives";
import { ArrowDown } from "lucide-react";

export function ReportViewClient({ track }: { track: Track }) {
  const filename = `chrp-report-${track.id}.pdf`;

  return (
    <section className="px-6 md:px-12 py-12 md:py-16 flex-1 flex flex-col">
      <div className="max-w-5xl w-full mx-auto">
        <div className="smallcaps-mono text-accent mb-3">PDF REPORT</div>
        <h1
          className="font-serif font-black display-tight text-[44px] md:text-[64px]"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          {track.title}
        </h1>
        <p className="font-serif italic text-[18px] md:text-[22px] text-ink-soft mt-2">
          by {track.artist}
        </p>

        <Rule className="my-8" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <p className="text-ink-soft max-w-[58ch] leading-relaxed">
            One page, US Letter. Print it, email it, AirDrop it. Set in
            Fraunces and Space Grotesk. Designed to live in a tour booklet,
            not a dashboard.
          </p>

          <PDFDownloadLink
            document={<ReportDocument track={track} />}
            fileName={filename}
            className="group inline-flex items-center gap-3 px-6 py-3 bg-ink text-paper hover:bg-accent transition-colors smallcaps tracking-[0.18em] whitespace-nowrap"
          >
            {({ loading }) =>
              loading ? (
                <>Preparing PDF…</>
              ) : (
                <>
                  Download PDF{" "}
                  <ArrowDown
                    size={16}
                    className="group-hover:translate-y-0.5 transition-transform"
                  />
                </>
              )
            }
          </PDFDownloadLink>
        </div>

        <div className="bg-rule/30 border border-rule h-[700px] md:h-[820px] w-full">
          <PDFViewer
            width="100%"
            height="100%"
            showToolbar={false}
            style={{ border: "none" }}
          >
            <ReportDocument track={track} />
          </PDFViewer>
        </div>
      </div>
    </section>
  );
}
