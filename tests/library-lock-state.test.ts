/**
 * The library: every scanned song is kept, and each one is locked or unlocked.
 *
 *   - every unentitled scan is persisted by the claim call, whether or not the
 *     creator ever pays — and that write grants nothing;
 *   - lock state is decided by the SAME rules the report route applies, so a
 *     row marked unlocked is a row that opens;
 *   - the catalog returns lock state and the server's price, and no report
 *     content;
 *   - a locked row's "Unlock" is the same purchase the reveal starts.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolveAccess,
  resolveLibraryAccess,
  type EntitlementRecord,
} from "@/lib/commerce/credit-service";
import { InMemoryEntitlementStore } from "./support/memory-store";
import { formatUnlockPrice, fetchServerCatalog } from "@/lib/memory/catalog.client";
import { songRowFor } from "@/lib/memory/song-row";
import { encodeIsrcScanId } from "@/lib/scan-id";

const DAY = 86_400_000;
const NOW = new Date("2026-09-19T12:00:00Z");
const USER = "user-1";

const scan = (isrc: string) => {
  const scanId = encodeIsrcScanId(isrc)!;
  return { scanId, trackKey: `isrc-${isrc.toLowerCase()}` };
};
const A = scan("GBUM71029604");
const B = scan("USRC17607839");
const C = scan("USUM71703861");
const D = scan("GBAHS1600463");

function ent(over: Partial<EntitlementRecord>): EntitlementRecord {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    user_id: USER,
    offer: "song_intelligence",
    scan_id: null,
    track_limit: 1,
    status: "active",
    granted_at: new Date(NOW.getTime() - DAY).toISOString(),
    expires_at: new Date(NOW.getTime() + 30 * DAY).toISOString(),
    ...over,
  };
}

describe("resolveLibraryAccess", () => {
  it("unlocks exactly the scans the report route would serve", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(ent({ scan_id: A.scanId })); // paid (or included-first)
    store.addEntitlement(
      ent({ scan_id: B.scanId, expires_at: new Date(NOW.getTime() - DAY).toISOString() }),
    ); // expired
    store.addEntitlement(ent({ scan_id: C.scanId, status: "refunded" })); // refunded
    // D: never bought

    const unlocked = await resolveLibraryAccess(store, USER, [A, B, C, D], NOW);
    expect(Array.from(unlocked)).toEqual([A.scanId]);

    // Parity, scan by scan, with the rule the paid route actually runs.
    for (const s of [A, B, C, D]) {
      const access = await resolveAccess(store, USER, s.scanId, s.trackKey, NOW);
      expect(unlocked.has(s.scanId)).toBe(access.ok);
    }
  });

  it("Creator Intelligence unlocks attached songs only", async () => {
    const store = new InMemoryEntitlementStore();
    const creator = store.addEntitlement(
      ent({ offer: "creator_intelligence", track_limit: 10 }),
    );
    await store.attachTrack({
      entitlementId: creator.id,
      trackKey: A.trackKey,
      scanId: A.scanId,
    });
    const unlocked = await resolveLibraryAccess(store, USER, [A, B], NOW);
    expect(Array.from(unlocked)).toEqual([A.scanId]);
  });

  it("another creator's entitlement unlocks nothing", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(ent({ scan_id: A.scanId, user_id: "someone-else" }));
    expect((await resolveLibraryAccess(store, USER, [A], NOW)).size).toBe(0);
  });

  it("is read-only, and looks the creator entitlement up once for the whole library", async () => {
    const store = new InMemoryEntitlementStore();
    const creator = store.addEntitlement(
      ent({ offer: "creator_intelligence", track_limit: 10 }),
    );
    const findCreator = vi.spyOn(store, "findCreatorEntitlement");
    const listTracks = vi.spyOn(store, "listTracks");
    await resolveLibraryAccess(store, USER, [A, B, C, D], NOW);
    expect(findCreator).toHaveBeenCalledTimes(1);
    expect(listTracks).toHaveBeenCalledTimes(1);
    expect(listTracks).toHaveBeenCalledWith(creator.id);
    expect(store.insertCount).toBe(0);
  });

  it("an empty library is an empty answer", async () => {
    const store = new InMemoryEntitlementStore();
    expect((await resolveLibraryAccess(store, USER, [], NOW)).size).toBe(0);
  });
});

describe("the unlock price shown is the server's", () => {
  it("formats the offer", () => {
    expect(formatUnlockPrice({ offer: "song_intelligence", amountCents: 1900, currency: "usd" })).toBe("$19");
    expect(formatUnlockPrice({ offer: "song_intelligence", amountCents: 1950, currency: "USD" })).toBe("$19.50");
  });
  it("states nothing it cannot state honestly", () => {
    expect(formatUnlockPrice(null)).toBeNull();
    expect(formatUnlockPrice({ offer: "song_intelligence", amountCents: 0, currency: "usd" })).toBeNull();
    expect(formatUnlockPrice({ offer: "song_intelligence", amountCents: 1900, currency: "eur" })).toBeNull();
  });
  it("the library UI hard-codes no price", () => {
    const dash = readFileSync("src/components/dashboard/Dashboard.tsx", "utf8");
    const row = dash.slice(dash.indexOf("function SongRowItem"), dash.indexOf("function CatalogCompleteBand"));
    expect(row).not.toMatch(/\$\s?19/);
    expect(row).toContain("`Unlock — ${unlockPrice}`");
  });
});

describe("catalog client carries lock state", () => {
  afterEach(() => vi.restoreAllMocks());
  it("maps entitled and the price; absent entitled reads as locked", async () => {
    const entry = (scanId: string, entitled?: boolean) => ({
      scanId,
      trackKey: "isrc-x",
      title: "T",
      artistName: "A",
      epiScore: 60,
      mode: "Ready",
      scores: { focus: 40, calm: 40, motivation: 70, balance: 50 },
      analyzedAt: "2026-09-19T00:00:00Z",
      status: "complete",
      ...(entitled === undefined ? {} : { entitled }),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        identified: true,
        credits: null,
        unlock: { offer: "song_intelligence", amountCents: 1900, currency: "usd" },
        catalog: [entry(A.scanId, true), entry(B.scanId, false), entry(C.scanId)],
      }),
    } as unknown as Response);

    const state = await fetchServerCatalog();
    expect(state.unlockPrice).toBe("$19");
    const rows = state.scans.map((s) => songRowFor(s, state.entries)!);
    expect(rows.map((r) => r.entitled)).toEqual([true, false, false]);
    // Locked or not, the measurements are all there.
    for (const r of rows) {
      expect(r.epiScore).toBe(60);
      expect(r.mode).toBe("Ready");
      expect(r.vertices).not.toBeNull();
    }
  });
});

// ── Routes ────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  configured: true,
  userId: "user-1" as string | null,
  usedFreeFirst: true,
  ownedRows: [] as unknown[],
  persist: vi.fn(),
  prepare: vi.fn(),
  grant: vi.fn(),
  getCatalog: vi.fn(),
  unlockedScansFor: vi.fn(),
  entitlementWrites: 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminConfigured: () => h.configured,
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) q[m] = () => q;
      q.limit = async () => ({ data: h.ownedRows });
      q.insert = async () => {
        h.entitlementWrites += 1;
        return { error: null };
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/commerce/entitlements", () => ({
  currentUserId: async () => h.userId,
  currentCreditSummary: async () => null,
  unlockedScansFor: h.unlockedScansFor,
}));
vi.mock("@/lib/commerce/free-first.server", () => ({
  hasUsedFreeFirst: async () => h.usedFreeFirst,
  grantFreeFirst: h.grant,
}));
vi.mock("@/lib/reports/prepare.server", () => ({ prepareReportForScan: h.prepare }));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => void promise }));
vi.mock("@/lib/scan/fulfillment.server", () => ({ ensureAnalysisPersisted: h.persist }));
vi.mock("@/lib/memory/catalog.server", () => ({ getCatalog: h.getCatalog }));

import { POST as claim } from "@/app/api/scan/claim/route";
import { GET as catalog } from "@/app/api/catalog/route";

const claimReq = (scanId: string) =>
  claim(new Request("http://t/api/scan/claim", { method: "POST", body: JSON.stringify({ scanId }) }));

beforeEach(() => {
  h.configured = true;
  h.userId = "user-1";
  h.usedFreeFirst = true;
  h.ownedRows = [];
  h.entitlementWrites = 0;
  h.persist.mockReset().mockResolvedValue({ ok: true, analysisId: "a", songId: "s" });
  h.prepare.mockReset().mockResolvedValue({
    status: "preparing",
    startedAt: NOW.toISOString(),
    timings: [],
  });
  h.grant.mockReset();
  h.getCatalog.mockReset();
  h.unlockedScansFor.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/scan/claim keeps every scanned song", () => {
  it("included report already used → the analysis is still saved, and nothing is granted", async () => {
    const res = await claimReq(A.scanId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "already_used", saved: true });
    expect(h.persist).toHaveBeenCalledWith("user-1", A.scanId);
    // The report is prewarmed without granting access or writing entitlement.
    expect(h.prepare).toHaveBeenCalledWith("user-1", A.scanId);
    expect(h.grant).not.toHaveBeenCalled();
    expect(h.entitlementWrites).toBe(0);
  });

  it("a save failure never blocks the reveal", async () => {
    h.persist.mockResolvedValue({ ok: false, reason: "engine_unavailable" });
    const res = await claimReq(A.scanId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "already_used", saved: false });
  });

  it("the first report still works as designed: prepared in full, then granted", async () => {
    h.usedFreeFirst = false;
    h.prepare.mockResolvedValue({ status: "ready", readiness: {}, reused: false, timings: [] });
    h.grant.mockResolvedValue("granted");
    const res = await claimReq(A.scanId);
    expect(await res.json()).toEqual({ status: "granted" });
    expect(h.prepare).toHaveBeenCalledWith("user-1", A.scanId);
    expect(h.grant).toHaveBeenCalledTimes(1);
  });

  it("no identity → 401, nothing saved", async () => {
    h.userId = null;
    expect((await claimReq(A.scanId)).status).toBe(401);
    expect(h.persist).not.toHaveBeenCalled();
  });
});

describe("GET /api/catalog", () => {
  const song = (s: { scanId: string; trackKey: string }) => ({
    scanId: s.scanId,
    trackKey: s.trackKey,
    title: "Song",
    artistName: "Artist",
    isrc: null,
    source: "soundcharts",
    epiScore: 58,
    mode: "Ready",
    scores: { focus: 41, calm: 36, motivation: 78, balance: 52 },
    circumplex: { valence: 0.5, arousal: 0.66 },
    engineVersion: "chrp-epi-v2",
    analyzedAt: "2026-09-19T00:00:00Z",
    status: "complete",
  });

  it("marks each song locked or unlocked and names the server's price", async () => {
    h.getCatalog.mockResolvedValue([song(A), song(B)]);
    h.unlockedScansFor.mockResolvedValue(new Set([A.scanId]));
    const body = await (await catalog()).json();
    expect(body.identified).toBe(true);
    expect(body.catalog.map((c: { entitled: boolean }) => c.entitled)).toEqual([true, false]);
    expect(body.unlock).toEqual({ offer: "song_intelligence", amountCents: 1900, currency: "usd" });
    // Lock state was asked about THIS caller's songs.
    expect(h.unlockedScansFor.mock.calls[0][0]).toBe("user-1");
  });

  it("returns only what the free reveal shows — never report content", async () => {
    h.getCatalog.mockResolvedValue([song(B)]);
    h.unlockedScansFor.mockResolvedValue(new Set());
    const text = JSON.stringify(await (await catalog()).json());
    for (const paid of ["rhodes", "placements", "buyers", "pitch", "signature", "throughline", "consider", "payload"]) {
      expect(text).not.toContain(`"${paid}"`);
    }
    const route = readFileSync("src/app/api/catalog/route.ts", "utf8");
    expect(route).not.toMatch(/reports|getPersistedReport|resolveEntitledReport/);
  });

  it("no session → nothing, no lock lookups", async () => {
    h.userId = null;
    const body = await (await catalog()).json();
    expect(body).toEqual({ catalog: [], credits: null, identified: false });
    expect(h.unlockedScansFor).not.toHaveBeenCalled();
  });
});

describe("a locked row unlocks through the same purchase as the reveal", () => {
  const dash = readFileSync("src/components/dashboard/Dashboard.tsx", "utf8");
  const row = dash.slice(dash.indexOf("function SongRowItem"), dash.indexOf("function CatalogCompleteBand"));

  it("uses beginPurchaseWith for song_intelligence against that scan", () => {
    expect(row).toContain("beginPurchaseWith(");
    expect(row).toContain('"song_intelligence"');
    expect(row).toMatch(/ensureIdentity,\s*prepareReport,\s*startCheckout,/);
    expect(row).toContain("scan.id,");
  });

  it("an unlocked row is simply a link to the report — no label, no button", () => {
    const unlockedBranch = row.slice(row.indexOf("if (r.entitled) {"), row.indexOf("// LOCKED"));
    expect(unlockedBranch).toContain("<Link");
    expect(unlockedBranch).toContain("href={href}");
    expect(unlockedBranch).not.toContain("<button");
    expect(row).not.toContain("View report</");
  });

  it("locked and unlocked rows render the SAME measurements — nothing hidden, nothing dimmed", () => {
    // One `cells` fragment (shape, title, artist, date, EPI, mode) is built
    // before the entitlement branch and used by both.
    const cells = row.slice(row.indexOf("const cells = ("), row.indexOf("const grid ="));
    for (const shown of ["<PolygonRadar", "{r.title}", "{r.artist}", "scan.scannedAt", "{r.epiScore}", "{r.mode}"]) {
      expect(cells).toContain(shown);
    }
    expect(cells).not.toContain("r.entitled");
    expect(row.match(/\{cells\}/g)).toHaveLength(2);
    // No greying: a locked row carries no opacity, filter or muted colour.
    const lockedBranch = row.slice(row.indexOf("// LOCKED"));
    const beforeButton = lockedBranch.slice(0, lockedBranch.indexOf("<button"));
    expect(beforeButton).not.toMatch(/opacity|grayscale|blur|text-ink-light/);
  });

  it("the Unlock button is signal yellow and names the server's price", () => {
    const button = row.slice(row.indexOf("<button"), row.indexOf("</button>"));
    expect(button).toContain('backgroundColor: "var(--chrp-yellow)"');
    expect(button).toContain("onClick={unlock}");
    expect(button).toContain("`Unlock — ${unlockPrice}`");
  });

  it("My Songs re-asks the server when the creator returns, so a row unlocks without a reload", () => {
    expect(dash).toContain('addEventListener("visibilitychange"');
    expect(dash).toContain('addEventListener("pageshow"');
  });
});

describe("progress cells fill from the real catalog", () => {
  const dash = readFileSync("src/components/dashboard/Dashboard.tsx", "utf8");
  const meter = dash.slice(dash.indexOf("function ProgressMeter"), dash.indexOf("function ScanList"));

  it("a cell is filled because the creator has that many songs, not because of a demo-track lookup", () => {
    expect(meter).toContain("filled={Boolean(scan)}");
    expect(meter).toContain("songRowFor(scan, entries)");
    expect(meter).not.toContain("getFreeReportById");
    // The count in the heading and the cells come from the same list.
    expect(meter).toContain("Math.min(scans.length, threshold)");
  });

  it("a counted song with no shape on file is still a filled cell", () => {
    const cell = dash.slice(dash.indexOf("function ProgressCell"), dash.indexOf("function ScanList"));
    expect(cell).toContain('data-filled="true"');
    expect(cell).toMatch(/row\?\.vertices && row\.mode \?/);
  });
});

describe("the scan history scrollbar", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const block = css.slice(css.indexOf(".scan-history-scroll {"));

  it("is always shown, and the list is the thing that scrolls", () => {
    expect(block).toMatch(/overflow-y:\s*scroll/);
    expect(block).toMatch(/max-height:/);
    const dash = readFileSync("src/components/dashboard/Dashboard.tsx", "utf8");
    expect(dash).toContain("scan-history-scroll");
  });

  it("styles WebKit/Blink and Firefox separately, with a visible thumb on the cream ground", () => {
    expect(block).toContain(".scan-history-scroll::-webkit-scrollbar {");
    expect(block).toContain(".scan-history-scroll::-webkit-scrollbar-track");
    expect(block).toContain(".scan-history-scroll::-webkit-scrollbar-thumb");
    expect(block).toMatch(/@supports not selector\(::-webkit-scrollbar\)[\s\S]*scrollbar-width:[\s\S]*scrollbar-color:/);
    // Not the page's dark-ground track.
    expect(block.slice(0, block.indexOf("@supports"))).not.toContain("var(--ink)");
  });
});
