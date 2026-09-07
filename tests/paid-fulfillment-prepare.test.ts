import { describe, expect, it } from "vitest";
import {
  checkReportReadiness,
  prepareReport,
  readReadiness,
  type PrepareDeps,
  type PrepareResult,
} from "@/lib/reports/prepare";
import { isCompletePaidPayload, readPreparationMarker } from "@/lib/reports/store";
import type { ReportTiming } from "@/lib/reports/timing";
import {
  InMemoryReportStore,
  legacyPaidSections,
  paidSections,
} from "./support/report-store";

/**
 * Paid fulfillment, before checkout.
 *
 * The rule under test: NEVER charge until the complete paid report is
 * already generated and persisted. These run the production preparation
 * core over an in-memory store with counted fakes for the engine, the
 * enrichment layer and Rhodes, so every assertion about "how many times was
 * Rhodes called" is about real control flow.
 */

const VERSION = "chrp-rhodes-v2";
const ENGINE = "chrp-epi-v2";
const USER = "user_a";
const SCAN = "scn_isrc-ustest0000001_abc123";

interface Counters {
  analysis: number;
  enrich: number;
  context: number;
  generate: number;
}

function makeDeps(
  store: InMemoryReportStore,
  overrides: Partial<PrepareDeps> & { counters?: Counters; generateDelayMs?: number } = {},
): { deps: PrepareDeps; counters: Counters; timings: ReportTiming[] } {
  const counters: Counters = overrides.counters ?? {
    analysis: 0,
    enrich: 0,
    context: 0,
    generate: 0,
  };
  const timings: ReportTiming[] = [];
  const deps: PrepareDeps = {
    store,
    ensureAnalysis: async () => {
      counters.analysis += 1;
      return { ok: true, analysisId: "an_1", songId: "song_1" };
    },
    enrich: async () => {
      counters.enrich += 1;
      return {
        facts: {
          title: "Safe",
          artist: "The Brevet",
          mode: "Flow",
          epiScore: 62,
          dimensions: { focus: 71, calm: 68, motivation: 55, balance: 62 },
        },
        song: { genres: [{ root: "Rock" }] },
      };
    },
    christianContext: () => {
      counters.context += 1;
      return null;
    },
    generate: async () => {
      counters.generate += 1;
      if (overrides.generateDelayMs) {
        await new Promise((r) => setTimeout(r, overrides.generateDelayMs));
      }
      return { ok: true, sections: paidSections() };
    },
    generatorVersion: VERSION,
    model: "claude-sonnet-4-5",
    sink: (t) => timings.push(t),
    inFlight: new Map(),
    ...overrides,
  };
  return { deps, counters, timings };
}

describe("preparation runs the whole chain and persists before anyone can pay", () => {
  it("analysis → enrichments → Christian context → Rhodes → persistence, in order, timed", async () => {
    const store = new InMemoryReportStore();
    const { deps, counters, timings } = makeDeps(store);

    const result = await prepareReport(deps, USER, SCAN);

    expect(result.status).toBe("ready");
    expect(counters).toEqual({ analysis: 1, enrich: 1, context: 1, generate: 1 });
    expect(timings.map((t) => t.stage)).toEqual([
      "analysis",
      "enrichments",
      "christian_context",
      "rhodes_generation",
      "report_persistence",
    ]);
    expect(timings.every((t) => t.outcome === "ok")).toBe(true);

    const rows = store.completeReports();
    expect(rows).toHaveLength(1);
    expect(rows[0].generatorVersion).toBe(VERSION);
    expect(rows[0].analysisId).toBe("an_1");
    expect(isCompletePaidPayload(rows[0].payload)).toBe(true);
  });

  it("returns readiness metadata only — never a word of the report", async () => {
    const store = new InMemoryReportStore();
    const { deps } = makeDeps(store);
    const result = (await prepareReport(deps, USER, SCAN)) as Extract<
      PrepareResult,
      { status: "ready" }
    >;
    expect(Object.keys(result.readiness).sort()).toEqual(
      ["analysisId", "reportId", "reportVersion", "scanId"].sort(),
    );
    const serialised = JSON.stringify(result);
    for (const paidField of ["signature", "rhodes", "placements", "throughline", "pitch"]) {
      expect(serialised).not.toContain(`"${paidField}"`);
    }
    expect(serialised).not.toContain("Safe holds its posture");
  });

  it("a Soundcharts miss makes the paid tier unavailable — no report, no checkout", async () => {
    const store = new InMemoryReportStore();
    const { deps, counters } = makeDeps(store, {
      ensureAnalysis: async () => ({ ok: false, reason: "song_unavailable" }),
    });
    const result = await prepareReport(deps, USER, SCAN);
    expect(result).toMatchObject({ status: "failed", reason: "song_unavailable" });
    expect(counters.enrich).toBe(0);
    expect(counters.generate).toBe(0);
    expect(store.rows).toHaveLength(0);
  });
});

describe("enrichment failure prevents checkout rather than failing after payment", () => {
  it("fails closed, releases the lock, persists nothing, and Rhodes is never called", async () => {
    const store = new InMemoryReportStore();
    const { deps, counters, timings } = makeDeps(store, {
      enrich: async () => {
        throw new Error("soundcharts enrichment layer unavailable");
      },
    });

    const result = await prepareReport(deps, USER, SCAN);

    expect(result).toMatchObject({ status: "failed", reason: "enrichment_failed" });
    expect(counters.generate).toBe(0);
    // The marker row is gone — nothing is left on file that could be
    // mistaken for a report, and the next attempt starts clean.
    expect(store.rows).toHaveLength(0);
    expect(timings.find((t) => t.stage === "enrichments")?.outcome).toBe("error");

    // And checkout refuses: there is no report to charge for.
    const check = await checkReportReadiness(
      {
        store,
        findAnalysis: async () => ({ id: "an_1", status: "complete", engineVersion: ENGINE }),
        generatorVersion: VERSION,
        engineVersion: ENGINE,
      },
      USER,
      SCAN,
    );
    expect(check).toEqual({ ok: false, reason: "not_ready" });
  });

  it("a Soundcharts miss during enrichment is reported as the song being unavailable", async () => {
    const store = new InMemoryReportStore();
    const { deps } = makeDeps(store, {
      enrich: async () => {
        throw new Error("song_unavailable");
      },
    });
    const result = await prepareReport(deps, USER, SCAN);
    expect(result).toMatchObject({ status: "failed", reason: "song_unavailable" });
  });

  it("a governor rejection also closes checkout and leaves nothing on file", async () => {
    const store = new InMemoryReportStore();
    const { deps } = makeDeps(store, {
      generate: async () => ({
        ok: false,
        reason: "governor_rejected",
        detail: "unsupported claims survived rewrite",
      }),
    });
    const result = await prepareReport(deps, USER, SCAN);
    expect(result).toMatchObject({ status: "failed", reason: "governor_rejected" });
    expect(store.rows).toHaveLength(0);
  });
});

describe("concurrent preparation requests create only one report", () => {
  it("same instance: N simultaneous calls share one generation and one row", async () => {
    const store = new InMemoryReportStore();
    const { deps, counters } = makeDeps(store, { generateDelayMs: 20 });

    const results = await Promise.all([
      prepareReport(deps, USER, SCAN),
      prepareReport(deps, USER, SCAN),
      prepareReport(deps, USER, SCAN),
      prepareReport(deps, USER, SCAN),
    ]);

    expect(results.every((r) => r.status === "ready")).toBe(true);
    expect(counters.generate).toBe(1);
    expect(counters.enrich).toBe(1);
    expect(store.insertCount).toBe(1);
    expect(store.completeReports()).toHaveLength(1);
    const ids = new Set(
      results.map((r) => (r.status === "ready" ? r.readiness.reportId : "?")),
    );
    expect(ids.size).toBe(1);
  });

  it("different instances: the store's row claim lets exactly one generate; the rest are told to poll", async () => {
    const store = new InMemoryReportStore();
    // Two instances = two in-flight tables over one database.
    const a = makeDeps(store, { generateDelayMs: 30, worker: () => "worker_a" });
    const b = makeDeps(store, {
      generateDelayMs: 30,
      worker: () => "worker_b",
      counters: a.counters,
    });

    const [ra, rb] = await Promise.all([
      prepareReport(a.deps, USER, SCAN),
      prepareReport(b.deps, USER, SCAN),
    ]);

    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual(["preparing", "ready"]);
    expect(a.counters.generate).toBe(1);
    expect(store.insertCount).toBe(1);
    expect(store.completeReports()).toHaveLength(1);

    // The instance that was told to poll now finds the finished report and
    // reuses it — still one generation.
    const again = await prepareReport(b.deps, USER, SCAN);
    expect(again).toMatchObject({ status: "ready", reused: true });
    expect(a.counters.generate).toBe(1);
  });

  it("a refresh, a retry and a repeated checkout attempt all reuse the persisted report", async () => {
    const store = new InMemoryReportStore();
    const { deps, counters } = makeDeps(store);

    const first = await prepareReport(deps, USER, SCAN);
    const second = await prepareReport(deps, USER, SCAN);
    const third = await prepareReport(deps, USER, SCAN);

    expect(first.status).toBe("ready");
    expect(second).toMatchObject({ status: "ready", reused: true });
    expect(third).toMatchObject({ status: "ready", reused: true });
    expect(counters.generate).toBe(1);
    expect(counters.enrich).toBe(1);
    expect(store.completeReports()).toHaveLength(1);
  });

  it("a stale marker from a dead worker is taken over, not honoured forever", async () => {
    const store = new InMemoryReportStore();
    const dead = new Date("2026-09-01T00:00:00Z");
    store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: { _chrp_preparing: { worker: "worker_dead", started_at: dead.toISOString() } },
      generatorVersion: `preparing:${VERSION}`,
    });
    const { deps, counters } = makeDeps(store, {
      now: () => new Date(dead.getTime() + 10 * 60 * 1000),
    });
    const result = await prepareReport(deps, USER, SCAN);
    expect(result.status).toBe("ready");
    expect(counters.generate).toBe(1);
    expect(store.completeReports()).toHaveLength(1);
    expect(store.insertCount).toBe(0); // the existing row was reused
  });

  it("a live marker from another worker is honoured: no second generation", async () => {
    const store = new InMemoryReportStore();
    const now = new Date();
    store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: { _chrp_preparing: { worker: "worker_live", started_at: now.toISOString() } },
      generatorVersion: `preparing:${VERSION}`,
    });
    const { deps, counters } = makeDeps(store, { now: () => now });
    const result = await prepareReport(deps, USER, SCAN);
    expect(result.status).toBe("preparing");
    expect(counters.generate).toBe(0);

    const state = await readReadiness(store, VERSION, USER, SCAN, now);
    expect(state.status).toBe("preparing");
  });
});

describe("checkout binds to the exact identity, scan, report and version", () => {
  const analysisOk = async () => ({
    id: "an_1",
    status: "complete",
    engineVersion: ENGINE,
  });

  async function readyStore() {
    const store = new InMemoryReportStore();
    const { deps } = makeDeps(store);
    const result = (await prepareReport(deps, USER, SCAN)) as Extract<
      PrepareResult,
      { status: "ready" }
    >;
    return { store, readiness: result.readiness };
  }

  it("accepts the report that was prepared", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER,
      SCAN,
      { reportId: readiness.reportId, reportVersion: readiness.reportVersion },
    );
    expect(check.ok).toBe(true);
  });

  it("rejects a mismatched report id", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER,
      SCAN,
      { reportId: "rep_someone_elses", reportVersion: readiness.reportVersion },
    );
    expect(check).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a stale report version", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER,
      SCAN,
      { reportId: readiness.reportId, reportVersion: "chrp-report-v1" },
    );
    expect(check).toEqual({ ok: false, reason: "stale_version" });
  });

  it("rejects a report persisted under an earlier contract even when the claim names it", async () => {
    const store = new InMemoryReportStore();
    const row = store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: legacyPaidSections(),
      generatorVersion: "chrp-report-v1",
    });
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER,
      SCAN,
      { reportId: row.id, reportVersion: "chrp-report-v1" },
    );
    expect(check).toEqual({ ok: false, reason: "stale_version" });
  });

  it("rejects a report whose analysis has been superseded", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      {
        store,
        findAnalysis: async () => ({ id: "an_2", status: "complete", engineVersion: ENGINE }),
        generatorVersion: VERSION,
        engineVersion: ENGINE,
      },
      USER,
      SCAN,
      { reportId: readiness.reportId, reportVersion: readiness.reportVersion },
    );
    expect(check).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an engine version the analysis was not scored under", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      {
        store,
        findAnalysis: async () => ({ id: "an_1", status: "complete", engineVersion: "chrp-epi-v1" }),
        generatorVersion: VERSION,
        engineVersion: ENGINE,
      },
      USER,
      SCAN,
      { reportId: readiness.reportId, reportVersion: readiness.reportVersion },
    );
    expect(check).toEqual({ ok: false, reason: "stale_version" });
  });

  it("rejects another identity's report for the same scan", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      "user_b",
      SCAN,
      { reportId: readiness.reportId, reportVersion: readiness.reportVersion },
    );
    expect(check).toEqual({ ok: false, reason: "not_ready" });
  });

  it("rejects a preparation still in flight", async () => {
    const store = new InMemoryReportStore();
    const row = store.seed({
      creatorId: USER,
      scanId: SCAN,
      analysisId: "an_1",
      payload: { _chrp_preparing: { worker: "w", started_at: new Date().toISOString() } },
      generatorVersion: `preparing:${VERSION}`,
    });
    expect(readPreparationMarker(row.payload)).not.toBeNull();
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER,
      SCAN,
      { reportId: row.id, reportVersion: `preparing:${VERSION}` },
    );
    expect(check).toEqual({ ok: false, reason: "not_ready" });
  });
});
