/**
 * The typed server-side ElevenLabs client. Pins the official contract and the
 * retry / timeout / classification policy:
 *
 *   - GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url
 *     ?agent_id=…  with header xi-api-key (server-only)
 *   - 400/401/403/404/422 are classified and NEVER retried
 *   - 408/429/5xx/network/timeout retry with bounded, jittered backoff and a
 *     strict total deadline
 *   - a per-attempt timeout aborts the in-flight fetch cleanly
 *   - the key and the signed URL never appear in logs; the upstream body
 *     never propagates (only its safe `status` token is used)
 */

import { describe, expect, it, vi } from "vitest";
import {
  mintSignedUrl,
  classifyUpstreamStatus,
  isRetryableCategory,
  SIGNED_URL_ENDPOINT,
} from "@/lib/rhodes-voice/elevenlabs";
import type { RhodesVoiceLogger, RhodesVoiceEvent, RhodesVoiceLogFields } from "@/lib/rhodes-voice/log";

const config = Object.freeze({
  apiKey: "sk_test_key_do_not_leak_0123456789",
  agentId: "vv1j1yrAGF0RdxJOSGIJ",
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function elevenError(status: number, token: string, requestId = "c513288402639ad671fc3f9e27712098") {
  return json(
    {
      detail: {
        type: "authentication_error",
        code: "unauthorized",
        message: "Invalid API key — SECRET-ISH MESSAGE that must not propagate",
        status: token,
        request_id: requestId,
      },
    },
    status,
  );
}

function recorder() {
  const events: Array<{ event: RhodesVoiceEvent; fields: RhodesVoiceLogFields }> = [];
  const log: RhodesVoiceLogger = (event, fields = {}) => events.push({ event, fields });
  return { events, log };
}

/** Fast, deterministic test harness: no real sleeping, no jitter surprises. */
function harness(fetchImpl: unknown, extra: Partial<Parameters<typeof mintSignedUrl>[0]> = {}) {
  const sleeps: number[] = [];
  let clock = 0;
  const { events, log } = recorder();
  const run = () =>
    mintSignedUrl({
      config,
      requestId: "req1",
      fetchImpl: fetchImpl as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      random: () => 1, // full backoff (deterministic upper bound)
      now: () => clock,
      log,
      timeoutMs: 1000,
      deadlineMs: 10_000,
      maxAttempts: 3,
      baseBackoffMs: 100,
      maxBackoffMs: 400,
      ...extra,
    });
  return { run, sleeps, events, tick: (ms: number) => (clock += ms) };
}

describe("official contract", () => {
  it("GET the hyphenated signed-URL endpoint with agent_id in the query and xi-api-key in a header", async () => {
    const fetchImpl = vi.fn(async () => json({ signed_url: "wss://api.elevenlabs.io/t/1" }));
    const { run } = harness(fetchImpl);
    const r = await run();
    expect(r.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(SIGNED_URL_ENDPOINT).toBe("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url");
    expect(url).toBe(`${SIGNED_URL_ENDPOINT}?agent_id=vv1j1yrAGF0RdxJOSGIJ`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(config.apiKey);
    expect(url).not.toContain(config.apiKey);
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("URL-encodes the agent id", async () => {
    const fetchImpl = vi.fn(async () => json({ signed_url: "wss://x" }));
    await mintSignedUrl({
      config: { apiKey: config.apiKey, agentId: "a b&c" },
      requestId: "r",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: () => {},
    });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url.endsWith("?agent_id=a%20b%26c")).toBe(true);
  });
});

describe("classification", () => {
  it("maps the upstream status token on 401 to a precise category", () => {
    expect(classifyUpstreamStatus(401, "invalid_api_key")).toBe("invalid_api_key");
    expect(classifyUpstreamStatus(401, "needs_authorization")).toBe("needs_authorization");
    expect(classifyUpstreamStatus(401, "missing_permissions")).toBe("missing_permissions");
    expect(classifyUpstreamStatus(401, undefined)).toBe("unauthorized");
    expect(classifyUpstreamStatus(403, undefined)).toBe("forbidden");
    expect(classifyUpstreamStatus(403, "missing_permissions")).toBe("missing_permissions");
    expect(classifyUpstreamStatus(404)).toBe("agent_not_found");
    expect(classifyUpstreamStatus(400)).toBe("invalid_request");
    expect(classifyUpstreamStatus(422)).toBe("invalid_request");
    expect(classifyUpstreamStatus(408)).toBe("timeout");
    expect(classifyUpstreamStatus(429)).toBe("rate_limited");
    expect(classifyUpstreamStatus(500)).toBe("upstream_unavailable");
    expect(classifyUpstreamStatus(503)).toBe("upstream_unavailable");
    expect(classifyUpstreamStatus(418)).toBe("client_error");
  });

  it("only transient categories are retryable", () => {
    for (const c of ["rate_limited", "upstream_unavailable", "timeout", "network"] as const) {
      expect(isRetryableCategory(c)).toBe(true);
    }
    for (const c of [
      "invalid_api_key",
      "needs_authorization",
      "missing_permissions",
      "unauthorized",
      "forbidden",
      "agent_not_found",
      "invalid_request",
      "client_error",
      "malformed_response",
    ] as const) {
      expect(isRetryableCategory(c)).toBe(false);
    }
  });
});

describe("non-retryable failures", () => {
  it.each([
    [401, "invalid_api_key", "invalid_api_key"],
    [401, "missing_permissions", "missing_permissions"],
    [403, "forbidden_x", "forbidden"],
    [404, "not_found", "agent_not_found"],
    [422, "invalid", "invalid_request"],
    [400, "bad", "invalid_request"],
  ])("%i (%s) is classified as %s, called ONCE, never retried", async (status, token, category) => {
    const fetchImpl = vi.fn(async () => elevenError(status, token));
    const { run, sleeps, events } = harness(fetchImpl);
    const r = await run();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.category).toBe(category);
      expect(r.retryable).toBe(false);
      expect(r.upstreamStatus).toBe(status);
      expect(r.attempts).toBe(1);
      expect(r.upstreamRequestId).toBe("c513288402639ad671fc3f9e27712098");
    }
    // The upstream message body never propagates into the result or the logs.
    const all = JSON.stringify(r) + JSON.stringify(events);
    expect(all).not.toContain("SECRET-ISH");
    expect(all).not.toContain(config.apiKey);
    expect(events.map((e) => e.event)).toEqual([
      "signed-url-requested",
      "signed-url-failed",
    ]);
    expect(events[1].fields.upstreamStatus).toBe(status);
    expect(events[1].fields.category).toBe(category);
  });

  it("a garbage upstream status token is not echoed — falls back to the generic category", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ detail: { status: "wss://leak.example/?sig=abc", request_id: "not safe!" } }, 401),
    );
    const { run, events } = harness(fetchImpl);
    const r = await run();
    if (!r.ok) {
      expect(r.category).toBe("unauthorized");
      expect(r.upstreamRequestId).toBeUndefined();
    }
    expect(JSON.stringify(events)).not.toContain("leak.example");
  });
});

describe("retryable failures", () => {
  it.each([[408], [429], [500], [502], [503]])(
    "%i retries with bounded exponential backoff and gives up after maxAttempts",
    async (status) => {
      const fetchImpl = vi.fn(async () => new Response("try later", { status }));
      const { run, sleeps, events } = harness(fetchImpl);
      const r = await run();
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      // base 100 → 100, 200 (capped at 400), full jitter with random()=1.
      expect(sleeps).toEqual([100, 200]);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.retryable).toBe(true);
        expect(r.attempts).toBe(3);
        expect(r.upstreamStatus).toBe(status);
      }
      expect(events.filter((e) => e.event === "retry").map((e) => e.fields.attempt)).toEqual([2, 3]);
      expect(events.filter((e) => e.event === "signed-url-failed")).toHaveLength(3);
    },
  );

  it("a network error retries, then succeeds on a later attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json({ signed_url: "wss://api.elevenlabs.io/t/2" }));
    const { run, sleeps, events } = harness(fetchImpl);
    const r = await run();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.attempts).toBe(2);
    expect(sleeps).toEqual([100]);
    expect(events.map((e) => e.event)).toEqual([
      "signed-url-requested",
      "signed-url-failed",
      "retry",
      "signed-url-succeeded",
    ]);
    expect(events[1].fields.category).toBe("network");
    // The signed URL is never logged.
    expect(JSON.stringify(events)).not.toContain("wss://");
  });

  it("backoff caps at maxBackoffMs", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 }));
    const { run, sleeps } = harness(fetchImpl, { maxAttempts: 5, baseBackoffMs: 300, maxBackoffMs: 500 });
    await run();
    expect(sleeps).toEqual([300, 500, 500, 500]);
  });

  it("stops retrying when the next backoff would cross the total deadline", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 }));
    const { run, sleeps } = harness(fetchImpl, { maxAttempts: 10, deadlineMs: 250 });
    const r = await run();
    // attempt 1 at t=0 fails → backoff 100 (t=100) → attempt 2 fails → next
    // backoff 200 would land at t=300 > 250 → stop.
    expect(sleeps).toEqual([100]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(false);
  });
});

describe("timeouts", () => {
  it("aborts a hanging attempt via the AbortSignal and classifies it as timeout", async () => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | undefined;
      const fetchImpl = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            observedSignal = init.signal as AbortSignal;
            observedSignal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      );
      const { events, log } = recorder();
      const p = mintSignedUrl({
        config,
        requestId: "r",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 50,
        deadlineMs: 60,
        maxAttempts: 1,
        log,
      });
      await vi.advanceTimersByTimeAsync(60);
      const r = await p;
      expect(observedSignal?.aborted).toBe(true);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.category).toBe("timeout");
        expect(r.retryable).toBe(true);
      }
      expect(events.some((e) => e.event === "signed-url-failed" && e.fields.category === "timeout")).toBe(true);
      // No dangling timer keeps the process alive.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("respects the total deadline even if every attempt is fast", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 }));
    const { run } = harness(fetchImpl, { deadlineMs: 0 });
    const r = await run();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe("timeout");
  });
});

describe("response hygiene", () => {
  it("a 2xx without a wss signed_url is malformed_response and not retried", async () => {
    const fetchImpl = vi.fn(async () => json({ signed_url: "https://not-a-socket" }));
    const { run } = harness(fetchImpl);
    const r = await run();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    if (!r.ok) {
      expect(r.category).toBe("malformed_response");
      expect(r.retryable).toBe(false);
    }
  });

  it("neither the result nor any log line carries the API key or the signed URL", async () => {
    const fetchImpl = vi.fn(async () => json({ signed_url: "wss://api.elevenlabs.io/t/secret-sig" }));
    const { run, events } = harness(fetchImpl);
    const r = await run();
    const logs = JSON.stringify(events);
    expect(logs).not.toContain(config.apiKey);
    expect(logs).not.toContain("secret-sig");
    expect(logs).not.toContain("wss://");
    // The result carries the URL exactly once for immediate use — and no key.
    expect(JSON.stringify(r)).not.toContain(config.apiKey);
  });
});
