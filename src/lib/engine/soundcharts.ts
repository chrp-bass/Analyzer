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
   * Soundcharts semantic analysis of the lyric (themes, moods,
   * emotionalIntensityScore, imageryScore, narrativeStyle, …). Fail-open.
   *
   * The endpoint is plan-gated on some Soundcharts tiers, so a 403 or 404 is
   * expected on any given account and returns null just like a timeout would.
   * The intelligence layer treats null as "we did not see a lyric analysis
   * for this song" and emits no lyric findings. Nothing else changes.
   */
  async getLyricsAnalysis(
    uuid: string,
  ): Promise<Record<string, unknown> | null> {
    if (!uuid) return null;
    return this.safeGet(
      `/api/v2.25/song/${encodeURIComponent(uuid)}/lyrics-analysis`,
    );
  }

  /**
   * A snapshot of current cross-platform market statistics for the song.
   * Fail-open. The shape varies by tier; the consumer reads only fields it
   * recognises and ignores everything else.
   */
  async getCurrentStats(
    uuid: string,
  ): Promise<Record<string, unknown> | null> {
    if (!uuid) return null;
    return this.safeGet(
      `/api/v2.25/song/${encodeURIComponent(uuid)}/current/stats`,
    );
  }

  /**
   * Soundcharts's own aggregate score for the song, when the tier exposes it.
   * Fail-open, and treated by the consumer as SOUNDCHARTS_DERIVED (never as
   * a CHRP verdict).
   */
  async getSoundchartsScore(
    uuid: string,
  ): Promise<Record<string, unknown> | null> {
    if (!uuid) return null;
    return this.safeGet(
      `/api/v2.25/song/${encodeURIComponent(uuid)}/soundcharts/score`,
    );
  }
}

let _client: SoundchartsClient | null = null;
export function getSoundchartsClient(): SoundchartsClient {
  if (!_client) _client = new SoundchartsClient();
  return _client;
}
