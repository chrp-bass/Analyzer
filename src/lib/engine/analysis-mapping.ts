import type { FreeReport, Mode, RankClass, ScoreRow } from "@/lib/fixtures/tracks";

/**
 * Engine output -> report payload.
 *
 * The scan pipeline produces CHRP scores, an EPI score and a mode.
 * The report components were built against the fixture shape, so this module
 * is the one place that translates between them. Consumers are unchanged.
 *
 * The governing rule is the same one that governs the paid report: state what
 * was measured, and leave everything else empty rather than plausible. The
 * engine has no corpus, so it produces no percentile; it has no placement
 * research, so it produces no anchor copy. Those fields ship blank instead of
 * invented — see the field-gap notes at the bottom of this file.
 */

/** The /api/song-api/analyze response. */
export interface AnalyzePayload {
  song: {
    songId: string | null;
    isrc: string;
    songName: string | null;
    artistName: string | null;
    artworkUrl: string | null;
  };
  scores: { focus: number; calm: number; motivation: number; balance: number };
  epiScore: number;
  mode: string;
  circumplex: { valence: number; arousal: number };
  cached?: boolean;
}

/** One result from /api/song-api/search. */
export interface SongSearchResult {
  isrc: string;
  spotifyTrackId: string | null;
  spotifyUrl: string | null;
  songName: string | null;
  artistName: string | null;
  albumName: string | null;
  artworkUrl: string | null;
  releaseDate: string | null;
  durationMs: number | null;
}

const MODES: Mode[] = ["Ready", "Recover", "Recharge", "Flow"];

export function asMode(value: string): Mode {
  return (MODES as string[]).includes(value) ? (value as Mode) : "Flow";
}

/**
 * A score's visual band. This is a restatement of the score itself — the
 * bucket a 0–100 value falls into — not a comparison against a corpus, so it
 * makes no claim the engine cannot support.
 */
function rankClassFor(score: number): RankClass {
  if (score >= 70) return "high";
  if (score >= 45) return "mid";
  return "low";
}

function row(name: string, score: number): ScoreRow {
  return {
    name,
    score: Math.round(score),
    // The engine computes no corpus percentile. `rank` and `rank_class` are
    // deliberately not rendered anywhere (see ScoreRowView) precisely because
    // they would be unsupported claims; rank ships empty.
    rank: "",
    rank_class: rankClassFor(score),
    // Placement guidance is research, not scoring. Blank until the engine
    // produces it — inventing anchor copy would be inventing a claim.
    anchor: "",
  };
}

function displayTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  //  ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * The dimension -> mode mapping the engine actually applies (MODE_FOR in
 * scores.ts). Exported so the report prompt and the rationale describe the
 * same model rather than two versions of it.
 */
export const DIMENSION_MODE: Record<string, string> = {
  Focus: "Flow",
  Motivation: "Ready",
  Calm: "Recharge",
  Balance: "Recover",
};

/**
 * The free reveal's single signature line.
 *
 * Same discipline as the rationale: it names the mode and the two dimensions
 * that actually define the shape. Nothing here asserts what the song is
 * worth or where it would place.
 */
function freeStatement(payload: AnalyzePayload): string {
  const { scores, mode } = payload;
  const entries: Array<[string, number]> = [
    ["Focus", scores.focus],
    ["Balance", scores.balance],
    ["Motivation", scores.motivation],
    ["Calm", scores.calm],
  ];
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  return `${mode} mode — ${sorted[0][0].toLowerCase()} leads, ${sorted[3][0].toLowerCase()} recedes.`;
}

/**
 * Map an analyze response onto the free reveal payload the report components
 * already consume. Nothing downstream changes shape.
 */
export function analysisToFreeReport(
  payload: AnalyzePayload,
  scannedAt: Date = new Date(),
): FreeReport {
  const artist = payload.song.artistName ?? "Unknown artist";
  return {
    report_meta: {
      id: payload.song.isrc,
      version: "v1.0",
      scanned_at: scannedAt.toISOString(),
      scanned_at_display: displayTimestamp(scannedAt),
    },
    track: {
      title: payload.song.songName ?? "Untitled",
      artist,
      isrc: payload.song.isrc,
      // The engine already resolved this song's cover art. Carrying it here
      // is what makes the reveal show the actual record rather than a
      // placeholder box.
      artworkUrl: payload.song.artworkUrl ?? null,
    },
    epi: {
      score: Math.round(payload.epiScore),
      mode: asMode(payload.mode),
      // No corpus ranking exists. Blank rather than a manufactured "Top 4%".
      rank_in_mode: "",
      rank_overall: "",
    },
    chrp_scores: [
      row("Focus", payload.scores.focus),
      row("Balance", payload.scores.balance),
      row("Motivation", payload.scores.motivation),
      row("Calm", payload.scores.calm),
    ],
    // Recovery / Flow / Rest are separate human-performance variables the
    // current engine does not compute. An empty list is honest; synthesising
    // them from the four CHRP scores would be fabrication.
    hpv: [],
    creator: {
      name: artist,
      tracks_scored: 1,
      tease:
        "your creator profile — emotional consistency, signature pattern, and catalog reliability score.",
    },
    free_statement: freeStatement(payload),
  };
}
