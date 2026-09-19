/**
 * Search stays up when Spotify is down.
 *
 *   - Spotify first; Soundcharts is contacted ONLY when Spotify fails, never
 *     in parallel, and never for a healthy "no results";
 *   - a pasted Spotify track link resolves through Soundcharts' platform-id
 *     lookup, with no Spotify at all;
 *   - both providers produce the same result shape; results without an ISRC
 *     are never offered;
 *   - cost is bounded: ≤5 metered lookups per fallback search, cached
 *     repeats are free, and a daily budget refuses new fallback searches —
 *     while pasted links keep working;
 *   - every search logs which provider answered;
 *   - analysis survives too: identity falls back to Soundcharts only when
 *     Spotify is UNREACHABLE, not when it answers "no match".
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createSongSearch,
  parseSpotifyTrackId,
  fromSoundchartsSong,
  spotifyFailureReason,
  FALLBACK_RESULTS,
  SPOTIFY_RETRY_AFTER_MS,
  SEARCH_LIMITED_MESSAGE,
  type SongSearchDeps,
} from "@/lib/engine/song-search";
import { createSearchBudget } from "@/lib/engine/search-budget";
import {
  SoundchartsClient,
  SoundchartsError,
  soundchartsIdentity,
  soundchartsIsrc,
} from "@/lib/engine/soundcharts";

type Raw = Record<string, unknown>;

const SPOTIFY_401 = new Error(
  'Spotify search returned 401: { "error": { "status": 401, "message": "Missing/invalid/expired access token" } }',
);

const spotifyTrack = (isrc: string | null, name = "Song"): Raw => ({
  id: "4uLU6hMCjMI75M1A2tKUQC",
  name,
  duration_ms: 213000,
  external_ids: isrc ? { isrc } : {},
  external_urls: { spotify: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" },
  artists: [{ name: "Artist" }],
  album: { name: "Album", release_date: "2019-05-03", images: [{ url: "https://i/a.jpg" }] },
});

const scSong = (uuid: string, isrc: string | null, over: Raw = {}): Raw => ({
  uuid,
  name: `Title ${uuid}`,
  creditName: "Some Collaborator",
  mainArtists: [{ name: "Performing Artist" }],
  artists: [{ name: "Performing Artist" }, { name: "Featured" }],
  ...(isrc ? { isrc: { value: isrc, countryCode: "US" } } : {}),
  releaseDate: "2019-05-03T00:00:00+00:00",
  imageUrl: `https://img/${uuid}.jpg`,
  duration: 213,
  ...over,
});

function harness(
  over: { spotifySearch?: ReturnType<typeof vi.fn> } = {},
  limits = { search: 200, link: 500 },
) {
  let t = Date.parse("2026-09-19T20:00:00Z");
  const logs: string[] = [];
  const records: Record<string, Raw> = {};
  // Kept as mocks (not widened to the dependency types) so tests can script
  // and inspect them.
  const spotifySearch =
    over.spotifySearch ??
    vi.fn(async (): Promise<Raw[]> => {
      throw SPOTIFY_401;
    });
  const soundcharts = {
    searchSongs: vi.fn(async (_term: string, _limit: number): Promise<Raw[]> => []),
    getSongByUuid: vi.fn(async (uuid: string): Promise<Raw> => {
      const hit = records[uuid];
      if (!hit) throw new SoundchartsError("not found", 404);
      return hit;
    }),
    getSongByPlatformId: vi.fn(
      async (_platform: "spotify", _id: string): Promise<Raw> => {
        throw new SoundchartsError("not found", 404);
      },
    ),
  };
  const budget = createSearchBudget(limits, () => t);
  const deps: SongSearchDeps = {
    spotifySearch: spotifySearch as unknown as SongSearchDeps["spotifySearch"],
    soundcharts,
    budget,
    now: () => t,
    log: (l: string) => logs.push(l),
  };
  return {
    deps: { spotifySearch, soundcharts, budget },
    logs,
    records,
    search: createSongSearch(deps),
    advance: (ms: number) => void (t += ms),
  };
}

describe("parseSpotifyTrackId", () => {
  it("reads the id from the link forms people paste", () => {
    const id = "4uLU6hMCjMI75M1A2tKUQC";
    for (const input of [
      `https://open.spotify.com/track/${id}`,
      `https://open.spotify.com/track/${id}?si=abc123`,
      `https://open.spotify.com/intl-de/track/${id}`,
      `  open.spotify.com/track/${id}  `,
      `spotify:track:${id}`,
    ]) {
      expect(parseSpotifyTrackId(input)).toBe(id);
    }
  });
  it("is not fooled by other links or plain text", () => {
    for (const input of [
      "margaritaville jimmy buffett",
      "https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC",
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      "https://open.spotify.com/track/short",
      "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQCXX",
    ]) {
      expect(parseSpotifyTrackId(input)).toBeNull();
    }
  });
});

describe("Spotify is primary", () => {
  it("a healthy Spotify answers, and Soundcharts is never contacted", async () => {
    const h = harness({
      spotifySearch: vi.fn(async () => [spotifyTrack("USRC17607839"), spotifyTrack(null)]),
    });
    const out = await h.search("song", 10);
    expect(out).toMatchObject({ ok: true, provider: "spotify" });
    if (!out.ok) throw new Error("unreachable");
    expect(out.songs).toHaveLength(1); // the one without an ISRC is skipped
    expect(out.songs[0]).toEqual({
      isrc: "USRC17607839",
      spotifyTrackId: "4uLU6hMCjMI75M1A2tKUQC",
      spotifyUrl: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      songName: "Song",
      artistName: "Artist",
      albumName: "Album",
      artworkUrl: "https://i/a.jpg",
      releaseDate: "2019-05-03",
      durationMs: 213000,
    });
    expect(h.deps.soundcharts.searchSongs).not.toHaveBeenCalled();
    expect(h.deps.soundcharts.getSongByUuid).not.toHaveBeenCalled();
    expect(h.logs[0]).toMatch(/^\[song-api\/search\] provider=spotify results=1 /);
  });

  it('"no results" from a healthy Spotify is an answer — no fallback, no quota', async () => {
    const h = harness({ spotifySearch: vi.fn(async () => []) });
    const out = await h.search("zzzz", 10);
    expect(out).toEqual({ ok: true, songs: [], provider: "spotify" });
    expect(h.deps.soundcharts.searchSongs).not.toHaveBeenCalled();
    expect(h.deps.budget.used("search")).toBe(0);
  });
});

describe("Spotify failing → Soundcharts answers in the same shape", () => {
  it("searches, resolves ISRCs, skips results without one, de-duplicates", async () => {
    const h = harness();
    Object.assign(h.records, {
      a: scSong("a", "USRC17607839"),
      b: scSong("b", null), // no ISRC → never offered
      c: scSong("c", "USRC17607839"), // same recording again → de-duplicated
      d: scSong("d", "GBUM71029604"),
    });
    h.deps.soundcharts.searchSongs.mockResolvedValue([{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }, { uuid: "d" }]);

    const out = await h.search("some song", 10);
    if (!out.ok) throw new Error("expected results");
    expect(out.provider).toBe("soundcharts");
    expect(out.songs.map((s) => s.isrc)).toEqual(["USRC17607839", "GBUM71029604"]);
    // Same keys as a Spotify result — the UI cannot tell the difference.
    expect(Object.keys(out.songs[0]).sort()).toEqual(
      ["albumName", "artistName", "artworkUrl", "durationMs", "isrc", "releaseDate", "songName", "spotifyTrackId", "spotifyUrl"].sort(),
    );
    expect(out.songs[0]).toMatchObject({
      songName: "Title a",
      artistName: "Performing Artist", // not the unreliable creditName
      albumName: null,
      artworkUrl: "https://img/a.jpg",
      releaseDate: "2019-05-03",
      durationMs: 213000,
    });
    expect(h.deps.soundcharts.searchSongs).toHaveBeenCalledWith("some song", FALLBACK_RESULTS);
    expect(h.logs.at(-1)).toMatch(
      /provider=soundcharts reason=spotify_401 results=2 lookups=4 cached=false budget=1\/200/,
    );
  });

  it("never resolves more than FALLBACK_RESULTS results per search", async () => {
    const h = harness();
    const many = Array.from({ length: 12 }, (_, i) => ({ uuid: `u${i}` }));
    for (const m of many) h.records[m.uuid] = scSong(m.uuid, `USRC1760${String(1000 + Number(m.uuid.slice(1)))}`);
    h.deps.soundcharts.searchSongs.mockResolvedValue(many);
    await h.search("q", 10);
    expect(h.deps.soundcharts.getSongByUuid).toHaveBeenCalledTimes(FALLBACK_RESULTS);
  });

  it("one unreadable result does not sink the rest", async () => {
    const h = harness();
    h.records.a = scSong("a", "USRC17607839");
    h.deps.soundcharts.searchSongs.mockResolvedValue([{ uuid: "missing" }, { uuid: "a" }]);
    const out = await h.search("q", 10);
    expect(out.ok && out.songs.map((s) => s.isrc)).toEqual(["USRC17607839"]);
  });

  it("a repeated query is served from cache: no calls, no budget", async () => {
    const h = harness();
    h.records.a = scSong("a", "USRC17607839");
    h.deps.soundcharts.searchSongs.mockResolvedValue([{ uuid: "a" }]);
    await h.search("Same  Song", 10);
    await h.search("same song", 10);
    expect(h.deps.soundcharts.searchSongs).toHaveBeenCalledTimes(1);
    expect(h.deps.soundcharts.getSongByUuid).toHaveBeenCalledTimes(1);
    expect(h.deps.budget.used("search")).toBe(1);
    expect(h.logs.at(-1)).toMatch(/cached=true/);
  });

  it("after a failure Spotify is left alone for a minute, then tried again", async () => {
    const h = harness();
    await h.search("one", 10);
    await h.search("two", 10);
    expect(h.deps.spotifySearch).toHaveBeenCalledTimes(1);
    expect(h.logs.at(-1)).toMatch(/reason=spotify_recently_failed/);

    h.advance(SPOTIFY_RETRY_AFTER_MS + 1);
    h.deps.spotifySearch.mockResolvedValueOnce([spotifyTrack("USRC17607839")]);
    const out = await h.search("three", 10);
    expect(out.ok && out.provider).toBe("spotify");
  });

  it("both providers failing is an honest failure", async () => {
    const h = harness();
    h.deps.soundcharts.searchSongs.mockRejectedValue(new SoundchartsError("refused (403)", 403));
    const out = await h.search("q", 10);
    expect(out).toMatchObject({ ok: false, kind: "unavailable" });
    expect(h.logs.at(-1)).toMatch(/provider=soundcharts reason=spotify_401 outcome=failed upstream=403/);
  });
});

describe("cost control", () => {
  it("the daily cap refuses NEW fallback searches — and pasted links still work", async () => {
    const h = harness({}, { search: 2, link: 500 });
    await h.search("one", 10);
    await h.search("two", 10);
    const third = await h.search("three", 10);
    expect(third).toEqual({ ok: false, kind: "limited" });
    expect(h.deps.soundcharts.searchSongs).toHaveBeenCalledTimes(2);
    expect(h.logs.at(-1)).toMatch(/outcome=limited budget=2\/2/);

    h.deps.soundcharts.getSongByPlatformId.mockResolvedValue(scSong("x", "USRC17607839"));
    const link = await h.search("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", 10);
    expect(link.ok && link.songs).toHaveLength(1);
    expect(SEARCH_LIMITED_MESSAGE).toBe(
      "Search is temporarily limited. Try again later or paste a Spotify link.",
    );
  });

  it("the budget resets on the next UTC day", () => {
    let t = Date.parse("2026-09-19T23:59:00Z");
    const budget = createSearchBudget({ search: 1, link: 1 }, () => t);
    expect(budget.tryConsume("search")).toBe(true);
    expect(budget.tryConsume("search")).toBe(false);
    t += 2 * 60_000;
    expect(budget.used("search")).toBe(0);
    expect(budget.tryConsume("search")).toBe(true);
  });
});

describe("a pasted Spotify link", () => {
  const LINK = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x";

  it("resolves by platform id — one call, no Spotify, no name-search budget", async () => {
    const h = harness();
    h.deps.soundcharts.getSongByPlatformId.mockResolvedValue(scSong("x", "USRC17607839"));
    const out = await h.search(LINK, 10);
    expect(h.deps.soundcharts.getSongByPlatformId).toHaveBeenCalledWith("spotify", "4uLU6hMCjMI75M1A2tKUQC");
    expect(h.deps.spotifySearch).not.toHaveBeenCalled();
    expect(h.deps.soundcharts.searchSongs).not.toHaveBeenCalled();
    expect(h.deps.budget.used("search")).toBe(0);
    expect(out.ok && out.songs[0]).toMatchObject({
      isrc: "USRC17607839",
      spotifyTrackId: "4uLU6hMCjMI75M1A2tKUQC",
      spotifyUrl: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    });
    expect(h.logs.at(-1)).toMatch(/provider=soundcharts kind=link results=1/);

    await h.search(LINK, 10); // cached
    expect(h.deps.soundcharts.getSongByPlatformId).toHaveBeenCalledTimes(1);
  });

  it("a song Soundcharts does not know is 'no results', not an error", async () => {
    const h = harness();
    expect(await h.search(LINK, 10)).toEqual({ ok: true, songs: [], provider: "soundcharts" });
  });
});

describe("reading a Soundcharts record", () => {
  it("prefers the performing-artist list over creditName", () => {
    expect(
      soundchartsIdentity({
        name: "Stick Season",
        creditName: "Samy Jebari",
        mainArtists: [{ name: "Noah Kahan" }],
      }),
    ).toEqual({ title: "Stick Season", artist: "Noah Kahan" });
    expect(soundchartsIdentity({ name: "X", creditName: "Only Credit" }).artist).toBe("Only Credit");
    expect(soundchartsIdentity({})).toEqual({ title: null, artist: null });
  });
  it("reads the ISRC in either shape, and no ISRC means no result", () => {
    expect(soundchartsIsrc({ isrc: { value: "USRC17607839" } })).toBe("USRC17607839");
    expect(soundchartsIsrc({ isrc: "USRC17607839" })).toBe("USRC17607839");
    expect(soundchartsIsrc({})).toBeNull();
    expect(fromSoundchartsSong({ name: "No ISRC" })).toBeNull();
  });
  it("names the failure for the log without leaking the body", () => {
    expect(spotifyFailureReason(SPOTIFY_401)).toBe("spotify_401");
    expect(spotifyFailureReason(new Error("Spotify search request failed: The operation timed out"))).toBe("spotify_timeout");
    expect(spotifyFailureReason(new Error("Spotify search request failed: fetch failed"))).toBe("spotify_network");
    expect(spotifyFailureReason(new Error("SPOTIFY_CLIENT_ID is not set"))).toBe("spotify_unconfigured");
  });
});

describe("SoundchartsClient — the new endpoints", () => {
  let urls: string[];
  const respond = (status: number, body: unknown) =>
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown) => {
      urls.push(String(url));
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    }) as unknown as typeof fetch);

  beforeEach(() => {
    urls = [];
    vi.stubEnv("SOUNDCHARTS_APP_ID", "app");
    vi.stubEnv("SOUNDCHARTS_API_KEY", "key");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("search hits /api/v2/song/search/{term} with the term encoded and the limit capped", async () => {
    respond(200, { items: [{ uuid: "a" }] });
    const items = await new SoundchartsClient().searchSongs("AC/DC back in black", 99);
    expect(items).toEqual([{ uuid: "a" }]);
    expect(urls[0]).toBe(
      "https://customer.api.soundcharts.com/api/v2/song/search/AC%2FDC%20back%20in%20black?offset=0&limit=20",
    );
  });
  it("search 404 is 'nothing matched'; 403 (not on plan) and 429 are thrown with their class", async () => {
    respond(404, {});
    expect(await new SoundchartsClient().searchSongs("x", 5)).toEqual([]);
    vi.restoreAllMocks();
    respond(403, {});
    await expect(new SoundchartsClient().searchSongs("x", 5)).rejects.toMatchObject({ status: 403 });
    vi.restoreAllMocks();
    respond(429, {});
    await expect(new SoundchartsClient().searchSongs("x", 5)).rejects.toMatchObject({ status: 429 });
  });
  it("metadata and platform lookups use v2.25 and return the record", async () => {
    respond(200, { object: { uuid: "a", isrc: { value: "USRC17607839" } } });
    const c = new SoundchartsClient();
    await c.getSongByUuid("a");
    await c.getSongByPlatformId("spotify", "4uLU6hMCjMI75M1A2tKUQC");
    expect(urls).toEqual([
      "https://customer.api.soundcharts.com/api/v2.25/song/a",
      "https://customer.api.soundcharts.com/api/v2.25/song/by-platform/spotify/4uLU6hMCjMI75M1A2tKUQC",
    ]);
  });
});
