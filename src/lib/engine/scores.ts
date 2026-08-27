/**
 * CHRP scoring math + EPI translation layer.
 *
 * Two responsibilities:
 *   1. Turn 10 Soundcharts audio features into the four CHRP scores
 *      (focus / calm / motivation / balance) via calculateScores().
 *   2. Translate those four scores + the raw energy/valence pair into
 *      an EPI reading (epiScore, mode, circumplex, verdict) that the
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

export type Verdict = "Pitch Now" | "Develop" | "Hold";

export interface EPIResult {
  epiScore: number;
  mode: Mode;
  circumplex: { valence: number; arousal: number };
  verdict: Verdict;
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

// ─── calculateScores stub (NEEDS Python port) ─────────────────────────────
//
// The Python scores.py contains:
//   1. Normalization for tempo (BPM), loudness (dB), and timeSignature so
//      each lands in 0–1.
//   2. Per-metric weight tables — a 10-way weighted sum over the audio
//      features that produces the raw 0–1 score before transformScore
//      applies the display curve.
//
// Once both are ported, populate WEIGHTS + NORMALIZE and flip
// WEIGHTS_READY to true.

const WEIGHTS_READY = false;

const WEIGHTS: Record<Metric, Partial<Record<AudioFeatureKey, number>>> = {
  focus:      { /* TODO: paste from Python */ },
  calm:       { /* TODO */ },
  motivation: { /* TODO */ },
  balance:    { /* TODO */ },
};

function normalizeTempo(bpm: number): number {
  void bpm;
  throw new Error("normalizeTempo: not ported from Python yet");
}
function normalizeLoudness(db: number): number {
  void db;
  throw new Error("normalizeLoudness: not ported from Python yet");
}
function normalizeTimeSignature(ts: number): number {
  void ts;
  throw new Error("normalizeTimeSignature: not ported from Python yet");
}

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

  if (!WEIGHTS_READY) {
    throw new Error(
      "calculateScores: Python weight tables + normalization not yet ported. See TODO in src/lib/engine/scores.ts.",
    );
  }

  // Normalize the three non-[0,1] features so every dimension lands on the
  // same scale before the weighted sums.
  const norm: AudioFeatures = {
    ...f,
    tempo: normalizeTempo(f.tempo),
    loudness: normalizeLoudness(f.loudness),
    timeSignature: normalizeTimeSignature(f.timeSignature),
  };

  const weightedSum = (metric: Metric): number => {
    const table = WEIGHTS[metric];
    let sum = 0;
    for (const [k, w] of Object.entries(table) as Array<
      [AudioFeatureKey, number]
    >) {
      sum += (norm[k] ?? 0) * w;
    }
    return sum;
  };

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    focus:      round1(transformScore("focus",      weightedSum("focus"))),
    calm:       round1(transformScore("calm",       weightedSum("calm"))),
    motivation: round1(transformScore("motivation", weightedSum("motivation"))),
    balance:    round1(transformScore("balance",    weightedSum("balance"))),
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

function verdictFor(epiScore: number): Verdict {
  if (epiScore >= 80) return "Pitch Now";
  if (epiScore >= 60) return "Develop";
  return "Hold";
}

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
export function translateToEPI(
  scores: { focus: number; calm: number; motivation: number; balance: number },
  energy: number,
  valence: number,
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
  return {
    epiScore: winnerScore,
    mode: MODE_FOR[winner],
    circumplex: { valence, arousal: energy },
    verdict: verdictFor(winnerScore),
  };
}

// Re-export so the analyze route can 422 on feature-missing errors.
export { AudioFeatureError };
