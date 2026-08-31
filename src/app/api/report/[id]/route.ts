import { NextResponse } from "next/server";
import { resolveEntitledReport } from "@/lib/reports/resolve.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/report/[id]  — the paid Song Intelligence payload.
 *
 * Answers only after the server has verified, against the database and a
 * cookie-bound Supabase identity, that this caller holds a live entitlement
 * covering this exact scan. Authorization, generation and persistence all
 * live in `resolveEntitledReport`, which the PDF route shares.
 *
 * Every denial returns the same opaque 403 so the endpoint cannot be used to
 * enumerate which scans exist or which are owned by someone else.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveEntitledReport(params.id);

  if (!resolved.ok) {
    const body: Record<string, unknown> = { error: resolved.error };
    if (resolved.entitled) {
      body.entitled = true;
      if (resolved.detail) body.detail = resolved.detail;
    }
    return NextResponse.json(body, { status: resolved.status });
  }

  return NextResponse.json(
    { id: params.id, report: resolved.report, source: resolved.source },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
