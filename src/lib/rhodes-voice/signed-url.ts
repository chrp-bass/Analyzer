/**
 * Server-side facade the voice route calls to mint a signed conversation URL
 * for the Dr. Rhodes agent.
 *
 * Imported ONLY from server routes, behind the same entitlement check that
 * guards the paid report — never from a client component. It:
 *
 *   1. reads and validates the two server-only variables (typed error on any
 *      defect — no silent fallback to a hard-coded agent id), then
 *   2. asks the ElevenLabs client for ONE fresh signed URL.
 *
 * The permanent API key stays inside this process. The result carries the
 * temporary signed URL exactly once, for immediate use, and nothing else.
 */

import "server-only";
import {
  resolveRhodesVoiceConfig,
  type RhodesVoiceConfigErrorCode,
} from "./config";
import {
  mintSignedUrl,
  type MintSignedUrlOptions,
  type UpstreamFailureCategory,
} from "./elevenlabs";
import { logRhodesVoice, type RhodesVoiceLogger } from "./log";

export type SignedUrlResult =
  | { ok: true; signedUrl: string; agentId: string; attempts: number; ms: number }
  | {
      ok: false;
      reason: "not_configured";
      code: RhodesVoiceConfigErrorCode;
      variable: string;
      hint: string;
    }
  | {
      ok: false;
      reason: "upstream_error";
      category: UpstreamFailureCategory;
      retryable: boolean;
      upstreamStatus?: number;
      upstreamRequestId?: string;
      attempts: number;
      ms: number;
    };

export interface MintRhodesSignedUrlOptions
  extends Omit<MintSignedUrlOptions, "config" | "log"> {
  env?: Record<string, string | undefined>;
  log?: RhodesVoiceLogger;
}

export async function mintRhodesSignedUrl(
  opts: MintRhodesSignedUrlOptions,
): Promise<SignedUrlResult> {
  const log = opts.log ?? logRhodesVoice;
  const { requestId } = opts;

  const cfg = resolveRhodesVoiceConfig(opts.env ?? process.env);
  if (!cfg.ok) {
    log("configuration-invalid", {
      requestId,
      stage: "config",
      code: cfg.error.code,
      variable: cfg.error.variable,
    });
    return {
      ok: false,
      reason: "not_configured",
      code: cfg.error.code,
      variable: cfg.error.variable,
      hint: cfg.error.hint,
    };
  }
  log("configuration-valid", { requestId, stage: "config" });

  const minted = await mintSignedUrl({ ...opts, config: cfg.config, log });
  if (minted.ok) return minted;
  return { ...minted, reason: "upstream_error" };
}
