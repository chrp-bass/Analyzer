"use client";

import { ScanRecordOnAccount } from "@/lib/accounts";
import { getFreeReportById, MODE_COLORS } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import { getCatalogIntelligence } from "@/lib/catalog-progression";

/**
 * Song → Work → Creator progression.
 *
 * The locked rules for this surface:
 *   — No points, badges, streaks, trophies or expiry pressure. The reward is
 *     deeper intelligence, not a prize.
 *   — Partial patterns are shown as partial. Nothing is stated as settled
 *     before the picture is.
 *   — The counter is a statement of how much of the picture exists, which is
 *     the only reason an artist would care about it.
 *
 * Everything rendered here is derived from the user's real scans. Nothing is
 * fabricated to make the progression look further along than it is.
 */

/** Songs required before the Creator Profile opens. Matches the pricing terms. */
const PROFILE_THRESHOLD = 8;

const WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five",
  "Six", "Seven", "Eight", "Nine", "Ten",
];

function words(n: number): string {
  return WORDS[n] ?? String(n);
}

export function ProgressCallout({ scans }: { scans: ScanRecordOnAccount[] }) {
  const n = scans.length;
  // Below three songs there is no body of work to speak about yet, and at or
  // past the threshold the profile itself is the surface — not a countdown.
  if (n < 3 || n >= PROFILE_THRESHOLD) return null;
  return <TakingShape scans={scans} />;
}

function TakingShape({ scans }: { scans: ScanRecordOnAccount[] }) {
  const n = scans.length;
  const remaining = PROFILE_THRESHOLD - n;
  const intel = getCatalogIntelligence(scans);
  const dominant = intel.dominantMode;

  // Observations are only stated once enough songs exist to support them, and
  // they are phrased as what is visible so far rather than as a conclusion.
  const observations: string[] = [];
  if (dominant && intel.dominantModeCount >= 2) {
    observations.push(
      `${dominant} has been the leading mode in ${words(
        intel.dominantModeCount,
      ).toLowerCase()} of ${words(n).toLowerCase()} songs.`,
    );
  }
  if (intel.signatureDescriptor) {
    observations.push(
      `Across these songs the shape reads as ${intel.signatureDescriptor}.`,
    );
  }

  return (
    <div className="mt-6 border-y border-rule bg-oat px-4 md:px-5 py-4 md:py-5 flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
      <div className="flex-1 min-w-0">
        <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
          {words(n)} of {words(PROFILE_THRESHOLD).toLowerCase()} songs analysed
        </div>
        <p className="mt-1.5 font-display text-[19px] md:text-[22px] leading-[1.15] text-chrp-black">
          Your Creator Intelligence is taking shape.
        </p>
        <p className="mt-1.5 font-sans text-[13px] text-ink-soft leading-snug">
          {remaining === 1
            ? "One song until your Creator Profile opens."
            : `${words(remaining)} songs until your Creator Profile opens.`}
        </p>

        {observations.length > 0 && (
          <div className="mt-3.5">
            <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
              Already visible across {words(n).toLowerCase()} songs
            </div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {observations.map((o) => (
                <li
                  key={o}
                  className="font-sans text-[12.5px] text-chrp-black leading-snug max-w-[60ch]"
                >
                  {dominant && (
                    <span
                      className="inline-block w-1.5 h-1.5 mr-2 align-middle"
                      style={{ backgroundColor: MODE_COLORS[dominant].chipText }}
                      aria-hidden
                    />
                  )}
                  {o}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-sans text-[11.5px] text-ink-light leading-snug max-w-[56ch]">
              Partial patterns are shown as partial. Nothing is stated as
              settled before the picture is.
            </p>
          </div>
        )}
      </div>

      <CatalogShape scans={scans} filled={n} />
    </div>
  );
}

/**
 * The averaged catalog shape plus a plain count meter. The meter states how
 * much of the picture exists — it is not a score, a streak or a reward.
 */
function CatalogShape({
  scans,
  filled,
}: {
  scans: ScanRecordOnAccount[];
  filled: number;
}) {
  const intel = getCatalogIntelligence(scans);
  const mode = intel.dominantMode ?? "Ready";
  const vertices = {
    focus: intel.averages.focus,
    balance: intel.averages.balance,
    motivation: intel.averages.motivation,
    calm: intel.averages.calm,
  };
  const epi = Math.round(
    (vertices.focus + vertices.balance + vertices.motivation + vertices.calm) /
      4,
  );
  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <div style={{ opacity: 0.7 }}>
        <PolygonRadar
          vertices={vertices}
          mode={mode}
          epiScore={epi}
          size={80}
          showLabels={false}
          showCenter={false}
        />
      </div>
      <div
        className="flex gap-1"
        role="img"
        aria-label={`${filled} of ${PROFILE_THRESHOLD} songs analysed`}
      >
        {Array.from({ length: PROFILE_THRESHOLD }).map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-4"
            style={{
              backgroundColor:
                i < filled ? "var(--chrp-black)" : "var(--rule)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A loose cluster of the individual song polygons — used where the point is
 * that several separate readings exist, not that they have been merged.
 */
export function PolygonCluster({ scans }: { scans: ScanRecordOnAccount[] }) {
  return (
    <div className="relative w-[120px] h-[64px] flex-shrink-0">
      {scans.map((s, i) => {
        const r = getFreeReportById(s.trackSlug);
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
