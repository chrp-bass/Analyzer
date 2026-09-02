import {
  MODE,
  getOrCreateGuestUser,
  recordScan as accountsRecordScan,
} from "@/lib/accounts";
import {
  encodeScanId,
  encodeIsrcScanId,
  decodeScanId,
  isFixtureKey,
  isrcFromKey,
  ScanRecord,
  getScanById,
  saveScan,
} from "@/lib/scan-id";
import {
  getFreeReportById,
  matchInputToReportId,
  type FreeReport,
  type ReportPayload,
} from "@/lib/fixtures/tracks";
import {
  getCreatorProfile as getCreatorProfileFixture,
  CreatorProfilePayload,
} from "@/lib/fixtures/profile";
import {
  analysisToFreeReport,
  type AnalyzePayload,
  type SongSearchResult,
} from "@/lib/engine/analysis-mapping";
import type { SongIntelligenceInput } from "@/lib/rhodes";

export type { ReportPayload, CreatorProfilePayload, SongSearchResult };

/**
 * Scan data flow.
 *
 * Two kinds of song reach the report:
 *
 *   fixture — one of the six bundled demo tracks, resolved from a slug.
 *   real    — any song with an ISRC, resolved through the live engine:
 *             /api/song-api/search to find it, /api/song-api/analyze to
 *             score it.
 *
 * The scan id says which (see @/lib/scan-id), and every loader below
 * branches on that rather than on a build-time mode flag. Report components
 * are unchanged — `analysisToFreeReport` adapts engine output to the shape
 * they already consume.
 */

/**
 * A failure worth showing someone. `message` is user-facing copy, not an
 * upstream error string — callers can render it directly.
 */
export class ScanError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "ScanError";
    this.userMessage = userMessage;
    if (cause) this.cause = cause;
  }
}

const NOT_FOUND_MESSAGE =
  "This song isn't available for analysis yet. Try a different version or another track.";
const NO_AUDIO_MESSAGE =
  "Audio data isn't available for this track. Try another version.";
const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/** Translate a route's status code into copy a person can act on. */
function messageForStatus(status: number): string {
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status === 422) return NO_AUDIO_MESSAGE;
  return GENERIC_MESSAGE;
}

/**
 * Free-tier analysis cache, in memory for the life of the page session.
 *
 * Deliberately NOT localStorage. Browser storage is never authority for
 * anything in this app, and keeping the cache in memory means it cannot be
 * edited, cannot outlive the session, and cannot be mistaken for a record of
 * entitlement. The analyze route keeps its own server-side cache by ISRC, so
 * a reload costs little.
 */
const analysisCache = new Map<string, FreeReport>();

// ─── Search ────────────────────────────────────────────────────────────────

/**
 * Find candidate songs for a query. Returns the tracks the engine can score
 * (search already filters to those carrying an ISRC), for the caller to
 * present so the person picks their own song rather than us guessing.
 */
export async function searchSongs(
  query: string,
  limit = 10,
): Promise<SongSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let res: Response;
  try {
    res = await fetch(
      `/api/song-api/search?query=${encodeURIComponent(trimmed)}&limit=${limit}`,
      { cache: "no-store" },
    );
  } catch (err) {
    throw new ScanError(GENERIC_MESSAGE, err);
  }

  if (!res.ok) {
    throw new ScanError(messageForStatus(res.status));
  }

  const body = (await res.json().catch(() => ({}))) as {
    songs?: SongSearchResult[];
  };
  return body.songs ?? [];
}

// ─── Analysis ──────────────────────────────────────────────────────────────

/** Score a song by ISRC through the live engine. */
export async function analyzeIsrc(isrc: string): Promise<AnalyzePayload> {
  let res: Response;
  try {
    res = await fetch("/api/song-api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isrc }),
    });
  } catch (err) {
    throw new ScanError(GENERIC_MESSAGE, err);
  }

  if (!res.ok) {
    throw new ScanError(messageForStatus(res.status));
  }

  return (await res.json()) as AnalyzePayload;
}

/**
 * The free reveal for a real song, mapped into the report shape.
 * Cached per scan so processing -> preview does not analyse twice.
 */
async function realFreeReport(
  scanId: string,
  isrc: string,
): Promise<FreeReport> {
  const cached = analysisCache.get(scanId);
  if (cached) return cached;

  const payload = await analyzeIsrc(isrc);
  const report = analysisToFreeReport(payload);
  analysisCache.set(scanId, report);
  return report;
}

/**
 * Fixtures are a development affordance, never a production fallback.
 *
 * A real user who searched for a real song must never be handed demo
 * intelligence dressed up as their own result. In production a search that
 * finds nothing fails honestly instead.
 */
export function fixtureFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

// ─── Starting a scan ───────────────────────────────────────────────────────

/**
 * Start a scan for a real song the person selected from search results.
 * The ISRC becomes the song's durable identity, carried in the scan id.
 */
export async function beginScanForSong(
  song: Pick<SongSearchResult, "isrc">,
): Promise<{ scanId: string; trackSlug: string }> {
  const scanId = encodeIsrcScanId(song.isrc);
  if (!scanId) {
    throw new ScanError(NOT_FOUND_MESSAGE);
  }
  const trackSlug = decodeScanId(scanId)!;

  saveScan(scanId, {
    trackSlug,
    paid: false,
    scannedAt: new Date().toISOString(),
  });
  const user = await getOrCreateGuestUser();
  if (user) {
    await accountsRecordScan(user.id, trackSlug, false, scanId);
  }
  return { scanId, trackSlug };
}

/**
 * Start a scan against one of the six bundled demo tracks.
 *
 * Retained for the demo surfaces (and as the fallback when a query matches a
 * sample track but the live catalogue has nothing). Real songs go through
 * `searchSongs` + `beginScanForSong`.
 */
export async function initiateScan(
  input: string,
): Promise<{ scanId: string; trackSlug: string }> {
  const trackSlug = matchInputToReportId(input);
  const scanId = encodeScanId(trackSlug);
  // A guest User row is created up front so the scan has somewhere to live
  // and can be claimed later by email. No sign-in is required to get here.
  const user = await getOrCreateGuestUser();

  // A new scan is NOT entitled to the paid report. "First scan free" in the
  // locked architecture means the free REVEAL is free — EPI score, mode, the
  // four dimensions and one signature statement — not the full report.
  const paid = false;
  saveScan(scanId, { trackSlug, paid, scannedAt: new Date().toISOString() });
  if (user) {
    await accountsRecordScan(user.id, trackSlug, paid, scanId);
  }
  return { scanId, trackSlug };
}

// ─── Loading a scan ────────────────────────────────────────────────────────

/**
 * Free reveal loader.
 *
 * Returns ONLY free-tier data. There is deliberately no client-side path to
 * paid intelligence here: the paid report is fetched from the entitlement-
 * gated /api/report/[scanId] route, which the browser cannot talk its way
 * past.
 */
export async function getScanReport(
  scanId: string,
): Promise<FreeReport | null> {
  const key = decodeScanId(scanId);
  if (!key) return null;

  if (isFixtureKey(key)) return getFreeReportById(key);

  const isrc = isrcFromKey(key);
  if (!isrc) return null;
  return realFreeReport(scanId, isrc);
}

export async function getScanRecord(scanId: string): Promise<ScanRecord | null> {
  return getScanById(scanId);
}

/**
 * Creator profile. Aggregate profile content exists only for the bundled demo
 * catalogue; a real song has no profile until enough of the creator's catalog
 * has been analysed.
 */
export async function getCreatorProfileForUser(
  trackSlug: string,
): Promise<CreatorProfilePayload | null> {
  if (!isFixtureKey(trackSlug)) return null;
  return getCreatorProfileFixture(trackSlug);
}

/**
 * Ask the server to apply this creator's included first report to a scan.
 *
 * The browser never decides this. It asks; the server checks whether the
 * creator still has their included report, whether the song analysed
 * successfully, and grants or refuses accordingly.
 */
export type ClaimOutcome =
  | "granted"
  | "already_entitled"
  | "already_used"
  | "not_eligible"
  | "unavailable";

export async function claimFirstReport(
  scanId: string,
): Promise<ClaimOutcome> {
  try {
    const res = await fetch("/api/scan/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanId }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      status?: ClaimOutcome;
    };
    if (!res.ok) return "unavailable";
    return body.status ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

// ─── Paid report ───────────────────────────────────────────────────────────

export interface EntitledReport {
  report: ReportPayload;
  source: "generated" | "fixture";
}

export type ReportFetchResult =
  | { status: "ok"; data: EntitledReport }
  | { status: "forbidden" }
  | { status: "unavailable"; entitled: boolean; detail?: string };

/**
 * Fetch the paid report for a scan.
 *
 * The server decides. A 403 means no entitlement; a 503 with entitled:true
 * means the purchase stands but no report can honestly be produced right
 * now — the caller must say so rather than showing anything fabricated.
 */
export async function fetchEntitledReport(
  scanId: string,
): Promise<ReportFetchResult> {
  try {
    const res = await fetch(`/api/report/${encodeURIComponent(scanId)}`, {
      cache: "no-store",
    });
    if (res.status === 403) return { status: "forbidden" };
    if (!res.ok) {
      let entitled = false;
      let detail: string | undefined;
      try {
        const body = await res.json();
        entitled = Boolean(body?.entitled);
        detail = body?.detail;
      } catch {
        /* non-JSON error body */
      }
      return { status: "unavailable", entitled, detail };
    }
    const body = (await res.json()) as {
      report: ReportPayload;
      source: "generated" | "fixture";
    };
    return { status: "ok", data: { report: body.report, source: body.source } };
  } catch (err) {
    console.error("[fetchEntitledReport] request failed:", err);
    return { status: "unavailable", entitled: false };
  }
}

// ─── Generator input ───────────────────────────────────────────────────────

/**
 * Fixture -> Rhodes input, used only by the development-only /api/scan-report
 * bridge. The production paid path builds its input from real analysis facts
 * in @/lib/reports/generate.server instead.
 *
 * This function used to fabricate a per-mode table of Spotify metadata — a
 * BPM, a key, a valence, an energy, a popularity, a release date, a genre
 * list and a duration — none of which the engine had measured, and all of
 * which went straight into the prompt. It was development scaffolding, but it
 * taught the generator that those facts exist, and it made every local sample
 * an unreliable guide to what production would actually say.
 *
 * Nothing is invented now. A fixture supplies what a fixture has: identity,
 * the four dimensions, the EPI score and the mode. Everything the engine did
 * not measure is simply absent, which is exactly what the evidence governor
 * needs to see in order to enforce its rules.
 */
export function payloadToRhodesInput(rl: ReportPayload): SongIntelligenceInput {
  const byName = new Map(rl.chrp_scores.map((r) => [r.name, r.score]));
  return {
    identity: { title: rl.track.title, artist: rl.track.artist, isrc: rl.track.isrc },
    engine: {
      epiScore: rl.epi.score,
      mode: rl.epi.mode,
      dimensions: {
        focus: byName.get("Focus") ?? 0,
        calm: byName.get("Calm") ?? 0,
        motivation: byName.get("Motivation") ?? 0,
        balance: byName.get("Balance") ?? 0,
      },
    },
  };
}

// `MODE` remains exported from @/lib/accounts for the demo checkout surfaces.
export { MODE };
