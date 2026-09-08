/**
 * Browser-side lifecycle of the Dr. Rhodes voice moment, tested through the
 * pure controller the React panel is a thin view over. Every dependency is
 * injected, so each invariant is proven without a DOM or the SDK:
 *
 *   - microphone denial never calls /api/rhodes/session
 *   - a double click creates exactly one session
 *   - every connection attempt gets a FRESH signed URL; none is ever reused
 *   - a pre-open WebSocket failure earns exactly ONE fresh-URL retry
 *   - stop / dispose (unmount, navigation) end the conversation, which
 *     closes the WebSocket and releases the microphone, and abort in-flight
 *     requests
 *   - no failure escapes `start()`; the panel's state is the only thing that
 *     changes, so the report around it is untouched
 *   - the controller never touches anything but its injected deps
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  RhodesVoiceSession,
  MAX_CONNECT_ATTEMPTS,
  NOTES,
  type ConnectCallbacks,
  type LiveConversation,
  type SessionPayload,
  type VoiceSessionDeps,
} from "@/lib/rhodes-voice/session-controller";
import type { RhodesVoiceEvent, RhodesVoiceLogFields } from "@/lib/rhodes-voice/log";

function payload(n: number): SessionPayload {
  return {
    signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=sig-${n}`,
    agentId: "agent",
    overrides: { agent: { firstMessage: "hello" } },
    dynamicVariables: { song_title: "Safe" },
    song: { title: "Safe", artist: "The Brevet" },
  };
}

class PreOpenError extends Error {
  override readonly name = "SessionConnectionError";
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Harness {
  session: RhodesVoiceSession;
  deps: VoiceSessionDeps;
  events: Array<{ event: RhodesVoiceEvent; fields: RhodesVoiceLogFields }>;
  mic: ReturnType<typeof vi.fn>;
  fetchSession: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  conversations: Array<{ endSession: ReturnType<typeof vi.fn>; callbacks: ConnectCallbacks; url: string }>;
  states: string[];
}

function harness(opts: {
  mic?: () => Promise<void>;
  fetchSession?: VoiceSessionDeps["fetchSession"];
  connect?: VoiceSessionDeps["connect"];
} = {}): Harness {
  const events: Harness["events"] = [];
  const conversations: Harness["conversations"] = [];
  let minted = 0;
  const mic = vi.fn(opts.mic ?? (async () => {}));
  const fetchSession = vi.fn(
    opts.fetchSession ?? (async () => ({ ok: true as const, payload: payload(++minted) })),
  );
  const connect = vi.fn(
    opts.connect ??
      (async (p: SessionPayload, callbacks: ConnectCallbacks): Promise<LiveConversation> => {
        const conv = { endSession: vi.fn(async () => {}), callbacks, url: p.signedUrl };
        conversations.push(conv);
        return conv;
      }),
  );
  const deps: VoiceSessionDeps = {
    requestMicrophone: mic,
    fetchSession,
    connect,
    log: (event, fields = {}) => events.push({ event, fields }),
    requestId: () => "req",
  };
  const session = new RhodesVoiceSession("scn_test", deps);
  const states: string[] = [];
  session.subscribe((s) => states.push(s.status));
  return { session, deps, events, mic, fetchSession, connect, conversations, states };
}

describe("RhodesVoiceSession", () => {
  it("happy path: mic → session → websocket → live, logging the lifecycle", async () => {
    const h = harness();
    const r = await h.session.start();
    expect(r).toBe("started");
    expect(h.mic).toHaveBeenCalledTimes(1);
    expect(h.fetchSession).toHaveBeenCalledTimes(1);
    expect(h.connect).toHaveBeenCalledTimes(1);
    expect(h.session.getState()).toMatchObject({ status: "listening", note: null, song: { title: "Safe" } });
    expect(h.states).toEqual(["requesting_mic", "connecting", "connecting", "listening"]);
    expect(h.events.map((e) => e.event)).toEqual([
      "session-requested",
      "microphone-requested",
      "microphone-granted",
      "websocket-opening",
      "websocket-open",
      "session-started",
    ]);
    expect(h.connect.mock.calls[0][2]).toEqual({ withOverrides: true });
    // Ordering: microphone strictly before the session endpoint.
    expect(h.mic.mock.invocationCallOrder[0]).toBeLessThan(h.fetchSession.mock.invocationCallOrder[0]);
  });

  it("microphone denial makes ZERO signed-session calls and leaves a retryable voice-only note", async () => {
    const h = harness({
      mic: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
    const r = await h.session.start();
    expect(r).toBe("mic_denied");
    expect(h.fetchSession).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.session.getState()).toEqual({ status: "error", note: NOTES.mic, song: null, retryable: true });
    expect(h.events.map((e) => e.event)).toEqual([
      "session-requested",
      "microphone-requested",
      "microphone-denied",
    ]);
    // A later click may try again from scratch.
    h.mic.mockImplementation(async () => {});
    expect(await h.session.start()).toBe("started");
  });

  it("a double click creates exactly one session", async () => {
    const gate = deferred<void>();
    const h = harness({ mic: () => gate.promise });
    const first = h.session.start();
    const second = h.session.start();
    const third = h.session.start();
    expect(h.session.isBusy()).toBe(true);
    gate.resolve();
    expect(await Promise.all([first, second, third])).toEqual(["started", "ignored", "ignored"]);
    expect(h.fetchSession).toHaveBeenCalledTimes(1);
    expect(h.connect).toHaveBeenCalledTimes(1);
    // …and while live, another click is still a no-op.
    expect(await h.session.start()).toBe("ignored");
    expect(h.fetchSession).toHaveBeenCalledTimes(1);
  });

  it("each attempt receives a FRESH signed URL; a URL is never reused", async () => {
    const h = harness({
      connect: vi
        .fn()
        .mockRejectedValueOnce(new PreOpenError("closed before metadata"))
        .mockImplementation(async (p: SessionPayload, callbacks: ConnectCallbacks) => {
          const conv = { endSession: vi.fn(async () => {}), callbacks, url: p.signedUrl };
          h.conversations.push(conv);
          return conv;
        }),
    });
    const r = await h.session.start();
    expect(r).toBe("started");
    expect(h.fetchSession).toHaveBeenCalledTimes(2);
    const urls = (h.connect.mock.calls as unknown as Array<[SessionPayload]>).map(([p]) => p.signedUrl);
    expect(urls).toHaveLength(2);
    expect(new Set(urls).size).toBe(2);
    expect(h.events.filter((e) => e.event === "retry")).toHaveLength(1);
    // The retry log lines carry attempt numbers, never the URL.
    expect(JSON.stringify(h.events)).not.toContain("wss://");
  });

  it("refuses to connect with a signed URL it has already used", async () => {
    const h = harness({
      fetchSession: async () => ({ ok: true as const, payload: payload(1) }), // same URL every time
      connect: vi.fn().mockRejectedValue(new PreOpenError("nope")),
    });
    const r = await h.session.start();
    expect(r).toBe("failed");
    // First attempt used URL #1 and failed pre-open; the second fetch handed
    // back the SAME URL → refused without a connect.
    expect(h.connect).toHaveBeenCalledTimes(1);
    expect(h.events.some((e) => e.fields.result === "reused_url_refused")).toBe(true);
  });

  it("a pre-open WebSocket failure permits exactly ONE fresh-URL retry", async () => {
    const h = harness({ connect: vi.fn().mockRejectedValue(new PreOpenError("refused")) });
    const r = await h.session.start();
    expect(r).toBe("failed");
    expect(MAX_CONNECT_ATTEMPTS).toBe(2);
    expect(h.fetchSession).toHaveBeenCalledTimes(2);
    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(h.session.getState()).toMatchObject({ status: "error", note: NOTES.open, retryable: true });
    expect(h.events.filter((e) => e.event === "websocket-failed")).toHaveLength(2);
    expect(h.events.filter((e) => e.event === "retry")).toHaveLength(1);
    expect(h.events.at(-1)?.event).toBe("graceful-degradation");
  });

  it("a non-pre-open connect failure is NOT retried", async () => {
    const h = harness({ connect: vi.fn().mockRejectedValue(new Error("audio worklet broke")) });
    const r = await h.session.start();
    expect(r).toBe("failed");
    expect(h.fetchSession).toHaveBeenCalledTimes(1);
    expect(h.connect).toHaveBeenCalledTimes(1);
    expect(h.session.getState().status).toBe("error");
  });

  it("a session-endpoint failure is a voice-only note; nothing else is called", async () => {
    for (const [status, retryable, note] of [
      [503, true, NOTES.unavailable],
      [502, false, NOTES.connect],
      [403, false, NOTES.connect],
    ] as const) {
      const h = harness({ fetchSession: async () => ({ ok: false as const, status, retryable }) });
      expect(await h.session.start()).toBe("failed");
      expect(h.connect).not.toHaveBeenCalled();
      expect(h.session.getState()).toMatchObject({ status: "error", note, retryable });
      expect(h.events.at(-1)).toMatchObject({
        event: "graceful-degradation",
        fields: { upstreamStatus: status },
      });
    }
  });

  it("start() never rejects, whatever the dependencies do", async () => {
    const h = harness({
      fetchSession: async () => {
        throw new TypeError("network down");
      },
    });
    await expect(h.session.start()).resolves.toBe("failed");
    expect(h.session.getState()).toMatchObject({ status: "error", retryable: true });
    const h2 = harness({
      mic: async () => {
        throw new Error("weird");
      },
    });
    await expect(h2.session.start()).resolves.toBe("mic_denied");
  });

  it("stop() ends the conversation (closing the socket and the microphone) and reports ended", async () => {
    const h = harness();
    await h.session.start();
    await h.session.stop();
    expect(h.conversations[0].endSession).toHaveBeenCalledTimes(1);
    expect(h.session.getState().status).toBe("ended");
    expect(h.events.at(-1)).toMatchObject({ event: "session-stopped", fields: { result: "closed_by_user" } });
    // A second session after stop mints a fresh URL.
    await h.session.start();
    expect(h.fetchSession).toHaveBeenCalledTimes(2);
    const urls = (h.connect.mock.calls as unknown as Array<[SessionPayload]>).map(([p]) => p.signedUrl);
    expect(urls[0]).not.toBe(urls[1]);
  });

  it("dispose() on unmount/navigation ends a live conversation and makes later calls no-ops", async () => {
    const h = harness();
    await h.session.start();
    await h.session.dispose();
    expect(h.conversations[0].endSession).toHaveBeenCalledTimes(1);
    expect(await h.session.start()).toBe("ignored");
    expect(h.fetchSession).toHaveBeenCalledTimes(1);
  });

  it("dispose() while the session request is in flight aborts it and never connects", async () => {
    let seenSignal: AbortSignal | undefined;
    const gate = deferred<never>();
    const h = harness({
      fetchSession: (_scanId, signal) => {
        seenSignal = signal;
        signal.addEventListener("abort", () => gate.reject(new DOMException("aborted", "AbortError")));
        return gate.promise;
      },
    });
    const starting = h.session.start();
    await Promise.resolve();
    await Promise.resolve();
    await h.session.dispose();
    expect(seenSignal?.aborted).toBe(true);
    expect(await starting).toBe("failed");
    expect(h.connect).not.toHaveBeenCalled();
  });

  it("dispose() while the WebSocket handshake is in flight closes it the moment it opens", async () => {
    const gate = deferred<LiveConversation>();
    const endSession = vi.fn(async () => {});
    const h = harness({ connect: () => gate.promise });
    const starting = h.session.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await h.session.dispose();
    gate.resolve({ endSession });
    expect(await starting).toBe("failed");
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it("agent-side disconnect and SDK errors settle into ended/error without throwing", async () => {
    const h = harness();
    await h.session.start();
    h.conversations[0].callbacks.onAgentSpeaking();
    expect(h.session.getState().status).toBe("listening");
    h.conversations[0].callbacks.onUserTurn();
    expect(h.session.getState().status).toBe("speaking");
    h.conversations[0].callbacks.onDisconnected({ reason: "agent", closeCode: 1000 });
    expect(h.session.getState().status).toBe("ended");
    expect(h.session.isBusy()).toBe(false);

    const h2 = harness();
    await h2.session.start();
    h2.conversations[0].callbacks.onDisconnected({ reason: "error", closeCode: 1011, closeReason: "Voice not found" });
    expect(h2.session.getState()).toMatchObject({ status: "error", note: NOTES.snag, retryable: true });
  });
});

describe("browser-side code never sees a credential", () => {
  it("the panel and the controller contain no env access, key header or ElevenLabs REST call", () => {
    for (const file of [
      "src/components/report/RhodesVoice.tsx",
      "src/lib/rhodes-voice/session-controller.ts",
      "src/lib/rhodes-voice/log.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/process\.env/);
      expect(src, file).not.toMatch(/xi-api-key/i);
      expect(src, file).not.toMatch(/ELEVENLABS_API_KEY/);
      expect(src, file).not.toMatch(/api\.elevenlabs\.io\/v1\/(?!convai\/conversation\?)/);
      expect(src, file).not.toMatch(/text-to-speech|\/v1\/tts|audio\/mpeg/i);
    }
  });

  it("the panel only ever talks to /api/rhodes/session, its outcome log, and the SDK", () => {
    const src = readFileSync("src/components/report/RhodesVoice.tsx", "utf8");
    const fetches = src.match(/fetch\(\s*"([^"]+)"/g) ?? [];
    expect(fetches).toEqual(['fetch("/api/rhodes/session"', 'fetch("/api/rhodes/session/outcome"']);
    expect(src).not.toMatch(/\/api\/(scan|report|checkout|prepare|claim)/);
  });
});
