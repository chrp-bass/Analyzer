import {
  MODE,
  getOrCreateGuestUser,
  recordScan as accountsRecordScan,
} from "@/lib/accounts";
import { encodeScanId, decodeScanId, ScanRecord, getScanById, saveScan } from "@/lib/scan-id";
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
import type { TrackData } from "@/lib/prompts/report";

export type { ReportPayload, CreatorProfilePayload };

export async function initiateScan(
  input: string,
): Promise<{ scanId: string; trackSlug: string }> {
  if (MODE === "demo") {
    const trackSlug = matchInputToReportId(input);
    const scanId = encodeScanId(trackSlug);
    // A guest User row is created up front so the scan has somewhere to live
    // and can be claimed later by email. No sign-in is required to get here.
    const user = await getOrCreateGuestUser();

    // A new scan is NOT entitled to the paid report. "First scan free" in the
    // locked architecture means the free REVEAL is free — EPI score, mode, the
    // four dimensions and one signature statement — not the full report.
    //
    // This previously granted `paid: true` on a visitor's first scan, which
    // meant a first-time user never met the paywall and Deliverable 08 (the
    // honest boundary) was unreachable for them. That contradicts the locked
    // Five-Moment sequence: FREE REVEAL -> PAYWALL -> PAID REPORT.
    //
    // COMMERCIAL CHANGE — flagged for sign-off. To restore the previous
    // behaviour, set `paid` back to `priorScans.length === 0`.
    const paid = false;
    saveScan(scanId, { trackSlug, paid, scannedAt: new Date().toISOString() });
    if (user) {
      await accountsRecordScan(user.id, trackSlug, paid, scanId);
    }
    return { scanId, trackSlug };
  }
  throw new Error("Production CHRP engine not yet connected");
  // Production: POST to ${process.env.CHRP_ENGINE_URL}/api/scan with input
}

/**
 * Fixture → TrackData mapping. Fabricates Spotify metadata (BPM, key,
 * valence, energy, instrumentalness) per mode since the fixture payload
 * doesn't carry it yet. When the real Spotify integration lands, this is
 * the ONE place those stubs get replaced — everything downstream reads
 * from the returned TrackData object.
 */
const SPOTIFY_STUBS = {
  Ready:    { bpm: 152, key: "E minor",  spotify_valence: 0.62, spotify_energy: 0.94, spotify_instrumentalness: 0.18 },
  Flow:     { bpm: 118, key: "F# minor", spotify_valence: 0.55, spotify_energy: 0.72, spotify_instrumentalness: 0.42 },
  Recharge: { bpm: 92,  key: "G major",  spotify_valence: 0.78, spotify_energy: 0.44, spotify_instrumentalness: 0.28 },
  Recover:  { bpm: 74,  key: "A minor",  spotify_valence: 0.31, spotify_energy: 0.36, spotify_instrumentalness: 0.55 },
} as const;

export function payloadToTrackData(rl: ReportPayload): TrackData {
  const stub = SPOTIFY_STUBS[rl.epi.mode];
  const parts = rl.comparable.split(/'s '/);
  const extracted = parts
    .slice(0, -1)
    .map((chunk) => {
      const m = chunk.match(/([A-Z][\w.]*(?:\s+[A-Z][\w.]*)*)\s*$/);
      return m?.[1]?.trim();
    })
    .filter((s): s is string => !!s);
  const comparable_artists =
    extracted.length > 0 ? extracted.slice(0, 2) : [rl.creator.name];
  const top = rl.where_this_music_lives.verticals[0];
  return {
    track: rl.track.title,
    artist: rl.track.artist,
    mode: rl.epi.mode,
    epi_score: rl.epi.score,
    percentile_corpus: rl.epi.rank_overall,
    percentile_mode: rl.epi.rank_in_mode,
    verdict: rl.verdict.call === "Pitch now" ? "Pitch Now" : rl.verdict.call,
    verdict_reasoning: rl.verdict.rationale,
    comparable_artists,
    // demand_signal previously packed brief counts and vertical percentages
    // into the generator's input. Those are unsupported claims, so the field
    // now carries only the emotional territory the scoring can actually
    // support. The prompt no longer asks the model to reference demand.
    demand_signal: top.name,
    ...stub,
    spotify_popularity: 42,
    release_date: rl.report_meta.scanned_at.slice(0, 10),
    genres: [rl.epi.mode.toLowerCase(), "cinematic", "editorial"],
    duration_seconds: 218,
  };
}

/**
 * Free reveal loader.
 *
 * Returns ONLY free-tier data. There is deliberately no client-side path to
 * paid intelligence here: the paid report is fetched from the entitlement-
 * gated /api/report/[scanId] route, which the browser cannot talk its way
 * past.
 */
export async function getScanReport(scanId: string): Promise<FreeReport | null> {
  if (MODE === "demo") {
    const trackSlug = decodeScanId(scanId);
    if (!trackSlug) return null;
    return getFreeReportById(trackSlug);
  }
  throw new Error("Production CHRP engine not yet connected");
}

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

export async function getScanRecord(scanId: string): Promise<ScanRecord | null> {
  if (MODE === "demo") {
    return getScanById(scanId);
  }
  throw new Error("Production CHRP engine not yet connected");
}

export async function getCreatorProfileForUser(
  trackSlug: string,
): Promise<CreatorProfilePayload | null> {
  if (MODE === "demo") {
    return getCreatorProfileFixture(trackSlug);
  }
  throw new Error("Production CHRP engine not yet connected");
}
