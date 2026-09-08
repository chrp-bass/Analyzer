/**
 * Classify a post-open provider failure — a WebSocket close code + reason, or
 * an SDK error message — into a small enumerated category that is safe to log
 * and act on.
 *
 * The raw reason string is provider text (never a secret), but it is free
 * text and therefore never reaches a structured log line; only the category
 * and the numeric close code do. The browser console may print a short,
 * printable, truncated excerpt so a human running the one foreground test can
 * read the provider's exact words.
 *
 * Pure module: no DOM, no React, no SDK.
 */

export type ProviderFailureCategory =
  | "override_rejected" // conversation_config_override for a field the agent's Security tab does not allow
  | "dynamic_variables_missing" // prompt/first message references a variable the client did not send
  | "auth" // signed URL expired / signature invalid / agent requires authorization
  | "quota" // credits, concurrency or plan limits
  | "voice_unavailable" // configured TTS voice missing or inaccessible
  | "llm" // model / LLM configuration failure
  | "max_duration" // provider ended the session at its configured cap
  | "agent_ended" // provider-side normal end (end_call or 1000)
  | "network" // 1006 abnormal closure / no close frame
  | "unknown";

export interface ProviderFailure {
  category: ProviderFailureCategory;
  closeCode?: number;
  /** Printable, truncated excerpt of the provider's reason — console only. */
  excerpt: string;
}

const PATTERNS: Array<[RegExp, ProviderFailureCategory]> = [
  [/overrid|first[_ ]message|conversation_config|not (?:allowed|enabled|permitted)|security/i, "override_rejected"],
  [/dynamic[_ ]variable|missing (?:required )?variable|unresolved variable|\{\{/i, "dynamic_variables_missing"],
  [/max[_ ]duration|duration exceeded|time limit/i, "max_duration"],
  [/unauthori[sz]ed|signature|expired|forbidden|authenticat|requires auth/i, "auth"],
  [/quota|credit|concurren|limit reached|rate limit|insufficient|payment|plan/i, "quota"],
  [/voice/i, "voice_unavailable"],
  [/llm|model|completion|openai|anthropic|gemini/i, "llm"],
  [/end_call|ended the conversation|conversation ended/i, "agent_ended"],
];

/** Keep only printable ASCII, collapse whitespace, cap the length. */
export function excerptOf(text: string | undefined | null, max = 160): string {
  if (!text) return "";
  const cleaned = text.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}

export function classifyProviderFailure(input: {
  closeCode?: number;
  reason?: string | null;
  message?: string | null;
}): ProviderFailure {
  const text = `${input.reason ?? ""} ${input.message ?? ""}`.trim();
  const excerpt = excerptOf(text);
  const code = input.closeCode;

  for (const [re, category] of PATTERNS) {
    if (text && re.test(text)) return { category, closeCode: code, excerpt };
  }
  if (code === 1000) return { category: "agent_ended", closeCode: code, excerpt };
  if (code === 1006 || code === 1005 || (code === undefined && !text)) {
    return { category: "network", closeCode: code, excerpt };
  }
  return { category: "unknown", closeCode: code, excerpt };
}

/**
 * Whether a post-open failure justifies ONE fresh reconnect without the
 * conversation_config_override. Only an override rejection, or a silent close
 * that carries no reason at all (the provider sometimes drops with 1006 when
 * it refuses the initiation payload), earns it. Anything the provider names
 * explicitly — auth, quota, voice, LLM — is reported, not retried.
 */
export function warrantsOverrideFreeRetry(f: ProviderFailure): boolean {
  return f.category === "override_rejected" || (f.category === "network" && f.excerpt === "");
}
