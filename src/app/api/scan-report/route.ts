import { NextResponse } from "next/server";
import { decodeScanId } from "@/lib/scan-id";
import {
  getFullReport,
  fixtureReportsPermitted,
} from "@/lib/fixtures/report.server";
import { payloadToRhodesInput } from "@/lib/data-source";
import { generateSongIntelligence } from "@/lib/rhodes";

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
  // Development bridge only. This route returns PAID prose and performs no
  // entitlement check, so it must never be reachable in production. The paid
  // path is /api/report/[id], which is gated and persists what it generates.
  if (!fixtureReportsPermitted()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

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
  const assembled = getFullReport(slug);
  if (!assembled) {
    return NextResponse.json({ error: "no fixture" }, { status: 404 });
  }
  const fixture = assembled.report;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  try {
    const result = await generateSongIntelligence(payloadToRhodesInput(fixture));
    if (!result.ok) {
      return NextResponse.json({ error: result.detail }, { status: 502 });
    }
    // Same single governed generation the production path uses; `rhodes` is
    // split out only because this dev bridge's response shape predates it.
    const { rhodes, ...sections } = result.sections;
    return NextResponse.json({ sections, rhodes, violations: result.violations });
  } catch (err) {
    console.error("[api/scan-report] generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 },
    );
  }
}
