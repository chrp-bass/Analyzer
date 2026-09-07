import {
  isCompletePaidPayload,
  type BeginClaimInput,
  type BeginClaimOutcome,
  type ClaimRow,
  type CompleteClaimInput,
  type CompleteClaimOutcome,
  type Lease,
  type RenewOutcome,
  type ReportStore,
  type StoredReport,
} from "@/lib/reports/store";
import type { PaidSections } from "@/lib/fixtures/tracks";

/**
 * An in-memory `ReportStore` that mirrors the fenced-lease guarantees the
 * Postgres functions in migration 0003 give:
 *
 *   * `report_claims` has a (creator_id, scan_id) primary key, so the first
 *     `beginClaim` wins and concurrent ones lose — modelled by each method
 *     running to completion without interleaving (no internal await), exactly
 *     the atomicity a single SQL statement / plpgsql function gives;
 *   * every acquisition and takeover mints a fresh immutable token and bumps a
 *     monotonic fence;
 *   * staleness and renewal use a DATABASE clock (`dbNow`), not the caller's;
 *   * renew, complete and release succeed only for the current owner
 *     (worker + token);
 *   * `completeClaim` writes the report AND deletes the lease atomically — if
 *     the delete step fails the report write is rolled back, so a caller can
 *     never observe a persisted report with a dangling lease.
 *
 * Because the methods contain no internal awaits, two calls from two
 * "instances" (separate in-flight tables, one shared store) cannot interleave
 * — the same outcome the database produces — so the distributed-concurrency
 * tests are evidence about real behaviour.
 */
interface ReportRow {
  id: string;
  creatorId: string;
  scanId: string;
  analysisId: string;
  payload: unknown;
  generatorVersion: string;
  model: string | null;
  createdAt: string;
}

interface ClaimRecord {
  creatorId: string;
  scanId: string;
  worker: string;
  token: string;
  fence: number;
  reportVersion: string;
  claimedAt: Date;
}

let seq = 0;
let tokenSeq = 0;

export class InMemoryReportStore implements ReportStore {
  reports: ReportRow[] = [];
  claims: ClaimRecord[] = [];
  /** Report-row inserts, so tests can assert exactly one row was created. */
  insertCount = 0;
  /** Lease acquisitions (fresh + takeover), so tests assert one generator. */
  claimAcquisitions = 0;
  /** Method call trace, in order. */
  calls: string[] = [];

  /** The database clock. Tests advance this to simulate time passing. */
  dbNow: () => Date = () => new Date();
  /** When set, `completeClaim`'s lease-delete step throws — to test atomicity. */
  failCompleteDelete = false;

  seedReport(input: {
    creatorId: string;
    scanId: string;
    analysisId: string;
    payload: unknown;
    generatorVersion: string;
    model?: string | null;
    id?: string;
  }): ReportRow {
    const row: ReportRow = {
      id: input.id ?? `rep_${++seq}`,
      creatorId: input.creatorId,
      scanId: input.scanId,
      analysisId: input.analysisId,
      payload: input.payload,
      generatorVersion: input.generatorVersion,
      model: input.model ?? null,
      createdAt: this.dbNow().toISOString(),
    };
    this.reports.push(row);
    return row;
  }

  seedClaim(input: {
    creatorId: string;
    scanId: string;
    worker: string;
    reportVersion: string;
    claimedAt: Date;
    token?: string;
    fence?: number;
  }): ClaimRecord {
    const rec: ClaimRecord = {
      creatorId: input.creatorId,
      scanId: input.scanId,
      worker: input.worker,
      token: input.token ?? `tok_${++tokenSeq}`,
      fence: input.fence ?? 1,
      reportVersion: input.reportVersion,
      claimedAt: input.claimedAt,
    };
    this.claims.push(rec);
    return rec;
  }

  private findReport(userId: string, scanId: string): ReportRow | undefined {
    return this.reports.find((r) => r.creatorId === userId && r.scanId === scanId);
  }

  private findClaim(userId: string, scanId: string): ClaimRecord | undefined {
    return this.claims.find((c) => c.creatorId === userId && c.scanId === scanId);
  }

  private ownsClaim(userId: string, scanId: string, lease: Lease): ClaimRecord | undefined {
    const c = this.findClaim(userId, scanId);
    return c && c.worker === lease.worker && c.token === lease.token ? c : undefined;
  }

  private toReport(row: ReportRow): StoredReport {
    return {
      id: row.id,
      analysisId: row.analysisId,
      payload: row.payload,
      generatorVersion: row.generatorVersion,
      model: row.model,
      createdAt: row.createdAt,
    };
  }

  async getReport(userId: string, scanId: string): Promise<StoredReport | null> {
    this.calls.push(`getReport:${userId}:${scanId}`);
    const row = this.findReport(userId, scanId);
    return row ? this.toReport(row) : null;
  }

  async getClaim(userId: string, scanId: string): Promise<ClaimRow | null> {
    this.calls.push(`getClaim:${userId}:${scanId}`);
    const c = this.findClaim(userId, scanId);
    return c
      ? {
          worker: c.worker,
          token: c.token,
          fence: c.fence,
          reportVersion: c.reportVersion,
          claimedAt: c.claimedAt,
        }
      : null;
  }

  async beginClaim(input: BeginClaimInput): Promise<BeginClaimOutcome> {
    this.calls.push(`beginClaim:${input.worker}`);
    // A complete, current-version report already exists → nobody generates.
    const report = this.findReport(input.userId, input.scanId);
    if (
      report &&
      isCompletePaidPayload(report.payload) &&
      report.generatorVersion === input.generatorVersion
    ) {
      return { outcome: "ready", report: this.toReport(report) };
    }

    const existing = this.findClaim(input.userId, input.scanId);
    if (!existing) {
      const rec = this.seedClaim({
        creatorId: input.userId,
        scanId: input.scanId,
        worker: input.worker,
        reportVersion: input.generatorVersion,
        claimedAt: this.dbNow(),
      });
      this.claimAcquisitions += 1;
      return { outcome: "acquired", lease: { worker: rec.worker, token: rec.token, fence: rec.fence } };
    }

    const ageMs = this.dbNow().getTime() - existing.claimedAt.getTime();
    if (ageMs < input.staleAfterMs) {
      return { outcome: "held", startedAt: existing.claimedAt };
    }
    // Stale lease: take it over with a NEW token and a higher fence.
    existing.worker = input.worker;
    existing.token = `tok_${++tokenSeq}`;
    existing.fence += 1;
    existing.reportVersion = input.generatorVersion;
    existing.claimedAt = this.dbNow();
    this.claimAcquisitions += 1;
    return {
      outcome: "acquired",
      lease: { worker: existing.worker, token: existing.token, fence: existing.fence },
    };
  }

  async renewClaim(userId: string, scanId: string, lease: Lease): Promise<RenewOutcome> {
    this.calls.push(`renewClaim:${lease.worker}:${lease.token}`);
    const owned = this.ownsClaim(userId, scanId, lease);
    if (!owned) return { renewed: false };
    owned.claimedAt = this.dbNow(); // DB time, not the caller's.
    return { renewed: true, fence: owned.fence };
  }

  async completeClaim(input: CompleteClaimInput): Promise<CompleteClaimOutcome> {
    this.calls.push(`completeClaim:${input.lease.worker}:${input.lease.token}`);
    const owned = this.ownsClaim(input.userId, input.scanId, input.lease);
    if (!owned) return { ok: false, reason: "lost" };

    // Stage the report write, then release the lease. Model the plpgsql
    // transaction: if the release step fails, roll the write back so a
    // persisted report never coexists with a dangling lease.
    const existing = this.findReport(input.userId, input.scanId);
    const snapshot = existing ? { ...existing } : null;
    let reportId: string;
    if (existing) {
      existing.analysisId = input.analysisId;
      existing.payload = input.payload;
      existing.generatorVersion = input.generatorVersion;
      existing.model = input.model;
      reportId = existing.id;
    } else {
      const row = this.seedReport({
        creatorId: input.userId,
        scanId: input.scanId,
        analysisId: input.analysisId,
        payload: input.payload,
        generatorVersion: input.generatorVersion,
        model: input.model,
      });
      this.insertCount += 1;
      reportId = row.id;
    }

    try {
      if (this.failCompleteDelete) throw new Error("simulated lease-delete failure");
      this.claims = this.claims.filter((c) => c !== owned);
    } catch (err) {
      // Roll the transaction back.
      if (snapshot && existing) Object.assign(existing, snapshot);
      else {
        this.reports = this.reports.filter((r) => r.id !== reportId);
        this.insertCount -= 1;
      }
      throw err;
    }

    return { ok: true, reportId };
  }

  async releaseClaim(userId: string, scanId: string, lease: Lease): Promise<void> {
    this.calls.push(`releaseClaim:${lease.worker}:${lease.token}`);
    const owned = this.ownsClaim(userId, scanId, lease);
    if (!owned) return; // fenced: cannot delete a successor's lease
    this.claims = this.claims.filter((c) => c !== owned);
  }

  /** Every complete report currently held, for assertions. */
  completeReports(): ReportRow[] {
    return this.reports.filter((r) => isCompletePaidPayload(r.payload));
  }
}

/** A running-heartbeat double whose tick the test drives manually. */
export class ManualHeartbeat {
  ticks = 0;
  stopped = false;
  private tick: (() => void | Promise<void>) | null = null;
  intervalMs = 0;

  /** Matches the `StartHeartbeat` signature. */
  start = (intervalMs: number, tick: () => void | Promise<void>) => {
    this.intervalMs = intervalMs;
    this.tick = tick;
    return {
      stop: () => {
        this.stopped = true;
      },
    };
  };

  /** Fire one heartbeat, as a real interval would. */
  async beat(): Promise<void> {
    if (this.stopped || !this.tick) return;
    this.ticks += 1;
    await this.tick();
  }
}

/** A complete paid payload under the current contract. */
export function paidSections(overrides: Partial<PaidSections> = {}): PaidSections {
  return {
    signature: "A settled architecture that never asks for attention.",
    rhodes: "Safe holds its posture with quiet confidence.",
    placements: [{ title: "Reflective long-form", body: "Where stillness is the point." }],
    buyers: [{ category: "Documentary supervisors", lead: "restraint", why: "it holds" }],
    audience: "People who want to slow down.",
    throughline: "A settled song for stories that ask their audience to slow down.",
    pitch: { sync: "Restraint that holds.", promotion: "The quiet room." },
    consider: "Where the song's stillness is an asset.",
    where_this_music_lives: {
      verticals: [],
      confidence: null,
      n_briefs: null,
      sample_brief: null,
    },
    ...overrides,
  };
}

/**
 * A payload persisted under the FIRST report contract — before buyers,
 * audience, pitch and consider existed. Still a complete report: every field
 * the page renders unconditionally is present.
 */
export function legacyPaidSections(): PaidSections {
  return {
    signature: "A steady, low-key architecture.",
    rhodes: "The reading from before the v2 contract.",
    placements: [{ title: "Background beds", body: "Underneath dialogue." }],
    throughline: "Steady, unshowy, dependable.",
    where_this_music_lives: {
      verticals: [],
      confidence: null,
      n_briefs: null,
      sample_brief: null,
    },
  };
}
