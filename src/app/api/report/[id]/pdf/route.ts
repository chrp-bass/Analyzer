import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getReportById } from "@/lib/fixtures/tracks";
import { ReportPDF } from "@/components/ReportPDF";
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

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const report = getReportById(params.id);
  if (!report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const fonts = await loadFonts();
  const buffer = await renderToBuffer(
    ReportPDF({ report, fonts }) as React.ReactElement,
  );
  const filename = `chrp-report-${params.id}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
