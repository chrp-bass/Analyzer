/**
 * Where can a live Dr. Rhodes conversation be torn down, and can any of OUR
 * paths ever be mistaken for the provider failure the panel reports as
 * "Rhodes hit a snag"?
 *
 * This suite reproduces, through the pure controller, every client-side
 * lifecycle the production page can exercise (React StrictMode double
 * mount, re-render / re-subscribe, page visibility via `pagehide`, unmount,
 * the fetch abort) and proves that none of them produces the provider-
 * failure state. It then reproduces the provider-side post-open closes the
 * ElevenLabs SDK can deliver and pins how each is classified, logged (with
 * conversation id and close code) and handled: exactly one evidence-gated
 * reconnect without the config override, and only for a proven override
 * rejection or a silent reason-less close.
 */

import { describe, expect, it, vi } from "vitest";
import {
  RhodesVoiceSession,
  NOTES,
  OVERRIDE_FALLBACK_WINDOW_MS,
  type ConnectCallbacks,
  type ConnectOptions,
  type LiveConversation,
  type SessionPayload,
  type VoiceSessionDeps,
} from "@/lib/rhodes-voice/session-controller";
import type { RhodesVoiceEvent, RhodesVoiceLogFields } from "@/lib/rhodes-voice/log";

function payload(n: number): SessionPayload {
  return {
    signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=sig-${n}`,
    agentId: "agent",
    overrides: { agent: { firstMessage: "I sat with this song." } },
    dynamicVariables: { song_title: "Safe" },
    song: { title: "Safe", artist: "The Brevet" },
  };
}

interface Conv {
  endSession: ReturnType<typeof vi.fn>;
  callbacks: ConnectCallbacks;
  options: ConnectOptions;
  url: string;
}

function harness() {
  const events: Array<{ event: RhodesVoiceEvent; fields: RhodesVoiceLogFields }> = [];
  const debug: string[] = [];
  const conversations: Conv[] = [];
  let minted = 0;
  let clock = 1_000_000;
  const fetchSession = vi.fn(async () => ({ ok: true as const, payload: payload(++minted) }));
  const connect = vi.fn(
    async (
      p: SessionPayload,
      callbacks: ConnectCallbacks,
      options: ConnectOptions,
    ): Promise<LiveConversation> => {
      const conv: Conv = { endSession: vi.fn(async () => {}), callbacks, options, url: p.signedUrl };
      conversations.push(conv);
      // The SDK reports the provider's conversation id on connect.
      callbacks.onConnected(`conv_${conversations.length}`);
      return conv;
    },
  );
  const deps: VoiceSessionDeps = {
    requestMicrophone: async () => {},
    fetchSession,
    connect,
    log: (event, fields = {}) => events.push({ event, fields }),
    debug: (line) => debug.push(line),
    requestId: () => "req1",
    now: () => clock,
  };
  const session = new RhodesVoiceSession("scn_test", deps);
  const states: string[] = [];
  session.subscribe((s) => states.push(s.status));
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  return {
    session,
    events,
    debug,
    conversations,
    fetchSession,
    connect,
    states,
    flush,
    tick: (ms: number) => (clock += ms),
  };
}

const snagged = (h: ReturnType<typeof harness>) => h.session.getState().note === NOTES.snag;

describe("our own teardown can never be reported as a provider failure", () => {
  it("stop() from the End button: live cleared first, SDK disconnect ignored, no snag, source logged", async () => {
    const h = harness();
    await h.session.start();
    const conv = h.conversations[0];
    // Simulate the SDK: endSession() then onDisconnect({reason:"user"}).
    conv.endSession.mockImplementation(async () => conv.callbacks.onDisconnected({ reason: "user" }));
    await h.session.stop("user");
    expect(snagged(h)).toBe(false);
    expect(h.session.getState().status).toBe("ended");
    expect(h.events.at(-1)).toMatchObject({ event: "session-stopped", fields: { result: "closed_by_user" } });
    expect(h.events.filter((e) => e.event === "provider-failure")).toHaveLength(0);
  });

  it("unmount (React cleanup) disposes with source=unmount and never snags", async () => {
    const h = harness();
    await h.session.start();
    const conv = h.conversations[0];
    conv.endSession.mockImplementation(async () =>
      conv.callbacks.onDisconnected({ reason: "error", closeCode: 1005, closeReason: "" }),
    );
    await h.session.dispose("unmount");
    expect(conv.endSession).toHaveBeenCalledTimes(1);
    expect(snagged(h)).toBe(false);
    expect(h.events.at(-1)).toMatchObject({ event: "session-stopped", fields: { result: "closed_by_unmount" } });
    expect(h.events.filter((e) => e.event === "provider-failure")).toHaveLength(0);
  });

  it("pagehide disposes with source=pagehide; a late SDK error during teardown is ignored", async () => {
    const h = harness();
    await h.session.start();
    const conv = h.conversations[0];
    conv.endSession.mockImplementation(async () => {
      conv.callbacks.onError("Failed to end session after agent end_call");
      conv.callbacks.onDisconnected({ reason: "user" });
    });
    await h.session.dispose("pagehide");
    expect(snagged(h)).toBe(false);
    expect(h.events.filter((e) => e.event === "provider-failure")).toHaveLength(0);
    expect(h.events.at(-1)?.fields.result).toBe("closed_by_pagehide");
  });

  it("StrictMode-style double mount: disposing the first controller does not touch a second, live one", async () => {
    // Mount #1 creates a controller; StrictMode cleanup disposes it before
    // any click. Mount #2 creates a fresh controller which then runs live.
    const first = harness();
    await first.session.dispose("unmount");
    expect(first.session.isDisposed()).toBe(true);
    expect(await first.session.start()).toBe("ignored");
    expect(first.fetchSession).not.toHaveBeenCalled();

    const second = harness();
    expect(await second.session.start()).toBe("started");
    // Disposing the stale one again is inert and cannot reach the live one.
    await first.session.dispose("unmount");
    expect(second.session.getState().status).toBe("listening");
    expect(second.conversations[0].endSession).not.toHaveBeenCalled();
  });

  it("re-render (unsubscribe/resubscribe) leaves the live conversation untouched", async () => {
    const h = harness();
    const unsubscribe = h.session.subscribe(() => {});
    await h.session.start();
    unsubscribe();
    h.session.subscribe(() => {});
    expect(h.session.getState().status).toBe("listening");
    expect(h.conversations[0].endSession).not.toHaveBeenCalled();
    expect(h.session.isBusy()).toBe(true);
  });

  it("the abort controller only ever aborts the session fetch; a live socket is never aborted", async () => {
    let signal: AbortSignal | undefined;
    const h = harness();
    const fetchSession = h.fetchSession as unknown as {
      mockImplementation(fn: VoiceSessionDeps["fetchSession"]): void;
    };
    fetchSession.mockImplementation(async (_id, s) => {
      signal = s;
      return { ok: true as const, payload: payload(99) };
    });
    await h.session.start();
    expect(signal?.aborted).toBe(false);
    expect(h.session.getState().status).toBe("listening");
    await h.session.dispose("unmount");
    // Nothing was pending, so nothing was aborted; the socket was ended, not aborted.
    expect(signal?.aborted).toBe(false);
    expect(h.conversations[0].endSession).toHaveBeenCalledTimes(1);
  });
});

describe("provider-side post-open failures", () => {
  it("a proven override rejection: logged with conversation id + close code, ONE fresh-URL reconnect WITHOUT overrides, then live", async () => {
    const h = harness();
    await h.session.start();
    expect(h.conversations[0].options.withOverrides).toBe(true);
    h.tick(400);
    h.conversations[0].callbacks.onDisconnected({
      reason: "error",
      closeCode: 1008,
      closeReason: "Override for agent.first_message is not allowed",
    });
    await h.flush();

    expect(h.fetchSession).toHaveBeenCalledTimes(2);
    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(h.conversations[1].options.withOverrides).toBe(false);
    expect(h.conversations[1].url).not.toBe(h.conversations[0].url);
    expect(h.session.getState().status).toBe("listening");
    expect(snagged(h)).toBe(false);

    const pf = h.events.find((e) => e.event === "provider-failure");
    expect(pf?.fields).toMatchObject({
      category: "override_rejected",
      closeCode: 1008,
      conversationId: "conv_1",
      ms: 400,
      result: "close",
    });
    expect(h.events.find((e) => e.event === "retry")?.fields).toMatchObject({
      result: "without_overrides",
      category: "override_rejected",
    });
    expect(h.events.filter((e) => e.event === "session-started").at(-1)?.fields.result).toBe("without_overrides");
    // The provider's exact words reach the console only, never a structured log.
    expect(h.debug.some((l) => l.includes("Override for agent.first_message is not allowed"))).toBe(true);
    expect(JSON.stringify(h.events)).not.toContain("Override for agent.first_message");
  });

  it("a silent, reason-less 1006 close right after open also earns the single override-free reconnect", async () => {
    const h = harness();
    await h.session.start();
    h.tick(150);
    h.conversations[0].callbacks.onDisconnected({ reason: "error", closeCode: 1006, closeReason: "" });
    await h.flush();
    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(h.conversations[1].options.withOverrides).toBe(false);
    expect(h.events.find((e) => e.event === "provider-failure")?.fields).toMatchObject({
      category: "network",
      closeCode: 1006,
    });
  });

  it("the override-free reconnect happens at most ONCE; a second failure is reported, not retried", async () => {
    const h = harness();
    await h.session.start();
    h.tick(100);
    h.conversations[0].callbacks.onDisconnected({ reason: "error", closeCode: 1008, closeReason: "Override not allowed" });
    await h.flush();
    expect(h.connect).toHaveBeenCalledTimes(2);
    h.tick(100);
    h.conversations[1].callbacks.onDisconnected({ reason: "error", closeCode: 1006, closeReason: "" });
    await h.flush();
    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(snagged(h)).toBe(true);
    expect(h.events.at(-1)).toMatchObject({
      event: "graceful-degradation",
      fields: { result: "provider_failure" },
    });
  });

  it.each([
    [3000, "Signature expired", "auth"],
    [1008, "Insufficient credits", "quota"],
    [1011, "Voice not found", "voice_unavailable"],
    [1011, "LLM request failed", "llm"],
    [1008, "Missing required dynamic variables: ['x']", "dynamic_variables_missing"],
    [1011, "Something odd happened", "unknown"],
  ])("close %i %j is reported as %s with no reconnect", async (code, reason, category) => {
    const h = harness();
    await h.session.start();
    h.tick(300);
    h.conversations[0].callbacks.onDisconnected({ reason: "error", closeCode: code, closeReason: reason });
    await h.flush();
    expect(h.connect).toHaveBeenCalledTimes(1);
    expect(snagged(h)).toBe(true);
    expect(h.session.getState().retryable).toBe(true);
    expect(h.events.find((e) => e.event === "provider-failure")?.fields).toMatchObject({
      category,
      closeCode: code,
      conversationId: "conv_1",
    });
    expect(h.events.find((e) => e.event === "websocket-closed")?.fields).toMatchObject({
      closeCode: code,
      result: "error",
      ms: 300,
    });
  });

  it("an override rejection AFTER the fallback window is a mid-conversation drop: reported, not retried", async () => {
    const h = harness();
    await h.session.start();
    h.tick(OVERRIDE_FALLBACK_WINDOW_MS + 1);
    h.conversations[0].callbacks.onDisconnected({ reason: "error", closeCode: 1008, closeReason: "Override not allowed" });
    await h.flush();
    expect(h.connect).toHaveBeenCalledTimes(1);
    expect(snagged(h)).toBe(true);
  });

  it("a provider `error` event (socket still open) is reported with its category; the later close does not double-report", async () => {
    const h = harness();
    await h.session.start();
    h.tick(200);
    h.conversations[0].callbacks.onError("Server error: quota exceeded");
    expect(snagged(h)).toBe(true);
    expect(h.events.at(-1)).toMatchObject({
      event: "provider-failure",
      fields: { category: "quota", result: "error_event" },
    });
    // The provider then closes the socket: logged as closed, no second reconnect.
    h.conversations[0].callbacks.onDisconnected({ reason: "error", closeCode: 1011, closeReason: "quota exceeded" });
    await h.flush();
    expect(h.connect).toHaveBeenCalledTimes(1);
  });

  it("a normal provider end (1000 / agent) settles into ended, never snag", async () => {
    const h = harness();
    await h.session.start();
    h.conversations[0].callbacks.onDisconnected({ reason: "agent", closeCode: 1000, closeReason: "" });
    expect(h.session.getState().status).toBe("ended");
    expect(snagged(h)).toBe(false);
  });

  it("every log line of one click carries the same request id and, once known, the conversation id", async () => {
    const h = harness();
    await h.session.start();
    h.conversations[0].callbacks.onDisconnected({ reason: "error", closeCode: 1011, closeReason: "Voice not found" });
    await h.flush();
    for (const e of h.events) expect(e.fields.requestId).toBe("req1");
    const from = h.events.findIndex((e) => e.fields.result === "conversation_created");
    for (const e of h.events.slice(from)) expect(e.fields.conversationId).toBe("conv_1");
  });
});
