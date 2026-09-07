import { describe, expect, it } from "vitest";
import {
  checkReportReadiness,
  prepareReport,
  readReadiness,
  type PrepareDeps,
  type PrepareResult,
} from "@/lib/reports/prepare";
import { isCompletePaidPayload } from "@/lib/reports/store";
import type { ReportTiming } from "@/lib/reports/timing";
import {
  InMemoryReportStore,
  legacyPaidSections,
  paidSections,
} from "./support/report-store";

/**
 * Paid fulfillment, before checkout.
 *
 * The rule under test: NEVER charge until the complete paid report is already
 * generated and persisted, and acquire a DURABLE atomic claim BEFORE any
 * upstream work runs. These run the production preparation core over an
 * in-memory store with counted fakes for the engine, the enrichment layer and
 * Rhodes, and a spy that records the exact order of store calls vs. upstream
 * calls — so "the claim precedes Soundcharts" is a claim about real control
 * flow, not a mock.
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
  overrides: Partial<PrepareDeps> & {
    counters?: Counters;
    generateDelayMs?: number;
    trace?: string[];
  } = {},
): { deps: PrepareDeps; counters: Counters; timings: ReportTiming[]; trace: string[] } {
  const counters: Counters = overrides.counters ?? {
    analysis: 0,
    enrich: 0,
    context: 0,
    generate: 0,
  };
  const timings: ReportTiming[] = [];
  const trace = overrides.trace ?? [];
  const deps: PrepareDeps = {
    store,
    ensureAnalysis: async () => {
      trace.push("upstream:analysis");
      counters.analysis += 1;
      return { ok: true, analysisId: "an_1", songId: "song_1" };
    },
    enrich: async () => {
      trace.push("upstream:enrich");
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
      trace.push("upstream:generate");
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
  return { deps, counters, timings, trace };
}

describe("the claim is acquired before any upstream work", () => {
  it("beginClaim precedes analysis, enrichment and generation in the call order", async () => {
    const store = new InMemoryReportStore();
    const trace: string[] = [];
    // Weave store calls into the same trace as upstream calls.
    const wrapped = new Proxy(store, {
      get(target, prop, receiver) {
        const orig = Reflect.get(target, prop, receiver);
        if (typeof orig !== "function") return orig;
        return (...args: unknown[]) => {
          if (prop === "beginClaim") trace.push("store:beginClaim");
          if (prop === "completeClaim") trace.push("store:completeClaim");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (orig as any).apply(target, args);
        };
      },
    });
    const { deps } = makeDeps(store, { store: wrapped, trace });

    const result = await prepareReport(deps, USER, SCAN);
    expect(result.status).toBe("ready");

    const claimIdx = trace.indexOf("store:beginClaim");
    const analysisIdx = trace.indexOf("upstream:analysis");
    const enrichIdx = trace.indexOf("upstream:enrich");
    const genIdx = trace.indexOf("upstream:generate");
    expect(claimIdx).toBeGreaterThanOrEqual(0);
    expect(claimIdx).toBeLessThan(analysisIdx);
    expect(claimIdx).toBeLessThan(enrichIdx);
    expect(claimIdx).toBeLessThan(genIdx);
    // And the report is persisted (completeClaim) only after generation.
    expect(trace.indexOf("store:completeClaim")).toBeGreaterThan(genIdx);
  });

  it("a request that loses the claim does ZERO upstream work", async () => {
    const store = new InMemoryReportStore();
    // A live lease already held by another worker.
    store.seedClaim({
      creatorId: USER,
      scanId: SCAN,
      worker: "worker_other",
      reportVersion: VERSION,
      claimedAt: new Date(),
    });
    const { deps, counters } = makeDeps(store, { now: () => new Date() });

    const result = await prepareReport(deps, USER, SCAN);
    expect(result.status).toBe("preparing");
    expect(counters).toEqual({ analysis: 0, enrich: 0, context: 0, generate: 0 });
  });
});

describe("preparation runs the whole chain and persists before anyone can pay", () => {
  it("analysis → enrichments → Christian context → Rhodes → persistence, timed", async () => {
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
    // The lease was released.
    expect(store.claims).toHaveLength(0);
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
    expect(store.reports).toHaveLength(0);
    // The lease is released so a retry can proceed.
    expect(store.claims).toHaveLength(0);
  });
});

describe("enrichment failure prevents checkout rather than failing after payment", () => {
  it("fails closed, releases the lease, persists nothing, and Rhodes is never called", async () => {
    const store = new InMemoryReportStore();
    const { deps, counters, timings } = makeDeps(store, {
      enrich: async () => {
        throw new Error("soundcharts enrichment layer unavailable");
      },
    });

    const result = await prepareReport(deps, USER, SCAN);

    expect(result).toMatchObject({ status: "failed", reason: "enrichment_failed" });
    expect(counters.generate).toBe(0);
    expect(store.reports).toHaveLength(0);
    expect(store.claims).toHaveLength(0);
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
    expect(store.reports).toHaveLength(0);
    expect(store.claims).toHaveLength(0);
  });
});

describe("distributed concurrency: exactly one generator", () => {
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
    expect(store.claimAcquisitions).toBe(1);
    expect(store.completeReports()).toHaveLength(1);
  });

  it("separate Vercel instances: the DB claim lets exactly one generate; the rest poll", async () => {
    const store = new InMemoryReportStore();
    // Four independent instances = four in-flight tables over one database.
    // No in-process map can mask the DB claim here.
    const shared: Counters = { analysis: 0, enrich: 0, context: 0, generate: 0 };
    const instances = [0, 1, 2, 3].map((i) =>
      makeDeps(store, {
        generateDelayMs: 30,
        worker: () => `worker_${i}`,
        counters: shared,
        inFlight: new Map(),
      }),
    );

    const results = await Promise.all(
      instances.map((inst) => prepareReport(inst.deps, USER, SCAN)),
    );

    const readies = results.filter((r) => r.status === "ready");
    const preparings = results.filter((r) => r.status === "preparing");
    // Exactly one instance generated; the other three were told to poll and
    // performed no upstream work.
    expect(shared.generate).toBe(1);
    expect(shared.analysis).toBe(1);
    expect(shared.enrich).toBe(1);
    expect(store.claimAcquisitions).toBe(1);
    expect(store.completeReports()).toHaveLength(1);
    expect(readies.length).toBeGreaterThanOrEqual(1);
    expect(readies.length + preparings.length).toBe(4);

    // Once done, a polling instance re-asks and gets the finished report,
    // still one generation.
    const again = await prepareReport(instances[1].deps, USER, SCAN);
    expect(again).toMatchObject({ status: "ready", reused: true });
    expect(shared.generate).toBe(1);
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
    expect(store.claimAcquisitions).toBe(1);
    expect(store.completeReports()).toHaveLength(1);
  });

  it("a stale lease from a dead worker is taken over, not honoured forever", async () => {
    const store = new InMemoryReportStore();
    const dead = new Date("2026-09-01T00:00:00Z");
    store.seedClaim({
      creatorId: USER,
      scanId: SCAN,
      worker: "worker_dead",
      reportVersion: VERSION,
      claimedAt: dead,
    });
    const { deps, counters } = makeDeps(store, {
      now: () => new Date(dead.getTime() + 10 * 60 * 1000),
    });
    const result = await prepareReport(deps, USER, SCAN);
    expect(result.status).toBe("ready");
    expect(counters.generate).toBe(1);
    expect(store.completeReports()).toHaveLength(1);
    expect(store.claims).toHaveLength(0);
  });

  it("a live lease from another worker is honoured: no second generation", async () => {
    const store = new InMemoryReportStore();
    const now = new Date();
    store.seedClaim({
      creatorId: USER,
      scanId: SCAN,
      worker: "worker_live",
      reportVersion: VERSION,
      claimedAt: now,
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
    const row = store.seedReport({
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

  it("rejects a preparation still in flight (a lease, no complete report)", async () => {
    const store = new InMemoryReportStore();
    store.seedClaim({
      creatorId: USER,
      scanId: SCAN,
      worker: "w",
      reportVersion: VERSION,
      claimedAt: new Date(),
    });
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER,
      SCAN,
      { reportId: "rep_x", reportVersion: VERSION },
    );
    expect(check).toEqual({ ok: false, reason: "not_ready" });
  });
});
