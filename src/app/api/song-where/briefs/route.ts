import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { currentUserId, unlockedScansFor } from "@/lib/commerce/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestCreatorBrief } from "@/lib/song-where/creator-brief.server";
import { hasCompletePaidReport } from "@/lib/song-where/report-eligibility.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.SONG_WHERE_PRIVATE_ENABLED !== "true") return new Response(null, { status: 404 });
  const creatorId = await currentUserId();
  if (!creatorId) return new Response(null, { status: 403 });
  try {
    const db = createAdminClient();
    const { data: analyses, error } = await db.from("analyses")
      .select("id,scan_id,songs!inner(title,track_key),reports!inner(payload)")
      .eq("creator_id", creatorId).eq("status", "complete").limit(100);
    if (error) throw error;
    const rows = (analyses ?? []) as unknown as Array<{
      id: string; scan_id: string; songs: { title: string; track_key: string };
      reports: { payload: unknown } | Array<{ payload: unknown }>;
    }>;
    const unlocked = await unlockedScansFor(creatorId,
      rows.map((row) => ({ scanId: row.scan_id, trackKey: row.songs.track_key })));
    const eligible = rows.filter((row) => unlocked.has(row.scan_id) && hasCompletePaidReport(row.reports));
    const { data: briefs, error: briefError } = await db.from("opportunities")
      .select("id,title,deadline,submission_requirement,submission_cost,specificity_tier,explicit_criteria")
      .eq("owner_creator_id", creatorId).eq("access_class", "PRIVATE_TO_CREATOR")
      .eq("status", "open").gt("deadline", new Date().toISOString()).limit(30);
    if (briefError) throw briefError;
    if (!briefs?.length) return NextResponse.json({ briefs: [],
      emailReady: process.env.SONG_WHERE_INBOUND_READY === "true" },
      { headers: { "Cache-Control": "private, no-store" } });
    const ids = eligible.map((row) => row.id);
    const { data: matches, error: matchError } = ids.length
      ? await db.from("song_opportunity_matches")
        .select("id,analysis_id,opportunity_id,fit_band,match_score")
        .in("analysis_id", ids).in("opportunity_id", briefs.map((row) => row.id)).limit(200)
      : { data: [], error: null };
    if (matchError) throw matchError;
    const byAnalysis = new Map(eligible.map((row) => [row.id, row]));
    const result = briefs.map((brief) => ({
      id: brief.id, title: brief.title, deadline: brief.deadline,
      submissionRequirement: brief.submission_requirement,
      submissionCost: brief.submission_cost,
      songs: (matches ?? []).filter((match) => match.opportunity_id === brief.id)
        .sort((a, b) => Number(b.match_score) - Number(a.match_score))
        .slice(0, 5).flatMap((match) => {
          const song = byAnalysis.get(match.analysis_id);
          return song ? [{ title: song.songs.title, fit: match.fit_band,
            goHref: `/api/song-where/go/${encodeURIComponent(match.id)}` }] : [];
        }),
    }));
    return NextResponse.json({ briefs: result,
      emailReady: process.env.SONG_WHERE_INBOUND_READY === "true" },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("[song-where] private brief read failed");
    return new Response(null, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (process.env.SONG_WHERE_PRIVATE_ENABLED !== "true") return new Response(null, { status: 404 });
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const creatorId = await currentUserId();
  if (!creatorId) return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return new Response(null, { status: 415 });
  const body = await request.text();
  if (body.length > 32_000) return new Response(null, { status: 413 });
  try {
    const input = JSON.parse(body) as { subject?: unknown; text?: unknown };
    if (typeof input.subject !== "string" || typeof input.text !== "string")
      return new Response(null, { status: 400 });
    const result = await ingestCreatorBrief(createAdminClient(), creatorId,
      { subject: input.subject, text: input.text, messageId: randomUUID() });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("[song-where] private brief intake failed");
    return new Response(null, { status: 503 });
  }
}
