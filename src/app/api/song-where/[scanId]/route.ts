import { NextResponse } from "next/server";
import { songWhereEnabled } from "@/lib/song-where/config.server";
import { assertReportAccess, currentUserId } from "@/lib/commerce/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { completedAnalysisForScan, matchesForAnalysis } from "@/lib/song-where/store.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { scanId: string } }) {
  if (!songWhereEnabled()) return new Response(null, { status: 404 });
  try {
    const access = await assertReportAccess(params.scanId);
    if (!access.ok) return new Response(null, { status: 403 });
    const creatorId = await currentUserId();
    if (!creatorId) return new Response(null, { status: 403 });
    const db = createAdminClient();
    const analysis = await completedAnalysisForScan(db, creatorId, params.scanId);
    if (!analysis) return new Response(null, { status: 404 });
    return NextResponse.json({ matches: await matchesForAnalysis(db, analysis.id) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[song-where] read failed", error);
    return new Response(null, { status: 503 });
  }
}
