import { NextResponse } from "next/server";
import { assertReportAccess } from "@/lib/commerce/entitlements";
import { getFullReport, fixtureReportsPermitted } from "@/lib/fixtures/report.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/report/[id]  — the paid Song Intelligence payload.
 *
 * Previously this returned the complete paid report to any anonymous
 * caller. It now answers only after the server has verified, against the
 * database and a cookie-bound Supabase identity, that this caller holds a
 * live entitlement covering this exact scan.
 *
 * Every denial returns the same opaque 403 so the endpoint cannot be used
 * to enumerate which scans exist or which are owned by someone else.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const access = await assertReportAccess(params.id);

  if (!access.ok) {
    if (access.reason === "not_configured") {
      return NextResponse.json(
        { error: "entitlement_unavailable" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const assembled = getFullReport(access.trackSlug);
  if (!assembled) {
    // Entitled, but no report can honestly be produced. Do not fabricate
    // one — the entitlement stands and the caller can retry.
    return NextResponse.json(
      {
        error: "report_unavailable",
        entitled: true,
        detail: fixtureReportsPermitted()
          ? "no report content for this track"
          : "report generation unavailable; your purchase is safe and access is retained",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { id: params.id, report: assembled.report, source: assembled.source },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
