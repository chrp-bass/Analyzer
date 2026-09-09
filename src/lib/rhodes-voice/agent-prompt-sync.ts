/**
 * Rewrites the governed constants in `agent-prompt.ts` from an export of the
 * live ElevenLabs agent (`GET /api/health/rhodes-agent`), byte-for-byte.
 *
 * Pure: takes the current source text and the live text, returns the new
 * source. The CLI in `scripts/rhodes-voice-agent-sync.mts` does the file I/O.
 * Template-literal escaping is exact and round-trip tested, so a prompt that
 * contains backticks, `${`, backslashes or CRLF survives unchanged.
 */

export interface LiveAgentText {
  systemPrompt: string;
  firstMessage: string;
}

/** Escape text for a JavaScript template literal so it evaluates to itself. */
export function escapeTemplateLiteral(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/\r/g, "\\r");
}

const FIRST_MESSAGE_RE = /(export const RHODES_VOICE_FIRST_MESSAGE =\s*)`(?:[^`\\]|\\[\s\S])*`;/;
const SYSTEM_PROMPT_RE = /(export const RHODES_VOICE_SYSTEM_PROMPT = )`(?:[^`\\]|\\[\s\S])*`;/;

export function applyLiveAgentText(source: string, live: LiveAgentText): string {
  if (!FIRST_MESSAGE_RE.test(source)) throw new Error("RHODES_VOICE_FIRST_MESSAGE template literal not found");
  if (!SYSTEM_PROMPT_RE.test(source)) throw new Error("RHODES_VOICE_SYSTEM_PROMPT template literal not found");
  const first = `\`${escapeTemplateLiteral(live.firstMessage)}\`;`;
  const prompt = `\`${escapeTemplateLiteral(live.systemPrompt)}\`;`;
  return source
    .replace(FIRST_MESSAGE_RE, (_m, lead: string) => `${lead}${first}`)
    .replace(SYSTEM_PROMPT_RE, (_m, lead: string) => `${lead}${prompt}`);
}

/** Validate an export document; returns the two texts or throws (message only). */
export function readLiveAgentExport(json: unknown): LiveAgentText & { agentId: string; placeholders: string[] } {
  if (!json || typeof json !== "object") throw new Error("export is not an object");
  const j = json as Record<string, unknown>;
  if (j.kind !== "rhodes-agent-export" || j.schemaVersion !== 1) throw new Error("export has an unexpected kind or schemaVersion");
  if (typeof j.systemPrompt !== "string" || j.systemPrompt.length === 0) throw new Error("export has no systemPrompt");
  if (typeof j.firstMessage !== "string" || j.firstMessage.length === 0) throw new Error("export has no firstMessage");
  if (typeof j.agentId !== "string") throw new Error("export has no agentId");
  return {
    systemPrompt: j.systemPrompt,
    firstMessage: j.firstMessage,
    agentId: j.agentId,
    placeholders: Array.isArray(j.placeholders) ? j.placeholders.filter((p): p is string => typeof p === "string") : [],
  };
}
