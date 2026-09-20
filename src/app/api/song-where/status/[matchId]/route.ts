import { NextResponse } from "next/server";
import { songWhereEnabled } from "@/lib/song-where/config.server";
import { assertReportAccess, currentUserId } from "@/lib/commerce/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchForRedirect } from "@/lib/song-where/store.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { matchId: string } }) {
  if (!songWhereEnabled()) return new Response(null, { status: 404 });
  try {
    const body = await request.json() as { status?: unknown };
    if (body.status !== "submitted" && body.status !== "placed" && body.status !== "passed") {
      return new Response(null, { status: 400 });
    }
    const db = createAdminClient();
    const match = await matchForRedirect(db, params.matchId);
    if (!match) return new Response(null, { status: 404 });
    const [creatorId, access] = await Promise.all([currentUserId(), assertReportAccess(match.scanId)]);
    if (creatorId !== match.creatorId || !access.ok) return new Response(null, { status: 403 });
    const { data: click, error: findError } = await db.from("submission_clicks")
      .select("id").eq("match_id", params.matchId)
      .order("clicked_at", { ascending: false }).limit(1);
    if (findError) throw findError;
    const { error } = click?.[0]
      ? await db.from("submission_clicks")
        .update({ status: body.status, status_updated_at: new Date().toISOString() })
        .eq("id", click[0].id)
      : await db.from("submission_clicks")
        .insert({ match_id: params.matchId, status: body.status,
          status_updated_at: new Date().toISOString() });
    if (error) throw error;
    return NextResponse.json({ status: body.status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[song-where] status failed", error);
    return new Response(null, { status: 503 });
  }
}
