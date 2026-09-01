import { NextResponse } from "next/server";
import {
  analyzeByIsrc,
  cachedAnalysis,
  normalizeIsrc,
  AnalyzeError,
} from "@/lib/engine/analyze.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/song-api/analyze  { isrc }
 *
 * Fetches the song's audio features from Soundcharts, computes the four
 * CHRP scores, and returns them alongside the EPI translation (mode,
 * epiScore, verdict, circumplex).
 *
 * The scoring itself lives in @/lib/engine/analyze.server so commerce can
 * reach the same answer server-side without an HTTP hop. Results are cached
 * there by ISRC, shared by both callers, per server instance.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const rawIsrc =
    body && typeof body === "object" && "isrc" in body
      ? (body as { isrc: unknown }).isrc
      : undefined;
  if (typeof rawIsrc !== "string") {
    return NextResponse.json(
      { error: "isrc is required (string)" },
      { status: 400 },
    );
  }

  const isrc = normalizeIsrc(rawIsrc);
  if (!isrc) {
    return NextResponse.json(
      {
        error:
          "isrc must be 5–20 alphanumeric characters (dashes/spaces stripped, letters uppercased)",
      },
      { status: 400 },
    );
  }

  const wasCached = cachedAnalysis(isrc) !== null;

  try {
    const payload = await analyzeByIsrc(isrc);
    return NextResponse.json({ ...payload, cached: wasCached });
  } catch (err) {
    console.error("[song-api/analyze] error:", err);
    if (err instanceof AnalyzeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "analyze failed" },
      { status: 502 },
    );
  }
}
