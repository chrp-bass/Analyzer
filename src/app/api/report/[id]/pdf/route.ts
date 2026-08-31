import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportPDF } from "@/components/ReportPDF";
import { resolveEntitledReport } from "@/lib/reports/resolve.server";
import { decodeScanId } from "@/lib/scan-id";
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
  // Same authority and the same stored payload as the JSON route — the PDF
  // is a rendering of the persisted report, never a second generation.
  const resolved = await resolveEntitledReport(params.id);
  if (!resolved.ok) {
    const body: Record<string, unknown> = { error: resolved.error };
    if (resolved.entitled) {
      body.entitled = true;
      if (resolved.detail) body.detail = resolved.detail;
    }
    return NextResponse.json(body, { status: resolved.status });
  }

  const report = resolved.report;
  const slug = decodeScanId(params.id) ?? params.id;

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
