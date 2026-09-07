import { NextResponse } from "next/server";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic. Delete after use.
 *
 * Reports opaque signals about the ElevenLabs credential and agent
 * configuration WITHOUT ever returning the key material. Gated by a
 * one-shot shared token; the response contains nothing an attacker could
 * use to authenticate to ElevenLabs.
 *
 * What it returns:
 *   - has_key / key_len / key_sha256_prefix   (fingerprint only)
 *   - agent_id_configured / agent_id
 *   - user_check_status  (200 = key valid, 401 = key invalid)
 *   - agent_check_status (200 = agent accessible, 401/403 = key not
 *     authorized for this agent, 404 = agent id wrong for this account)
 *   - signed_url_check_status + short body prefix (the 4xx JSON detail
 *     from ElevenLabs, up to 200 chars — no key content)
 */
const DIAG_TOKEN = "DdDSxBd5CUfPBGgt8ngRIjxKaLh43mcZ";
const DEFAULT_AGENT_ID = "vv1j1yrAGF0RdxJOSGIJ";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== DIAG_TOKEN) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const key = process.env.ELEVENLABS_API_KEY ?? "";
  const agentEnv = process.env.ELEVENLABS_RHODES_AGENT_ID ?? "";
  const agentId = agentEnv.trim().length > 0 ? agentEnv.trim() : DEFAULT_AGENT_ID;

  const fingerprint = key
    ? createHash("sha256").update(key).digest("hex").slice(0, 12)
    : null;

  const out: Record<string, unknown> = {
    has_key: Boolean(key),
    key_len: key.length,
    key_sha256_prefix: fingerprint,
    agent_id_env_set: agentEnv.length > 0,
    agent_id_effective: agentId,
    agent_id_matches_default: agentId === DEFAULT_AGENT_ID,
  };

  if (!key) {
    return NextResponse.json(out);
  }

  // Probe 1: /v1/user — pure key validity check.
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key, Accept: "application/json" },
      cache: "no-store",
    });
    out.user_check_status = r.status;
    if (!r.ok) {
      const t = await r.text();
      out.user_check_body_prefix = t.slice(0, 200);
    } else {
      // Extract only account-scope hints — no personally identifying data.
      try {
        const j = (await r.json()) as {
          subscription?: { tier?: string; status?: string };
        };
        out.user_tier = j?.subscription?.tier ?? null;
        out.user_status = j?.subscription?.status ?? null;
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    out.user_check_error = err instanceof Error ? err.message : "network";
  }

  // Probe 2: /v1/convai/agents/{agent_id} — key ↔ agent access.
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
      {
        headers: { "xi-api-key": key, Accept: "application/json" },
        cache: "no-store",
      },
    );
    out.agent_check_status = r.status;
    if (!r.ok) {
      const t = await r.text();
      out.agent_check_body_prefix = t.slice(0, 200);
    }
  } catch (err) {
    out.agent_check_error = err instanceof Error ? err.message : "network";
  }

  // Probe 3: replicate the exact call our production code makes.
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
      {
        headers: { "xi-api-key": key, Accept: "application/json" },
        cache: "no-store",
      },
    );
    out.signed_url_status = r.status;
    if (!r.ok) {
      const t = await r.text();
      out.signed_url_body_prefix = t.slice(0, 200);
    } else {
      const j = (await r.json()) as { signed_url?: string };
      out.signed_url_ok = typeof j.signed_url === "string";
    }
  } catch (err) {
    out.signed_url_error = err instanceof Error ? err.message : "network";
  }

  return NextResponse.json(out);
}
