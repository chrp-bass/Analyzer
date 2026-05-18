import { NextResponse } from "next/server";
import { getReportById } from "@/lib/fixtures/tracks";

export function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const report = getReportById(params.id);
  if (!report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ id: params.id, report });
}
