import { NextResponse } from "next/server";
import { getSpotifyClient } from "@/lib/engine/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Loose shape of a Spotify /search track item — every path we care about
// is optional so a partial upstream response never throws at access time.
interface SpotifySearchTrack {
  id?: string;
  name?: string;
  duration_ms?: number;
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
  artists?: Array<{ name?: string }>;
  album?: {
    name?: string;
    release_date?: string;
    images?: Array<{ url?: string }>;
  };
}

/**
 * GET /api/song-api/search?query=<text>&limit=<1-10>
 *
 * Spotify-backed track search. Returns tracks that have an ISRC (needed
 * for the analyze route). Every response wraps the array in { songs }
 * so future fields can be added without breaking clients.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query")?.trim() ?? "";
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : 10;
  const limit = Number.isNaN(parsedLimit)
    ? 10
    : Math.max(1, Math.min(10, parsedLimit));

  if (!query) {
    return NextResponse.json(
      { error: "query is required" },
      { status: 400 },
    );
  }
  if (query.length > 200) {
    return NextResponse.json(
      { error: "query too long (max 200 chars)" },
      { status: 400 },
    );
  }

  try {
    const items = await getSpotifyClient().searchTracks(query, limit);
    const songs = items
      .map((raw) => {
        const t = raw as SpotifySearchTrack;
        const isrc = t.external_ids?.isrc;
        if (!isrc) return null;
        return {
          isrc,
          spotifyTrackId: t.id ?? null,
          spotifyUrl: t.external_urls?.spotify ?? null,
          songName: t.name ?? null,
          artistName: t.artists?.[0]?.name ?? null,
          albumName: t.album?.name ?? null,
          artworkUrl: t.album?.images?.[0]?.url ?? null,
          releaseDate: t.album?.release_date ?? null,
          durationMs: t.duration_ms ?? null,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
    return NextResponse.json({ songs });
  } catch (err) {
    console.error("[song-api/search] upstream error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "search failed" },
      { status: 502 },
    );
  }
}
