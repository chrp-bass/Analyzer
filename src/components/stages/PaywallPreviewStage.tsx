"use client";

import { ReportPayload, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import { ReportPage } from "@/components/ReportPage";

export function PaywallPreviewStage({
  report,
  trackSlug,
}: {
  report: ReportPayload;
  trackSlug: string;
}) {
  const vertices = polygonFromChrpScores(report.chrp_scores);
  const chip = MODE_COLORS[report.epi.mode];

  return (
    <div className="chrp-report relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ filter: "blur(8px)", opacity: 0.35 }}
      >
        <ReportPage report={report} id={trackSlug} />
      </div>

      <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg flex flex-col items-center text-center">
          <div className="font-display text-[22px] md:text-[28px] text-chrp-black mb-1">
            {report.track.title}
          </div>
          <div className="font-display italic text-[14px] md:text-[16px] text-ink-soft mb-6">
            by {report.track.artist}
          </div>

          <div
            className="bg-chrp-white"
            style={{
              padding: "12px",
              boxShadow: "0 0 0 1px var(--rule)",
            }}
          >
            <PolygonRadar
              vertices={vertices}
              mode={report.epi.mode}
              epiScore={report.epi.score}
              size={280}
            />
          </div>

          <div
            className="mt-4 px-4 py-2"
            style={{ backgroundColor: chip.chipBg, color: chip.chipText }}
          >
            <span className="font-sans font-bold text-[13px]">
              {report.epi.mode} mode
            </span>
          </div>

          <div className="mt-3 font-sans text-[11px] text-ink-soft">
            <span className="font-bold text-kelly-green">
              {report.epi.rank_in_mode}
            </span>{" "}
            of catalog in {report.epi.mode} mode
          </div>
        </div>
      </div>
    </div>
  );
}
