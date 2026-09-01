import { describe, expect, it } from "vitest";
import {
  calculateScores,
  calculateArousal,
  calculateEpi,
  translateToEPI,
  clamp,
  EPI_DISPLAY_SCALE,
} from "@/lib/engine/scores";
import { analysisToFreeReport } from "@/lib/engine/analysis-mapping";

/**
 * EPI is (arousal + valence) / 2 — NOT the dominant performance dimension.
 *
 * The bug these tests lock out: EPI was being set to
 * max(focus, calm, motivation, balance), which collapsed three distinct
 * things — the overall affective score, the four-dimension performance
 * profile, and the mode — into one number.
 */

type Features = Record<string, number>;

/** A complete, valid Soundcharts audio-feature set. */
function features(over: Partial<Features> = {}): Features {
  return {
    acousticness: 0.3,
    danceability: 0.5,
    energy: 0.6,
    instrumentalness: 0.2,
    liveness: 0.15,
    loudness: -8,
    speechiness: 0.08,
    tempo: 120,
    timeSignature: 4,
    valence: 0.5,
    ...over,
  };
}

/**
 * The formula as supplied, reimplemented independently of the engine so the
 * test would fail if the engine's version drifted.
 */
function expectedEpi(f: Features): number {
  const tempoNorm = clamp((f.tempo - 60) / 120);
  const loudNorm = clamp((f.loudness + 60) / 60);
  const arousal =
    0.35 * clamp(f.energy) +
    0.25 * tempoNorm +
    0.2 * loudNorm +
    0.1 * clamp(f.danceability) +
    0.1 * (1 - clamp(f.acousticness));
  return ((arousal + clamp(f.valence)) / 2) * EPI_DISPLAY_SCALE;
}

describe("EPI is the supplied arousal/valence formula", () => {
  it("matches an independent implementation of the formula", () => {
    for (const f of [
      features(),
      features({ energy: 0.97, tempo: 145, loudness: -4, valence: 0.72 }),
      features({ energy: 0.12, tempo: 68, loudness: -22, valence: 0.11 }),
      features({ danceability: 0.9, acousticness: 0.05 }),
    ]) {
      expect(calculateEpi(f)).toBeCloseTo(expectedEpi(f), 1);
    }
  });

  it("weights arousal exactly as specified", () => {
    // All-max inputs: every weighted term contributes its full coefficient,
    // so arousal must be 1 and EPI must be (1 + valence) / 2.
    const f = features({
      energy: 1,
      tempo: 180,
      loudness: 0,
      danceability: 1,
      acousticness: 0,
      valence: 1,
    });
    expect(calculateArousal(f)).toBeCloseTo(1, 5);
    expect(calculateEpi(f)).toBeCloseTo(100, 5);
  });

  it("stays inside 0-100 at both extremes", () => {
    const floor = features({
      energy: 0, tempo: 0, loudness: -60, danceability: 0,
      acousticness: 1, valence: 0,
    });
    const ceiling = features({
      energy: 1, tempo: 300, loudness: 20, danceability: 1,
      acousticness: 0, valence: 1,
    });
    expect(calculateEpi(floor)).toBeGreaterThanOrEqual(0);
    expect(calculateEpi(ceiling)).toBeLessThanOrEqual(100);
  });
});

describe("EPI is NOT the dominant dimension", () => {
  it("differs from max(focus, calm, motivation, balance)", () => {
    // A profile with a towering Motivation. Under the bug, EPI was that
    // dimension's value; it must not be now.
    const f = features({ energy: 0.95, tempo: 160, loudness: -3, valence: 0.2 });
    const scores = calculateScores(f);
    const max = Math.max(scores.focus, scores.calm, scores.motivation, scores.balance);
    const { epiScore } = translateToEPI(scores, f);
    expect(epiScore).not.toBeCloseTo(max, 1);
    expect(epiScore).toBeCloseTo(expectedEpi(f), 1);
  });

  it("lets EPI sit below the dominant dimension without contradiction", () => {
    const f = features({ energy: 0.9, tempo: 150, loudness: -4, valence: 0.05 });
    const scores = calculateScores(f);
    const { epiScore, mode } = translateToEPI(scores, f);
    // Low valence pulls EPI down even though Motivation is high — exactly the
    // "EPI 58 / Ready / Motivation 78" case the correction permits.
    expect(scores.motivation).toBeGreaterThan(epiScore);
    expect(mode).toBe("Ready");
  });
});

describe("EPI responds to its own inputs", () => {
  it("rises with valence, all else equal", () => {
    const low = calculateEpi(features({ valence: 0.1 }));
    const high = calculateEpi(features({ valence: 0.9 }));
    expect(high).toBeGreaterThan(low);
    // valence carries half the weight, so +0.8 valence is +40 EPI.
    expect(high - low).toBeCloseTo(40, 1);
  });

  it("rises with each arousal input, all else equal", () => {
    const base = calculateEpi(features());
    expect(calculateEpi(features({ energy: 0.95 }))).toBeGreaterThan(base);
    expect(calculateEpi(features({ tempo: 175 }))).toBeGreaterThan(base);
    expect(calculateEpi(features({ loudness: -2 }))).toBeGreaterThan(base);
    expect(calculateEpi(features({ danceability: 0.95 }))).toBeGreaterThan(base);
    // Less acoustic means MORE arousal: the term is (1 - acousticness).
    expect(calculateEpi(features({ acousticness: 0.01 }))).toBeGreaterThan(base);
  });
});

describe("the correction changes nothing else", () => {
  it("leaves Focus / Calm / Motivation / Balance untouched", () => {
    // Regression lock on Alan's formulas — these must not move.
    const s = calculateScores(features());
    expect(s.focus).toBeCloseTo(99, 1);
    expect(s.calm).toBeCloseTo(63.3, 1);
    expect(s.motivation).toBeCloseTo(45.8, 1);
    expect(s.balance).toBeCloseTo(98.8, 1);
  });

  it("keeps mode governed by the dominant dimension, not by EPI", () => {
    const f = features({ energy: 0.95, tempo: 165, loudness: -3, valence: 0.5 });
    const scores = calculateScores(f);
    const { mode } = translateToEPI(scores, f);
    const entries = [
      ["Flow", scores.focus],
      ["Ready", scores.motivation],
      ["Recharge", scores.calm],
      ["Recover", scores.balance],
    ] as const;
    const dominant = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    expect(mode).toBe(dominant);
  });

  it("reports the weighted arousal in the circumplex, not raw energy", () => {
    const f = features({ energy: 0.6, tempo: 175, loudness: -2, acousticness: 0 });
    const { circumplex } = translateToEPI(calculateScores(f), f);
    expect(circumplex.arousal).not.toBeCloseTo(f.energy, 2);
    expect(circumplex.arousal).toBeCloseTo(calculateArousal(f), 2);
    expect(circumplex.valence).toBeCloseTo(f.valence, 5);
  });
});

describe("one EPI everywhere", () => {
  it("carries the engine's EPI into the report payload unchanged but rounded", () => {
    const f = features({ energy: 0.8, tempo: 140, loudness: -5, valence: 0.65 });
    const scores = calculateScores(f);
    const epi = translateToEPI(scores, f);
    const report = analysisToFreeReport({
      song: { songId: null, isrc: "TEST00000001", songName: "T", artistName: "A", artworkUrl: null },
      scores,
      epiScore: epi.epiScore,
      mode: epi.mode,
      circumplex: epi.circumplex,
      verdict: epi.verdict,
    });
    expect(report.epi.score).toBe(Math.round(epi.epiScore));
    expect(report.epi.mode).toBe(epi.mode);
    // The report must never show a dimension value as the EPI Score.
    const dims = report.chrp_scores.map((r) => r.score);
    expect(dims).not.toContain(report.epi.score);
  });
});
