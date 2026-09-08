/**
 * The voice route with the REAL signed-URL facade and REAL ElevenLabs client
 * — only the entitlement resolver is stubbed and `fetch` is spied. This pins
 * the order of the gate end-to-end:
 *
 *   entitlement failure        → zero calls to ElevenLabs
 *   incomplete persisted report → zero calls to ElevenLabs
 *   configuration drift        → typed 503, zero calls to ElevenLabs
 *   entitled + configured      → exactly one GET to the official endpoint
 *
 * and that the API key never reaches the response or a log line.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/reports/resolve.server", () => ({
  resolveEntitledReport: vi.fn(),
}));

import { resolveEntitledReport } from "@/lib/reports/resolve.server";
import { POST } from "@/app/api/rhodes/session/route";

const resolveMock = vi.mocked(resolveEntitledReport);
const KEY = "sk_boundary_test_key_0123456789abcdef";
const AGENT = "vv1j1yrAGF0RdxJOSGIJ";

function req(scanId: string): Request {
  return new Request("http://test.local/api/rhodes/session", {
    method: "POST",
    body: JSON.stringify({ scanId }),
    headers: { "Content-Type": "application/json" },
  });
}

function goodReport() {
  return {
    ok: true as const,
    source: "generated" as const,
    report: {
      report_meta: { id: "R-1", version: "v2", scanned_at: "", scanned_at_display: "" },
      track: { title: "Safe", artist: "The Brevet", isrc: "USTEST00001" },
      epi: { score: 62, mode: "Flow" as const, rank_in_mode: "", rank_overall: "" },
      chrp_scores: [],
      hpv: [],
      creator: { name: "The Brevet", tracks_scored: 1, tease: "" },
      free_statement: "",
      signature: "A settled architecture.",
      rhodes: "Safe holds its posture with quiet confidence.",
      placements: [],
      throughline: "",
      where_this_music_lives: { verticals: [], confidence: null, n_briefs: null, sample_brief: null },
    },
  };
}

const env = { key: process.env.ELEVENLABS_API_KEY, agent: process.env.ELEVENLABS_RHODES_AGENT_ID };
let fetchSpy: ReturnType<typeof vi.fn>;
let logs: string[];

beforeEach(() => {
  resolveMock.mockReset();
  logs = [];
  for (const m of ["log", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
  fetchSpy = vi.fn(async () => {
    return new Response(JSON.stringify({ signed_url: "wss://api.elevenlabs.io/t/boundary-sig" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(fetchSpy as unknown as typeof fetch);
  process.env.ELEVENLABS_API_KEY = KEY;
  process.env.ELEVENLABS_RHODES_AGENT_ID = AGENT;
});
afterEach(() => {
  vi.restoreAllMocks();
  if (env.key === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = env.key;
  if (env.agent === undefined) delete process.env.ELEVENLABS_RHODES_AGENT_ID;
  else process.env.ELEVENLABS_RHODES_AGENT_ID = env.agent;
});

describe("POST /api/rhodes/session — real facade, real client", () => {
  it("entitlement failure makes ZERO ElevenLabs calls", async () => {
    resolveMock.mockResolvedValueOnce({ ok: false, status: 403, error: "forbidden", entitled: false });
    const res = await POST(req("scn_not_mine"));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logs.join("\n")).not.toContain("[rhodes-voice]");
  });

  it("an entitled caller whose report is not yet persisted gets the honest 503 — ZERO ElevenLabs calls", async () => {
    resolveMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error: "report_unavailable",
      entitled: true,
      detail: "your report is being prepared; your purchase is safe and access is retained",
    });
    const res = await POST(req("scn_mine"));
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined, "missing_agent_id"],
    ["quoted", `"${AGENT}"`, "malformed_agent_id"],
    ["whitespace-only", "   ", "missing_agent_id"],
    ["malformed", "not a valid id!", "malformed_agent_id"],
  ])("agent-id drift (%s) is a typed 503 with an actionable log — ZERO ElevenLabs calls", async (_l, value, code) => {
    if (value === undefined) delete process.env.ELEVENLABS_RHODES_AGENT_ID;
    else process.env.ELEVENLABS_RHODES_AGENT_ID = value;
    resolveMock.mockResolvedValueOnce(goodReport());
    const res = await POST(req("scn_mine"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "voice_unavailable", retryable: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    const line = logs.find((l) => l.includes("event=configuration-invalid"));
    expect(line).toBeDefined();
    expect(line).toContain(`code=${code}`);
    expect(line).toContain("variable=ELEVENLABS_RHODES_AGENT_ID");
    expect(logs.join("\n")).not.toContain(KEY);
  });

  it("a quoted API key is a typed 503 — never sent upstream", async () => {
    process.env.ELEVENLABS_API_KEY = `'${KEY}'`;
    resolveMock.mockResolvedValueOnce(goodReport());
    const res = await POST(req("scn_mine"));
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    const line = logs.find((l) => l.includes("event=configuration-invalid"));
    expect(line).toContain("code=malformed_api_key");
    expect(line).toContain("variable=ELEVENLABS_API_KEY");
    expect(logs.join("\n")).not.toContain(KEY);
  });

  it("entitled + configured → exactly one GET to the official endpoint, key in header only", async () => {
    process.env.ELEVENLABS_API_KEY = `  ${KEY}\n`; // trimmed before use
    resolveMock.mockResolvedValueOnce(goodReport());
    const res = await POST(req("scn_mine"));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT}`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);

    const raw = await res.text();
    expect(raw).not.toContain(KEY);
    expect(raw).toContain("wss://api.elevenlabs.io/t/boundary-sig"); // once, to the entitled caller
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");

    // Logs: full sanitised lifecycle, no key, no signed URL.
    const joined = logs.join("\n");
    expect(joined).toContain("event=configuration-valid");
    expect(joined).toContain("event=signed-url-requested");
    expect(joined).toContain("event=signed-url-succeeded");
    expect(joined).toContain("event=session-started");
    expect(joined).not.toContain(KEY);
    expect(joined).not.toContain("wss://");
    expect(joined).not.toContain("boundary-sig");
    // Every line carries the same request id, which the response also exposes.
    const rid = res.headers.get("X-Rhodes-Request-Id")!;
    for (const l of joined.split("\n").filter((l) => l.includes("[rhodes-voice]"))) {
      expect(l).toContain(`request_id=${rid}`);
    }
  });

  it("an upstream 401 (invalid key) is classified in the log, not retried, and is a non-retryable 502", async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            detail: {
              type: "authentication_error",
              code: "unauthorized",
              message: "Invalid API key",
              status: "invalid_api_key",
              request_id: "c513288402639ad671fc3f9e27712098",
            },
          }),
          { status: 401 },
        ),
    );
    resolveMock.mockResolvedValueOnce(goodReport());
    const res = await POST(req("scn_mine"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "voice_unavailable", retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const joined = logs.join("\n");
    expect(joined).toMatch(/event=signed-url-failed .*upstream_status=401 category=invalid_api_key attempt=1/);
    expect(joined).toMatch(/event=graceful-degradation .*category=invalid_api_key/);
    expect(joined).not.toContain("Invalid API key");
    expect(joined).not.toContain(KEY);
  });
});
