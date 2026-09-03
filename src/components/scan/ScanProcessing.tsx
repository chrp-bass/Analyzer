"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FreeReport, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import { getScanReport, ScanError } from "@/lib/data-source";

/**
 * THE READING — the journey's signature moment.
 *
 * This screen used to be a loading state wearing a chart: six seconds of
 * rotating status copy ("Analyzing your song…", "Computing EPI Score…")
 * over an empty 280px box, after which a polygon appeared and the song
 * itself finally showed up underneath it at 10px. The song — the thing the
 * whole product is about — was the last and smallest element on a screen
 * that claimed to be reading it.
 *
 * It is inverted here. Three rules:
 *
 *   1. The song is present in the first frame and never leaves. Artwork,
 *      title, artist — an ordinary record, sitting there being ordinary.
 *      That is the "before" the moment needs in order to have an "after".
 *
 *   2. The measurements replace the status copy. Each dimension resolves as
 *      its vertex lands, with its real value: Focus 84, Balance 52,
 *      Motivation 96, Calm 21. Nothing here narrates fake progress — the
 *      screen is showing what was actually measured, in the order the shape
 *      is built. The interface explains the product by performing it.
 *
 *   3. The instrument keeps its grid. This is the teaching surface: it is
 *      where someone learns the shape is plotted. The grid comes off later,
 *      on the surfaces that recall the song rather than explain it. See
 *      EpiPlate.
 *
 * Timing is driven by when the measurement actually exists, not by a fixed
 * clock: a fixture paints after a short beat, and a real scan begins its
 * reveal the moment scoring lands. The route still advances only when BOTH
 * the reveal has finished and the report is real.
 *
 * Reduced motion is a first-class path, not a degradation — the whole
 * reading resolves at once, with no drawing and no staggered reveal, and
 * nothing is communicated only through movement.
 */
const AXIS_ORDER = ["Focus", "Balance", "Motivation", "Calm"] as const;

/** Vertex landings inside the radar's own 3.5s draw, in ms from reveal start. */
const AXIS_AT = [0, 1000, 1500, 2000];
const EPI_AT = 3000;
const REVEAL_ENDS = 3800;
/** A short beat so a cached fixture does not snap past the "before". */
const MIN_BEAT = 1600;

export function ScanProcessing({
  report: initialReport,
  scanId,
  pendingTitle,
  pendingArtist,
}: {
  report: FreeReport | null;
  scanId: string;
  trackSlug: string;
  /**
   * The song's identity as the search knew it, carried so the record is on
   * screen during a real scan's analysis window instead of a blank space.
   * Display only — the resolved report supersedes it the moment it lands,
   * and nothing derived from these ever reaches the report or the engine.
   */
  pendingTitle?: string;
  pendingArtist?: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [report, setReport] = useState<FreeReport | null>(initialReport);
  const [error, setError] = useState<string | null>(null);
  const [beatDone, setBeatDone] = useState(false);
  const [axesShown, setAxesShown] = useState(0);
  const [epiShown, setEpiShown] = useState(false);
  const [revealDone, setRevealDone] = useState(false);

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

  useEffect(() => {
    const t = setTimeout(() => setBeatDone(true), MIN_BEAT);
    return () => clearTimeout(t);
  }, []);

  // The reveal starts when there is something real to reveal.
  const revealing = beatDone && !!report && !error;

  useEffect(() => {
    if (!revealing) return;
    if (reduced) {
      // Everything at once. No drawing, no stagger, nothing withheld.
      setAxesShown(4);
      setEpiShown(true);
      const t = setTimeout(() => setRevealDone(true), 600);
      return () => clearTimeout(t);
    }
    const timers = AXIS_AT.map((ms, i) =>
      setTimeout(() => setAxesShown(i + 1), ms),
    );
    timers.push(setTimeout(() => setEpiShown(true), EPI_AT));
    timers.push(setTimeout(() => setRevealDone(true), REVEAL_ENDS));
    return () => timers.forEach(clearTimeout);
  }, [revealing, reduced]);

  useEffect(() => {
    if (!revealDone || !report || error) return;
    router.push(`/scan/${scanId}/preview`);
  }, [revealDone, report, error, router, scanId]);

  const vertices = useMemo(
    () => (report ? polygonFromChrpScores(report.chrp_scores) : null),
    [report],
  );

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

  const chip = report ? MODE_COLORS[report.epi.mode] : null;
  const rows = report
    ? AXIS_ORDER.map(
        (n) =>
          report.chrp_scores.find(
            (s) => s.name.toLowerCase() === n.toLowerCase(),
          ) ?? null,
      )
    : [];

  return (
    <div className="rd-screen">
      <div className="chrp-aura rd-stage">
        <div className="rd-eyebrow">CHRP &nbsp;//&nbsp; Emotional Intelligence</div>

        {/* The song. Present before anything is claimed about it. */}
        <div className="rd-song">
          {report?.track.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="rd-art"
              src={report.track.artworkUrl}
              alt={`Cover art for ${report.track.title}`}
            />
          ) : null}
          <div className="rd-song-id">
            <p className="rd-title">
              {report?.track.title ?? pendingTitle ?? " "}
            </p>
            <p className="rd-artist">
              {report
                ? `by ${report.track.artist}`
                : pendingArtist
                  ? `by ${pendingArtist}`
                  : " "}
            </p>
          </div>
        </div>

        <div className="rd-instrument">
          {revealing && report && vertices ? (
            <PolygonRadar
              vertices={vertices}
              mode={report.epi.mode}
              epiScore={report.epi.score}
              size={260}
              animated={!reduced}
            />
          ) : (
            <div className="rd-instrument-hold" aria-hidden />
          )}
        </div>

        {/* The measurement, arriving. This is the status copy — there is no
            other. Each line is a real number the engine produced. */}
        <div className="rd-readout" aria-live="polite">
          {!revealing ? (
            <p className="rd-waiting">Reading the signal&hellip;</p>
          ) : (
            <>
              {rows.map((r, i) =>
                r && i < axesShown ? (
                  <motion.p
                    key={r.name}
                    className="rd-axis"
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={reduced ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="rd-axis-name">{r.name}</span>
                    <span className="rd-axis-score">{r.score}</span>
                  </motion.p>
                ) : (
                  <p className="rd-axis rd-axis-empty" key={AXIS_ORDER[i]} aria-hidden />
                ),
              )}
            </>
          )}
        </div>

        <AnimatePresence>
          {epiShown && report && chip && (
            <motion.div
              className="rd-epi"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <span className="rd-epi-score font-display">
                {report.epi.score}
              </span>
              <span className="rd-epi-meta">
                <span className="rd-epi-label">EPI</span>
                <span className="rd-epi-mode">{report.epi.mode} mode</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
