import { NextResponse } from "next/server";
import { songWhereEnabled } from "@/lib/song-where/config.server";
import { assertReportAccess, currentUserId } from "@/lib/commerce/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function creatorFor(request: Request): Promise<string | null> {
  const scanId = new URL(request.url).searchParams.get("scanId");
  if (!scanId) return null;
  const access = await assertReportAccess(scanId);
  return access.ok ? currentUserId() : null;
}

export async function GET(request: Request) {
  if (!songWhereEnabled()) return new Response(null, { status: 404 });
  try {
    const creatorId = await creatorFor(request);
    if (!creatorId) return new Response(null, { status: 403 });
    const { data, error } = await createAdminClient().from("song_where_prefs")
      .select("alerts_enabled").eq("creator_id", creatorId).limit(1);
    if (error) throw error;
    return NextResponse.json({ alertsEnabled: data?.[0]?.alerts_enabled === true },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("[song-where] prefs read failed");
    return new Response(null, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!songWhereEnabled()) return new Response(null, { status: 404 });
  try {
    const creatorId = await creatorFor(request);
    if (!creatorId) return new Response(null, { status: 403 });
    const body = await request.json() as { alertsEnabled?: unknown };
    if (typeof body.alertsEnabled !== "boolean") return new Response(null, { status: 400 });
    const { error } = await createAdminClient().from("song_where_prefs")
      .upsert({ creator_id: creatorId, alerts_enabled: body.alertsEnabled,
        updated_at: new Date().toISOString() }, { onConflict: "creator_id" });
    if (error) throw error;
    return NextResponse.json({ alertsEnabled: body.alertsEnabled });
  } catch {
    console.error("[song-where] prefs update failed");
    return new Response(null, { status: 503 });
  }
}
