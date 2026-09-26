import { NextResponse } from "next/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { claimPath, completeClaim, verifiedCreatorId } from "@/lib/outreach/claim.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /claim/[token]/open — where the claim's magic link continues after
 * /auth/callback has turned it into a session.
 *
 * Claims the item for the signed-in, email-verified creator (their own copy
 * of the analysis and report, the entitlement, claimed_at) and sends them to
 * the report. Anyone not signed in, and any link that is used by someone
 * else or expired, goes back to /claim/[token], which explains.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const url = new URL(req.url);
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url.origin), 303);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };
  const back = claimPath(params.token);
  if (!adminConfigured()) return go(back);

  const creatorId = await verifiedCreatorId();
  if (!creatorId) return go(back);

  try {
    const result = await completeClaim(createAdminClient(), params.token, creatorId);
    if ((result.outcome === "claimed" || result.outcome === "already_yours") && result.scanId) {
      return go(`/scan/${result.scanId}/preview`);
    }
    console.warn(`[claim] open refused: ${result.outcome}`);
  } catch (err) {
    console.error("[claim] claim failed:", err);
  }
  return go(back);
}
