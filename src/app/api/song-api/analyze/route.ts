import { NextResponse } from "next/server";
import {
  getSoundchartsClient,
  SoundchartsError,
} from "@/lib/engine/soundcharts";
import {
  calculateScores,
  translateToEPI,
  AudioFeatureError,
} from "@/lib/engine/scores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/song-api/analyze  { isrc }
 *
 * Fetches the song's audio features from Soundcharts, computes the four
 * CHRP scores, and returns them alongside the EPI translation (mode,
 * epiScore, verdict, circumplex).
 *
 * Results are cached in-memory by ISRC (module-level Map, cap 10 000
 * entries, oldest-first eviction). Cache is per-server-instance — on
 * Vercel each region/runtime keeps its own map.
 */

const CACHE_MAX = 10_000;
type AnalyzePayload = {
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
  verdict: string;
};
const cache = new Map<string, AnalyzePayload>();

/**
 * Normalize an ISRC-ish string: strip dashes/spaces, uppercase, then
 * validate that the remainder is alphanumeric and 5–20 chars long.
 * Returns null on any failure so the caller can 400 out.
 */
function normalizeIsrc(input: string): string | null {
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

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400 },
    );
  }
  const rawIsrc =
    body && typeof body === "object" && "isrc" in body
      ? (body as { isrc: unknown }).isrc
      : undefined;
  if (typeof rawIsrc !== "string") {
    return NextResponse.json(
      { error: "isrc is required (string)" },
      { status: 400 },
    );
  }
  const isrc = normalizeIsrc(rawIsrc);
  if (!isrc) {
    return NextResponse.json(
      {
        error:
          "isrc must be 5–20 alphanumeric characters (dashes/spaces stripped, letters uppercased)",
      },
      { status: 400 },
    );
  }

  // Cache hit: return the stored payload verbatim with cached=true.
  const cached = cache.get(isrc);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  try {
    const song = await getSoundchartsClient().getSongByIsrc(isrc);
    const audio = (song as { audio?: unknown }).audio;
    if (!audio || typeof audio !== "object") {
      return NextResponse.json(
        { error: "song has no audio features" },
        { status: 422 },
      );
    }
    const scores = calculateScores(audio);
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
        artworkUrl:
          typeof song.imageUrl === "string" ? song.imageUrl : null,
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

    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    console.error("[song-api/analyze] error:", err);
    if (err instanceof SoundchartsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof AudioFeatureError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const status =
      err instanceof Error &&
      "status" in err &&
      typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "analyze failed" },
      { status },
    );
  }
}
