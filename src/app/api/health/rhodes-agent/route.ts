import { NextResponse } from "next/server";
import { authorizeMonitor, MONITOR_SECRET_ENV } from "@/lib/sentinel/auth";
import { exportRhodesAgent } from "@/lib/sentinel/rhodes-agent-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/health/rhodes-agent
 *
 * Monitor-only export of the live Dr. Rhodes agent's System prompt and First
 * message, so the repository's governed constants can be reconciled to the
 * dashboard byte-for-byte without anyone handling the ElevenLabs key.
 *
 *   Authorization: Bearer <HEALTH_MONITOR_SECRET>   (same secret as the sentinel)
 *
 *   200  { systemPrompt, firstMessage, placeholders, agentId, … }  — exact text
 *   403  missing or wrong secret (opaque)
 *   503  the surface or the voice configuration is not configured
 *   502  ElevenLabs refused or was unreachable (category only)
 *
 * Read-only: one GET to ElevenLabs. Nothing is logged. The prompt is not a
 * secret (it is version-controlled), but this route is still gated so the
 * export happens only on purpose, from the monitor.
 */
export async function GET(req: Request) {
  const auth = authorizeMonitor(req.headers.get("authorization"), process.env[MONITOR_SECRET_ENV]);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return NextResponse.json({ error: "health_not_configured" }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const result = await exportRhodesAgent(process.env, fetch);
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}
