import "server-only";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { decodeScanId, isFixtureKey, isrcFromKey } from "@/lib/scan-id";
import { analyzeByIsrc, AnalyzeError } from "@/lib/engine/analyze.server";
import { recordCompletedAnalysis } from "@/lib/memory/catalog.server";

/** Bumped when the scoring contract changes. v2 = corrected EPI. */
export const ENGINE_VERSION = "chrp-epi-v2";

/**
 * Fulfillment readiness.
 *
 * The gap this closes: a real song's analysis existed only in the browser's
 * memory. `recordCompletedAnalysis` was written to persist it and never
 * called, so after a successful payment the paid route found no analysis on
 * file and — correctly — refused to invent one. The buyer would have paid for
 * a report the server already knew it could not produce.
 *
 * This runs the SAME engine that produced the free reveal, server-side,
 * and persists that exact reading. It does not rescore anything: the scoring
 * is deterministic on the ISRC, and the analyze cache means the checkout call
 * usually returns the very reading the reveal displayed.
 *
 * Called before a Stripe session is created. If it cannot succeed, no session
 * is created and nobody pays.
 */

export type FulfillmentFailure =
  | "not_configured"
  | "invalid_scan"
  | "fixture_not_purchasable"
  | "song_unavailable"
  | "audio_unavailable"
  | "engine_unavailable"
  | "persist_failed";

export type FulfillmentResult =
  | { ok: true; analysisId: string; songId: string }
  | { ok: false; reason: FulfillmentFailure; detail?: string };

/**
 * Ensure a completed, persisted analysis exists for this scan, owned by this
 * caller. Idempotent: `recordCompletedAnalysis` upserts on
 * (creator_id, scan_id), so a retry updates the same row rather than
 * creating a contradictory second one.
 */
export async function ensureAnalysisPersisted(
  userId: string,
  scanId: string,
): Promise<FulfillmentResult> {
  if (!adminConfigured()) {
    return { ok: false, reason: "not_configured" };
  }

  const trackKey = decodeScanId(scanId);
  if (!trackKey) return { ok: false, reason: "invalid_scan" };

  // The six bundled demo tracks are development content. They are not
  // products, and nobody may be charged for one.
  if (isFixtureKey(trackKey)) {
    return { ok: false, reason: "fixture_not_purchasable" };
  }

  const isrc = isrcFromKey(trackKey);
  if (!isrc) return { ok: false, reason: "invalid_scan" };

  let payload;
  try {
    payload = await analyzeByIsrc(isrc);
  } catch (err) {
    if (err instanceof AnalyzeError) {
      if (err.status === 404) return { ok: false, reason: "song_unavailable" };
      if (err.status === 422) return { ok: false, reason: "audio_unavailable" };
    }
    return {
      ok: false,
      reason: "engine_unavailable",
      detail: err instanceof Error ? err.message : undefined,
    };
  }

  // Every field the paid report generator reads must be present before this
  // counts as complete. Missing truth is a failure, never a default.
  const title = payload.song.songName;
  if (!title) return { ok: false, reason: "song_unavailable" };
  try {
    const { analysisId, songId } = await recordCompletedAnalysis(
      createAdminClient(),
      {
        userId,
        scanId,
        trackKey,
        title,
        artistName: payload.song.artistName,
        isrc: payload.song.isrc,
        source: "soundcharts",
        // v2 is the corrected EPI: (arousal + valence) / 2. Rows still
        // marked v1 were scored when EPI was the dominant dimension, so the
        // version is how a legacy value is told apart from a current one.
        engineVersion: ENGINE_VERSION,
        epiScore: Math.round(payload.epiScore),
        mode: payload.mode,
        scores: payload.scores,
        circumplex: payload.circumplex,
      },
    );
    return { ok: true, analysisId, songId };
  } catch (err) {
    console.error(`[fulfillment] persist failed for ${scanId}:`, err);
    return {
      ok: false,
      reason: "persist_failed",
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}

/** Buyer-facing copy for a fulfillment failure. Never leaks internals. */
export function fulfillmentMessage(reason: FulfillmentFailure): string {
  switch (reason) {
    case "song_unavailable":
      return "This song isn't available for analysis yet. Try a different version or another track.";
    case "audio_unavailable":
      return "Audio data isn't available for this track, so a report can't be produced. Try another version.";
    case "fixture_not_purchasable":
      return "This is a sample track and isn't for sale. Scan one of your own songs.";
    default:
      return "We can't prepare this report right now, so we haven't taken any payment. Please try again shortly.";
  }
}
