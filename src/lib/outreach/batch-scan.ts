import type { SearchOutcome, SongSearchResult } from "@/lib/engine/song-search";
import type { PrepareResult, ReadinessState } from "@/lib/reports/prepare";
import { isCompletePaidPayload } from "@/lib/reports/store";
import { selectFinding, type FindingCandidate } from "@/lib/outreach/finding";

/**
 * Admin batch scan — founder outreach, through the EXISTING pipeline.
 *
 * For each requested song: resolve it the way the scan page does (Spotify
 * first, Soundcharts only while Spotify is down), refuse it unless the
 * resolved artist is the one asked for, then run the very same preparation
 * the paid unlock runs — analysis, enrichment, governed Rhodes generation,
 * persistence — and cut one verbatim sentence from the persisted report.
 *
 * Nothing here scores a song, generates text or writes a report. Every one
 * of those is an injected dependency supplied by `batch-scan.server.ts` from
 * the production modules, so the batch cannot drift from what a creator sees.
 *
 * Rules the orchestration owns:
 *   - sequential, with a pause between items (Soundcharts is metered);
 *   - a search that reports the daily budget as spent defers everything
 *     after it, and a wall-clock deadline does the same;
 *   - a song with a complete current analysis AND a complete current report
 *     already on file is reused — zero upstream calls;
 *   - a dry run resolves identity only and spends nothing downstream;
 *   - a wrong song is worse than no song: artist mismatch is never scored.
 *
 * Pure module. Titles and artist names are data — they are passed to the
 * search provider as a query and to nothing else.
 */

export type ItemStatus =
  | "scored"
  | "not_found"
  | "identity_mismatch"
  | "deferred"
  | "no_quotable_finding"
  | "error"
  /** Dry run only: identity resolved, nothing scored. */
  | "resolved";

export interface BatchItemInput {
  artist: string;
  title: string;
  isrc?: string | null;
  instagram?: string | null;
}

export interface BatchItemResult {
  artist: string;
  title: string;
  instagram: string | null;
  status: ItemStatus;
  reason: string | null;
  resolved_artist: string | null;
  resolved_title: string | null;
  isrc: string | null;
  scan_id: string | null;
  analysis_id: string | null;
  /** True when analysis and report were already on file. */
  reused: boolean;
  mode: string | null;
  epi_score: number | null;
  flow: number | null;
  ready: number | null;
  recharge: number | null;
  recover: number | null;
  finding: string | null;
  finding_source: string | null;
  finding_candidates: FindingCandidate[];
}

export interface BatchRun {
  batch_id: string;
  dry_run: boolean;
  /** Soundcharts feature lookups a real run would spend (dry run) or spent. */
  soundcharts_lookups: number;
  items: BatchItemResult[];
}

/** What is already on file for an ISRC under the outreach identity. */
export interface ExistingWork {
  scanId: string;
  analysisId: string;
  analysisStatus: string;
  engineVersion: string;
  reportPayload: unknown | null;
  generatorVersion: string | null;
}

/** The persisted result of a prepared scan, read back for the response. */
export interface PreparedSong {
  analysisId: string;
  mode: string | null;
  epiScore: number | null;
  scores: { focus?: number; calm?: number; motivation?: number; balance?: number } | null;
  reportPayload: unknown;
}

export interface BatchDeps {
  search(query: string, limit: number): Promise<SearchOutcome>;
  findExisting(isrc: string): Promise<ExistingWork | null>;
  newScanId(isrc: string): string | null;
  /** The paid preparation, unchanged. */
  prepare(scanId: string): Promise<PrepareResult>;
  readiness(scanId: string): Promise<ReadinessState>;
  readPrepared(scanId: string): Promise<PreparedSong | null>;
  record(row: BatchItemResult & { batch_id: string }): Promise<void>;
  engineVersion: string;
  generatorVersion: string;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** Stop starting new items after this many ms. */
  deadlineMs?: number;
  /** Pause between items. */
  pauseMs?: number;
  /** How long to wait on a preparation another worker holds. */
  preparingPollMs?: number;
}

export const MAX_ITEMS = 25;
export const DEFAULT_DEADLINE_MS = 240_000;
export const DEFAULT_PAUSE_MS = 1_000;
const SEARCH_LIMIT = 10;

// ── Identity ───────────────────────────────────────────────────────────────

/** Case-insensitive, accent-insensitive, leading "The " dropped. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The result that is the requested song, or null. Artist must match after
 * normalization — that is the gate. Among the artist's results the best
 * title match is preferred, so "Song" beats "Song - Live" when both exist.
 */
export function pickMatch(
  requested: BatchItemInput,
  songs: SongSearchResult[],
): SongSearchResult | null {
  const artist = normalizeName(requested.artist);
  const title = normalizeName(requested.title);
  const byArtist = songs.filter(
    (s) => s.artistName !== null && normalizeName(s.artistName) === artist,
  );
  if (byArtist.length === 0) return null;
  return (
    byArtist.find((s) => normalizeName(s.songName ?? "") === title) ??
    byArtist.find((s) => normalizeName(s.songName ?? "").startsWith(title)) ??
    byArtist[0]
  );
}

function isReusable(existing: ExistingWork | null, deps: BatchDeps): existing is ExistingWork {
  return (
    !!existing &&
    existing.analysisStatus === "complete" &&
    existing.engineVersion === deps.engineVersion &&
    existing.generatorVersion === deps.generatorVersion &&
    isCompletePaidPayload(existing.reportPayload)
  );
}

function blank(input: BatchItemInput): BatchItemResult {
  return {
    artist: input.artist,
    title: input.title,
    instagram: input.instagram ?? null,
    status: "error",
    reason: null,
    resolved_artist: null,
    resolved_title: null,
    isrc: null,
    scan_id: null,
    analysis_id: null,
    reused: false,
    mode: null,
    epi_score: null,
    flow: null,
    ready: null,
    recharge: null,
    recover: null,
    finding: null,
    finding_source: null,
    finding_candidates: [],
  };
}

const round = (n: number | undefined | null) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;

// ── The run ────────────────────────────────────────────────────────────────

export async function runBatch(
  deps: BatchDeps,
  input: { batch_id: string; dry_run: boolean; items: BatchItemInput[] },
): Promise<BatchRun> {
  const started = deps.now();
  const deadlineMs = deps.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const pauseMs = deps.pauseMs ?? DEFAULT_PAUSE_MS;
  const pollMs = deps.preparingPollMs ?? 5_000;
  const results: BatchItemResult[] = [];
  let lookups = 0;
  let deferAll = false;

  for (let i = 0; i < input.items.length; i += 1) {
    const item = input.items[i];
    const out = blank(item);

    if (deferAll) {
      out.status = "deferred";
      out.reason = "search_budget";
      results.push(out);
      continue;
    }
    if (i > 0) await deps.sleep(pauseMs);
    if (deps.now() - started > deadlineMs) {
      out.status = "deferred";
      out.reason = "deadline";
      results.push(out);
      continue;
    }

    try {
      // ── Resolve identity, the way the scan page does. ───────────────────
      const query = item.isrc ? `isrc:${item.isrc}` : `${item.title} ${item.artist}`;
      const outcome = await deps.search(query, SEARCH_LIMIT);
      if (!outcome.ok) {
        if (outcome.kind === "limited") {
          deferAll = true;
          out.status = "deferred";
          out.reason = "search_budget";
        } else {
          out.status = "error";
          out.reason = "search_unavailable";
        }
        results.push(out);
        continue;
      }
      if (outcome.songs.length === 0) {
        out.status = "not_found";
        results.push(out);
        continue;
      }
      const match = pickMatch(item, outcome.songs);
      if (!match) {
        const first = outcome.songs[0];
        out.status = "identity_mismatch";
        out.resolved_artist = first.artistName;
        out.resolved_title = first.songName;
        out.reason = "artist_mismatch";
        results.push(out);
        continue;
      }
      out.resolved_artist = match.artistName;
      out.resolved_title = match.songName;
      out.isrc = match.isrc;

      // ── Already done? Reuse both analysis and report. ───────────────────
      const existing = await deps.findExisting(match.isrc);
      const reusable = isReusable(existing, deps);
      if (!reusable) lookups += 1;

      if (input.dry_run) {
        out.status = "resolved";
        out.reused = reusable;
        if (reusable) {
          out.scan_id = existing.scanId;
          out.analysis_id = existing.analysisId;
        }
        results.push(out);
        continue;
      }

      // ── The paid preparation, unchanged. Reuse is its own fast path. ────
      const scanId = reusable ? existing.scanId : deps.newScanId(match.isrc);
      if (!scanId) {
        out.status = "error";
        out.reason = "invalid_isrc";
        results.push(out);
        continue;
      }
      out.scan_id = scanId;
      out.reused = reusable;

      let prepared = await deps.prepare(scanId);
      while (prepared.status === "preparing") {
        if (deps.now() - started > deadlineMs) break;
        await deps.sleep(pollMs);
        const state = await deps.readiness(scanId);
        if (state.status === "ready") {
          prepared = { status: "ready", readiness: state.readiness, reused: true, timings: [] };
        } else if (state.status === "none") {
          prepared = {
            status: "failed",
            reason: "generation_failed",
            message: "",
            detail: "preparation ended without a report",
            timings: [],
          };
        }
      }
      if (prepared.status === "preparing") {
        out.status = "deferred";
        out.reason = "still_preparing";
        results.push(out);
        continue;
      }
      if (prepared.status === "failed") {
        out.status = "error";
        out.reason = prepared.reason;
        await deps.record({ ...out, batch_id: input.batch_id });
        results.push(out);
        continue;
      }
      out.analysis_id = prepared.readiness.analysisId;

      // ── Read back what was persisted; quote it. ─────────────────────────
      const song = await deps.readPrepared(scanId);
      if (!song) {
        out.status = "error";
        out.reason = "report_unreadable";
        await deps.record({ ...out, batch_id: input.batch_id });
        results.push(out);
        continue;
      }
      out.mode = song.mode;
      out.epi_score = round(song.epiScore);
      out.flow = round(song.scores?.focus);
      out.ready = round(song.scores?.motivation);
      out.recharge = round(song.scores?.calm);
      out.recover = round(song.scores?.balance);

      const selection = selectFinding(song.reportPayload);
      out.finding = selection.finding?.text ?? null;
      out.finding_source = selection.finding?.source ?? null;
      out.finding_candidates = selection.candidates;
      out.status = selection.finding ? "scored" : "no_quotable_finding";
      await deps.record({ ...out, batch_id: input.batch_id });
      results.push(out);
    } catch (err) {
      out.status = "error";
      out.reason = err instanceof Error ? err.message.slice(0, 120) : "unknown";
      results.push(out);
    }
  }

  return {
    batch_id: input.batch_id,
    dry_run: input.dry_run,
    soundcharts_lookups: lookups,
    items: results,
  };
}

// ── Input validation ───────────────────────────────────────────────────────

export type ParsedBody =
  | { ok: true; batch_id: string; dry_run: boolean; items: BatchItemInput[] }
  | { ok: false; error: string };

export function parseBody(body: unknown): ParsedBody {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.batch_id !== "string" || !b.batch_id.trim() || b.batch_id.length > 100) {
    return { ok: false, error: "batch_id is required (string, ≤100 chars)" };
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, error: "items is required (non-empty array)" };
  }
  if (b.items.length > MAX_ITEMS) {
    return { ok: false, error: `at most ${MAX_ITEMS} items per call` };
  }
  const items: BatchItemInput[] = [];
  for (let i = 0; i < b.items.length; i += 1) {
    const raw: unknown = b.items[i];
    if (!raw || typeof raw !== "object") return { ok: false, error: `items[${i}] must be an object` };
    const it = raw as Record<string, unknown>;
    const artist = typeof it.artist === "string" ? it.artist.trim() : "";
    const title = typeof it.title === "string" ? it.title.trim() : "";
    if (!artist || !title || artist.length > 200 || title.length > 200) {
      return { ok: false, error: `items[${i}] needs artist and title (strings, ≤200 chars)` };
    }
    const isrc =
      typeof it.isrc === "string" && it.isrc.trim()
        ? it.isrc.replace(/[\s-]/g, "").toUpperCase()
        : null;
    if (isrc && !/^[A-Z0-9]{5,20}$/.test(isrc)) {
      return { ok: false, error: `items[${i}].isrc is not a valid ISRC` };
    }
    const instagram =
      typeof it.instagram === "string" && it.instagram.trim() ? it.instagram.trim().slice(0, 100) : null;
    items.push({ artist, title, isrc, instagram });
  }
  return { ok: true, batch_id: b.batch_id.trim(), dry_run: b.dry_run === true, items };
}

// ── CSV ────────────────────────────────────────────────────────────────────

export const CSV_COLUMNS = [
  "artist", "title", "instagram", "status", "reason", "resolved_artist", "resolved_title",
  "isrc", "mode", "epi_score", "flow", "ready", "recharge", "recover", "finding",
  "finding_source", "finding_candidates", "scan_id", "reused",
] as const;

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  // A cell starting with =,+,-,@ would be executed by a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(items: BatchItemResult[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const item of items) {
    lines.push(CSV_COLUMNS.map((c) => csvCell((item as unknown as Record<string, unknown>)[c])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
