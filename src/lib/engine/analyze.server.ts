import "server-only";
import {
  getSoundchartsClient,
  SoundchartsError,
} from "@/lib/engine/soundcharts";
import { getSpotifyClient } from "@/lib/engine/spotify";
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

/**
 * A separate ISRC → raw-song cache holding just the non-audio metadata the
 * paid-report path may need (specifically `genres`). Keeping it distinct
 * from the analyzed-payload cache means the audio scoring can't accidentally
 * grow a dependency on metadata that was never part of the scoring contract,
 * and a paid-report reader can pull the genre labels without re-fetching
 * Soundcharts when the current process already has them.
 */
const RAW_SONG_CACHE_MAX = 10_000;
const rawSongCache = new Map<string, Record<string, unknown>>();

function rememberRawSong(isrc: string, song: Record<string, unknown>): void {
  if (rawSongCache.size >= RAW_SONG_CACHE_MAX) {
    const oldest = rawSongCache.keys().next().value;
    if (oldest !== undefined) rawSongCache.delete(oldest);
  }
  rawSongCache.set(isrc, song);
}

/**
 * Fetch the raw Soundcharts song object for an ISRC, safely — a network or
 * upstream error is swallowed and `null` is returned. This is the source of
 * genre metadata for the Christian context lens. It never throws, so the
 * paid report can degrade gracefully to "no context lens" rather than
 * failing when Soundcharts is briefly unavailable. The hot in-memory cache
 * is honoured first so a report generated in the same serverless invocation
 * as the scan pays no extra Soundcharts call.
 */
export async function soundchartsSongByIsrcSafe(
  isrc: string,
): Promise<Record<string, unknown> | null> {
  const cached = rawSongCache.get(isrc);
  if (cached) return cached;
  try {
    const song = await getSoundchartsClient().getSongByIsrc(isrc);
    rememberRawSong(isrc, song);
    return song;
  } catch {
    // The lens is defensive by design — any Soundcharts failure at report
    // time closes the gate rather than blocking the paid report.
    return null;
  }
}

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
  // Cache the raw song so a same-process paid-report generation doesn't
  // have to re-hit Soundcharts to read the genre metadata for the lens.
  rememberRawSong(isrc, song);

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

  // EPI is computed from the audio features themselves, not from the four
  // performance scores. translateToEPI owns the one canonical formula.
  const epi = translateToEPI(scores, audio);

  // Identity comes from Spotify, never from Soundcharts.
  //
  // Soundcharts is the analytical feature source and nothing more. Its
  // creditName is demonstrably unreliable — it returns "Samy Jebari" for
  // Noah Kahan's Stick Season and "Starseeds" for The Weeknd's Blinding
  // Lights, both on the correct ISRC. Letting that reach a creator would
  // put someone else's name on their song.
  //
  // The ISRC is the join key: it came from the Spotify result the creator
  // chose, so an ISRC-scoped Spotify lookup recovers exactly the recording
  // they picked, server-side, without trusting anything the client sent.
  const identity = await resolveSpotifyIdentity(isrc);

  const payload: AnalyzePayload = {
    song: {
      songId:
        typeof song.uuid === "string"
          ? song.uuid
          : typeof song.id === "string"
            ? song.id
            : null,
      isrc: extractIsrc(song, isrc),
      songName: identity.title,
      artistName: identity.artist,
      artworkUrl: typeof song.imageUrl === "string" ? song.imageUrl : null,
    },
    scores,
    epiScore: epi.epiScore,
    mode: epi.mode,
    circumplex: epi.circumplex,
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

/**
 * Canonical recording identity for an ISRC, from Spotify.
 *
 * Fails explicitly rather than falling back to Soundcharts metadata: a wrong
 * artist presented as canonical is worse than an honest failure, and every
 * ISRC reaching here was chosen from a Spotify search result, so a miss means
 * something is genuinely wrong.
 */
async function resolveSpotifyIdentity(
  isrc: string,
): Promise<{ title: string; artist: string }> {
  let items: Array<Record<string, unknown>>;
  try {
    items = await getSpotifyClient().searchTracks(`isrc:${isrc}`, 1);
  } catch (err) {
    throw new AnalyzeError(
      `could not resolve recording identity: ${
        err instanceof Error ? err.message : String(err)
      }`,
      502,
    );
  }

  const track = items[0] as
    | { name?: string; artists?: Array<{ name?: string }> }
    | undefined;
  const title = track?.name;
  const artist = track?.artists?.[0]?.name;
  if (!title || !artist) {
    throw new AnalyzeError("could not resolve recording identity", 502);
  }
  return { title, artist };
}
