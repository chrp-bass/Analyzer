import { NextResponse } from "next/server";
import { getSpotifyClient } from "@/lib/engine/spotify";
import { getSoundchartsClient } from "@/lib/engine/soundcharts";
import { createSearchBudget } from "@/lib/engine/search-budget";
import {
  createSongSearch,
  SEARCH_LIMITED_MESSAGE,
} from "@/lib/engine/song-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One search per instance, so its caches, its daily budget and its memory of
 * a recent Spotify failure are shared by every request the instance serves.
 * The provider clients are resolved lazily, inside the closures, so missing
 * configuration for one provider only surfaces if that provider is used.
 */
const search = createSongSearch({
  spotifySearch: (query, limit) => getSpotifyClient().searchTracks(query, limit),
  soundcharts: {
    searchSongs: (term, limit) => getSoundchartsClient().searchSongs(term, limit),
    getSongByUuid: (uuid) => getSoundchartsClient().getSongByUuid(uuid),
    getSongByPlatformId: (platform, id) =>
      getSoundchartsClient().getSongByPlatformId(platform, id),
  },
  budget: createSearchBudget(),
});

/**
 * GET /api/song-api/search?query=<text | spotify track link>&limit=<1-10>
 *
 * Track search. Returns tracks that have an ISRC (needed for the analyze
 * route), wrapped in { songs } so fields can be added without breaking
 * clients.
 *
 * Spotify answers when it can. When it cannot, Soundcharts answers the same
 * query in the same shape — see `@/lib/engine/song-search`. The response is
 * identical either way; the provider is recorded in the log line only.
 *
 *   200 { songs }
 *   400 { error }                       missing / over-long query
 *   429 { error: "search_limited", message }   daily fallback budget spent
 *   502 { error }                       no provider could answer
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

  const outcome = await search(query, limit);
  if (outcome.ok) return NextResponse.json({ songs: outcome.songs });

  if (outcome.kind === "limited") {
    return NextResponse.json(
      { error: "search_limited", message: SEARCH_LIMITED_MESSAGE },
      { status: 429 },
    );
  }

  console.error("[song-api/search] no provider could answer:", outcome.detail);
  return NextResponse.json({ error: "search failed" }, { status: 502 });
}
