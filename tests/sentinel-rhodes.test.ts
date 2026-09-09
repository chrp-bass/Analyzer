/**
 * Boundary 5 — Dr. Rhodes / ElevenLabs, with an injected fetch and minter.
 * No real mint, no WebSocket, no audio. The signed URL never appears in a
 * result; provider messages never propagate.
 */

import { describe, expect, it, vi } from "vitest";
import type { CheckResult } from "@/lib/sentinel/types";
import {
  ELEVENLABS_API,
  normalizePromptText,
  placeholdersIn,
  RHODES_GOVERNED_AGENT_ID,
  runRhodesChecks,
  type SignedUrlMinter,
} from "@/lib/sentinel/checks/rhodes";
import {
  RHODES_VOICE_FIRST_MESSAGE,
  RHODES_VOICE_SYSTEM_PROMPT,
} from "@/lib/rhodes-voice/agent-prompt";
import type { FetchLike } from "@/lib/sentinel/http";
import { hangingFetch, jsonResponse, leaks, SECRETS } from "./support/sentinel-fakes";

const byId = (r: { checks: CheckResult[] }, id: string): CheckResult => r.checks.find((c) => c.id === id)!;

const env = { ELEVENLABS_API_KEY: SECRETS.elevenKey, ELEVENLABS_RHODES_AGENT_ID: RHODES_GOVERNED_AGENT_ID };

interface Live {
  prompt?: string | null;
  firstMessage?: string | null;
  placeholders?: Record<string, string>;
  archived?: boolean;
  branches?: unknown;
  branchesStatus?: number;
  agentStatus?: number;
  agentBody?: unknown;
  listStatus?: number;
  listAgents?: unknown[];
}

function liveFetch(live: Live = {}): FetchLike & { calls: Array<{ url: string; headers: Record<string, string> }> } {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} });
    const agentUrl = `${ELEVENLABS_API}/convai/agents/${RHODES_GOVERNED_AGENT_ID}`;
    if (url === agentUrl) {
      if (live.agentStatus && live.agentStatus !== 200) return jsonResponse(live.agentBody ?? { detail: { status: "invalid_api_key", message: `bad key ${SECRETS.elevenKey}` } }, live.agentStatus);
      if (live.agentBody !== undefined) return jsonResponse(live.agentBody, 200);
      return jsonResponse({
        agent_id: RHODES_GOVERNED_AGENT_ID,
        name: "DR Rhodes",
        conversation_config: {
          agent: {
            first_message: live.firstMessage === undefined ? RHODES_VOICE_FIRST_MESSAGE : live.firstMessage,
            prompt: { prompt: live.prompt === undefined ? RHODES_VOICE_SYSTEM_PROMPT : live.prompt, llm: "gemini-2.0-flash" },
            dynamic_variables: { dynamic_variable_placeholders: live.placeholders ?? { song_title: "", report_context: "" } },
          },
        },
      });
    }
    if (url.startsWith(`${ELEVENLABS_API}/convai/agents?`)) {
      if (live.listStatus && live.listStatus !== 200) return jsonResponse({ detail: { status: "missing_permissions" } }, live.listStatus);
      return jsonResponse({ agents: live.listAgents ?? [{ agent_id: "other", archived: false }, { agent_id: RHODES_GOVERNED_AGENT_ID, archived: live.archived ?? false }], has_more: false, next_cursor: null });
    }
    if (url.startsWith(`${agentUrl}/branches`)) {
      if (live.branchesStatus && live.branchesStatus !== 200) return jsonResponse({ detail: "no" }, live.branchesStatus);
      return jsonResponse(live.branches ?? { results: [{ name: "Main", parent_branch_id: null, current_live_percentage: 100, last_committed_at: 1_757_000_000, draft_exists: false, is_archived: false }], meta: { total: 1 } });
    }
    return jsonResponse({ detail: "unexpected" }, 500);
  }) as FetchLike & { calls: typeof calls };
  f.calls = calls;
  return f;
}

const okMint: SignedUrlMinter = async () => ({ ok: true, attempts: 1, ms: 312 });

describe("runRhodesChecks", () => {
  it("healthy: every check PASS, exactly one mint, the key only ever in a request header, nothing secret in the result", async () => {
    const fetchImpl = liveFetch();
    const mint = vi.fn<SignedUrlMinter>(async () => ({ ok: true, attempts: 1, ms: 312 }));
    const r = await runRhodesChecks({ env, fetchImpl, mint });
    expect(r.boundary).toBe("rhodes");
    expect(r.status).toBe("PASS");
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ["configuration", "PASS"],
      ["agent_exists", "PASS"],
      ["agent_enabled", "PASS"],
      ["agent_published_main", "PASS"],
      ["system_prompt_drift", "PASS"],
      ["first_message_drift", "PASS"],
      ["dynamic_variables", "PASS"],
      ["signed_url_mint", "PASS"],
    ]);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0][0]).toEqual({ apiKey: SECRETS.elevenKey, agentId: RHODES_GOVERNED_AGENT_ID });
    for (const call of fetchImpl.calls) {
      expect(call.headers["xi-api-key"]).toBe(SECRETS.elevenKey);
      expect(call.url).not.toContain(SECRETS.elevenKey);
    }
    const json = JSON.stringify(r);
    expect(leaks(json)).toEqual([]);
    expect(json).not.toContain(RHODES_VOICE_SYSTEM_PROMPT.slice(0, 40)); // no prompt text in evidence
    expect(byId(r, "system_prompt_drift").evidence).toMatchObject({ exactMatch: true, missingStructural: [], missingBehavioural: [] });
    expect(byId(r, "dynamic_variables").evidence).toMatchObject({ referenced: ["epi_mode", "epi_score", "first_signal", "report_context", "song_artist", "song_title"], unsupportedReferences: [], governedUnreferenced: [] });
  });

  it("invalid configuration is FAIL and nothing is fetched or minted", async () => {
    const fetchImpl = liveFetch();
    const mint = vi.fn<SignedUrlMinter>(okMint);
    const r = await runRhodesChecks({ env: { ELEVENLABS_API_KEY: `"${SECRETS.elevenKey}"`, ELEVENLABS_RHODES_AGENT_ID: RHODES_GOVERNED_AGENT_ID }, fetchImpl, mint });
    expect(byId(r, "configuration")).toMatchObject({ status: "FAIL", evidence: { code: "malformed_api_key", variable: "ELEVENLABS_API_KEY" } });
    expect(r.checks.filter((c) => c.status === "NOT_EXERCISED")).toHaveLength(7);
    expect(fetchImpl.calls).toHaveLength(0);
    expect(mint).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain(SECRETS.elevenKey);
  });

  it("a non-governed agent id is WARN, not FAIL", async () => {
    const r = await runRhodesChecks({ env: { ...env, ELEVENLABS_RHODES_AGENT_ID: "someOtherAgentId01" }, fetchImpl: liveFetch(), mint: okMint });
    expect(byId(r, "configuration")).toMatchObject({ status: "WARN", evidence: { governedAgent: false } });
  });

  it("an ElevenLabs refusal is FAIL with the category only; drift checks are then NOT_EXERCISED", async () => {
    const r = await runRhodesChecks({ env, fetchImpl: liveFetch({ agentStatus: 401 }), mint: okMint });
    expect(byId(r, "agent_exists")).toMatchObject({ status: "FAIL", summary: "ElevenLabs refused the agent read: invalid_api_key", evidence: { category: "invalid_api_key", upstreamStatus: 401 } });
    for (const id of ["system_prompt_drift", "first_message_drift", "dynamic_variables"]) expect(byId(r, id).status).toBe("NOT_EXERCISED");
    expect(JSON.stringify(r)).not.toContain("bad key");
    const notFound = await runRhodesChecks({ env, fetchImpl: liveFetch({ agentStatus: 404, agentBody: {} }), mint: okMint });
    expect(byId(notFound, "agent_exists").evidence).toMatchObject({ category: "agent_not_found" });
  });

  it("a malformed agent body is FAIL malformed_response", async () => {
    const r = await runRhodesChecks({ env, fetchImpl: liveFetch({ agentBody: { agent_id: "x" } }), mint: okMint });
    expect(byId(r, "agent_exists")).toMatchObject({ status: "FAIL", evidence: { category: "malformed_response" } });
  });

  it("a hanging provider times out into FAIL and does not stall the boundary", async () => {
    const r = await runRhodesChecks({ env, fetchImpl: hangingFetch, mint: okMint, requestTimeoutMs: 15, checkTimeoutMs: 200 });
    expect(byId(r, "agent_exists")).toMatchObject({ status: "FAIL", summary: "agent read failed: timeout" });
    expect(byId(r, "agent_enabled").summary).toContain("timeout");
    expect(byId(r, "signed_url_mint").status).toBe("PASS");
  });

  it("archived agent is FAIL; agent not listed is NOT_EXERCISED; list forbidden is NOT_EXERCISED", async () => {
    expect(byId(await runRhodesChecks({ env, fetchImpl: liveFetch({ archived: true }), mint: okMint }), "agent_enabled")).toMatchObject({ status: "FAIL", evidence: { archived: true } });
    expect(byId(await runRhodesChecks({ env, fetchImpl: liveFetch({ listAgents: [] }), mint: okMint }), "agent_enabled").status).toBe("NOT_EXERCISED");
    expect(byId(await runRhodesChecks({ env, fetchImpl: liveFetch({ listStatus: 401 }), mint: okMint }), "agent_enabled").status).toBe("NOT_EXERCISED");
  });

  it("Main branch: unpublished draft is WARN; no live traffic is FAIL; versioning absent is NOT_EXERCISED", async () => {
    const draft = await runRhodesChecks({ env, fetchImpl: liveFetch({ branches: { results: [{ name: "Main", current_live_percentage: 100, last_committed_at: 5, draft_exists: true }] } }), mint: okMint });
    expect(byId(draft, "agent_published_main")).toMatchObject({ status: "WARN", evidence: { unpublishedDraft: true } });
    const dark = await runRhodesChecks({ env, fetchImpl: liveFetch({ branches: { results: [{ name: "Main", current_live_percentage: 0, last_committed_at: 5, draft_exists: false }] } }), mint: okMint });
    expect(byId(dark, "agent_published_main").status).toBe("FAIL");
    const none = await runRhodesChecks({ env, fetchImpl: liveFetch({ branchesStatus: 404 }), mint: okMint });
    expect(byId(none, "agent_published_main").status).toBe("NOT_EXERCISED");
    const noMain = await runRhodesChecks({ env, fetchImpl: liveFetch({ branches: { results: [{ name: "experiment", parent_branch_id: "b1", current_live_percentage: 100, last_committed_at: 5 }] } }), mint: okMint });
    expect(byId(noMain, "agent_published_main").status).toBe("FAIL");
  });

  it("reworded prompt with every governed clause present is WARN (text differs) with fingerprints, never the text", async () => {
    const reworded = `${RHODES_VOICE_SYSTEM_PROMPT}\n- Keep your tone warm and unhurried.`;
    const r = await runRhodesChecks({ env, fetchImpl: liveFetch({ prompt: reworded }), mint: okMint });
    const drift = byId(r, "system_prompt_drift");
    expect(drift.status).toBe("WARN");
    expect(drift.summary).toContain("wording differs");
    expect(drift.evidence).toMatchObject({ exactMatch: false, missingStructural: [], missingBehavioural: [] });
    expect(drift.evidence?.liveFingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(drift.evidence?.liveFingerprint).not.toBe(drift.evidence?.canonicalFingerprint);
    expect(JSON.stringify(r)).not.toContain("warm and unhurried");
    expect(r.status).toBe("WARN");
  });

  it("whitespace-only differences (CRLF, trailing spaces) are still an exact match", async () => {
    const r = await runRhodesChecks({ env, fetchImpl: liveFetch({ prompt: `${RHODES_VOICE_SYSTEM_PROMPT.replace(/\n/g, "  \r\n")}\n\n\n` }), mint: okMint });
    expect(byId(r, "system_prompt_drift").status).toBe("PASS");
    expect(normalizePromptText("a  \r\nb\n\n\n\nc\n")).toBe("a\nb\n\nc");
  });

  it("a prompt that lost the conversational lead is WARN naming the behavioural clauses", async () => {
    const without = RHODES_VOICE_SYSTEM_PROMPT.replace(/\n\nHOW TO LEAD[\s\S]*$/, "");
    const r = await runRhodesChecks({ env, fetchImpl: liveFetch({ prompt: without }), mint: okMint });
    expect(byId(r, "system_prompt_drift")).toMatchObject({
      status: "WARN",
      // "one tailored reflective question" survives in HOW TO ANSWER, so only these three vanish.
      evidence: { missingBehavioural: ["conversational_lead_sequence", "no_generic_follow_ups", "no_outcome_promises"] },
    });
  });

  it("a prompt that lost the report binding is FAIL (structural)", async () => {
    const r = await runRhodesChecks({ env, fetchImpl: liveFetch({ prompt: RHODES_VOICE_SYSTEM_PROMPT.replace("{{report_context}}", "(the report)") }), mint: okMint });
    expect(byId(r, "system_prompt_drift")).toMatchObject({ status: "FAIL", evidence: { missingStructural: ["report_context_bound"] } });
    // report_context is now unreferenced → the variables contract is broken too.
    expect(byId(r, "dynamic_variables")).toMatchObject({ status: "FAIL", evidence: { governedUnreferenced: ["report_context"] } });
    expect(r.status).toBe("FAIL");
  });

  it("an empty live prompt or first message is FAIL", async () => {
    const r = await runRhodesChecks({ env, fetchImpl: liveFetch({ prompt: null, firstMessage: "" }), mint: okMint });
    expect(byId(r, "system_prompt_drift").status).toBe("FAIL");
    expect(byId(r, "first_message_drift").status).toBe("FAIL");
  });

  it("first message drift: rewording is WARN, dropping the signal is FAIL", async () => {
    const reworded = await runRhodesChecks({ env, fetchImpl: liveFetch({ firstMessage: 'Hello, I\'m Dr. Rhodes. In "{{song_title}}" Chirp found: {{first_signal}}' }), mint: okMint });
    expect(byId(reworded, "first_message_drift").status).toBe("WARN");
    const broken = await runRhodesChecks({ env, fetchImpl: liveFetch({ firstMessage: "Hi, I'm Dr. Rhodes. Ask me anything." }), mint: okMint });
    expect(byId(broken, "first_message_drift")).toMatchObject({ status: "FAIL", evidence: { missingStructural: ["first_message_signal"] } });
  });

  it("a placeholder the server never sends is FAIL; convenience score variables are tolerated", async () => {
    const bad = await runRhodesChecks({ env, fetchImpl: liveFetch({ prompt: `${RHODES_VOICE_SYSTEM_PROMPT}\nListener: {{listener_name}}` }), mint: okMint });
    expect(byId(bad, "dynamic_variables")).toMatchObject({ status: "FAIL", evidence: { unsupportedReferences: ["listener_name"] } });
    const ok = await runRhodesChecks({ env, fetchImpl: liveFetch({ prompt: `${RHODES_VOICE_SYSTEM_PROMPT}\nFocus: {{focus_score}}` }), mint: okMint });
    expect(byId(ok, "dynamic_variables").status).toBe("PASS");
    expect(placeholdersIn("{{ a }} {{b}} {{a}} {{9x}}")).toEqual(["a", "b"]);
  });

  it("a failed mint is FAIL with the category and upstream status only", async () => {
    const mint: SignedUrlMinter = async () => ({ ok: false, category: "missing_permissions", upstreamStatus: 401, attempts: 1, ms: 200 });
    const r = await runRhodesChecks({ env, fetchImpl: liveFetch(), mint });
    expect(byId(r, "signed_url_mint")).toMatchObject({ status: "FAIL", summary: "signed URL mint failed: missing_permissions", evidence: { category: "missing_permissions", upstreamStatus: 401 } });
    const transient: SignedUrlMinter = async () => ({ ok: false, category: "upstream_unavailable", upstreamStatus: 503, attempts: 3, ms: 9000 });
    expect(byId(await runRhodesChecks({ env, fetchImpl: liveFetch(), mint: transient }), "signed_url_mint").evidence).toMatchObject({ attempts: 3 });
  });

  it("a minter that returns a URL by mistake still cannot leak it: the check only keeps counts", async () => {
    const leaky = (async () => ({ ok: true, attempts: 1, ms: 5, signedUrl: SECRETS.signedUrl })) as unknown as SignedUrlMinter;
    const r = await runRhodesChecks({ env, fetchImpl: liveFetch(), mint: leaky });
    expect(JSON.stringify(r)).not.toContain("wss://");
    expect(byId(r, "signed_url_mint").evidence).toEqual({ attempts: 1, mintMs: 5 });
  });
});
