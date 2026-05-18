import { NextRequest, NextResponse } from "next/server";
import {
  getReportById,
  matchInputToReportId,
} from "@/lib/fixtures/tracks";

export async function POST(req: NextRequest) {
  let body: { input?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400 },
    );
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) {
    return NextResponse.json(
      { error: "missing_input" },
      { status: 400 },
    );
  }

  if (input.toLowerCase().includes("unresolved")) {
    return NextResponse.json(
      { error: "unresolved" },
      { status: 422 },
    );
  }

  const id = matchInputToReportId(input);
  const report = getReportById(id);
  if (!report) {
    return NextResponse.json(
      { error: "unresolved" },
      { status: 422 },
    );
  }

  await new Promise((r) => setTimeout(r, 350));

  return NextResponse.json({ id, report });
}
