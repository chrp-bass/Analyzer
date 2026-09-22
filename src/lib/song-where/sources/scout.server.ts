import "server-only";
import { publicHttpsUrl } from "./public-url.server";

/** Search yields URLs only. Neither snippets nor index dates are opportunity evidence. */
export interface SearchIndex {
  discover(query: string): Promise<string[]>;
}

const WATCHLIST = [
  "https://www.tracksynk.com/briefs",     // Deep-linkable briefs, free to browse
  "https://played.fm/sync",               // Individual brief URLs (/sync/{uuid}), $120-2500/project
  "https://pitch.hrdrv.com/",             // HRDRV Pitch — submission tool (account may be needed)
  "https://www.songtradr.com/musiccreators", // Major sync marketplace
  "https://www.taxi.com/",                // Paid membership ($300/yr), aggregated listings
  "https://www.musicgateway.com/",        // Sync briefs behind login (app.musicgateway.com)
  "https://dropcue.app/music-briefs",     // Requires paid plan with Discovery
  "https://syncstarz.com/",               // Sync briefs platform
  "https://www.pitchsynch.app/",          // Pitch sync marketplace
  "https://www.syncbrief.com/",           // Sync brief aggregator
  // Removed: groover.co — music promotion/playlist pitching, not sync placement
  // Removed: soalivemusicconference.com — single annual event, not a brief source
];

const QUERIES = [
  '"sync brief" "mood" "deadline" "submit" music',
  '"music supervisor" "tempo" "deadline" "submit"',
  '"music needed" "instrumental" "deadline" film TV',
  '"looking for" "genre" "budget" "submit" music brief',
  '"seeking" "reference tracks" "apply" music',
  '"music brief" "vocals" "deadline" advertising game',
  '"sync opportunity" "BPM" "submit"',
  'site:tracksynk.com/briefs/ "mood" "deadline"',
  'site:pitch.hrdrv.com "genre" "deadline"',
  'site:songtradr.com "opportunity" "mood" "deadline"',
  'site:taxi.com "instrumental" "deadline"',
  'site:musicgateway.com "brief" "genre" "deadline"',
  'site:dropcue.app "brief" "BPM" "deadline"',
];

export function scoutQueries(day: number): string[] {
  return [QUERIES[day % QUERIES.length], QUERIES[(day + 2) % QUERIES.length]];
}

/** Only an existing credential activates this adapter. Never provisions a new account. */
export function configuredSearchIndex(): SearchIndex | null {
  const key = process.env.SONG_WHERE_BRAVE_SEARCH_KEY;
  if (!key) return null;
  return {
    async discover(query) {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", "10");
      url.searchParams.set("freshness", "pm");
      const response = await fetch(url, { cache: "no-store", redirect: "error",
        headers: { "X-Subscription-Token": key, Accept: "application/json" },
        signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("search_index_unavailable");
      const body = await response.text();
      if (body.length > 100_000) throw new Error("search_index_oversized");
      const results = (JSON.parse(body) as { web?: { results?: Array<{ url?: unknown }> } }).web?.results;
      return (results ?? []).slice(0, 10).flatMap((row) => {
        const url = typeof row.url === "string" ? publicHttpsUrl(row.url) : null;
        return url ? [url.href] : [];
      });
    },
  };
}

export function watchlist(day: number): string[] {
  // Rotate the long tail so fixed seeds cannot starve newly discovered pages.
  return [WATCHLIST[WATCHLIST.length - 1], WATCHLIST[day % WATCHLIST.length],
    WATCHLIST[(day + 3) % WATCHLIST.length], WATCHLIST[(day + 6) % WATCHLIST.length]];
}
