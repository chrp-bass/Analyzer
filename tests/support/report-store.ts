import {
  isCompletePaidPayload,
  type BeginClaimInput,
  type BeginClaimOutcome,
  type ClaimRow,
  type CompleteClaimInput,
  type ReportStore,
  type StoredReport,
} from "@/lib/reports/store";
import type { PaidSections } from "@/lib/fixtures/tracks";

/**
 * An in-memory `ReportStore` that mirrors the guarantees Postgres gives the
 * `reports` (0002) and `report_claims` (0003) tables:
 *
 *   * rows are scoped to a creator, so one creator never sees another's;
 *   * `report_claims` has a (creator_id, scan_id) primary key, so the first
 *     `beginClaim` INSERT wins and every concurrent one loses — modelled here
 *     by each method running to completion without interleaving (no await
 *     between the existence check and the write), exactly the atomicity a
 *     single SQL statement gives;
 *   * a stale lease is taken over by a compare-and-swap on `claimed_at`.
 *
 * Because the methods contain no internal awaits, two `beginClaim` calls from
 * two "instances" (separate in-flight tables, one shared store) cannot
 * interleave — the first to run acquires, the second sees the lease. That is
 * the same outcome the database's unique INSERT produces, so the
 * distributed-concurrency tests are evidence about real behaviour.
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
  reportVersion: string;
  claimedAt: Date;
}

let seq = 0;

export class InMemoryReportStore implements ReportStore {
  reports: ReportRow[] = [];
  claims: ClaimRecord[] = [];
  /** Counts report-row inserts, so tests can assert exactly one was created. */
  insertCount = 0;
  /** Counts lease acquisitions, so tests can assert exactly one generator. */
  claimAcquisitions = 0;
  /** Every method call, in order — the audit trail a test reads back. */
  calls: string[] = [];

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
      createdAt: new Date().toISOString(),
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
  }): void {
    this.claims.push({ ...input });
  }

  private findReport(userId: string, scanId: string): ReportRow | undefined {
    return this.reports.find((r) => r.creatorId === userId && r.scanId === scanId);
  }

  private findClaim(userId: string, scanId: string): ClaimRecord | undefined {
    return this.claims.find((c) => c.creatorId === userId && c.scanId === scanId);
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
      ? { worker: c.worker, reportVersion: c.reportVersion, claimedAt: c.claimedAt }
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
      this.claims.push({
        creatorId: input.userId,
        scanId: input.scanId,
        worker: input.worker,
        reportVersion: input.generatorVersion,
        claimedAt: input.startedAt,
      });
      this.claimAcquisitions += 1;
      return { outcome: "acquired" };
    }

    const age = input.startedAt.getTime() - existing.claimedAt.getTime();
    if (age < input.staleAfterMs) {
      return { outcome: "held", startedAt: existing.claimedAt };
    }
    // Stale lease: take it over (CAS is trivially atomic here — no await
    // between read and write).
    existing.worker = input.worker;
    existing.reportVersion = input.generatorVersion;
    existing.claimedAt = input.startedAt;
    this.claimAcquisitions += 1;
    return { outcome: "acquired" };
  }

  async completeClaim(input: CompleteClaimInput): Promise<{ reportId: string }> {
    this.calls.push(`completeClaim:${input.worker}`);
    const existing = this.findReport(input.userId, input.scanId);
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
    // Release our lease.
    this.claims = this.claims.filter(
      (c) =>
        !(c.creatorId === input.userId && c.scanId === input.scanId && c.worker === input.worker),
    );
    return { reportId };
  }

  async releaseClaim(userId: string, scanId: string, worker: string): Promise<void> {
    this.calls.push(`releaseClaim:${worker}`);
    this.claims = this.claims.filter(
      (c) => !(c.creatorId === userId && c.scanId === scanId && c.worker === worker),
    );
  }

  /** Every complete report currently held, for assertions. */
  completeReports(): ReportRow[] {
    return this.reports.filter((r) => isCompletePaidPayload(r.payload));
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
