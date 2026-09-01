import "server-only";
import {
  generateReport,
  generateChrpReading,
  type TrackData,
} from "@/lib/prompts/report";
import type { Mode, PaidSections } from "@/lib/fixtures/tracks";

/**
 * Real paid-report generation.
 *
 * This is the bridge the audit found missing: the entitlement-gated route
 * previously called `getFullReport(slug)` with no generated content, so in
 * production — where fixtures are refused — every paid read fell through to
 * 503. Generation now happens here, from REAL analysis facts, and the result
 * is persisted so an authorized re-read costs nothing.
 *
 * Two rules govern this module:
 *
 *   1. Nothing is invented. Every field handed to the generator comes from
 *      upstream analysis. Where upstream has no value, the field is omitted
 *      from the prompt payload rather than filled with a plausible one.
 *
 *   2. It fails closed. If the key is absent, a required upstream fact is
 *      missing, or the model errors, this returns a typed failure. The caller
 *      reports honestly and keeps the entitlement — it never substitutes
 *      fixture prose in production.
 */

export const GENERATOR_VERSION = "chrp-report-v1";
export const GENERATOR_MODEL = "claude-sonnet-4-5";

/**
 * The facts a completed analysis can actually supply, before any generation
 * has occurred. Optional fields are optional because upstream genuinely may
 * not have them — not because they are unimportant.
 */
export interface AnalysisFacts {
  title: string;
  artist: string;
  mode: Mode;
  epiScore: number;
  /**
   * The four scored dimensions. The highest of these IS the EPI score, and
   * which one it is determines the mode — so without them the generator can
   * only see the winning number, not the profile that produced it.
   */
  dimensions?: {
    focus: number;
    calm: number;
    motivation: number;
    balance: number;
  } | null;

  // Real audio features, when the analysis carried them.
  bpm?: number;
  valence?: number;
  /**
   * CHRP's weighted arousal — the value EPI was computed from. Deliberately
   * not called `energy`: energy is one of its five inputs, and labelling a
   * composite as a raw feature would put an unmeasured claim in the report.
   */
  arousal?: number;
  instrumentalness?: number;

  // Corpus ranking, when the engine produces it.
  percentileCorpus?: string;
  percentileMode?: string;
  comparableArtists?: string[];
}

export type GenerationFailure =
  | { reason: "no_api_key"; detail: string }
  | { reason: "generation_failed"; detail: string };

export type GenerationResult =
  | { ok: true; sections: PaidSections }
  | ({ ok: false } & GenerationFailure);

/**
 * Map real analysis facts onto the generator's input shape.
 *
 * This replaces the circular path the audit found: `payloadToTrackData`
 * required a full `ReportPayload` — including the very paid sections being
 * generated — so it could only ever run against fixtures. Nothing here reads
 * a paid field.
 *
 * Absent optional facts are left `undefined`, and `JSON.stringify` drops them
 * from the prompt payload. The model is never shown a fabricated value.
 */
export function factsToTrackData(facts: AnalysisFacts): TrackData {
  return {
    track: facts.title,
    artist: facts.artist,
    mode: facts.mode,
    epi_score: facts.epiScore,
    dimensions: facts.dimensions ?? undefined,
    percentile_corpus: facts.percentileCorpus,
    percentile_mode: facts.percentileMode,
    comparable_artists: facts.comparableArtists,
    bpm: facts.bpm,
    spotify_valence: facts.valence,
    chrp_arousal: facts.arousal,
    spotify_instrumentalness: facts.instrumentalness,
  };
}

export async function generatePaidSections(
  facts: AnalysisFacts,
): Promise<GenerationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      reason: "no_api_key",
      detail: "ANTHROPIC_API_KEY is not configured",
    };
  }

  try {
    const trackData = factsToTrackData(facts);
    const sections = await generateReport(trackData);
    const rhodes = await generateChrpReading(
      trackData,
      JSON.stringify(sections, null, 2),
    );

    return {
      ok: true,
      sections: {
        rhodes,
        signature: sections.signature,
        placements: sections.placements,
        throughline: sections.throughline,
        comparable: sections.comparable,
        // Brief counts, vertical percentages and sample briefs are demand
        // claims the scoring cannot support — the system prompt forbids them
        // explicitly. Empty is the only honest production value.
        where_this_music_lives: {
          verticals: [],
          confidence: null,
          n_briefs: null,
          sample_brief: null,
        },
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "generation_failed",
      detail: err instanceof Error ? err.message : "generation failed",
    };
  }
}
