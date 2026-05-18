"use client";

import { Mode, MODE_COLORS, ReportPayload } from "@/lib/fixtures/tracks";
import { CreatorProfilePayload, PitchPriority } from "@/lib/fixtures/profile";
import { PolygonRadar } from "@/components/PolygonRadar";

const MODE_BG: Record<Mode, string> = {
  Ready: "var(--chrp-yellow)",
  Recover: "var(--plum)",
  Recharge: "var(--pistachio)",
  Flow: "var(--french-blue)",
};

export function CreatorProfileStage({
  report,
  profile,
  scans,
  artistOverride,
}: {
  report: ReportPayload;
  profile: CreatorProfilePayload;
  scans: number;
  artistOverride: string | null;
}) {
  const artist = artistOverride ?? profile.creator.name;
  const tracksScanned = scans > 0 ? scans : profile.creator.tracks_scored;

  return (
    <article className="px-6 md:px-10 lg:px-14 py-8 md:py-12 max-w-[920px] mx-auto w-full">
      <HeaderBand reportId={`PRF-${report.report_meta.id.slice(0, 6)}`} />
      <Hero
        artist={artist}
        tracksScanned={tracksScanned}
        generatedDisplay={profile.creator.generated_display}
      />
      <SignaturePolygon profile={profile} />
      <Metrics profile={profile} />
      <ModeDistribution dist={profile.mode_distribution} />
      <PitchPriorities priorities={profile.pitch_priorities} />
      <CreatorTease artist={artist} tracksScanned={tracksScanned} />
      <Footer reportId={`PRF-${report.report_meta.id.slice(0, 6)}`} />
    </article>
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

function Metrics({ profile }: { profile: CreatorProfilePayload }) {
  const m = profile.metrics;
  return (
    <section className="mt-12">
      <div className="font-sans font-bold text-[10px] tracking-wider uppercase text-ink-soft">
        Signature metrics
      </div>
      <div className="hairline mt-1" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 mt-5">
        {m.emotional_consistency && (
          <MetricBlock
            name="Emotional consistency"
            score={m.emotional_consistency.score}
            label={m.emotional_consistency.label}
          />
        )}
        {m.signature_strength && (
          <MetricBlock
            name="Signature strength"
            score={m.signature_strength.score}
            label={m.signature_strength.label}
          />
        )}
        {m.reliability_index && (
          <MetricBlock
            name="Reliability index"
            score={m.reliability_index.score}
            label={m.reliability_index.label}
          />
        )}
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
