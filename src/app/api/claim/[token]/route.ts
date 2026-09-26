import { NextResponse } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { normalizeClaimEmail } from "@/lib/outreach/claim";
import { sendClaimLink } from "@/lib/outreach/claim.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * POST /api/claim/[token]   { email }
 *
 * Sends the magic link for an open claim. Nothing is claimed here — that
 * happens only once the link has proven the address (/claim/[token]/open).
 *
 *   200 { email }    link sent
 *   400 { error }    bad email
 *   410 { state }    link used, expired or unknown
 *   503 { error }    identity or email not configured, or the send failed
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!adminConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  let email: string | null = null;
  try {
    email = normalizeClaimEmail(((await req.json()) as { email?: unknown }).email);
  } catch {
    email = null;
  }
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400, headers: NO_STORE });

  const result = await sendClaimLink(createAdminClient(), params.token, email);
  if (result.ok) return NextResponse.json({ email }, { headers: NO_STORE });
  if (result.reason === "not_open") {
    return NextResponse.json({ state: result.state }, { status: 410, headers: NO_STORE });
  }
  return NextResponse.json({ error: result.reason }, { status: 503, headers: NO_STORE });
}
