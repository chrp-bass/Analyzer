import { NextResponse } from "next/server";
import { resolveEntitledReport } from "@/lib/reports/resolve.server";
import { buildRhodesVoiceContext } from "@/lib/rhodes-voice/context";
import { mintRhodesSignedUrl } from "@/lib/rhodes-voice/signed-url";
import { logRhodesVoice, newRhodesRequestId } from "@/lib/rhodes-voice/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

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
 * Only after entitlement AND the persisted-report read succeed do we:
 *   - validate the server-only ElevenLabs configuration (typed error → 503),
 *   - mint ONE fresh signed WebSocket URL (never cached, never reused), and
 *   - hand back the minimum governed context Rhodes needs: a flat variables
 *     map for dynamic-context substitution, and Rhodes's own first-read text.
 *
 * Nothing here re-runs Soundcharts, re-scores the song, or generates new
 * intelligence. The context is read verbatim from the persisted report. A
 * voice failure of any kind is a small, typed response — the report the
 * client already rendered is untouched.
 */
export async function POST(req: Request) {
  const requestId = newRhodesRequestId();
  const headers = { ...NO_STORE, "X-Rhodes-Request-Id": requestId };

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers });
  }
  const scanId =
    payload && typeof payload === "object"
      ? (payload as { scanId?: unknown }).scanId
      : undefined;
  if (typeof scanId !== "string" || scanId.length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers });
  }

  // The single source of truth for report authorisation. Any denial — no
  // identity, no entitlement, someone else's scan, misconfigured Supabase —
  // returns the same opaque error the JSON report route returns.
  // The resolver is a pure read: it serves the persisted report or an honest
  // 503. It cannot start a generation, so voice can never delay or fail
  // report fulfillment. ElevenLabs is not contacted on any denial.
  const resolved = await resolveEntitledReport(scanId);
  if (!resolved.ok) {
    const body: Record<string, unknown> = { error: resolved.error };
    if (resolved.entitled) {
      body.entitled = true;
      if (resolved.detail) body.detail = resolved.detail;
    }
    return NextResponse.json(body, { status: resolved.status, headers });
  }

  // Mint the signed URL AFTER we have already confirmed the caller owns this
  // report — a failure here is an operational one (bad configuration,
  // ElevenLabs down) that must not degrade the report itself. The client
  // shows a small voice-only note and the written report stays on screen.
  const signed = await mintRhodesSignedUrl({ requestId });
  if (!signed.ok) {
    if (signed.reason === "not_configured") {
      // Typed configuration defect. Already logged as
      // `configuration-invalid code=… variable=…` by the facade.
      return NextResponse.json(
        { error: "voice_unavailable", retryable: false },
        { status: 503, headers },
      );
    }
    logRhodesVoice("graceful-degradation", {
      requestId,
      stage: "session",
      category: signed.category,
      upstreamStatus: signed.upstreamStatus,
      attempt: signed.attempts,
      ms: signed.ms,
    });
    // Transient upstream trouble → 503 (the panel offers "Try again");
    // a definitive upstream refusal → 502 (an operator problem, not a retry).
    return NextResponse.json(
      { error: "voice_unavailable", retryable: signed.retryable },
      { status: signed.retryable ? 503 : 502, headers },
    );
  }

  // Bind THIS persisted report to THIS conversation through dynamic
  // variables. The agent's prompt and first message reference them; nothing
  // is overridden. Deterministic and bounded — the budget report is logged,
  // never silent.
  const ctx = buildRhodesVoiceContext(resolved.report);
  logRhodesVoice("context-built", {
    requestId,
    stage: "context",
    chars: ctx.budget.chars,
    // e.g. "complete:10" (ten sections, nothing trimmed) or "trimmed_pitch.where:11".
    result: `${ctx.budget.trimmed.length ? `trimmed_${ctx.budget.trimmed.join(".")}` : "complete"}:${ctx.budget.sections.length}`,
  });
  logRhodesVoice("session-started", {
    requestId,
    stage: "handoff",
    ms: signed.ms,
    attempt: signed.attempts,
  });

  return NextResponse.json(
    {
      signedUrl: signed.signedUrl,
      agentId: signed.agentId,
      requestId,
      // No conversation_config_override: the agent rejects overrides (close
      // 1008, seen in production) and none is needed — the first message is
      // templated on the agent from `song_title` / `first_signal`.
      overrides: {},
      dynamicVariables: ctx.variables,
      song: ctx.song,
    },
    { headers },
  );
}
