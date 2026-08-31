/**
 * Spotify client credentials flow + track search.
 *
 * Uses the app-only credentials flow (no user login required), which is what
 * we want for server-side search. Access token is cached on the instance and
 * refreshed 60 seconds before expiry so bursts of requests share one token.
 *
 * Never instantiated at module load — call getSpotifyClient() so missing env
 * vars only surface at the point of first use, not on cold-start of unrelated
 * routes.
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // unix ms
}

export class SpotifyClient {
  private clientId: string;
  private clientSecret: string;
  private market: string;
  private token: CachedToken | null = null;

  constructor() {
    const id = process.env.SPOTIFY_CLIENT_ID;
    const secret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!id) throw new Error("SPOTIFY_CLIENT_ID is not set");
    if (!secret) throw new Error("SPOTIFY_CLIENT_SECRET is not set");
    this.clientId = id;
    this.clientSecret = secret;
    this.market = process.env.SPOTIFY_MARKET || "US";
  }

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt - 60_000 > now) {
      return this.token.accessToken;
    }
    const auth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");
    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new Error(
        `Spotify auth request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Spotify auth returned ${res.status}: ${body || res.statusText}`,
      );
    }
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      throw new Error("Spotify auth response missing access_token");
    }
    this.token = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return this.token.accessToken;
  }

  /**
   * Search Spotify's track catalog. Returns the raw items array from the
   * /v1/search endpoint — the route handler shapes it into CHRP's own
   * search-result schema.
   */
  async searchTracks(
    query: string,
    limit: number,
  ): Promise<Array<Record<string, unknown>>> {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("type", "track");
    url.searchParams.set("market", this.market);
    url.searchParams.set("limit", String(limit));

    let res = await this.searchOnce(url, await this.getToken());

    // A cached token can stop working before the expiry we computed —
    // Spotify invalidates outstanding tokens on credential rotation, and a
    // long-lived serverless instance holds its token across those events.
    // Without this the FIRST search after such an invalidation returns 502
    // and the person is told "something went wrong" for a perfectly good
    // song. Drop the token, mint a fresh one, retry exactly once.
    if (res.status === 401) {
      this.token = null;
      res = await this.searchOnce(url, await this.getToken());
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Spotify search returned ${res.status}: ${body || res.statusText}`,
      );
    }
    const data = (await res.json()) as {
      tracks?: { items?: Array<Record<string, unknown>> };
    };
    return data.tracks?.items ?? [];
  }

  /** One search attempt with a given token. Network failures still throw. */
  private async searchOnce(url: URL, token: string): Promise<Response> {
    try {
      return await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new Error(
        `Spotify search request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

let _client: SpotifyClient | null = null;
export function getSpotifyClient(): SpotifyClient {
  if (!_client) _client = new SpotifyClient();
  return _client;
}
