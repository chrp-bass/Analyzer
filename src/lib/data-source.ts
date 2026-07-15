import {
  MODE,
  getOrCreateGuestUser,
  recordScan as accountsRecordScan,
} from "@/lib/accounts";
import { encodeScanId, decodeScanId, ScanRecord, getScanById, saveScan } from "@/lib/scan-id";
import {
  getReportById,
  matchInputToReportId,
  ReportPayload,
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
    const user = await getOrCreateGuestUser();
    saveScan(scanId, { trackSlug, paid: false, scannedAt: new Date().toISOString() });
    if (user) {
      await accountsRecordScan(user.id, trackSlug, false, scanId);
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
    demand_signal: `${rl.where_this_music_lives.confidence} — ${rl.where_this_music_lives.n_briefs} active briefs, top vertical "${top.name}" at ${top.pct}%`,
    ...stub,
    spotify_popularity: 42,
    release_date: rl.report_meta.scanned_at.slice(0, 10),
    genres: [rl.epi.mode.toLowerCase(), "cinematic", "editorial"],
    duration_seconds: 218,
  };
}

const CACHE_KEY = (scanId: string) => `chrp_generated_${scanId}`;

/**
 * getScanReport: fixture-backed report loader with optional live generation.
 *
 * Contract (per design brief):
 *   - Always resolves to a renderable ReportPayload (or null for bad scanId).
 *   - Fixture is the fallback; a generation failure NEVER breaks the render.
 *   - First view of a scan hits the /api/scan-report route which server-side
 *     calls generateReport + generateRhodesReading with the ANTHROPIC_API_KEY.
 *   - The merged payload is cached in localStorage under chrp_generated_<scanId>.
 *     Subsequent views of the same scanId serve the cached payload — no API call.
 *   - Only successful generations are cached, so a transient failure doesn't
 *     lock in fixture content permanently for that scanId.
 *   - Server-side calls (SSR, RSC) always return the fixture; generation is
 *     client-side so the localStorage cache is available.
 */
export async function getScanReport(scanId: string): Promise<ReportPayload | null> {
  if (MODE === "demo") {
    const trackSlug = decodeScanId(scanId);
    if (!trackSlug) return null;
    const fixture = getReportById(trackSlug);
    if (!fixture) return null;

    // Server context: no window, no localStorage, no generation from here.
    // The client-side call will handle the generation + cache after hydration.
    if (typeof window === "undefined") return fixture;

    // 1. Serve from localStorage cache if a prior generation succeeded.
    try {
      const cached = window.localStorage.getItem(CACHE_KEY(scanId));
      if (cached) {
        const parsed = JSON.parse(cached) as ReportPayload;
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch {
      /* corrupt cache entry — fall through to regenerate */
    }

    // 2. No cache — request generation from the server-side API route.
    try {
      const res = await fetch("/api/scan-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId }),
      });
      if (!res.ok) return fixture;
      const body = (await res.json()) as {
        sections?: {
          signature: string;
          placements: { title: string; body: string }[];
          throughline: string;
          comparable: string;
        };
        rhodes?: string;
        error?: string;
      };
      if (!body.sections || typeof body.rhodes !== "string") return fixture;
      const merged: ReportPayload = {
        ...fixture,
        signature: body.sections.signature,
        placements: body.sections.placements,
        throughline: body.sections.throughline,
        comparable: body.sections.comparable,
        rhodes: body.rhodes,
      };
      // 3. Cache the successful generation. Failure to write (quota, disabled
      //    storage) is not fatal — the merged payload is still returned.
      try {
        window.localStorage.setItem(CACHE_KEY(scanId), JSON.stringify(merged));
      } catch {
        /* cache write failed — still return merged */
      }
      return merged;
    } catch (err) {
      console.error("[getScanReport] generation failed, using fixture:", err);
      return fixture;
    }
  }
  throw new Error("Production CHRP engine not yet connected");
  // Production: fetch(`${process.env.CHRP_ENGINE_URL}/api/scan/${scanId}`)
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
