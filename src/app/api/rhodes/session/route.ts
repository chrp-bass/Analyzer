import { NextResponse } from "next/server";
import { resolveEntitledReport } from "@/lib/reports/resolve.server";
import { buildRhodesVoiceContext } from "@/lib/rhodes-voice/context";
import { mintRhodesSignedUrl } from "@/lib/rhodes-voice/signed-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rhodes/session
 *
 * Body: { scanId: string }
 *
 * Server-side gate for the Dr. Rhodes voice moment. The caller must:
 *   (1) hold a Supabase-cookie identity, and
 *   (2) hold an entitlement that covers this exact scan.
 *
 * `resolveEntitledReport` enforces both — identical guard to the paid JSON
 * route, so voice cannot reach a report the JSON route would refuse. On any
 * failure we return the SAME opaque 403 the JSON route uses, so a caller
 * cannot use this endpoint to enumerate scans or entitlements.
 *
 * On success we:
 *   - mint a short-lived ElevenLabs signed WebSocket URL for the production
 *     private agent (the permanent API key never leaves the server), and
 *   - hand back the minimum governed context Rhodes needs: a flat variables
 *     map for dynamic-context substitution, and Rhodes's own first-read text.
 *
 * Nothing here re-runs Soundcharts, re-scores the song, or generates new
 * intelligence. The context is read verbatim from the persisted report.
 */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const scanId =
    payload && typeof payload === "object"
      ? (payload as { scanId?: unknown }).scanId
      : undefined;
  if (typeof scanId !== "string" || scanId.length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // The single source of truth for report authorisation. Any denial — no
  // identity, no entitlement, someone else's scan, misconfigured Supabase —
  // returns the same opaque error the JSON report route returns.
  const resolved = await resolveEntitledReport(scanId);
  if (!resolved.ok) {
    const body: Record<string, unknown> = { error: resolved.error };
    if (resolved.entitled) {
      body.entitled = true;
      if (resolved.detail) body.detail = resolved.detail;
    }
    return NextResponse.json(body, { status: resolved.status });
  }

  // Mint the signed URL AFTER we have already confirmed the caller owns this
  // report — a failure here is an operational one (missing key, ElevenLabs
  // down) that must not degrade the report itself. The client falls back to
  // the written report gracefully on 503.
  const signed = await mintRhodesSignedUrl();
  if (!signed.ok) {
    // A missing key is not a security event; it is a configuration one. The
    // detail is a status hint, not the key itself.
    const status = signed.reason === "not_configured" ? 503 : 502;
    console.error(
      `[rhodes-voice] signed-url failed: ${signed.reason} — ${signed.detail}`,
    );
    return NextResponse.json(
      { error: "voice_unavailable" },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const ctx = buildRhodesVoiceContext(resolved.report);

  return NextResponse.json(
    {
      signedUrl: signed.signedUrl,
      agentId: signed.agentId,
      overrides: {
        agent: {
          // Rhodes speaks his own opening — the personalised first read. The
          // ElevenLabs canonical SOT still governs everything after this line.
          firstMessage: ctx.firstMessage,
        },
      },
      dynamicVariables: ctx.variables,
      song: ctx.song,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
