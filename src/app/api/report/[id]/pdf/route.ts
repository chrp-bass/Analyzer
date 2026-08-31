import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportPDF } from "@/components/ReportPDF";
import { assertReportAccess } from "@/lib/commerce/entitlements";
import { getFullReport } from "@/lib/fixtures/report.server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadFonts() {
  const dir = path.join(process.cwd(), "public", "fonts");
  const names = [
    "CormorantGaramond-400.ttf",
    "CormorantGaramond-700.ttf",
    "CormorantGaramond-Italic-400.ttf",
    "Lato-400.ttf",
    "Lato-700.ttf",
    "Lato-900.ttf",
  ];
  const fonts: Record<string, Buffer> = {};
  for (const n of names) {
    fonts[n] = await fs.readFile(path.join(dir, n));
  }
  return fonts;
}

/**
 * GET /api/report/[id]/pdf — the paid report as a PDF.
 *
 * Gated identically to the JSON route. This endpoint previously returned a
 * complete paid PDF to any anonymous caller; it now requires a verified
 * entitlement covering the requested scan.
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
    return NextResponse.json(
      {
        error: "report_unavailable",
        entitled: true,
        detail:
          "report generation unavailable; your purchase is safe and access is retained",
      },
      { status: 503 },
    );
  }
  const report = assembled.report;
  const slug = access.trackSlug;

  const fonts = await loadFonts();
  const buffer = await renderToBuffer(
    ReportPDF({ report, fonts }) as React.ReactElement,
  );
  const filename = `chrp-report-${slug}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
