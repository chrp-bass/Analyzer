import "server-only";
import {
  getSoundchartsClient,
  SoundchartsError,
} from "@/lib/engine/soundcharts";
import {
  calculateScores,
  translateToEPI,
  AudioFeatureError,
} from "@/lib/engine/scores";
import type { AnalyzePayload } from "@/lib/engine/analysis-mapping";

/**
 * The CHRP engine, callable from server code.
 *
 * This logic previously lived inline in /api/song-api/analyze, which meant
 * the only way to score a song was over HTTP from a browser. Commerce needs
 * the same answer server-side — before a checkout session is created — so it
 * lives here and the route is a thin wrapper. There is exactly one scoring
 * path, and both callers share this cache.
 *
 * Nothing about the scoring changed: same Soundcharts features, same
 * calculateScores, same translateToEPI.
 */

const CACHE_MAX = 10_000;
const cache = new Map<string, AnalyzePayload>();

export class AnalyzeError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AnalyzeError";
    this.status = status;
  }
}

/**
 * Normalize an ISRC-ish string: strip dashes/spaces, uppercase, then
 * validate that the remainder is alphanumeric and 5–20 chars long.
 * Returns null on any failure so the caller can 400 out.
 */
export function normalizeIsrc(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]+$/.test(cleaned)) return null;
  if (cleaned.length < 5 || cleaned.length > 20) return null;
  return cleaned;
}

/**
 * Soundcharts sometimes returns ISRC as a plain string and sometimes as
 * a nested object { value: "GBBBN8300001" }. Prefer the raw value on
 * the response; fall back to the request ISRC we normalized ourselves.
 */
function extractIsrc(song: Record<string, unknown>, fallback: string): string {
  const raw = song?.isrc;
  if (raw && typeof raw === "object") {
    const nested = (raw as { value?: unknown }).value;
    if (typeof nested === "string" && nested.length > 0) return nested;
  }
  if (typeof raw === "string" && raw.length > 0) return raw;
  return fallback;
}

/** A previously computed reading for this ISRC, if this instance holds one. */
export function cachedAnalysis(isrc: string): AnalyzePayload | null {
  return cache.get(isrc) ?? null;
}

/**
 * Score a song by ISRC. Throws AnalyzeError with the status the API route
 * should surface: 404 when the catalogue has no such song, 422 when it has
 * no audio features to read.
 */
export async function analyzeByIsrc(isrc: string): Promise<AnalyzePayload> {
  const cached = cache.get(isrc);
  if (cached) return cached;

  let song: Record<string, unknown>;
  try {
    song = await getSoundchartsClient().getSongByIsrc(isrc);
  } catch (err) {
    if (err instanceof SoundchartsError) {
      throw new AnalyzeError(err.message, err.status);
    }
    throw new AnalyzeError(
      err instanceof Error ? err.message : "analyze failed",
      502,
    );
  }

  const audio = (song as { audio?: unknown }).audio;
  if (!audio || typeof audio !== "object") {
    throw new AnalyzeError("song has no audio features", 422);
  }

  let scores;
  try {
    scores = calculateScores(audio);
  } catch (err) {
    if (err instanceof AudioFeatureError) {
      throw new AnalyzeError(err.message, err.status);
    }
    throw err;
  }

  const a = audio as Record<string, unknown>;
  const energy = typeof a.energy === "number" ? a.energy : 0;
  const valence = typeof a.valence === "number" ? a.valence : 0;
  const epi = translateToEPI(scores, energy, valence);

  // Loose extraction of artist name — Soundcharts sometimes puts it on
  // song.creditName and sometimes on song.artist.name.
  const artistNested = (song as { artist?: unknown }).artist;
  const nestedArtistName =
    artistNested &&
    typeof artistNested === "object" &&
    "name" in artistNested &&
    typeof (artistNested as { name?: unknown }).name === "string"
      ? (artistNested as { name: string }).name
      : null;

  const payload: AnalyzePayload = {
    song: {
      songId:
        typeof song.uuid === "string"
          ? song.uuid
          : typeof song.id === "string"
            ? song.id
            : null,
      isrc: extractIsrc(song, isrc),
      songName: typeof song.name === "string" ? song.name : null,
      artistName:
        typeof song.creditName === "string"
          ? song.creditName
          : nestedArtistName,
      artworkUrl: typeof song.imageUrl === "string" ? song.imageUrl : null,
    },
    scores,
    epiScore: epi.epiScore,
    mode: epi.mode,
    circumplex: epi.circumplex,
    verdict: epi.verdict,
  };

  // Evict oldest entry once we hit the cap. Map iteration is insertion
  // order, so keys().next().value is the oldest key.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(isrc, payload);

  return payload;
}
