/**
 * Soundcharts v2.25 client — by-ISRC song lookup.
 *
 * Differentiates the four error classes Soundcharts returns (not-found,
 * bad-creds, quota, upstream) so callers can propagate a meaningful HTTP
 * status code to the browser.
 *
 * Never instantiated at module load — call getSoundchartsClient() so
 * missing env vars only surface at the point of first use.
 */

const BY_ISRC_URL =
  "https://customer.api.soundcharts.com/api/v2.25/song/by-isrc";

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
        headers: {
          "x-app-id": this.appId,
          "x-api-key": this.apiKey,
          Accept: "application/json",
        },
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
}

let _client: SoundchartsClient | null = null;
export function getSoundchartsClient(): SoundchartsClient {
  if (!_client) _client = new SoundchartsClient();
  return _client;
}
