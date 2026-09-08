/**
 * `[rhodes-voice]` logging is a closed schema. Only enumerated fields, only
 * short safe tokens — a signed URL, an API key, a report sentence or a
 * customer identifier can never reach a log line even by mistake.
 */

import { describe, expect, it } from "vitest";
import {
  createRhodesVoiceLogger,
  formatRhodesVoiceLog,
  newRhodesRequestId,
} from "@/lib/rhodes-voice/log";

describe("formatRhodesVoiceLog", () => {
  it("emits one structured line with only the allowed fields", () => {
    const line = formatRhodesVoiceLog("signed-url-failed", {
      requestId: "abc123",
      stage: "mint",
      ms: 412.6,
      upstreamStatus: 401,
      category: "invalid_api_key",
      attempt: 1,
    });
    expect(line).toBe(
      "[rhodes-voice] event=signed-url-failed request_id=abc123 stage=mint ms=413 upstream_status=401 category=invalid_api_key attempt=1",
    );
  });

  it("redacts any value that is not a short safe token (URLs, keys, prose, emails)", () => {
    const secrets = [
      "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=x&conversation_signature=SIG",
      "sk_0123456789abcdef0123456789abcdef!",
      "Safe holds its posture with quiet confidence.",
      "someone@example.com",
      "xi-api-key: sk_live",
    ];
    for (const s of secrets) {
      const line = formatRhodesVoiceLog("websocket-failed", {
        requestId: s,
        stage: s,
        category: s,
        result: s,
        code: s,
        variable: s,
      });
      expect(line).not.toContain(s);
      expect(line).not.toContain("wss://");
      expect(line).not.toContain("sk_0123");
      expect(line).not.toContain("@");
      expect(line).toContain("redacted");
    }
  });

  it("ignores unknown fields entirely", () => {
    const line = formatRhodesVoiceLog("session-started", {
      requestId: "r1",
      // @ts-expect-error — unknown keys must be dropped, not printed
      signedUrl: "wss://leak.example",
      apiKey: "sk_leak",
    });
    expect(line).toBe("[rhodes-voice] event=session-started request_id=r1");
  });

  it("routes failures to error, degradation to warn, lifecycle to log", () => {
    const seen: Array<[string, string]> = [];
    const log = createRhodesVoiceLogger((line, level) => seen.push([level, line]));
    log("signed-url-failed", { requestId: "r" });
    log("graceful-degradation", { requestId: "r" });
    log("websocket-open", { requestId: "r" });
    expect(seen.map(([l]) => l)).toEqual(["error", "warn", "log"]);
  });

  it("request ids are short, opaque and safe to log", () => {
    const id = newRhodesRequestId();
    expect(id).toMatch(/^[A-Za-z0-9]{8,32}$/);
    expect(newRhodesRequestId()).not.toBe(id);
  });
});
