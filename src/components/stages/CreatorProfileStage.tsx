"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mode, MODE_COLORS, ReportPayload } from "@/lib/fixtures/tracks";
import { CreatorProfilePayload, PitchPriority } from "@/lib/fixtures/profile";
import { PolygonRadar } from "@/components/PolygonRadar";
import { ScanRecordOnAccount } from "@/lib/accounts";
import {
  getCatalogIntelligence,
  getCatalogIntelligenceFromProfile,
  CatalogIntelligence,
  CatalogComparable,
} from "@/lib/catalog-progression";

const MODE_BG: Record<Mode, string> = {
  Ready: "var(--chrp-yellow)",
  Recover: "var(--plum)",
  Recharge: "var(--pistachio)",
  Flow: "var(--french-blue)",
};

// Reveal step indices, used to gate visibility of each section during the
// staged 8-second reveal.
const STEP = {
  POLYGON: 1,
  CONSISTENCY: 2,
  SIGNATURE: 3,
  RELIABILITY: 4,
  MODE_DIST: 5,
  PATTERN_1: 6,
  PATTERN_2: 7,
  PATTERN_3: 8,
  PITCH: 9,
  COMPARABLE: 10,
} as const;

const STEP_DELAYS_MS = [
  // step -> ms after reveal start when it becomes visible
  0, // index 0 unused
  2000, // POLYGON
  3000, // CONSISTENCY
  3800, // SIGNATURE
  4600, // RELIABILITY
  5400, // MODE_DIST
  6400, // PATTERN_1
  6700, // PATTERN_2
  7000, // PATTERN_3
  7500, // PITCH
  8500, // COMPARABLE
];

const PROCESSING_MESSAGES = [
  "Aggregating polygon shapes…",
  "Computing consistency across catalog…",
  "Comparing to corpus norms…",
];

export function CreatorProfileStage({
  report,
  profile,
  scans,
  artistOverride,
  userScans,
  playReveal = false,
}: {
  report: ReportPayload;
  profile: CreatorProfilePayload;
  scans: number;
  artistOverride: string | null;
  userScans?: ScanRecordOnAccount[];
  playReveal?: boolean;
}) {
  const artist = artistOverride ?? profile.creator.name;
  const tracksScanned = scans > 0 ? scans : profile.creator.tracks_scored;

  const intel: CatalogIntelligence =
    userScans && userScans.length > 0
      ? getCatalogIntelligence(userScans)
      : getCatalogIntelligenceFromProfile(profile);

  const [currentStep, setCurrentStep] = useState(playReveal ? 0 : 99);
  const [processingIdx, setProcessingIdx] = useState(0);

  useEffect(() => {
    if (!playReveal) return;
    const timers: number[] = [];
    // Cycle the processing copy during the first 2 seconds
    for (let i = 1; i < PROCESSING_MESSAGES.length; i++) {
      timers.push(
        window.setTimeout(() => setProcessingIdx(i), (2000 / PROCESSING_MESSAGES.length) * i),
      );
    }
    // Step transitions
    STEP_DELAYS_MS.forEach((delay, step) => {
      if (step === 0) return;
      timers.push(
        window.setTimeout(() => setCurrentStep((cur) => Math.max(cur, step)), delay),
      );
    });
    return () => timers.forEach((t) => clearTimeout(t));
  }, [playReveal]);

  const showProcessing = playReveal && currentStep < STEP.POLYGON;
  const visible = (step: number) => currentStep >= step;

  return (
    <article className="px-6 md:px-10 lg:px-14 py-8 md:py-12 max-w-[920px] mx-auto w-full">
      <HeaderBand reportId={`PRF-${report.report_meta.id.slice(0, 6)}`} />
      <Hero
        artist={artist}
        tracksScanned={tracksScanned}
        generatedDisplay={profile.creator.generated_display}
      />

      <AnimatePresence>
        {showProcessing && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-10 flex items-center gap-3 text-ink-soft"
          >
            <div className="w-4 h-4 border-2 border-chrp-black border-t-transparent rounded-full animate-spin" />
            <span className="font-sans text-[12.5px]">
              Computing your Creator Profile&hellip;{" "}
              <span className="text-ink-light">
                {PROCESSING_MESSAGES[processingIdx]}
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <FadeStage visible={visible(STEP.POLYGON)}>
        <SignaturePolygon profile={profile} />
      </FadeStage>

      <section className="mt-12">
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          Signature metrics
        </div>
        <div className="hairline mt-1" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 mt-5">
          {profile.metrics.emotional_consistency && (
            <FadeStage visible={visible(STEP.CONSISTENCY)}>
              <MetricBlock
                name="Emotional consistency"
                score={profile.metrics.emotional_consistency.score}
                label={profile.metrics.emotional_consistency.label}
              />
            </FadeStage>
          )}
          {profile.metrics.signature_strength && (
            <FadeStage visible={visible(STEP.SIGNATURE)}>
              <MetricBlock
                name="Signature strength"
                score={profile.metrics.signature_strength.score}
                label={profile.metrics.signature_strength.label}
              />
            </FadeStage>
          )}
          {profile.metrics.reliability_index && (
            <FadeStage visible={visible(STEP.RELIABILITY)}>
              <MetricBlock
                name="Reliability index"
                score={profile.metrics.reliability_index.score}
                label={profile.metrics.reliability_index.label}
              />
            </FadeStage>
          )}
        </div>
      </section>

      <FadeStage visible={visible(STEP.MODE_DIST)}>
        <ModeDistribution dist={profile.mode_distribution} />
      </FadeStage>

      <section className="mt-10">
        <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
          Pattern intelligence
        </div>
        <div className="hairline mt-1" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mt-5">
          <FadeStage visible={visible(STEP.PATTERN_1)}>
            <PatternCallout
              lead="Mode versatility"
              body={intel.modeVersatility}
            />
          </FadeStage>
          <FadeStage visible={visible(STEP.PATTERN_2)}>
            <PatternCallout
              lead="Cross-track signature"
              body={intel.crossTrackObservation}
            />
          </FadeStage>
          <FadeStage visible={visible(STEP.PATTERN_3)}>
            <PatternCallout
              lead="Catalog vs. corpus"
              body={intel.catalogVsCorpus}
            />
          </FadeStage>
        </div>
      </section>

      <FadeStage visible={visible(STEP.PITCH)}>
        <PitchPriorities priorities={profile.pitch_priorities} />
      </FadeStage>

      <FadeStage visible={visible(STEP.COMPARABLE)}>
        <CatalogComparableSection comparable={intel.comparable} />
      </FadeStage>

      <CreatorTease artist={artist} tracksScanned={tracksScanned} />
      <Footer reportId={`PRF-${report.report_meta.id.slice(0, 6)}`} />
    </article>
  );
}

function FadeStage({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : 14,
      }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {children}
    </motion.div>
  );
}

function HeaderBand({ reportId }: { reportId: string }) {
  return (
    <>
      <div className="flex items-end justify-between pb-2">
        <div className="font-sans font-black text-[14px] tracking-wider">
          CHRP
        </div>
        <div className="font-sans text-[11px] text-ink-soft">
          Creator profile &nbsp;//&nbsp; No. {reportId} &nbsp;//&nbsp; v1.0
        </div>
      </div>
      <div className="hairline" />
    </>
  );
}

function Hero({
  artist,
  tracksScanned,
  generatedDisplay,
}: {
  artist: string;
  tracksScanned: number;
  generatedDisplay: string;
}) {
  return (
    <section className="mt-6 md:mt-8">
      <h1 className="font-display font-bold text-[40px] md:text-[56px] display-tight">
        Creator Profile
      </h1>
      <p className="font-display italic text-[16px] md:text-[20px] text-ink-soft mt-1">
        for {artist}
      </p>
      <p className="font-sans text-[11px] text-ink-light mt-3">
        {tracksScanned} tracks scanned &nbsp;//&nbsp; Profile generated{" "}
        {generatedDisplay}
      </p>
    </section>
  );
}

function SignaturePolygon({ profile }: { profile: CreatorProfilePayload }) {
  const dominantMode = profile.signature.dominant_mode;
  return (
    <section className="mt-10 flex flex-col items-center">
      <PolygonRadar
        vertices={profile.signature.polygon}
        mode={dominantMode}
        epiScore={Math.round(
          (profile.signature.polygon.focus +
            profile.signature.polygon.balance +
            profile.signature.polygon.motivation +
            profile.signature.polygon.calm) /
            4,
        )}
        size={320}
      />
      <div className="mt-3 font-sans text-[10px] tracking-wider uppercase text-ink-soft">
        Signature shape &nbsp;·&nbsp; dominant mode{" "}
        <span
          className="px-2 py-0.5 ml-1"
          style={{
            backgroundColor: MODE_BG[dominantMode],
            color:
              dominantMode === "Ready" || dominantMode === "Recharge"
                ? "var(--chrp-black)"
                : "var(--chrp-white)",
          }}
        >
          {dominantMode}
        </span>
      </div>
    </section>
  );
}

function MetricBlock({
  name,
  score,
  label,
}: {
  name: string;
  score: number;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
        {name}
      </div>
      <div className="font-display font-bold text-[40px] md:text-[48px] leading-none text-chrp-black">
        {score}
      </div>
      <div className="font-display italic text-[14px] md:text-[15px] text-ink-soft">
        {label}
      </div>
    </div>
  );
}

function ModeDistribution({
  dist,
}: {
  dist: CreatorProfilePayload["mode_distribution"];
}) {
  const entries: { mode: Mode; pct: number }[] = [
    { mode: "Flow", pct: dist.Flow },
    { mode: "Ready", pct: dist.Ready },
    { mode: "Recharge", pct: dist.Recharge },
    { mode: "Recover", pct: dist.Recover },
  ];
  return (
    <section className="mt-10">
      <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
        Mode distribution
      </div>
      <div className="hairline mt-1" />
      <div className="mt-4 flex w-full h-3 overflow-hidden">
        {entries.map((e) => (
          <div
            key={e.mode}
            style={{ width: `${e.pct}%`, backgroundColor: MODE_COLORS[e.mode].chipBg }}
            aria-label={`${e.mode} ${e.pct}%`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 font-sans text-[11px] text-ink-soft">
        {entries.map((e) => (
          <span key={e.mode} className="inline-flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5"
              style={{ backgroundColor: MODE_COLORS[e.mode].chipBg }}
            />
            {e.mode}{" "}
            <span className="font-bold text-chrp-black">{e.pct}%</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function PatternCallout({
  lead,
  body,
}: {
  lead: string;
  body: string;
}) {
  return (
    <div className="border-t-2 border-chrp-black pt-3">
      <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
        {lead}
      </div>
      <p className="mt-2 font-sans text-[12.5px] text-chrp-black leading-[1.55]">
        {body}
      </p>
    </div>
  );
}

function PitchPriorities({
  priorities,
}: {
  priorities: PitchPriority[];
}) {
  return (
    <section className="mt-10">
      <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
        Top pitch priorities this week
      </div>
      <div className="hairline mt-1" />
      <div className="mt-4 flex flex-col">
        {priorities.map((p, i) => (
          <PriorityRow key={p.scan_id} priority={p} index={i + 1} />
        ))}
      </div>
    </section>
  );
}

function PriorityRow({
  priority,
  index,
}: {
  priority: PitchPriority;
  index: number;
}) {
  const chip = MODE_COLORS[priority.mode];
  return (
    <div className="grid grid-cols-[40px_64px_1fr_auto] items-center gap-4 py-3 border-b border-rule">
      <div className="font-sans font-black text-[12px] text-ink-soft">
        {String(index).padStart(2, "0")}
      </div>
      <div className="flex-shrink-0">
        <PolygonRadar
          vertices={priority.polygon}
          mode={priority.mode}
          epiScore={priority.epi_score}
          size={64}
          showLabels={false}
          showCenter={false}
        />
      </div>
      <div className="min-w-0">
        <div className="font-display font-bold text-[16px] md:text-[18px] leading-tight">
          {priority.track_title}
        </div>
        <div className="font-sans text-[11.5px] text-ink-soft mt-0.5 leading-snug">
          {priority.reason}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="font-display font-bold text-[20px] md:text-[24px] leading-none">
          {priority.epi_score}
        </div>
        <span
          className="px-2 py-0.5 text-[10px] font-sans font-bold"
          style={{ backgroundColor: chip.chipBg, color: chip.chipText }}
        >
          {priority.mode}
        </span>
      </div>
    </div>
  );
}

function CatalogComparableSection({
  comparable,
}: {
  comparable: CatalogComparable;
}) {
  return (
    <section className="mt-10">
      <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
        Your catalog comparable
      </div>
      <div className="hairline mt-1" />
      <div className="mt-4 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 md:gap-10">
        <div>
          <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
            Closest signature
          </div>
          <div className="font-display font-bold text-[28px] md:text-[32px] leading-none mt-1 text-chrp-black">
            {comparable.artist}
          </div>
          <div className="font-sans text-[11px] text-ink-soft mt-2">
            Market demand{" "}
            <span className="font-bold text-chrp-black">{comparable.demand}</span>
          </div>
        </div>
        <p className="font-sans text-[12.5px] text-ink-soft leading-[1.55] max-w-[60ch]">
          {comparable.artist}&rsquo;s catalog has historically performed in{" "}
          <span className="text-chrp-black">{comparable.placements}</span>. The
          live market currently shows{" "}
          <span className="text-chrp-black">{comparable.demand}</span> demand in{" "}
          <span className="text-chrp-black">{comparable.vertical}</span>. Your
          catalog is positioned to compete in that lane.
        </p>
      </div>
    </section>
  );
}

function CreatorTease({
  artist,
  tracksScanned,
}: {
  artist: string;
  tracksScanned: number;
}) {
  return (
    <section
      className="mt-10 py-3 px-4 md:px-5 bg-chrp-black"
      style={{ backgroundColor: "var(--chrp-black)" }}
    >
      <p className="font-sans text-[11.5px] md:text-[12px] leading-[1.45] text-chrp-white">
        <span className="font-bold" style={{ color: "var(--chrp-yellow)" }}>
          {artist}
        </span>{" "}
        &nbsp;//&nbsp; {tracksScanned} tracks scanned. View individual track
        reports to inspect each fingerprint and pitch package.
      </p>
    </section>
  );
}

function Footer({ reportId }: { reportId: string }) {
  return (
    <footer className="mt-6 pt-3 border-t border-rule flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6">
      <div className="font-sans text-[11px] text-ink-soft">
        Scored by CHRP &nbsp;//&nbsp; scan.chrp.ai
        <span className="text-ink-light">
          {" · "}Behavioral scoring only. Methodology at scan.chrp.ai/methodology.
        </span>
      </div>
      <div className="font-sans text-[11px] text-ink-soft">
        Report ID: {reportId}
      </div>
    </footer>
  );
}
