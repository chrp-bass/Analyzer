import { NextResponse } from "next/server";
import { assertReportAccess } from "@/lib/commerce/entitlements";
import { logRhodesVoice, type RhodesVoiceEvent, type RhodesVoiceLogFields } from "@/lib/rhodes-voice/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rhodes/session/outcome
 *
 * Write-only telemetry for the BROWSER half of a voice session, so the
 * production log carries the whole lifecycle — signed URL minted (server),
 * WebSocket opened / closed / failed (browser) — under one request id.
 *
 * This is not a diagnostic route: it returns nothing but 204, reads nothing,
 * contacts no upstream, and accepts only the closed field set below (each
 * value re-validated here and again by the log formatter's allow-list). It is
 * gated by the same entitlement check as the report, so it cannot be used to
 * spam the log from outside a paid session.
 */

const EVENTS: ReadonlySet<RhodesVoiceEvent> = new Set<RhodesVoiceEvent>([
  "microphone-granted",
  "microphone-denied",
  "websocket-opening",
  "websocket-open",
  "websocket-closed",
  "websocket-failed",
  "provider-failure",
  "retry",
  "session-started",
  "session-stopped",
  "graceful-degradation",
]);

const TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;

function token(v: unknown): string | undefined {
  return typeof v === "string" && TOKEN.test(v) ? v : undefined;
}
function int(v: unknown, max: number): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!body || typeof body !== "object") return new NextResponse(null, { status: 400 });
  const b = body as Record<string, unknown>;

  const scanId = typeof b.scanId === "string" && b.scanId.length > 0 && b.scanId.length <= 120 ? b.scanId : null;
  const event = typeof b.event === "string" && EVENTS.has(b.event as RhodesVoiceEvent) ? (b.event as RhodesVoiceEvent) : null;
  if (!scanId || !event) return new NextResponse(null, { status: 400 });

  // Same gate as the report. Denied callers get the same opaque 403 and
  // nothing is logged for them.
  const access = await assertReportAccess(scanId);
  if (!access.ok) return new NextResponse(null, { status: 403 });

  const fields: RhodesVoiceLogFields = {
    requestId: token(b.requestId),
    stage: "browser",
    ms: int(b.ms, 3_600_000),
    category: token(b.category),
    attempt: int(b.attempt, 10),
    result: token(b.result),
    conversationId: token(b.conversationId),
    closeCode: int(b.closeCode, 4999),
  };
  logRhodesVoice(event, fields);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
