import { NextResponse } from "next/server";
import { authorizeMonitor } from "@/lib/sentinel/auth";
import { songWhereEnabled, songWhereJobSecret } from "@/lib/song-where/config.server";
import { ingestOnce, matchBatch } from "@/lib/song-where/jobs.server";
import { alertBatch } from "@/lib/song-where/alerts.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!songWhereEnabled()) return new Response(null, { status: 404 });
  const auth = authorizeMonitor(request.headers.get("authorization"), songWhereJobSecret());
  if (!auth.ok) return new Response(null, { status: auth.reason === "not_configured" ? 503 : 403 });
  const stage = new URL(request.url).searchParams.get("stage");
  try {
    if (stage === "ingest") return NextResponse.json(await ingestOnce());
    if (stage === "match") return NextResponse.json(await matchBatch());
    if (stage === "alert") return NextResponse.json(await alertBatch());
    return new Response(null, { status: 400 });
  } catch {
    console.error("[song-where] job failed");
    return new Response(null, { status: 503 });
  }
}
