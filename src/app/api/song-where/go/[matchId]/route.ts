import { NextResponse } from "next/server";
import { songWhereEnabled } from "@/lib/song-where/config.server";
import { assertReportAccess, currentUserId } from "@/lib/commerce/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchForRedirect, safeSubmissionUrl } from "@/lib/song-where/store.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { matchId: string } }) {
  if (!songWhereEnabled() && process.env.SONG_WHERE_PRIVATE_ENABLED !== "true")
    return new Response(null, { status: 404 });
  try {
    const db = createAdminClient();
    const match = await matchForRedirect(db, params.matchId);
    if (!match) return new Response(null, { status: 404 });
    if (match.accessClass === "PRIVATE_TO_CREATOR"
      ? process.env.SONG_WHERE_PRIVATE_ENABLED !== "true" : !songWhereEnabled())
      return new Response(null, { status: 404 });
    const [creatorId, access] = await Promise.all([currentUserId(), assertReportAccess(match.scanId)]);
    if (creatorId !== match.creatorId || !access.ok) return new Response(null, { status: 403 });
    const destination = safeSubmissionUrl(match.url);
    if (!destination) return new Response(null, { status: 404 });
    const { error } = await db.from("submission_clicks").insert({ match_id: params.matchId });
    if (error) throw error;
    return NextResponse.redirect(destination, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    console.error("[song-where] redirect failed");
    return new Response(null, { status: 503 });
  }
}
