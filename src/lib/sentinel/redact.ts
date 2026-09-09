/**
 * Sanitisation for everything the sentinel emits.
 *
 * Provider error messages, thrown exceptions and response bodies are treated
 * as hostile: a Stripe error can echo a key prefix, a PostgREST error can echo
 * a row, an ElevenLabs body can echo a signed URL. Every string that reaches a
 * summary or evidence field goes through `sanitizeText`, and the finished
 * report goes through `sanitizeDeep` once more before it leaves the process.
 *
 * Rules (applied in order):
 *   - known secret shapes are replaced with a typed marker
 *   - URLs, e-mails, UUIDs, JWTs, scan ids and long opaque tokens are replaced
 *   - control characters are dropped, whitespace collapsed, length capped
 *
 * A handful of keys carry identifiers that are deliberately public evidence
 * (the git SHA, the Vercel deployment id, text fingerprints). Those values
 * survive `sanitizeDeep` only if they match a strict identifier shape.
 */

const MAX_LEN = 240;

const PATTERNS: Array<[RegExp, string]> = [
  // Vendor secret shapes first, before the generic token rule can eat them.
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/g, "<stripe-key>"],
  [/\bwhsec_[A-Za-z0-9]+/g, "<stripe-webhook-secret>"],
  [/\bcs_(live|test)_[A-Za-z0-9]+/g, "<stripe-session>"],
  [/\b(pi|cus|ch|evt|price|prod|we|acct)_[A-Za-z0-9]{8,}/g, "<stripe-id>"],
  [/\bxi-api-key\b[^\s,;]*/gi, "<xi-api-key>"],
  [/\bsk_[A-Za-z0-9]{16,}/g, "<api-key>"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "<jwt>"],
  [/\bwss?:\/\/[^\s"'<>]+/gi, "<socket-url>"],
  [/\bhttps?:\/\/[^\s"'<>]+/gi, "<url>"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>"],
  [/\bscn_[a-z0-9-]+_[a-z0-9]{6}\b/g, "<scan-id>"],
  [/\b(?:[A-Za-z0-9+/_-]{32,}={0,2})\b/g, "<token>"],
  [/\b[0-9a-f]{32,}\b/gi, "<hex>"],
];

/** Keys whose values are public identifiers, kept when they look like one. */
const IDENTIFIER_KEYS = new Set([
  "sha",
  "expectedSha",
  "deploymentId",
  "ref",
  "region",
  "env",
  "liveFingerprint",
  "canonicalFingerprint",
  "vercelId",
]);
const IDENTIFIER_SHAPE = /^[A-Za-z0-9_.:/-]{1,80}$/;
/** The sentinel's own target origin is public evidence, kept when it is a bare https origin. */
const ORIGIN_KEYS = new Set(["baseUrl"]);
const ORIGIN_SHAPE = /^https:\/\/[A-Za-z0-9.-]{1,120}\/?$/;

export function sanitizeText(input: unknown, maxLen: number = MAX_LEN): string {
  let s: string;
  if (input instanceof Error) s = input.message || input.name;
  else if (typeof input === "string") s = input;
  else if (input === undefined || input === null) s = "";
  else {
    try {
      s = JSON.stringify(input);
    } catch {
      s = String(input);
    }
  }
  for (const [re, replacement] of PATTERNS) s = s.replace(re, replacement);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return s;
}

/** Walk a JSON-like value and sanitise every string leaf. */
export function sanitizeDeep<T>(value: T, key?: string): T {
  if (typeof value === "string") {
    if (key && IDENTIFIER_KEYS.has(key) && IDENTIFIER_SHAPE.test(value)) return value;
    if (key && ORIGIN_KEYS.has(key) && ORIGIN_SHAPE.test(value)) return value;
    return sanitizeText(value, 2000) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[sanitizeText(k, 80)] = sanitizeDeep(v, k);
    }
    return out as T;
  }
  return value;
}

/** A short, non-reversible fingerprint for "did the text change" evidence. */
export async function fingerprint(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
