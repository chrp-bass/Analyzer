/**
 * My Songs shows the REAL creator and their REAL songs.
 *
 * What was wrong: after a working email return, /dashboard showed a
 * localStorage demo identity's email instead of the Supabase creator's, and
 * no songs — the list resolved every row through the six bundled fixture
 * tracks and silently dropped anything else, which is every real song.
 *
 * Pinned here:
 *   - identity comes from /api/identity/state, and fails closed to "none";
 *   - the catalog client keeps the server's record of each song;
 *   - a real (ISRC-keyed) song resolves to a row from that record;
 *   - Dashboard and AuthNavLink no longer call the demo identity functions,
 *     and "Reset demo state" is development-only.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fetchIdentityState } from "@/lib/identity-state";
import {
  fetchServerCatalog,
  type ServerCatalogEntry,
} from "@/lib/memory/catalog.client";
import { songRowFor } from "@/lib/memory/song-row";
import { TRACK_SLUGS, getFreeReportById } from "@/lib/fixtures/tracks";

function stubFetch(impl: (url: string) => unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation((async (input: unknown) => {
    const out = impl(String(input));
    if (out instanceof Error) throw out;
    return out as Response;
  }) as typeof fetch);
}
const json = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

afterEach(() => vi.restoreAllMocks());

describe("fetchIdentityState", () => {
  it("returns the verified creator's own email", async () => {
    stubFetch(() => json({ ownership: "verified", email: "jeffs@chrp.ai" }));
    expect(await fetchIdentityState()).toEqual({
      ownership: "verified",
      email: "jeffs@chrp.ai",
    });
  });

  it("an anonymous session is a real identity with no email", async () => {
    stubFetch(() => json({ ownership: "anonymous", email: "leak@x.co" }));
    expect(await fetchIdentityState()).toEqual({
      ownership: "anonymous",
      email: null,
    });
  });

  it("asks the identity endpoint, uncached", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({ ownership: "none" }));
    await fetchIdentityState();
    expect(spy).toHaveBeenCalledWith("/api/identity/state", { cache: "no-store" });
  });

  it("fails closed to no identity", async () => {
    stubFetch(() => json({}, false));
    expect((await fetchIdentityState()).ownership).toBe("none");
    stubFetch(() => new Error("offline"));
    expect((await fetchIdentityState()).ownership).toBe("none");
    stubFetch(() => json({ ownership: "admin", email: 7 }));
    expect(await fetchIdentityState()).toEqual({ ownership: "none", email: null });
  });
});

const REAL: ServerCatalogEntry = {
  scanId: "scn_isrc-gbum71029604_8fexwh",
  trackKey: "isrc-gbum71029604",
  title: "Rolling in the Deep",
  artistName: "Adele",
  epiScore: 58.3,
  mode: "Ready",
  scores: { focus: 41.2, calm: 36, motivation: 78.4, balance: 52 },
  analyzedAt: "2026-09-08T01:14:00.000Z",
  status: "complete",
};

describe("fetchServerCatalog keeps the server's record of each song", () => {
  it("indexes complete entries by scan id", async () => {
    stubFetch(() =>
      json({
        identified: true,
        credits: null,
        catalog: [REAL, { ...REAL, scanId: "scn_isrc-x_aaaaaa", status: "pending" }],
      }),
    );
    const state = await fetchServerCatalog();
    expect(state.identified).toBe(true);
    expect(state.scans.map((s) => s.id)).toEqual([REAL.scanId]);
    expect(Object.keys(state.entries)).toEqual([REAL.scanId]);
    expect(state.entries[REAL.scanId].title).toBe("Rolling in the Deep");
  });

  it("no session → nothing, including no entries", async () => {
    stubFetch(() => json({ identified: false, catalog: [], credits: null }));
    expect(await fetchServerCatalog()).toEqual({
      identified: false,
      scans: [],
      credits: null,
      entries: {},
      unlockPrice: null,
    });
  });
});

describe("songRowFor", () => {
  const scan = { id: REAL.scanId, trackSlug: REAL.trackKey };

  it("a real song is NOT in the fixture catalogue — the old lookup dropped it", () => {
    expect(getFreeReportById(REAL.trackKey)).toBeNull();
  });

  it("resolves a real song from the server's record", () => {
    expect(songRowFor(scan, { [REAL.scanId]: REAL })).toEqual({
      title: "Rolling in the Deep",
      artist: "Adele",
      epiScore: 58,
      mode: "Ready",
      vertices: { focus: 41.2, calm: 36, motivation: 78.4, balance: 52 },
      // Only the server can say a song is unlocked; absent reads as locked.
      entitled: false,
    });
    expect(
      songRowFor(scan, { [REAL.scanId]: { ...REAL, entitled: true } })?.entitled,
    ).toBe(true);
  });

  it("still shows the song when optional measurements are missing or odd", () => {
    const row = songRowFor(scan, {
      [REAL.scanId]: {
        ...REAL,
        artistName: null,
        epiScore: null,
        mode: "Verdict",
        scores: { focus: 40 },
      },
    });
    expect(row).toEqual({
      title: "Rolling in the Deep",
      artist: null,
      epiScore: null,
      mode: null,
      vertices: null,
      entitled: false,
    });
  });

  it("falls back to the bundled fixture only when the server has no record", () => {
    const slug = TRACK_SLUGS[0];
    const fixture = getFreeReportById(slug)!;
    const row = songRowFor({ id: "scn_local_abc123", trackSlug: slug }, {});
    expect(row?.title).toBe(fixture.track.title);
    expect(row?.mode).toBe(fixture.epi.mode);
  });

  it("nothing known → no row", () => {
    expect(songRowFor(scan, {})).toBeNull();
  });
});

describe("the demo identity no longer speaks for the creator", () => {
  const dashboard = readFileSync("src/components/dashboard/Dashboard.tsx", "utf8");
  const nav = readFileSync("src/components/AuthNavLink.tsx", "utf8");

  it("Dashboard and AuthNavLink call none of the MODE-gated demo functions", () => {
    for (const src of [dashboard, nav]) {
      for (const fn of [
        "getCurrentUser",
        "getUserScans",
        "getUserCredits",
        "sendProfileUnlock",
        "getOrCreateGuestUser",
      ]) {
        expect(src).not.toContain(fn);
      }
      expect(src).not.toContain('from "@/lib/email"');
    }
  });

  it("both read the real identity", () => {
    expect(dashboard).toContain("fetchIdentityState");
    expect(dashboard).toContain("fetchServerCatalog");
    expect(nav).toContain("fetchIdentityState");
    expect(nav).not.toContain("@/lib/accounts");
  });

  it("My Songs rows come from the server record, not a fixture lookup", () => {
    const body = dashboard.slice(
      dashboard.indexOf("function ScanList"),
      dashboard.indexOf("function CatalogCompleteBand"),
    );
    expect(body).toContain("songRowFor(scan, entries)");
    expect(body).not.toContain("getFreeReportById");
  });

  it('"Reset demo state" is gone — not gated, removed', () => {
    // It used to be development-only behind demoFallbackAllowed(). It is now
    // deleted outright, so no build or environment can put it on My Songs.
    expect(dashboard).not.toContain("Reset all demo state?");
    expect(dashboard.toLowerCase()).not.toContain("reset demo state");
    expect(dashboard).not.toContain("clearAllUserData");
  });
});
