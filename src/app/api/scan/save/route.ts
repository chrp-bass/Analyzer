import { NextResponse } from "next/server";
import { adminConfigured } from "@/lib/supabase/admin";
import { currentUserId } from "@/lib/commerce/entitlements";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import { ensureAnalysisPersisted } from "@/lib/scan/fulfillment.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * POST /api/scan/save   { scanId }
 *
 * "Save my report" on a free reveal actually saves the song.
 *
 * It used to attach an email to the identity and write nothing else. Once a
 * creator's included first report was used, a scanned song existed only in
 * the browser — they could save it, leave, come back, and find it gone,
 * because the only paths that persisted an analysis were the included-report
 * claim and the paid preparation.
 *
 * This persists exactly what the free reveal already showed — the song, EPI,
 * mode, the four dimensions and the circumplex — under the caller's identity,
 * through the same `ensureAnalysisPersisted` the claim and paid paths use. It
 * then appears in My Songs.
 *
 * What it deliberately does NOT do:
 *   - prepare or persist a paid report (no enrichments, no Rhodes call);
 *   - insert or touch an entitlement, a credit, or the included-first marker;
 *   - return any analysis content.
 *
 * So it cannot grant paid access. `/api/report/[id]` still answers from
 * entitlements alone; a saved song without one opens to its free reveal and
 * the $19 offer, exactly as before.
 *
 * The identity is the session cookie and nothing else — there is no user id
 * to pass. An explicit save is the creator's own act, which is what
 * distinguishes it from merely viewing a reveal (still not filed anywhere).
 *
 *   200 { status: "saved" }
 *   200 { status: "not_eligible" }              a bundled sample track
 *   401 { error: "no_identity" }
 *   409 { status: "unavailable", reason }
 */
export async function POST(req: Request) {
  if (!adminConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
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

  // Sample tracks are development content, not a creator's song.
  if (isFixtureKey(trackKey)) {
    return NextResponse.json({ status: "not_eligible" }, { headers: NO_STORE });
  }

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "no_identity" }, { status: 401, headers: NO_STORE });
  }

  // Idempotent on (creator, scan): saving twice, or saving a song that was
  // already persisted by a claim or a paid preparation, updates that one row.
  const saved = await ensureAnalysisPersisted(userId, scanId);
  if (!saved.ok) {
    console.error(
      `[api/scan/save] could not save ${scanId}: ${saved.reason}` +
        (saved.detail ? ` — ${saved.detail}` : ""),
    );
    return NextResponse.json(
      { status: "unavailable", reason: saved.reason },
      { status: 409, headers: NO_STORE },
    );
  }

  return NextResponse.json({ status: "saved" }, { headers: NO_STORE });
}
