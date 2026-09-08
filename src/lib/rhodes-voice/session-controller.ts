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
 *   - stop, failure, navigation and unmount all end the conversation (which
 *     closes the WebSocket and releases the microphone) and abort any
 *     in-flight request;
 *   - no failure escapes: `start()` never rejects, so the report around the
 *     panel is untouched by anything that goes wrong inside it.
 *
 * Nothing here knows about the report, the API key, preparation, checkout,
 * or any upstream service. Its only network dependency is the injected
 * `fetchSession`, and its only audio dependency is the injected `connect`.
 */

import type { RhodesVoiceEvent, RhodesVoiceLogFields } from "./log";

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
  overrides: {
    agent?: { firstMessage?: string; prompt?: { prompt?: string } };
  };
  dynamicVariables: Record<string, string>;
  song: { title: string; artist: string };
}

export type SessionFetchResult =
  | { ok: true; payload: SessionPayload }
  | { ok: false; status: number; retryable: boolean };

export interface ConnectCallbacks {
  onAgentSpeaking(): void;
  onUserTurn(): void;
  onDisconnected(reason: "user" | "agent" | "error"): void;
  onError(): void;
}

export interface LiveConversation {
  endSession(): Promise<unknown>;
}

export interface VoiceSessionDeps {
  /** Resolve when the browser has granted microphone access; reject otherwise. */
  requestMicrophone(): Promise<void>;
  /** POST /api/rhodes/session. Must honour `signal`. */
  fetchSession(scanId: string, signal: AbortSignal): Promise<SessionFetchResult>;
  /** Open the WebSocket conversation with this (fresh) payload. */
  connect(payload: SessionPayload, callbacks: ConnectCallbacks): Promise<LiveConversation>;
  /** Structured `[rhodes-voice]` logging. */
  log?: (event: RhodesVoiceEvent, fields?: RhodesVoiceLogFields) => void;
  /**
   * Whether a `connect` rejection happened BEFORE the conversation opened
   * (handshake refused, socket closed before metadata). Only such failures
   * earn the single fresh-URL retry. Defaults to the ElevenLabs SDK's
   * `SessionConnectionError`.
   */
  isPreOpenFailure?(err: unknown): boolean;
  requestId?(): string;
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

  private set(patch: Partial<VoiceState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  private log(event: RhodesVoiceEvent, fields?: RhodesVoiceLogFields): void {
    try {
      this.deps.log?.(event, fields);
    } catch {
      /* logging must never affect the session */
    }
  }

  /**
   * Begin one session. Resolves to what happened; never rejects.
   * Re-entrant calls while busy are ignored (`"ignored"`).
   */
  async start(): Promise<"started" | "ignored" | "mic_denied" | "failed"> {
    if (this.disposed || this.inFlight || this.live) return "ignored";
    this.inFlight = true;
    const requestId = (this.deps.requestId ?? defaultRequestId)();
    this.set({ status: "requesting_mic", note: null, retryable: false });
    this.log("session-requested", { requestId, stage: "click" });

    try {
      // 1. Microphone consent BEFORE anything is minted. A denial is a user
      //    decision, not an error worth an upstream round-trip.
      this.log("microphone-requested", { requestId, stage: "microphone" });
      try {
        await this.deps.requestMicrophone();
      } catch {
        this.log("microphone-denied", { requestId, stage: "microphone" });
        this.set({ status: "error", note: NOTES.mic, retryable: true });
        return "mic_denied";
      }
      this.log("microphone-granted", { requestId, stage: "microphone" });
      if (this.disposed) return "failed";

      this.set({ status: "connecting" });
      this.abort = new AbortController();

      for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
        // 2. A FRESH signed URL for every attempt. Never reuse one.
        let fetched: SessionFetchResult;
        try {
          fetched = await this.deps.fetchSession(this.scanId, this.abort.signal);
        } catch {
          if (this.disposed) return "failed";
          this.log("graceful-degradation", { requestId, stage: "session", result: "fetch_threw", attempt });
          this.set({ status: "error", note: NOTES.connect, retryable: true });
          return "failed";
        }
        if (this.disposed) return "failed";
        if (!fetched.ok) {
          this.log("graceful-degradation", {
            requestId,
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
          this.log("graceful-degradation", { requestId, stage: "websocket", result: "reused_url_refused", attempt });
          this.set({ status: "error", note: NOTES.open, retryable: true });
          return "failed";
        }
        this.usedSignedUrls.add(payload.signedUrl);
        this.set({ song: payload.song });

        // 3. Connect immediately — the URL is short-lived.
        this.log("websocket-opening", { requestId, stage: "websocket", attempt });
        const opened = Date.now();
        try {
          const conv = await this.deps.connect(payload, this.callbacks());
          if (this.disposed) {
            // Unmounted while the handshake was in flight: close at once.
            await conv.endSession().catch(() => {});
            return "failed";
          }
          this.live = conv;
          this.log("websocket-open", { requestId, stage: "websocket", ms: Date.now() - opened, attempt });
          this.set({ status: "listening", note: null, retryable: false });
          this.log("session-started", { requestId, stage: "conversation", attempt });
          return "started";
        } catch (err) {
          const preOpen = (this.deps.isPreOpenFailure ?? defaultIsPreOpen)(err);
          this.log("websocket-failed", {
            requestId,
            stage: "websocket",
            ms: Date.now() - opened,
            attempt,
            result: preOpen ? "pre_open" : "other",
          });
          if (this.disposed) return "failed";
          if (preOpen && attempt < MAX_CONNECT_ATTEMPTS) {
            // The failed URL is already recorded as used; loop mints a new one.
            this.log("retry", { requestId, stage: "websocket", attempt: attempt + 1 });
            continue;
          }
          this.log("graceful-degradation", { requestId, stage: "websocket", result: "gave_up", attempt });
          this.set({ status: "error", note: NOTES.open, retryable: true });
          return "failed";
        }
      }
      return "failed";
    } finally {
      this.inFlight = false;
      this.abort = null;
    }
  }

  private callbacks(): ConnectCallbacks {
    return {
      onAgentSpeaking: () => {
        if (this.live) this.set({ status: "listening" });
      },
      onUserTurn: () => {
        if (this.live) this.set({ status: "speaking" });
      },
      onDisconnected: (reason) => {
        if (!this.live) return;
        this.live = null;
        this.log("websocket-closed", { stage: "websocket", result: reason });
        if (reason === "error") {
          this.set({ status: "error", note: NOTES.snag, retryable: true });
        } else {
          this.set({ status: "ended" });
        }
      },
      onError: () => {
        this.log("graceful-degradation", { stage: "conversation", result: "sdk_error" });
        this.set({ status: "error", note: NOTES.snag, retryable: true });
      },
    };
  }

  /** End the conversation on the creator's request. */
  async stop(): Promise<void> {
    const c = this.live;
    this.live = null;
    if (c) {
      try {
        await c.endSession();
      } catch {
        /* the socket is going away regardless */
      }
    }
    this.log("session-stopped", { stage: "conversation", result: c ? "closed" : "nothing_open" });
    if (!this.disposed) this.set({ status: "ended", note: null, retryable: false });
  }

  /**
   * Navigation / unmount. Aborts an in-flight session request, ends any open
   * conversation (closing the WebSocket and releasing the microphone), and
   * makes every later call a no-op.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.abort?.abort();
    this.abort = null;
    await this.stop();
    this.listeners.clear();
  }
}
