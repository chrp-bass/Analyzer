import { NextResponse } from "next/server";
import { decodeScanId } from "@/lib/scan-id";
import { getReportById } from "@/lib/fixtures/tracks";
import { payloadToTrackData } from "@/lib/data-source";
import {
  generateReport,
  generateChrpReading,
} from "@/lib/prompts/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/scan-report  { scanId }
 *
 * Server-side generation bridge. Client-side getScanReport calls this so the
 * ANTHROPIC_API_KEY never reaches the browser. On any error — no key, no
 * fixture, generation throws — respond with { error } + non-200 so the
 * client can fall back to the fixture and keep the report rendering.
 */
export async function POST(req: Request) {
  let scanId: string | undefined;
  try {
    const body = await req.json();
    scanId = body?.scanId;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!scanId) {
    return NextResponse.json({ error: "missing scanId" }, { status: 400 });
  }

  const slug = decodeScanId(scanId);
  if (!slug) {
    return NextResponse.json({ error: "invalid scanId" }, { status: 404 });
  }
  const fixture = getReportById(slug);
  if (!fixture) {
    return NextResponse.json({ error: "no fixture" }, { status: 404 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  try {
    const trackData = payloadToTrackData(fixture);
    const sections = await generateReport(trackData);
    const rhodes = await generateChrpReading(
      trackData,
      JSON.stringify(sections, null, 2),
    );
    return NextResponse.json({ sections, rhodes });
  } catch (err) {
    console.error("[api/scan-report] generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 },
    );
  }
}
