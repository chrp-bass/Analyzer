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
 * Failure is quiet. If ElevenLabs is unreachable, the API key is missing, or
 * the browser denies microphone permission, the report itself is unaffected;
 * the panel simply reveals a short honest note and steps aside.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";

type Status =
  | "idle"
  | "requesting_mic"
  | "connecting"
  | "listening" // Rhodes is speaking (first-read or reply)
  | "speaking" // the creator is speaking
  | "ended"
  | "error";

interface SessionPayload {
  signedUrl: string;
  agentId: string;
  overrides: {
    agent?: { firstMessage?: string; prompt?: { prompt?: string } };
  };
  dynamicVariables: Record<string, string>;
  song: { title: string; artist: string };
}

/** One live conversation. The SDK object surface we actually use. */
interface LiveConversation {
  endSession(): Promise<unknown>;
}

export function RhodesVoice({ scanId }: { scanId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const [song, setSong] = useState<{ title: string; artist: string } | null>(
    null,
  );
  const convRef = useRef<LiveConversation | null>(null);

  // Clean up any live conversation on unmount so a stale WebSocket cannot
  // linger behind a route change.
  useEffect(() => {
    return () => {
      const c = convRef.current;
      convRef.current = null;
      if (c) c.endSession().catch(() => {});
    };
  }, []);

  const startConversation = useCallback(async () => {
    setErrorNote(null);
    setStatus("requesting_mic");

    // Microphone consent BEFORE we mint the signed URL — that URL has a short
    // TTL and burning one on a browser that will then refuse audio is waste.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The SDK opens its own stream once it starts. Release ours immediately;
      // holding both is what shows two mic dots in the tab.
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setStatus("error");
      setErrorNote(
        "This browser didn't grant microphone access. You can still read the report below.",
      );
      return;
    }

    setStatus("connecting");
    let session: SessionPayload;
    try {
      const res = await fetch("/api/rhodes/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId }),
      });
      if (!res.ok) {
        setStatus("error");
        setErrorNote(
          res.status === 503
            ? "Voice is unavailable right now. The report below is unaffected."
            : "Rhodes couldn't connect just now. The report below is unaffected.",
        );
        return;
      }
      session = (await res.json()) as SessionPayload;
      setSong(session.song);
    } catch {
      setStatus("error");
      setErrorNote(
        "Rhodes couldn't connect just now. The report below is unaffected.",
      );
      return;
    }

    try {
      const conv = await Conversation.startSession({
        signedUrl: session.signedUrl,
        connectionType: "websocket",
        overrides: session.overrides,
        dynamicVariables: session.dynamicVariables,
        onStatusChange: ({ status: s }) => {
          if (s === "disconnected") setStatus((prev) =>
            prev === "error" ? prev : "ended",
          );
        },
        onModeChange: ({ mode }) => {
          // "speaking" here is agent speaking; we flip the UI label so a
          // musician who knows which side is talking never has to guess.
          if (mode === "speaking") setStatus("listening");
          else setStatus("speaking");
        },
        onError: (message) => {
          setStatus("error");
          setErrorNote(
            typeof message === "string" && message
              ? "Rhodes hit a snag. The report below is unaffected."
              : "Rhodes hit a snag. The report below is unaffected.",
          );
        },
      });
      convRef.current = conv as unknown as LiveConversation;
    } catch {
      setStatus("error");
      setErrorNote(
        "Rhodes couldn't open a session. The report below is unaffected.",
      );
    }
  }, [scanId]);

  const endConversation = useCallback(async () => {
    const c = convRef.current;
    convRef.current = null;
    if (c) {
      try {
        await c.endSession();
      } catch {
        /* discard — the panel is going away anyway */
      }
    }
    setStatus("ended");
  }, []);

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
          {song
            ? `About "${song.title}"`
            : "Hear his first read on your song."}
        </h2>
        <p className="rhodes-voice-note">
          A short spoken observation grounded in the same CHRP measurements
          the report is built on. Listen once, or continue the conversation.
        </p>

        {status === "idle" || status === "ended" || status === "error" ? (
          <div className="rhodes-voice-actions">
            <button
              type="button"
              className="btn btn-y rhodes-voice-cta"
              onClick={startConversation}
            >
              {status === "ended"
                ? "Talk with Dr. Rhodes again"
                : status === "error"
                  ? "Try again"
                  : "Hear Dr. Rhodes"}
            </button>
            {errorNote ? (
              <p className="rhodes-voice-error" role="status">
                {errorNote}
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
function RhodesVoiceIndicator({ status }: { status: Status }) {
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
