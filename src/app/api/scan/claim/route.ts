import { NextResponse } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/commerce/entitlements";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import {
  ensureAnalysisPersisted,
  fulfillmentMessage,
} from "@/lib/scan/fulfillment.server";
import { grantFreeFirst, hasUsedFreeFirst } from "@/lib/commerce/free-first.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/scan/claim   { scanId }
 *
 * Claims a creator's included first complete report.
 *
 * The whole decision lives here, on the server. The browser cannot tell us
 * whether the free report is still available, whether it has been used, or
 * whether this song qualifies — it can only ask, and be told.
 *
 * Order matters: the analysis must persist as COMPLETE before anything is
 * granted, so a song that cannot be analysed never costs the creator their
 * free report.
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

  // Real, completed analysis first. A failure here consumes nothing.
  const fulfillment = await ensureAnalysisPersisted(userId, scanId);
  if (!fulfillment.ok) {
    return NextResponse.json(
      {
        status: "unavailable",
        reason: fulfillment.reason,
        message: fulfillmentMessage(fulfillment.reason),
      },
      { status: 409 },
    );
  }

  const db = createAdminClient();
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
