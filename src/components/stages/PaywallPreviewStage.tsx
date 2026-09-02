"use client";

import { FreeReport, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";

export function PaywallPreviewStage({
  report,
}: {
  report: FreeReport;
  trackSlug?: string;
}) {
  const vertices = polygonFromChrpScores(report.chrp_scores);
  const chip = MODE_COLORS[report.epi.mode];

  return (
    <div className="chrp-report relative min-h-screen overflow-hidden">
      {/* The blurred full report that used to sit here is gone. Rendering paid
          intelligence and obscuring it with CSS is not a boundary — the text
          is still in the page. The locked design states the boundary as a
          list instead; see the reveal's Boundary component. */}

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
            className="mode-pill mt-4"
            style={{ backgroundColor: chip.chipBg, color: chip.chipText }}
          >
            <span className="font-sans font-bold text-[13px]">
              {report.epi.mode} mode
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
