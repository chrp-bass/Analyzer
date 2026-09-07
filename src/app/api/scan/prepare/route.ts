import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/commerce/entitlements";
import { decodeScanId, isFixtureKey } from "@/lib/scan-id";
import {
  prepareReportForScan,
  reportReadinessForScan,
} from "@/lib/reports/prepare.server";
import { prepareFailureMessage } from "@/lib/reports/prepare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * The whole intelligence chain runs inside this request: analysis,
 * enrichments, the Christian gate, governed Rhodes generation (with its one
 * retry) and persistence. Generous on purpose — a slow generation must
 * finish and persist rather than be cut off mid-way.
 */
export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * POST /api/scan/prepare   { scanId }
 *
 * Prepare the paid report BEFORE checkout. Responds with readiness metadata
 * and nothing else — no report content is ever returned here, because the
 * caller has not paid.
 *
 *   200 { status: "ready", reportId, reportVersion, analysisId }
 *   202 { status: "preparing" }            another request is generating; poll GET
 *   409 { status: "failed", reason, message }  no checkout will be offered
 *
 * Idempotent: a refresh, a second tab or a retry joins the preparation in
 * flight or reuses the persisted report. It never generates twice.
 */
export async function POST(req: Request) {
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
  if (isFixtureKey(trackKey)) {
    return NextResponse.json(
      {
        status: "failed",
        reason: "fixture_not_purchasable",
        message: prepareFailureMessage("fixture_not_purchasable"),
      },
      { status: 409, headers: NO_STORE },
    );
  }

  // Preparation is owned by an identity: the persisted report belongs to
  // whoever will be charged for it, and checkout binds to that same identity.
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "no_identity", message: "Session could not be established." },
      { status: 401 },
    );
  }

  const result = await prepareReportForScan(userId, scanId);

  if (result.status === "ready") {
    return NextResponse.json(
      { status: "ready", ...result.readiness, reused: result.reused },
      { headers: NO_STORE },
    );
  }
  if (result.status === "preparing") {
    return NextResponse.json(
      { status: "preparing", startedAt: result.startedAt },
      { status: 202, headers: NO_STORE },
    );
  }
  console.error(
    `[api/scan/prepare] refusing ${scanId}: ${result.reason}` +
      (result.detail ? ` — ${result.detail}` : ""),
  );
  return NextResponse.json(
    { status: "failed", reason: result.reason, message: result.message },
    { status: 409, headers: NO_STORE },
  );
}

/**
 * GET /api/scan/prepare?scanId=…  — readiness only. Starts no work.
 */
export async function GET(req: Request) {
  const scanId = new URL(req.url).searchParams.get("scanId");
  if (!scanId || !decodeScanId(scanId)) {
    return NextResponse.json({ error: "invalid scanId" }, { status: 400 });
  }
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ status: "none" }, { headers: NO_STORE });
  }
  const state = await reportReadinessForScan(userId, scanId);
  if (state.status === "ready") {
    return NextResponse.json(
      { status: "ready", ...state.readiness },
      { headers: NO_STORE },
    );
  }
  return NextResponse.json(state, { headers: NO_STORE });
}
