/**
 * Server-side helper that mints a signed conversation URL for the existing
 * private Dr. Rhodes agent.
 *
 * This module talks to ElevenLabs. It is imported ONLY from server routes,
 * behind the same entitlement check that guards the paid report — never from
 * a client component.
 *
 * The API key stays here. The response returned to the caller carries only
 * the temporary signed URL (a WebSocket handshake token bound to one session
 * and expiring shortly). The permanent key never appears in a Vercel Preview
 * URL, a browser payload, a log line, or a client-side environment variable.
 */

import "server-only";

const AGENT_ID_ENV = "ELEVENLABS_RHODES_AGENT_ID";
const API_KEY_ENV = "ELEVENLABS_API_KEY";

/** The production Dr. Rhodes agent id, per the integration brief. */
const DEFAULT_AGENT_ID = "vv1j1yrAGF0RdxJOSGIJ";

export type SignedUrlResult =
  | { ok: true; signedUrl: string; agentId: string }
  | { ok: false; reason: "not_configured" | "upstream_error"; detail: string };

/** Read the agent id — fall back to the brief's canonical id when unset. */
export function rhodesAgentId(): string {
  const v = process.env[AGENT_ID_ENV];
  return v && v.trim().length > 0 ? v.trim() : DEFAULT_AGENT_ID;
}

/**
 * Mint a signed URL for one voice conversation.
 *
 * Uses the ElevenLabs Conversational AI `get_signed_url` endpoint against the
 * production agent. The signed URL is a short-lived WebSocket handshake token
 * bound to this agent and this session; it cannot be re-used, cannot be
 * decoded into the API key, and expires quickly enough that transferring it
 * to another user does not open a lasting hole.
 */
export async function mintRhodesSignedUrl(
  fetchImpl: typeof fetch = fetch,
): Promise<SignedUrlResult> {
  const apiKey = process.env[API_KEY_ENV];
  if (!apiKey) {
    return {
      ok: false,
      reason: "not_configured",
      detail: `${API_KEY_ENV} is not configured`,
    };
  }
  const agentId = rhodesAgentId();
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(
    agentId,
  )}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { "xi-api-key": apiKey, Accept: "application/json" },
      // ElevenLabs signs the URL server-to-server. Nothing here is fetched
      // twice; Next's fetch cache would just get in the way.
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      reason: "upstream_error",
      detail: err instanceof Error ? err.message : "network error",
    };
  }

  if (!response.ok) {
    // Do not leak the response body — it can carry account or plan details.
    return {
      ok: false,
      reason: "upstream_error",
      detail: `ElevenLabs get_signed_url returned ${response.status}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      reason: "upstream_error",
      detail: "ElevenLabs response was not JSON",
    };
  }
  const signedUrl =
    body && typeof body === "object"
      ? (body as { signed_url?: unknown }).signed_url
      : undefined;
  if (typeof signedUrl !== "string" || !signedUrl.startsWith("wss://")) {
    return {
      ok: false,
      reason: "upstream_error",
      detail: "ElevenLabs response missing signed_url",
    };
  }
  return { ok: true, signedUrl, agentId };
}
