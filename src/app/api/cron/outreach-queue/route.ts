import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/outreach/admin-auth";
import { runOutreachQueue } from "@/lib/outreach/queue.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The worker stops starting rows at 240s; a started row may run on. */
export const maxDuration = 300;

const CRON_SECRET_ENV = "CRON_SECRET";

/**
 * GET /api/cron/outreach-queue      header: Authorization: Bearer $CRON_SECRET
 *
 * Called by Vercel Cron every 5 minutes (vercel.json). Vercel sends the
 * project's CRON_SECRET as a Bearer token; anything else gets 404, like the
 * admin batch scan. Leases up to 5 queued songs and scores them through the
 * batch scan path. See `@/lib/outreach/queue`.
 */
export async function GET(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!authorizeAdmin(presented, process.env[CRON_SECRET_ENV])) {
    return new Response(null, { status: 404 });
  }
  try {
    const summary = await runOutreachQueue();
    return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[cron/outreach-queue] run failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "run failed" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
