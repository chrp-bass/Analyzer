import "server-only";
import { publicHttpsUrl } from "./public-url.server";

/** Search yields URLs only. Neither snippets nor index dates are opportunity evidence. */
export interface SearchIndex {
  discover(query: string): Promise<string[]>;
}

const WATCHLIST = [
  "https://www.tracksynk.com/briefs",
  "https://dropcue.app/music-briefs",
  "https://pitch.hrdrv.com/",
  "https://syncstarz.com/",
  "https://www.pitchsynch.app/",
  "https://groover.co/en/",
  "https://www.songtradr.com/musiccreators",
  "https://www.syncbrief.com/",
  "https://played.fm/sync",
];

const QUERIES = [
  '"sync brief" music submission deadline',
  '"music supervisor" brief application deadline',
  'film TV advertising game music open call deadline',
  'artist playlist editorial radio open call deadline',
  'creator brand music request submissions deadline',
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
  return [WATCHLIST[day % WATCHLIST.length], WATCHLIST[(day + 3) % WATCHLIST.length],
    WATCHLIST[(day + 6) % WATCHLIST.length]];
}
