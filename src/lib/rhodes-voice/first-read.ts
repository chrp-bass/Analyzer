/**
 * Rhodes's spoken opening for the voice moment.
 *
 * One short introduction, then ONE complete report-grounded sentence the
 * creator hears first. About ten seconds. Never a summary of the report,
 * never a pitch, never a recital of scores, never listener framing.
 *
 *   "I'm Dr. Rhodes. Chirp found something useful in "{{song_title}}": {{first_signal}}"
 *
 * The template lives on the ElevenLabs agent as its first message and is
 * filled by dynamic variables; `composeFirstRead` renders the same template
 * server-side so the two can never drift (a test pins them equal).
 *
 * `firstSignal` selects ONE complete governed sentence of at most
 * FIRST_SIGNAL_MAX_WORDS spoken words. Rhodes has already written for this
 * song, so what the voice opens with is provably consistent with the written
 * report. When no governed sentence fits, the fallback is a measured fact
 * from the same report — never an invention.
 */

import type { ReportPayload } from "@/lib/fixtures/tracks";
import { RHODES_VOICE_FIRST_MESSAGE } from "./agent-prompt";
import { asSpokenData } from "./text";

/** One complete sentence, at most this many spoken words. */
export const FIRST_SIGNAL_MAX_WORDS = 18;
const FIRST_SIGNAL_MIN_WORDS = 4;

/** Split prose into complete sentences, keeping terminal punctuation. */
export function completeSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** A measured, always-available fallback drawn from the same report. */
function measuredFallback(report: ReportPayload): string {
  const epi = report.epi;
  if (epi && typeof epi.score === "number" && epi.mode) {
    return `Chirp places it in ${asSpokenData(epi.mode)} mode at an EPI of ${epi.score}.`;
  }
  return "Chirp measured a clear emotional signature in this song.";
}

/**
 * One complete, report-grounded sentence of at most 18 words. Candidates in
 * order of preference: the emotional signature, the governed analysis, the
 * throughline. Sentences that are too long are skipped, never cut.
 */
export function firstSignal(report: ReportPayload): string {
  const candidates = [
    ...completeSentences(asSpokenData(report.signature)),
    ...completeSentences(asSpokenData(report.rhodes)),
    ...completeSentences(asSpokenData(report.throughline)),
  ];
  const fit = candidates.find((s) => {
    const n = wordCount(s);
    return n >= FIRST_SIGNAL_MIN_WORDS && n <= FIRST_SIGNAL_MAX_WORDS;
  });
  return fit ?? measuredFallback(report);
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
    song_title: asSpokenData(report.track?.title, 200) || "this song",
    first_signal: firstSignal(report),
  });
}
