"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ReportPayload, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import { ReportPage } from "@/components/ReportPage";
import { getScanById } from "@/lib/scan-id";
import {
  getCurrentUser,
  getUserCredits,
  consumeCatalogCredit,
  markScanPaid,
  recordScan,
} from "@/lib/accounts";

export function ScanPreview({
  report,
  scanId,
  trackSlug,
}: {
  report: ReportPayload;
  scanId: string;
  trackSlug: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "paywall" | "unblurring">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scan = getScanById(scanId);
      if (scan?.paid) {
        if (!cancelled) {
          setPhase("unblurring");
          setTimeout(() => router.push(`/report/${scanId}`), 900);
        }
        return;
      }
      const user = await getCurrentUser();
      if (user) {
        const credits = await getUserCredits(user.id);
        if (
          credits &&
          (credits.trackLimit === null ||
            credits.tracksUsed < credits.trackLimit)
        ) {
          await consumeCatalogCredit(user.id);
          await markScanPaid(user.id, scanId);
          await recordScan(user.id, trackSlug, true, scanId);
          if (!cancelled) {
            setPhase("unblurring");
            setTimeout(() => router.push(`/report/${scanId}`), 900);
          }
          return;
        }
      }
      if (!cancelled) setPhase("paywall");
    })();
    return () => {
      cancelled = true;
    };
  }, [router, scanId, trackSlug]);

  const vertices = polygonFromChrpScores(report.chrp_scores);
  const chip = MODE_COLORS[report.epi.mode];

  const blurStyle =
    phase === "unblurring"
      ? { filter: "blur(0px) opacity(1)", transition: "filter 800ms ease" }
      : {
          filter: "blur(8px) opacity(0.35)",
          transition: "filter 800ms ease",
        };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden={phase !== "unblurring"}
        className="absolute inset-0"
        style={blurStyle}
      >
        <ReportPage report={report} id={scanId} />
      </div>

      <AnimatePresence>
        {phase === "paywall" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative min-h-screen flex flex-col items-center justify-center px-6 py-12"
          >
            <div className="w-full max-w-lg flex flex-col items-center text-center">
              <div className="font-display text-[22px] md:text-[28px] text-chrp-black mb-1">
                {report.track.title}
              </div>
              <div className="font-display italic text-[14px] md:text-[16px] text-ink-soft mb-6">
                by {report.track.artist}
              </div>

              <div className="bg-chrp-white p-3" style={{ boxShadow: "0 0 0 1px var(--rule)" }}>
                <PolygonRadar
                  vertices={vertices}
                  mode={report.epi.mode}
                  epiScore={report.epi.score}
                  size={260}
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

              <div className="mt-8 w-full max-w-md bg-chrp-white border border-rule p-6">
                <div className="font-sans text-[10px] tracking-wider uppercase text-ink-soft text-center">
                  Unlock the full report
                </div>
                <div className="hairline mt-2 mb-5" />
                <button
                  onClick={() => router.push(`/scan/${scanId}/checkout`)}
                  className="w-full font-sans font-bold text-[13px] tracking-wider uppercase bg-chrp-black text-chrp-white px-6 py-4"
                >
                  Unlock this song &mdash; $29
                </button>
                <button
                  onClick={() => router.push(`/scan/${scanId}/tiers`)}
                  className="w-full mt-3 font-sans font-bold text-[13px] tracking-wider uppercase border border-chrp-black text-chrp-black px-6 py-4 hover:bg-oat"
                >
                  Unlock your full catalog &mdash; from $199
                </button>
                <p className="mt-4 font-sans text-[11px] text-ink-light text-center">
                  Catalog tiers include the creator profile when you scan eight
                  tracks.
                </p>
              </div>

              <button
                onClick={() => router.push("/scan")}
                className="mt-6 font-sans text-[11px] tracking-wider uppercase text-ink-light hover:text-chrp-black"
              >
                &larr; Scan a different track
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
