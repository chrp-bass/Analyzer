import "server-only";
import {
  generateSongIntelligence,
  RHODES_MODEL,
  RHODES_VERSION,
  type SongIntelligenceInput,
} from "@/lib/rhodes";
import type { Mode, PaidSections } from "@/lib/fixtures/tracks";

/**
 * Paid report generation — the bridge from a completed analysis to Rhodes.
 *
 * Two rules govern this module:
 *
 *   1. Nothing is invented. Every field handed to Rhodes comes from upstream
 *      analysis. Where upstream has no value, the field is OMITTED rather than
 *      filled with a plausible one — and omission is load-bearing, because the
 *      evidence governor unlocks its rules from what is present.
 *
 *   2. It fails closed. No key, a missing required fact, a model error, or an
 *      unsupported claim that survives the governor's retry all return a typed
 *      failure. The caller reports honestly and keeps the entitlement — it
 *      never substitutes fixture prose in production.
 */

/** Bumped from chrp-report-v1: one governed call replaced two personas. */
export const GENERATOR_VERSION = RHODES_VERSION;
export const GENERATOR_MODEL = RHODES_MODEL;

/**
 * The facts a completed analysis can supply, before any generation. Optional
 * fields are optional because upstream genuinely may not have them.
 */
export interface AnalysisFacts {
  title: string;
  artist: string;
  mode: Mode;
  epiScore: number;
  /**
   * The four scored dimensions on the engine's 30-99 scale. These are the
   * performance profile and they determine the MODE. They do NOT determine
   * the EPI score, which is computed separately from arousal and valence.
   * Without them Rhodes sees only a winning number and can reason around the
   * song rather than from it.
   */
  dimensions?: {
    focus: number;
    calm: number;
    motivation: number;
    balance: number;
  } | null;

  /** Source valence, as supplied to the engine. */
  valence?: number;
  /**
   * CHRP's weighted arousal — the value EPI was computed from. Deliberately
   * not called `energy`: energy is one of its inputs, and labelling a
   * composite as a raw feature would put an unmeasured claim in the report.
   */
  arousal?: number;

  // Approved extras, only where a source actually supplied them. Each one
  // present relaxes a governor rule, so none may be populated speculatively.
  bpm?: number;
  key?: string;
  genres?: string[];
  instrumentalness?: number;
  percentileCorpus?: string;
  percentileMode?: string;
  comparableArtists?: string[];

  /** Anything the creator has explicitly told CHRP about this song. */
  userTruth?: string[];
}

export type GenerationFailure =
  | { reason: "no_api_key"; detail: string }
  | { reason: "generation_failed"; detail: string }
  | { reason: "governor_rejected"; detail: string };

export type GenerationResult =
  | { ok: true; sections: PaidSections }
  | ({ ok: false } & GenerationFailure);

/**
 * Map analysis facts onto Rhodes's input contract.
 *
 * Nothing here reads a paid field, so this cannot become the circular path an
 * earlier audit found — where building the generator's input required the very
 * report being generated. Absent optional facts stay `undefined`, and the
 * prompt builder drops them, so the model is never shown a fabricated value.
 */
export function factsToRhodesInput(
  facts: AnalysisFacts,
): SongIntelligenceInput {
  const context: NonNullable<SongIntelligenceInput["context"]> = {};
  if (typeof facts.bpm === "number") context.bpm = facts.bpm;
  if (facts.key) context.key = facts.key;
  if (facts.genres?.length) context.genres = facts.genres;
  if (facts.comparableArtists?.length)
    context.comparableArtists = facts.comparableArtists;
  if (facts.percentileCorpus) context.percentileCorpus = facts.percentileCorpus;
  if (facts.percentileMode) context.percentileMode = facts.percentileMode;
  if (typeof facts.instrumentalness === "number")
    context.instrumentalness = facts.instrumentalness;

  return {
    identity: { title: facts.title, artist: facts.artist },
    engine: {
      epiScore: facts.epiScore,
      mode: facts.mode,
      // The dimension profile is what makes interpretation possible at all.
      // A missing profile is caught before generation, in generatePaidSections.
      dimensions: facts.dimensions ?? {
        focus: 0,
        calm: 0,
        motivation: 0,
        balance: 0,
      },
      arousal: facts.arousal,
      valence: facts.valence,
    },
    ...(Object.keys(context).length > 0 ? { context } : {}),
    ...(facts.userTruth?.length ? { userTruth: facts.userTruth } : {}),
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

  // Rhodes reasons from relationships. Without the four dimensions there are
  // no relationships, only a mode label — so this fails closed rather than
  // producing an interpretation of nothing.
  if (!facts.dimensions) {
    return {
      ok: false,
      reason: "generation_failed",
      detail: "analysis has no dimension profile to interpret",
    };
  }

  const result = await generateSongIntelligence(factsToRhodesInput(facts));
  if (!result.ok) return result;

  if (result.violations.length > 0) {
    // Style-only residue that survived the rewrite. Recorded so the prompt can
    // be improved; never shown to the creator, never a reason to withhold.
    console.warn(
      `[rhodes] shipped with ${result.violations.length} style violation(s) after ${result.attempts} attempt(s):`,
      result.violations.map((v) => `${v.rule}:"${v.match}"`).join(", "),
    );
  }

  const {
    signature,
    rhodes,
    placements,
    buyers,
    audience,
    throughline,
    pitch,
    consider,
  } = result.sections;

  return {
    ok: true,
    sections: {
      rhodes,
      signature,
      placements,
      buyers,
      audience,
      throughline,
      pitch,
      consider,
      // Brief counts, vertical percentages and sample briefs are demand claims
      // the scoring cannot support. Empty is the only honest production value.
      where_this_music_lives: {
        verticals: [],
        confidence: null,
        n_briefs: null,
        sample_brief: null,
      },
    },
  };
}
