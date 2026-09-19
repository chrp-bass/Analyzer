/**
 * The search fallback, wired: the route, the analysis identity fallback, and
 * the browser-side session cache.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  spotifySearch: vi.fn(),
  sc: {
    searchSongs: vi.fn(),
    getSongByUuid: vi.fn(),
    getSongByPlatformId: vi.fn(),
    getSongByIsrc: vi.fn(),
  },
}));

vi.mock("@/lib/engine/spotify", () => ({
  getSpotifyClient: () => ({ searchTracks: h.spotifySearch }),
}));
vi.mock("@/lib/engine/soundcharts", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine/soundcharts")>()),
  getSoundchartsClient: () => h.sc,
}));

const SPOTIFY_401 = new Error(
  "Spotify search returned 401: Missing/invalid/expired access token",
);

const AUDIO = {
  acousticness: 0.2, danceability: 0.6, energy: 0.7, instrumentalness: 0,
  liveness: 0.1, loudness: -6, speechiness: 0.05, tempo: 120,
  timeSignature: 4, valence: 0.5,
};

let logs: string[];
beforeEach(() => {
  logs = [];
  for (const m of ["log", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(" "));
    });
  }
  h.spotifySearch.mockReset();
  for (const fn of Object.values(h.sc)) fn.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/song-api/search", () => {
  const get = async (query: string) => {
    const { GET } = await import("@/app/api/song-api/search/route");
    return GET(new Request(`http://t/api/song-api/search?query=${encodeURIComponent(query)}&limit=5`));
  };

  it("Spotify down → 200 with Soundcharts results, same envelope, provider only in the log", async () => {
    h.spotifySearch.mockRejectedValue(SPOTIFY_401);
    h.sc.searchSongs.mockResolvedValue([{ uuid: "a" }]);
    h.sc.getSongByUuid.mockResolvedValue({
      uuid: "a", name: "Margaritaville", mainArtists: [{ name: "Jimmy Buffett" }],
      isrc: { value: "USMC17746480" }, duration: 250, imageUrl: "https://img/a.jpg",
      releaseDate: "1977-02-14T00:00:00+00:00",
    });
    const res = await get("margaritaville route-test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["songs"]);
    expect(body.songs[0]).toMatchObject({ isrc: "USMC17746480", songName: "Margaritaville", artistName: "Jimmy Buffett" });
    expect(JSON.stringify(body)).not.toMatch(/provider|soundcharts|spotify_401/i);
    expect(logs.some((l) => /\[song-api\/search\] provider=soundcharts reason=spotify_/.test(l))).toBe(true);
  });

  it("both providers down → 502 that leaks no upstream detail", async () => {
    h.spotifySearch.mockRejectedValue(SPOTIFY_401);
    h.sc.searchSongs.mockRejectedValue(new Error("Soundcharts refused the request (403)"));
    const res = await get("nothing works route-test");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "search failed" });
  });

  it("still validates the query before touching any provider", async () => {
    const { GET } = await import("@/app/api/song-api/search/route");
    const res = await GET(new Request("http://t/api/song-api/search"));
    expect(res.status).toBe(400);
    expect(h.spotifySearch).not.toHaveBeenCalled();
  });
});

describe("analysis survives a Spotify outage", () => {
  const song = (isrc: string) => ({
    uuid: "sc-1",
    name: "Stick Season",
    creditName: "Samy Jebari", // the unreliable field
    mainArtists: [{ name: "Noah Kahan" }],
    isrc: { value: isrc },
    imageUrl: "https://img/s.jpg",
    audio: AUDIO,
  });

  it("Spotify UNREACHABLE → identity from the Soundcharts performing artist, and it is logged", async () => {
    const { analyzeByIsrc } = await import("@/lib/engine/analyze.server");
    h.sc.getSongByIsrc.mockResolvedValue(song("USUM72212345"));
    h.spotifySearch.mockRejectedValue(SPOTIFY_401);
    const payload = await analyzeByIsrc("USUM72212345");
    expect(payload.song.songName).toBe("Stick Season");
    expect(payload.song.artistName).toBe("Noah Kahan");
    expect(payload.song.artistName).not.toBe("Samy Jebari");
    expect(typeof payload.epiScore).toBe("number");
    expect(logs.some((l) => /\[song-api\/analyze\] identity provider=soundcharts isrc=USUM72212345/.test(l))).toBe(true);
  });

  it("Spotify healthy → Spotify is still the identity, exactly as before", async () => {
    const { analyzeByIsrc } = await import("@/lib/engine/analyze.server");
    h.sc.getSongByIsrc.mockResolvedValue(song("USUM72299999"));
    h.spotifySearch.mockResolvedValue([{ name: "Stick Season (Spotify)", artists: [{ name: "Noah Kahan (Spotify)" }] }]);
    const payload = await analyzeByIsrc("USUM72299999");
    expect(payload.song.songName).toBe("Stick Season (Spotify)");
    expect(payload.song.artistName).toBe("Noah Kahan (Spotify)");
    expect(logs.some((l) => l.includes("identity provider=soundcharts"))).toBe(false);
  });

  it("Spotify ANSWERS with no match → still an explicit failure, no silent substitution", async () => {
    const { analyzeByIsrc } = await import("@/lib/engine/analyze.server");
    h.sc.getSongByIsrc.mockResolvedValue(song("USUM72200000"));
    h.spotifySearch.mockResolvedValue([]);
    await expect(analyzeByIsrc("USUM72200000")).rejects.toMatchObject({ status: 502 });
  });

  it("Spotify unreachable AND no usable Soundcharts name → explicit failure", async () => {
    const { analyzeByIsrc } = await import("@/lib/engine/analyze.server");
    h.sc.getSongByIsrc.mockResolvedValue({ uuid: "x", isrc: { value: "USUM72211111" }, audio: AUDIO });
    h.spotifySearch.mockRejectedValue(SPOTIFY_401);
    await expect(analyzeByIsrc("USUM72211111")).rejects.toMatchObject({ status: 502 });
  });
});

describe("browser: searchSongs", () => {
  it("remembers a query for the session and shows the server's words when limited", async () => {
    const { searchSongs, ScanError } = await import("@/lib/data-source");
    const song = { isrc: "USMC17746480", songName: "Margaritaville" };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ songs: [song] }) } as unknown as Response);

    expect(await searchSongs("Margaritaville  cache-test")).toEqual([song]);
    expect(await searchSongs("margaritaville cache-test")).toEqual([song]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "search_limited", message: "Search is temporarily limited. Try again later or paste a Spotify link." }),
    } as unknown as Response);
    const err = await searchSongs("something else cache-test").catch((e) => e);
    expect(err).toBeInstanceOf(ScanError);
    expect(err.userMessage).toBe("Search is temporarily limited. Try again later or paste a Spotify link.");
  });

  it("an empty answer is not remembered, so a song that becomes findable is found", async () => {
    const { searchSongs } = await import("@/lib/data-source");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ songs: [] }) } as unknown as Response);
    await searchSongs("empty cache-test");
    await searchSongs("empty cache-test");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
