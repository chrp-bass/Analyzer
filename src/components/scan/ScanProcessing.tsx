"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FreeReport, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import { getScanReport, ScanError } from "@/lib/data-source";

const STATUS_MESSAGES = [
  "Analyzing your song…",
  "Reading emotional fingerprint…",
  "Mapping its emotional signature…",
  "Computing EPI Score…",
];

/**
 * Processing.
 *
 * For a fixture scan the report arrives as a prop and the ten seconds are
 * pure choreography. For a real scan the analysis genuinely runs here, so the
 * status messages describe work actually happening. The screen advances only
 * once BOTH the animation window has elapsed and the scoring has landed —
 * whichever finishes last — so nobody is dropped onto an empty preview.
 */
export function ScanProcessing({
  report: initialReport,
  scanId,
}: {
  report: FreeReport | null;
  scanId: string;
  trackSlug: string;
}) {
  const router = useRouter();
  const [statusIndex, setStatusIndex] = useState(0);
  const [showPolygon, setShowPolygon] = useState(false);
  const [showChip, setShowChip] = useState(false);
  const [report, setReport] = useState<FreeReport | null>(initialReport);
  const [error, setError] = useState<string | null>(null);
  const [animationDone, setAnimationDone] = useState(false);

  // Run the real analysis for a real scan.
  useEffect(() => {
    if (initialReport) return;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await getScanReport(scanId);
        if (cancelled) return;
        if (!resolved) {
          setError(
            "This song isn't available for analysis yet. Try a different version or another track.",
          );
          return;
        }
        setReport(resolved);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ScanError
            ? err.userMessage
            : "Something went wrong. Please try again.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialReport, scanId]);

  // The choreography.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    [2500, 5000, 7500].forEach((ms, i) => {
      timers.push(setTimeout(() => setStatusIndex(i + 1), ms));
    });
    timers.push(setTimeout(() => setShowPolygon(true), 6000));
    timers.push(setTimeout(() => setShowChip(true), 9500));
    timers.push(setTimeout(() => setAnimationDone(true), 10000));
    return () => timers.forEach(clearTimeout);
  }, []);

  // Advance only when the shape is real and the window has closed.
  useEffect(() => {
    if (!animationDone || !report || error) return;
    router.push(`/scan/${scanId}/preview`);
  }, [animationDone, report, error, router, scanId]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-3">
          CHRP &nbsp;//&nbsp; Emotional Intelligence
        </div>
        <p
          className="font-display italic text-[20px] text-chrp-black"
          style={{ maxWidth: "44ch" }}
        >
          {error}
        </p>
        <button
          onClick={() => router.push("/scan")}
          className="btn btn-y"
          style={{ marginTop: 28 }}
        >
          Try another song
        </button>
      </div>
    );
  }

  const vertices = report ? polygonFromChrpScores(report.chrp_scores) : null;
  const chip = report ? MODE_COLORS[report.epi.mode] : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* The aura sits behind the instrument, not behind the page. Scoped to
          the full viewport it stops being atmosphere and becomes wallpaper. */}
      <div className="chrp-aura w-full max-w-md flex flex-col items-center">
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
          {showPolygon && report && vertices ? (
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
          {showChip && report && chip && (
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="mode-pill mt-4"
              style={{ backgroundColor: chip.chipBg, color: chip.chipText }}
            >
              <span className="font-sans font-bold text-[13px]">
                {report.epi.mode} mode
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {report && (
          <div className="mt-10 font-sans text-[10px] tracking-wider uppercase text-ink-light">
            {report.track.title} &nbsp;//&nbsp; {report.track.artist}
          </div>
        )}
      </div>
    </div>
  );
}
