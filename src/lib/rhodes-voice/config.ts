/**
 * Dr. Rhodes voice — server configuration.
 *
 * Two variables, both server-only, both required in production:
 *
 *   ELEVENLABS_API_KEY          the permanent workspace key (Sensitive in Vercel)
 *   ELEVENLABS_RHODES_AGENT_ID  the DR Rhodes agent id (plain, auditable)
 *
 * There is deliberately NO hard-coded fallback for either value. A missing or
 * malformed variable is a typed configuration error the route turns into an
 * honest 503 and a `[rhodes-voice] event=configuration-invalid` log line that
 * names the variable and the defect — never the value.
 *
 * Pure module: no Next, no `server-only` import, so the validation rules can
 * be unit-tested directly. The only caller that reads `process.env` is the
 * server-side signed-URL facade.
 */

export const API_KEY_ENV = "ELEVENLABS_API_KEY";
export const AGENT_ID_ENV = "ELEVENLABS_RHODES_AGENT_ID";

export type RhodesVoiceConfigErrorCode =
  | "missing_api_key"
  | "malformed_api_key"
  | "missing_agent_id"
  | "malformed_agent_id";

/**
 * A configuration defect. `variable` and `code` are safe to log; the message
 * never contains the offending value.
 */
export class RhodesVoiceConfigError extends Error {
  override readonly name = "RhodesVoiceConfigError";
  constructor(
    readonly code: RhodesVoiceConfigErrorCode,
    readonly variable: string,
    readonly hint: string,
  ) {
    super(`${variable}: ${hint} [${code}]`);
  }
}

export interface RhodesVoiceConfig {
  /** Trimmed. Never leaves the server. */
  readonly apiKey: string;
  /** Trimmed. Not a secret, but validated so a paste error is caught here. */
  readonly agentId: string;
}

/** ElevenLabs agent ids are short URL-safe tokens (e.g. 20 chars). */
const AGENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** Printable ASCII, no whitespace. Length bounds catch truncated pastes. */
const API_KEY_RE = /^[\x21-\x7E]{16,256}$/;
const QUOTE_RE = /^["'`]|["'`]$/;
const PLACEHOLDERS = new Set(["undefined", "null", "none", "changeme", "todo"]);

function readVariable(
  env: Record<string, string | undefined>,
  variable: string,
  codes: { missing: RhodesVoiceConfigErrorCode; malformed: RhodesVoiceConfigErrorCode },
  pattern: RegExp,
): string {
  const raw = env[variable];
  if (raw === undefined || raw === null) {
    throw new RhodesVoiceConfigError(codes.missing, variable, "is not set");
  }
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) {
    throw new RhodesVoiceConfigError(codes.missing, variable, "is empty or whitespace only");
  }
  if (QUOTE_RE.test(trimmed)) {
    throw new RhodesVoiceConfigError(
      codes.malformed,
      variable,
      "is wrapped in quotes — store the bare value",
    );
  }
  if (/\s/.test(trimmed)) {
    throw new RhodesVoiceConfigError(
      codes.malformed,
      variable,
      "contains internal whitespace or a line break",
    );
  }
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) {
    throw new RhodesVoiceConfigError(codes.malformed, variable, "is a placeholder value");
  }
  if (!pattern.test(trimmed)) {
    throw new RhodesVoiceConfigError(
      codes.malformed,
      variable,
      "does not look like a valid value (length or character set)",
    );
  }
  return trimmed;
}

/**
 * Read and validate both variables. Throws `RhodesVoiceConfigError` on the
 * first defect. Callers that want a result instead of a throw use
 * `resolveRhodesVoiceConfig`.
 */
export function readRhodesVoiceConfig(
  env: Record<string, string | undefined> = process.env,
): RhodesVoiceConfig {
  const apiKey = readVariable(
    env,
    API_KEY_ENV,
    { missing: "missing_api_key", malformed: "malformed_api_key" },
    API_KEY_RE,
  );
  const agentId = readVariable(
    env,
    AGENT_ID_ENV,
    { missing: "missing_agent_id", malformed: "malformed_agent_id" },
    AGENT_ID_RE,
  );
  return Object.freeze({ apiKey, agentId });
}

export type RhodesVoiceConfigResult =
  | { ok: true; config: RhodesVoiceConfig }
  | { ok: false; error: RhodesVoiceConfigError };

export function resolveRhodesVoiceConfig(
  env: Record<string, string | undefined> = process.env,
): RhodesVoiceConfigResult {
  try {
    return { ok: true, config: readRhodesVoiceConfig(env) };
  } catch (err) {
    if (err instanceof RhodesVoiceConfigError) return { ok: false, error: err };
    throw err;
  }
}
