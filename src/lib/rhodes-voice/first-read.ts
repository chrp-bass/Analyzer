/**
 * Compose Rhodes's short opening read for the voice moment.
 *
 * DESIGN INTENT (from the integration brief):
 *   > "I analyzed this, and there is one thing I think you should see."
 *   > Not: "Here is your AI-generated audio summary."
 *
 * The read is:
 *   - 20–40 seconds at Clyde's cadence (approximately 55–120 words)
 *   - grounded in the SAME governed intelligence the written report displays
 *   - specific to the actual song and artist
 *   - one high-value defensible observation, briefly explained
 *   - never a recital of five scores, never methodology, never a sales pitch
 *
 * We do NOT call any model here. Rhodes has already written for this song —
 * `report.signature`, `report.rhodes`, and `report.consider` are governed
 * outputs of the canonical Rhodes generation. We select and shape one short
 * spoken opening from those strings, so what the voice says is provably
 * consistent with the written report the creator will read next.
 */

import type { ReportPayload } from "@/lib/fixtures/tracks";

/** Trim, collapse internal whitespace, drop trailing punctuation. */
function normalise(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Pick the single most useful sentence from a paragraph.
 *
 * Rhodes's written prose tends to open with the observation and follow with a
 * brief explanation; the first sentence is almost always the most quotable.
 * When the first sentence is unusually short (a title fragment, say), the
 * second joins it so the spoken read has room to land.
 */
function pickSentence(text: string, minChars = 60, maxChars = 220): string {
  const parts = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let acc = "";
  for (const raw of parts) {
    const s = raw.trim();
    if (!s) continue;
    if (!acc) {
      acc = s;
      if (acc.length >= minChars) return acc.slice(0, maxChars);
      continue;
    }
    if (acc.length + 1 + s.length > maxChars) return acc.slice(0, maxChars);
    acc = `${acc} ${s}`;
    if (acc.length >= minChars) return acc.slice(0, maxChars);
  }
  return (acc || text).slice(0, maxChars);
}

/**
 * The opening. Two beats: (1) name the song and what stood out, (2) the
 * defensible observation from the governed prose. The final sentence invites
 * the creator into the report without pitching it.
 */
export function composeFirstRead(report: ReportPayload): string {
  const title = report.track.title.trim();
  const artist = report.track.artist.trim();

  const observation =
    pickSentence(normalise(report.rhodes)) ||
    pickSentence(normalise(report.signature)) ||
    // A well-formed governed report always has one of these; this branch
    // exists only to keep the voice moment tolerant of legacy payloads.
    "There's a distinct emotional-performance shape here worth reading closely.";

  const modeLine = report.epi?.mode
    ? `The reading came out in ${report.epi.mode} — that's the room this song opens.`
    : "";

  // Two short paragraphs, roughly 55–95 words. Voice Rhodes speaks it as one
  // continuous opening: introduction, observation, invitation.
  const opening = `I sat with "${title}" by ${artist} for a while before saying anything.`;
  const invite =
    "I put the rest of what I noticed in the report below. When you've read through it, I'm right here if you want to talk it out.";

  return [opening, observation, modeLine, invite]
    .filter((s) => s.trim().length > 0)
    .join(" ");
}
