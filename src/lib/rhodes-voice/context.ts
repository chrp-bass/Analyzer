/**
 * The context adapter that packages an existing, governed CHRP report for the
 * ElevenLabs Dr. Rhodes conversational agent.
 *
 * WHAT THIS IS NOT:
 *   - A second intelligence engine. No scoring, no re-derivation, no new
 *     Soundcharts traffic. The five scores, EPI, mode, findings, placements
 *     and pitch language are read verbatim from the persisted report.
 *   - A rewrite of the Rhodes voice. The live ElevenLabs agent already carries
 *     the canonical Rhodes SOT; the application only supplies the minimum data
 *     the voice needs so it recognises the current song. No persona or
 *     boundary rules are duplicated in code here.
 *
 * The output is a pair:
 *   - `variables`: flat string map — the shape the ElevenLabs agent's dynamic
 *     variables system consumes, so the voice knows the song without the user
 *     having to say it.
 *   - `firstMessage`: the short personalised read Rhodes should open with,
 *     composed from the governed intelligence already on file. This is the
 *     20-40s "Rhodes found something" moment, in Rhodes's own text — the
 *     ElevenLabs TTS renders it in Clyde.
 *
 * This module is deliberately pure. It takes a `ReportPayload` (already loaded
 * by the entitlement-guarded resolver) and returns strings. It never touches
 * Anthropic, never touches Soundcharts, never touches ElevenLabs.
 */

import type { ReportPayload } from "@/lib/fixtures/tracks";
import { composeFirstRead } from "./first-read";

export interface RhodesVoiceContext {
  /** The song identity, for confirmation surfaces and telemetry. */
  song: { title: string; artist: string };
  /** Flat key/value map for the agent's `dynamicVariables`. */
  variables: Record<string, string>;
  /** The short personalised opening Rhodes speaks first — Rhodes's own text. */
  firstMessage: string;
}

/** Cap sizes so a runaway payload never bloats the WebSocket handshake. */
const MAX_VAR_LEN = 480;
const MAX_LIST_ITEMS = 3;

function truncate(value: string, limit = MAX_VAR_LEN): string {
  if (value.length <= limit) return value;
  return value.slice(0, limit - 1).trimEnd() + "…";
}

/** Take the first N items of an array; hide malformed entries silently. */
function head<T>(arr: T[] | undefined | null, n = MAX_LIST_ITEMS): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, n);
}

/**
 * Build the runtime context for one governed report. Pure, deterministic,
 * caller responsible for entitlement and identity.
 */
export function buildRhodesVoiceContext(
  report: ReportPayload,
): RhodesVoiceContext {
  const scoreByName = new Map(
    report.chrp_scores.map((s) => [s.name, s.score] as const),
  );
  const focus = scoreByName.get("Focus");
  const calm = scoreByName.get("Calm");
  const motivation = scoreByName.get("Motivation");
  const balance = scoreByName.get("Balance");

  const placementTitles = head(report.placements)
    .map((p) => p?.title)
    .filter((t): t is string => typeof t === "string" && t.length > 0);

  const buyers = head(report.buyers)
    .map((b) => b?.category)
    .filter((c): c is string => typeof c === "string" && c.length > 0);

  const variables: Record<string, string> = {
    // Identity: two vars so the agent can reference the song naturally.
    song_title: report.track.title,
    song_artist: report.track.artist,
    // Structural measurement — the four dimensions the report is built on.
    focus_score: focus !== undefined ? String(focus) : "n/a",
    calm_score: calm !== undefined ? String(calm) : "n/a",
    motivation_score: motivation !== undefined ? String(motivation) : "n/a",
    balance_score: balance !== undefined ? String(balance) : "n/a",
    epi_score: String(report.epi.score),
    epi_mode: report.epi.mode,
    // The written intelligence, verbatim. Voice Rhodes is bound to the same
    // truth the report displays, so the two cannot contradict one another.
    signature: truncate(report.signature ?? ""),
    written_reading: truncate(report.rhodes ?? "", 900),
    throughline: truncate(report.throughline ?? ""),
    consider: truncate(report.consider ?? ""),
    audience: truncate(report.audience ?? ""),
    // Named placement territories, comma-separated. Empty string means the
    // report did not surface any — never a stand-in.
    placement_titles: placementTitles.join(", "),
    buyer_categories: buyers.join(", "),
  };

  // Christian-context and market-truth boundaries are already policed by the
  // ElevenLabs agent's canonical SOT. We simply do not add any new claim
  // beyond what the governed report already carries.

  const firstMessage = composeFirstRead(report);

  return {
    song: { title: report.track.title, artist: report.track.artist },
    variables,
    firstMessage,
  };
}
