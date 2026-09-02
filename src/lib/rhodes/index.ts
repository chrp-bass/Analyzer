/**
 * RHODES — the single interpretation layer.
 *
 * One call, one voice, one governed contract. Everything interpretive in a
 * Song Intelligence report comes from here.
 *
 * What this replaced: two separate generations with two different personas —
 * a "commercial intelligence engine" writing positioning for supervisors, and
 * a second pass writing a reading that was explicitly told not to repeat the
 * first. That is why the old report read as scores, then AI, then charts,
 * then AI. It was literally two minds.
 *
 * The shape of the work:
 *
 *   COMPUTE FIRST, INTERPRET SECOND. The engine has already produced every
 *   score. This module never asks the model to derive, adjust or re-check
 *   engine truth, and the relationships it reasons from are computed in
 *   ./relationships.ts before the prompt is built.
 *
 *   GOVERN WHAT COMES BACK. ./governor.ts audits the result. A fabrication
 *   earns one retry and then fails closed; a style violation earns one retry
 *   and is then accepted with a log, because denying an entitled creator
 *   their report over a stylistic slip is the worse failure.
 */

import { SONG_INTELLIGENCE_SYSTEM_PROMPT } from "./song-intelligence";
import { deriveRelationships, type Dimensions } from "./relationships";
import {
  auditSections,
  correctionNote,
  hasFabrication,
  type AuditContext,
  type FactSheet,
  type Violation,
} from "./governor";

export type RhodesMode = "Ready" | "Recover" | "Recharge" | "Flow";

export { deriveRelationships } from "./relationships";
export type { Dimensions, ProfileRelationships } from "./relationships";
export {
  auditInterpretation,
  auditSections,
  auditAgainstFacts,
  hasFabrication,
} from "./governor";
export type { Violation, AuditContext, FactSheet } from "./governor";
export { SONG_INTELLIGENCE_SYSTEM_PROMPT } from "./song-intelligence";
export { RHODES_CORE } from "./core";

export interface Placement {
  title: string;
  body: string;
}

/** What one governed generation returns. Matches the persisted report shape. */
export interface SongIntelligenceSections {
  signature: string;
  rhodes: string;
  placements: Placement[];
  throughline: string;
  comparable: string;
  consider: string;
}

/**
 * THE INPUT CONTRACT.
 *
 * Six conceptual classes, and the prompt is built with them labelled, so the
 * model can never be confused about which row of the truth table a value came
 * from. Optional fields are optional because upstream genuinely may not have
 * them; absent means NOT MEASURED, and JSON.stringify drops them so the model
 * is never shown a plausible stand-in.
 */
export interface SongIntelligenceInput {
  /** CANONICAL IDENTITY — owned by Spotify. Never inferred, never corrected. */
  identity: {
    title: string;
    artist: string;
    isrc?: string;
  };

  /** ENGINE FACTS — owned by the CHRP engine. Final before this module runs. */
  engine: {
    epiScore: number;
    mode: RhodesMode;
    dimensions: Dimensions;
    /** CHRP's multi-feature arousal construct. Never described as energy. */
    arousal?: number;
    /** Source valence, as supplied to the engine. */
    valence?: number;
  };

  /**
   * AVAILABLE CONTEXT — approved extras, only where an approved source
   * actually supplied them. Every one of these unlocks a governor rule, so
   * nothing may be populated speculatively.
   */
  context?: {
    bpm?: number;
    key?: string;
    genres?: string[];
    comparableArtists?: string[];
    percentileCorpus?: string;
    percentileMode?: string;
    instrumentalness?: number;
  };

  /** OPTIONAL USER TRUTH — what the creator said. Outranks any inference. */
  userTruth?: string[];
}

export type GenerationFailure =
  | { reason: "no_api_key"; detail: string }
  | { reason: "generation_failed"; detail: string }
  | { reason: "governor_rejected"; detail: string };

export type GenerationResult =
  | {
      ok: true;
      sections: SongIntelligenceSections;
      /** Style violations that survived the retry. Logged, never rendered. */
      violations: Violation[];
      attempts: number;
    }
  | ({ ok: false } & GenerationFailure);

export const RHODES_VERSION = "chrp-rhodes-v2";
export const RHODES_MODEL = "claude-sonnet-4-5";

const MAX_ATTEMPTS = 2;
const MAX_TOKENS = 2000;

/** Which governor rules this input's supplied facts unlock. */
export function auditContextFor(input: SongIntelligenceInput): AuditContext {
  const c = input.context;
  return {
    hasTempo: typeof c?.bpm === "number",
    hasKey: typeof c?.key === "string" && c.key.length > 0,
    hasGenre: Array.isArray(c?.genres) && c!.genres!.length > 0,
    hasComparableArtists:
      Array.isArray(c?.comparableArtists) && c!.comparableArtists!.length > 0,
    hasCorpusRanking:
      Boolean(c?.percentileCorpus) || Boolean(c?.percentileMode),
    // The engine supplies no behavioural events and no temporal structure.
    // These stay false until a source actually provides them.
    hasObservedBehaviour: false,
    hasStructure: false,
  };
}

/**
 * The measured values a claim can be checked against, so the governor can
 * catch a supplied fact being MISSTATED rather than only an absent one being
 * invented. "Focus at the floor" when Focus is 34.5 invents nothing, and is
 * still false.
 */
export function factSheetFor(input: SongIntelligenceInput): FactSheet {
  const d = input.engine.dimensions;
  const rel = deriveRelationships(d);
  return {
    dimensions: {
      Focus: d.focus,
      Calm: d.calm,
      Motivation: d.motivation,
      Balance: d.balance,
    },
    atCeiling: rel.atCeiling,
    atFloor: rel.atFloor,
  };
}

/**
 * Build the user message.
 *
 * Written as labelled classes rather than one JSON blob so the model reads
 * ownership as part of the data. DERIVED RELATIONSHIPS is computed here, not
 * asked for: the model should spend its capacity on meaning, not subtraction.
 */
export function buildUserMessage(input: SongIntelligenceInput): string {
  const rel = deriveRelationships(input.engine.dimensions);

  const engineFacts: Record<string, unknown> = {
    epi_score: input.engine.epiScore,
    epi_scale: "0-100",
    mode: input.engine.mode,
    dimensions: input.engine.dimensions,
    dimension_scale: "30-99 (30 is the floor, not zero)",
    chrp_arousal: input.engine.arousal,
    source_valence: input.engine.valence,
  };

  const blocks: string[] = [
    `CANONICAL IDENTITY — owned by Spotify. Use exactly this title and artist.\n${JSON.stringify(
      input.identity,
      null,
      2,
    )}`,
    `ENGINE FACTS — owned by the CHRP engine. Already final.\n${JSON.stringify(
      engineFacts,
      null,
      2,
    )}`,
    `DERIVED RELATIONSHIPS — arithmetic on the facts above, computed for you.\nThese are relationships, not judgements: there is no CHRP threshold for "meaningfully exceeds", so read the gaps as the sizes they are.\n${rel.observations
      .map((o) => `- ${o}`)
      .join("\n")}\n\nAll pairwise gaps, widest first:\n${rel.pairs
      .map((p) => `- ${p.higher} over ${p.lower}: ${p.gap}`)
      .join("\n")}`,
  ];

  const context = input.context ?? {};
  const suppliedContext = Object.fromEntries(
    Object.entries(context).filter(([, v]) =>
      Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "",
    ),
  );
  blocks.push(
    Object.keys(suppliedContext).length > 0
      ? `AVAILABLE CONTEXT — approved extras actually supplied for this song.\n${JSON.stringify(
          suppliedContext,
          null,
          2,
        )}`
      : `AVAILABLE CONTEXT — none. No tempo, key, genre, comparable artists, corpus ranking, structure, lyrics or market data was supplied for this song. Nothing in those categories may appear in your answer.`,
  );

  if (input.userTruth && input.userTruth.length > 0) {
    blocks.push(
      `USER TRUTH — stated by the creator. Outranks anything you would otherwise infer.\n${input.userTruth
        .map((t) => `- ${t}`)
        .join("\n")}`,
    );
  }

  blocks.push(
    `YOUR JOB — interpret this architecture for the person who made the song, and return the JSON object described in your instructions. Nothing else.`,
  );

  return blocks.join("\n\n");
}

/** Pull the JSON object out of a response that may be fenced or prefaced. */
function extractJson(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (cleaned.startsWith("{")) return cleaned;
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) return cleaned.slice(first, last + 1);
  return cleaned;
}

function validateShape(value: unknown): SongIntelligenceSections {
  const p = value as Partial<SongIntelligenceSections>;
  const stringField = (name: keyof SongIntelligenceSections) => {
    const v = p[name];
    if (typeof v !== "string" || v.trim().length === 0) {
      throw new Error(`Rhodes response missing required field: ${name}`);
    }
    return v.trim();
  };
  if (!Array.isArray(p.placements) || p.placements.length < 1) {
    throw new Error("Rhodes response missing required field: placements");
  }
  const placements = p.placements.map((pl, i) => {
    if (
      !pl ||
      typeof pl.title !== "string" ||
      typeof pl.body !== "string" ||
      !pl.title.trim() ||
      !pl.body.trim()
    ) {
      throw new Error(`Rhodes response placement ${i} is incomplete`);
    }
    return { title: pl.title.trim(), body: pl.body.trim() };
  });
  return {
    signature: stringField("signature"),
    rhodes: stringField("rhodes"),
    placements,
    throughline: stringField("throughline"),
    comparable: stringField("comparable"),
    consider: stringField("consider"),
  };
}

async function callModel(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: RHODES_MODEL,
      max_tokens: MAX_TOKENS,
      system: SONG_INTELLIGENCE_SYSTEM_PROMPT,
      messages,
    }),
  });
  const data = await response.json();
  if (data.type === "error") {
    throw new Error(data.error?.message ?? "model error");
  }
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("model returned no text");
  return text;
}

/**
 * Generate the interpretation for one song, governed.
 *
 * Attempt 1 runs the contract. If the result will not parse, will not
 * validate, or trips the governor, attempt 2 is given the exact failing
 * phrases and asked to rewrite. After that:
 *
 *   fabrication still present -> fail closed. A smaller grounded report beats
 *                                a richer invented one, and the caller's
 *                                existing 503 path keeps the entitlement.
 *   style only               -> accept and log. Not worth denying a report.
 */
export async function generateSongIntelligence(
  input: SongIntelligenceInput,
): Promise<GenerationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      reason: "no_api_key",
      detail: "ANTHROPIC_API_KEY is not configured",
    };
  }

  const ctx = auditContextFor(input);
  const facts = factSheetFor(input);
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: buildUserMessage(input) },
  ];

  let lastViolations: Violation[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let raw: string;
    try {
      raw = await callModel(messages);
    } catch (err) {
      return {
        ok: false,
        reason: "generation_failed",
        detail: err instanceof Error ? err.message : "generation failed",
      };
    }

    let sections: SongIntelligenceSections;
    try {
      sections = validateShape(JSON.parse(extractJson(raw)));
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        return {
          ok: false,
          reason: "generation_failed",
          detail: err instanceof Error ? err.message : "invalid response",
        };
      }
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content:
          "That was not the required JSON object. Return only the JSON described in your instructions — no fences, no prose around it, every field completed.",
      });
      continue;
    }

    const violations = auditSections(
      sections as unknown as Record<string, unknown>,
      ctx,
      facts,
    );
    lastViolations = violations;

    if (violations.length === 0) {
      return { ok: true, sections, violations: [], attempts: attempt };
    }

    if (attempt === MAX_ATTEMPTS) {
      if (hasFabrication(violations)) {
        return {
          ok: false,
          reason: "governor_rejected",
          detail: `unsupported claims survived rewrite: ${violations
            .filter((v) => v.severity === "fabrication")
            .map((v) => `${v.rule} ("${v.match}")`)
            .join(", ")}`,
        };
      }
      // Style only. Ship it and record what slipped.
      return { ok: true, sections, violations, attempts: attempt };
    }

    // Worth logging even though it recovers: a rule that trips on most first
    // drafts is costing every report a second call, and that is a signal
    // about the prompt rather than about the song.
    console.warn(
      `[rhodes] retrying after attempt ${attempt}:`,
      violations.map((v) => `${v.rule}:"${v.match}"`).join(", "),
    );
    messages.push({ role: "assistant", content: raw });
    messages.push({ role: "user", content: correctionNote(violations) });
  }

  return {
    ok: false,
    reason: "governor_rejected",
    detail: `governor could not be satisfied: ${lastViolations
      .map((v) => v.rule)
      .join(", ")}`,
  };
}
