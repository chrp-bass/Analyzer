/**
 * DERIVED RELATIONSHIPS — computed here, never by the model.
 *
 * Rhodes reasons from relationships, not from values. The relationships are
 * arithmetic, and arithmetic belongs in the application: the model should be
 * handed the gaps, the ordering and the scale boundaries as FACTS, so its
 * work is meaning rather than mental subtraction it can get wrong.
 *
 * The discipline that governs this file:
 *
 *   Everything here is Level 2 — a relationship among supplied facts. Nothing
 *   here is a judgement. There is deliberately NO threshold for "meaningfully
 *   exceeds", no band, no tier and no label like "dominant profile" or
 *   "balanced profile". CHRP science defines no such cut points, and
 *   inventing one here would launder a convenient constant into something
 *   that looks like a validated finding.
 *
 *   What is supplied instead: the ordering, the exact gaps, which gaps are
 *   largest, and where a value sits against the real boundaries of its scale.
 *   "The largest gap in this profile is Motivation over Focus, 41 points" is
 *   a fact. "Motivation is meaningfully higher" is a threshold wearing a
 *   fact's clothes.
 *
 * The 30-99 range is not invented either: it is the engine's own display
 * range (displayRange + the clamp in transformScore, engine/scores.ts). A
 * dimension cannot be 0. Stating the floor is what stops a 30 being read as
 * an absence.
 */

/** The engine's dimension display range. Not a choice made here. */
export const DIMENSION_FLOOR = 30;
export const DIMENSION_CEILING = 99;
const DIMENSION_SPAN = DIMENSION_CEILING - DIMENSION_FLOOR;

/** The EPI display range. A different scale answering a different question. */
export const EPI_FLOOR = 0;
export const EPI_CEILING = 100;

export type DimensionName = "Focus" | "Calm" | "Motivation" | "Balance";

export interface Dimensions {
  focus: number;
  calm: number;
  motivation: number;
  balance: number;
}

export interface RankedDimension {
  name: DimensionName;
  score: number;
  /** Distance from the floor of the scale. A 30 is at the floor, not at zero. */
  aboveFloor: number;
  /** Distance from the ceiling of the scale. */
  belowCeiling: number;
  atFloor: boolean;
  atCeiling: boolean;
}

export interface DimensionPair {
  higher: DimensionName;
  lower: DimensionName;
  /** Exact difference on the 30-99 scale. Always >= 0. */
  gap: number;
}

export interface ProfileRelationships {
  scale: {
    dimensionFloor: number;
    dimensionCeiling: number;
    epiFloor: number;
    epiCeiling: number;
  };
  /** Descending by score. Ties keep the engine's own dimension order. */
  ranked: RankedDimension[];
  highest: RankedDimension;
  lowest: RankedDimension;
  /** highest - lowest. The width of the whole profile. */
  spread: number;
  /** spread as a fraction of the 69-point scale. Arithmetic, not a band. */
  spreadShare: number;
  /** highest - second highest. How clear the leading dimension is. */
  leadOverSecond: number;
  /** All six pairwise gaps, largest first. */
  pairs: DimensionPair[];
  /** Names sitting exactly at the scale boundaries, if any. */
  atCeiling: DimensionName[];
  atFloor: DimensionName[];
  /** Plain-language restatements of the arithmetic above. Level 2, no more. */
  observations: string[];
}

/**
 * The engine's own dimension order, used to break display ties so the same
 * profile always reads the same way. This is presentation order only — it is
 * NOT the engine's mode tie-break, which lives in engine/scores.ts and has
 * already decided the mode by the time anything here runs.
 */
const DIMENSION_ORDER: DimensionName[] = [
  "Focus",
  "Calm",
  "Motivation",
  "Balance",
];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Turn four scores into the relationships Rhodes actually reasons from.
 *
 * Pure arithmetic on supplied values. No thresholds, no judgements, no
 * vocabulary that implies a finding.
 */
export function deriveRelationships(
  dimensions: Dimensions,
): ProfileRelationships {
  const byName: Record<DimensionName, number> = {
    Focus: dimensions.focus,
    Calm: dimensions.calm,
    Motivation: dimensions.motivation,
    Balance: dimensions.balance,
  };

  const ranked: RankedDimension[] = DIMENSION_ORDER.map((name) => {
    const score = byName[name];
    return {
      name,
      score,
      aboveFloor: round1(score - DIMENSION_FLOOR),
      belowCeiling: round1(DIMENSION_CEILING - score),
      atFloor: score <= DIMENSION_FLOOR,
      atCeiling: score >= DIMENSION_CEILING,
    };
  }).sort((a, b) => b.score - a.score);

  const highest = ranked[0];
  const lowest = ranked[ranked.length - 1];
  const spread = round1(highest.score - lowest.score);
  const leadOverSecond = round1(highest.score - ranked[1].score);

  const pairs: DimensionPair[] = [];
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      pairs.push({
        higher: ranked[i].name,
        lower: ranked[j].name,
        gap: round1(ranked[i].score - ranked[j].score),
      });
    }
  }
  pairs.sort((a, b) => b.gap - a.gap);

  const atCeiling = ranked.filter((r) => r.atCeiling).map((r) => r.name);
  const atFloor = ranked.filter((r) => r.atFloor).map((r) => r.name);

  const observations: string[] = [];
  const widest = pairs[0];
  if (widest && widest.gap > 0) {
    observations.push(
      `The widest gap in this profile is ${widest.higher} over ${widest.lower}, ${widest.gap} points on the 30-99 dimension scale.`,
    );
  }
  observations.push(
    `Ordering, highest to lowest: ${ranked
      .map((r) => `${r.name} ${r.score}`)
      .join(", ")}.`,
  );
  observations.push(
    `The profile spans ${spread} points of the 69-point scale; the leading dimension sits ${leadOverSecond} above the second.`,
  );
  // Stated in BOTH directions on purpose. Reporting only the dimensions that
  // ARE at a boundary leaves the negative case unsaid, and the negative case
  // is the one that gets misstated: three of nine first drafts in validation
  // put a dimension "at the floor" or "at the ceiling" that was at neither.
  observations.push(
    atCeiling.length > 0
      ? `At the ceiling of the scale (${DIMENSION_CEILING}): ${atCeiling.join(", ")}. No other dimension may be described as at the ceiling.`
      : `NO dimension is at the ceiling of the scale (${DIMENSION_CEILING}). Do not describe any of them as being at it, at maximum, or maxed out.`,
  );
  observations.push(
    atFloor.length > 0
      ? `At the floor of the scale (${DIMENSION_FLOOR}): ${atFloor.join(", ")}. That is the lowest value the scale can express, which is not the same as the property being absent. No other dimension may be described as at the floor.`
      : `NO dimension is at the floor of the scale (${DIMENSION_FLOOR}). Do not describe any of them as being at it, at minimum, or bottomed out — say where they sit relative to the others instead.`,
  );

  return {
    scale: {
      dimensionFloor: DIMENSION_FLOOR,
      dimensionCeiling: DIMENSION_CEILING,
      epiFloor: EPI_FLOOR,
      epiCeiling: EPI_CEILING,
    },
    ranked,
    highest,
    lowest,
    spread,
    spreadShare: round1((spread / DIMENSION_SPAN) * 100) / 100,
    leadOverSecond,
    pairs,
    atCeiling,
    atFloor,
    observations,
  };
}

/**
 * The gap between two named dimensions, signed from `a` to `b`.
 * Exposed for tests that assert an adversarial profile really does have the
 * asymmetry it claims to have.
 */
export function gapBetween(
  dimensions: Dimensions,
  a: DimensionName,
  b: DimensionName,
): number {
  const byName: Record<DimensionName, number> = {
    Focus: dimensions.focus,
    Calm: dimensions.calm,
    Motivation: dimensions.motivation,
    Balance: dimensions.balance,
  };
  return round1(byName[a] - byName[b]);
}
