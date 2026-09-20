import { NextResponse } from "next/server";
import { songWhereEnabled } from "@/lib/song-where/config.server";
import { currentUserId, unlockedScansFor } from "@/lib/commerce/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!songWhereEnabled()) return new Response(null, { status: 404 });
  try {
    const creatorId = await currentUserId();
    if (!creatorId) return new Response(null, { status: 403 });
    const db = createAdminClient();
    const { data: analyses, error } = await db.from("analyses")
      .select("id,scan_id,songs!inner(track_key),reports!inner(id)")
      .eq("creator_id", creatorId).eq("status", "complete").limit(100);
    if (error) throw error;
    const rows = (analyses as unknown as Array<{ id: string; scan_id: string; songs: { track_key: string } }> | null) ?? [];
    const unlocked = await unlockedScansFor(creatorId,
      rows.map((row) => ({ scanId: row.scan_id, trackKey: row.songs.track_key })));
    const eligible = rows.filter((row) => unlocked.has(row.scan_id));
    if (!eligible.length) return NextResponse.json({ counts: {} });
    const { data: matches, error: matchError } = await db.from("song_opportunity_matches")
      .select("analysis_id,opportunities!inner(status,deadline,opportunity_sources!inner(active))")
      .in("analysis_id", eligible.map((row) => row.id)).eq("opportunities.status", "open")
      .eq("opportunities.opportunity_sources.active", true).limit(2000);
    if (matchError) throw matchError;
    const scanByAnalysis = new Map(eligible.map((row) => [row.id, row.scan_id]));
    const counts: Record<string, number> = {};
    for (const row of (matches ?? []) as unknown as Array<{ analysis_id: string; opportunities: { deadline: string | null } }>) {
      if (row.opportunities.deadline && row.opportunities.deadline < new Date().toISOString()) continue;
      const scanId = scanByAnalysis.get(row.analysis_id);
      if (scanId) counts[scanId] = (counts[scanId] ?? 0) + 1;
    }
    return NextResponse.json({ counts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[song-where] summary failed", error);
    return new Response(null, { status: 503 });
  }
}
