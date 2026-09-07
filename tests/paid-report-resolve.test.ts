import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolveEntitledReportWith,
  type ResolveDeps,
} from "@/lib/reports/resolve.server";
import type { ReportTiming } from "@/lib/reports/timing";
import type { FreeReport } from "@/lib/fixtures/tracks";
import {
  InMemoryReportStore,
  legacyPaidSections,
  paidSections,
} from "./support/report-store";

/**
 * The paid path after payment: verify entitlement → read persisted report →
 * render. NOTHING ELSE. The resolver has no preparer dependency and imports
 * no upstream client, so there is no code path from a paid read to
 * Soundcharts, enrichment or Anthropic — proven both structurally (the
 * import-graph test) and behaviourally (the store call trace shows only
 * getReport).
 */

const USER = "user_a";
const SCAN = "scn_isrc-ustest0000001_abc123";
const TRACK_KEY = "isrc-ustest0000001";

function free(): FreeReport {
  return {
    report_meta: {
      id: "USTEST0000001",
      version: "v1.0",
      scanned_at: "2026-09-01T00:00:00.000Z",
      scanned_at_display: "2026.09.01  //  00:00",
    },
    track: { title: "Safe", artist: "The Brevet", isrc: "USTEST0000001", artworkUrl: null },
    epi: { score: 62, mode: "Flow", rank_in_mode: "", rank_overall: "" },
    chrp_scores: [
      { name: "Focus", score: 71, rank: "", rank_class: "high", anchor: "" },
      { name: "Balance", score: 62, rank: "", rank_class: "mid", anchor: "" },
      { name: "Motivation", score: 55, rank: "", rank_class: "mid", anchor: "" },
      { name: "Calm", score: 68, rank: "", rank_class: "mid", anchor: "" },
    ],
    hpv: [],
    creator: { name: "The Brevet", tracks_scored: 1, tease: "" },
    free_statement: "Flow mode — focus leads, motivation recedes.",
  };
}

function makeDeps(
  store: InMemoryReportStore,
  overrides: Partial<ResolveDeps> = {},
): { deps: ResolveDeps; timings: ReportTiming[] } {
  const timings: ReportTiming[] = [];
  const deps: ResolveDeps = {
    access: async () => ({
      ok: true,
      trackKey: TRACK_KEY,
      entitlement: {
        id: "ent_1",
        user_id: USER,
        offer: "song_intelligence",
        scan_id: SCAN,
        track_limit: 1,
        status: "active",
        granted_at: "2026-09-01T00:00:00.000Z",
        expires_at: "2026-11-01T00:00:00.000Z",
      },
    }),
    userId: async () => USER,
    store,
    freeReport: async () => free(),
    fixture: () => null,
    sink: (t) => timings.push(t),
    ...overrides,
  };
  return { deps, timings };
}

describe("the paid path never requires live Soundcharts, enrichment or Anthropic after payment", () => {
  it("serves the persisted report from the store and touches nothing else", async () => {
    const store = new InMemoryReportStore();
    store.seedReport({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: paidSections(),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps, timings } = makeDeps(store);

    const resolved = await resolveEntitledReportWith(deps, SCAN);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source).toBe("generated");
    expect(resolved.report.rhodes).toBe(paidSections().rhodes);
    expect(resolved.report.track.title).toBe("Safe");
    expect(timings.map((t) => t.stage)).toEqual([
      "entitlement_check",
      "persisted_report_retrieval",
    ]);
    // The only store interaction is a single read. No claim, no write.
    expect(store.calls).toEqual([`getReport:${USER}:${SCAN}`]);
  });

  it("the resolver module imports no upstream client, and no preparer", () => {
    const src = readFileSync("src/lib/reports/resolve.server.ts", "utf8");
    for (const upstream of [
      "@/lib/engine/soundcharts",
      "@/lib/engine/analyze.server",
      "@/lib/engine/spotify",
      "@/lib/reports/generate.server",
      "@/lib/reports/prepare.server",
      "@/lib/reports/prepare\"",
      "@/lib/reports/analysis-facts.server",
      "api.anthropic.com",
    ]) {
      expect(src, upstream).not.toContain(upstream);
    }
  });

  it("the free-report module it depends on also imports no upstream client", () => {
    const src = readFileSync("src/lib/reports/free-report.server.ts", "utf8");
    for (const upstream of [
      "@/lib/engine/soundcharts",
      "@/lib/engine/analyze.server",
      "@/lib/reports/generate.server",
      "@/lib/rhodes",
    ]) {
      expect(src, upstream).not.toContain(upstream);
    }
  });
});

describe("a saved report serves immediately", () => {
  it("is a read: exactly one store lookup, no claim, no preparation", async () => {
    const store = new InMemoryReportStore();
    store.seedReport({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: paidSections(),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps } = makeDeps(store);
    await resolveEntitledReportWith(deps, SCAN);
    expect(store.calls).toEqual([`getReport:${USER}:${SCAN}`]);
    expect(store.calls.some((c) => c.startsWith("beginClaim"))).toBe(false);
  });
});

describe("refresh and revisit serve the same saved report", () => {
  it("returns identical content on every read, without regenerating", async () => {
    const store = new InMemoryReportStore();
    const row = store.seedReport({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: paidSections({ rhodes: "The one reading this creator bought." }),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps } = makeDeps(store);

    const first = await resolveEntitledReportWith(deps, SCAN);
    const second = await resolveEntitledReportWith(deps, SCAN);
    const third = await resolveEntitledReportWith(deps, SCAN);

    for (const r of [first, second, third]) {
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.report.rhodes).toBe("The one reading this creator bought.");
    }
    expect(JSON.stringify(first)).toBe(JSON.stringify(third));
    expect(store.reports[0].id).toBe(row.id);
    expect(store.completeReports()).toHaveLength(1);
    expect(store.claims).toHaveLength(0);
  });
});

describe("unpaid users cannot retrieve persisted report contents", () => {
  it("returns the opaque 403 and never reads the store, even when a report is on file", async () => {
    const store = new InMemoryReportStore();
    store.seedReport({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: paidSections(),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps } = makeDeps(store, {
      access: async () => ({ ok: false, reason: "no_entitlement" }),
    });

    const resolved = await resolveEntitledReportWith(deps, SCAN);

    expect(resolved).toEqual({ ok: false, status: 403, error: "forbidden", entitled: false });
    expect(store.calls).toHaveLength(0);
  });

  it("an expired entitlement is denied identically", async () => {
    const store = new InMemoryReportStore();
    store.seedReport({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: paidSections(),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps } = makeDeps(store, {
      access: async () => ({ ok: false, reason: "expired" }),
    });
    const resolved = await resolveEntitledReportWith(deps, SCAN);
    expect(resolved).toMatchObject({ ok: false, status: 403, error: "forbidden" });
    expect(store.calls).toHaveLength(0);
  });

  it("a caller with no identity is denied before the store is consulted", async () => {
    const store = new InMemoryReportStore();
    const { deps } = makeDeps(store, { userId: async () => null });
    const resolved = await resolveEntitledReportWith(deps, SCAN);
    expect(resolved).toMatchObject({ ok: false, status: 403 });
    expect(store.calls).toHaveLength(0);
  });

  it("another creator's report for the same scan is never served", async () => {
    const store = new InMemoryReportStore();
    store.seedReport({
      creatorId: "user_b",
      scanId: SCAN,
      analysisId: "an_b",
      payload: paidSections({ rhodes: "user_b's reading" }),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps } = makeDeps(store);
    const resolved = await resolveEntitledReportWith(deps, SCAN);
    // Entitled, but nothing on file for THIS creator — 503, not the other
    // creator's row, and no generation.
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.status).toBe(503);
    expect(store.calls.some((c) => c.startsWith("beginClaim"))).toBe(false);
  });

  it("the preparation routes expose readiness only", () => {
    const prepareRoute = readFileSync("src/app/api/scan/prepare/route.ts", "utf8");
    expect(prepareRoute).not.toContain("resolveEntitledReport");
    expect(prepareRoute).not.toMatch(/payload/);
    expect(prepareRoute).toContain("...result.readiness");
  });
});

describe("existing entitled reports remain accessible after migration — as a pure read", () => {
  it("a report persisted under the earlier contract still serves, unchanged, with no work", async () => {
    const store = new InMemoryReportStore();
    store.seedReport({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_legacy",
      payload: legacyPaidSections(),
      generatorVersion: "chrp-report-v1",
      model: "claude-3-5-sonnet",
    });
    const { deps } = makeDeps(store);

    const resolved = await resolveEntitledReportWith(deps, SCAN);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.report.rhodes).toBe(legacyPaidSections().rhodes);
    expect(resolved.report.consider).toBeUndefined();
    expect(store.calls).toEqual([`getReport:${USER}:${SCAN}`]);
    expect(store.claims).toHaveLength(0);
    expect(store.completeReports()).toHaveLength(1);
    expect(store.reports[0].generatorVersion).toBe("chrp-report-v1");
  });

  it("an entitled report with an INCOMPLETE payload gets an honest 503 — never a regeneration on the read path", async () => {
    const store = new InMemoryReportStore();
    store.seedReport({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: { rhodes: "" }, // a broken earlier write
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps } = makeDeps(store);
    const resolved = await resolveEntitledReportWith(deps, SCAN);

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.status).toBe(503);
      expect(resolved.entitled).toBe(true);
      expect(resolved.detail).toMatch(/being prepared/);
    }
    // The read did NOT claim, generate, or overwrite the row. Recovery is the
    // offline backfill's job, not the buyer's read.
    expect(store.calls).toEqual([`getReport:${USER}:${SCAN}`]);
    expect(store.claims).toHaveLength(0);
    expect(store.reports[0].payload).toEqual({ rhodes: "" });
  });
});
