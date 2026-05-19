"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ReportPayload, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";

const STATUS_MESSAGES = [
  "Resolving track on Spotify…",
  "Reading emotional fingerprint…",
  "Mapping to CHRP catalog…",
  "Computing EPI Score…",
];

export function ScanProcessing({
  report,
  scanId,
}: {
  report: ReportPayload;
  scanId: string;
  trackSlug: string;
}) {
  const router = useRouter();
  const [statusIndex, setStatusIndex] = useState(0);
  const [showPolygon, setShowPolygon] = useState(false);
  const [showChip, setShowChip] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    [2500, 5000, 7500].forEach((ms, i) => {
      timers.push(setTimeout(() => setStatusIndex(i + 1), ms));
    });
    timers.push(setTimeout(() => setShowPolygon(true), 6000));
    timers.push(setTimeout(() => setShowChip(true), 9500));
    timers.push(
      setTimeout(() => {
        router.push(`/scan/${scanId}/preview`);
      }, 10000),
    );
    return () => timers.forEach(clearTimeout);
  }, [router, scanId]);

  const vertices = polygonFromChrpScores(report.chrp_scores);
  const chip = MODE_COLORS[report.epi.mode];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-3">
          CHRP &nbsp;//&nbsp; Emotional Intelligence
        </div>

        <div className="font-display italic text-[18px] md:text-[20px] text-chrp-black text-center mb-10 min-h-[3rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={statusIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4 }}
            >
              {STATUS_MESSAGES[statusIndex]}
            </motion.div>
          </AnimatePresence>
        </div>

        <div style={{ minHeight: 280 }}>
          {showPolygon ? (
            <PolygonRadar
              vertices={vertices}
              mode={report.epi.mode}
              epiScore={report.epi.score}
              size={280}
              animated
            />
          ) : (
            <div style={{ width: 280, height: 280 }} aria-hidden />
          )}
        </div>

        <AnimatePresence>
          {showChip && (
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 px-4 py-2"
              style={{ backgroundColor: chip.chipBg, color: chip.chipText }}
            >
              <span className="font-sans font-bold text-[13px]">
                {report.epi.mode} mode
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-10 font-sans text-[10px] tracking-wider uppercase text-ink-light">
          {report.track.title} &nbsp;//&nbsp; {report.track.artist}
        </div>
      </div>
    </div>
  );
}
