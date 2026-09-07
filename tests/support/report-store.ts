import {
  classifyExistingRow,
  isCompletePaidPayload,
  preparationMarker,
  readPreparationMarker,
  PREPARING_VERSION_PREFIX,
  type BeginPreparationInput,
  type BeginPreparationOutcome,
  type CompletePreparationInput,
  type ReportStore,
  type StoredReport,
} from "@/lib/reports/store";
import type { PaidSections } from "@/lib/fixtures/tracks";

/**
 * An in-memory `ReportStore` that mirrors the guarantees Postgres gives the
 * `reports` table in 0002_song_memory.sql:
 *
 *   * rows are scoped to a creator, so one creator never sees another's;
 *   * (creator_id, scan_id) is unique, so claiming the row is a race exactly
 *     one worker wins — the second insert is a unique violation;
 *   * a conditional update matches only the row state it was told about.
 *
 * The policy (`classifyExistingRow`) is the production one. Only storage
 * differs, so the preparation tests are evidence about real behaviour.
 */
interface Row {
  id: string;
  creatorId: string;
  scanId: string;
  analysisId: string;
  payload: unknown;
  generatorVersion: string;
  model: string | null;
  createdAt: string;
}

let seq = 0;

export class InMemoryReportStore implements ReportStore {
  rows: Row[] = [];
  /** Counts real inserts, so tests can assert exactly one row was ever created. */
  insertCount = 0;
  /** Every method call, in order — the audit trail a test reads back. */
  calls: string[] = [];

  seed(input: {
    creatorId: string;
    scanId: string;
    analysisId: string;
    payload: unknown;
    generatorVersion: string;
    model?: string | null;
    id?: string;
  }): Row {
    const row: Row = {
      id: input.id ?? `rep_${++seq}`,
      creatorId: input.creatorId,
      scanId: input.scanId,
      analysisId: input.analysisId,
      payload: input.payload,
      generatorVersion: input.generatorVersion,
      model: input.model ?? null,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(row);
    return row;
  }

  private find(userId: string, scanId: string): Row | undefined {
    return this.rows.find((r) => r.creatorId === userId && r.scanId === scanId);
  }

  private toRecord(row: Row): StoredReport {
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
    const row = this.find(userId, scanId);
    return row ? this.toRecord(row) : null;
  }

  async beginPreparation(input: BeginPreparationInput): Promise<BeginPreparationOutcome> {
    this.calls.push(`beginPreparation:${input.worker}`);
    const existing = this.find(input.userId, input.scanId);
    if (!existing) {
      // The insert wins.
      const row = this.seed({
        creatorId: input.userId,
        scanId: input.scanId,
        analysisId: input.analysisId,
        payload: preparationMarker(input.worker, input.startedAt),
        generatorVersion: PREPARING_VERSION_PREFIX + input.generatorVersion,
      });
      this.insertCount += 1;
      return { outcome: "acquired", reportId: row.id };
    }
    const verdict = classifyExistingRow(this.toRecord(existing), input);
    if (verdict.kind === "ready") return { outcome: "ready", report: this.toRecord(existing) };
    if (verdict.kind === "held") return { outcome: "held", startedAt: verdict.startedAt };
    // Takeover. Nothing awaits between the classification above and this
    // write, so — like the conditional UPDATE in production — no second
    // caller can observe the same state and also succeed.
    existing.payload = preparationMarker(input.worker, input.startedAt);
    existing.analysisId = input.analysisId;
    existing.generatorVersion = PREPARING_VERSION_PREFIX + input.generatorVersion;
    existing.model = null;
    return { outcome: "acquired", reportId: existing.id };
  }

  async completePreparation(input: CompletePreparationInput): Promise<{ reportId: string }> {
    this.calls.push(`completePreparation:${input.scanId}`);
    const existing = this.find(input.userId, input.scanId);
    if (existing) {
      existing.analysisId = input.analysisId;
      existing.payload = input.payload;
      existing.generatorVersion = input.generatorVersion;
      existing.model = input.model;
      return { reportId: existing.id };
    }
    const row = this.seed({
      creatorId: input.userId,
      scanId: input.scanId,
      analysisId: input.analysisId,
      payload: input.payload,
      generatorVersion: input.generatorVersion,
      model: input.model,
    });
    this.insertCount += 1;
    return { reportId: row.id };
  }

  async abandonPreparation(userId: string, scanId: string, worker: string): Promise<void> {
    this.calls.push(`abandonPreparation:${worker}`);
    const existing = this.find(userId, scanId);
    if (!existing) return;
    if (readPreparationMarker(existing.payload)?.worker !== worker) return;
    this.rows = this.rows.filter((r) => r !== existing);
  }

  /** Every complete report currently held, for assertions. */
  completeReports(): Row[] {
    return this.rows.filter((r) => isCompletePaidPayload(r.payload));
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
