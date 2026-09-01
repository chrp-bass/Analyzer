/**
 * CHRP scoring math + EPI translation layer.
 *
 * Two responsibilities:
 *   1. Turn 10 Soundcharts audio features into the four CHRP scores
 *      (focus / calm / motivation / balance) via calculateScores().
 *   2. Translate those four scores + the raw energy/valence pair into
 *      an EPI reading (epiScore, mode, circumplex) that the
 *      report + UI speak.
 *
 * Helpers (clamp / mu / displayRange / transformScore) and the four
 * transform constants are ported EXACTLY from Python scores.py — a
 * mistyped digit gives silently wrong scores.
 *
 * calculateScores() itself is a stub until the Python weight tables
 * and tempo/loudness/timeSignature normalization formulas are pasted
 * in. Toggle WEIGHTS_READY once they are.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type Metric = "focus" | "calm" | "motivation" | "balance";

export type Mode = "Flow" | "Ready" | "Recharge" | "Recover";

export interface EPIResult {
  epiScore: number;
  mode: Mode;
  circumplex: { valence: number; arousal: number };
}

// ─── Transform constants (from Python scores.py — DO NOT retype) ──────────

const TRANSFORMS: Record<Metric, { scale: number; offset: number }> = {
  focus:      { scale: 6.352027649965183,  offset: -307.6384349620903 },
  calm:       { scale: 2.2682063084392743, offset: -79.88027841349903 },
  motivation: { scale: 2.832530477065698,  offset: -162.0136018863432 },
  balance:    { scale: 2.4320539093125175, offset: -105.01686000194384 },
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
 * Compute the four CHRP scores from a Soundcharts audio-features object.
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

  const rawFocus =
      0.30 * norm.instrumentalness
    + 0.20 * norm.danceability
    + 0.15 * mu(norm.energy)
    + 0.10 * mu(norm.tempo)
    + 0.10 * mu(norm.loudness)
    + 0.10 * mu(norm.timeSignature)
    + 0.05 * (1 - norm.speechiness);

  const rawCalm =
      0.30 * (1 - norm.energy)
    + 0.25 * norm.valence
    + 0.15 * norm.acousticness
    + 0.10 * (1 - norm.loudness)
    + 0.10 * (1 - norm.speechiness)
    + 0.10 * (1 - norm.liveness);

  const rawMotivation =
      0.35 * norm.energy
    + 0.20 * norm.tempo
    + 0.20 * norm.loudness
    + 0.15 * norm.danceability
    + 0.10 * (1 - norm.acousticness);

  const rawBalance =
      0.30 * mu(norm.energy)
    + 0.30 * mu(norm.valence)
    + 0.15 * mu(norm.tempo)
    + 0.15 * mu(norm.loudness)
    + 0.10 * norm.danceability;

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    focus:      round1(transformScore("focus",      rawFocus)),
    calm:       round1(transformScore("calm",       rawCalm)),
    motivation: round1(transformScore("motivation", rawMotivation)),
    balance:    round1(transformScore("balance",    rawBalance)),
  };
}

// ─── EPI translation layer ─────────────────────────────────────────────────

// Score-name -> Mode mapping.
const MODE_FOR: Record<Metric, Mode> = {
  focus: "Flow",
  motivation: "Ready",
  calm: "Recharge",
  balance: "Recover",
};

// Tie-break priority: earlier wins. Ready > Flow > Recharge > Recover.
const TIE_PRIORITY: Metric[] = ["motivation", "focus", "calm", "balance"];

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
 * Arousal weights, supplied by CHRP's engineer. NOT derived from the four
 * performance dimensions — this is a separate reading of the same normalized
 * audio features.
 */
const AROUSAL_WEIGHTS = {
  energy: 0.35,
  tempo: 0.25,
  loudness: 0.20,
  danceability: 0.10,
  nonAcousticness: 0.10,
} as const;

/** EPI is reported on a 0-100 scale. epi_raw is 0-1, so this is the factor. */
export const EPI_DISPLAY_SCALE = 100;

/**
 * CHRP arousal, from the same normalized features calculateScores() uses.
 * Reuses normalizeTempo/normalizeLoudness deliberately: a second
 * normalization path would be a second source of truth.
 */
export function calculateArousal(audio: unknown): number {
  const f = requireFeatures(audio);
  return (
      AROUSAL_WEIGHTS.energy * clamp(f.energy)
    + AROUSAL_WEIGHTS.tempo * normalizeTempo(f.tempo)
    + AROUSAL_WEIGHTS.loudness * normalizeLoudness(f.loudness)
    + AROUSAL_WEIGHTS.danceability * clamp(f.danceability)
    + AROUSAL_WEIGHTS.nonAcousticness * (1 - clamp(f.acousticness))
  );
}

/**
 * THE canonical EPI Score.
 *
 * epi = (arousal + valence) / 2, on a 0-100 scale.
 *
 * EPI is deliberately NOT max(focus, calm, motivation, balance). Those four
 * are the performance PROFILE; EPI is an overall affective reading from
 * arousal and valence. A song may legitimately show EPI 58, Ready mode and
 * Motivation 78 — the numbers are not required to agree, and making them
 * agree was the bug this replaces.
 */
export function calculateEpi(audio: unknown): number {
  const f = requireFeatures(audio);
  const arousal = calculateArousal(audio);
  const raw = (arousal + clamp(f.valence)) / 2;
  return Math.round(raw * EPI_DISPLAY_SCALE * 10) / 10;
}

/**
 * Translate the four CHRP scores plus the audio features into an EPI reading.
 *
 * Three separate things come out of here and must stay separate:
 *   epiScore  — (arousal + valence) / 2, from calculateEpi
 *   mode      — which of the four dimensions dominates
 *   circumplex— the arousal/valence pair EPI was computed from
 *
 * No verdict. CHRP does not judge whether a song is ready, viable or worth
 * pitching — it reports what the song is doing and leaves the decision with
 * the creator.
 */
export function translateToEPI(
  scores: { focus: number; calm: number; motivation: number; balance: number },
  audio: unknown,
): EPIResult {
  let winner: Metric = TIE_PRIORITY[0];
  let winnerScore = scores[winner];
  for (const m of TIE_PRIORITY) {
    if (scores[m] > winnerScore) {
      winner = m;
      winnerScore = scores[m];
    }
    // On tie, an earlier-priority metric was already selected; skip.
  }
  const f = requireFeatures(audio);
  const arousal = calculateArousal(audio);
  const epiScore = calculateEpi(audio);

  return {
    epiScore,
    // Mode is unchanged: still the dominant performance dimension. It is a
    // classification of the profile, not a restatement of EPI.
    mode: MODE_FOR[winner],
    circumplex: {
      valence: clamp(f.valence),
      // The weighted CHRP arousal EPI was computed from — previously this
      // reported raw energy, which is only one of its five inputs.
      arousal: Math.round(arousal * 1000) / 1000,
    },
  };
}

// Re-export so the analyze route can 422 on feature-missing errors.
export { AudioFeatureError };
