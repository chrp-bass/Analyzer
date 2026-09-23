import { NextResponse } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/commerce/entitlements";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import { prepareReportForScan } from "@/lib/reports/prepare.server";
import { grantFreeFirst, hasUsedFreeFirst } from "@/lib/commerce/free-first.server";
import { ensureAnalysisPersisted } from "@/lib/scan/fulfillment.server";
import { matchScanAgainstCreatorBriefs } from "@/lib/song-where/creator-brief.server";
import { waitUntil } from "@vercel/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The included first report is prepared in full before it is granted — the
// same chain, and the same budget, as the paid preparation route.
export const maxDuration = 300;

/**
 * POST /api/scan/claim   { scanId }
 *
 * Claims a creator's included first complete report.
 *
 * The whole decision lives here, on the server. The browser cannot tell us
 * whether the free report is still available, whether it has been used, or
 * whether this song qualifies — it can only ask, and be told.
 *
 * Order matters: the COMPLETE report — analysis, enrichments, Christian
 * context, governed Rhodes text — must be persisted before anything is
 * granted, so a song that cannot be analysed never costs the creator their
 * free report, and the read after the grant is a read, not a generation.
 */
export async function POST(req: Request) {
  if (!adminConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  let scanId: unknown;
  try {
    scanId = ((await req.json()) as { scanId?: unknown }).scanId;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof scanId !== "string") {
    return NextResponse.json({ error: "scanId required" }, { status: 400 });
  }

  const trackKey = decodeScanId(scanId);
  if (!trackKey) {
    return NextResponse.json({ error: "invalid scanId" }, { status: 400 });
  }

  // Sample tracks are development content. They are neither purchasable nor
  // eligible to consume a creator's included report.
  if (isFixtureKey(trackKey)) {
    return NextResponse.json({ status: "not_eligible" }, { status: 200 });
  }

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "no_identity" }, { status: 401 });
  }

  const db = createAdminClient();

  // EVERY SCANNED SONG IS KEPT.
  //
  // This call is made for every scan that reaches the reveal without an
  // entitlement, right after the analysis, with an identity already in the
  // cookie — so it is where a scan becomes part of the creator's library,
  // whether or not they ever pay. A creator who has used their included
  // report still gets the song saved: the analysis (song identity, EPI,
  // mode, the four dimensions, the circumplex) is persisted, and My Songs
  // shows it LOCKED with an "Unlock" action.
  //
  // What is saved is the free reveal and nothing more. No report is
  // prepared, no entitlement is written, and `/api/report/[id]` still
  // answers from entitlements alone — a saved song is not an owned report.
  // (This used to write nothing at all, which is why a scanned song was
  // gone when the creator came back.)
  if (await hasUsedFreeFirst(db, userId)) {
    const { data: owned } = await db
      .from("entitlements")
      .select("id")
      .eq("user_id", userId)
      .eq("offer", "song_intelligence")
      .eq("scan_id", scanId)
      .limit(1);
    if (!owned || owned.length === 0) {
      const saved = await ensureAnalysisPersisted(userId, scanId);
      if (!saved.ok) {
        // Never blocks the reveal: the creator still sees their song. It is
        // logged because a song missing from My Songs is exactly the defect
        // this exists to prevent.
        console.error(
          `[api/scan/claim] could not save ${scanId} to the library: ${saved.reason}` +
            (saved.detail ? ` — ${saved.detail}` : ""),
        );
      }
      if (saved.ok) {
        // Start the paid report while the creator is reading the free reveal.
        // The response is not held open; the fenced report claim prevents a
        // save or unlock request from duplicating this work.
        waitUntil(
          prepareReportForScan(userId, scanId).then((result) => {
            if (result.status === "failed") {
              console.error(
                `[api/scan/claim] report prewarm failed for ${scanId}: ${result.reason}`,
              );
            }
          }),
        );
        // Match this analysis against the creator's existing briefs.
        waitUntil(
          matchScanAgainstCreatorBriefs(userId, scanId).catch((err) =>
            console.error(`[api/scan/claim] brief matching failed for ${scanId}:`, err),
          ),
        );
      }
      return NextResponse.json(
        { status: "already_used", saved: saved.ok },
        { status: 200, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }

  // ── Persist the analysis FIRST — fast (~3s), deterministic. ──────────
  // The analysis must exist before the entitlement is written: a song that
  // cannot be analysed must never consume the creator's included report.
  const saved = await ensureAnalysisPersisted(userId, scanId);
  if (!saved.ok) {
    console.error(
      `[api/scan/claim] analysis persistence failed for ${scanId}: ${saved.reason}` +
        (saved.detail ? ` — ${saved.detail}` : ""),
    );
    return NextResponse.json(
      { status: "unavailable", reason: saved.reason },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // ── Grant the entitlement immediately. ─────────────────────────────────
  // The analysis is persisted; the creator now owns this song. The Rhodes
  // report is a DELIGHT layer (Tier 3) that runs in the background — the
  // grant never waits on it, so the creator's first experience is ~3s
  // instead of 20–60s.
  try {
    const outcome = await grantFreeFirst(db, userId, scanId, trackKey);

    // Rhodes and brief matching fire in the background. The durable report
    // lease in prepareReportForScan makes this safe to trigger from any
    // path — duplicates join rather than race.
    waitUntil(
      prepareReportForScan(userId, scanId).then((result) => {
        if (result.status === "failed") {
          console.error(
            `[api/scan/claim] report generation failed for ${scanId}: ${result.reason}`,
          );
        }
      }),
    );
    waitUntil(
      matchScanAgainstCreatorBriefs(userId, scanId).catch(() => null),
    );

    return NextResponse.json(
      { status: outcome },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error(`[api/scan/claim] grant failed for ${scanId}:`, err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

/**
 * GET /api/scan/claim — is this creator's included report still available?
 * Presentation only; the grant decision is always re-made server-side.
 */
export async function GET() {
  if (!adminConfigured()) {
    return NextResponse.json({ freeFirstAvailable: false }, { status: 200 });
  }
  const userId = await currentUserId();
  if (!userId) {
    // No identity yet — a first-time visitor still has theirs.
    return NextResponse.json({ freeFirstAvailable: true, identified: false });
  }
  const used = await hasUsedFreeFirst(createAdminClient(), userId);
  return NextResponse.json(
    { freeFirstAvailable: !used, identified: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
