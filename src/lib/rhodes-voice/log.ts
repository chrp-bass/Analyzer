/**
 * `[rhodes-voice]` structured lifecycle logging.
 *
 * One line per event, always the same shape, greppable by request id:
 *
 *   [rhodes-voice] event=signed-url-failed request_id=… stage=mint ms=412 upstream_status=401 category=invalid_api_key attempt=1
 *
 * The field set is CLOSED. Only the keys below can be emitted, and every
 * string value is passed through a strict character allow-list, so a signed
 * URL, an API key, a report sentence or a user identifier cannot reach a log
 * line even if a future caller passes one by mistake — it is replaced with
 * the literal `redacted`.
 *
 * Pure module: safe in the browser and on the server.
 */

export type RhodesVoiceEvent =
  | "configuration-valid"
  | "configuration-invalid"
  | "microphone-requested"
  | "microphone-granted"
  | "microphone-denied"
  | "session-requested"
  | "signed-url-requested"
  | "signed-url-succeeded"
  | "signed-url-failed"
  | "retry"
  | "websocket-opening"
  | "websocket-open"
  | "websocket-closed"
  | "websocket-failed"
  | "session-started"
  | "session-stopped"
  | "graceful-degradation"
  | "provider-failure"
  | "context-built";

export interface RhodesVoiceLogFields {
  requestId?: string;
  stage?: string;
  ms?: number;
  upstreamStatus?: number;
  category?: string;
  attempt?: number;
  result?: string;
  code?: string;
  variable?: string;
  /** ElevenLabs conversation id (opaque token) — lets ops find the record. */
  conversationId?: string;
  /** WebSocket close code, when the provider closed the socket. */
  closeCode?: number;
  /** Size of the report context handed to the agent (characters). */
  chars?: number;
}

const FIELD_ORDER: Array<[keyof RhodesVoiceLogFields, string]> = [
  ["requestId", "request_id"],
  ["stage", "stage"],
  ["ms", "ms"],
  ["upstreamStatus", "upstream_status"],
  ["category", "category"],
  ["attempt", "attempt"],
  ["result", "result"],
  ["code", "code"],
  ["variable", "variable"],
  ["conversationId", "conversation_id"],
  ["closeCode", "close_code"],
  ["chars", "chars"],
];

/** Short, URL-safe tokens only. Anything else is replaced, never truncated. */
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;

const ERROR_EVENTS = new Set<RhodesVoiceEvent>([
  "configuration-invalid",
  "signed-url-failed",
  "websocket-failed",
  "provider-failure",
]);
const WARN_EVENTS = new Set<RhodesVoiceEvent>([
  "microphone-denied",
  "graceful-degradation",
  "retry",
]);

function safeValue(v: unknown): string | null {
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v)) : null;
  if (typeof v === "string") return SAFE_TOKEN.test(v) ? v : "redacted";
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

export function formatRhodesVoiceLog(
  event: RhodesVoiceEvent,
  fields: RhodesVoiceLogFields = {},
): string {
  const parts = [`[rhodes-voice] event=${event}`];
  for (const [key, label] of FIELD_ORDER) {
    const v = safeValue(fields[key]);
    if (v !== null) parts.push(`${label}=${v}`);
  }
  return parts.join(" ");
}

export type RhodesVoiceLogSink = (line: string, level: "log" | "warn" | "error") => void;

export type RhodesVoiceLogger = (event: RhodesVoiceEvent, fields?: RhodesVoiceLogFields) => void;

const consoleSink: RhodesVoiceLogSink = (line, level) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export function createRhodesVoiceLogger(sink: RhodesVoiceLogSink = consoleSink): RhodesVoiceLogger {
  return (event, fields) => {
    const level = ERROR_EVENTS.has(event) ? "error" : WARN_EVENTS.has(event) ? "warn" : "log";
    sink(formatRhodesVoiceLog(event, fields), level);
  };
}

/** Default logger → console. */
export const logRhodesVoice: RhodesVoiceLogger = createRhodesVoiceLogger();

/** A short id for correlating one voice attempt across log lines. */
export function newRhodesRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "").slice(0, 16);
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
