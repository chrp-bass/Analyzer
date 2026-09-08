/**
 * The browser-side lifecycle of one Dr. Rhodes voice session, as a pure,
 * framework-free state machine.
 *
 * The React panel is a thin view over this controller; everything a test
 * needs to prove about the voice moment lives here and is injectable:
 *
 *   click → microphone permission → POST /api/rhodes/session → WebSocket →
 *   conversation → stop / navigation / unmount → cleanup
 *
 * Invariants this controller enforces (each pinned by a test):
 *   - microphone denial never calls the session endpoint;
 *   - a second click while a start is in flight or a session is live is a
 *     no-op — one session per panel, never two in parallel;
 *   - every connection attempt uses a freshly minted signed URL; a URL that
 *     failed to open is discarded and never reused;
 *   - a pre-open WebSocket failure permits exactly ONE fresh-URL retry;
 *   - a POST-open provider failure is classified from the close code and
 *     reason. Only a proven override rejection (or a silent, reason-less
 *     close) earns ONE fresh-URL reconnect without the config override; every
 *     other provider failure is reported as-is, never retried;
 *   - our own teardown (stop, dispose from unmount / pagehide) can never be
 *     mistaken for a provider failure: `live` is cleared BEFORE the socket is
 *     closed, and the teardown source is logged;
 *   - no failure escapes: `start()` never rejects, so the report around the
 *     panel is untouched by anything that goes wrong inside it.
 *
 * Nothing here knows about the report, the API key, preparation, checkout,
 * or any upstream service. Its only network dependency is the injected
 * `fetchSession`, and its only audio dependency is the injected `connect`.
 */

import type { RhodesVoiceEvent, RhodesVoiceLogFields } from "./log";
import {
  classifyProviderFailure,
  warrantsOverrideFreeRetry,
  type ProviderFailure,
} from "./close-reason";

export type VoiceStatus =
  | "idle"
  | "requesting_mic"
  | "connecting"
  | "listening" // Rhodes is speaking
  | "speaking" // the creator is speaking
  | "ended"
  | "error";

export interface VoiceState {
  status: VoiceStatus;
  /** A short, restrained note shown inside the panel only. */
  note: string | null;
  song: { title: string; artist: string } | null;
  /** Whether a "Try again" action makes sense for the current note. */
  retryable: boolean;
}

export interface SessionPayload {
  signedUrl: string;
  agentId: string;
  requestId?: string;
  overrides: {
    agent?: { firstMessage?: string; prompt?: { prompt?: string } };
  };
  dynamicVariables: Record<string, string>;
  song: { title: string; artist: string };
}

export type SessionFetchResult =
  | { ok: true; payload: SessionPayload }
  | { ok: false; status: number; retryable: boolean };

/** What the SDK tells us when the conversation ends. */
export interface DisconnectDetails {
  reason: "user" | "agent" | "error";
  closeCode?: number;
  closeReason?: string;
  message?: string;
}

export interface ConnectCallbacks {
  /** The provider accepted the initiation and created a conversation. */
  onConnected(conversationId: string): void;
  onAgentSpeaking(): void;
  onUserTurn(): void;
  onDisconnected(details: DisconnectDetails): void;
  /** A provider `error` event or an SDK-level error while the session is open. */
  onError(message: string): void;
}

export interface ConnectOptions {
  /**
   * Permit a `conversation_config_override` in the initiation payload IF the
   * server supplied one. The production server supplies none: the report is
   * bound through dynamic variables only, and the agent's own first message
   * and prompt reference them. After a proven override rejection this is
   * false, so a supplied override is deliberately dropped.
   */
  withOverrides: boolean;
}

/** True when the server actually supplied a config override worth sending. */
export function hasOverrides(o: SessionPayload["overrides"] | undefined): boolean {
  return Boolean(o && o.agent && (o.agent.firstMessage || o.agent.prompt?.prompt));
}

/**
 * What the initiation payload carries, as logged. `with_context` is the
 * production path: dynamic variables, no override.
 */
export type InitiationShape = "with_context" | "with_override" | "context_only_after_rejection";

export function initiationShape(payload: SessionPayload, options: ConnectOptions): InitiationShape {
  if (!options.withOverrides) return "context_only_after_rejection";
  return hasOverrides(payload.overrides) ? "with_override" : "with_context";
}

export interface LiveConversation {
  endSession(): Promise<unknown>;
}

export type TeardownSource = "user" | "unmount" | "pagehide" | "scan-change" | "dispose";

export interface VoiceSessionDeps {
  /** Resolve when the browser has granted microphone access; reject otherwise. */
  requestMicrophone(): Promise<void>;
  /** POST /api/rhodes/session. Must honour `signal`. */
  fetchSession(scanId: string, signal: AbortSignal): Promise<SessionFetchResult>;
  /** Open the WebSocket conversation with this (fresh) payload. */
  connect(
    payload: SessionPayload,
    callbacks: ConnectCallbacks,
    options: ConnectOptions,
  ): Promise<LiveConversation>;
  /** Structured `[rhodes-voice]` logging. */
  log?: (event: RhodesVoiceEvent, fields?: RhodesVoiceLogFields) => void;
  /** Console-only: the provider's exact words for the human running the test. */
  debug?: (line: string) => void;
  /**
   * Whether a `connect` rejection happened BEFORE the conversation opened
   * (handshake refused, socket closed before metadata). Only such failures
   * earn the single fresh-URL retry. Defaults to the ElevenLabs SDK's
   * `SessionConnectionError`.
   */
  isPreOpenFailure?(err: unknown): boolean;
  requestId?(): string;
  now?(): number;
}

export const NOTES = {
  mic: "This browser didn't grant microphone access. You can still read the report below.",
  unavailable: "Voice is unavailable right now. The report below is unaffected.",
  connect: "Rhodes couldn't connect just now. The report below is unaffected.",
  open: "Rhodes couldn't open a session. The report below is unaffected.",
  snag: "Rhodes hit a snag. The report below is unaffected.",
} as const;

/** How many connection attempts one click may make. Exactly one retry. */
export const MAX_CONNECT_ATTEMPTS = 2;
/** A post-open provider failure later than this is a mid-conversation drop, not a rejection. */
export const OVERRIDE_FALLBACK_WINDOW_MS = 10_000;

const defaultIsPreOpen = (err: unknown): boolean =>
  !!err && typeof err === "object" && (err as { name?: unknown }).name === "SessionConnectionError";

let counter = 0;
const defaultRequestId = () => `c${(++counter).toString(36)}${Date.now().toString(36)}`;

export class RhodesVoiceSession {
  private state: VoiceState = { status: "idle", note: null, song: null, retryable: false };
  private readonly listeners = new Set<(s: VoiceState) => void>();
  private inFlight = false;
  private live: LiveConversation | null = null;
  private abort: AbortController | null = null;
  private disposed = false;
  private readonly usedSignedUrls = new Set<string>();
  /** Per click: the request id every log line of this attempt carries. */
  private requestId = "";
  private conversationId: string | undefined;
  private openedAt = 0;
  private overrideFreeRetryUsed = false;

  constructor(
    private readonly scanId: string,
    private readonly deps: VoiceSessionDeps,
  ) {}

  getState(): VoiceState {
    return this.state;
  }

  subscribe(fn: (s: VoiceState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** True once `dispose()` has run; every later call is a no-op. */
  isDisposed(): boolean {
    return this.disposed;
  }

  /** True while a start is in flight or a conversation is open. */
  isBusy(): boolean {
    return this.inFlight || this.live !== null;
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private set(patch: Partial<VoiceState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  private log(event: RhodesVoiceEvent, fields?: RhodesVoiceLogFields): void {
    try {
      this.deps.log?.(event, {
        requestId: this.requestId || undefined,
        conversationId: this.conversationId,
        ...fields,
      });
    } catch {
      /* logging must never affect the session */
    }
  }

  private debug(line: string): void {
    try {
      this.deps.debug?.(line);
    } catch {
      /* never */
    }
  }

  /**
   * Begin one session. Resolves to what happened; never rejects.
   * Re-entrant calls while busy are ignored (`"ignored"`).
   */
  async start(): Promise<"started" | "ignored" | "mic_denied" | "failed"> {
    if (this.disposed || this.inFlight || this.live) return "ignored";
    this.inFlight = true;
    this.requestId = (this.deps.requestId ?? defaultRequestId)();
    this.conversationId = undefined;
    this.overrideFreeRetryUsed = false;
    this.set({ status: "requesting_mic", note: null, retryable: false });
    this.log("session-requested", { stage: "click" });

    try {
      // 1. Microphone consent BEFORE anything is minted. A denial is a user
      //    decision, not an error worth an upstream round-trip.
      this.log("microphone-requested", { stage: "microphone" });
      try {
        await this.deps.requestMicrophone();
      } catch {
        this.log("microphone-denied", { stage: "microphone" });
        this.set({ status: "error", note: NOTES.mic, retryable: true });
        return "mic_denied";
      }
      this.log("microphone-granted", { stage: "microphone" });
      if (this.disposed) return "failed";

      return await this.connectFlow({ withOverrides: true });
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Mint a FRESH signed URL and connect, up to MAX_CONNECT_ATTEMPTS times
   * (a pre-open failure earns the one retry). Shared by the first attempt and
   * by the evidence-gated override-free reconnect.
   */
  private async connectFlow(options: ConnectOptions): Promise<"started" | "failed"> {
    this.set({ status: "connecting" });
    this.abort = new AbortController();
    try {
      for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
        // 2. A FRESH signed URL for every attempt. Never reuse one.
        let fetched: SessionFetchResult;
        try {
          fetched = await this.deps.fetchSession(this.scanId, this.abort.signal);
        } catch {
          if (this.disposed) return "failed";
          this.log("graceful-degradation", { stage: "session", result: "fetch_threw", attempt });
          this.set({ status: "error", note: NOTES.connect, retryable: true });
          return "failed";
        }
        if (this.disposed) return "failed";
        if (!fetched.ok) {
          this.log("graceful-degradation", {
            stage: "session",
            upstreamStatus: fetched.status,
            result: fetched.retryable ? "retryable" : "not_retryable",
            attempt,
          });
          this.set({
            status: "error",
            note: fetched.status === 503 ? NOTES.unavailable : NOTES.connect,
            retryable: fetched.retryable,
          });
          return "failed";
        }

        const payload = fetched.payload;
        if (this.usedSignedUrls.has(payload.signedUrl)) {
          // Defensive: a reused URL would mean the server cached one. Refuse.
          this.log("graceful-degradation", { stage: "websocket", result: "reused_url_refused", attempt });
          this.set({ status: "error", note: NOTES.open, retryable: true });
          return "failed";
        }
        this.usedSignedUrls.add(payload.signedUrl);
        this.set({ song: payload.song });

        // 3. Connect immediately — the URL is short-lived.
        const shape = initiationShape(payload, options);
        this.log("websocket-opening", { stage: "websocket", attempt, result: shape });
        const opened = this.now();
        try {
          const conv = await this.deps.connect(payload, this.callbacks(), options);
          if (this.disposed) {
            // Unmounted while the handshake was in flight: close at once.
            await conv.endSession().catch(() => {});
            return "failed";
          }
          this.live = conv;
          this.openedAt = this.now();
          this.log("websocket-open", { stage: "websocket", ms: this.openedAt - opened, attempt });
          this.set({ status: "listening", note: null, retryable: false });
          this.log("session-started", { stage: "conversation", attempt, result: shape });
          return "started";
        } catch (err) {
          const preOpen = (this.deps.isPreOpenFailure ?? defaultIsPreOpen)(err);
          const e = err as { closeCode?: number; closeReason?: string; message?: string } | null;
          this.log("websocket-failed", {
            stage: "websocket",
            ms: this.now() - opened,
            attempt,
            result: preOpen ? "pre_open" : "other",
            closeCode: typeof e?.closeCode === "number" ? e.closeCode : undefined,
            category: classifyProviderFailure({
              closeCode: e?.closeCode,
              reason: e?.closeReason,
              message: e?.message,
            }).category,
          });
          this.debug(`[rhodes-voice] pre-open failure: ${String(e?.message ?? err)}`);
          if (this.disposed) return "failed";
          if (preOpen && attempt < MAX_CONNECT_ATTEMPTS) {
            // The failed URL is already recorded as used; loop mints a new one.
            this.log("retry", { stage: "websocket", attempt: attempt + 1, result: "fresh_url" });
            continue;
          }
          this.log("graceful-degradation", { stage: "websocket", result: "gave_up", attempt });
          this.set({ status: "error", note: NOTES.open, retryable: true });
          return "failed";
        }
      }
      return "failed";
    } finally {
      this.abort = null;
    }
  }

  /**
   * A provider-side failure AFTER the conversation opened. Classified from
   * the close code/reason; logged with the conversation id so the ElevenLabs
   * record can be found. Exactly one evidence-gated reconnect without the
   * config override, and only when the reason proves an override rejection
   * (or the provider closed silently within the window).
   */
  private handleProviderFailure(failure: ProviderFailure, source: "close" | "error"): void {
    const sinceOpen = this.openedAt ? this.now() - this.openedAt : undefined;
    this.log("provider-failure", {
      stage: "conversation",
      ms: sinceOpen,
      closeCode: failure.closeCode,
      category: failure.category,
      result: source,
    });
    if (failure.excerpt) this.debug(`[rhodes-voice] provider reason: ${failure.excerpt}`);

    const withinWindow = sinceOpen !== undefined && sinceOpen <= OVERRIDE_FALLBACK_WINDOW_MS;
    if (
      !this.disposed &&
      !this.inFlight &&
      !this.overrideFreeRetryUsed &&
      withinWindow &&
      warrantsOverrideFreeRetry(failure)
    ) {
      this.overrideFreeRetryUsed = true;
      this.inFlight = true;
      this.log("retry", {
        stage: "websocket",
        attempt: 1,
        result: "drop_override",
        category: failure.category,
      });
      void this.connectFlow({ withOverrides: false }).finally(() => {
        this.inFlight = false;
      });
      return;
    }
    this.set({ status: "error", note: NOTES.snag, retryable: true });
    this.log("graceful-degradation", { stage: "conversation", result: "provider_failure", category: failure.category });
  }

  private callbacks(): ConnectCallbacks {
    return {
      onConnected: (conversationId) => {
        this.conversationId = conversationId;
        this.log("websocket-open", { stage: "provider", result: "conversation_created" });
      },
      onAgentSpeaking: () => {
        if (this.live) this.set({ status: "listening" });
      },
      onUserTurn: () => {
        if (this.live) this.set({ status: "speaking" });
      },
      onDisconnected: (details) => {
        // Our own teardown clears `live` BEFORE closing the socket, so a
        // disconnect that arrives with `live` unset is ours, never the provider's.
        if (!this.live) return;
        this.live = null;
        const sinceOpen = this.openedAt ? this.now() - this.openedAt : undefined;
        this.log("websocket-closed", {
          stage: "websocket",
          ms: sinceOpen,
          result: details.reason,
          closeCode: details.closeCode,
        });
        if (details.reason === "error") {
          this.handleProviderFailure(
            classifyProviderFailure({
              closeCode: details.closeCode,
              reason: details.closeReason,
              message: details.message,
            }),
            "close",
          );
        } else {
          this.set({ status: "ended" });
        }
      },
      onError: (message) => {
        if (!this.live) return; // an error during our own teardown is not a provider failure
        const failure = classifyProviderFailure({ message });
        // The SDK keeps the socket open after a server `error` event; the
        // provider decides whether to close. Report, but do not tear down
        // twice — the close, if it comes, is handled above.
        this.log("provider-failure", {
          stage: "conversation",
          ms: this.openedAt ? this.now() - this.openedAt : undefined,
          category: failure.category,
          result: "error_event",
        });
        if (failure.excerpt) this.debug(`[rhodes-voice] provider error: ${failure.excerpt}`);
        this.set({ status: "error", note: NOTES.snag, retryable: true });
      },
    };
  }

  /** End the conversation on the creator's request (or on teardown). */
  async stop(source: TeardownSource = "user"): Promise<void> {
    const c = this.live;
    this.live = null;
    if (c) {
      try {
        await c.endSession();
      } catch {
        /* the socket is going away regardless */
      }
    }
    this.log("session-stopped", {
      stage: "conversation",
      result: c ? `closed_by_${source}` : `nothing_open_${source}`,
      ms: this.openedAt && c ? this.now() - this.openedAt : undefined,
    });
    if (!this.disposed) this.set({ status: "ended", note: null, retryable: false });
  }

  /**
   * Navigation / unmount. Aborts an in-flight session request, ends any open
   * conversation (closing the WebSocket and releasing the microphone), and
   * makes every later call a no-op.
   */
  async dispose(source: TeardownSource = "dispose"): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.abort?.abort();
    this.abort = null;
    await this.stop(source);
    this.listeners.clear();
  }
}
