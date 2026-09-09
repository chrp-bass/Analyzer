/**
 * Monitor-only export of the live Dr. Rhodes agent text.
 *
 * The governed prompt lives in code (`agent-prompt.ts`) and on the ElevenLabs
 * dashboard. When the dashboard is the approved source of truth, the code
 * must be reconciled to it byte-for-byte — which needs the exact live text,
 * and the only place the ElevenLabs key exists is Vercel. This module reads
 * the agent ONCE with the production credential and returns the text to the
 * monitor. It writes nothing, logs nothing, and returns nothing but the two
 * prompt fields, the placeholder names and the agent id.
 *
 * Pure module: the route injects `fetch`; tests inject a fake.
 */

import { resolveRhodesVoiceConfig } from "@/lib/rhodes-voice/config";
import { readLiveAgent } from "./checks/rhodes";
import type { FetchLike } from "./http";

export interface RhodesAgentExport {
  schemaVersion: 1;
  kind: "rhodes-agent-export";
  fetchedAt: string;
  agentId: string;
  name: string | null;
  /** Exact live text. NOT sanitised — this is the point of the export. */
  systemPrompt: string | null;
  firstMessage: string | null;
  /** Placeholder names declared on the agent (values are never read). */
  placeholders: string[];
}

export type RhodesAgentExportResult =
  | { ok: true; status: 200; body: RhodesAgentExport }
  | { ok: false; status: 503; body: { error: "voice_not_configured"; code: string; variable: string } }
  | { ok: false; status: 502; body: { error: "agent_unavailable"; category: string; upstreamStatus: number | null } };

export async function exportRhodesAgent(
  env: Record<string, string | undefined>,
  fetchImpl: FetchLike,
  now: () => number = () => Date.now(),
): Promise<RhodesAgentExportResult> {
  const cfg = resolveRhodesVoiceConfig(env);
  if (!cfg.ok) {
    return { ok: false, status: 503, body: { error: "voice_not_configured", code: cfg.error.code, variable: cfg.error.variable } };
  }
  const read = await readLiveAgent(fetchImpl, cfg.config, { now });
  if (!read.ok) {
    return { ok: false, status: 502, body: { error: "agent_unavailable", category: read.category, upstreamStatus: read.upstreamStatus ?? null } };
  }
  return {
    ok: true,
    status: 200,
    body: {
      schemaVersion: 1,
      kind: "rhodes-agent-export",
      fetchedAt: new Date(now()).toISOString(),
      agentId: cfg.config.agentId,
      name: read.agent.name,
      systemPrompt: read.agent.prompt,
      firstMessage: read.agent.firstMessage,
      placeholders: [...read.agent.placeholders].sort(),
    },
  };
}
