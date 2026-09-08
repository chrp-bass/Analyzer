/**
 * A small, typed, server-only ElevenLabs client for ONE operation: minting a
 * signed conversation URL for the Dr. Rhodes agent.
 *
 * Contract (ElevenLabs Agents, signed-URL authentication):
 *
 *   GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url
 *       ?agent_id=<agent id>
 *   header  xi-api-key: <workspace key>      (server-only, never the browser)
 *   200     { "signed_url": "wss://…" }      (temporary, single-session)
 *
 * Behaviour:
 *   - explicit per-attempt timeout (AbortController) and a strict total
 *     deadline across attempts;
 *   - retries ONLY transient failures — network errors, 408, 429, 5xx — with
 *     exponential backoff and full jitter;
 *   - never retries 400/401/403/404/422 (or any other 4xx);
 *   - never logs, caches, or returns anything but the classification of an
 *     upstream failure. The signed URL is returned once to the caller and is
 *     not retained here. The API key never appears in a result or a log line.
 */

import "server-only";
import type { RhodesVoiceConfig } from "./config";
import { logRhodesVoice, type RhodesVoiceLogger } from "./log";

export const SIGNED_URL_ENDPOINT =
  "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

/** Sanitised classification of an upstream failure. Safe to log and return. */
export type UpstreamFailureCategory =
  | "invalid_api_key" // 401, upstream says the key is not valid
  | "needs_authorization" // 401, upstream saw no key at all
  | "missing_permissions" // 401/403, key lacks the Agents permission
  | "unauthorized" // 401 with an unrecognised body
  | "forbidden" // 403
  | "agent_not_found" // 404
  | "invalid_request" // 400 / 422
  | "client_error" // any other 4xx
  | "rate_limited" // 429 (retried)
  | "upstream_unavailable" // 5xx (retried)
  | "timeout" // 408, aborted attempt, or deadline exhausted (retried)
  | "network" // fetch threw (retried)
  | "malformed_response"; // 2xx without a usable signed_url

export type MintSignedUrlResult =
  | {
      ok: true;
      signedUrl: string;
      agentId: string;
      attempts: number;
      ms: number;
    }
  | {
      ok: false;
      category: UpstreamFailureCategory;
      retryable: boolean;
      upstreamStatus?: number;
      upstreamRequestId?: string;
      attempts: number;
      ms: number;
    };

export interface MintSignedUrlOptions {
  config: RhodesVoiceConfig;
  /** Correlates every log line of this attempt. Never secret. */
  requestId: string;
  fetchImpl?: typeof fetch;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Total budget across attempts and backoff. */
  deadlineMs?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  log?: RhodesVoiceLogger;
}

const DEFAULTS = {
  timeoutMs: 4000,
  deadlineMs: 9000,
  maxAttempts: 3,
  baseBackoffMs: 250,
  maxBackoffMs: 2000,
};

const RETRYABLE: ReadonlySet<UpstreamFailureCategory> = new Set<UpstreamFailureCategory>([
  "rate_limited",
  "upstream_unavailable",
  "timeout",
  "network",
]);

/** Upstream `detail.status` values are short snake_case tokens. */
const SAFE_STATUS = /^[a-z_]{1,48}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

type AttemptOutcome =
  | { ok: true; signedUrl: string }
  | {
      ok: false;
      category: UpstreamFailureCategory;
      upstreamStatus?: number;
      upstreamRequestId?: string;
    };

/** Pull only the safe, enumerable parts of an ElevenLabs error body. */
function readErrorBody(text: string): { status?: string; requestId?: string } {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    const detail = parsed?.detail;
    if (!detail || typeof detail !== "object") return {};
    const d = detail as { status?: unknown; request_id?: unknown };
    return {
      status: typeof d.status === "string" && SAFE_STATUS.test(d.status) ? d.status : undefined,
      requestId:
        typeof d.request_id === "string" && SAFE_REQUEST_ID.test(d.request_id)
          ? d.request_id
          : undefined,
    };
  } catch {
    return {};
  }
}

function headerRequestId(res: Response): string | undefined {
  for (const h of ["request-id", "x-request-id"]) {
    const v = res.headers.get(h);
    if (v && SAFE_REQUEST_ID.test(v)) return v;
  }
  return undefined;
}

/** Map an HTTP status (+ the safe upstream status token) to a category. */
export function classifyUpstreamStatus(
  status: number,
  upstreamStatusToken?: string,
): UpstreamFailureCategory {
  if (status === 401) {
    switch (upstreamStatusToken) {
      case "invalid_api_key":
        return "invalid_api_key";
      case "needs_authorization":
        return "needs_authorization";
      case "missing_permissions":
        return "missing_permissions";
      default:
        return "unauthorized";
    }
  }
  if (status === 403) {
    return upstreamStatusToken === "missing_permissions" ? "missing_permissions" : "forbidden";
  }
  if (status === 404) return "agent_not_found";
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_unavailable";
  return "client_error";
}

export function isRetryableCategory(category: UpstreamFailureCategory): boolean {
  return RETRYABLE.has(category);
}

async function attemptOnce(
  config: RhodesVoiceConfig,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<AttemptOutcome> {
  const url = `${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(config.agentId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { "xi-api-key": config.apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted =
      controller.signal.aborted ||
      (err instanceof Error && err.name === "AbortError");
    return { ok: false, category: aborted ? "timeout" : "network" };
  }

  try {
    if (!response.ok) {
      let text = "";
      try {
        text = await response.text();
      } catch {
        /* body unreadable — classification falls back to the status alone */
      }
      const body = readErrorBody(text);
      return {
        ok: false,
        category: classifyUpstreamStatus(response.status, body.status),
        upstreamStatus: response.status,
        upstreamRequestId: body.requestId ?? headerRequestId(response),
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { ok: false, category: "malformed_response", upstreamStatus: response.status };
    }
    const signedUrl =
      json && typeof json === "object"
        ? (json as { signed_url?: unknown }).signed_url
        : undefined;
    if (typeof signedUrl !== "string" || !signedUrl.startsWith("wss://")) {
      return { ok: false, category: "malformed_response", upstreamStatus: response.status };
    }
    return { ok: true, signedUrl };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mint one fresh signed URL. The result is handed to exactly one caller and
 * must be connected immediately — it is never cached or reused.
 */
export async function mintSignedUrl(opts: MintSignedUrlOptions): Promise<MintSignedUrlResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs;
  const deadlineMs = opts.deadlineMs ?? DEFAULTS.deadlineMs;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULTS.maxAttempts);
  const baseBackoffMs = opts.baseBackoffMs ?? DEFAULTS.baseBackoffMs;
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULTS.maxBackoffMs;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? logRhodesVoice;
  const { requestId } = opts;

  const started = now();
  const elapsed = () => now() - started;

  log("signed-url-requested", { requestId, stage: "mint" });

  let attempt = 0;
  let last: Extract<AttemptOutcome, { ok: false }> = { ok: false, category: "timeout" };

  while (attempt < maxAttempts) {
    attempt += 1;
    const remaining = deadlineMs - elapsed();
    if (remaining <= 0) {
      last = { ok: false, category: "timeout" };
      break;
    }

    const attemptStarted = now();
    const outcome = await attemptOnce(opts.config, fetchImpl, Math.min(timeoutMs, remaining));
    const attemptMs = now() - attemptStarted;

    if (outcome.ok) {
      log("signed-url-succeeded", { requestId, stage: "mint", ms: elapsed(), attempt });
      return {
        ok: true,
        signedUrl: outcome.signedUrl,
        agentId: opts.config.agentId,
        attempts: attempt,
        ms: elapsed(),
      };
    }

    last = outcome;
    log("signed-url-failed", {
      requestId,
      stage: "mint",
      ms: attemptMs,
      upstreamStatus: outcome.upstreamStatus,
      category: outcome.category,
      attempt,
    });

    if (!isRetryableCategory(outcome.category) || attempt >= maxAttempts) break;

    // Exponential backoff with full jitter, capped, and never past the deadline.
    const ceiling = Math.min(maxBackoffMs, baseBackoffMs * 2 ** (attempt - 1));
    const backoff = Math.floor(ceiling * Math.min(1, Math.max(0, random())));
    if (elapsed() + backoff >= deadlineMs) break;
    log("retry", { requestId, stage: "mint", ms: backoff, attempt: attempt + 1, category: outcome.category });
    await sleep(backoff);
  }

  return {
    ok: false,
    category: last.category,
    retryable: isRetryableCategory(last.category),
    upstreamStatus: last.upstreamStatus,
    upstreamRequestId: last.upstreamRequestId,
    attempts: attempt,
    ms: elapsed(),
  };
}
