import { NextResponse } from "next/server";
import { authorizeMonitor, MONITOR_SECRET_ENV } from "@/lib/sentinel/auth";
import { runServerHealth } from "@/lib/sentinel/run.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Four vendor boundaries run in parallel inside a 45s budget. */
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/health/production
 *
 * The protected, read-only production health surface behind
 * `npm run health:production`. It exists so the vendor credentials (Supabase
 * service role, Stripe, ElevenLabs) stay where they already live — on Vercel —
 * and GitHub Actions holds exactly one narrowly scoped monitor secret.
 *
 *   Authorization: Bearer <HEALTH_MONITOR_SECRET>
 *
 *   200  ServerHealthReport (sanitised aggregates; no identities, report
 *        content, internal ids, secrets or signed URLs)
 *   403  missing or wrong secret — the same opaque body for both
 *   503  the surface itself is not configured on this deployment
 *
 * Nothing here writes, generates, mints more than one signed URL, or contacts
 * a provider with anything but a read. See docs/production-sentinel.md.
 */
export async function GET(req: Request) {
  const auth = authorizeMonitor(req.headers.get("authorization"), process.env[MONITOR_SECRET_ENV]);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return NextResponse.json({ error: "health_not_configured" }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const report = await runServerHealth();
  return NextResponse.json(report, { headers: NO_STORE });
}
