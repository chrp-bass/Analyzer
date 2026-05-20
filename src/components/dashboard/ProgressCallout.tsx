"use client";

import { ScanRecordOnAccount } from "@/lib/accounts";
import { getReportById, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import { getCatalogIntelligence } from "@/lib/catalog-progression";

export function ProgressCallout({
  scans,
}: {
  scans: ScanRecordOnAccount[];
}) {
  const n = scans.length;
  if (n >= 3 && n < 5) return <PatternEmerging scans={scans} />;
  if (n >= 5 && n < 7) return <HalfwayPreview scans={scans} />;
  if (n === 7) return <OneAway scans={scans} />;
  return null;
}

function CalloutShell({
  children,
  accent = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className="mt-6 border-y border-rule bg-oat px-4 md:px-5 py-4 md:py-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-6"
      style={
        accent
          ? { borderTopColor: "var(--chrp-yellow)", borderBottomColor: "var(--chrp-yellow)" }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function PatternEmerging({ scans }: { scans: ScanRecordOnAccount[] }) {
  return (
    <CalloutShell>
      <div className="flex-1 min-w-0">
        <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
          Pattern emerging
        </div>
        <p className="mt-1.5 font-sans text-[13px] text-chrp-black leading-snug max-w-[52ch]">
          Your fingerprint cluster is starting to form. Two more scans until
          preview-level catalog signal arrives.
        </p>
      </div>
      <PolygonCluster scans={scans.slice(0, 3)} />
    </CalloutShell>
  );
}

function HalfwayPreview({ scans }: { scans: ScanRecordOnAccount[] }) {
  const intel = getCatalogIntelligence(scans);
  const dominant = intel.dominantMode ?? "Ready";
  return (
    <CalloutShell>
      <div className="flex-1 min-w-0">
        <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
          Halfway to your creator profile
        </div>
        <p className="mt-1.5 font-sans text-[13px] text-chrp-black leading-snug max-w-[60ch]">
          Your dominant mode is{" "}
          <span
            className="px-1.5 py-0.5 font-bold"
            style={{
              backgroundColor: MODE_COLORS[dominant].chipBg,
              color: MODE_COLORS[dominant].chipText,
            }}
          >
            {dominant}
          </span>{" "}
          ({intel.dominantModeCount} of {scans.length} tracks). Your emerging
          signature shows{" "}
          <span className="font-bold">{intel.signatureDescriptor}</span> across
          your catalog. Three more scans for full Creator Profile.
        </p>
      </div>
      <AggregatePolygonPreview scans={scans} filledOfEight={5} />
    </CalloutShell>
  );
}

function OneAway({ scans }: { scans: ScanRecordOnAccount[] }) {
  return (
    <CalloutShell accent>
      <div className="flex-1 min-w-0">
        <div
          className="font-sans font-black text-[10px] tracking-wider uppercase"
          style={{ color: "var(--chrp-black)" }}
        >
          One scan away
        </div>
        <p className="mt-1.5 font-sans text-[13px] text-chrp-black leading-snug max-w-[52ch]">
          Your next track completes the unlock. Catalog intelligence ready to
          deliver.
        </p>
      </div>
      <AggregatePolygonPreview scans={scans} filledOfEight={7} pulse />
    </CalloutShell>
  );
}

function PolygonCluster({ scans }: { scans: ScanRecordOnAccount[] }) {
  return (
    <div className="relative w-[120px] h-[64px] flex-shrink-0">
      {scans.map((s, i) => {
        const r = getReportById(s.trackSlug);
        if (!r) return null;
        return (
          <div
            key={`${s.id}-${i}`}
            className="absolute"
            style={{
              left: `${i * 28}px`,
              top: `${i % 2 === 0 ? 0 : 12}px`,
              opacity: 0.85,
            }}
          >
            <PolygonRadar
              vertices={polygonFromChrpScores(r.chrp_scores)}
              mode={r.epi.mode}
              epiScore={r.epi.score}
              size={48}
              showLabels={false}
              showCenter={false}
            />
          </div>
        );
      })}
    </div>
  );
}

function AggregatePolygonPreview({
  scans,
  filledOfEight,
  pulse = false,
}: {
  scans: ScanRecordOnAccount[];
  filledOfEight: number;
  pulse?: boolean;
}) {
  // Average the user's CHRP scores into a single polygon outline.
  const intel = getCatalogIntelligence(scans);
  const mode = intel.dominantMode ?? "Ready";
  const epi = Math.round(
    (intel.averages.focus +
      intel.averages.balance +
      intel.averages.motivation +
      intel.averages.calm) /
      4,
  );
  const vertices = {
    focus: intel.averages.focus,
    balance: intel.averages.balance,
    motivation: intel.averages.motivation,
    calm: intel.averages.calm,
  };
  const slots = 8;
  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <div className={pulse ? "animate-pulse" : undefined} style={{ opacity: pulse ? 0.85 : 0.7 }}>
        <PolygonRadar
          vertices={vertices}
          mode={mode}
          epiScore={epi}
          size={80}
          showLabels={false}
          showCenter={false}
        />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: slots }).map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-4"
            style={{
              backgroundColor:
                i < filledOfEight ? "var(--chrp-black)" : "var(--rule)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
