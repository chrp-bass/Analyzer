import { NextResponse } from "next/server";
import {
  ADMIN_SECRET_ENV,
  ADMIN_SECRET_HEADER,
  authorizeAdmin,
} from "@/lib/outreach/admin-auth";
import { parseBody, toCsv } from "@/lib/outreach/batch-scan";
import { runOutreachBatch } from "@/lib/outreach/batch-scan.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Each real item runs the whole paid preparation — analysis, enrichment,
 * governed Rhodes generation with its retry, persistence — sequentially.
 * The orchestration stops starting new items well inside this window and
 * returns the rest as deferred, so a long batch never dies mid-item.
 */
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * POST /api/admin/batch-scan[?format=csv]     header: x-admin-secret
 *
 * Internal. Scores a batch of songs through the existing scan pipeline and
 * returns per-song scores plus one verbatim sentence from each real report,
 * for founder outreach. See `@/lib/outreach/batch-scan`.
 *
 * Body: { batch_id, dry_run?, items: [{ artist, title, isrc?, instagram? }] }
 *
 *   200 JSON array of items          (real run)
 *   200 { dry_run, soundcharts_lookups, items }   (dry run)
 *   200 text/csv                     (?format=csv, either run)
 *   400 { error }                    malformed body
 *   404                              secret missing or wrong — not discoverable
 *   503 { error }                    Supabase admin client not configured
 */
export async function POST(req: Request) {
  if (!authorizeAdmin(req.headers.get(ADMIN_SECRET_HEADER), process.env[ADMIN_SECRET_ENV])) {
    return new Response(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  let run;
  try {
    run = await runOutreachBatch({
      batch_id: parsed.batch_id,
      dry_run: parsed.dry_run,
      items: parsed.items,
    });
  } catch (err) {
    console.error("[admin/batch-scan] run failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "batch failed" },
      { status: 503, headers: NO_STORE },
    );
  }

  const format = new URL(req.url).searchParams.get("format");
  if (format === "csv") {
    return new Response(toCsv(run.items), {
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${run.batch_id}.csv"`,
        "x-soundcharts-lookups": String(run.soundcharts_lookups),
      },
    });
  }
  if (run.dry_run) {
    return NextResponse.json(
      { dry_run: true, soundcharts_lookups: run.soundcharts_lookups, items: run.items },
      { headers: NO_STORE },
    );
  }
  return NextResponse.json(run.items, {
    headers: { ...NO_STORE, "x-soundcharts-lookups": String(run.soundcharts_lookups) },
  });
}
