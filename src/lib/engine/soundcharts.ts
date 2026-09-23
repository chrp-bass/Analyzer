/**
 * Soundcharts v2.25 client.
 *
 * The by-ISRC method differentiates the four error classes Soundcharts returns
 * (not-found, bad-creds, quota, upstream) so callers can propagate a meaningful
 * HTTP status code to the browser — that endpoint is a HARD dependency of the
 * scoring pipeline. The enrichment methods added alongside it are the opposite:
 * every one is FAIL-OPEN — a 403 from a plan-gated endpoint, a 404 with no
 * data on file, a quota trip, or a timeout returns `null`. The intelligence
 * layer that consumes them treats a null result as "signal not observed" and
 * emits no finding, so nothing downstream ever DEPENDS on any enrichment call.
 *
 * Never instantiated at module load — call getSoundchartsClient() so
 * missing env vars only surface at the point of first use.
 */

const API_ROOT = "https://customer.api.soundcharts.com";
const BY_ISRC_URL = `${API_ROOT}/api/v2.25/song/by-isrc`;

/** How long we will wait on an enrichment call before treating it as absent. */
const ENRICHMENT_TIMEOUT_MS = 8_000;

export class SoundchartsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SoundchartsError";
    this.status = status;
  }
}

export class SoundchartsClient {
  private appId: string;
  private apiKey: string;

  constructor() {
    const appId = process.env.SOUNDCHARTS_APP_ID;
    const key = process.env.SOUNDCHARTS_API_KEY;
    if (!appId) throw new Error("SOUNDCHARTS_APP_ID is not set");
    if (!key) throw new Error("SOUNDCHARTS_API_KEY is not set");
    this.appId = appId;
    this.apiKey = key;
  }

  private headers(): Record<string, string> {
    return {
      "x-app-id": this.appId,
      "x-api-key": this.apiKey,
      Accept: "application/json",
    };
  }

  /**
   * Look up a song by its ISRC. Returns the `object` property from the
   * upstream response — the full song record (audio features, credits,
   * artwork, etc.). Throws SoundchartsError with a status that matches
   * the upstream failure class.
   */
  async getSongByIsrc(isrc: string): Promise<Record<string, unknown>> {
    const url = `${BY_ISRC_URL}/${encodeURIComponent(isrc)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new SoundchartsError(
        `Soundcharts request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        502,
      );
    }

    if (res.status === 404) {
      throw new SoundchartsError(`Song not found for ISRC ${isrc}`, 404);
    }
    if (res.status === 401 || res.status === 403) {
      throw new SoundchartsError(
        `Soundcharts credentials rejected (${res.status})`,
        res.status,
      );
    }
    if (res.status === 429) {
      throw new SoundchartsError(
        "Soundcharts rate limit or quota exceeded",
        429,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new SoundchartsError(
        `Soundcharts returned ${res.status}: ${body || res.statusText}`,
        res.status >= 400 && res.status < 500 ? res.status : 502,
      );
    }

    const data = (await res.json()) as { object?: Record<string, unknown> };
    if (!data.object) {
      throw new SoundchartsError(
        "Soundcharts response missing 'object' field",
        502,
      );
    }
    return data.object;
  }

  /**
   * STRICT GET — the counterpart of `safeGet`, for calls whose failure the
   * caller must be able to tell apart (the search fallback). Throws
   * SoundchartsError with the upstream failure class:
   *
   *   404  nothing found (Soundcharts does not bill these)
   *   401/403  credentials rejected, or the endpoint is not on this plan
   *   410  the ISRC is blacklisted (several tracks share it on the DSP)
   *   429  rate limit or quota
   *   502  network failure, timeout, or a malformed body
   */
  private async strictGet(
    path: string,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(`${API_ROOT}${path}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new SoundchartsError(
        `Soundcharts request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        502,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new SoundchartsError(
        `Soundcharts refused the request (${res.status}) — credentials rejected or endpoint not on this plan`,
        res.status,
      );
    }
    if (res.status === 429) {
      throw new SoundchartsError("Soundcharts rate limit or quota exceeded", 429);
    }
    if (!res.ok) {
      throw new SoundchartsError(
        `Soundcharts returned ${res.status}`,
        res.status >= 400 && res.status < 500 ? res.status : 502,
      );
    }
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!data || typeof data !== "object") {
      throw new SoundchartsError("Soundcharts returned a malformed body", 502);
    }
    return data;
  }

  /**
   * Search songs by name — `GET /api/v2/song/search/{term}`.
   *
   * Used ONLY as the fallback when Spotify search is failing; never in
   * parallel with it. Soundcharts recommends "title artist" as the term.
   *
   * Items are `{ uuid, name, creditName, imageUrl, releaseDate }` — note
   * there is NO ISRC here, so a result is not usable for analysis until
   * `getSongByUuid` has resolved it. A 404 means "nothing matched" and is
   * returned as an empty list rather than thrown.
   */
  async searchSongs(
    term: string,
    limit: number,
  ): Promise<Array<Record<string, unknown>>> {
    const capped = Math.max(1, Math.min(20, Math.floor(limit)));
    try {
      const data = await this.strictGet(
        `/api/v2/song/search/${encodeURIComponent(term)}?offset=0&limit=${capped}`,
        10_000,
      );
      return Array.isArray(data.items)
        ? (data.items as Array<Record<string, unknown>>)
        : [];
    } catch (err) {
      if (err instanceof SoundchartsError && err.status === 404) return [];
      throw err;
    }
  }

  /**
   * Song metadata by Soundcharts UUID — `GET /api/v2.25/song/{uuid}`.
   * Returns the full song record (isrc, artists, mainArtists, duration, …).
   */
  async getSongByUuid(uuid: string): Promise<Record<string, unknown>> {
    const data = await this.strictGet(
      `/api/v2.25/song/${encodeURIComponent(uuid)}`,
      10_000,
    );
    if (!data.object || typeof data.object !== "object") {
      throw new SoundchartsError("Soundcharts response missing 'object' field", 502);
    }
    return data.object as Record<string, unknown>;
  }

  /**
   * Song by a platform's own identifier —
   * `GET /api/v2.25/song/by-platform/{platform}/{identifier}`.
   *
   * This is how a pasted Spotify track link is resolved without Spotify:
   * the track id in the URL is the identifier. One call returns the ISRC
   * and the metadata. Unknown songs are a 404 (not billed).
   */
  async getSongByPlatformId(
    platform: "spotify",
    identifier: string,
  ): Promise<Record<string, unknown>> {
    const data = await this.strictGet(
      `/api/v2.25/song/by-platform/${platform}/${encodeURIComponent(identifier)}`,
      10_000,
    );
    if (!data.object || typeof data.object !== "object") {
      throw new SoundchartsError("Soundcharts response missing 'object' field", 502);
    }
    return data.object as Record<string, unknown>;
  }

  /**
   * FAIL-OPEN GET.
   *
   * Any status outside 2xx, any timeout, any non-JSON body, any missing
   * `object` field — every one of these returns `null`. This is what the
   * enrichment methods below share. They exist so the intelligence layer can
   * ask "is this signal observable for this song?" without ever giving the
   * report a reason to fail.
   *
   * The only thing worth caring about at the call site is whether the return
   * value is null (silence) or a shape (signal); status codes are absorbed
   * here on purpose.
   */
  private async safeGet(path: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${API_ROOT}${path}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(ENRICHMENT_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as
        | { object?: unknown; items?: unknown }
        | null;
      if (!data) return null;
      if (data.object && typeof data.object === "object") {
        return data.object as Record<string, unknown>;
      }
      if (Array.isArray(data.items)) {
        return { items: data.items };
      }
      // Some endpoints answer with a top-level object rather than wrapping it.
      if (typeof data === "object") return data as Record<string, unknown>;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Artist metadata by Soundcharts UUID — `GET /api/v2/artist/{uuid}`.
   * Returns the full artist record (genres, social links, etc.) or null.
   * Fail-open: any error returns null rather than failing the report.
   *
   * Used by the Christian context gate to check artist-level genre tags
   * when the song itself does not carry a Christian genre.
   */
  async getArtistByUuid(
    uuid: string,
  ): Promise<Record<string, unknown> | null> {
    if (!uuid) return null;
    return this.safeGet(`/api/v2/artist/${encodeURIComponent(uuid)}`);
  }

  /**
   * Soundcharts semantic analysis of the lyric (themes, moods,
   * emotionalIntensityScore, imageryScore, narrativeStyle, …). Fail-open.
   *
   * Path verified against the production Soundcharts tier: v2 (not v2.25 —
   * the family fragments across versions and this one is on v2). The
   * response body is `{ object: { lyricsAnalysis: {...}, related: {...} } }`.
   */
  async getLyricsAnalysis(
    uuid: string,
  ): Promise<Record<string, unknown> | null> {
    if (!uuid) return null;
    return this.safeGet(
      `/api/v2/song/${encodeURIComponent(uuid)}/lyrics-analysis`,
    );
  }

  /**
   * Soundcharts's proprietary aggregate score — weekly time series of
   * `{ date, fanbaseScore, trendingScore }`, ~4 weeks. Fail-open.
   *
   * Path verified: v2. Response body is `{ items: [...] }`.
   */
  async getSoundchartsScore(
    uuid: string,
  ): Promise<Record<string, unknown> | null> {
    if (!uuid) return null;
    return this.safeGet(
      `/api/v2/song/${encodeURIComponent(uuid)}/soundcharts/score`,
    );
  }

  /**
   * Current Spotify playlist placements for the song. Each item is
   * `{ playlist: {name, type, latestSubscriberCount, ...}, position,
   * peakPosition, entryDate, positionDate, ... }`. Fail-open.
   *
   * Path verified: v2.20. Response body is `{ items: [...] }`.
   */
  async getPlaylistCurrentSpotify(
    uuid: string,
  ): Promise<Record<string, unknown> | null> {
    if (!uuid) return null;
    return this.safeGet(
      `/api/v2.20/song/${encodeURIComponent(uuid)}/playlist/current/spotify`,
    );
  }

  /**
   * Current Spotify chart entries — one item per chart the song currently
   * appears on, with peak/position/timeOnChart. Fail-open. Empty for indie
   * releases that never charted, which is not a verdict.
   *
   * Path verified: v2. Response body is `{ items: [...] }`.
   */
  async getChartsRanksSpotify(
    uuid: string,
  ): Promise<Record<string, unknown> | null> {
    if (!uuid) return null;
    return this.safeGet(
      `/api/v2/song/${encodeURIComponent(uuid)}/charts/ranks/spotify`,
    );
  }

  /**
   * Radio broadcast events for the song — time series of individual airings
   * across stations. Fail-open. Empty for songs without radio pickup, which
   * is not a verdict.
   *
   * Path verified: v2. Response body is `{ items: [...] }`.
   */
  async getBroadcasts(
    uuid: string,
  ): Promise<Record<string, unknown> | null> {
    if (!uuid) return null;
    return this.safeGet(
      `/api/v2/song/${encodeURIComponent(uuid)}/broadcasts`,
    );
  }
}

/**
 * Title and artist from a Soundcharts song record.
 *
 * `creditName` is demonstrably unreliable on its own — it has returned a
 * collaborator's name in place of the performing artist on the correct ISRC.
 * The `mainArtists` list is the performing credit, so it is preferred, then
 * `artists`, and `creditName` only as the last resort. This is used ONLY
 * when Spotify cannot be reached; Spotify remains the canonical identity.
 */
export function soundchartsIdentity(
  song: Record<string, unknown>,
): { title: string | null; artist: string | null } {
  const firstName = (list: unknown): string | null => {
    if (!Array.isArray(list)) return null;
    for (const a of list) {
      const name = (a as { name?: unknown } | null)?.name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
    return null;
  };
  const title =
    typeof song.name === "string" && song.name.trim() ? song.name.trim() : null;
  const credit =
    typeof song.creditName === "string" && song.creditName.trim()
      ? song.creditName.trim()
      : null;
  return {
    title,
    artist: firstName(song.mainArtists) ?? firstName(song.artists) ?? credit,
  };
}

/** The ISRC on a Soundcharts song record, in either shape it arrives in. */
export function soundchartsIsrc(song: Record<string, unknown>): string | null {
  const raw = song.isrc;
  const value =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object"
        ? (raw as { value?: unknown }).value
        : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

let _client: SoundchartsClient | null = null;
export function getSoundchartsClient(): SoundchartsClient {
  if (!_client) _client = new SoundchartsClient();
  return _client;
}
