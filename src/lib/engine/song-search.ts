import {
  soundchartsIdentity,
  soundchartsIsrc,
} from "@/lib/engine/soundcharts";
import type { SearchBudget } from "@/lib/engine/search-budget";

/**
 * Song search with a provider fallback.
 *
 *   1. Spotify first. If it answers, that answer is used and Soundcharts is
 *      never contacted — not in parallel, not speculatively.
 *   2. If Spotify FAILS (401/403, 5xx, timeout, network), the same query is
 *      answered from Soundcharts. "No results" from a healthy Spotify is an
 *      answer, not a failure, and does not fall back.
 *   3. A pasted Spotify track link is resolved through Soundcharts'
 *      platform-id lookup: one call, and it needs no Spotify at all.
 *
 * The caller cannot tell which provider answered: both produce the same
 * result shape. Which one did is logged on every search.
 *
 * COST. Soundcharts is metered, and its search response carries no ISRC, so
 * each result shown costs one extra metadata lookup. That is bounded three
 * ways: at most FALLBACK_RESULTS results are resolved per search; results
 * and lookups are cached in this instance; and a daily budget refuses new
 * fallback searches once spent (see ./search-budget).
 *
 * Pure orchestration over injected providers, so every branch — including
 * the ones that only happen during an outage — is testable without one.
 */

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

export type SearchProvider = "spotify" | "soundcharts";

export type SearchOutcome =
  | { ok: true; songs: SongSearchResult[]; provider: SearchProvider }
  /** The daily fallback budget is spent. */
  | { ok: false; kind: "limited" }
  /** Both providers failed. `detail` is for logs, never for the UI. */
  | { ok: false; kind: "unavailable"; detail: string };

export const SEARCH_LIMITED_MESSAGE =
  "Search is temporarily limited. Try again later or paste a Spotify link.";

/** Results resolved per fallback search. Each one is a metered lookup. */
export const FALLBACK_RESULTS = 5;
/** How long a Spotify failure suppresses further Spotify attempts. */
export const SPOTIFY_RETRY_AFTER_MS = 60_000;
const CACHE_TTL_MS = 60 * 60_000;
const CACHE_MAX = 500;

type Raw = Record<string, unknown>;

export interface SongSearchDeps {
  spotifySearch(query: string, limit: number): Promise<Raw[]>;
  soundcharts: {
    searchSongs(term: string, limit: number): Promise<Raw[]>;
    getSongByUuid(uuid: string): Promise<Raw>;
    getSongByPlatformId(platform: "spotify", identifier: string): Promise<Raw>;
  };
  budget: SearchBudget;
  now?: () => number;
  log?: (line: string) => void;
}

// ── Spotify links ──────────────────────────────────────────────────────────

const SPOTIFY_TRACK_URL_RE =
  /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?![A-Za-z0-9])/i;
const SPOTIFY_TRACK_URI_RE = /^spotify:track:([A-Za-z0-9]{22})$/i;

/** The track id in a pasted Spotify track link or URI, else null. */
export function parseSpotifyTrackId(input: string): string | null {
  const text = input.trim();
  return (
    SPOTIFY_TRACK_URI_RE.exec(text)?.[1] ??
    SPOTIFY_TRACK_URL_RE.exec(text)?.[1] ??
    null
  );
}

// ── Mapping ────────────────────────────────────────────────────────────────

interface SpotifyTrack {
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

/** A Spotify /search item → result. Null when it has no ISRC. */
export function fromSpotifyTrack(raw: Raw): SongSearchResult | null {
  const t = raw as SpotifyTrack;
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
}

/** A Soundcharts song record → result. Null when it has no ISRC. */
export function fromSoundchartsSong(
  song: Raw,
  spotifyTrackId: string | null = null,
): SongSearchResult | null {
  const isrc = soundchartsIsrc(song);
  if (!isrc) return null;
  const { title, artist } = soundchartsIdentity(song);
  const release = typeof song.releaseDate === "string" ? song.releaseDate : null;
  const seconds =
    typeof song.duration === "number" && Number.isFinite(song.duration)
      ? song.duration
      : null;
  return {
    isrc,
    spotifyTrackId,
    spotifyUrl: spotifyTrackId
      ? `https://open.spotify.com/track/${spotifyTrackId}`
      : null,
    songName: title,
    artistName: artist,
    // Soundcharts has no album on the song record.
    albumName: null,
    artworkUrl: typeof song.imageUrl === "string" ? song.imageUrl : null,
    // Spotify gives YYYY-MM-DD; Soundcharts gives a full timestamp.
    releaseDate: release ? release.slice(0, 10) : null,
    // Soundcharts reports seconds.
    durationMs: seconds !== null ? Math.round(seconds * 1000) : null,
  };
}

/** A short, log-safe reason for a Spotify failure. */
export function spotifyFailureReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const status = /returned (\d{3})/.exec(message)?.[1];
  if (status) return `spotify_${status}`;
  if (/timed? ?out|timeout|aborted/i.test(message)) return "spotify_timeout";
  if (/request failed/i.test(message)) return "spotify_network";
  if (/is not set/i.test(message)) return "spotify_unconfigured";
  return "spotify_error";
}

// ── The search ─────────────────────────────────────────────────────────────

class TtlCache<V> {
  private map = new Map<string, { at: number; value: V }>();
  constructor(private now: () => number) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > CACHE_TTL_MS) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V): void {
    if (this.map.size >= CACHE_MAX) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { at: this.now(), value });
  }
}

export function createSongSearch(deps: SongSearchDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const queryCache = new TtlCache<SongSearchResult[]>(now);
  const linkCache = new TtlCache<SongSearchResult[]>(now);
  const uuidCache = new TtlCache<Raw | null>(now);
  let spotifyDownUntil = 0;

  const line = (fields: Record<string, string | number | boolean>) =>
    log(
      `[song-api/search] ${Object.entries(fields)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}`,
    );
  const budgetField = (bucket: "search" | "link") =>
    `${deps.budget.used(bucket)}/${deps.budget.limit(bucket)}`;

  async function resolveLink(trackId: string): Promise<SearchOutcome> {
    const started = now();
    const cached = linkCache.get(trackId);
    if (cached) {
      line({ provider: "soundcharts", kind: "link", results: cached.length, cached: true, budget: budgetField("link"), ms: 0 });
      return { ok: true, songs: cached, provider: "soundcharts" };
    }
    if (!deps.budget.tryConsume("link")) {
      line({ provider: "soundcharts", kind: "link", outcome: "limited", budget: budgetField("link") });
      return { ok: false, kind: "limited" };
    }
    try {
      const song = await deps.soundcharts.getSongByPlatformId("spotify", trackId);
      const result = fromSoundchartsSong(song, trackId);
      const songs = result ? [result] : [];
      linkCache.set(trackId, songs);
      line({ provider: "soundcharts", kind: "link", results: songs.length, cached: false, budget: budgetField("link"), ms: now() - started });
      return { ok: true, songs, provider: "soundcharts" };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 404 || status === 410) {
        // Unknown to Soundcharts, or an ISRC it refuses to disambiguate.
        linkCache.set(trackId, []);
        line({ provider: "soundcharts", kind: "link", results: 0, cached: false, upstream: status, budget: budgetField("link"), ms: now() - started });
        return { ok: true, songs: [], provider: "soundcharts" };
      }
      const detail = err instanceof Error ? err.message : String(err);
      line({ provider: "soundcharts", kind: "link", outcome: "failed", upstream: status ?? "error", ms: now() - started });
      return { ok: false, kind: "unavailable", detail };
    }
  }

  async function fallback(
    query: string,
    limit: number,
    reason: string,
  ): Promise<SearchOutcome> {
    const started = now();
    const key = query.trim().toLowerCase().replace(/\s+/g, " ");
    const cached = queryCache.get(key);
    if (cached) {
      line({ provider: "soundcharts", reason, results: cached.length, cached: true, budget: budgetField("search"), ms: 0 });
      return { ok: true, songs: cached.slice(0, limit), provider: "soundcharts" };
    }
    if (!deps.budget.tryConsume("search")) {
      line({ provider: "soundcharts", reason, outcome: "limited", budget: budgetField("search") });
      return { ok: false, kind: "limited" };
    }

    let items: Raw[];
    try {
      items = await deps.soundcharts.searchSongs(query, FALLBACK_RESULTS);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      line({ provider: "soundcharts", reason, outcome: "failed", upstream: (err as { status?: number })?.status ?? "error", ms: now() - started });
      return { ok: false, kind: "unavailable", detail };
    }

    // The search response has no ISRC. Resolve each result's record — one
    // metered lookup each, bounded by FALLBACK_RESULTS, remembered per uuid.
    const uuids = items
      .map((i) => (typeof i.uuid === "string" ? i.uuid : null))
      .filter((u): u is string => u !== null)
      .slice(0, FALLBACK_RESULTS);
    let lookups = 0;
    const records = await Promise.all(
      uuids.map(async (uuid) => {
        const known = uuidCache.get(uuid);
        if (known !== undefined) return known;
        lookups += 1;
        try {
          const song = await deps.soundcharts.getSongByUuid(uuid);
          uuidCache.set(uuid, song);
          return song;
        } catch {
          // One unreadable result must not sink the rest.
          uuidCache.set(uuid, null);
          return null;
        }
      }),
    );

    const seen = new Set<string>();
    const songs: SongSearchResult[] = [];
    for (const record of records) {
      const result = record ? fromSoundchartsSong(record) : null;
      // No ISRC, no analysis — such a result is not offered at all.
      if (!result || seen.has(result.isrc)) continue;
      seen.add(result.isrc);
      songs.push(result);
    }

    queryCache.set(key, songs);
    line({ provider: "soundcharts", reason, results: songs.length, lookups, cached: false, budget: budgetField("search"), ms: now() - started });
    return { ok: true, songs: songs.slice(0, limit), provider: "soundcharts" };
  }

  return async function search(
    query: string,
    limit: number,
  ): Promise<SearchOutcome> {
    const trackId = parseSpotifyTrackId(query);
    if (trackId) return resolveLink(trackId);

    // Spotify failed moments ago: do not spend two more failing round trips
    // on it for every keystroke of an outage. It is retried after a minute.
    if (now() < spotifyDownUntil) {
      return fallback(query, limit, "spotify_recently_failed");
    }

    const started = now();
    try {
      const items = await deps.spotifySearch(query, limit);
      const songs = items
        .map(fromSpotifyTrack)
        .filter((s): s is SongSearchResult => s !== null);
      line({ provider: "spotify", results: songs.length, ms: now() - started });
      return { ok: true, songs, provider: "spotify" };
    } catch (err) {
      spotifyDownUntil = now() + SPOTIFY_RETRY_AFTER_MS;
      return fallback(query, limit, spotifyFailureReason(err));
    }
  };
}
