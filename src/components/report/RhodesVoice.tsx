"use client";

/**
 * The Dr. Rhodes voice moment.
 *
 * This is a thin experience layer over the existing production ElevenLabs
 * agent. It is deliberately NOT a chatbot bolted onto the page: the creator
 * sees a quiet CHRP-designed prompt after the analysis has landed —
 *
 *   "Dr. Rhodes found something."
 *   "Hear his first read."
 *
 * — taps once, and Rhodes opens with a personalised 20–40s read of THEIR
 * song. The read is composed on the server from the same governed
 * intelligence the written report displays, so voice and text cannot
 * contradict one another. After the opening the creator may continue
 * naturally in a conversation ("Talk with Dr. Rhodes") or close the panel
 * and return to the report — neither path is coerced.
 *
 * Failure is quiet. If ElevenLabs is unreachable, the configuration is wrong,
 * or the browser denies microphone permission, the report itself is
 * unaffected; the panel simply reveals a short honest note and steps aside.
 *
 * All lifecycle rules live in `RhodesVoiceSession` (pure, tested): one
 * session per click, microphone before minting, a fresh signed URL per
 * attempt, one fresh-URL retry on a pre-open failure, and full teardown on
 * stop, failure, navigation and unmount. This file only wires the browser.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import {
  RhodesVoiceSession,
  type ConnectCallbacks,
  type ConnectOptions,
  type SessionFetchResult,
  type SessionPayload,
  type VoiceState,
  type VoiceStatus,
} from "@/lib/rhodes-voice/session-controller";
import {
  logRhodesVoice,
  newRhodesRequestId,
  type RhodesVoiceEvent,
  type RhodesVoiceLogFields,
} from "@/lib/rhodes-voice/log";

async function requestMicrophone(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // The SDK opens its own stream once it starts. Release ours immediately;
  // holding both is what shows two mic dots in the tab.
  stream.getTracks().forEach((t) => t.stop());
}

async function fetchSession(scanId: string, signal: AbortSignal): Promise<SessionFetchResult> {
  const res = await fetch("/api/rhodes/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanId }),
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    let retryable = res.status === 503;
    try {
      const body = (await res.json()) as { retryable?: unknown };
      if (typeof body.retryable === "boolean") retryable = body.retryable;
    } catch {
      /* body optional */
    }
    return { ok: false, status: res.status, retryable };
  }
  return { ok: true, payload: (await res.json()) as SessionPayload };
}

async function connect(payload: SessionPayload, cb: ConnectCallbacks, options: ConnectOptions) {
  // The signed URL is used exactly here, exactly once, and not retained.
  return Conversation.startSession({
    signedUrl: payload.signedUrl,
    connectionType: "websocket",
    // The first-message override is sent only while the agent is known to
    // accept it; the controller drops it after a proven override rejection.
    ...(options.withOverrides ? { overrides: payload.overrides } : {}),
    dynamicVariables: payload.dynamicVariables,
    onConnect: ({ conversationId }) => cb.onConnected(conversationId),
    onModeChange: ({ mode }) => {
      // "speaking" here is the agent speaking; we flip the UI label so a
      // musician who knows which side is talking never has to guess.
      if (mode === "speaking") cb.onAgentSpeaking();
      else cb.onUserTurn();
    },
    onDisconnect: (details) => {
      if (details.reason === "error") {
        cb.onDisconnected({
          reason: "error",
          closeCode: details.closeCode,
          closeReason: details.closeReason,
          message: details.message,
        });
      } else if (details.reason === "agent") {
        cb.onDisconnected({ reason: "agent", closeCode: details.closeCode, closeReason: details.closeReason });
      } else {
        cb.onDisconnected({ reason: "user" });
      }
    },
    onError: (message) => cb.onError(typeof message === "string" ? message : ""),
  });
}

/** Browser lifecycle events worth a line in the PRODUCTION log too. */
const REPORTED: ReadonlySet<RhodesVoiceEvent> = new Set<RhodesVoiceEvent>([
  "microphone-granted",
  "microphone-denied",
  "websocket-opening",
  "websocket-open",
  "websocket-closed",
  "websocket-failed",
  "provider-failure",
  "retry",
  "session-started",
  "session-stopped",
  "graceful-degradation",
]);

/**
 * Console line + (for lifecycle events) a fire-and-forget beacon to the
 * entitlement-gated outcome route, so `vercel logs` shows the WebSocket half
 * of the story next to the signed-URL half. Only the closed field set is
 * sent; the server re-validates every value. Never throws, never awaited.
 */
function makeLogger(scanId: string) {
  return (event: RhodesVoiceEvent, fields: RhodesVoiceLogFields = {}) => {
    logRhodesVoice(event, fields);
    if (!REPORTED.has(event)) return;
    try {
      void fetch("/api/rhodes/session/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          scanId,
          event,
          requestId: fields.requestId,
          ms: fields.ms,
          category: fields.category,
          attempt: fields.attempt,
          result: fields.result,
          conversationId: fields.conversationId,
          closeCode: fields.closeCode,
        }),
      }).catch(() => {});
    } catch {
      /* telemetry must never affect the session */
    }
  };
}

function createSession(scanId: string): RhodesVoiceSession {
  return new RhodesVoiceSession(scanId, {
    requestMicrophone,
    fetchSession,
    connect,
    log: makeLogger(scanId),
    debug: (line) => console.warn(line),
    requestId: newRhodesRequestId,
  });
}

export function RhodesVoice({ scanId }: { scanId: string }) {
  const sessionRef = useRef<RhodesVoiceSession | null>(null);
  if (sessionRef.current === null) sessionRef.current = createSession(scanId);
  const [state, setState] = useState<VoiceState>(() => sessionRef.current!.getState());

  // Subscribe for the panel's lifetime; tear everything down on unmount and
  // on navigation away (pagehide fires for bfcache and tab close alike).
  // React StrictMode mounts twice in development: a disposed controller is
  // replaced with a fresh one so the panel is never dead on arrival.
  useEffect(() => {
    if (!sessionRef.current || sessionRef.current.isDisposed()) {
      sessionRef.current = createSession(scanId);
      setState(sessionRef.current.getState());
    }
    const session = sessionRef.current;
    const unsubscribe = session.subscribe(setState);
    const onPageHide = () => {
      void session.dispose("pagehide");
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      unsubscribe();
      void session.dispose("unmount");
    };
  }, [scanId]);

  const startConversation = useCallback(() => {
    void sessionRef.current?.start();
  }, []);

  const endConversation = useCallback(() => {
    void sessionRef.current?.stop("user");
  }, []);

  const { status, note, song, retryable } = state;
  const isLive =
    status === "connecting" ||
    status === "listening" ||
    status === "speaking" ||
    status === "requesting_mic";

  return (
    <section
      className="rhodes-voice"
      aria-labelledby="rhodes-voice-heading"
      data-status={status}
    >
      <div className="rhodes-voice-inner">
        <p className="rhodes-voice-kicker">Dr. Rhodes found something</p>
        <h2 id="rhodes-voice-heading" className="rhodes-voice-title">
          {song ? `About "${song.title}"` : "Hear his first read on your song."}
        </h2>
        <p className="rhodes-voice-note">
          A short spoken observation grounded in the same CHRP measurements
          the report is built on. Listen once, or continue the conversation.
        </p>

        {status === "idle" || status === "ended" || status === "error" ? (
          <div className="rhodes-voice-actions">
            {status !== "error" || retryable ? (
              <button
                type="button"
                className="btn btn-y rhodes-voice-cta"
                onClick={startConversation}
                disabled={isLive}
              >
                {status === "ended"
                  ? "Talk with Dr. Rhodes again"
                  : status === "error"
                    ? "Try again"
                    : "Hear Dr. Rhodes"}
              </button>
            ) : null}
            {note ? (
              <p className="rhodes-voice-error" role="status">
                {note}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rhodes-voice-live" aria-live="polite">
            <RhodesVoiceIndicator status={status} />
            <p className="rhodes-voice-status">
              {status === "requesting_mic"
                ? "Waiting for microphone…"
                : status === "connecting"
                  ? "Opening a session with Dr. Rhodes…"
                  : status === "listening"
                    ? "Dr. Rhodes is speaking. Listen, or press End to close."
                    : "Your turn. Ask Dr. Rhodes anything about this song."}
            </p>
            <button
              type="button"
              className="btn btn-ghost rhodes-voice-end"
              onClick={endConversation}
              disabled={!isLive}
            >
              End
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * A minimal indicator. Yellow ring pulses when Rhodes is speaking, holds
 * steady when it is the creator's turn. Nothing gimmicky — the voice is the
 * feature; this element is just an honest state signal.
 */
function RhodesVoiceIndicator({ status }: { status: VoiceStatus }) {
  return (
    <div
      className="rhodes-voice-indicator"
      data-active={status === "listening" || status === "connecting"}
      aria-hidden="true"
    >
      <span className="rhodes-voice-dot" />
    </div>
  );
}
