import { describe, expect, it } from "vitest";
import {
  checkReportReadiness,
  prepareReport,
  readReadiness,
  DEFAULT_STALE_AFTER_MS,
  type PrepareDeps,
  type PrepareResult,
} from "@/lib/reports/prepare";
import { isCompletePaidPayload } from "@/lib/reports/store";
import type { ReportTiming } from "@/lib/reports/timing";
import {
  InMemoryReportStore,
  ManualHeartbeat,
  legacyPaidSections,
  paidSections,
} from "./support/report-store";

/**
 * Paid fulfillment, before checkout — with a FENCED, self-renewing lease.
 *
 * The rules under test:
 *   - a durable atomic claim is acquired BEFORE any upstream work;
 *   - exactly one generator across separate instances;
 *   - a long generation renews the lease on DB time (heartbeat);
 *   - a stalled worker's lease is taken over, and the stalled worker can then
 *     neither persist, complete, nor delete the successor's lease;
 *   - report persistence and lease release are atomic.
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function makeDeps(
  store: InMemoryReportStore,
  overrides: Partial<PrepareDeps> & {
    counters?: Counters;
    generateDelayMs?: number;
    trace?: string[];
    generateGate?: Deferred<void>;
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
      if (overrides.generateGate) await overrides.generateGate.promise;
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

/** Let queued microtasks/timers drain. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("the claim is acquired before any upstream work", () => {
  it("beginClaim precedes analysis, enrichment and generation in call order", async () => {
    const store = new InMemoryReportStore();
    const trace: string[] = [];
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
    expect(claimIdx).toBeGreaterThanOrEqual(0);
    expect(claimIdx).toBeLessThan(trace.indexOf("upstream:analysis"));
    expect(claimIdx).toBeLessThan(trace.indexOf("upstream:enrich"));
    expect(claimIdx).toBeLessThan(trace.indexOf("upstream:generate"));
    expect(trace.indexOf("store:completeClaim")).toBeGreaterThan(
      trace.indexOf("upstream:generate"),
    );
  });

  it("a request that loses the claim does ZERO upstream work", async () => {
    const store = new InMemoryReportStore();
    store.seedClaim({
      creatorId: USER,
      scanId: SCAN,
      worker: "worker_other",
      reportVersion: VERSION,
      claimedAt: new Date(),
    });
    const { deps, counters } = makeDeps(store);
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
    const rows = store.completeReports();
    expect(rows).toHaveLength(1);
    expect(rows[0].analysisId).toBe("an_1");
    expect(isCompletePaidPayload(rows[0].payload)).toBe(true);
    expect(store.claims).toHaveLength(0);
  });

  it("returns readiness metadata only — never a word of the report", async () => {
    const store = new InMemoryReportStore();
    const { deps } = makeDeps(store);
    const result = (await prepareReport(deps, USER, SCAN)) as Extract<
      PrepareResult,
      { status: "ready" }
    >;
    const serialised = JSON.stringify(result);
    for (const paidField of ["signature", "rhodes", "placements", "throughline", "pitch"]) {
      expect(serialised).not.toContain(`"${paidField}"`);
    }
    expect(serialised).not.toContain("Safe holds its posture");
  });

  it("a Soundcharts miss makes the paid tier unavailable and releases the lease", async () => {
    const store = new InMemoryReportStore();
    const { deps, counters } = makeDeps(store, {
      ensureAnalysis: async () => ({ ok: false, reason: "song_unavailable" }),
    });
    const result = await prepareReport(deps, USER, SCAN);
    expect(result).toMatchObject({ status: "failed", reason: "song_unavailable" });
    expect(counters.generate).toBe(0);
    expect(store.reports).toHaveLength(0);
    expect(store.claims).toHaveLength(0);
  });
});

describe("enrichment failure prevents checkout rather than failing after payment", () => {
  it("fails closed, releases the lease, persists nothing, Rhodes never called", async () => {
    const store = new InMemoryReportStore();
    const { deps, counters } = makeDeps(store, {
      enrich: async () => {
        throw new Error("soundcharts enrichment layer unavailable");
      },
    });
    const result = await prepareReport(deps, USER, SCAN);
    expect(result).toMatchObject({ status: "failed", reason: "enrichment_failed" });
    expect(counters.generate).toBe(0);
    expect(store.reports).toHaveLength(0);
    expect(store.claims).toHaveLength(0);

    const check = await checkReportReadiness(
      { store, findAnalysis: async () => ({ id: "an_1", status: "complete", engineVersion: ENGINE }), generatorVersion: VERSION, engineVersion: ENGINE },
      USER,
      SCAN,
    );
    expect(check).toEqual({ ok: false, reason: "not_ready" });
  });

  it("a governor rejection closes checkout and leaves nothing on file", async () => {
    const store = new InMemoryReportStore();
    const { deps } = makeDeps(store, {
      generate: async () => ({ ok: false, reason: "governor_rejected", detail: "x" }),
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
    expect(shared.generate).toBe(1);
    expect(store.claimAcquisitions).toBe(1);
    expect(store.completeReports()).toHaveLength(1);
    const readies = results.filter((r) => r.status === "ready");
    const preparings = results.filter((r) => r.status === "preparing");
    expect(readies.length + preparings.length).toBe(4);

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
  });
});

describe("fenced lease under stalls and long generations", () => {
  it("a live lease from another worker is honoured: no second generation", async () => {
    const store = new InMemoryReportStore();
    const now = new Date();
    store.dbNow = () => now;
    store.seedClaim({ creatorId: USER, scanId: SCAN, worker: "worker_live", reportVersion: VERSION, claimedAt: now });
    const { deps, counters } = makeDeps(store);
    const result = await prepareReport(deps, USER, SCAN);
    expect(result.status).toBe("preparing");
    expect(counters.generate).toBe(0);
    const state = await readReadiness(store, VERSION, USER, SCAN, now);
    expect(state.status).toBe("preparing");
  });

  it("generation exceeding the original lease keeps the lease via heartbeat renewal", async () => {
    const store = new InMemoryReportStore();
    let t = 1_000_000;
    store.dbNow = () => new Date(t);
    const hb = new ManualHeartbeat();
    const gate = deferred<void>();
    const { deps } = makeDeps(store, {
      startHeartbeat: hb.start,
      generateGate: gate,
      worker: () => "worker_A",
    });

    const run = prepareReport(deps, USER, SCAN); // acquires, then blocks in generate
    await flush();
    const leaseAt0 = store.claims[0].claimedAt.getTime();

    // Time advances PAST the stale window while generation is still running.
    t += DEFAULT_STALE_AFTER_MS + 5_000;
    // The heartbeat fires and renews on DB time.
    await hb.beat();
    expect(hb.ticks).toBe(1);
    const leaseAt1 = store.claims[0].claimedAt.getTime();
    expect(leaseAt1).toBeGreaterThan(leaseAt0);
    expect(leaseAt1).toBe(t);

    // A second instance now tries to take over — but the lease is fresh again,
    // so it is HELD, not stolen.
    const other = makeDeps(store, { worker: () => "worker_B" });
    const otherResult = await prepareReport(other.deps, USER, SCAN);
    expect(otherResult.status).toBe("preparing");
    expect(other.counters.generate).toBe(0);

    // Finish generation; the original worker completes normally.
    gate.resolve();
    const result = await run;
    expect(result.status).toBe("ready");
    expect(store.completeReports()).toHaveLength(1);
    expect(hb.stopped).toBe(true); // heartbeat stopped on completion
  });

  it("takeover during a stalled worker; the old worker cannot then persist or complete", async () => {
    const store = new InMemoryReportStore();
    let t = 2_000_000;
    store.dbNow = () => new Date(t);
    const hbA = new ManualHeartbeat();
    const gateA = deferred<void>();
    const A = makeDeps(store, { startHeartbeat: hbA.start, generateGate: gateA, worker: () => "worker_A" });

    const runA = prepareReport(A.deps, USER, SCAN); // acquires; then stalls in generate
    await flush();
    const leaseA = { ...store.claims[0] };

    // A stalls (its heartbeat never fires). Time passes beyond the stale window.
    t += DEFAULT_STALE_AFTER_MS + 10_000;

    // B takes over — new token, higher fence.
    const B = makeDeps(store, { worker: () => "worker_B" });
    const runB = prepareReport(B.deps, USER, SCAN);
    // Let B run to completion (it generates and persists).
    const resultB = await runB;
    expect(resultB.status).toBe("ready");
    expect(store.completeReports()).toHaveLength(1);
    const takenOver = store.claims.find((c) => c.creatorId === USER && c.scanId === SCAN);
    // B completed, so its lease is gone; the report exists.
    expect(takenOver).toBeUndefined();
    expect(store.reports[0].payload).toBeTruthy();

    // Now A finishes. Its heartbeat would have reported lost, but even if not,
    // completion is fenced: A's token no longer matches, so it writes nothing.
    // (A's heartbeat fires once to observe the loss.)
    await hbA.beat();
    gateA.resolve();
    const resultA = await runA;
    expect(resultA).toMatchObject({ status: "failed", reason: "lease_lost" });
    // Exactly one generation was persisted (B's), never overwritten by A.
    expect(store.completeReports()).toHaveLength(1);
    expect(store.reports).toHaveLength(1);
  });

  it("the old worker's release after takeover cannot delete the successor's lease", async () => {
    const store = new InMemoryReportStore();
    const now = new Date(3_000_000);
    store.dbNow = () => now;
    // Worker A holds a lease.
    const a = store.seedClaim({ creatorId: USER, scanId: SCAN, worker: "worker_A", reportVersion: VERSION, claimedAt: now });
    const leaseA = { worker: a.worker, token: a.token, fence: a.fence };
    // Time passes; B takes over via beginClaim.
    store.dbNow = () => new Date(now.getTime() + DEFAULT_STALE_AFTER_MS + 1);
    const B = makeDeps(store, { worker: () => "worker_B", generateGate: deferred<void>() });
    // Only run beginClaim by calling the store directly to isolate the lease state.
    const outcome = await store.beginClaim({ userId: USER, scanId: SCAN, worker: "worker_B", generatorVersion: VERSION, staleAfterMs: DEFAULT_STALE_AFTER_MS });
    expect(outcome.outcome).toBe("acquired");
    const successor = store.claims[0];
    expect(successor.worker).toBe("worker_B");
    // `leaseA` was captured before the takeover; `a` is a live row that the
    // takeover mutated in place, so compare against the captured snapshot.
    expect(successor.fence).toBe(leaseA.fence + 1);
    expect(successor.token).not.toBe(leaseA.token);

    // A now tries to release its old lease — fenced, so it deletes nothing.
    await store.releaseClaim(USER, SCAN, leaseA);
    expect(store.claims).toHaveLength(1);
    expect(store.claims[0].worker).toBe("worker_B");
    expect(store.claims[0].token).toBe(successor.token);
    void B;
  });

  it("persistence + release are atomic: a failed lease-delete rolls the report write back", async () => {
    const store = new InMemoryReportStore();
    store.failCompleteDelete = true;
    const { deps } = makeDeps(store);
    const result = await prepareReport(deps, USER, SCAN);
    // The atomic completion threw; nothing is persisted and the caller fails
    // closed — no persisted report ever coexists with a dangling lease.
    expect(result).toMatchObject({ status: "failed", reason: "persist_failed" });
    expect(store.completeReports()).toHaveLength(0);
    expect(store.reports).toHaveLength(0);
  });
});

describe("checkout binds to the exact identity, scan, report and version", () => {
  const analysisOk = async () => ({ id: "an_1", status: "complete", engineVersion: ENGINE });

  async function readyStore() {
    const store = new InMemoryReportStore();
    const { deps } = makeDeps(store);
    const result = (await prepareReport(deps, USER, SCAN)) as Extract<PrepareResult, { status: "ready" }>;
    return { store, readiness: result.readiness };
  }

  it("accepts the report that was prepared", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER, SCAN, { reportId: readiness.reportId, reportVersion: readiness.reportVersion },
    );
    expect(check.ok).toBe(true);
  });

  it("rejects a mismatched report id", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER, SCAN, { reportId: "rep_someone_elses", reportVersion: readiness.reportVersion },
    );
    expect(check).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a stale report version", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER, SCAN, { reportId: readiness.reportId, reportVersion: "chrp-report-v1" },
    );
    expect(check).toEqual({ ok: false, reason: "stale_version" });
  });

  it("rejects a report persisted under an earlier contract even when the claim names it", async () => {
    const store = new InMemoryReportStore();
    const row = store.seedReport({ creatorId: USER, scanId: SCAN, analysisId: "an_1", payload: legacyPaidSections(), generatorVersion: "chrp-report-v1" });
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER, SCAN, { reportId: row.id, reportVersion: "chrp-report-v1" },
    );
    expect(check).toEqual({ ok: false, reason: "stale_version" });
  });

  it("rejects a report whose analysis has been superseded", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: async () => ({ id: "an_2", status: "complete", engineVersion: ENGINE }), generatorVersion: VERSION, engineVersion: ENGINE },
      USER, SCAN, { reportId: readiness.reportId, reportVersion: readiness.reportVersion },
    );
    expect(check).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an engine version the analysis was not scored under", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: async () => ({ id: "an_1", status: "complete", engineVersion: "chrp-epi-v1" }), generatorVersion: VERSION, engineVersion: ENGINE },
      USER, SCAN, { reportId: readiness.reportId, reportVersion: readiness.reportVersion },
    );
    expect(check).toEqual({ ok: false, reason: "stale_version" });
  });

  it("rejects another identity's report for the same scan", async () => {
    const { store, readiness } = await readyStore();
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      "user_b", SCAN, { reportId: readiness.reportId, reportVersion: readiness.reportVersion },
    );
    expect(check).toEqual({ ok: false, reason: "not_ready" });
  });

  it("rejects a preparation still in flight (a lease, no complete report)", async () => {
    const store = new InMemoryReportStore();
    store.seedClaim({ creatorId: USER, scanId: SCAN, worker: "w", reportVersion: VERSION, claimedAt: new Date() });
    const check = await checkReportReadiness(
      { store, findAnalysis: analysisOk, generatorVersion: VERSION, engineVersion: ENGINE },
      USER, SCAN, { reportId: "rep_x", reportVersion: VERSION },
    );
    expect(check).toEqual({ ok: false, reason: "not_ready" });
  });
});

describe("migration 0003 fences the lease and locks the table to the service role", () => {
  it("mints a fresh token + higher fence on takeover, and gates every mutation on the token", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("db/migrations/0003_report_claims.sql", "utf8");
    // Fencing columns.
    expect(sql).toMatch(/lease_token\s+uuid\s+not null\s+default gen_random_uuid\(\)/);
    expect(sql).toMatch(/fence\s+bigint\s+not null\s+default 1/);
    // Takeover re-mints token and bumps fence.
    expect(sql).toMatch(/lease_token = gen_random_uuid\(\)/);
    expect(sql).toMatch(/fence = rc\.fence \+ 1/);
    // Renew uses DB time.
    expect(sql).toMatch(/set claimed_at = now\(\)/);
    // Every mutating function gates on worker AND lease_token.
    for (const fn of ["renew_report_lease", "complete_report", "release_report_lease"]) {
      const body = sql.slice(sql.indexOf(`function ${fn}`));
      expect(body).toMatch(/worker = p_worker/);
      expect(body).toMatch(/lease_token = p_token/);
    }
    // Completion is one function: upsert reports THEN delete the lease.
    const complete = sql.slice(sql.indexOf("function complete_report"), sql.indexOf("function release_report_lease"));
    expect(complete).toMatch(/insert into reports/);
    expect(complete).toMatch(/delete from report_claims/);
  });

  it("enables RLS with no policies and revokes client access", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const sql = readFileSync("db/migrations/0003_report_claims.sql", "utf8");
    expect(sql).toMatch(/alter table report_claims enable row level security/);
    // No policy is ever created for report_claims (deny-by-default under RLS).
    expect(sql).not.toMatch(/create policy[\s\S]*report_claims/);
    expect(sql).toMatch(/revoke all on table report_claims from anon, authenticated/);
    // Functions are not callable by the browser roles.
    for (const fn of ["claim_report_lease", "renew_report_lease", "complete_report", "release_report_lease"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function ${fn}[\\s\\S]*from public, anon, authenticated`));
    }
  });
});
