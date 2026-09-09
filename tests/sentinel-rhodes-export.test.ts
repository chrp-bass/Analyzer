/**
 * GET /api/health/rhodes-agent — the monitor-only export of the live agent
 * text. Same authorisation as the sentinel; exact text out; nothing logged;
 * provider failures reduced to a category.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { exportRhodesAgent } from "@/lib/sentinel/rhodes-agent-export";
import { RHODES_GOVERNED_AGENT_ID } from "@/lib/sentinel/checks/rhodes";
import type { FetchLike } from "@/lib/sentinel/http";
import { hangingFetch, jsonResponse, SECRETS } from "./support/sentinel-fakes";

const env = { ELEVENLABS_API_KEY: SECRETS.elevenKey, ELEVENLABS_RHODES_AGENT_ID: RHODES_GOVERNED_AGENT_ID };
const LIVE_PROMPT = "You are Dr. Rhodes.\n<<<REPORT\n{{report_context}}\nREPORT>>>\nLead: reveal → interpret. `backticks` and ${dollar} survive.";
const LIVE_FIRST = 'I\'m Dr. Rhodes. In "{{song_title}}": {{first_signal}}';

function agentFetch(status = 200, body?: unknown): FetchLike & { calls: Array<{ url: string; headers: Record<string, string> }> } {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} });
    if (status !== 200) return jsonResponse(body ?? { detail: { status: "missing_permissions", message: `no ${SECRETS.elevenKey}` } }, status);
    return jsonResponse(
      body ?? {
        agent_id: RHODES_GOVERNED_AGENT_ID,
        name: "DR Rhodes",
        conversation_config: {
          agent: {
            first_message: LIVE_FIRST,
            prompt: { prompt: LIVE_PROMPT, llm: "gemini-2.0-flash" },
            dynamic_variables: { dynamic_variable_placeholders: { song_title: "x", report_context: "y", epi_mode: "" } },
          },
        },
      },
    );
  }) as FetchLike & { calls: typeof calls };
  f.calls = calls;
  return f;
}

describe("exportRhodesAgent", () => {
  it("returns the exact live text, placeholder names and agent id — unsanitised, byte-for-byte", async () => {
    const fetchImpl = agentFetch();
    const r = await exportRhodesAgent(env, fetchImpl, () => Date.parse("2026-09-09T00:00:00Z"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toEqual({
      schemaVersion: 1,
      kind: "rhodes-agent-export",
      fetchedAt: "2026-09-09T00:00:00.000Z",
      agentId: RHODES_GOVERNED_AGENT_ID,
      name: "DR Rhodes",
      systemPrompt: LIVE_PROMPT,
      firstMessage: LIVE_FIRST,
      placeholders: ["epi_mode", "report_context", "song_title"],
    });
    // One GET, key only in the header, never in the URL or the body.
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0].headers["xi-api-key"]).toBe(SECRETS.elevenKey);
    expect(JSON.stringify(r.body)).not.toContain(SECRETS.elevenKey);
  });

  it("invalid configuration is 503 with code and variable only", async () => {
    const r = await exportRhodesAgent({ ELEVENLABS_RHODES_AGENT_ID: RHODES_GOVERNED_AGENT_ID }, agentFetch());
    expect(r).toEqual({ ok: false, status: 503, body: { error: "voice_not_configured", code: "missing_api_key", variable: "ELEVENLABS_API_KEY" } });
  });

  it("a provider refusal, a malformed body, a timeout are 502 with a category and no message", async () => {
    const refused = await exportRhodesAgent(env, agentFetch(401));
    expect(refused).toEqual({ ok: false, status: 502, body: { error: "agent_unavailable", category: "missing_permissions", upstreamStatus: 401 } });
    expect(JSON.stringify(refused)).not.toContain(SECRETS.elevenKey);
    const malformed = await exportRhodesAgent(env, agentFetch(200, { agent_id: "x" }));
    expect(malformed.body).toMatchObject({ error: "agent_unavailable", category: "malformed_response" });
    const timedOut = await exportRhodesAgent(env, hangingFetch, () => Date.now());
    expect(timedOut.body).toMatchObject({ error: "agent_unavailable", category: "timeout" });
  }, 20_000);
});

vi.mock("@/lib/sentinel/rhodes-agent-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sentinel/rhodes-agent-export")>();
  return { ...actual, exportRhodesAgent: vi.fn(actual.exportRhodesAgent) };
});

import { GET } from "@/app/api/health/rhodes-agent/route";

const ORIGINAL = process.env.HEALTH_MONITOR_SECRET;

describe("GET /api/health/rhodes-agent", () => {
  const req = (auth?: string) => new Request("https://scan.chrp.ai/api/health/rhodes-agent", { headers: auth ? { Authorization: auth } : {} });
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];

  beforeEach(() => {
    process.env.HEALTH_MONITOR_SECRET = SECRETS.monitor;
    vi.mocked(exportRhodesAgent).mockClear();
    for (const level of ["log", "warn", "error", "info", "debug"] as const) spies.push(vi.spyOn(console, level));
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.HEALTH_MONITOR_SECRET;
    else process.env.HEALTH_MONITOR_SECRET = ORIGINAL;
    for (const s of spies.splice(0)) s.mockRestore();
  });

  it("refuses a missing or wrong secret with the opaque 403 and never contacts ElevenLabs", async () => {
    for (const r of [req(), req("Bearer nope"), req(`Bearer ${SECRETS.monitor}x`)]) {
      const res = await GET(r);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    }
    expect(exportRhodesAgent).not.toHaveBeenCalled();
  });

  it("answers 503 when the monitor surface is not configured", async () => {
    delete process.env.HEALTH_MONITOR_SECRET;
    const res = await GET(req(`Bearer ${SECRETS.monitor}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "health_not_configured" });
  });

  it("passes the export result through with no-store and logs nothing", async () => {
    vi.mocked(exportRhodesAgent).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { schemaVersion: 1, kind: "rhodes-agent-export", fetchedAt: "t", agentId: "a", name: null, systemPrompt: LIVE_PROMPT, firstMessage: LIVE_FIRST, placeholders: [] },
    });
    const res = await GET(req(`Bearer ${SECRETS.monitor}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await res.json()).systemPrompt).toBe(LIVE_PROMPT);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

describe("export workflow contract", () => {
  const workflow = readFileSync(".github/workflows/rhodes-agent-export.yml", "utf8");

  it("is manual, read-only, uses only the monitor secret, never prints the text and keeps the artifact one day", () => {
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).not.toMatch(/schedule:|deployment_status:|push:|pull_request:/);
    expect(new Set(Array.from(workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)).map((m) => m[1]))).toEqual(new Set(["HEALTH_MONITOR_SECRET"]));
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(workflow).toMatch(/\/api\/health\/rhodes-agent/);
    expect(workflow).toMatch(/--output export\/rhodes-agent\.json/);
    expect(workflow).not.toMatch(/cat export|echo .*systemPrompt/);
    expect(workflow).toMatch(/retention-days: 1\b/);
  });
});
