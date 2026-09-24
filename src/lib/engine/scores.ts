/**
 * CHRP scoring math + EPI translation layer.
 *
 * Two responsibilities:
 *   1. Turn 10 Soundcharts audio features into nine CHRP scores
 *      (focus / calm / motivation / balance / performance / arousal /
 *      valence / dominance / epi) via calculateScores().
 *   2. Translate those scores into an EPI reading (epiScore, mode,
 *      circumplex) that the report + UI speak.
 *
 * Helpers (clamp / mu / displayRange / transformScore) and the nine
 * transform constants are ported EXACTLY from Python scores.py — a
 * mistyped digit gives silently wrong scores.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type Metric =
  | "focus" | "calm" | "motivation" | "balance"
  | "performance" | "arousal" | "valence" | "dominance" | "epi";

/** The four performance-profile dimensions that determine Mode. */
type PerformanceMetric = "focus" | "calm" | "motivation" | "balance";

export type Mode = "Flow" | "Ready" | "Recharge" | "Recover";

export interface EPIResult {
  epiScore: number;
  mode: Mode;
  circumplex: { valence: number; arousal: number };
}

// ─── Transform constants (from Python scores.py — DO NOT retype) ──────────

const TRANSFORMS: Record<Metric, { scale: number; offset: number }> = {
  focus:       { scale: 6.352027649965183,  offset: -307.6384349620903 },
  calm:        { scale: 2.2682063084392743, offset: -79.88027841349903 },
  motivation:  { scale: 2.832530477065698,  offset: -162.0136018863432 },
  balance:     { scale: 2.4320539093125175, offset: -105.01686000194384 },
  performance: { scale: 3.698121474074254,  offset: -253.5698748289879 },
  arousal:     { scale: 2.568268423277538,  offset: -140.47889015258107 },
  valence:     { scale: 1.0,                offset: 0.0 },
  dominance:   { scale: 3.564436010695731,  offset: -248.48275795000663 },
  epi:         { scale: 0.8579332201162704, offset: 16.773823023986587 },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

export function clamp(value: number, lower = 0, upper = 1): number {
  return Math.max(lower, Math.min(upper, value));
}

export function mu(value: number): number {
  return 1 - Math.abs(2 * value - 1);
}

export function displayRange(value: number): number {
  return 30 + clamp(value) * 69;
}

export function transformScore(metric: Metric, rawValue: number): number {
  const { scale, offset } = TRANSFORMS[metric];
  return clamp(displayRange(rawValue) * scale + offset, 30, 99);
}

// ─── Audio-feature validation ──────────────────────────────────────────────

const REQUIRED_FEATURES = [
  "acousticness",
  "danceability",
  "energy",
  "instrumentalness",
  "liveness",
  "loudness",
  "speechiness",
  "tempo",
  "timeSignature",
  "valence",
] as const;

export type AudioFeatureKey = (typeof REQUIRED_FEATURES)[number];
export type AudioFeatures = Record<AudioFeatureKey, number>;

class AudioFeatureError extends Error {
  status = 422;
  constructor(message: string) {
    super(message);
    this.name = "AudioFeatureError";
  }
}

function requireFeatures(audio: unknown): AudioFeatures {
  if (!audio || typeof audio !== "object") {
    throw new AudioFeatureError("audio features object missing");
  }
  const src = audio as Record<string, unknown>;
  const out = {} as AudioFeatures;
  for (const k of REQUIRED_FEATURES) {
    const v = src[k];
    if (typeof v !== "number" || Number.isNaN(v)) {
      throw new AudioFeatureError(
        `missing or non-numeric audio feature: ${k}`,
      );
    }
    out[k] = v;
  }
  return out;
}

// ─── Feature normalization (three non-[0,1] features) ─────────────────────
// Each maps its natural range into 0-1 and clamps out-of-range values so
// downstream weighted sums stay bounded.

function normalizeTempo(bpm: number): number {
  return clamp((bpm - 60) / 120);
}
function normalizeLoudness(db: number): number {
  return clamp((db + 60) / 60);
}
function normalizeTimeSignature(ts: number): number {
  return clamp((ts - 3) / 4);
}

// ─── calculateScores ──────────────────────────────────────────────────────
//
// Turn the 10 Soundcharts audio features into the four CHRP scores.
// Each formula's coefficients sum to 1.0 so the raw score lands in 0-1
// before transformScore applies the per-metric display curve.
//
// mu(x) = 1 - |2x - 1| — rewards the middle: 1 at 0.5, 0 at extremes.
// (1 - x) inverts a 0-1 feature so "less of x" contributes positively.

/**
 * Compute nine CHRP scores from a Soundcharts audio-features object.
 * Rounds each to 1 decimal.
 *
 * Throws AudioFeatureError (status=422) if any required feature is missing
 * or non-numeric — the analyze route surfaces that as a 422 response.
 */
export function calculateScores(audio: unknown): {
  focus: number;
  calm: number;
  motivation: number;
  balance: number;
  performance: number;
  arousal: number;
  valence: number;
  dominance: number;
  epi: number;
} {
  const f = requireFeatures(audio);

  // Normalize the three non-[0,1] features so every dimension lands on the
  // same scale before the weighted sums.
  const norm: AudioFeatures = {
    ...f,
    tempo: normalizeTempo(f.tempo),
    loudness: normalizeLoudness(f.loudness),
    timeSignature: normalizeTimeSignature(f.timeSignature),
  };

  // --- FOCUS: instrumental, not too loud, moderate tempo/energy, danceable ---
  const rawFocus =
      0.25 * norm.instrumentalness
    + 0.20 * (1 - norm.loudness)
    + 0.20 * mu(norm.tempo)
    + 0.15 * norm.danceability
    + 0.10 * mu(norm.energy)
    + 0.05 * mu(norm.timeSignature)
    + 0.05 * (1 - norm.speechiness);

  // --- CALM: low energy, slow, positive, acoustic, quiet, studio ---
  const rawCalm =
      0.35 * (1 - norm.energy)
    + 0.20 * (1 - norm.tempo)
    + 0.15 * norm.valence
    + 0.10 * norm.acousticness
    + 0.08 * (1 - norm.loudness)
    + 0.07 * (1 - norm.speechiness)
    + 0.05 * (1 - norm.liveness);

  // --- MOTIVATION: energetic, positive, loud, danceable ---
  const rawMotivation =
      0.35 * norm.energy
    + 0.30 * norm.valence
    + 0.20 * norm.loudness
    + 0.15 * norm.danceability;

  // --- BALANCE: moderate values across the board ---
  const rawBalance =
      0.30 * mu(norm.energy)
    + 0.30 * mu(norm.valence)
    + 0.15 * mu(norm.tempo)
    + 0.15 * mu(norm.loudness)
    + 0.10 * norm.danceability;

  // --- PERFORMANCE: energetic, loud, produced, has vocals, moderate tempo ---
  const rawPerformance =
      0.25 * norm.energy
    + 0.20 * norm.loudness
    + 0.15 * norm.danceability
    + 0.10 * (1 - norm.acousticness)
    + 0.10 * (1 - norm.instrumentalness)
    + 0.10 * mu(norm.tempo)
    + 0.10 * (1 - norm.speechiness);

  // --- AROUSAL: intensity (energy, tempo, loudness) ---
  const rawArousal =
      0.35 * norm.energy
    + 0.25 * norm.tempo
    + 0.20 * norm.loudness
    + 0.10 * norm.danceability
    + 0.10 * (1 - norm.acousticness);

  // --- VALENCE: Soundcharts valence as-is ---
  const rawValence = norm.valence;

  // --- DOMINANCE: loud, energetic, produced, vocal, moderate mood, studio ---
  const rawDominance =
      0.30 * norm.loudness
    + 0.25 * norm.energy
    + 0.15 * (1 - norm.acousticness)
    + 0.10 * (1 - norm.instrumentalness)
    + 0.10 * mu(norm.valence)
    + 0.10 * (1 - norm.liveness);

  // --- EPI: mostly valence, plus a bonus when happy and energetic ---
  const energyBoost = norm.valence * norm.energy;
  const rawEpi = 0.20 + 0.60 * norm.valence + 0.20 * energyBoost;

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    focus:       round1(transformScore("focus",       rawFocus)),
    calm:        round1(transformScore("calm",        rawCalm)),
    motivation:  round1(transformScore("motivation",  rawMotivation)),
    balance:     round1(transformScore("balance",     rawBalance)),
    performance: round1(transformScore("performance", rawPerformance)),
    arousal:     round1(transformScore("arousal",     rawArousal)),
    valence:     round1(transformScore("valence",     rawValence)),
    dominance:   round1(transformScore("dominance",   rawDominance)),
    epi:         round1(transformScore("epi",         rawEpi)),
  };
}

// ─── EPI translation layer ─────────────────────────────────────────────────

// Score-name -> Mode mapping (the four performance dimensions only).
const MODE_FOR: Record<PerformanceMetric, Mode> = {
  focus: "Flow",
  motivation: "Ready",
  calm: "Recharge",
  balance: "Recover",
};

// Tie-break priority: earlier wins. Ready > Flow > Recharge > Recover.
const TIE_PRIORITY: PerformanceMetric[] = ["motivation", "focus", "calm", "balance"];

/**
 * Translate the four CHRP scores + raw energy/valence into an EPI reading.
 *
 * The dominant score determines the mode (and its value is the EPI Score).
 * On exact ties, priority is Ready > Flow > Recharge > Recover, so a track
 * that reads Ready when tied with Flow still ships as Ready.
 *
 * arousal in the circumplex is the raw energy value; valence is passed
 * through as-is.
 */
/**
 * Raw arousal (0-1), used for the circumplex plot. Same weights as the
 * arousal metric in calculateScores; kept as a convenience so translateToEPI
 * can produce the 0-1 circumplex value without re-deriving it.
 */
export function calculateArousal(audio: unknown): number {
  const f = requireFeatures(audio);
  return (
      0.35 * clamp(f.energy)
    + 0.25 * normalizeTempo(f.tempo)
    + 0.20 * normalizeLoudness(f.loudness)
    + 0.10 * clamp(f.danceability)
    + 0.10 * (1 - clamp(f.acousticness))
  );
}

/**
 * Translate the nine CHRP scores plus audio features into an EPI reading.
 *
 * Three separate things come out:
 *   epiScore   — from calculateScores (Python formula, 30-99 scale)
 *   mode       — which of the four performance dimensions dominates
 *   circumplex — raw 0-1 arousal/valence pair for the UI plot
 */
export function translateToEPI(
  scores: {
    focus: number; calm: number; motivation: number; balance: number;
    epi: number;
  },
  audio: unknown,
): EPIResult {
  let winner: PerformanceMetric = TIE_PRIORITY[0];
  let winnerScore = scores[winner];
  for (const m of TIE_PRIORITY) {
    if (scores[m] > winnerScore) {
      winner = m;
      winnerScore = scores[m];
    }
  }
  const f = requireFeatures(audio);
  const rawArousal = calculateArousal(audio);

  return {
    epiScore: scores.epi,
    mode: MODE_FOR[winner],
    circumplex: {
      valence: clamp(f.valence),
      arousal: Math.round(rawArousal * 1000) / 1000,
    },
  };
}

/**
 * Standalone EPI convenience — calls calculateScores and returns just the
 * epi metric. On the 30-99 transformed scale (same as all other metrics).
 */
export function calculateEpi(audio: unknown): number {
  return calculateScores(audio).epi;
}

// Re-export so the analyze route can 422 on feature-missing errors.
export { AudioFeatureError };
