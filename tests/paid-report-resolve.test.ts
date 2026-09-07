import { describe, expect, it, vi } from "vitest";
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
 * render. Nothing else. These run the production resolver over an in-memory
 * report store, with the upstream layers (Soundcharts, enrichment, Anthropic)
 * represented by a single `recover` spy — the ONLY way the resolver can reach
 * any of them — so "never called" is a claim about real control flow.
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
): { deps: ResolveDeps; recover: ReturnType<typeof vi.fn>; timings: ReportTiming[] } {
  const timings: ReportTiming[] = [];
  const recover = vi.fn(async () => ({
    status: "failed" as const,
    reason: "generation_failed" as const,
    message: "no",
    timings: [],
  }));
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
    recover: recover as unknown as ResolveDeps["recover"],
    fixture: () => null,
    sink: (t) => timings.push(t),
    ...overrides,
  };
  return { deps, recover, timings };
}

describe("the paid path never requires live Soundcharts, enrichment or Anthropic after payment", () => {
  it("serves the persisted report from the store and touches no upstream", async () => {
    const store = new InMemoryReportStore();
    store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: paidSections(),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps, recover, timings } = makeDeps(store);

    const resolved = await resolveEntitledReportWith(deps, SCAN);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source).toBe("generated");
    expect(resolved.report.rhodes).toBe(paidSections().rhodes);
    expect(resolved.report.track.title).toBe("Safe");
    expect(recover).not.toHaveBeenCalled();
    expect(timings.map((t) => t.stage)).toEqual([
      "entitlement_check",
      "persisted_report_retrieval",
    ]);
  });

  it("the resolver module imports no upstream client at all", () => {
    const src = readFileSync("src/lib/reports/resolve.server.ts", "utf8");
    for (const upstream of [
      "@/lib/engine/soundcharts",
      "@/lib/engine/analyze.server",
      "@/lib/rhodes\"",
      "@/lib/reports/generate.server",
      "api.anthropic.com",
    ]) {
      expect(src).not.toContain(upstream);
    }
  });
});

describe("a saved report serves immediately", () => {
  it("is a read: exactly one store lookup, no preparation", async () => {
    const store = new InMemoryReportStore();
    store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: paidSections(),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps, recover } = makeDeps(store);
    await resolveEntitledReportWith(deps, SCAN);
    expect(store.calls.filter((c) => c.startsWith("getReport"))).toHaveLength(1);
    expect(store.calls.some((c) => c.startsWith("beginPreparation"))).toBe(false);
    expect(recover).not.toHaveBeenCalled();
  });
});

describe("refresh and revisit serve the same saved report", () => {
  it("returns identical content on every read, without regenerating", async () => {
    const store = new InMemoryReportStore();
    const row = store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: paidSections({ rhodes: "The one reading this creator bought." }),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps, recover } = makeDeps(store);

    const first = await resolveEntitledReportWith(deps, SCAN);
    const second = await resolveEntitledReportWith(deps, SCAN);
    const third = await resolveEntitledReportWith(deps, SCAN);

    for (const r of [first, second, third]) {
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.report.rhodes).toBe("The one reading this creator bought.");
    }
    expect(JSON.stringify(first)).toBe(JSON.stringify(third));
    expect(store.rows[0].id).toBe(row.id);
    expect(store.completeReports()).toHaveLength(1);
    expect(recover).not.toHaveBeenCalled();
  });
});

describe("unpaid users cannot retrieve persisted report contents", () => {
  it("returns the opaque 403 and never reads the store, even when a report is on file", async () => {
    const store = new InMemoryReportStore();
    store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: paidSections(),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps, recover } = makeDeps(store, {
      access: async () => ({ ok: false, reason: "no_entitlement" }),
    });

    const resolved = await resolveEntitledReportWith(deps, SCAN);

    expect(resolved).toEqual({ ok: false, status: 403, error: "forbidden", entitled: false });
    expect(store.calls).toHaveLength(0);
    expect(recover).not.toHaveBeenCalled();
  });

  it("an expired entitlement is denied identically", async () => {
    const store = new InMemoryReportStore();
    store.seed({
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
    store.seed({
      creatorId: "user_b",
      scanId: SCAN,
      analysisId: "an_b",
      payload: paidSections({ rhodes: "user_b's reading" }),
      generatorVersion: "chrp-rhodes-v2",
    });
    const { deps } = makeDeps(store, { recover: async () => ({
      status: "failed", reason: "generation_failed", message: "no", timings: [],
    }) });
    const resolved = await resolveEntitledReportWith(deps, SCAN);
    // Entitled, but nothing complete on file for THIS creator, and recovery
    // (stubbed) produced nothing — the other creator's row is invisible.
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.status).toBe(503);
  });

  it("the preparation routes expose readiness only", () => {
    const prepareRoute = readFileSync("src/app/api/scan/prepare/route.ts", "utf8");
    // The route never imports the resolver or reads a payload.
    expect(prepareRoute).not.toContain("resolveEntitledReport");
    expect(prepareRoute).not.toMatch(/payload/);
    expect(prepareRoute).toContain("...result.readiness");
  });
});

describe("existing entitled reports remain accessible after migration", () => {
  it("a report persisted under the earlier contract still serves, unchanged, with no regeneration", async () => {
    const store = new InMemoryReportStore();
    store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_legacy",
      payload: legacyPaidSections(),
      generatorVersion: "chrp-report-v1",
      model: "claude-3-5-sonnet",
    });
    const { deps, recover } = makeDeps(store);

    const resolved = await resolveEntitledReportWith(deps, SCAN);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.report.rhodes).toBe(legacyPaidSections().rhodes);
    expect(resolved.report.consider).toBeUndefined();
    expect(recover).not.toHaveBeenCalled();
    expect(store.completeReports()).toHaveLength(1);
    expect(store.rows[0].generatorVersion).toBe("chrp-report-v1");
  });

  it("an entitled report whose persisted payload is incomplete is recovered through the same idempotent preparer", async () => {
    const store = new InMemoryReportStore();
    store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: { rhodes: "" }, // a broken earlier write
      generatorVersion: "chrp-rhodes-v2",
    });
    const recover = vi.fn(async () => {
      store.rows[0].payload = paidSections({ rhodes: "recovered" });
      return {
        status: "ready" as const,
        reused: false,
        readiness: {
          scanId: SCAN,
          reportId: store.rows[0].id,
          reportVersion: "chrp-rhodes-v2",
          analysisId: "an_1",
        },
        timings: [],
      };
    });
    const { deps } = makeDeps(store, { recover });
    const resolved = await resolveEntitledReportWith(deps, SCAN);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.report.rhodes).toBe("recovered");
  });

  it("the voice route can never trigger recovery", async () => {
    const store = new InMemoryReportStore();
    const { deps, recover } = makeDeps(store);
    const resolved = await resolveEntitledReportWith(deps, SCAN, { recover: false });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.status).toBe(503);
      expect(resolved.entitled).toBe(true);
    }
    expect(recover).not.toHaveBeenCalled();
  });
});
