/**
 * Rhodes's spoken opening for the voice moment.
 *
 * Two short sentences the creator hears first (about twelve seconds), then
 * ONE report-grounded signal. Never a summary of the report, never a pitch,
 * never a recital of scores.
 *
 *   "I'm Dr. Rhodes. I've reviewed what Chirp found in "{{song_title}}" — and
 *    there's one signal I think you should see first. {{first_signal}}"
 *
 * The template lives on the ElevenLabs agent as its first message and is
 * filled by dynamic variables; `composeFirstRead` renders the same template
 * server-side so the two can never drift (a test pins them equal).
 *
 * `firstSignal` selects the single most useful governed sentence — Rhodes has
 * already written for this song, so what the voice opens with is provably
 * consistent with the written report the creator is reading.
 */

import type { ReportPayload } from "@/lib/fixtures/tracks";
import { RHODES_VOICE_FIRST_MESSAGE } from "./agent-prompt";
import { asSpokenData } from "./text";

/** Hard cap so the opening stays near twelve seconds at Rhodes's cadence. */
export const FIRST_SIGNAL_MAX_CHARS = 200;

/** Split prose into sentences, keeping terminal punctuation. */
function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+/g) ?? (text.trim() ? [text.trim()] : [])).map((s) => s.trim());
}

/**
 * One concise, report-grounded observation. Prefers the emotional signature
 * (already a single governed statement); falls back to the first sentence of
 * the governed analysis; then to the throughline. Never invents.
 */
export function firstSignal(report: ReportPayload): string {
  const candidates = [
    ...sentences(asSpokenData(report.signature)),
    ...sentences(asSpokenData(report.rhodes)),
    ...sentences(asSpokenData(report.throughline)),
  ].filter((s) => s.length >= 24);
  const pick =
    candidates.find((s) => s.length <= FIRST_SIGNAL_MAX_CHARS) ??
    (candidates[0] ? candidates[0].slice(0, FIRST_SIGNAL_MAX_CHARS - 1).trimEnd() + "…" : "");
  return pick || "The report opens with the emotional signature Chirp measured for this song.";
}

/** Fill the agent's first-message template exactly as ElevenLabs would. */
export function renderFirstMessage(vars: { song_title: string; first_signal: string }): string {
  return RHODES_VOICE_FIRST_MESSAGE.replace(/\{\{song_title\}\}/g, vars.song_title).replace(
    /\{\{first_signal\}\}/g,
    vars.first_signal,
  );
}

/** The opening as the creator hears it. */
export function composeFirstRead(report: ReportPayload): string {
  return renderFirstMessage({
    song_title: asSpokenData(report.track.title),
    first_signal: firstSignal(report),
  });
}
