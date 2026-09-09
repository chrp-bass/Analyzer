/**
 * Boundary 5 — Dr. Rhodes voice (ElevenLabs Agents).
 *
 * Reads the live agent, compares it with the governed configuration in
 * `agent-prompt.ts`, and mints exactly ONE signed URL to prove the deployed
 * credential, agent and permissions work. The URL is discarded the moment it
 * is minted: never opened, never logged, never returned. No WebSocket, no
 * conversation, no audio. Every provider error is reduced to a category.
 */

import {
  RHODES_VOICE_EXTRA_VARIABLES,
  RHODES_VOICE_FIRST_MESSAGE,
  RHODES_VOICE_GOVERNED_CLAUSES,
  RHODES_VOICE_SYSTEM_PROMPT,
  RHODES_VOICE_VARIABLES,
  type RhodesGovernedClause,
} from "@/lib/rhodes-voice/agent-prompt";
import { resolveRhodesVoiceConfig, type RhodesVoiceConfig } from "@/lib/rhodes-voice/config";
import { classifyUpstreamStatus, type UpstreamFailureCategory } from "@/lib/rhodes-voice/elevenlabs";
import { boundaryResult, runCheck, type CheckOutcome } from "../evaluate";
import { httpRequest, type FetchLike } from "../http";
import { fingerprint, sanitizeText } from "../redact";
import { THRESHOLDS } from "../thresholds";
import type { BoundaryResult, CheckResult, CheckStatus, Evidence } from "../types";

export const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
/** The governed production agent. A different deployed id is drift (WARN). */
export const RHODES_GOVERNED_AGENT_ID = "vv1j1yrAGF0RdxJOSGIJ";

/** The single mint the sentinel performs. Injectable so tests never mint. */
export type SignedUrlMinter = (config: RhodesVoiceConfig, signal: AbortSignal) => Promise<
  | { ok: true; attempts: number; ms: number }
  | { ok: false; category: UpstreamFailureCategory; upstreamStatus?: number; attempts: number; ms: number }
>;

export interface RhodesCheckDeps {
  env: Record<string, string | undefined>;
  fetchImpl: FetchLike;
  mint: SignedUrlMinter;
  now?: () => number;
  checkTimeoutMs?: number;
  requestTimeoutMs?: number;
  canonical?: {
    systemPrompt: string;
    firstMessage: string;
    variables: readonly string[];
    extraVariables: readonly string[];
    clauses: readonly RhodesGovernedClause[];
  };
  governedAgentId?: string;
}

export interface LiveAgent {
  name: string | null;
  prompt: string | null;
  firstMessage: string | null;
  placeholders: string[];
}

/** Whitespace-insensitive comparison: CRLF, trailing spaces and blank-line runs. */
export function normalizePromptText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function placeholdersIn(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)).map((m) => m[1])));
}

export function parseAgent(json: unknown): LiveAgent | null {
  if (!json || typeof json !== "object") return null;
  const j = json as { name?: unknown; conversation_config?: { agent?: { prompt?: { prompt?: unknown }; first_message?: unknown; dynamic_variables?: { dynamic_variable_placeholders?: unknown } } } };
  const agent = j.conversation_config?.agent;
  if (!agent || typeof agent !== "object") return null;
  const prompt = agent.prompt?.prompt;
  const first = agent.first_message;
  const ph = agent.dynamic_variables?.dynamic_variable_placeholders;
  return {
    name: typeof j.name === "string" ? j.name : null,
    prompt: typeof prompt === "string" ? prompt : null,
    firstMessage: typeof first === "string" ? first : null,
    placeholders: ph && typeof ph === "object" ? Object.keys(ph as Record<string, unknown>) : [],
  };
}

export type LiveAgentRead =
  | { ok: true; agent: LiveAgent; ms: number }
  | { ok: false; category: UpstreamFailureCategory | "timeout" | "network" | "malformed_response"; upstreamStatus?: number; ms: number };

/**
 * ONE read of the live agent configuration. Shared by the drift checks and
 * the monitor-only export route. Never logs; the caller decides what (if
 * anything) of the body leaves the process.
 */
export async function readLiveAgent(
  fetchImpl: FetchLike,
  config: RhodesVoiceConfig,
  opts: { timeoutMs?: number; signal?: AbortSignal; now?: () => number } = {},
): Promise<LiveAgentRead> {
  const res = await httpRequest(fetchImpl, {
    url: `${ELEVENLABS_API}/convai/agents/${encodeURIComponent(config.agentId)}`,
    headers: { "xi-api-key": config.apiKey, Accept: "application/json" },
    timeoutMs: opts.timeoutMs ?? THRESHOLDS.requestTimeoutMs,
    signal: opts.signal,
  }, opts.now ?? (() => Date.now()));
  if (!res.ok) return { ok: false, category: res.kind, ms: res.ms };
  if (res.status !== 200) {
    return { ok: false, category: classifyUpstreamStatus(res.status, upstreamToken(res.json)), upstreamStatus: res.status, ms: res.ms };
  }
  const agent = parseAgent(res.json);
  if (!agent) return { ok: false, category: "malformed_response", upstreamStatus: res.status, ms: res.ms };
  return { ok: true, agent, ms: res.ms };
}

export async function runRhodesChecks(deps: RhodesCheckDeps): Promise<BoundaryResult> {
  const now = deps.now ?? (() => Date.now());
  const timeout = deps.checkTimeoutMs ?? THRESHOLDS.checkTimeoutMs;
  const requestTimeout = deps.requestTimeoutMs ?? THRESHOLDS.requestTimeoutMs;
  const started = now();
  const opts = { now, sanitize: sanitizeText };
  const canonical = deps.canonical ?? {
    systemPrompt: RHODES_VOICE_SYSTEM_PROMPT,
    firstMessage: RHODES_VOICE_FIRST_MESSAGE,
    variables: RHODES_VOICE_VARIABLES,
    extraVariables: RHODES_VOICE_EXTRA_VARIABLES,
    clauses: RHODES_VOICE_GOVERNED_CLAUSES,
  };
  const governedAgentId = deps.governedAgentId ?? RHODES_GOVERNED_AGENT_ID;

  const cfg = resolveRhodesVoiceConfig(deps.env);
  const checks: CheckResult[] = [];

  checks.push(
    await runCheck("configuration", timeout, async (): Promise<CheckOutcome> => {
      if (!cfg.ok) {
        return {
          status: "FAIL" as CheckStatus,
          summary: `${cfg.error.variable} ${cfg.error.hint} (${cfg.error.code})`,
          evidence: { code: cfg.error.code, variable: cfg.error.variable },
        };
      }
      const governed = cfg.config.agentId === governedAgentId;
      return {
        status: governed ? ("PASS" as CheckStatus) : ("WARN" as CheckStatus),
        summary: governed
          ? "ElevenLabs key and the governed agent id are configured"
          : "ElevenLabs key configured, but the deployed agent id is not the governed agent",
        evidence: { governedAgent: governed },
      };
    }, opts),
  );

  if (!cfg.ok) {
    for (const id of ["agent_exists", "agent_enabled", "agent_published_main", "system_prompt_drift", "first_message_drift", "dynamic_variables", "signed_url_mint"]) {
      checks.push({ id, status: "NOT_EXERCISED", summary: "skipped: voice configuration invalid" });
    }
    return boundaryResult("rhodes", checks, now() - started);
  }
  const config = cfg.config;
  const headers = { "xi-api-key": config.apiKey, Accept: "application/json" };

  // ── The live agent (one GET, shared by the drift checks). ────────────────
  let live: LiveAgent | null = null;
  checks.push(
    await runCheck("agent_exists", timeout, async (signal): Promise<CheckOutcome> => {
      const read = await readLiveAgent(deps.fetchImpl, config, { timeoutMs: requestTimeout, signal, now });
      if (!read.ok) {
        const refused = read.category !== "timeout" && read.category !== "network" && read.category !== "malformed_response";
        return {
          status: "FAIL",
          summary: refused
            ? `ElevenLabs refused the agent read: ${read.category}`
            : read.category === "malformed_response"
              ? "agent read returned an unrecognised body"
              : `agent read failed: ${read.category}`,
          evidence: { category: read.category, upstreamStatus: read.upstreamStatus ?? null },
        };
      }
      live = read.agent;
      return {
        status: "PASS" as CheckStatus,
        summary: "agent exists and is readable with the deployed key",
        evidence: { hasPrompt: live.prompt !== null, hasFirstMessage: live.firstMessage !== null, declaredPlaceholders: live.placeholders.length },
      };
    }, opts),
  );

  checks.push(
    await runCheck("agent_enabled", timeout, async (signal): Promise<CheckOutcome> => {
      let cursor: string | null = null;
      for (let page = 0; page < 3; page += 1) {
        const url = `${ELEVENLABS_API}/convai/agents?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const res = await httpRequest(deps.fetchImpl, { url, headers, timeoutMs: requestTimeout, signal }, now);
        if (!res.ok) return { status: "FAIL" as CheckStatus, summary: `agent list failed: ${res.kind}`, evidence: { category: res.kind } };
        if (res.status !== 200) {
          const category = classifyUpstreamStatus(res.status, upstreamToken(res.json));
          if (category === "missing_permissions" || category === "forbidden") {
            return { status: "NOT_EXERCISED" as CheckStatus, summary: `key cannot list agents (${category}); archived state not verifiable`, evidence: { category } };
          }
          return { status: "FAIL" as CheckStatus, summary: `agent list refused: ${category}`, evidence: { category, upstreamStatus: res.status } };
        }
        const body = res.json as { agents?: Array<{ agent_id?: unknown; archived?: unknown }>; next_cursor?: unknown; has_more?: unknown } | undefined;
        const agents = Array.isArray(body?.agents) ? body!.agents : [];
        const hit = agents.find((a) => a.agent_id === config.agentId);
        if (hit) {
          const archived = hit.archived === true;
          return {
            status: archived ? ("FAIL" as CheckStatus) : ("PASS" as CheckStatus),
            summary: archived ? "agent is archived" : "agent is enabled (not archived)",
            evidence: { archived },
          };
        }
        cursor = typeof body?.next_cursor === "string" && body.has_more ? body.next_cursor : null;
        if (!cursor) break;
      }
      return { status: "NOT_EXERCISED" as CheckStatus, summary: "agent not present in the first 300 workspace agents; archived state not verified" };
    }, opts),
  );

  checks.push(
    await runCheck("agent_published_main", timeout, async (signal): Promise<CheckOutcome> => {
      const res = await httpRequest(deps.fetchImpl, {
        url: `${ELEVENLABS_API}/convai/agents/${encodeURIComponent(config.agentId)}/branches?include_archived=false&limit=100`,
        headers,
        timeoutMs: requestTimeout,
        signal,
      }, now);
      if (!res.ok) return { status: "FAIL" as CheckStatus, summary: `branch read failed: ${res.kind}`, evidence: { category: res.kind } };
      if (res.status === 404 || res.status === 400 || res.status === 422) {
        return { status: "NOT_EXERCISED" as CheckStatus, summary: "agent versioning is not enabled for this agent; no Main branch to verify", evidence: { upstreamStatus: res.status } };
      }
      if (res.status !== 200) {
        const category = classifyUpstreamStatus(res.status, upstreamToken(res.json));
        if (category === "missing_permissions" || category === "forbidden") {
          return { status: "NOT_EXERCISED" as CheckStatus, summary: `key cannot read branches (${category})`, evidence: { category } };
        }
        return { status: "FAIL" as CheckStatus, summary: `branch read refused: ${category}`, evidence: { category, upstreamStatus: res.status } };
      }
      const results = (res.json as { results?: unknown } | undefined)?.results;
      const branches = Array.isArray(results) ? (results as Array<Record<string, unknown>>) : [];
      const main =
        branches.find((b) => typeof b.name === "string" && b.name.toLowerCase() === "main") ??
        branches.find((b) => b.parent_branch_id === null || b.parent_branch_id === undefined);
      if (!main) {
        return { status: "FAIL" as CheckStatus, summary: "no Main branch found on a versioned agent", evidence: { branches: branches.length } };
      }
      const live = typeof main.current_live_percentage === "number" ? main.current_live_percentage : null;
      const committed = typeof main.last_committed_at === "number" && main.last_committed_at > 0;
      const draft = main.draft_exists === true;
      const evidence: Evidence = { branches: branches.length, mainLivePercentage: live, mainCommitted: committed, unpublishedDraft: draft };
      if (!committed || live === 0) {
        return { status: "FAIL" as CheckStatus, summary: "Main branch has no published version serving traffic", evidence };
      }
      if (draft) return { status: "WARN" as CheckStatus, summary: "Main is published, but an unpublished draft exists on the dashboard", evidence };
      return { status: "PASS" as CheckStatus, summary: `Main branch published and serving ${live ?? 100}% of traffic`, evidence };
    }, opts),
  );

  // ── Drift: system prompt, first message, dynamic variables. ──────────────
  const liveAgent = live as LiveAgent | null;
  if (!liveAgent) {
    for (const id of ["system_prompt_drift", "first_message_drift", "dynamic_variables"]) {
      checks.push({ id, status: "NOT_EXERCISED", summary: "skipped: live agent could not be read" });
    }
  } else {
    checks.push(await runCheck("system_prompt_drift", timeout, () => driftCheck("system_prompt", liveAgent.prompt, canonical.systemPrompt, canonical.clauses), opts));
    checks.push(await runCheck("first_message_drift", timeout, () => driftCheck("first_message", liveAgent.firstMessage, canonical.firstMessage, canonical.clauses), opts));
    checks.push(
      await runCheck("dynamic_variables", timeout, async (): Promise<CheckOutcome> => {
        const referenced = new Set([
          ...placeholdersIn(liveAgent.prompt ?? ""),
          ...placeholdersIn(liveAgent.firstMessage ?? ""),
        ]);
        const supported = new Set<string>([...canonical.variables, ...canonical.extraVariables]);
        const unsupported = Array.from(referenced).filter((v) => !supported.has(v)).sort();
        const unreferenced = canonical.variables.filter((v) => !referenced.has(v));
        const evidence: Evidence = {
          referenced: Array.from(referenced).sort(),
          unsupportedReferences: unsupported,
          governedUnreferenced: unreferenced,
          declaredPlaceholders: liveAgent.placeholders.length,
        };
        if (unsupported.length) {
          return { status: "FAIL" as CheckStatus, summary: `agent references variables the server never sends: ${unsupported.join(", ")} — every conversation would be refused`, evidence };
        }
        if (unreferenced.length) {
          return { status: "FAIL" as CheckStatus, summary: `governed variables no longer referenced by the agent: ${unreferenced.join(", ")}`, evidence };
        }
        return { status: "PASS" as CheckStatus, summary: `all ${canonical.variables.length} governed dynamic variables referenced; nothing unsupported`, evidence };
      }, opts),
    );
  }

  // ── The one mint. ────────────────────────────────────────────────────────
  checks.push(
    await runCheck("signed_url_mint", timeout, async (signal): Promise<CheckOutcome> => {
      const minted = await deps.mint(config, signal);
      if (minted.ok) {
        return {
          status: "PASS" as CheckStatus,
          summary: `signed URL minted and discarded (${minted.attempts} attempt${minted.attempts === 1 ? "" : "s"})`,
          evidence: { attempts: minted.attempts, mintMs: Math.round(minted.ms) },
        };
      }
      return {
        status: "FAIL" as CheckStatus,
        summary: `signed URL mint failed: ${minted.category}`,
        evidence: { category: minted.category, upstreamStatus: minted.upstreamStatus ?? null, attempts: minted.attempts },
      };
    }, opts),
  );

  return boundaryResult("rhodes", checks, now() - started);
}

async function driftCheck(
  field: "system_prompt" | "first_message",
  liveText: string | null,
  canonicalText: string,
  clauses: readonly RhodesGovernedClause[],
): Promise<CheckOutcome> {
  if (liveText === null) {
    return { status: "FAIL", summary: `${field} is empty on the live agent`, evidence: { live: false } };
  }
  const live = normalizePromptText(liveText);
  const canon = normalizePromptText(canonicalText);
  const [liveFingerprint, canonicalFingerprint] = await Promise.all([fingerprint(live), fingerprint(canon)]);
  const relevant = clauses.filter((c) => c.field === field);
  const missingStructural = relevant.filter((c) => c.kind === "structural" && !c.pattern.test(live)).map((c) => c.id);
  const missingBehavioural = relevant.filter((c) => c.kind === "behavioural" && !c.pattern.test(live)).map((c) => c.id);
  const evidence: Evidence = {
    exactMatch: live === canon,
    liveFingerprint,
    canonicalFingerprint,
    liveChars: live.length,
    canonicalChars: canon.length,
    missingStructural,
    missingBehavioural,
    clausesChecked: relevant.length,
  };
  if (missingStructural.length) {
    return { status: "FAIL", summary: `${field} lost governed structure: ${missingStructural.join(", ")}`, evidence };
  }
  if (live === canon) {
    return { status: "PASS", summary: `${field} matches the canonical text exactly`, evidence };
  }
  if (missingBehavioural.length) {
    return { status: "WARN", summary: `${field} drifted and lacks governed clauses: ${missingBehavioural.join(", ")}`, evidence };
  }
  return { status: "WARN", summary: `${field} wording differs from canonical (every governed clause present) — reconcile code or dashboard`, evidence };
}

/** The safe `detail.status` token ElevenLabs puts in error bodies, if any. */
function upstreamToken(json: unknown): string | undefined {
  const detail = json && typeof json === "object" ? (json as { detail?: unknown }).detail : undefined;
  const status = detail && typeof detail === "object" ? (detail as { status?: unknown }).status : undefined;
  return typeof status === "string" && /^[a-z_]{1,48}$/.test(status) ? status : undefined;
}
