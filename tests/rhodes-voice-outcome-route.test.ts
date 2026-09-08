/**
 * POST /api/rhodes/session/outcome — write-only browser telemetry.
 *
 *   - gated by the same entitlement check as the report; denied → 403, no log
 *   - only the enumerated events and the closed field set are accepted
 *   - every value is re-validated, so free text / URLs / keys never reach a
 *     log line; unknown fields are dropped
 *   - contacts no upstream, returns 204 with no body
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/lib/commerce/entitlements", () => ({
  assertReportAccess: vi.fn(),
}));

import { assertReportAccess } from "@/lib/commerce/entitlements";
import { POST } from "@/app/api/rhodes/session/outcome/route";

const accessMock = vi.mocked(assertReportAccess);
let logs: string[];
let fetchSpy: ReturnType<typeof vi.fn>;

function req(body: unknown): Request {
  return new Request("http://test.local/api/rhodes/session/outcome", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  accessMock.mockReset();
  logs = [];
  for (const m of ["log", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(" "));
    });
  }
  fetchSpy = vi.fn();
  vi.spyOn(globalThis, "fetch").mockImplementation(fetchSpy as unknown as typeof fetch);
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/rhodes/session/outcome", () => {
  it("denied callers get 403 and nothing is logged", async () => {
    accessMock.mockResolvedValueOnce({ ok: false, reason: "no_identity" });
    const res = await POST(req({ scanId: "scn_x", event: "websocket-closed", closeCode: 1008 }));
    expect(res.status).toBe(403);
    expect(logs.join("\n")).not.toContain("[rhodes-voice]");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies and unknown events before the entitlement check", async () => {
    expect((await POST(req("nope{"))).status).toBe(400);
    expect((await POST(req({ scanId: "scn_x" }))).status).toBe(400);
    expect((await POST(req({ scanId: "scn_x", event: "configuration-valid" }))).status).toBe(400);
    expect((await POST(req({ event: "websocket-closed" }))).status).toBe(400);
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("logs an entitled browser event with only the allow-listed, re-validated fields", async () => {
    accessMock.mockResolvedValueOnce({ ok: true, entitlement: {} as never, trackKey: "t" });
    const res = await POST(
      req({
        scanId: "scn_x",
        event: "provider-failure",
        requestId: "fc27f8bd57a145f4",
        conversationId: "conv_01abc",
        closeCode: 1008,
        category: "override_rejected",
        ms: 412,
        result: "close",
        // Hostile / stray fields must be dropped or redacted:
        signedUrl: "wss://api.elevenlabs.io/leak?sig=abc",
        reason: "Override for first_message is not allowed",
        apiKey: "sk_leak_0123456789",
        attempt: 99, // out of range → dropped
      }),
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    const line = logs.find((l) => l.includes("[rhodes-voice]"));
    expect(line).toBe(
      "[rhodes-voice] event=provider-failure request_id=fc27f8bd57a145f4 stage=browser ms=412 category=override_rejected result=close conversation_id=conv_01abc close_code=1008",
    );
    expect(logs.join("\n")).not.toMatch(/wss:|sk_leak|first_message is not allowed/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("free-text values in allow-listed fields are redacted, never printed", async () => {
    accessMock.mockResolvedValueOnce({ ok: true, entitlement: {} as never, trackKey: "t" });
    await POST(req({ scanId: "scn_x", event: "websocket-failed", category: "wss://leak", result: "has spaces here" }));
    const line = logs.find((l) => l.includes("[rhodes-voice]"))!;
    expect(line).toBe("[rhodes-voice] event=websocket-failed stage=browser");
  });

  it("imports nothing but the entitlement gate and the logger", () => {
    const src = readFileSync("src/app/api/rhodes/session/outcome/route.ts", "utf8");
    const imports = Array.from(src.matchAll(/from\s+["']([^"']+)["']/g)).map((m) => m[1]).sort();
    expect(imports).toEqual(["@/lib/commerce/entitlements", "@/lib/rhodes-voice/log", "next/server"]);
    expect(src).not.toMatch(/elevenlabs|signed-url|resolve\.server|prepare|stripe/i);
  });
});
