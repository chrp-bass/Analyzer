import { NextResponse } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/commerce/entitlements";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import { prepareReportForScan } from "@/lib/reports/prepare.server";
import { grantFreeFirst, hasUsedFreeFirst } from "@/lib/commerce/free-first.server";
import { ensureAnalysisPersisted } from "@/lib/scan/fulfillment.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The included first report is prepared in full before it is granted — the
// same chain, and the same budget, as the paid preparation route.
export const maxDuration = 120;

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
      return NextResponse.json(
        { status: "already_used", saved: saved.ok },
        { status: 200, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }

  // The creator IS receiving this report, so the analysis becomes theirs
  // and the full report is prepared now. A failure here consumes nothing.
  // "preparing" means another request is generating it; the client polls
  // and claims again — the grant waits for the report, never the reverse.
  const prepared = await prepareReportForScan(userId, scanId);
  if (prepared.status === "preparing") {
    return NextResponse.json(
      { status: "preparing" },
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (prepared.status === "failed") {
    // The included report could not be produced, but the song is still the
    // creator's scan. Preparation persists the analysis as its first stage;
    // this covers a failure before that stage. Best-effort, never blocking.
    await ensureAnalysisPersisted(userId, scanId).catch(() => null);
    return NextResponse.json(
      {
        status: "unavailable",
        reason: prepared.reason,
        message: prepared.message,
      },
      { status: 409 },
    );
  }

  try {
    const outcome = await grantFreeFirst(db, userId, scanId, trackKey);
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
